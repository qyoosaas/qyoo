import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DOC_TYPE_MAP,
  overallConfidence,
  validateExtraction,
  blocking,
  type Extraction,
} from "@/lib/doc-intel";

/**
 * Document understanding pipeline.
 *
 *   download → processor (provider-agnostic) → classification → extraction
 *   → entity matching → duplicate detection → deterministic validation
 *   → status (needs_type | needs_review | ready)
 *
 * Nothing here posts accounting entries. Posting always requires explicit
 * human approval in the review screen.
 */

const CLASSIFY_THRESHOLD = 70;

type MatchResult = {
  supplier?: { id: string; name: string; score: number } | null;
  customer?: { id: string; name: string; score: number } | null;
  purchase_order?: { id: string; number: string; total: number } | null;
  goods_receipts?: { id: string; number: string; total: number }[];
  three_way?: {
    line: string;
    ordered_quantity: number;
    received_quantity: number;
    billed_quantity: number;
    quantity_variance: number;
    price_variance: number;
  }[];
  duplicate?: { id: string; label: string; reason: string } | null;
  bank_account?: { id: string; name: string } | null;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(llc|l\.l\.c|fzco|fze|ltd|limited|trading|general|co|company|est)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.includes(y) || y.includes(x)) return 88;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 2) }, (_, i) => s.slice(i, i + 3)));
  const A = grams(x);
  const B = grams(y);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((g) => {
    if (B.has(g)) hit++;
  });
  return Math.round((hit / Math.max(A.size, B.size)) * 100);
}

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A document id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found");

    const log = async (stage: string, detail?: string, payload?: unknown) => {
      await supabase.from("document_upload_events").insert({
        document_upload_id: doc.id,
        stage,
        detail: detail ?? null,
        payload: (payload ?? null) as never,
        actor: "FIN Document Intelligence",
      });
    };

    await supabase.from("document_uploads").update({ status: "processing" }).eq("id", doc.id);
    await log("processing", "Document queued for extraction");

    try {
      const { getProcessor } = await import("@/lib/doc-processors.server");
      const processor = getProcessor();

      let bytes = new Uint8Array();
      if (doc.storage_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const dl = await supabaseAdmin.storage.from("documents").download(doc.storage_path);
        if (dl.error) throw new Error(`Could not read the stored file: ${dl.error.message}`);
        bytes = new Uint8Array(await dl.data.arrayBuffer());
      }

      const [{ data: suppliers }, { data: customers }] = await Promise.all([
        supabase.from("suppliers").select("id, name, trn").eq("company_id", doc.company_id),
        supabase.from("customers").select("id, name, trn").eq("company_id", doc.company_id),
      ]);

      const extraction: Extraction = await processor.process({
        fileName: doc.file_name,
        mimeType: doc.mime_type ?? "application/octet-stream",
        bytes,
        hints: {
          suppliers: (suppliers ?? []).map((s) => s.name),
          customers: (customers ?? []).map((c) => c.name),
        },
      });

      // A user-confirmed type always wins over the classifier.
      if (doc.doc_type_source === "user" && doc.doc_type && doc.doc_type !== "unknown") {
        extraction.doc_type = doc.doc_type;
        extraction.doc_type_confidence = 100;
      }

      await log(
        "classified",
        `Detected as ${DOC_TYPE_MAP[extraction.doc_type]?.label ?? "Unknown"} (${extraction.doc_type_confidence.toFixed(0)}% confidence) via ${processor.id}`,
      );

      /* ---------------- entity matching ---------------- */
      const matches: MatchResult = {};
      const fv = (k: string) => extraction.fields?.[k]?.value ?? null;

      const supplierName = fv("supplier_name");
      if (supplierName) {
        const scored = (suppliers ?? [])
          .map((s) => ({ id: s.id, name: s.name, score: similarity(String(supplierName), s.name) }))
          .sort((a, b) => b.score - a.score);
        matches.supplier = scored[0] && scored[0].score >= 55 ? scored[0] : null;
      }

      const customerName = fv("customer_name");
      if (customerName) {
        const scored = (customers ?? [])
          .map((c) => ({ id: c.id, name: c.name, score: similarity(String(customerName), c.name) }))
          .sort((a, b) => b.score - a.score);
        matches.customer = scored[0] && scored[0].score >= 55 ? scored[0] : null;
      }

      const poNumber = fv("po_number");
      if (poNumber) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("id, number, total")
          .eq("company_id", doc.company_id)
          .eq("number", String(poNumber))
          .maybeSingle();
        if (po) {
          matches.purchase_order = { id: po.id, number: po.number, total: Number(po.total) };
          const { data: grns } = await supabase
            .from("goods_receipts")
            .select("id, number, total_value")
            .eq("purchase_order_id", po.id);
          matches.goods_receipts = (grns ?? []).map((g) => ({
            id: g.id,
            number: g.number,
            total: Number(g.total_value),
          }));

          const { data: three } = await (supabase as never as {
            rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] | null }>;
          }).rpc("po_match_lines", { p_po: po.id });
          matches.three_way = (three ?? []).map((l) => ({
            line: String(l["description"] ?? ""),
            ordered_quantity: Number(l["ordered_quantity"] ?? 0),
            received_quantity: Number(l["received_quantity"] ?? 0),
            billed_quantity: Number(l["billed_quantity"] ?? 0),
            quantity_variance: Number(l["quantity_variance"] ?? 0),
            price_variance: Number(l["price_variance"] ?? 0),
          }));
        }
      }

      /* ---------------- duplicate detection ---------------- */
      const total = Number(fv("total") ?? 0);
      if (extraction.doc_type === "supplier_invoice" && fv("invoice_number")) {
        const { data: dupe } = await supabase
          .from("supplier_bills")
          .select("id, number, supplier_ref, total")
          .eq("company_id", doc.company_id)
          .eq("supplier_ref", String(fv("invoice_number")))
          .maybeSingle();
        if (dupe) {
          matches.duplicate = {
            id: dupe.id,
            label: dupe.number,
            reason: `Supplier reference ${fv("invoice_number")} is already recorded on ${dupe.number} for ${Number(dupe.total).toFixed(2)}.`,
          };
        }
      }
      if (!matches.duplicate && total) {
        const { data: priorDocs } = await supabase
          .from("document_uploads")
          .select("id, file_name, doc_type, original_extraction")
          .eq("company_id", doc.company_id)
          .eq("doc_type", extraction.doc_type)
          .neq("id", doc.id)
          .limit(200);
        const hit = (priorDocs ?? []).find((p) => {
          const ex = p.original_extraction as unknown as Extraction | null;
          const t = Number(ex?.fields?.["total"]?.value ?? 0);
          const n = ex?.fields?.["invoice_number"]?.value ?? ex?.fields?.["receipt_number"]?.value ?? null;
          return (
            Math.abs(t - total) < 0.01 &&
            (n ? String(n) === String(fv("invoice_number") ?? fv("receipt_number")) : true)
          );
        });
        if (hit) {
          matches.duplicate = {
            id: hit.id,
            label: hit.file_name,
            reason: "A document with the same reference and amount was already processed.",
          };
        }
      }

      if (extraction.doc_type === "bank_statement") {
        const { data: accounts } = await supabase
          .from("bank_accounts")
          .select("id, name, bank_name, account_number_masked, iban_masked")
          .eq("company_id", doc.company_id);
        const ident = String(fv("account_identifier") ?? "");
        const bank = String(fv("bank_name") ?? "");
        const found =
          (accounts ?? []).find((a) => ident && `${a.account_number_masked}${a.iban_masked ?? ""}`.includes(ident.slice(-4))) ??
          (accounts ?? []).find((a) => bank && similarity(bank, a.bank_name) > 70) ??
          (accounts ?? [])[0];
        matches.bank_account = found ? { id: found.id, name: `${found.bank_name} · ${found.name}` } : null;
      }

      /* ---------------- validation ---------------- */
      const issues = validateExtraction(extraction);
      if (matches.duplicate) {
        issues.unshift({
          code: "possible_duplicate",
          severity: "warning",
          message: "Possible duplicate document",
          detail: matches.duplicate.reason,
        });
      }
      if (extraction.doc_type === "supplier_invoice" && !matches.supplier) {
        issues.push({
          code: "supplier_not_found",
          severity: "warning",
          message: "Supplier not found in your master data",
          detail: "Create the supplier, match an existing one, or continue without linking.",
        });
      }
      if (matches.purchase_order && total) {
        const diff = total - matches.purchase_order.total;
        if (Math.abs(diff) > 0.02) {
          issues.push({
            code: "po_variance",
            severity: "warning",
            message: "Invoice total differs from the purchase order",
            detail: `${matches.purchase_order.number} is ${matches.purchase_order.total.toFixed(2)}, this document is ${total.toFixed(2)}.`,
            amount: Math.abs(diff),
          });
        }
      }

      const confidence = overallConfidence(extraction);
      const needsType = extraction.doc_type === "unknown" || extraction.doc_type_confidence < CLASSIFY_THRESHOLD;
      const status = needsType
        ? "needs_type"
        : blocking(issues).length || issues.some((i) => i.severity === "warning") || confidence < 92
          ? "needs_review"
          : "ready";

      await supabase
        .from("document_uploads")
        .update({
          status,
          doc_type: extraction.doc_type,
          doc_type_confidence: extraction.doc_type_confidence,
          processor: processor.id,
          processor_version: processor.version,
          overall_confidence: confidence,
          original_extraction: extraction as never,
          field_confidence: Object.fromEntries(
            Object.entries(extraction.fields ?? {}).map(([k, v]) => [k, v.confidence]),
          ) as never,
          validation: issues as never,
          matches: matches as never,
          duplicate_of: null,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", doc.id);

      await log("extracted", `${Object.keys(extraction.fields ?? {}).length} fields, ${(extraction.lines ?? []).length} lines, ${(extraction.transactions ?? []).length} transactions`, { confidence });
      await log("validated", `${issues.length} validation finding${issues.length === 1 ? "" : "s"} — status ${status}`);

      return { status, confidence, docType: extraction.doc_type, issues: issues.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown processing error";
      await supabase
        .from("document_uploads")
        .update({ status: "failed", error_message: message })
        .eq("id", doc.id);
      await log("failed", message);
      throw new Error(message);
    }
  });

/** Re-run understanding after the user pins a document type. */
export const setDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; docType: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("document_uploads")
      .update({ doc_type: data.docType, doc_type_source: "user", doc_type_confidence: 100 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("document_upload_events").insert({
      document_upload_id: data.id,
      stage: "classified",
      detail: `Document type set to ${DOC_TYPE_MAP[data.docType]?.label ?? data.docType} by the user`,
      actor: "User",
    });
    return { ok: true };
  });

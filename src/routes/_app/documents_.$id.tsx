import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Info, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID, money, shortDate, titleCase } from "@/lib/format";
import { processDocument, setDocumentType } from "@/lib/doc-intel.functions";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import {
  DOC_TYPES,
  DOC_TYPE_MAP,
  STATUS_LABEL,
  blocking,
  confidenceBand,
  docTypeLabel,
  overallConfidence,
  statusToneFor,
  validateExtraction,
  type ExtractedLine,
  type ExtractedTransaction,
  type Extraction,
  type ValidationIssue,
} from "@/lib/doc-intel";
import {
  PageHeader,
  Panel,
  Pill,
  Loading,
  TableShell,
  Th,
  Td,
  Confidence,
} from "@/components/fin/primitives";
import { ConfirmDialog, Field, NativeSelect } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/documents_/$id")({
  head: () => ({
    meta: [
      { title: "Document review · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Split-screen review: the original document beside the structured data Qyoo extracted, with field-level confidence, deterministic validation and the workflow it will create.",
      },
      { property: "og:title", content: "Document review · Qyoo" },
      { property: "og:description", content: "Extraction is not approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Review,
});

const bandTone = (v: number) =>
  confidenceBand(v) === "high" ? ("success" as const) : confidenceBand(v) === "medium" ? ("warning" as const) : ("critical" as const);

function Review() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reprocess = useServerFn(processDocument);
  const pinType = useServerFn(setDocumentType);

  const doc = useQuery({
    queryKey: ["document_upload", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_uploads").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const events = useQuery({
    queryKey: ["document_upload_events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_upload_events")
        .select("*")
        .eq("document_upload_id", id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [draft, setDraft] = useState<Extraction | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});

  const row: any = doc.data;
  const original = (row?.original_extraction ?? null) as Extraction | null;

  useEffect(() => {
    if (!row) return;
    setDraft((row.user_corrected_data ?? row.original_extraction ?? null) as Extraction | null);
  }, [row?.id, row?.processed_at, row?.user_corrected_data]);

  useEffect(() => {
    let alive = true;
    if (!row?.storage_path) return;
    supabase.storage
      .from("documents")
      .createSignedUrl(row.storage_path, 3600)
      .then(({ data }) => {
        if (!alive) return;
        const url = data?.signedUrl ?? null;
        setPreview(url);
        if (url && /\.(csv|tsv|txt)$/i.test(row.file_name ?? "")) {
          fetch(url)
            .then((r) => r.text())
            .then((t) => {
              if (alive) setPreviewText(t.slice(0, 20000));
            })
            .catch(() => undefined);
        }
      });
    return () => {
      alive = false;
    };
  }, [row?.storage_path]);

  const issues: ValidationIssue[] = useMemo(() => {
    if (!draft) return (row?.validation ?? []) as ValidationIssue[];
    const live = validateExtraction(draft);
    const engine = ((row?.validation ?? []) as ValidationIssue[]).filter(
      (i) =>
        ["possible_duplicate", "po_variance"].includes(i.code) ||
        (i.code === "supplier_not_found" && !links["supplier_id"]) ||
        (i.code === "customer_not_found" && !links["customer_id"]),
    );
    const unlinked = (draft.lines ?? []).filter((l) => !l.product_id).length;
    const productIssue: ValidationIssue[] = unlinked
      ? [{ code: "product_not_linked", severity: "info", message: `${unlinked} line${unlinked === 1 ? "" : "s"} not linked to a product`, detail: "Pick the product so stock and costs update. Unlinked lines post as non-stock items." }]
      : [];
    return [...engine, ...live, ...productIssue];
  }, [draft, row?.validation, links]);

  const matches = (row?.matches ?? {}) as any;
  const def = draft ? DOC_TYPE_MAP[draft.doc_type] : null;
  const confidence = draft ? overallConfidence(draft) : 0;
  const blockers = blocking(issues);

  /* ------------------------------ editing ------------------------------ */

  const setField = (key: string, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const prev = d.fields[key];
      const kind = DOC_TYPE_MAP[d.doc_type]?.fields.find((f) => f.key === key)?.kind;
      const parsed = kind === "money" || kind === "number" || kind === "percent" ? (value === "" ? null : Number(value)) : value;
      return {
        ...d,
        fields: { ...d.fields, [key]: { ...(prev ?? { confidence: 100 }), value: parsed, confidence: 100 } },
      };
    });
  };

  const setLine = (i: number, patch: Partial<ExtractedLine>) => {
    setDraft((d) => {
      if (!d?.lines) return d;
      const lines = d.lines.map((l, idx) => (idx === i ? { ...l, ...patch, confidence: 100 } : l));
      return { ...d, lines };
    });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(row?.user_corrected_data ?? row?.original_extraction ?? null);

  const saveCorrections = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const live = validateExtraction(draft);
      const { error } = await supabase
        .from("document_uploads")
        .update({
          user_corrected_data: draft as never,
          overall_confidence: overallConfidence(draft),
          validation: [...((row?.validation ?? []) as ValidationIssue[]).filter((i) =>
            ["possible_duplicate", "supplier_not_found", "po_variance"].includes(i.code),
          ), ...live] as never,
          status: blocking(live).length ? "needs_review" : "ready",
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      await supabase.from("document_upload_events").insert({
        document_upload_id: id,
        stage: "corrected",
        detail: "User corrections saved — original extraction retained",
        actor: "Ahmed Rahman",
      });
      toast.success("Corrections saved. The original extraction is kept for audit.");
      qc.invalidateQueries({ queryKey: ["document_upload", id] });
      qc.invalidateQueries({ queryKey: ["document_upload_events", id] });
      qc.invalidateQueries({ queryKey: ["document_uploads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your corrections");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------ links ------------------------------ */

  const lookups = useQuery({
    queryKey: ["doc_review_lookups"],
    queryFn: async () => {
      const [p, s, c, po, so, ba] = await Promise.all([
        supabase.from("products").select("id, sku, name").eq("company_id", COMPANY_ID).order("sku"),
        supabase.from("suppliers").select("id, name").eq("company_id", COMPANY_ID).order("name"),
        supabase.from("customers").select("id, name").eq("company_id", COMPANY_ID).order("name"),
        supabase.from("purchase_orders").select("id, number, supplier_id, status").eq("company_id", COMPANY_ID).neq("status", "cancelled").order("number", { ascending: false }).limit(300),
        supabase.from("sales_orders").select("id, number, customer_id, status").eq("company_id", COMPANY_ID).neq("status", "cancelled").order("number", { ascending: false }).limit(300),
        supabase.from("bank_accounts").select("id, name, bank_name").eq("company_id", COMPANY_ID),
      ]);
      return {
        products: p.data ?? [],
        suppliers: s.data ?? [],
        customers: c.data ?? [],
        pos: po.data ?? [],
        sos: so.data ?? [],
        banks: ba.data ?? [],
      };
    },
  });

  useEffect(() => {
    setLinks({
      supplier_id: matches.supplier?.id ?? "",
      customer_id: matches.customer?.id ?? "",
      purchase_order_id: matches.purchase_order?.id ?? "",
      sales_order_id: matches.sales_order?.id ?? "",
      bank_account_id: matches.bank_account?.id ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.processed_at]);
  const setLink = (k: string, v: string) => setLinks((s) => ({ ...s, [k]: v }));

  /* ------------------------------ approval ------------------------------ */

  const approve = useAction(
    async () => {
      if (!draft) throw new Error("Nothing to post");
      const v = (k: string) => draft.fields[k]?.value ?? null;
      const s = (k: string) => (v(k) == null ? null : String(v(k)));
      const n = (k: string) => Number(v(k) ?? 0);
      const need = (k: string, msg: string) => {
        if (!links[k]) throw new Error(msg);
        return links[k];
      };
      const items = (draft.lines ?? []).map((l) => ({
        product_id: l.product_id ?? null,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount: Number(l.discount ?? 0),
        vat_rate: Number(l.vat_rate ?? 0) > 1 ? Number(l.vat_rate) / 100 : Number(l.vat_rate ?? 0),
      }));
      const matchOpen = <T extends { description: string; product_id: string | null; open_quantity: number }>(open: T[]) =>
        open.map((o) => {
          const hit = (draft.lines ?? []).find(
            (l) =>
              (l.product_id && l.product_id === o.product_id) ||
              l.description.toLowerCase().includes(o.description.toLowerCase().slice(0, 12)) ||
              o.description.toLowerCase().includes(l.description.toLowerCase().slice(0, 12)),
          );
          return { o, qty: Math.min(Number(hit?.quantity_received ?? hit?.quantity ?? 0), Number(o.open_quantity)) };
        });

      let payload: Record<string, unknown>;
      switch (draft.doc_type) {
        case "supplier_invoice":
          payload = {
            kind: "supplier_bill",
            supplier_id: need("supplier_id", "Choose the supplier before posting this bill"),
            date: s("invoice_date"),
            due_date: s("due_date"),
            reference: s("invoice_number"),
            purchase_order_id: links["purchase_order_id"] || null,
            items,
          };
          break;
        case "customer_invoice":
          payload = { kind: "invoice", customer_id: need("customer_id", "Choose the customer before posting this invoice"), date: s("invoice_date"), due_date: s("due_date"), items };
          break;
        case "purchase_order":
        case "supplier_quotation":
          payload = {
            kind: "purchase_order",
            supplier_id: need("supplier_id", "Choose the supplier before creating the purchase order"),
            date: s("po_date") ?? s("quotation_date") ?? isoToday(),
            expected_date: s("delivery_date"),
            items,
          };
          break;
        case "sales_order":
        case "customer_quotation":
          payload = {
            kind: "sales_order",
            customer_id: need("customer_id", "Choose the customer before creating the sales order"),
            date: s("order_date") ?? s("quotation_date") ?? isoToday(),
            expected_date: s("delivery_date"),
            items,
          };
          break;
        case "expense_receipt":
          payload = { kind: "expense", merchant: s("merchant"), date: s("receipt_date") ?? isoToday(), total: n("total"), employee: s("employee"), method: s("payment_method") };
          break;
        case "bank_statement":
          payload = {
            kind: "bank_statement",
            bank_account_id: need("bank_account_id", "Choose the bank account this statement belongs to"),
            rows: (draft.transactions ?? []).map((t) => ({
              txn_date: t.txn_date,
              description: t.description,
              reference: t.reference ?? null,
              amount: t.amount,
              direction: t.direction,
              balance_after: t.balance ?? null,
            })),
          };
          break;
        case "goods_receipt": {
          const po = need("purchase_order_id", "Choose the purchase order these goods were received against");
          const lines = matchOpen(await actions.poOpenLines(po))
            .filter((x) => x.qty > 0)
            .map((x) => ({ purchase_order_item_id: x.o.purchase_order_item_id, quantity: x.qty }));
          if (!lines.length) throw new Error("No open quantity on the purchase order matches these lines");
          payload = { kind: "goods_receipt", purchase_order_id: po, date: s("grn_date") ?? isoToday(), lines };
          break;
        }
        case "delivery_note": {
          const so = need("sales_order_id", "Choose the sales order this delivery belongs to");
          const lines = matchOpen(await actions.soOpenLines(so))
            .filter((x) => x.qty > 0)
            .map((x) => ({ sales_order_item_id: x.o.sales_order_item_id, quantity: x.qty }));
          if (!lines.length) throw new Error("No open quantity on the sales order matches these lines");
          payload = { kind: "delivery_note", sales_order_id: so, date: s("delivery_date") ?? isoToday(), lines };
          break;
        }
        case "supplier_credit_note":
          payload = {
            kind: "supplier_credit",
            supplier_id: need("supplier_id", "Choose the supplier before posting this credit note"),
            date: s("credit_note_date"),
            reference: s("credit_note_number"),
            total: n("total"),
            vat: n("vat_amount"),
            bill_id: matches.reference_document?.kind === "supplier_bill" ? matches.reference_document.id : null,
          };
          break;
        case "customer_credit_note":
          payload = {
            kind: "customer_credit",
            customer_id: need("customer_id", "Choose the customer before posting this credit note"),
            date: s("credit_note_date"),
            reference: s("credit_note_number"),
            total: n("total"),
            vat: n("vat_amount"),
            invoice_id: matches.reference_document?.kind === "invoice" ? matches.reference_document.id : null,
          };
          break;
        default:
          throw new Error(`${docTypeLabel(draft.doc_type)} is kept in the vault — there is no automatic workflow for this type yet`);
      }

      const { data, error } = await (supabase as any).rpc("approve_document", {
        p_upload: id,
        p_payload: { ...payload, draft },
        p_actor: "Ahmed Rahman",
      });
      if (error) throw new Error(error.message);
      const res = data as { type: string; id: string; label: string; import?: { imported: number; duplicates: number } };
      if (res.import) toast.message(`${res.import.imported} transactions imported, ${res.import.duplicates} duplicates skipped`);
      return res;
    },
    {
      success: (e) => `Posted — ${titleCase(e.type)} ${e.label} created`,
      scope: "document_approve",
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["document_upload", id] });
        qc.invalidateQueries({ queryKey: ["document_upload_events", id] });
      },
    },
  );

  if (doc.isLoading || !row) return <Loading rows={10} />;

  const posted = row.status === "posted";

  return (
    <>
      <PageHeader
        title={row.file_name}
        subtitle={`${docTypeLabel(row.doc_type)} · ${STATUS_LABEL[row.status] ?? row.status} · uploaded ${shortDate(row.created_at)}`}
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[13px]" onClick={() => navigate({ to: "/documents", search: { action: undefined } })}>
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              Documents
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[13px]"
              disabled={posted}
              onClick={async () => {
                await reprocess({ data: { id } });
                qc.invalidateQueries({ queryKey: ["document_upload", id] });
                qc.invalidateQueries({ queryKey: ["document_upload_events", id] });
                toast.success("Document re-processed");
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
              Re-run extraction
            </Button>
            {dirty ? (
              <Button size="sm" variant="outline" className="h-8 text-[13px]" disabled={saving} onClick={saveCorrections}>
                Save corrections
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-8 text-[13px]"
              disabled={posted || blockers.length > 0 || approve.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {posted ? "Posted" : `Approve & create ${def?.workflow ?? "record"}`}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={confidence >= 92 ? "success" : confidence >= 75 ? "warning" : "critical"}>
          {confidence >= 92 ? "✓" : "⚠"} {confidence.toFixed(0)}% extraction confidence
        </Pill>
        <Pill tone={statusToneFor(row.status)}>{STATUS_LABEL[row.status] ?? row.status}</Pill>
        <span className="text-xs text-muted-foreground">
          Read by {row.processor ?? "—"} {row.processor_version ? `v${row.processor_version}` : ""}
        </span>
        {row.linked_entity_label ? (
          <span className="text-xs text-muted-foreground">
            Linked to {titleCase(row.linked_entity_type)} {row.linked_entity_label}
          </span>
        ) : null}
      </div>

      {row.status === "needs_type" ? (
        <Panel title="What type of document is this?" description="Automatic classification was not confident enough to decide.">
          <div className="flex flex-wrap items-end gap-3 px-4 py-3.5">
            <Field label="Document type" className="w-[280px]">
              <NativeSelect
                value={row.doc_type}
                onChange={(t) => {
                  pinType({ data: { id, docType: t } }).then(async () => {
                    await reprocess({ data: { id } });
                    qc.invalidateQueries({ queryKey: ["document_upload", id] });
                    qc.invalidateQueries({ queryKey: ["document_upload_events", id] });
                  });
                }}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <p className="pb-2 text-xs text-muted-foreground">
              Qyoo will re-read the document with that type. No assumption is made on your behalf.
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------- original document ------------------------- */}
        <Panel title="Original document" description={`${row.mime_type ?? "file"} · ${row.size_kb} KB`}>
          <div className="relative h-[620px] overflow-hidden bg-secondary/30">
            {previewText != null ? (
              <pre className="num h-full overflow-auto p-4 text-[12px] leading-relaxed whitespace-pre-wrap">
                {previewText}
              </pre>
            ) : preview ? (
              /\.(png|jpe?g|tiff?|gif|webp)$/i.test(row.file_name) ? (
                <img src={preview} alt={row.file_name} className="h-full w-full object-contain" />
              ) : (
                <iframe title={row.file_name} src={preview} className="h-full w-full border-0 bg-white" />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Preview unavailable
              </div>
            )}
            {focusField && draft?.fields[focusField]?.bbox ? (
              <span
                className="pointer-events-none absolute border-2"
                style={{
                  borderColor: "var(--signal)",
                  backgroundColor: "color-mix(in srgb, var(--signal) 18%, transparent)",
                  left: `${draft.fields[focusField]!.bbox![0] * 100}%`,
                  top: `${draft.fields[focusField]!.bbox![1] * 100}%`,
                  width: `${draft.fields[focusField]!.bbox![2] * 100}%`,
                  height: `${draft.fields[focusField]!.bbox![3] * 100}%`,
                }}
              />
            ) : null}
          </div>
        </Panel>

        {/* ------------------------- extracted data ------------------------- */}
        <Panel
          title="Extracted data"
          description="Click a field to highlight its source region. Edits never overwrite the original extraction."
        >
          {!draft ? (
            <Loading rows={8} />
          ) : (
            <div className="max-h-[620px] overflow-auto">
              <dl className="divide-y divide-border/60">
                {(def?.fields ?? []).map((f) => {
                  const cur = draft.fields[f.key];
                  const c = cur?.confidence ?? 0;
                  return (
                    <div
                      key={f.key}
                      onClick={() => setFocusField(f.key)}
                      className={`grid grid-cols-[150px_1fr_auto] items-center gap-3 px-4 py-2 ${
                        focusField === f.key ? "bg-secondary/50" : ""
                      }`}
                    >
                      <dt className="text-xs text-muted-foreground">{f.label}</dt>
                      <dd>
                        <Input
                          value={cur?.value == null ? "" : String(cur.value)}
                          disabled={posted}
                          onChange={(e) => setField(f.key, e.target.value)}
                          className="h-8 text-[13px]"
                          placeholder="Not found in the document"
                        />
                      </dd>
                      <Pill tone={cur ? bandTone(c) : "muted"}>{cur ? `${c.toFixed(0)}%` : "—"}</Pill>
                    </div>
                  );
                })}
              </dl>

              {draft.lines?.length ? (
                <div className="border-t border-border">
                  <p className="px-4 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Line items</p>
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Description</Th>
                        <Th>Product</Th>
                        <Th right>Qty</Th>
                        <Th right>Rate</Th>
                        <Th right>VAT</Th>
                        <Th right>Total</Th>
                        <Th>Conf.</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((l, i) => (
                        <tr key={i}>
                          <Td className="max-w-[220px] truncate">{l.description}</Td>
                          <Td>
                            <NativeSelect
                              value={l.product_id ?? ""}
                              onChange={(v) => setLine(i, { product_id: v || null })}
                              className={cn("h-7 w-[150px] text-[12px]", !l.product_id && "border-warning")}
                            >
                              <option value="">Not linked</option>
                              {(lookups.data?.products ?? []).map((p) => (
                                <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
                              ))}
                            </NativeSelect>
                          </Td>
                          <Td right>
                            <input
                              disabled={posted}
                              value={l.quantity}
                              onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                              className="num h-7 w-16 rounded-sm border border-border bg-card px-1.5 text-right text-[13px]"
                            />
                          </Td>
                          <Td right>
                            <input
                              disabled={posted}
                              value={l.unit_price}
                              onChange={(e) =>
                                setLine(i, {
                                  unit_price: Number(e.target.value),
                                  line_total: Number(e.target.value) * l.quantity - (l.discount ?? 0),
                                })
                              }
                              className="num h-7 w-20 rounded-sm border border-border bg-card px-1.5 text-right text-[13px]"
                            />
                          </Td>
                          <Td right>{money(l.vat_amount ?? 0)}</Td>
                          <Td right>{money(l.line_total)}</Td>
                          <Td>
                            <Confidence value={l.confidence} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                </div>
              ) : null}

              {draft.transactions?.length ? (
                <div className="border-t border-border">
                  <p className="px-4 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {draft.transactions.length} statement transactions
                  </p>
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Description</Th>
                        <Th>Signal</Th>
                        <Th right>Debit</Th>
                        <Th right>Credit</Th>
                        <Th right>Balance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.transactions.map((t: ExtractedTransaction, i: number) => (
                        <tr key={i}>
                          <Td>{shortDate(t.txn_date)}</Td>
                          <Td className="max-w-[220px] truncate">{t.description}</Td>
                          <Td>{t.category ? <Pill tone="muted">{titleCase(t.category)}</Pill> : "—"}</Td>
                          <Td right>{t.direction === "out" ? money(t.amount) : "—"}</Td>
                          <Td right>{t.direction === "in" ? money(t.amount) : "—"}</Td>
                          <Td right>{t.balance == null ? "—" : money(t.balance)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      {/* ------------------------- validation & matching ------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Validation" description="Deterministic checks — extraction is not approval">
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 text-[13px]">
              <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />
              Every arithmetic and completeness check passed.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {issues.map((v, i) => (
                <li key={`${v.code}-${i}`} className="flex gap-3 px-4 py-3">
                  {v.severity === "error" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" strokeWidth={1.75} />
                  ) : v.severity === "warning" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  )}
                  <div>
                    <p className="text-[13px] font-medium">{v.message}</p>
                    {v.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{v.detail}</p> : null}
                    {v.amount ? <p className="num mt-0.5 text-xs text-muted-foreground">Difference {money(v.amount)}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Matching" description="What this document connects to in Qyoo">
          <dl className="space-y-2 px-4 py-3.5 text-[13px]">
            <MatchRow label="Supplier" value={matches.supplier ? `${matches.supplier.name} (${matches.supplier.score}% name match)` : "Not found"} />
            <MatchRow label="Customer" value={matches.customer ? `${matches.customer.name} (${matches.customer.score}% name match)` : "Not applicable"} />
            <MatchRow
              label="Purchase order"
              value={matches.purchase_order ? `${matches.purchase_order.number} · ${money(matches.purchase_order.total)}` : "None referenced"}
              {...(matches.purchase_order ? { to: `/purchases/${matches.purchase_order.id}` } : {})}
            />
            <MatchRow
              label="Goods receipts"
              value={matches.goods_receipts?.length ? matches.goods_receipts.map((g: any) => g.number).join(", ") : "None"}
            />
            <MatchRow label="Bank account" value={matches.bank_account?.name ?? "Not applicable"} />
            <MatchRow label="Possible duplicate" value={matches.duplicate ? matches.duplicate.label : "None detected"} />
            {matches.reference_document ? (
              <MatchRow
                label="Credit applies to"
                value={`${matches.reference_document.number} · open ${money(matches.reference_document.balance)}`}
              />
            ) : null}
          </dl>

          {draft && !posted ? (
            <div className="grid gap-2.5 border-t border-border px-4 py-3.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Link before approving</p>
              {["supplier_invoice", "supplier_credit_note", "purchase_order", "supplier_quotation"].includes(draft.doc_type) ? (
                <Field label="Supplier">
                  <NativeSelect value={links["supplier_id"] ?? ""} onChange={(v) => setLink("supplier_id", v)}>
                    <option value="">Choose supplier…</option>
                    {(lookups.data?.suppliers ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              {["customer_invoice", "customer_credit_note", "sales_order", "customer_quotation"].includes(draft.doc_type) ? (
                <Field label="Customer">
                  <NativeSelect value={links["customer_id"] ?? ""} onChange={(v) => setLink("customer_id", v)}>
                    <option value="">Choose customer…</option>
                    {(lookups.data?.customers ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              {["supplier_invoice", "goods_receipt"].includes(draft.doc_type) ? (
                <Field label="Purchase order">
                  <NativeSelect value={links["purchase_order_id"] ?? ""} onChange={(v) => setLink("purchase_order_id", v)}>
                    <option value="">{draft.doc_type === "goods_receipt" ? "Choose purchase order…" : "No purchase order"}</option>
                    {(lookups.data?.pos ?? [])
                      .filter((o) => !links["supplier_id"] || o.supplier_id === links["supplier_id"])
                      .map((o) => (
                        <option key={o.id} value={o.id}>{o.number}</option>
                      ))}
                  </NativeSelect>
                </Field>
              ) : null}
              {draft.doc_type === "delivery_note" ? (
                <Field label="Sales order">
                  <NativeSelect value={links["sales_order_id"] ?? ""} onChange={(v) => setLink("sales_order_id", v)}>
                    <option value="">Choose sales order…</option>
                    {(lookups.data?.sos ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.number}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              {draft.doc_type === "bank_statement" ? (
                <Field label="Bank account">
                  <NativeSelect value={links["bank_account_id"] ?? ""} onChange={(v) => setLink("bank_account_id", v)}>
                    <option value="">Choose bank account…</option>
                    {(lookups.data?.banks ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.bank_name} · {o.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
            </div>
          ) : null}

          {matches.three_way?.length ? (
            <div className="border-t border-border">
              <p className="px-4 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                Three-way match — PO ↔ GRN ↔ invoice
              </p>
              <TableShell>
                <thead>
                  <tr>
                    <Th>Line</Th>
                    <Th right>Ordered</Th>
                    <Th right>Received</Th>
                    <Th right>Billed</Th>
                    <Th right>Qty var.</Th>
                    <Th right>Price var.</Th>
                  </tr>
                </thead>
                <tbody>
                  {matches.three_way.map((l: any, i: number) => (
                    <tr key={i}>
                      <Td className="max-w-[180px] truncate">{l.line}</Td>
                      <Td right>{l.ordered_quantity}</Td>
                      <Td right>{l.received_quantity}</Td>
                      <Td right>{l.billed_quantity}</Td>
                      <Td right>{l.quantity_variance}</Td>
                      <Td right>{money(l.price_variance)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Audit history" description="Every stage of the pipeline, retained for audit">
        {events.isLoading ? (
          <Loading rows={4} />
        ) : (
          <ul className="divide-y divide-border/60">
            {(events.data ?? []).map((e: any) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">{titleCase(e.stage)}</span>
                  {e.detail ? <span className="text-muted-foreground"> — {e.detail}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {e.actor} · {shortDate(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Approve and create ${def?.workflow ?? "record"}?`}
        description={`Qyoo will create the ${def?.workflow ?? "record"} from the approved data and post the matching accounting entries in one transaction. ${
          issues.some((i) => i.severity === "warning")
            ? "There are open warnings on this document — they will be recorded against the created transaction."
            : ""
        }`}
        confirmLabel="Approve & post"
        onConfirm={() => {
          setConfirmOpen(false);
          approve.mutate(undefined as never);
        }}
      />
    </>
  );
}

function MatchRow({ label, value, to }: { label: string; value: string; to?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">
        {to ? (
          <Link to={to} className="underline underline-offset-2">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

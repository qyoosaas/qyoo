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
    const engine = ((row?.validation ?? []) as ValidationIssue[]).filter((i) =>
      ["possible_duplicate", "supplier_not_found", "po_variance"].includes(i.code),
    );
    return [...engine, ...live];
  }, [draft, row?.validation]);

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

  /* ------------------------------ approval ------------------------------ */

  const approve = useAction(
    async () => {
      if (!draft) throw new Error("Nothing to post");
      const v = (k: string) => draft.fields[k]?.value ?? null;
      const n = (k: string) => Number(v(k) ?? 0);
      const lines = (draft.lines ?? []).map((l) => ({
        product_id: null,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount: Number(l.discount ?? 0),
        vat_rate: Number(l.vat_rate ?? 0),
      }));

      let entity: { type: string; id: string; label: string };

      switch (draft.doc_type) {
        case "supplier_invoice": {
          if (!matches.supplier?.id) throw new Error("Link a supplier before posting this bill");
          const billId = await actions.createSupplierBill({
            supplier_id: matches.supplier.id,
            bill_date: String(v("invoice_date")),
            due_date: v("due_date") ? String(v("due_date")) : null,
            items: lines,
            supplier_ref: String(v("invoice_number") ?? ""),
            purchase_order_id: matches.purchase_order?.id ?? null,
          });
          entity = { type: "supplier_bill", id: billId, label: String(v("invoice_number") ?? "Bill") };
          break;
        }
        case "customer_invoice": {
          if (!matches.customer?.id) throw new Error("Link a customer before posting this invoice");
          const invId = await actions.createInvoice({
            customer_id: matches.customer.id,
            invoice_date: String(v("invoice_date")),
            due_date: v("due_date") ? String(v("due_date")) : null,
            items: lines,
            notes: `Imported from ${row.file_name}`,
            post: true,
          });
          entity = { type: "invoice", id: invId, label: String(v("invoice_number") ?? "Invoice") };
          break;
        }
        case "purchase_order":
        case "supplier_quotation": {
          if (!matches.supplier?.id) throw new Error("Link a supplier before creating the purchase order");
          const poId = await actions.createPurchaseOrder({
            supplier_id: matches.supplier.id,
            order_date: String(v("po_date") ?? v("quotation_date")),
            expected_date: v("delivery_date") ? String(v("delivery_date")) : null,
            items: lines,
          });
          entity = { type: "purchase_order", id: poId, label: String(v("po_number") ?? "Purchase order") };
          break;
        }
        case "expense_receipt": {
          const expId = await actions.createExpense({
            merchant: String(v("merchant")),
            date: String(v("receipt_date") ?? isoToday()),
            gross: n("total"),
            employee: v("employee") ? String(v("employee")) : null,
            method: String(v("payment_method") ?? "company_card"),
            has_document: true,
          });
          entity = { type: "expense", id: expId, label: String(v("merchant")) };
          break;
        }
        case "bank_statement": {
          if (!matches.bank_account?.id) throw new Error("Choose the bank account this statement belongs to");
          const res = await actions.importBankTransactions({
            bank_account_id: matches.bank_account.id,
            rows: (draft.transactions ?? []).map((t) => ({
              txn_date: t.txn_date,
              description: t.description,
              reference: t.reference ?? null,
              amount: t.amount,
              direction: t.direction,
              balance_after: t.balance ?? null,
            })),
            batch: row.file_name,
          });
          toast.message(`${res.imported} transactions imported, ${res.duplicates} duplicates skipped`);
          entity = { type: "bank_statement", id: matches.bank_account.id, label: matches.bank_account.name };
          break;
        }
        case "goods_receipt": {
          if (!matches.purchase_order?.id) throw new Error("Link a purchase order before receiving goods");
          const open = await actions.poOpenLines(matches.purchase_order.id);
          const payload = open
            .map((o) => {
              const hit = (draft.lines ?? []).find((l) =>
                l.description.toLowerCase().includes(o.description.toLowerCase().slice(0, 12)) ||
                o.description.toLowerCase().includes(l.description.toLowerCase().slice(0, 12)),
              );
              const qty = Math.min(Number(hit?.quantity_received ?? hit?.quantity ?? 0), Number(o.open_quantity));
              return { purchase_order_item_id: o.purchase_order_item_id, quantity: qty };
            })
            .filter((l) => l.quantity > 0);
          if (!payload.length) throw new Error("No receivable quantity matched the purchase order lines");
          const grnId = await actions.receiveGoods({
            purchase_order_id: matches.purchase_order.id,
            date: String(v("grn_date") ?? isoToday()),
            lines: payload,
          });
          entity = { type: "goods_receipt", id: grnId, label: String(v("grn_number") ?? "GRN") };
          break;
        }
        default:
          throw new Error(
            `${docTypeLabel(draft.doc_type)} is stored in the vault — no automatic workflow exists for this type yet`,
          );
      }

      await supabase
        .from("document_uploads")
        .update({
          status: "posted",
          final_posted_data: draft as never,
          linked_entity_type: entity.type,
          linked_entity_id: entity.type === "bank_statement" ? null : entity.id,
          linked_entity_label: entity.label,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabase.from("document_upload_events").insert({
        document_upload_id: id,
        stage: "posted",
        detail: `Approved by the user and converted into ${titleCase(entity.type)} ${entity.label}`,
        actor: "Ahmed Rahman",
      });

      return entity;
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
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[13px]" onClick={() => navigate({ to: "/documents" })}>
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              Inbox
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
          </dl>

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

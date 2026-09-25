/**
 * Document Intelligence — shared, provider-agnostic contracts.
 *
 * This module is deliberately free of any OCR/vendor detail. It defines what a
 * "understood document" looks like inside Qyoo: the taxonomy, the per-type field
 * schema, the deterministic validation engine and the confidence bands.
 * Processors (PaddleOCR / PP-StructureV3 / Docling / future) only have to emit
 * the `Extraction` shape below.
 */

export type FieldKind = "text" | "date" | "money" | "number" | "percent";

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Financial field: low confidence forces human review. */
  financial?: boolean;
};

export type DocGroup = "finance" | "procurement" | "sales" | "inventory" | "other";

export type DocTypeDef = {
  id: string;
  label: string;
  group: DocGroup;
  /** What approving this document creates in Qyoo. */
  workflow?: string;
  lines?: boolean;
  transactions?: boolean;
  fields: FieldDef[];
};

const party = (key: string, label: string): FieldDef[] => [
  { key, label, kind: "text", required: true },
  { key: `${key}_trn`, label: `${label} TRN / VAT number`, kind: "text" },
  { key: `${key}_address`, label: `${label} address`, kind: "text" },
];

const totals: FieldDef[] = [
  { key: "currency", label: "Currency", kind: "text", required: true },
  { key: "subtotal", label: "Subtotal", kind: "money", required: true, financial: true },
  { key: "discount", label: "Discount", kind: "money", financial: true },
  { key: "vat_rate", label: "VAT rate", kind: "percent", financial: true },
  { key: "vat_amount", label: "VAT amount", kind: "money", required: true, financial: true },
  { key: "total", label: "Total", kind: "money", required: true, financial: true },
];

export const DOC_TYPES: DocTypeDef[] = [
  {
    id: "supplier_invoice",
    label: "Supplier Invoice",
    group: "finance",
    workflow: "Supplier bill",
    lines: true,
    fields: [
      ...party("supplier_name", "Supplier"),
      { key: "invoice_number", label: "Invoice number", kind: "text", required: true },
      { key: "invoice_date", label: "Invoice date", kind: "date", required: true },
      { key: "due_date", label: "Due date", kind: "date" },
      { key: "po_number", label: "Purchase order number", kind: "text" },
      { key: "payment_terms", label: "Payment terms", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "customer_invoice",
    label: "Customer Invoice",
    group: "finance",
    workflow: "Customer invoice",
    lines: true,
    fields: [
      ...party("customer_name", "Customer"),
      { key: "invoice_number", label: "Invoice number", kind: "text", required: true },
      { key: "invoice_date", label: "Invoice date", kind: "date", required: true },
      { key: "due_date", label: "Due date", kind: "date" },
      { key: "payment_terms", label: "Payment terms", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    group: "procurement",
    workflow: "Purchase order",
    lines: true,
    fields: [
      ...party("supplier_name", "Supplier"),
      { key: "po_number", label: "PO number", kind: "text", required: true },
      { key: "po_date", label: "PO date", kind: "date", required: true },
      { key: "delivery_date", label: "Delivery date", kind: "date" },
      { key: "payment_terms", label: "Payment terms", kind: "text" },
      { key: "buyer", label: "Buyer", kind: "text" },
      { key: "delivery_address", label: "Shipping / delivery address", kind: "text" },
      { key: "notes", label: "Notes", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "goods_receipt",
    label: "Goods Received Note",
    group: "procurement",
    workflow: "Goods receipt",
    lines: true,
    fields: [
      { key: "grn_number", label: "GRN number", kind: "text", required: true },
      { key: "grn_date", label: "Date", kind: "date", required: true },
      ...party("supplier_name", "Supplier"),
      { key: "po_number", label: "PO number", kind: "text" },
      { key: "warehouse", label: "Warehouse", kind: "text" },
      { key: "delivery_reference", label: "Delivery reference", kind: "text" },
    ],
  },
  {
    id: "delivery_note",
    label: "Delivery Note",
    group: "sales",
    workflow: "Delivery note",
    lines: true,
    fields: [
      { key: "delivery_number", label: "Delivery note number", kind: "text", required: true },
      { key: "delivery_date", label: "Date", kind: "date", required: true },
      ...party("customer_name", "Customer"),
      { key: "so_number", label: "Sales order number", kind: "text" },
      { key: "warehouse", label: "Warehouse", kind: "text" },
    ],
  },
  {
    id: "bank_statement",
    label: "Bank Statement",
    group: "finance",
    workflow: "Bank transactions",
    transactions: true,
    fields: [
      { key: "bank_name", label: "Bank", kind: "text", required: true },
      { key: "account_identifier", label: "Account number / IBAN", kind: "text" },
      { key: "currency", label: "Currency", kind: "text", required: true },
      { key: "period_from", label: "Period from", kind: "date" },
      { key: "period_to", label: "Period to", kind: "date" },
      { key: "opening_balance", label: "Opening balance", kind: "money", required: true, financial: true },
      { key: "closing_balance", label: "Closing balance", kind: "money", required: true, financial: true },
    ],
  },
  {
    id: "expense_receipt",
    label: "Expense Receipt",
    group: "finance",
    workflow: "Expense",
    lines: true,
    fields: [
      { key: "merchant", label: "Merchant", kind: "text", required: true },
      { key: "receipt_date", label: "Date", kind: "date", required: true },
      { key: "receipt_number", label: "Receipt number", kind: "text" },
      { key: "currency", label: "Currency", kind: "text", required: true },
      { key: "subtotal", label: "Subtotal", kind: "money", financial: true },
      { key: "vat_amount", label: "VAT", kind: "money", financial: true },
      { key: "total", label: "Total", kind: "money", required: true, financial: true },
      { key: "payment_method", label: "Payment method", kind: "text" },
      { key: "employee", label: "Employee / cardholder", kind: "text" },
      { key: "category", label: "Expense category", kind: "text" },
    ],
  },
  {
    id: "supplier_credit_note",
    label: "Supplier Credit Note",
    group: "finance",
    workflow: "Supplier credit",
    lines: true,
    fields: [
      ...party("supplier_name", "Supplier"),
      { key: "credit_note_number", label: "Credit note number", kind: "text", required: true },
      { key: "credit_note_date", label: "Date", kind: "date", required: true },
      { key: "reference_invoice", label: "Reference invoice", kind: "text" },
      { key: "reason", label: "Reason", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "customer_credit_note",
    label: "Customer Credit Note",
    group: "finance",
    workflow: "Customer credit",
    lines: true,
    fields: [
      ...party("customer_name", "Customer"),
      { key: "credit_note_number", label: "Credit note number", kind: "text", required: true },
      { key: "credit_note_date", label: "Date", kind: "date", required: true },
      { key: "reference_invoice", label: "Reference invoice", kind: "text" },
      { key: "reason", label: "Reason", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "debit_note",
    label: "Debit Note",
    group: "finance",
    lines: true,
    fields: [
      { key: "debit_note_number", label: "Debit note number", kind: "text", required: true },
      { key: "debit_note_date", label: "Date", kind: "date", required: true },
      { key: "counterparty", label: "Counterparty", kind: "text" },
      { key: "reference_invoice", label: "Reference invoice", kind: "text" },
      { key: "reason", label: "Reason", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "supplier_quotation",
    label: "Supplier Quotation",
    group: "procurement",
    workflow: "Purchase order",
    lines: true,
    fields: [
      ...party("supplier_name", "Supplier"),
      { key: "quotation_number", label: "Quotation number", kind: "text", required: true },
      { key: "quotation_date", label: "Date", kind: "date", required: true },
      { key: "valid_until", label: "Valid until", kind: "date" },
      { key: "payment_terms", label: "Payment terms", kind: "text" },
      { key: "delivery_terms", label: "Delivery terms", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "customer_quotation",
    label: "Customer Quotation",
    group: "sales",
    workflow: "Sales order",
    lines: true,
    fields: [
      ...party("customer_name", "Customer"),
      { key: "quotation_number", label: "Quotation number", kind: "text", required: true },
      { key: "quotation_date", label: "Date", kind: "date", required: true },
      { key: "valid_until", label: "Valid until", kind: "date" },
      { key: "payment_terms", label: "Payment terms", kind: "text" },
      { key: "delivery_terms", label: "Delivery terms", kind: "text" },
      ...totals,
    ],
  },
  {
    id: "sales_order",
    label: "Sales Order",
    group: "sales",
    workflow: "Sales order",
    lines: true,
    fields: [
      ...party("customer_name", "Customer"),
      { key: "so_number", label: "Order number", kind: "text", required: true },
      { key: "order_date", label: "Order date", kind: "date", required: true },
      { key: "delivery_date", label: "Expected delivery", kind: "date" },
      ...totals,
    ],
  },
  { id: "payment_advice", label: "Payment Advice", group: "finance", fields: [
    { key: "counterparty", label: "Counterparty", kind: "text", required: true },
    { key: "payment_date", label: "Payment date", kind: "date", required: true },
    { key: "reference", label: "Reference", kind: "text" },
    { key: "total", label: "Amount", kind: "money", required: true, financial: true },
  ] },
  { id: "remittance_advice", label: "Remittance Advice", group: "finance", fields: [
    { key: "counterparty", label: "Counterparty", kind: "text", required: true },
    { key: "payment_date", label: "Payment date", kind: "date", required: true },
    { key: "reference", label: "Reference", kind: "text" },
    { key: "total", label: "Amount", kind: "money", required: true, financial: true },
  ] },
  { id: "cheque", label: "Cheque / Payment Document", group: "finance", fields: [
    { key: "counterparty", label: "Payee", kind: "text" },
    { key: "cheque_number", label: "Cheque number", kind: "text" },
    { key: "payment_date", label: "Date", kind: "date" },
    { key: "total", label: "Amount", kind: "money", financial: true },
  ] },
  { id: "customer_payment_advice", label: "Customer Payment Advice", group: "sales", fields: [
    { key: "customer_name", label: "Customer", kind: "text", required: true },
    { key: "payment_date", label: "Payment date", kind: "date" },
    { key: "reference", label: "Reference", kind: "text" },
    { key: "total", label: "Amount", kind: "money", financial: true },
  ] },
  { id: "stock_transfer", label: "Stock Transfer Document", group: "inventory", lines: true, fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "transfer_date", label: "Date", kind: "date" },
    { key: "from_warehouse", label: "From warehouse", kind: "text" },
    { key: "to_warehouse", label: "To warehouse", kind: "text" },
  ] },
  { id: "material_issue", label: "Material Issue", group: "inventory", lines: true, fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "issue_date", label: "Date", kind: "date" },
    { key: "warehouse", label: "Warehouse", kind: "text" },
    { key: "production_order", label: "Production order", kind: "text" },
  ] },
  { id: "material_receipt", label: "Material Receipt", group: "inventory", lines: true, fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "receipt_date", label: "Date", kind: "date" },
    { key: "warehouse", label: "Warehouse", kind: "text" },
  ] },
  { id: "production_report", label: "Production Report", group: "inventory", lines: true, fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "report_date", label: "Date", kind: "date" },
    { key: "production_order", label: "Production order", kind: "text" },
  ] },
  { id: "inventory_count", label: "Inventory Count Sheet", group: "inventory", lines: true, fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "count_date", label: "Count date", kind: "date" },
    { key: "warehouse", label: "Warehouse", kind: "text" },
  ] },
  { id: "contract", label: "Contract", group: "other", fields: [
    { key: "counterparty", label: "Counterparty", kind: "text" },
    { key: "start_date", label: "Start date", kind: "date" },
    { key: "end_date", label: "End date", kind: "date" },
    { key: "total", label: "Contract value", kind: "money" },
  ] },
  { id: "bank_confirmation", label: "Bank Confirmation", group: "other", fields: [
    { key: "bank_name", label: "Bank", kind: "text" },
    { key: "account_identifier", label: "Account", kind: "text" },
    { key: "closing_balance", label: "Confirmed balance", kind: "money", financial: true },
    { key: "period_to", label: "As at", kind: "date" },
  ] },
  { id: "tax_document", label: "Tax Document", group: "other", fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "period_from", label: "Period from", kind: "date" },
    { key: "period_to", label: "Period to", kind: "date" },
    { key: "total", label: "Amount", kind: "money", financial: true },
  ] },
  { id: "general_financial", label: "General Financial Document", group: "other", fields: [
    { key: "reference", label: "Reference", kind: "text" },
    { key: "counterparty", label: "Counterparty", kind: "text" },
    { key: "total", label: "Amount", kind: "money" },
  ] },
  { id: "unknown", label: "Unknown / Unsupported", group: "other", fields: [] },
];

export const DOC_TYPE_MAP: Record<string, DocTypeDef> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.id, d]),
);

export const MVP_TYPES = [
  "supplier_invoice",
  "customer_invoice",
  "bank_statement",
  "purchase_order",
  "goods_receipt",
  "delivery_note",
  "expense_receipt",
  "supplier_credit_note",
];

export function docTypeLabel(id?: string | null) {
  return (id && DOC_TYPE_MAP[id]?.label) || "Unknown / Unsupported";
}

/* ------------------------------------------------------------------ */
/* Extraction contract                                                 */
/* ------------------------------------------------------------------ */

export type ExtractedField = {
  value: string | number | null;
  confidence: number;
  page?: number;
  /** Normalised 0-1 box [x, y, w, h] used to highlight the source region. */
  bbox?: [number, number, number, number];
};

export type ExtractedLine = {
  sku?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount?: number;
  vat_rate?: number;
  vat_amount?: number;
  line_total: number;
  quantity_ordered?: number;
  quantity_received?: number;
  batch?: string | null;
  /** Linked Qyoo product, set by matching or by the reviewer. */
  product_id?: string | null;
  product_match?: number | null;
  confidence: number;
};

export type ExtractedTransaction = {
  txn_date: string;
  value_date?: string | null;
  description: string;
  reference?: string | null;
  debit?: number;
  credit?: number;
  amount: number;
  direction: "in" | "out";
  balance?: number | null;
  category?: string | null;
  confidence: number;
};

export type Extraction = {
  doc_type: string;
  doc_type_confidence: number;
  processor: string;
  processor_version?: string;
  fields: Record<string, ExtractedField>;
  lines?: ExtractedLine[];
  transactions?: ExtractedTransaction[];
  page_count?: number;
  raw_text?: string;
};

export function fieldValue(e: Extraction | null | undefined, key: string) {
  return e?.fields?.[key]?.value ?? null;
}

export function fieldNumber(e: Extraction | null | undefined, key: string) {
  const v = fieldValue(e, key);
  return v == null || v === "" ? 0 : Number(v);
}

export function confidenceBand(v: number): "high" | "medium" | "low" {
  if (v >= 92) return "high";
  if (v >= 75) return "medium";
  return "low";
}

export function overallConfidence(e: Extraction | null | undefined) {
  if (!e) return 0;
  const vals = [
    ...Object.values(e.fields ?? {}).map((f) => f.confidence),
    ...(e.lines ?? []).map((l) => l.confidence),
    ...(e.transactions ?? []).map((t) => t.confidence),
  ].filter((n) => Number.isFinite(n));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, n) => s + n, 0) / vals.length);
}

/** Fields that are financially material AND below the trust threshold. */
export function lowConfidenceFinancialFields(e: Extraction | null | undefined) {
  if (!e) return [];
  const def = DOC_TYPE_MAP[e.doc_type];
  if (!def) return [];
  return def.fields
    .filter((f) => f.financial && (e.fields[f.key]?.confidence ?? 0) < 92)
    .map((f) => f);
}

/* ------------------------------------------------------------------ */
/* Validation engine — deterministic, never inferential                */
/* ------------------------------------------------------------------ */

export type Severity = "error" | "warning" | "info";
export type ValidationIssue = {
  code: string;
  severity: Severity;
  message: string;
  detail?: string;
  amount?: number;
};

const TOL = 0.02;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * 0.001);

export function validateExtraction(e: Extraction | null | undefined): ValidationIssue[] {
  if (!e) return [];
  const def = DOC_TYPE_MAP[e.doc_type];
  const issues: ValidationIssue[] = [];
  if (!def) return issues;

  for (const f of def.fields) {
    if (!f.required) continue;
    const v = e.fields[f.key]?.value;
    if (v == null || v === "") {
      issues.push({
        code: `missing_${f.key}`,
        severity: "error",
        message: `${f.label} is missing`,
        detail: "Qyoo never invents a missing value. Enter it before approving.",
      });
    }
  }

  for (const f of lowConfidenceFinancialFields(e)) {
    issues.push({
      code: `low_confidence_${f.key}`,
      severity: "warning",
      message: `Low-confidence reading on ${f.label}`,
      detail: `Extraction confidence ${(e.fields[f.key]?.confidence ?? 0).toFixed(0)}%. Confirm against the original document.`,
    });
  }

  const lines = e.lines ?? [];
  if (def.lines && lines.length === 0) {
    issues.push({
      code: "no_lines",
      severity: "warning",
      message: "No line items were detected",
      detail: "Layout analysis found no table. Add lines manually or re-upload a clearer copy.",
    });
  }

  for (const [i, l] of lines.entries()) {
    const computed = l.quantity * l.unit_price - (l.discount ?? 0);
    if (l.line_total && !near(computed, l.line_total)) {
      issues.push({
        code: `line_total_${i}`,
        severity: "error",
        message: `Line ${i + 1} total does not recompute`,
        detail: `${l.description}: ${l.quantity} × ${l.unit_price} − ${l.discount ?? 0} = ${computed.toFixed(2)}, document shows ${l.line_total.toFixed(2)}.`,
        amount: Math.abs(computed - l.line_total),
      });
    }
  }

  const grouped = ["supplier_invoice", "customer_invoice", "purchase_order", "supplier_credit_note", "customer_credit_note", "debit_note", "supplier_quotation", "customer_quotation", "sales_order"];
  if (grouped.includes(e.doc_type)) {
    const subtotal = fieldNumber(e, "subtotal");
    const discount = fieldNumber(e, "discount");
    const vat = fieldNumber(e, "vat_amount");
    const total = fieldNumber(e, "total");

    if (lines.length) {
      const lineSum = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);
      if (subtotal && !near(lineSum, subtotal)) {
        issues.push({
          code: "subtotal_lines",
          severity: "error",
          message: "Line items do not add up to the subtotal",
          detail: `Lines total ${lineSum.toFixed(2)} vs subtotal ${subtotal.toFixed(2)}.`,
          amount: Math.abs(lineSum - subtotal),
        });
      }
    }

    if (total && !near(subtotal - discount + vat, total)) {
      issues.push({
        code: "total_mismatch",
        severity: "error",
        message: "Subtotal + VAT − discount does not equal the total",
        detail: `${subtotal.toFixed(2)} − ${discount.toFixed(2)} + ${vat.toFixed(2)} = ${(subtotal - discount + vat).toFixed(2)}, document shows ${total.toFixed(2)}.`,
        amount: Math.abs(subtotal - discount + vat - total),
      });
    }

    const rate = fieldNumber(e, "vat_rate");
    if (rate && subtotal) {
      const expected = ((subtotal - discount) * rate) / 100;
      if (vat && !near(expected, vat)) {
        issues.push({
          code: "vat_inconsistent",
          severity: "warning",
          message: "VAT amount is inconsistent with the stated VAT rate",
          detail: `${rate}% of ${(subtotal - discount).toFixed(2)} is ${expected.toFixed(2)}, document shows ${vat.toFixed(2)}.`,
          amount: Math.abs(expected - vat),
        });
      }
    }
  }

  if (e.doc_type === "expense_receipt") {
    const sub = fieldNumber(e, "subtotal");
    const vat = fieldNumber(e, "vat_amount");
    const total = fieldNumber(e, "total");
    if (sub && total && !near(sub + vat, total)) {
      issues.push({
        code: "receipt_total",
        severity: "error",
        message: "Receipt subtotal plus VAT does not equal the total",
        detail: `${sub.toFixed(2)} + ${vat.toFixed(2)} = ${(sub + vat).toFixed(2)}, receipt shows ${total.toFixed(2)}.`,
        amount: Math.abs(sub + vat - total),
      });
    }
  }

  if (e.doc_type === "bank_statement") {
    const txns = e.transactions ?? [];
    if (!txns.length) {
      issues.push({ code: "no_transactions", severity: "error", message: "No transactions were detected in the statement" });
    }
    const opening = fieldNumber(e, "opening_balance");
    const closing = fieldNumber(e, "closing_balance");
    const credits = txns.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const debits = txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    const computed = opening + credits - debits;
    if (txns.length && !near(computed, closing)) {
      issues.push({
        code: "statement_balance",
        severity: "error",
        message: "Statement does not balance",
        detail: `Opening ${opening.toFixed(2)} + credits ${credits.toFixed(2)} − debits ${debits.toFixed(2)} = ${computed.toFixed(2)}, statement closing balance is ${closing.toFixed(2)}. Transactions are likely missing.`,
        amount: Math.abs(computed - closing),
      });
    }
    const seen = new Map<string, number>();
    for (const t of txns) {
      const k = `${t.txn_date}|${t.amount}|${t.direction}|${t.description}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    if (dupes.length) {
      issues.push({
        code: "statement_duplicates",
        severity: "warning",
        message: `${dupes.length} possible duplicate transaction${dupes.length > 1 ? "s" : ""} inside the statement`,
        detail: "Identical date, amount and description. Review before importing.",
      });
    }
  }

  if (e.doc_type === "goods_receipt" || e.doc_type === "delivery_note") {
    for (const [i, l] of lines.entries()) {
      const ordered = Number(l.quantity_ordered ?? 0);
      const received = Number(l.quantity_received ?? l.quantity ?? 0);
      if (ordered && received > ordered) {
        issues.push({
          code: `over_receipt_${i}`,
          severity: "error",
          message: `Over-receipt on line ${i + 1}`,
          detail: `${l.description}: ${received} against an ordered quantity of ${ordered}.`,
        });
      } else if (ordered && received < ordered) {
        issues.push({
          code: `under_receipt_${i}`,
          severity: "info",
          message: `Partial quantity on line ${i + 1}`,
          detail: `${l.description}: ${received} of ${ordered}.`,
        });
      }
    }
  }

  return issues;
}

export function blocking(issues: ValidationIssue[]) {
  return issues.filter((i) => i.severity === "error");
}

/* ------------------------------------------------------------------ */
/* Status model                                                        */
/* ------------------------------------------------------------------ */

export const DOC_STATUS_FLOW = [
  "uploading",
  "processing",
  "classified",
  "extracted",
  "validating",
  "needs_review",
  "ready",
  "approved",
  "posted",
  "failed",
] as const;

export type DocStatus = (typeof DOC_STATUS_FLOW)[number];

export const STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading",
  processing: "Processing",
  classified: "Type detected",
  extracted: "Extracted",
  validating: "Validating",
  needs_review: "Needs review",
  needs_type: "Type unclear",
  ready: "Ready to post",
  approved: "Approved",
  posted: "Posted",
  failed: "Failed",
};

export function statusToneFor(status: string) {
  if (status === "posted" || status === "ready" || status === "approved") return "success" as const;
  if (status === "failed") return "critical" as const;
  if (status === "needs_review" || status === "needs_type") return "warning" as const;
  return "neutral" as const;
}

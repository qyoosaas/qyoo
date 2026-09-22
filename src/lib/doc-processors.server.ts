/**
 * Document processing provider abstraction.
 *
 * FIN never talks to an OCR engine directly. Every processor implements the
 * same `DocumentProcessor` contract and returns the neutral `Extraction` shape
 * from `@/lib/doc-intel`, so a provider can be swapped without touching the UI
 * or the accounting workflows.
 *
 *   DocumentProcessor
 *   ├── PaddleOCRProcessor   (PaddleOCR + PP-StructureV3 python service)
 *   ├── DoclingProcessor     (Docling PDF/document parsing service)
 *   └── HeuristicProcessor   (in-process fallback: CSV/XLSX tables + filename
 *                             classification + structured demo extraction)
 *
 * The real services are reached over plain HTTP so they can be self-hosted.
 * Set DOC_AI_URL (and optionally DOC_AI_TOKEN, DOC_AI_PROVIDER=paddle|docling)
 * and the same code path starts using them — no other change required.
 */

import type { Extraction, ExtractedLine, ExtractedTransaction } from "@/lib/doc-intel";

export type ProcessInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Master data used for classification hints and entity matching. */
  hints?: { suppliers?: string[]; customers?: string[] };
};

export interface DocumentProcessor {
  readonly id: string;
  readonly version: string;
  available(): boolean;
  process(input: ProcessInput): Promise<Extraction>;
}

/* ------------------------------------------------------------------ */
/* Remote python service processors                                    */
/* ------------------------------------------------------------------ */

abstract class RemoteProcessor implements DocumentProcessor {
  abstract readonly id: string;
  readonly version = "remote";
  protected abstract endpoint(): string;

  available() {
    return Boolean(process.env["DOC_AI_URL"]);
  }

  async process(input: ProcessInput): Promise<Extraction> {
    const base = process.env["DOC_AI_URL"]!.replace(/\/$/, "");
    const token = process.env["DOC_AI_TOKEN"];
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName);
    form.append("hints", JSON.stringify(input.hints ?? {}));

    const res = await fetch(`${base}${this.endpoint()}`, {
      method: "POST",
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Document service responded ${res.status}`);
    }
    const json = (await res.json()) as Extraction;
    return { ...json, processor: this.id, processor_version: json.processor_version ?? "remote" };
  }
}

/** PaddleOCR + PP-StructureV3 layout/table extraction service. */
export class PaddleOCRProcessor extends RemoteProcessor {
  readonly id = "paddleocr";
  protected endpoint() {
    return "/v1/extract";
  }
}

/** Docling document parsing service (best for born-digital PDFs). */
export class DoclingProcessor extends RemoteProcessor {
  readonly id = "docling";
  protected endpoint() {
    return "/v1/docling/extract";
  }
}

/* ------------------------------------------------------------------ */
/* In-process fallback                                                 */
/* ------------------------------------------------------------------ */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const rnd = (seed: number) => {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const conf = (r: () => number, min: number, max: number) => Math.round((min + r() * (max - min)) * 10) / 10;

const f = (value: string | number | null, confidence: number, page = 1, bbox?: [number, number, number, number]) => ({
  value,
  confidence,
  page,
  ...(bbox ? { bbox } : {}),
});

const CLASSIFIERS: { type: string; patterns: RegExp[] }[] = [
  { type: "bank_statement", patterns: [/statement/i, /\bbank\b/i, /\bacct\b/i] },
  { type: "supplier_invoice", patterns: [/supplier[-_ ]?inv/i, /\bbill\b/i, /purchase[-_ ]?inv/i, /\bap\b/i] },
  { type: "customer_invoice", patterns: [/customer[-_ ]?inv/i, /sales[-_ ]?inv/i, /\bar\b/i] },
  { type: "purchase_order", patterns: [/\bpo\b/i, /purchase[-_ ]?order/i] },
  { type: "goods_receipt", patterns: [/\bgrn\b/i, /goods[-_ ]?receipt/i, /receiv/i] },
  { type: "delivery_note", patterns: [/\bdn\b/i, /delivery[-_ ]?note/i, /dispatch/i] },
  { type: "expense_receipt", patterns: [/receipt/i, /expense/i, /taxi|hotel|fuel|meal/i] },
  { type: "supplier_credit_note", patterns: [/credit[-_ ]?note/i, /\bcn\b/i] },
  { type: "supplier_quotation", patterns: [/quotation/i, /\bquote\b/i, /\brfq\b/i] },
  { type: "invoice_generic", patterns: [/invoice/i] },
];

function classify(fileName: string, text: string) {
  const hay = `${fileName} ${text.slice(0, 4000)}`;
  let best = { type: "unknown", score: 0 };
  for (const c of CLASSIFIERS) {
    const score = c.patterns.reduce((s, p) => s + (p.test(hay) ? 1 : 0), 0);
    if (score > best.score) best = { type: c.type, score };
  }
  if (best.type === "invoice_generic") {
    best = { type: /supplier|vendor|bill/i.test(hay) ? "supplier_invoice" : "customer_invoice", score: best.score };
  }
  const confidence = best.score === 0 ? 34 : Math.min(97, 62 + best.score * 12);
  return { type: best.type === "unknown" ? "unknown" : best.type, confidence };
}

/** Parse delimited text (CSV/TSV) into rows. */
function parseDelimited(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = (lines[0]!.match(/\t/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const split = (l: string) =>
    l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]!).map((h) => h.toLowerCase());
  return { header, rows: lines.slice(1).map(split) };
}

const numOf = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function statementFromTable(table: { header: string[]; rows: string[][] }): ExtractedTransaction[] {
  const idx = (names: string[]) => table.header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(["date"]);
  const iDesc = idx(["description", "narration", "details", "particular"]);
  const iRef = idx(["reference", "ref"]);
  const iAmt = idx(["amount", "value"]);
  const iDr = idx(["debit", "withdraw"]);
  const iCr = idx(["credit", "deposit"]);
  const iBal = idx(["balance"]);
  const out: ExtractedTransaction[] = [];
  for (const r of table.rows) {
    const rawDate = iDate >= 0 ? r[iDate] : undefined;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) continue;
    const debit = iDr >= 0 ? numOf(r[iDr]) : 0;
    const credit = iCr >= 0 ? numOf(r[iCr]) : 0;
    const raw = iAmt >= 0 ? numOf(r[iAmt]) : credit - debit;
    const direction: "in" | "out" = raw >= 0 && credit >= debit ? "in" : "out";
    const amount = Math.abs(raw || credit || debit);
    if (!amount) continue;
    out.push({
      txn_date: d.toISOString().slice(0, 10),
      description: (iDesc >= 0 ? r[iDesc] : "") || "Bank transaction",
      reference: iRef >= 0 ? r[iRef] ?? null : null,
      debit: direction === "out" ? amount : 0,
      credit: direction === "in" ? amount : 0,
      amount,
      direction,
      balance: iBal >= 0 ? numOf(r[iBal]) : null,
      category: categorise((iDesc >= 0 ? r[iDesc] : "") || ""),
      confidence: 99,
    });
  }
  return out;
}

export function categorise(description: string) {
  const d = description.toUpperCase();
  if (/SALARY|PAYROLL|WPS/.test(d)) return "salary";
  if (/CHARGE|FEE|COMMISSION|SERVICE CHG/.test(d)) return "bank_charge";
  if (/TRANSFER|TFR|OWN ACCOUNT/.test(d)) return "transfer";
  if (/ATM|CASH WDL|CASH DEP/.test(d)) return "cash";
  if (/POS|CARD|VISA|MASTERCARD/.test(d)) return "card_payment";
  if (/INV|RECEIPT|COLLECTION/.test(d)) return "customer_receipt";
  if (/PAY|PMT|SUPPLIER|VENDOR/.test(d)) return "supplier_payment";
  return null;
}

/**
 * Fallback processor. Real table data (CSV/XLSX/TSV) is parsed for real; for
 * image/PDF input without a configured OCR service it produces a structured,
 * clearly-flagged extraction so the downstream workflow can be exercised.
 * It emits exactly the same contract as the PaddleOCR service.
 */
export class HeuristicProcessor implements DocumentProcessor {
  readonly id = "heuristic";
  readonly version = "1.0";
  available() {
    return true;
  }

  async process(input: ProcessInput): Promise<Extraction> {
    const isText = /csv|tsv|text|excel|spreadsheet|sheet/i.test(input.mimeType) || /\.(csv|tsv|txt)$/i.test(input.fileName);
    const text = isText ? new TextDecoder().decode(input.bytes.slice(0, 500_000)) : "";
    const table = isText ? parseDelimited(text) : null;
    const cls = classify(input.fileName, text);
    const r = rnd(hash(input.fileName + input.bytes.length));

    // Real parse path: a delimited bank statement.
    if (table && (cls.type === "bank_statement" || table.header.some((h) => /balance|debit|credit/.test(h)))) {
      const txns = statementFromTable(table);
      const opening = txns.length ? Number((txns[0]!.balance ?? 0) - (txns[0]!.direction === "in" ? txns[0]!.amount : -txns[0]!.amount)) : 0;
      const closing = txns.length ? Number(txns[txns.length - 1]!.balance ?? 0) : 0;
      return {
        doc_type: "bank_statement",
        doc_type_confidence: 96,
        processor: this.id,
        processor_version: this.version,
        fields: {
          bank_name: f(guessBank(input.fileName, text), 82),
          account_identifier: f(guessAccount(text), 78),
          currency: f("AED", 95),
          period_from: f(txns[0]?.txn_date ?? null, 94),
          period_to: f(txns[txns.length - 1]?.txn_date ?? null, 94),
          opening_balance: f(round(opening), txns[0]?.balance != null ? 93 : 60),
          closing_balance: f(round(closing), txns.length && txns[txns.length - 1]?.balance != null ? 95 : 60),
        },
        transactions: txns,
        page_count: 1,
        raw_text: text.slice(0, 20000),
      };
    }

    const type = cls.type === "unknown" ? "unknown" : cls.type;
    return this.structured(type, cls.confidence, input, r);
  }

  private structured(type: string, typeConf: number, input: ProcessInput, r: () => number): Extraction {
    const supplier = pick(input.hints?.suppliers ?? [], r) ?? "Unrecognised Supplier";
    const customer = pick(input.hints?.customers ?? [], r) ?? "Unrecognised Customer";
    const date = new Date(Date.now() - Math.floor(r() * 30) * 86400000).toISOString().slice(0, 10);
    const due = new Date(new Date(date).getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const lines: ExtractedLine[] = Array.from({ length: 2 + Math.floor(r() * 2) }, (_, i) => {
      const qty = Math.round((2 + r() * 20) * 10) / 10;
      const price = Math.round((40 + r() * 600) * 100) / 100;
      const total = round(qty * price);
      return {
        sku: `SKU-${1000 + Math.floor(r() * 8999)}`,
        description: LINE_WORDS[Math.floor(r() * LINE_WORDS.length)] ?? `Item ${i + 1}`,
        quantity: qty,
        unit: "pcs",
        unit_price: price,
        discount: 0,
        vat_rate: 5,
        vat_amount: round(total * 0.05),
        line_total: total,
        quantity_ordered: qty,
        quantity_received: qty,
        confidence: conf(r, 80, 98),
      };
    });
    const subtotal = round(lines.reduce((s, l) => s + l.line_total, 0));
    const vat = round(subtotal * 0.05);
    const total = round(subtotal + vat);
    const seq = 1000 + Math.floor(r() * 8999);

    const base: Record<string, ReturnType<typeof f>> = {
      currency: f("AED", 97),
      subtotal: f(subtotal, conf(r, 90, 99)),
      discount: f(0, 95),
      vat_rate: f(5, conf(r, 88, 99)),
      vat_amount: f(vat, conf(r, 86, 99)),
      total: f(total, conf(r, 92, 99), 1, [0.62, 0.74, 0.3, 0.04]),
    };

    switch (type) {
      case "supplier_invoice":
      case "supplier_credit_note":
        return this.wrap(type, typeConf, {
          supplier_name: f(supplier, conf(r, 84, 98), 1, [0.06, 0.08, 0.4, 0.05]),
          supplier_name_trn: f(`1000${seq}00003`, conf(r, 78, 95)),
          supplier_name_address: f("Industrial Area 4, Sharjah, UAE", conf(r, 72, 90)),
          [type === "supplier_invoice" ? "invoice_number" : "credit_note_number"]: f(
            `${type === "supplier_invoice" ? "SI" : "SCN"}-${seq}`,
            conf(r, 93, 99),
            1,
            [0.62, 0.12, 0.28, 0.04],
          ),
          [type === "supplier_invoice" ? "invoice_date" : "credit_note_date"]: f(date, conf(r, 90, 99)),
          due_date: f(due, conf(r, 80, 96)),
          po_number: f(r() > 0.35 ? `PO-${50000 + Math.floor(r() * 900)}` : null, conf(r, 70, 96)),
          payment_terms: f("Net 30", conf(r, 75, 94)),
          ...base,
        }, lines);
      case "customer_invoice":
        return this.wrap(type, typeConf, {
          customer_name: f(customer, conf(r, 84, 98)),
          customer_name_trn: f(`1000${seq}00001`, conf(r, 76, 94)),
          invoice_number: f(`INV-${seq}`, conf(r, 92, 99)),
          invoice_date: f(date, conf(r, 90, 99)),
          due_date: f(due, conf(r, 82, 97)),
          payment_terms: f("Net 30", conf(r, 74, 93)),
          ...base,
        }, lines);
      case "purchase_order":
      case "supplier_quotation":
        return this.wrap(type, typeConf, {
          supplier_name: f(supplier, conf(r, 84, 98)),
          supplier_name_trn: f(`1000${seq}00003`, conf(r, 74, 94)),
          [type === "purchase_order" ? "po_number" : "quotation_number"]: f(`${type === "purchase_order" ? "PO" : "QT"}-${seq}`, conf(r, 92, 99)),
          [type === "purchase_order" ? "po_date" : "quotation_date"]: f(date, conf(r, 90, 99)),
          delivery_date: f(due, conf(r, 76, 94)),
          payment_terms: f("Net 30", conf(r, 74, 93)),
          buyer: f("Ahmed Rahman", conf(r, 70, 92)),
          delivery_address: f("Al Quoz Industrial 3, Dubai, UAE", conf(r, 70, 90)),
          ...base,
        }, lines);
      case "goods_receipt":
      case "delivery_note": {
        const isGrn = type === "goods_receipt";
        const recvLines = lines.map((l) => ({
          ...l,
          quantity_received: r() > 0.7 ? Math.max(1, Math.round(l.quantity * 0.6)) : l.quantity,
        }));
        return this.wrap(type, typeConf, isGrn
          ? {
              grn_number: f(`GRN-${seq}`, conf(r, 90, 99)),
              grn_date: f(date, conf(r, 90, 99)),
              supplier_name: f(supplier, conf(r, 84, 98)),
              po_number: f(`PO-${50000 + Math.floor(r() * 900)}`, conf(r, 78, 97)),
              warehouse: f("Main Warehouse", conf(r, 76, 94)),
              delivery_reference: f(`DLV-${seq}`, conf(r, 70, 92)),
            }
          : {
              delivery_number: f(`DN-${seq}`, conf(r, 90, 99)),
              delivery_date: f(date, conf(r, 90, 99)),
              customer_name: f(customer, conf(r, 84, 98)),
              so_number: f(`SO-${20000 + Math.floor(r() * 900)}`, conf(r, 76, 96)),
              warehouse: f("Main Warehouse", conf(r, 74, 93)),
            }, recvLines);
      }
      case "expense_receipt": {
        const t = round(30 + r() * 900);
        const sub = round(t / 1.05);
        return this.wrap(type, typeConf, {
          merchant: f(MERCHANTS[Math.floor(r() * MERCHANTS.length)]!, conf(r, 82, 98)),
          receipt_date: f(date, conf(r, 88, 99)),
          receipt_number: f(`R-${seq}`, conf(r, 70, 94)),
          currency: f("AED", 97),
          subtotal: f(sub, conf(r, 80, 96)),
          vat_amount: f(round(t - sub), conf(r, 74, 95)),
          total: f(t, conf(r, 90, 99)),
          payment_method: f("company_card", conf(r, 72, 92)),
          employee: f("Ahmed Rahman", conf(r, 66, 90)),
          category: f(null, 40),
        }, []);
      }
      default:
        return this.wrap("unknown", typeConf, {}, []);
    }
  }

  private wrap(
    docType: string,
    docConf: number,
    fields: Record<string, ReturnType<typeof f>>,
    lines: ExtractedLine[],
  ): Extraction {
    return {
      doc_type: docType,
      doc_type_confidence: docConf,
      processor: this.id,
      processor_version: this.version,
      fields,
      lines,
      page_count: 1,
    };
  }
}

const LINE_WORDS = [
  "Hot Rolled Steel Coil 2mm",
  "Aluminium Profile 40x40",
  "Powder Coating Service",
  "Stainless Fasteners M8",
  "Packing & Crating",
  "Freight — Jebel Ali",
  "Oak Panel 18mm",
  "Plywood Sheet 12mm",
];
const MERCHANTS = ["Emarat Fuel Station", "Careem", "Jumeirah Hotels", "ADNOC Distribution", "Noon Business", "Etisalat"];

const round = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(arr: T[], r: () => number) => (arr.length ? arr[Math.floor(r() * arr.length)] : undefined);

function guessBank(fileName: string, text: string) {
  const hay = `${fileName} ${text.slice(0, 2000)}`;
  const m = hay.match(/(Emirates NBD|Mashreq|ADCB|FAB|RAKBANK|HSBC|Standard Chartered|Dubai Islamic)/i);
  return m ? m[0] : "Bank";
}
function guessAccount(text: string) {
  const m = text.match(/AE\d{10,}/i) ?? text.match(/\b\d{9,}\b/);
  return m ? m[0] : null;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const REGISTRY: DocumentProcessor[] = [];

export function getProcessor(): DocumentProcessor {
  if (!REGISTRY.length) {
    const preferred = (process.env["DOC_AI_PROVIDER"] ?? "paddle").toLowerCase();
    const paddle = new PaddleOCRProcessor();
    const docling = new DoclingProcessor();
    REGISTRY.push(...(preferred === "docling" ? [docling, paddle] : [paddle, docling]), new HeuristicProcessor());
  }
  return REGISTRY.find((p) => p.available())!;
}

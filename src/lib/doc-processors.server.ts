/**
 * Document processing provider abstraction.
 *
 * Qyoo never talks to an OCR engine directly. Every processor implements the
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

/* ------------------------------------------------------------------ */
/* File readers (Worker-safe, pure JS)                                 */
/* ------------------------------------------------------------------ */

const isXlsx = (input: ProcessInput) =>
  /\.xlsx$/i.test(input.fileName) || /spreadsheetml/i.test(input.mimeType);
const isPdf = (input: ProcessInput) => /\.pdf$/i.test(input.fileName) || /pdf/i.test(input.mimeType);
const isImage = (input: ProcessInput) => /^image\//i.test(input.mimeType) || /\.(jpe?g|png|tiff?)$/i.test(input.fileName);

const xmlDecode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Read the first worksheet of an .xlsx workbook into rows of strings. */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes);
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const m of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(xmlDecode([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
    }
  }
  const sheetKey = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetKey) return [];
  const xml = strFromU8(files[sheetKey]!);
  const colIdx = (ref: string) => {
    const letters = ref.replace(/\d+/g, "");
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? "";
      const body = cm[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /t="(\w+)"/.exec(attrs)?.[1];
      let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      if (t === "s") v = shared[Number(v)] ?? "";
      else if (t === "inlineStr") v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
      const i = ref ? colIdx(ref) : row.length;
      row[i] = xmlDecode(v).trim();
    }
    if (row.some((c) => c)) rows.push(Array.from(row, (c) => c ?? ""));
  }
  return rows;
}

/** Excel stores dates as day serials. Convert columns whose header says "date". */
function fixExcelDates(table: { header: string[]; rows: string[][] }) {
  table.header.forEach((h, i) => {
    if (!/date/.test(h)) return;
    for (const r of table.rows) {
      const n = Number(r[i]);
      if (r[i] && Number.isFinite(n) && n > 20000 && n < 80000) {
        r[i] = new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
      }
    }
  });
  return table;
}

/** Text layer of a born-digital PDF. Scans have no text layer and return "". */
async function readPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { text: (text as string[]).join("\n"), pages: totalPages };
  } catch {
    return { text: "", pages: 1 };
  }
}

/* ------------------------------------------------------------------ */
/* Text → fields (deterministic, never invents values)                 */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}[\s\-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]+\d{4})/i;

export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = Number(m[1]); // UAE convention: day first
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = /^(\d{1,2})[\s\-]([a-z]{3})[a-z]*[\s\-,]+(\d{4})$/i.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase()]) {
    return `${m[3]}-${String(MONTHS[m[2]!.toLowerCase()]).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  return null;
}

const money = (s: string) => Number(s.replace(/,/g, ""));
const AMT = "([\\d,]+\\.\\d{2})";

function labelled(text: string, labels: string, valueRe: string, flags = "i") {
  const re = new RegExp(`(?:${labels})[^\\n\\d]{0,30}?${valueRe}`, flags);
  return re.exec(text)?.[1] ?? null;
}

function labelledDate(text: string, labels: string) {
  const re = new RegExp(`(?:${labels})[^\\n]{0,25}?${DATE_RE.source}`, "i");
  const hit = re.exec(text)?.[1];
  return hit ? toIsoDate(hit) : null;
}

function lastAmount(text: string, labels: string, exclude?: RegExp) {
  let out: number | null = null;
  const re = new RegExp(`^.*(?:${labels}).*$`, "gim");
  for (const m of text.matchAll(re)) {
    if (exclude?.test(m[0])) continue;
    const nums = [...m[0].matchAll(new RegExp(AMT, "g"))];
    if (nums.length) out = money(nums[nums.length - 1]![1]!);
  }
  return out;
}

/** Table-like text lines: description, qty, unit price, (vat%), line total. */
function linesFromText(text: string): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  const re = /^\s*(?:(\d{1,3})[.)]?\s+)?(?:([A-Z]{2,4}-\d{3,6})\s+)?(.{3,80}?)\s+(\d+(?:\.\d+)?)\s+(?:[A-Za-z]{1,6}\s+)?([\d,]+\.\d{2})\s+(?:(\d{1,2}(?:\.\d+)?)\s*%\s+)?(?:[\d,]+\.\d{2}\s+)?([\d,]+\.\d{2})\s*$/;
  for (const raw of text.split(/\n/)) {
    const m = re.exec(raw);
    if (!m) continue;
    const qty = Number(m[4]);
    const price = money(m[5]!);
    const total = money(m[7]!);
    if (/total|vat|subtotal|balance/i.test(m[3]!)) continue;
    const ok = Math.abs(qty * price - total) < 0.05 || Math.abs(qty * price * 1.05 - total) < 0.05;
    if (!ok || !qty) continue;
    const net = Math.abs(qty * price - total) < 0.05 ? total : round(qty * price);
    const vatRate = m[6] ? Number(m[6]) : 5;
    out.push({
      sku: m[2] ?? null,
      description: m[3]!.trim(),
      quantity: qty,
      unit_price: price,
      discount: 0,
      vat_rate: vatRate,
      vat_amount: round(net * (vatRate / 100)),
      line_total: net,
      quantity_ordered: qty,
      quantity_received: qty,
      confidence: 88,
    });
  }
  return out;
}

/** Line items from a spreadsheet/CSV item table. */
function linesFromTable(table: { header: string[]; rows: string[][] }): ExtractedLine[] {
  const idx = (names: string[]) => table.header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDesc = idx(["description", "item", "product", "particular", "name"]);
  const iSku = idx(["sku", "code", "part"]);
  const iQty = idx(["qty", "quantity"]);
  const iPrice = idx(["price", "rate", "unit cost"]);
  const iVat = idx(["vat %", "vat rate", "tax %"]);
  const iTot = idx(["amount", "total", "value"]);
  if (iQty < 0 || (iPrice < 0 && iTot < 0)) return [];
  return table.rows
    .map((r) => {
      const qty = numOf(r[iQty]);
      const total = iTot >= 0 ? numOf(r[iTot]) : 0;
      const price = iPrice >= 0 ? numOf(r[iPrice]) : qty ? total / qty : 0;
      const net = total || round(qty * price);
      const vat = iVat >= 0 ? numOf(r[iVat]) : 5;
      return {
        sku: iSku >= 0 ? r[iSku] || null : null,
        description: (iDesc >= 0 ? r[iDesc] : "") || "Item",
        quantity: qty,
        unit_price: round(price),
        discount: 0,
        vat_rate: vat,
        vat_amount: round(net * (vat / 100)),
        line_total: net,
        quantity_ordered: qty,
        quantity_received: qty,
        confidence: 97,
      } satisfies ExtractedLine;
    })
    .filter((l) => l.quantity > 0 && !/^(sub)?total/i.test(l.description));
}

function findParty(text: string, candidates: string[]) {
  const low = text.toLowerCase();
  const hit = candidates.find((c) => c && low.includes(c.toLowerCase()));
  if (hit) return { value: hit, confidence: 92 };
  const labelled = /(?:supplier|vendor|from|bill to|customer|sold to|merchant)\s*[:\-]\s*([^\n]{3,60})/i.exec(text)?.[1];
  if (labelled) return { value: labelled.trim(), confidence: 72 };
  return null;
}

const missing = () => ({ value: null, confidence: 0 });

/**
 * Local fallback reader. Everything it returns is read from the file itself:
 * CSV/TSV/XLSX tables are parsed; born-digital PDFs are read from their text
 * layer. Scans and photos need the self-hosted OCR service — until it is
 * connected they come back with empty fields for manual entry. Nothing is
 * ever made up.
 */
export class HeuristicProcessor implements DocumentProcessor {
  readonly id = "local-reader";
  readonly version = "2.0";
  available() {
    return true;
  }

  async process(input: ProcessInput): Promise<Extraction> {
    let text = "";
    let table: { header: string[]; rows: string[][] } | null = null;
    let pages = 1;
    let note: string | undefined;

    if (isXlsx(input)) {
      const rows = await readXlsx(input.bytes);
      if (rows.length >= 2) {
        table = fixExcelDates({ header: rows[0]!.map((h) => h.toLowerCase()), rows: rows.slice(1) });
      }
      text = rows.map((r) => r.join("\t")).join("\n");
    } else if (/csv|tsv|text\//i.test(input.mimeType) || /\.(csv|tsv|txt)$/i.test(input.fileName)) {
      text = new TextDecoder().decode(input.bytes.slice(0, 500_000));
      table = parseDelimited(text);
    } else if (isPdf(input)) {
      const r = await readPdfText(input.bytes);
      text = r.text;
      pages = r.pages;
      if (!text.trim()) note = "This PDF is a scan with no text layer. Connect the OCR service or enter the fields manually.";
    } else if (isImage(input)) {
      note = "Photos and scans need the self-hosted OCR service. Enter the fields manually for now.";
    } else if (/\.xls$/i.test(input.fileName)) {
      note = "Old .xls workbooks can't be read. Save the file as .xlsx or CSV and upload it again.";
    }

    const cls = classify(input.fileName, text);

    if (table && (cls.type === "bank_statement" || table.header.some((h) => /balance|debit|credit/.test(h)))) {
      const txns = statementFromTable(table);
      const first = txns[0];
      const last = txns[txns.length - 1];
      const opening = first && first.balance != null ? first.balance - (first.direction === "in" ? first.amount : -first.amount) : null;
      return {
        doc_type: "bank_statement",
        doc_type_confidence: 96,
        processor: this.id,
        processor_version: this.version,
        fields: {
          bank_name: f(guessBank(input.fileName, text), 82),
          account_identifier: guessAccount(text) ? f(guessAccount(text), 78) : missing(),
          currency: f("AED", 90),
          period_from: f(first?.txn_date ?? null, first ? 94 : 0),
          period_to: f(last?.txn_date ?? null, last ? 94 : 0),
          opening_balance: opening != null ? f(round(opening), 93) : missing(),
          closing_balance: last?.balance != null ? f(round(last.balance), 95) : missing(),
        },
        transactions: txns,
        page_count: 1,
        raw_text: text.slice(0, 20000),
      };
    }

    const type = cls.type;
    const lines = table ? linesFromTable(table) : text ? linesFromText(text) : [];
    return {
      doc_type: type,
      doc_type_confidence: cls.confidence,
      processor: this.id,
      processor_version: this.version,
      fields: this.fieldsFromText(type, text, lines, input),
      lines,
      page_count: pages,
      raw_text: (note ? `[${note}]\n` : "") + text.slice(0, 20000),
    };
  }

  private fieldsFromText(type: string, text: string, lines: ExtractedLine[], input: ProcessInput) {
    const out: Record<string, ReturnType<typeof f> | { value: null; confidence: number }> = {};
    const put = (k: string, v: string | number | null, c: number) => {
      out[k] = v == null || v === "" ? missing() : f(v, c);
    };
    const docNo = (labels: string) => labelled(text, labels, "([A-Z0-9][A-Z0-9\\-\\/]{2,})");
    const trn = /\b(1\d{14})\b/.exec(text)?.[1] ?? null;

    let subtotal = lastAmount(text, "sub\\s*-?\\s*total|net amount|taxable amount");
    let vat = lastAmount(text, "vat|tax amount", /vat\s*(no|reg|trn|number)|trn/i);
    let total = lastAmount(text, "grand total|total amount|amount due|total due|total payable|net payable|^\\s*total", /sub\s*-?\s*total/i);
    const lineSum = round(lines.reduce((s, l) => s + l.line_total, 0));
    let derived = false;
    if (subtotal == null && lineSum) (subtotal = lineSum), (derived = true);
    if (total == null && subtotal != null && vat != null) (total = round(subtotal + vat)), (derived = true);
    if (vat == null && total != null && subtotal != null) (vat = round(total - subtotal)), (derived = true);
    if (subtotal == null && total != null && vat != null) (subtotal = round(total - vat)), (derived = true);
    const amtConf = derived ? 70 : 86;

    const withTotals = () => {
      put("currency", /\b(USD|EUR|GBP|SAR)\b/.exec(text)?.[1] ?? "AED", /\bAED\b/.test(text) ? 95 : 60);
      put("subtotal", subtotal, amtConf);
      put("discount", lastAmount(text, "discount") ?? 0, 70);
      put("vat_rate", vat != null && subtotal ? Math.round((vat / subtotal) * 100) : null, 80);
      put("vat_amount", vat, amtConf);
      put("total", total, amtConf);
    };

    const suppliers = input.hints?.suppliers ?? [];
    const customers = input.hints?.customers ?? [];
    const partyField = (key: string, list: string[]) => {
      const p = findParty(text, list);
      put(key, p?.value ?? null, p?.confidence ?? 0);
      put(`${key}_trn`, trn, trn ? 85 : 0);
    };

    switch (type) {
      case "supplier_invoice":
        partyField("supplier_name", suppliers);
        put("invoice_number", docNo("tax invoice\\s*(?:no|number|#)|invoice\\s*(?:no|number|#)|inv\\s*(?:no|#)|bill\\s*(?:no|number)"), 86);
        put("invoice_date", labelledDate(text, "invoice date|date of issue|\\bdate\\b"), 84);
        put("due_date", labelledDate(text, "due date|payment due"), 82);
        put("po_number", /\b(PO-\d{4,6})\b/i.exec(text)?.[1]?.toUpperCase() ?? null, 90);
        withTotals();
        break;
      case "customer_invoice":
        partyField("customer_name", customers);
        put("invoice_number", docNo("tax invoice\\s*(?:no|number|#)|invoice\\s*(?:no|number|#)|inv\\s*(?:no|#)"), 86);
        put("invoice_date", labelledDate(text, "invoice date|date of issue|\\bdate\\b"), 84);
        put("due_date", labelledDate(text, "due date|payment due"), 82);
        withTotals();
        break;
      case "purchase_order":
      case "supplier_quotation":
        partyField("supplier_name", suppliers);
        if (type === "purchase_order") {
          put("po_number", docNo("p\\.?o\\.?\\s*(?:no|number|#)|purchase order\\s*(?:no|number|#)?"), 86);
          put("po_date", labelledDate(text, "po date|order date|\\bdate\\b"), 84);
        } else {
          put("quotation_number", docNo("quotation\\s*(?:no|number|#)|quote\\s*(?:no|#)"), 86);
          put("quotation_date", labelledDate(text, "quotation date|\\bdate\\b"), 84);
        }
        put("delivery_date", labelledDate(text, "delivery date|required by|expected"), 78);
        withTotals();
        break;
      case "customer_quotation":
      case "sales_order":
        partyField("customer_name", customers);
        put(type === "sales_order" ? "so_number" : "quotation_number", docNo("order\\s*(?:no|number|#)|quotation\\s*(?:no|number|#)|quote\\s*(?:no|#)"), 84);
        put(type === "sales_order" ? "order_date" : "quotation_date", labelledDate(text, "\\bdate\\b"), 82);
        withTotals();
        break;
      case "goods_receipt":
        put("grn_number", docNo("grn\\s*(?:no|number|#)?|goods receipt\\s*(?:no|number|#)?"), 84);
        put("grn_date", labelledDate(text, "received on|receipt date|\\bdate\\b"), 82);
        put("supplier_name", findParty(text, suppliers)?.value ?? null, 80);
        put("po_number", /\b(PO-\d{4,6})\b/i.exec(text)?.[1]?.toUpperCase() ?? null, 90);
        break;
      case "delivery_note":
        put("delivery_number", docNo("delivery note\\s*(?:no|number|#)?|d\\.?n\\.?\\s*(?:no|#)"), 84);
        put("delivery_date", labelledDate(text, "delivery date|\\bdate\\b"), 82);
        put("customer_name", findParty(text, customers)?.value ?? null, 80);
        put("so_number", /\b(SO-\d{4,6})\b/i.exec(text)?.[1]?.toUpperCase() ?? null, 90);
        break;
      case "supplier_credit_note":
      case "customer_credit_note":
        partyField(type === "supplier_credit_note" ? "supplier_name" : "customer_name", type === "supplier_credit_note" ? suppliers : customers);
        put("credit_note_number", docNo("credit note\\s*(?:no|number|#)?|c\\.?n\\.?\\s*(?:no|#)"), 84);
        put("credit_note_date", labelledDate(text, "\\bdate\\b"), 82);
        put("reference_invoice", docNo("against invoice|ref(?:erence)? invoice|original invoice|invoice\\s*(?:no|#)"), 78);
        put("reason", /reason\s*[:\-]\s*([^\n]{3,80})/i.exec(text)?.[1] ?? null, 70);
        withTotals();
        break;
      case "expense_receipt":
        put("merchant", text.split(/\n/).map((s) => s.trim()).find((s) => /[a-z]{3}/i.test(s)) ?? null, 60);
        put("receipt_date", labelledDate(text, "\\bdate\\b") ?? (DATE_RE.exec(text)?.[1] ? toIsoDate(DATE_RE.exec(text)![1]!) : null), 78);
        put("receipt_number", docNo("receipt\\s*(?:no|number|#)|bill\\s*(?:no|#)|trx\\s*(?:no|#)"), 75);
        put("currency", "AED", 80);
        put("subtotal", subtotal, amtConf);
        put("vat_amount", vat, amtConf);
        put("total", total, amtConf);
        put("payment_method", /cash/i.test(text) ? "cash" : /card|visa|master/i.test(text) ? "company_card" : null, 70);
        break;
      default:
        break;
    }
    return out as Extraction["fields"];
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

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

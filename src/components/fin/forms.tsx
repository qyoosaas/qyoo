import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { useTable } from "@/lib/fin-data";
import { actions, useAction, upsertRow, deleteRow, isoToday, type LineInput } from "@/lib/fin-actions";

/* ---------- primitives ---------- */

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="label-xs block">{label}</span>
      {children}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-8 w-full rounded-sm border border-input bg-background px-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  busy,
  wide,
  extra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  wide?: boolean;
  extra?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          {description ? <DialogDescription className="text-xs">{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">{extra}</div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Working…" : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription className="text-xs">{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------- line items ---------- */

type Line = LineInput & { key: number };
const newLine = (n: number): Line => ({ key: n, product_id: "", description: "", quantity: 1, unit_price: 0, discount: 0, vat_rate: 0.05 });

export function LineItemsEditor({
  lines,
  onChange,
  priceField,
  showDiscount,
}: {
  lines: Line[];
  onChange: (l: Line[]) => void;
  priceField: "selling_price" | "cost";
  showDiscount?: boolean;
}) {
  const products = useTable<any>("products", ["form"], (q: any) => q.order("sku"));
  const upd = (key: number, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const totals = useMemo(() => {
    let sub = 0,
      disc = 0,
      vat = 0;
    lines.forEach((l) => {
      const gross = l.quantity * l.unit_price;
      const net = gross - (l.discount ?? 0);
      sub += gross;
      disc += l.discount ?? 0;
      vat += net * (l.vat_rate ?? 0.05);
    });
    return { sub, disc, vat, total: sub - disc + vat };
  }, [lines]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-secondary/60 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-normal">Product</th>
              <th className="px-2 py-1.5 font-normal">Description</th>
              <th className="px-2 py-1.5 text-right font-normal">Qty</th>
              <th className="px-2 py-1.5 text-right font-normal">Unit price</th>
              {showDiscount ? <th className="px-2 py-1.5 text-right font-normal">Discount</th> : null}
              <th className="px-2 py-1.5 text-right font-normal">VAT</th>
              <th className="px-2 py-1.5 text-right font-normal">Line</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="w-[180px] px-1 py-1">
                  <NativeSelect
                    value={l.product_id ?? ""}
                    onChange={(v) => {
                      const p = (products.data ?? []).find((x: any) => x.id === v);
                      upd(l.key, {
                        product_id: v,
                        description: p ? p.name : l.description,
                        unit_price: p ? Number(p[priceField]) : l.unit_price,
                        vat_rate: p ? Number(p.vat_rate) : l.vat_rate,
                      });
                    }}
                    className="h-7 text-[12px]"
                  >
                    <option value="">Free text</option>
                    {(products.data ?? []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-1 py-1">
                  <Input value={l.description ?? ""} onChange={(e) => upd(l.key, { description: e.target.value })} className="h-7 text-[12px]" />
                </td>
                <td className="w-[70px] px-1 py-1">
                  <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => upd(l.key, { quantity: Number(e.target.value) })} className="num h-7 text-right text-[12px]" />
                </td>
                <td className="w-[100px] px-1 py-1">
                  <Input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: Number(e.target.value) })} className="num h-7 text-right text-[12px]" />
                </td>
                {showDiscount ? (
                  <td className="w-[90px] px-1 py-1">
                    <Input type="number" min={0} step="0.01" value={l.discount ?? 0} onChange={(e) => upd(l.key, { discount: Number(e.target.value) })} className="num h-7 text-right text-[12px]" />
                  </td>
                ) : null}
                <td className="w-[70px] px-1 py-1">
                  <NativeSelect value={String(l.vat_rate ?? 0.05)} onChange={(v) => upd(l.key, { vat_rate: Number(v) })} className="h-7 text-[12px]">
                    <option value="0.05">5%</option>
                    <option value="0">0%</option>
                  </NativeSelect>
                </td>
                <td className="num px-2 py-1 text-right">{money(l.quantity * l.unit_price - (l.discount ?? 0))}</td>
                <td className="w-8 px-1 py-1">
                  <button type="button" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-critical" aria-label="Remove line">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-start justify-between">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, newLine(Date.now())])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add line
        </Button>
        <dl className="num grid grid-cols-[auto_110px] gap-x-4 gap-y-0.5 text-right text-[12px]">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{money(totals.sub)}</dd>
          {showDiscount ? (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd>−{money(totals.disc)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">VAT</dt>
          <dd>{money(totals.vat)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="font-medium">{money(totals.total)}</dd>
        </dl>
      </div>
    </div>
  );
}

/* ---------- document dialog (invoice / bill / PO) ---------- */

export function DocumentDialog({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: "invoice" | "bill" | "po";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const isSales = kind === "invoice";
  const parties = useTable<any>(isSales ? "customers" : "suppliers", ["form"], (q: any) => q.order("name"));
  const pos = useTable<any>("purchase_orders", ["form"], (q: any) => q.in("status", ["confirmed", "draft"]).order("order_date", { ascending: false }));
  const [party, setParty] = useState("");
  const [date, setDate] = useState(isoToday());
  const [due, setDue] = useState("");
  const [ref, setRef] = useState("");
  const [po, setPo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine(1)]);

  useEffect(() => {
    if (open) {
      setParty("");
      setDate(isoToday());
      setDue("");
      setRef("");
      setPo("");
      setNotes("");
      setLines([newLine(1)]);
    }
  }, [open]);

  const titles = { invoice: "New sales invoice", bill: "New supplier bill", po: "New purchase order" };
  const descs = {
    invoice: "Posted immediately: receivable, revenue, VAT, COGS and stock update in one step.",
    bill: "Posted immediately: payable, VAT input and raw-material stock. Linking a PO runs the three-way match.",
    po: "Creates a confirmed order. Bills raised against it are matched automatically.",
  };

  const mut = useAction(
    async (post: boolean) => {
      if (!party) throw new Error(isSales ? "Choose a customer" : "Choose a supplier");
      const items = lines.filter((l) => l.quantity > 0).map(({ key: _k, ...l }) => ({ ...l, product_id: l.product_id || null }));
      if (kind === "invoice") return actions.createInvoice({ customer_id: party, invoice_date: date, due_date: due || null, items, notes, post });
      if (kind === "bill") return actions.createSupplierBill({ supplier_id: party, bill_date: date, due_date: due || null, items, supplier_ref: ref, purchase_order_id: po || null });
      return actions.createPurchaseOrder({ supplier_id: party, order_date: date, expected_date: due || null, items });
    },
    {
      success: `${titles[kind].replace("New ", "")} created and posted`,
      onSuccess: (id) => {
        onOpenChange(false);
        onCreated?.(id);
      },
    },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titles[kind]}
      description={descs[kind]}
      onSubmit={() => mut.mutate(true)}
      submitLabel={kind === "po" ? "Create order" : "Create & post"}
      busy={mut.isPending}
      wide
      extra={
        kind === "invoice" ? (
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => mut.mutate(false)} disabled={mut.isPending}>
            Save as draft instead
          </button>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={isSales ? "Customer" : "Supplier"} className="sm:col-span-2">
          <NativeSelect value={party} onChange={setParty}>
            <option value="">Select…</option>
            {(parties.data ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={kind === "po" ? "Order date" : "Date"}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label={kind === "po" ? "Expected" : "Due (blank = terms)"}>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 text-[13px]" />
        </Field>
        {kind === "bill" ? (
          <>
            <Field label="Supplier reference" className="sm:col-span-2">
              <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-8 text-[13px]" placeholder="Supplier's invoice no." />
            </Field>
            <Field label="Against purchase order" className="sm:col-span-2">
              <NativeSelect value={po} onChange={setPo}>
                <option value="">None</option>
                {(pos.data ?? [])
                  .filter((o: any) => !party || o.supplier_id === party)
                  .map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {money(o.total)}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </>
        ) : null}
      </div>
      <LineItemsEditor lines={lines} onChange={setLines} priceField={isSales ? "selling_price" : "cost"} showDiscount={isSales} />
      {kind === "invoice" ? (
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-[13px]" />
        </Field>
      ) : null}
    </FormDialog>
  );
}

/* ---------- payment dialog ---------- */

export function PaymentDialog({
  doc,
  kind,
  onOpenChange,
}: {
  doc: any | null;
  kind: "invoice" | "bill";
  onOpenChange: (v: boolean) => void;
}) {
  const banks = useTable<any>("bank_accounts", ["form"], (q: any) => q.order("name"));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoToday());
  const [bank, setBank] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [ref, setRef] = useState("");
  useEffect(() => {
    if (doc) {
      setAmount(String(Number(doc.balance)));
      setDate(isoToday());
      setRef("");
    }
  }, [doc]);

  const mut = useAction(
    async () => {
      const a = Number(amount);
      if (!(a > 0)) throw new Error("Enter an amount");
      return kind === "invoice"
        ? actions.recordCustomerPayment({ invoice_id: doc.id, amount: a, date, method, bank_account_id: bank || null, reference: ref })
        : actions.recordSupplierPayment({ bill_id: doc.id, amount: a, date, method, bank_account_id: bank || null, reference: ref });
    },
    { success: kind === "invoice" ? "Receipt recorded and matched" : "Payment recorded and matched", onSuccess: () => onOpenChange(false) },
  );

  const short = doc ? Number(doc.balance) - Number(amount || 0) : 0;

  return (
    <FormDialog
      open={!!doc}
      onOpenChange={onOpenChange}
      title={kind === "invoice" ? `Record receipt · ${doc?.number ?? ""}` : `Pay bill · ${doc?.number ?? ""}`}
      description={`Open balance ${money(doc?.balance, true)}. A matched bank line and ledger entry are written automatically.`}
      onSubmit={() => mut.mutate()}
      submitLabel={kind === "invoice" ? "Record receipt" : "Record payment"}
      busy={mut.isPending}
      extra={
        short > 0.005 ? (
          <span>
            Short by {money(short)} — FIN absorbs it if within tolerance, otherwise raises an exception.
          </span>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (AED)">
          <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="num h-8 text-[13px]" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label="Bank account">
          <NativeSelect value={bank} onChange={setBank}>
            <option value="">Default</option>
            {(banks.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.bank_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Method">
          <NativeSelect value={method} onChange={setMethod}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
          </NativeSelect>
        </Field>
        <Field label="Reference" className="sm:col-span-2">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-8 text-[13px]" placeholder={doc?.number} />
        </Field>
      </div>
    </FormDialog>
  );
}

/* ---------- expense dialog ---------- */

export function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const cats = useTable<any>("expense_categories", ["form"], (q: any) => q.order("name"));
  const banks = useTable<any>("bank_accounts", ["form"], (q: any) => q.order("name"));
  const [f, setF] = useState({ merchant: "", date: isoToday(), gross: "", category_id: "", employee: "", method: "company_card", has_document: false, project: "", bank: "" });
  useEffect(() => {
    if (open) setF({ merchant: "", date: isoToday(), gross: "", category_id: "", employee: "", method: "company_card", has_document: false, project: "", bank: "" });
  }, [open]);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));
  const gross = Number(f.gross || 0);
  const net = gross / 1.05;

  const mut = useAction(
    async () => {
      if (!f.merchant.trim()) throw new Error("Enter a merchant");
      if (!(gross > 0)) throw new Error("Enter the amount paid");
      return actions.createExpense({
        merchant: f.merchant.trim(),
        date: f.date,
        gross,
        category_id: f.category_id || null,
        employee: f.employee || undefined,
        method: f.method,
        has_document: f.has_document,
        project: f.project || undefined,
        bank_account_id: f.bank || null,
      });
    },
    { success: "Expense captured, VAT split and posted", onSuccess: () => onOpenChange(false) },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record expense"
      description="Enter the amount paid including VAT. FIN splits the recoverable VAT, posts to the ledger and writes the bank line."
      onSubmit={() => mut.mutate()}
      submitLabel="Record & post"
      busy={mut.isPending}
      extra={gross > 0 ? `Net ${money(net)} · VAT ${money(gross - net)}` : null}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Merchant" className="sm:col-span-2">
          <Input value={f.merchant} onChange={(e) => set("merchant", e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label="Amount paid (incl. VAT)">
          <Input type="number" step="0.01" min={0} value={f.gross} onChange={(e) => set("gross", e.target.value)} className="num h-8 text-[13px]" />
        </Field>
        <Field label="Date">
          <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label="Category">
          <NativeSelect value={f.category_id} onChange={(v) => set("category_id", v)}>
            <option value="">Auto (Other operating)</option>
            {(cats.data ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Paid by">
          <NativeSelect value={f.method} onChange={(v) => set("method", v)}>
            <option value="company_card">Company card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Petty cash</option>
            <option value="personal">Employee (reimburse)</option>
          </NativeSelect>
        </Field>
        <Field label="Employee">
          <Input value={f.employee} onChange={(e) => set("employee", e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label="Project / cost centre">
          <Input value={f.project} onChange={(e) => set("project", e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label="Bank account">
          <NativeSelect value={f.bank} onChange={(v) => set("bank", v)}>
            <option value="">Default</option>
            {(banks.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 pt-5 text-[13px]">
          <Checkbox checked={f.has_document} onCheckedChange={(v) => set("has_document", !!v)} />
          Receipt attached
        </label>
      </div>
    </FormDialog>
  );
}

/* ---------- generic entity (master data) dialog ---------- */

export type EntityField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  span?: 2;
  required?: boolean;
};

export function EntityDialog({
  table,
  title,
  fields,
  row,
  onOpenChange,
}: {
  table: string;
  title: string;
  fields: EntityField[];
  row: Record<string, any> | null | undefined; // null = closed, {} = new
  onOpenChange: (v: boolean) => void;
}) {
  const [f, setF] = useState<Record<string, any>>({});
  useEffect(() => {
    if (row) setF(row);
  }, [row]);
  const mut = useAction(
    async () => {
      for (const fld of fields) if (fld.required && !String(f[fld.key] ?? "").trim()) throw new Error(`${fld.label} is required`);
      const payload: Record<string, unknown> = {};
      fields.forEach((fld) => {
        const v = f[fld.key];
        payload[fld.key] = fld.type === "number" ? Number(v || 0) : v === "" ? null : v;
      });
      if (f.id) payload.id = f.id;
      await upsertRow(table, payload);
    },
    { success: f.id ? `${title} updated` : `${title} created`, onSuccess: () => onOpenChange(false) },
  );
  return (
    <FormDialog open={!!row} onOpenChange={onOpenChange} title={f.id ? `Edit ${title.toLowerCase()}` : `New ${title.toLowerCase()}`} onSubmit={() => mut.mutate()} busy={mut.isPending}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((fld) => (
          <Field key={fld.key} label={fld.label} className={fld.span === 2 ? "sm:col-span-2" : undefined}>
            {fld.type === "select" ? (
              <NativeSelect value={String(f[fld.key] ?? "")} onChange={(v) => setF((s) => ({ ...s, [fld.key]: v }))}>
                {(fld.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                type={fld.type === "number" ? "number" : "text"}
                step="any"
                value={f[fld.key] ?? ""}
                onChange={(e) => setF((s) => ({ ...s, [fld.key]: e.target.value }))}
                className={cn("h-8 text-[13px]", fld.type === "number" && "num")}
              />
            )}
          </Field>
        ))}
      </div>
    </FormDialog>
  );
}

/** Hook: delete a master-data row with confirmation. */
export function useDeleteRow(table: string, label: string) {
  const [target, setTarget] = useState<any | null>(null);
  const mut = useAction((id: string) => deleteRow(table, id), { success: `${label} deleted`, onSuccess: () => setTarget(null) });
  const dialog = (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(v) => !v && setTarget(null)}
      title={`Delete ${label.toLowerCase()}?`}
      description={`${target?.name ?? target?.sku ?? ""} will be removed. Records that already reference it will block the delete.`}
      confirmLabel="Delete"
      onConfirm={() => target && mut.mutate(target.id)}
    />
  );
  return { askDelete: setTarget, dialog };
}

/** Hook: void a posted document with confirmation. */
export function useVoid() {
  const [target, setTarget] = useState<{ type: "invoice" | "supplier_bill" | "expense" | "purchase_order"; id: string; label: string } | null>(null);
  const mut = useAction((t: NonNullable<typeof target>) => actions.voidDocument(t.type, t.id), { success: "Voided — reversing entry posted", onSuccess: () => setTarget(null) });
  const dialog = (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(v) => !v && setTarget(null)}
      title={`Void ${target?.label ?? ""}?`}
      description="A reversing journal is posted, balances restored and stock returned. Open exceptions on it are dismissed. This is audited."
      confirmLabel="Void"
      onConfirm={() => target && mut.mutate(target)}
    />
  );
  return { askVoid: setTarget, dialog };
}

/* ---------- row action button ---------- */
export function RowAction({ onClick, children, tone }: { onClick: () => void; children: ReactNode; tone?: "danger" }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("rounded-sm px-1.5 py-0.5 text-[11px] hover:bg-secondary", tone === "danger" ? "text-critical" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}

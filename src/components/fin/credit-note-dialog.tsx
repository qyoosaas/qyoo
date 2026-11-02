import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTable } from "@/lib/fin-data";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import { money } from "@/lib/format";
import { Field, FormDialog, LineItemsEditor, NativeSelect, newLine, type Line } from "./forms";

/** Sales credit note (to a customer) or purchase debit note (to a supplier). Posts on save. */
export function CreditNoteDialog({
  kind,
  open,
  onOpenChange,
  preset,
  onCreated,
}: {
  kind: "sales_credit" | "purchase_debit";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: { party_id: string; doc_id: string } | null;
  onCreated?: (id: string) => void;
}) {
  const sales = kind === "sales_credit";
  const parties = useTable<any>(sales ? "customers" : "suppliers", ["form"], (q: any) => q.order("name"));
  const docs = useTable<any>(sales ? "invoices" : "supplier_bills", ["cn-form"], (q: any) =>
    q.neq("status", "cancelled").neq("status", "draft").order(sales ? "invoice_date" : "bill_date", { ascending: false }).limit(300),
  );
  const [party, setParty] = useState("");
  const [doc, setDoc] = useState("");
  const [date, setDate] = useState(isoToday());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine(1)]);

  useEffect(() => {
    if (open) {
      setParty(preset?.party_id ?? "");
      setDoc(preset?.doc_id ?? "");
      setDate(isoToday());
      setReason("");
      setLines([newLine(1)]);
    }
  }, [open, preset]);

  const partyKey = sales ? "customer_id" : "supplier_id";
  const mut = useAction(
    async () => {
      if (!party) throw new Error(sales ? "Choose a customer" : "Choose a supplier");
      const items = lines.filter((l) => l.quantity > 0).map(({ key: _k, ...l }) => ({ ...l, product_id: l.product_id || null }));
      return actions.createCreditNote({ kind, party_id: party, doc_id: doc || null, date, reason, items });
    },
    {
      success: sales ? "Credit note posted" : "Debit note posted",
      onSuccess: (id) => {
        onOpenChange(false);
        onCreated?.(id as string);
      },
    },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={sales ? "New credit note" : "New debit note"}
      description={
        sales
          ? "Reduces the customer's balance and reverses revenue and output VAT. If linked, it is applied to the invoice."
          : "Reduces what you owe the supplier and reverses purchases and input VAT. If linked, it is applied to the bill."
      }
      onSubmit={() => mut.mutate(undefined as never)}
      submitLabel="Create & post"
      busy={mut.isPending}
      wide
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={sales ? "Customer" : "Supplier"} className="sm:col-span-2">
          <NativeSelect value={party} onChange={(v) => { setParty(v); setDoc(""); }}>
            <option value="">Select…</option>
            {(parties.data ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-[13px]" />
        </Field>
        <Field label={sales ? "Against invoice" : "Against bill"}>
          <NativeSelect value={doc} onChange={setDoc}>
            <option value="">Not linked</option>
            {(docs.data ?? [])
              .filter((d: any) => !party || d[partyKey] === party)
              .map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.number} · {money(d.balance)} open
                </option>
              ))}
          </NativeSelect>
        </Field>
      </div>
      <LineItemsEditor lines={lines} onChange={setLines} priceField={sales ? "selling_price" : "cost"} />
      <Field label="Reason">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="text-[13px]" placeholder="Returned goods, pricing error, damaged items…" />
      </Field>
    </FormDialog>
  );
}

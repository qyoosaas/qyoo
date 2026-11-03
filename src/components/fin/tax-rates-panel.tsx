import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTable } from "@/lib/fin-data";
import { COMPANY_ID } from "@/lib/format";
import { Panel, Pill } from "./primitives";
import { Field, FormDialog, RowAction } from "./forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Draft = { id?: string; code: string; name: string; rate: string; is_default: boolean };

/** Editable VAT rates. Changing a rate affects new documents only; posted entries are untouched. */
export function TaxRatesPanel() {
  const qc = useQueryClient();
  const tax = useTable<any>("tax_rates", ["st"], (q: any) => q.order("code"));
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    const rate = Number(edit.rate);
    if (!edit.code.trim() || !edit.name.trim()) return toast.error("Enter a code and a name");
    if (!(rate >= 0 && rate <= 100)) return toast.error("Rate must be between 0 and 100%");
    setBusy(true);
    const db = supabase as any;
    if (edit.is_default) await db.from("tax_rates").update({ is_default: false }).eq("company_id", COMPANY_ID).neq("id", edit.id ?? "00000000-0000-0000-0000-000000000000");
    const row = { company_id: COMPANY_ID, code: edit.code.trim().toUpperCase(), name: edit.name.trim(), rate: rate / 100, kind: "vat", is_default: edit.is_default };
    const { error } = edit.id ? await db.from("tax_rates").update(row).eq("id", edit.id) : await db.from("tax_rates").insert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["tax_rates"] });
    toast.success("VAT rate saved");
    setEdit(null);
  };

  return (
    <Panel
      title="VAT rates"
      actions={
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setEdit({ code: "", name: "", rate: "0", is_default: false })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add rate
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {(tax.data ?? []).map((t: any) => (
          <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
            <div>
              <span className="num text-muted-foreground">{t.code}</span> {t.name}
            </div>
            <div className="flex items-center gap-2">
              <span className="num">{+(Number(t.rate) * 100).toFixed(2)}%</span>
              {t.is_default ? <Pill tone="signal">Default</Pill> : null}
              <RowAction onClick={() => setEdit({ id: t.id, code: t.code, name: t.name, rate: String(+(Number(t.rate) * 100).toFixed(2)), is_default: t.is_default })}>Edit</RowAction>
            </div>
          </li>
        ))}
      </ul>
      <FormDialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit?.id ? "Edit VAT rate" : "New VAT rate"}
        description="Used when recording expenses. Existing posted entries are not changed."
        onSubmit={save}
        busy={busy}
      >
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="h-8 text-[13px]" /></Field>
            <Field label="Rate (%)"><Input type="number" step="0.01" min={0} value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} className="num h-8 text-[13px]" /></Field>
            <Field label="Name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-8 text-[13px]" /></Field>
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={edit.is_default} onCheckedChange={(v) => setEdit({ ...edit, is_default: !!v })} /> Default rate
            </label>
          </div>
        ) : null}
      </FormDialog>
    </Panel>
  );
}

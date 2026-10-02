import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID, money, shortDate } from "@/lib/format";

type Hit = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  to: string;
  params?: Record<string, string>;
};

const COMMANDS: { label: string; to: string; hint: string; action?: string }[] = [
  { label: "Create invoice", to: "/sales", hint: "Sales", action: "new-invoice" },
  { label: "Create sales order", to: "/sales", hint: "Sales", action: "new-order" },
  { label: "Create purchase order", to: "/purchases", hint: "Purchases", action: "new-po" },
  { label: "Create supplier bill", to: "/purchases", hint: "Purchases", action: "new-bill" },
  { label: "Upload document", to: "/documents", hint: "Documents", action: "upload" },
  { label: "Record expense", to: "/expenses", hint: "Expenses", action: "new-expense" },
  { label: "Import bank statement", to: "/banking", hint: "Banking", action: "import" },
  { label: "Reconcile transactions", to: "/banking", hint: "Banking", action: "reconcile" },
  { label: "Find customer", to: "/sales", hint: "Sales" },
  { label: "Find supplier", to: "/purchases", hint: "Purchases" },
  { label: "Open Profit & Loss", to: "/reports", hint: "Reports" },
  { label: "Open cash forecast", to: "/fpa", hint: "FP&A" },
  { label: "Open Action Required", to: "/action-required", hint: "Exceptions" },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const like = `%${q}%`;
      const [inv, cus, sup, bill, bank, prod, doc, exc] = await Promise.all([
        supabase
          .from("invoices")
          .select("id,number,total,invoice_date,status")
          .eq("company_id", COMPANY_ID)
          .ilike("number", like)
          .limit(5),
        supabase
          .from("customers")
          .select("id,name,code")
          .eq("company_id", COMPANY_ID)
          .ilike("name", like)
          .limit(5),
        supabase
          .from("suppliers")
          .select("id,name,code")
          .eq("company_id", COMPANY_ID)
          .ilike("name", like)
          .limit(4),
        supabase
          .from("supplier_bills")
          .select("id,number,total,bill_date")
          .eq("company_id", COMPANY_ID)
          .ilike("number", like)
          .limit(4),
        supabase
          .from("bank_transactions")
          .select("id,description,amount,txn_date")
          .eq("company_id", COMPANY_ID)
          .ilike("description", like)
          .limit(4),
        supabase
          .from("products")
          .select("id,sku,name")
          .eq("company_id", COMPANY_ID)
          .or(`sku.ilike.${like},name.ilike.${like}`)
          .limit(4),
        supabase
          .from("documents")
          .select("id,name,category")
          .eq("company_id", COMPANY_ID)
          .ilike("name", like)
          .limit(4),
        supabase
          .from("exceptions")
          .select("id,code,title,status")
          .eq("company_id", COMPANY_ID)
          .or(`code.ilike.${like},title.ilike.${like}`)
          .limit(4),
      ]);

      if (cancelled) return;
      const out: Hit[] = [];
      (inv.data ?? []).forEach((r: any) =>
        out.push({
          id: r.id,
          kind: "Invoice",
          title: r.number,
          subtitle: `${money(r.total, true)} · ${shortDate(r.invoice_date)} · ${r.status}`,
          to: "/invoices/$id",
          params: { id: r.id },
        }),
      );
      (cus.data ?? []).forEach((r: any) =>
        out.push({
          id: r.id,
          kind: "Customer",
          title: r.name,
          subtitle: r.code ?? "Customer",
          to: "/sales",
        }),
      );
      (sup.data ?? []).forEach((r: any) =>
        out.push({ id: r.id, kind: "Supplier", title: r.name, subtitle: r.code, to: "/purchases" }),
      );
      (bill.data ?? []).forEach((r: any) =>
        out.push({
          id: r.id,
          kind: "Supplier bill",
          title: r.number,
          subtitle: `${money(r.total, true)} · ${shortDate(r.bill_date)}`,
          to: "/purchases",
        }),
      );
      (bank.data ?? []).forEach((r: any) =>
        out.push({
          id: r.id,
          kind: "Bank line",
          title: r.description.slice(0, 48),
          subtitle: `${money(r.amount, true)} · ${shortDate(r.txn_date)}`,
          to: "/banking",
        }),
      );
      (prod.data ?? []).forEach((r: any) =>
        out.push({ id: r.id, kind: "Product", title: `${r.sku} — ${r.name}`, subtitle: "Inventory", to: "/inventory" }),
      );
      (doc.data ?? []).forEach((r: any) =>
        out.push({ id: r.id, kind: "Document", title: r.name, subtitle: r.category, to: "/documents" }),
      );
      (exc.data ?? []).forEach((r: any) =>
        out.push({
          id: r.id,
          kind: "Exception",
          title: `${r.code} — ${r.title}`,
          subtitle: r.status,
          to: "/action-required",
        }),
      );
      setHits(out);
    };
    const t = setTimeout(run, 140);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  const go = (to: string, params?: Record<string, string>, action?: string) => {
    onOpenChange(false);
    navigate({ to, params, search: action ? { action } : {} } as never);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search everything, or run a command…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>No matches for “{term}”.</CommandEmpty>
        {hits.length > 0 ? (
          <>
            <CommandGroup heading="Results">
              {hits.map((h) => (
                <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id}`} onSelect={() => go(h.to, h.params)}>
                  <span className="w-[104px] shrink-0 text-[11px] text-muted-foreground">{h.kind}</span>
                  <span className="flex-1 truncate text-[13px]">{h.title}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{h.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        <CommandGroup heading="Commands">
          {COMMANDS.filter((c) => c.label.toLowerCase().includes(term.toLowerCase())).map((c) => (
            <CommandItem key={c.label} value={c.label} onSelect={() => go(c.to, undefined, c.action)}>
              <span className="flex-1 text-[13px]">{c.label}</span>
              <span className="text-[11px] text-muted-foreground">{c.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

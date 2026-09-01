import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, shortDate, titleCase, daysBetween } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Loading,
  TableShell,
  Th,
  Td,
  statusTone,
  AutomationNote,
} from "@/components/fin/primitives";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/invoices/$id")({
  head: () => ({
    meta: [
      { title: "Invoice · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Full invoice detail with lines, VAT treatment, receipts applied and the journal entry FIN posted to the general ledger.",
      },
      { property: "og:title", content: "Invoice detail · FIN" },
      { property: "og:description", content: "Document, ledger entry and audit trail in one view." },
    ],
  }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items, je, pays] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id),
        supabase.from("journal_entries").select("*").eq("ref_id", id),
        supabase.from("customer_payments").select("*").eq("invoice_id", id),
      ]);
      const entry = (je.data ?? [])[0];
      const lines = entry
        ? (await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", entry.id)).data
        : [];
      const customer = inv.data?.customer_id
        ? (await supabase.from("customers").select("*").eq("id", inv.data.customer_id).maybeSingle()).data
        : null;
      return {
        invoice: inv.data,
        items: items.data ?? [],
        entry,
        lines: lines ?? [],
        payments: pays.data ?? [],
        customer,
      };
    },
  });

  if (isLoading || !data?.invoice) return <Loading rows={8} />;
  const inv = data.invoice;
  const late = Number(inv.balance) > 0 && daysBetween(inv.due_date) > 0;

  return (
    <>
      <Link
        to="/sales"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Sales
      </Link>

      <PageHeader
        title={inv.number}
        subtitle={`${data.customer?.name ?? "Customer"} · issued ${shortDate(inv.invoice_date)} · due ${shortDate(inv.due_date)}`}
        actions={
          <Pill tone={statusTone(late ? "overdue" : inv.status)}>
            {titleCase(late ? "overdue" : inv.status)}
          </Pill>
        }
      />

      <AutomationNote>
        FIN generated this invoice from the sales order, applied 5% UAE VAT, posted revenue,
        receivable and VAT output to the ledger, and recognised {money(inv.cogs, true)} of cost of
        sales from weighted-average inventory — all without a human touch.
      </AutomationNote>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Invoice lines">
          <TableShell>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th right>Qty</Th>
                <Th right>Unit price</Th>
                <Th right>Discount</Th>
                <Th right>VAT</Th>
                <Th right>Line total</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l: any) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td right>{Number(l.quantity)}</Td>
                  <Td right>{money(l.unit_price)}</Td>
                  <Td right>{money(l.discount)}</Td>
                  <Td right>{(Number(l.vat_rate) * 100).toFixed(0)}%</Td>
                  <Td right>{money(l.line_total)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <dl className="ml-auto w-full max-w-[320px] space-y-1.5 px-4 py-4 text-[13px]">
            {[
              ["Subtotal", inv.subtotal],
              ["Discount", -Number(inv.discount)],
              ["VAT (5%)", inv.vat],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-muted-foreground">
                <dt>{label as string}</dt>
                <dd className="num">{money(value as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 font-medium">
              <dt>Total</dt>
              <dd className="num">{money(inv.total, true)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Paid</dt>
              <dd className="num">{money(inv.amount_paid)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Balance</dt>
              <dd className="num">{money(inv.balance, true)}</dd>
            </div>
          </dl>
        </Panel>

        <div className="space-y-4">
          <Panel title="Receipts applied">
            {data.payments.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-muted-foreground">No receipts yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.payments.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <div>
                      <div className="num font-medium">{p.number}</div>
                      <div className="text-xs text-muted-foreground">
                        {shortDate(p.payment_date)} · {titleCase(p.method)}
                      </div>
                    </div>
                    <span className="num">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Customer">
            <dl className="space-y-2 px-4 py-3.5 text-[13px]">
              {[
                ["Name", data.customer?.name],
                ["TRN", data.customer?.trn],
                ["Terms", `${data.customer?.payment_terms_days ?? 0} days`],
                ["Credit limit", money(data.customer?.credit_limit ?? 0, true)],
                ["Email", data.customer?.email],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k as string}</dt>
                  <dd className="truncate text-right">{(v as string) ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <Panel
        title="Journal entry"
        description={data.entry ? `${data.entry.number} · posted ${shortDate(data.entry.entry_date)}` : "Not yet posted"}
      >
        <TableShell>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Description</Th>
              <Th right>Debit</Th>
              <Th right>Credit</Th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l: any) => (
              <tr key={l.id}>
                <Td>
                  <span className="num text-muted-foreground">{l.account_code}</span> {l.account_name}
                </Td>
                <Td>{l.description}</Td>
                <Td right>{Number(l.debit) ? money(l.debit) : "—"}</Td>
                <Td right>{Number(l.credit) ? money(l.credit) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}

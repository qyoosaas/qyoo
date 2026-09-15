import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTable } from "@/lib/fin-data";
import { actions, useAction } from "@/lib/fin-actions";
import { money, shortDate, daysBetween, titleCase } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Metric,
  Loading,
  EmptyState,
  TableShell,
  Th,
  Td,
  statusTone,
  AutomationNote,
} from "@/components/fin/primitives";
import { DocumentDialog, PaymentDialog, EntityDialog, RowAction, useVoid, useDeleteRow, type EntityField } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/sales")({
  head: () => ({
    meta: [
      { title: "Sales · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Sales orders, invoices, receipts and receivables ageing for Al Noor Manufacturing — invoiced, posted and matched automatically.",
      },
      { property: "og:title", content: "Sales · FIN" },
      { property: "og:description", content: "Orders to cash, posted automatically." },
    ],
  }),
  component: Sales,
});

const TABS = ["Invoices", "Orders", "Delivery notes", "Receipts", "Customers", "Ageing"] as const;

const CUSTOMER_FIELDS: EntityField[] = [
  { key: "name", label: "Name", span: 2, required: true },
  { key: "code", label: "Code" },
  { key: "trn", label: "TRN" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "payment_terms_days", label: "Payment terms (days)", type: "number" },
  { key: "credit_limit", label: "Credit limit (AED)", type: "number" },
  { key: "address", label: "Address", span: 2 },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "on_hold", label: "On hold" },
      { value: "inactive", label: "Inactive" },
    ],
  },
];

function Sales() {
  const invoices = useTable<any>("invoices", ["s"], (q: any) => q.order("invoice_date", { ascending: false }).order("number", { ascending: false }));
  const orders = useTable<any>("sales_orders", ["s"], (q: any) => q.order("order_date", { ascending: false }));
  const payments = useTable<any>("customer_payments", ["s"], (q: any) => q.order("payment_date", { ascending: false }));
  const customers = useTable<any>("customers", ["s"], (q: any) => q.order("name"));
  const [tab, setTab] = useState<(typeof TABS)[number]>("Invoices");
  const [term, setTerm] = useState("");
  const [newInvoice, setNewInvoice] = useState(false);
  const [payDoc, setPayDoc] = useState<any | null>(null);
  const [custRow, setCustRow] = useState<any | null>(null);
  const { askVoid, dialog: voidDialog } = useVoid();
  const { askDelete, dialog: delDialog } = useDeleteRow("customers", "Customer");
  const postDraft = useAction((id: string) => actions.postDraftInvoice(id), { success: "Invoice posted" });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (customers.data ?? []).forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [customers.data]);

  const live = (invoices.data ?? []).filter((i: any) => i.status !== "cancelled");
  const revenue = live.reduce((s: number, i: any) => s + Number(i.subtotal) - Number(i.discount), 0);
  const ar = live.reduce((s: number, i: any) => s + Number(i.balance), 0);
  const overdue = live.filter((i: any) => Number(i.balance) > 0 && daysBetween(i.due_date, new Date()) > 0);
  const dso = revenue ? Math.round((ar / revenue) * 231) : 0;

  const ageing = useMemo(() => {
    const buckets = [
      { label: "Current", min: -9999, max: 0, total: 0 },
      { label: "1–30 days", min: 1, max: 30, total: 0 },
      { label: "31–60 days", min: 31, max: 60, total: 0 },
      { label: "61–90 days", min: 61, max: 90, total: 0 },
      { label: "90+ days", min: 91, max: 99999, total: 0 },
    ];
    live
      .filter((i: any) => Number(i.balance) > 0)
      .forEach((i: any) => {
        const d = daysBetween(i.due_date, new Date());
        const b = buckets.find((x) => d >= x.min && d <= x.max);
        if (b) b.total += Number(i.balance);
      });
    return buckets;
  }, [live]);

  const filter = (s: string) => s.toLowerCase().includes(term.toLowerCase());

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Order to cash — invoices raise, post and reconcile without intervention"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setCustRow({ status: "active", payment_terms_days: 30, credit_limit: 0 })}>
              New customer
            </Button>
            <Button size="sm" onClick={() => setNewInvoice(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New invoice
            </Button>
          </>
        }
      />

      <AutomationNote>
        {live.length} invoices raised this year; {(payments.data ?? []).length} receipts matched to them
        automatically. {overdue.length} invoices are past due and reflected in the exception queue.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue YTD" value={money(revenue, true)} hint="Net of discounts" />
        <Metric label="Receivables" value={money(ar, true)} hint={`${overdue.length} overdue invoices`} />
        <Metric label="Days sales outstanding" value={`${dso} days`} hint="Rolling estimate" />
        <Metric label="Active customers" value={String((customers.data ?? []).length)} hint="With trading history" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[13px]",
              tab === t ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {t}
          </button>
        ))}
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Filter…" className="ml-auto h-8 w-[220px] text-[13px]" />
      </div>

      {invoices.isLoading ? (
        <Loading rows={10} />
      ) : tab === "Invoices" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th right>Total</Th>
                <Th right>Balance</Th>
                <Th>Status</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? [])
                .filter((i: any) => filter(i.number) || filter(nameById.get(i.customer_id) ?? ""))
                .slice(0, 150)
                .map((i: any) => {
                  const late = Number(i.balance) > 0 && i.status !== "cancelled" && daysBetween(i.due_date, new Date()) > 0;
                  return (
                    <tr key={i.id} className="row-hover hover:bg-secondary/40">
                      <Td>
                        <Link to="/invoices/$id" params={{ id: i.id }} className="num font-medium underline-offset-4 hover:underline">
                          {i.number}
                        </Link>
                      </Td>
                      <Td>{nameById.get(i.customer_id) ?? "—"}</Td>
                      <Td>{shortDate(i.invoice_date)}</Td>
                      <Td>
                        <span className={late ? "text-critical" : undefined}>
                          {shortDate(i.due_date)}
                          {late ? ` · ${daysBetween(i.due_date, new Date())}d` : ""}
                        </span>
                      </Td>
                      <Td right>{money(i.total)}</Td>
                      <Td right>{money(i.balance)}</Td>
                      <Td>
                        <Pill tone={statusTone(late ? "overdue" : i.status)}>{titleCase(late ? "overdue" : i.status)}</Pill>
                      </Td>
                      <Td right>
                        <div className="flex justify-end gap-0.5">
                          {i.status === "draft" ? <RowAction onClick={() => postDraft.mutate(i.id)}>Post</RowAction> : null}
                          {Number(i.balance) > 0 && i.status !== "draft" && i.status !== "cancelled" ? (
                            <RowAction onClick={() => setPayDoc(i)}>Receive</RowAction>
                          ) : null}
                          {i.status !== "cancelled" ? (
                            <RowAction tone="danger" onClick={() => askVoid({ type: "invoice", id: i.id, label: i.number })}>
                              Void
                            </RowAction>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Orders" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Ordered</Th>
                <Th>Expected delivery</Th>
                <Th right>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? [])
                .filter((o: any) => filter(o.number) || filter(nameById.get(o.customer_id) ?? ""))
                .slice(0, 120)
                .map((o: any) => (
                  <tr key={o.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{o.number}</span>
                    </Td>
                    <Td>{nameById.get(o.customer_id) ?? "—"}</Td>
                    <Td>{shortDate(o.order_date)}</Td>
                    <Td>{shortDate(o.expected_delivery)}</Td>
                    <Td right>{money(o.total)}</Td>
                    <Td>
                      <Pill tone={statusTone(o.status)}>{titleCase(o.status)}</Pill>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Delivery notes" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Delivery note</Th>
                <Th>Customer</Th>
                <Th>Delivered</Th>
                <Th right>Cost value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(deliveries.data ?? [])
                .filter((d: any) => filter(d.number) || filter(nameById.get(d.customer_id) ?? ""))
                .slice(0, 120)
                .map((d: any) => (
                  <tr key={d.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{d.number}</span>
                    </Td>
                    <Td>{nameById.get(d.customer_id) ?? "—"}</Td>
                    <Td>{shortDate(d.delivery_date)}</Td>
                    <Td right>{money(d.total_value)}</Td>
                    <Td>
                      <Pill tone={statusTone(d.status)}>{titleCase(d.status)}</Pill>
                    </Td>
                  </tr>
                ))}
              {!(deliveries.data ?? []).length ? (
                <tr>
                  <Td className="text-muted-foreground">No delivery notes yet — deliver goods from a sales order.</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Receipts" ? (

        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Customer</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? [])
                .filter((p: any) => filter(p.number) || filter(nameById.get(p.customer_id) ?? ""))
                .slice(0, 120)
                .map((p: any) => (
                  <tr key={p.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{p.number}</span>
                    </Td>
                    <Td>{nameById.get(p.customer_id) ?? "—"}</Td>
                    <Td>{shortDate(p.payment_date)}</Td>
                    <Td>{titleCase(p.method)}</Td>
                    <Td>
                      <span className="num text-muted-foreground">{p.reference ?? "—"}</span>
                    </Td>
                    <Td right>{money(p.amount)}</Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Customers" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Code</Th>
                <Th>TRN</Th>
                <Th>Terms</Th>
                <Th right>Credit limit</Th>
                <Th right>Open balance</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(customers.data ?? [])
                .filter((c: any) => filter(c.name))
                .map((c: any) => {
                  const bal = live.filter((i: any) => i.customer_id === c.id).reduce((s: number, i: any) => s + Number(i.balance), 0);
                  return (
                    <tr key={c.id} className="row-hover hover:bg-secondary/40">
                      <Td>{c.name}</Td>
                      <Td>
                        <span className="num text-muted-foreground">{c.code}</span>
                      </Td>
                      <Td>
                        <span className="num text-muted-foreground">{c.trn ?? "—"}</span>
                      </Td>
                      <Td>{c.payment_terms_days} days</Td>
                      <Td right>{money(c.credit_limit)}</Td>
                      <Td right>
                        <span className={bal > Number(c.credit_limit) ? "text-critical" : undefined}>{money(bal)}</span>
                      </Td>
                      <Td right>
                        <div className="flex justify-end gap-0.5">
                          <RowAction onClick={() => setCustRow(c)}>Edit</RowAction>
                          <RowAction tone="danger" onClick={() => askDelete(c)}>
                            Delete
                          </RowAction>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        </Panel>
      ) : (
        <Panel title="Receivables ageing" description="Open balances by days past due">
          <div className="grid gap-px bg-border sm:grid-cols-5">
            {ageing.map((b) => (
              <div key={b.label} className="bg-card px-4 py-5">
                <div className="label-xs">{b.label}</div>
                <div className="num mt-2 text-[18px] font-medium">{money(b.total)}</div>
                <div className="mt-2 h-1 w-full bg-secondary">
                  <div className="h-1 bg-foreground" style={{ width: `${Math.min(100, (b.total / (ar || 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {ar === 0 ? <EmptyState title="No open receivables" /> : null}
        </Panel>
      )}

      <DocumentDialog kind="invoice" open={newInvoice} onOpenChange={setNewInvoice} />
      <PaymentDialog kind="invoice" doc={payDoc} onOpenChange={(v) => !v && setPayDoc(null)} />
      <EntityDialog table="customers" title="Customer" fields={CUSTOMER_FIELDS} row={custRow} onOpenChange={(v) => !v && setCustRow(null)} />
      {voidDialog}
      {delDialog}
    </>
  );
}

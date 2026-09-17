import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, num, shortDate, titleCase, longDate } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Metric,
  Loading,
  TableShell,
  Th,
  Td,
  statusTone,
  AutomationNote,
} from "@/components/fin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog, Field, ConfirmDialog, EditDocDialog } from "@/components/fin/forms";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import { ArrowLeft, Truck, ReceiptText, Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/sales_/$id")({
  head: () => ({
    meta: [
      { title: "Sales order · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Sales order detail with delivery notes, invoices raised, line-by-line delivered versus invoiced variance and full audit history.",
      },
      { property: "og:title", content: "Sales order · FIN" },
      { property: "og:description", content: "Order, delivery and invoice matched line by line." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesOrderDetail,
  errorComponent: () => (
    <Panel>
      <div className="p-6 text-[13px] text-muted-foreground">
        This sales order could not be loaded. Go back to Sales and try again.
      </div>
    </Panel>
  ),
  notFoundComponent: () => (
    <Panel>
      <div className="p-6 text-[13px] text-muted-foreground">Sales order not found.</div>
    </Panel>
  ),
});

function useRow<T = any>(key: unknown[], run: () => Promise<{ data: any; error: any }>) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await run();
      if (error) throw new Error(error.message);
      return data as T;
    },
  });
}

function SalesOrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [invoiceDate, setInvoiceDate] = useState(isoToday());
  const [dueDate, setDueDate] = useState("");

  const so = useRow<any>(["so", id], () => supabase.from("sales_orders").select("*").eq("id", id).maybeSingle() as any);
  const items = useRow<any[]>(["so_items", id], () =>
    supabase.from("sales_order_items").select("*").eq("sales_order_id", id) as any,
  );
  const customer = useQuery({
    queryKey: ["so_customer", so.data?.customer_id],
    enabled: !!so.data?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", so.data.customer_id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  const deliveries = useRow<any[]>(["so_deliveries", id], () =>
    (supabase as any).from("delivery_notes").select("*").eq("sales_order_id", id).order("delivery_date"),
  );
  const invoices = useRow<any[]>(["so_invoices", id], () =>
    supabase.from("invoices").select("*").eq("sales_order_id", id).order("invoice_date") as any,
  );
  const audit = useRow<any[]>(["so_audit", id], () =>
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }) as any,
  );
  const activity = useRow<any[]>(["so_activity", id], () =>
    supabase.from("activity_feed").select("*").eq("entity_id", id).order("created_at", { ascending: false }) as any,
  );
  const docs = useRow<any[]>(["so_docs", id], () =>
    supabase.from("document_links").select("*").eq("entity_id", id) as any,
  );

  const open = useQuery({ queryKey: ["so_open", id], queryFn: () => actions.soOpenLines(id) });
  const match = useQuery({ queryKey: ["so_match", id], queryFn: () => actions.soMatchLines(id) });

  const deliver = useAction(
    (lines: { sales_order_item_id: string; quantity: number }[]) =>
      actions.deliverGoods({ sales_order_id: id, date: isoToday(), lines }),
    {
      scope: "deliver_goods",
      success: "Delivery note posted — stock released and held until invoiced",
      onSuccess: () => {
        setDeliverOpen(false);
        setQty({});
      },
    },
  );

  const createInvoice = useAction(
    (p: { items: any[] }) =>
      actions.createInvoiceFromOrder({
        sales_order_id: id,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        items: p.items,
      }),
    {
      scope: "create_invoice_from_so",
      success: "Invoice posted — receivable, revenue, VAT and cost of sales in one entry",
      onSuccess: () => setInvoiceOpen(false),
    },
  );

  const deliveredValue = (deliveries.data ?? []).reduce((s, d: any) => s + Number(d.total_value), 0);
  const invoicedTotal = (invoices.data ?? [])
    .filter((i: any) => i.status !== "cancelled")
    .reduce((s, i: any) => s + Number(i.total), 0);
  const fullyDelivered = (open.data ?? []).every((l) => Number(l.open_quantity) <= 0.0001);
  const editable = (deliveries.data ?? []).length === 0 && (invoices.data ?? []).length === 0;

  const pendingLines = useMemo(
    () =>
      (open.data ?? [])
        .map((l) => ({ sales_order_item_id: l.sales_order_item_id, quantity: Number(qty[l.sales_order_item_id] ?? 0) }))
        .filter((l) => l.quantity > 0),
    [open.data, qty],
  );

  if (so.isLoading || items.isLoading) return <Loading rows={8} />;
  if (!so.data)
    return (
      <Panel>
        <div className="p-6 text-[13px] text-muted-foreground">Sales order not found.</div>
      </Panel>
    );

  // Invoice what has been delivered but not yet invoiced; with nothing
  // delivered yet, fall back to the still-open ordered quantity.
  const invoiceItems = (open.data ?? [])
    .map((l) => {
      const m = (match.data ?? []).find((x) => x.sales_order_item_id === l.sales_order_item_id);
      const uninvoiced = m ? Number(m.delivered_quantity) - Number(m.invoiced_quantity) : 0;
      const quantity = uninvoiced > 0.0001 ? uninvoiced : Number(l.open_quantity);
      return {
        product_id: l.product_id,
        description: l.description,
        quantity,
        unit_price: Number(l.unit_price),
        vat_rate: Number(l.vat_rate),
        discount: 0,
      };
    })
    .filter((l) => l.quantity > 0.0001);

  return (
    <>
      <PageHeader
        title={`Sales order ${so.data.number}`}
        subtitle={`${customer.data?.name ?? "Customer"} · ordered ${shortDate(so.data.order_date)} · expected ${shortDate(so.data.expected_delivery)}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/sales" })}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Sales
            </Button>
            {so.data.status !== "cancelled" && !fullyDelivered ? (
              <Button size="sm" variant="outline" onClick={() => setDeliverOpen(true)}>
                <Truck className="mr-1.5 h-3.5 w-3.5" /> Deliver goods
              </Button>
            ) : null}
            {editable ? (
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} title="Edit this order">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            ) : null}
            {so.data.status !== "cancelled" && invoiceItems.length > 0 ? (
              <Button size="sm" onClick={() => setInvoiceOpen(true)}>
                <ReceiptText className="mr-1.5 h-3.5 w-3.5" /> Create invoice
              </Button>
            ) : null}
          </>
        }
      />
      <EditDocDialog type="sales_order" row={editOpen ? so.data : null} onOpenChange={(v) => !v && setEditOpen(false)} />


      <AutomationNote>
        {editable
          ? "Nothing has been delivered or invoiced yet, so this order can still be edited."
          : "This order has posted deliveries or invoices — edits are locked. Use a credit note or reversal to correct it."}{" "}
        A delivery note releases stock against the goods-delivered-not-invoiced balance; the invoice clears that balance
        and books receivable, revenue and VAT in one transaction.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Order value" value={money(so.data.total, true)} hint={`Net ${money(so.data.subtotal)} + VAT ${money(so.data.vat)}`} />
        <Metric
          label="Delivered (at cost)"
          value={money(deliveredValue, true)}
          hint={fullyDelivered ? "Fully delivered" : "Partially delivered"}
        />
        <Metric label="Invoiced" value={money(invoicedTotal, true)} hint={`${(invoices.data ?? []).length} invoice(s)`} />
        <Metric label="Status" value={titleCase(so.data.status)} hint={`Customer ${customer.data?.code ?? "—"}`} />
      </div>

      <Panel title="Lines — ordered, delivered, invoiced">
        <TableShell>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th right>Ordered</Th>
              <Th right>Unit price</Th>
              <Th right>Delivered</Th>
              <Th right>Invoiced</Th>
              <Th right>Qty variance</Th>
              <Th right>Price variance</Th>
              <Th right>Value variance</Th>
            </tr>
          </thead>
          <tbody>
            {(match.data ?? []).map((l) => (
              <tr key={l.sales_order_item_id} className="row-hover hover:bg-secondary/40">
                <Td>{l.description}</Td>
                <Td right>{num(l.ordered_quantity, 2)}</Td>
                <Td right>{money(l.ordered_price)}</Td>
                <Td right>{num(l.delivered_quantity, 2)}</Td>
                <Td right>{num(l.invoiced_quantity, 2)}</Td>
                <Td right>
                  <span className={Math.abs(Number(l.quantity_variance)) > 0.0001 ? "text-critical" : undefined}>
                    {num(l.quantity_variance, 2)}
                  </span>
                </Td>
                <Td right>
                  <span className={Math.abs(Number(l.price_variance)) > 0.0001 ? "text-critical" : undefined}>
                    {money(l.price_variance)}
                  </span>
                </Td>
                <Td right>
                  <span className={Math.abs(Number(l.value_variance)) > 0.0001 ? "text-critical" : undefined}>
                    {money(l.value_variance)}
                  </span>
                </Td>
              </tr>
            ))}
            {!(match.data ?? []).length ? (
              <tr>
                <Td className="text-muted-foreground">No lines on this order.</Td>
              </tr>
            ) : null}
          </tbody>
        </TableShell>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Delivery notes">
          <TableShell>
            <thead>
              <tr>
                <Th>DN</Th>
                <Th>Delivered</Th>
                <Th right>Cost value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(deliveries.data ?? []).map((d: any) => (
                <tr
                  key={d.id}
                  className="row-hover cursor-pointer hover:bg-secondary/40"
                  onClick={() => navigate({ to: "/docs/$type/$id", params: { type: "dn", id: d.id } })}
                >
                  <Td>
                    <span className="num font-medium">{d.number}</span>
                  </Td>
                  <Td>{shortDate(d.delivery_date)}</Td>
                  <Td right>{money(d.total_value)}</Td>
                  <Td>
                    <Pill tone={statusTone(d.status)}>{titleCase(d.status)}</Pill>
                  </Td>
                </tr>
              ))}
              {!(deliveries.data ?? []).length ? (
                <tr>
                  <Td className="text-muted-foreground">Nothing delivered yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>

        <Panel title="Invoices">
          <TableShell>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th right>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? []).map((i: any) => (
                <tr key={i.id} className="row-hover hover:bg-secondary/40">
                  <Td>
                    <Link to="/invoices/$id" params={{ id: i.id }} className="num font-medium underline-offset-4 hover:underline">
                      {i.number}
                    </Link>
                  </Td>
                  <Td>{shortDate(i.invoice_date)}</Td>
                  <Td right>{money(i.total)}</Td>
                  <Td>
                    <Pill tone={statusTone(i.status)}>{titleCase(i.status)}</Pill>
                  </Td>
                </tr>
              ))}
              {!(invoices.data ?? []).length ? (
                <tr>
                  <Td className="text-muted-foreground">No invoice raised against this order yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Linked customer">
          <div className="space-y-1 p-3 text-[13px]">
            <div className="font-medium">{customer.data?.name ?? "—"}</div>
            <div className="text-muted-foreground">
              Code {customer.data?.code ?? "—"} · TRN {customer.data?.trn ?? "—"}
            </div>
            <div className="text-muted-foreground">
              {customer.data?.email ?? "No email"} · terms {customer.data?.payment_terms_days ?? 30} days
            </div>
            <Link to="/sales" className="text-[12px] underline underline-offset-2">
              Open customer list
            </Link>
          </div>
        </Panel>

        <Panel title="Linked documents">
          <div className="space-y-1 p-3 text-[13px]">
            {(docs.data ?? []).length
              ? (docs.data ?? []).map((d: any) => (
                  <div key={d.id} className="text-muted-foreground">
                    {d.label ?? d.entity_type}
                  </div>
                ))
              : <div className="text-muted-foreground">No documents attached to this order.</div>}
          </div>
        </Panel>
      </div>

      <Panel title="Status history & audit trail">
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Event</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ...(activity.data ?? []).map((a: any) => ({
                at: a.created_at,
                actor: a.actor,
                event: a.title,
                detail: a.detail,
                key: `act-${a.id}`,
              })),
              ...(audit.data ?? []).map((a: any) => ({
                at: a.created_at,
                actor: a.actor,
                event: a.action,
                detail: a.entity_label,
                key: `aud-${a.id}`,
              })),
              {
                at: so.data.created_at,
                actor: "System",
                event: "Sales order created",
                detail: `${so.data.number} — ${money(so.data.total, true)}`,
                key: "created",
              },
            ]
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
              .map((row) => (
                <tr key={row.key} className="row-hover hover:bg-secondary/40">
                  <Td>{longDate(row.at)}</Td>
                  <Td>{row.actor}</Td>
                  <Td>{row.event}</Td>
                  <Td>
                    <span className="text-muted-foreground">{row.detail ?? "—"}</span>
                  </Td>
                </tr>
              ))}
          </tbody>
        </TableShell>
      </Panel>

      <FormDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        title={`Deliver goods against ${so.data.number}`}
        description="Enter the quantity actually shipped. Partial deliveries are allowed; you cannot deliver more than ordered."
        submitLabel="Post delivery note"
        busy={deliver.isPending}
        wide
        extra={`${pendingLines.length} line(s) to deliver`}
        onSubmit={() => {
          if (!pendingLines.length) return;
          setConfirmDeliver(true);
        }}
      >
        <div className="space-y-2">
          {(open.data ?? []).map((l) => (
            <div key={l.sales_order_item_id} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-6 text-[13px]">
                {l.description}
                <div className="text-xs text-muted-foreground">
                  Ordered {num(l.ordered_quantity, 2)} · delivered {num(l.delivered_quantity, 2)} · open{" "}
                  {num(l.open_quantity, 2)} @ {money(l.unit_price)}
                </div>
              </div>
              <Field label="Deliver now" className="col-span-3">
                <Input
                  type="number"
                  min={0}
                  max={Number(l.open_quantity)}
                  step="0.01"
                  value={qty[l.sales_order_item_id] ?? ""}
                  onChange={(e) => setQty((s) => ({ ...s, [l.sales_order_item_id]: e.target.value }))}
                  className="h-8 text-[13px]"
                />
              </Field>
              <div className="col-span-3 pb-1.5 text-right text-[13px]">
                {money(Number(qty[l.sales_order_item_id] ?? 0) * Number(l.unit_price))}
              </div>
            </div>
          ))}
          {!(open.data ?? []).length ? (
            <div className="text-[13px] text-muted-foreground">This order has no open lines.</div>
          ) : null}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmDeliver}
        onOpenChange={setConfirmDeliver}
        title="Post this delivery note?"
        description="Stock will be released immediately and held as goods delivered not invoiced. Delivery notes cannot be deleted — they must be reversed."
        confirmLabel="Post delivery"
        onConfirm={() => {
          setConfirmDeliver(false);
          deliver.mutate(pendingLines);
        }}
      />

      <FormDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        title={`Create invoice from ${so.data.number}`}
        description="Customer, lines, quantities and prices are prefilled from the order and what has been delivered. Invoicing before delivery releases the stock at the same time."
        submitLabel="Post invoice"
        busy={createInvoice.isPending}
        wide
        extra={`Posting will debit ${customer.data?.name ?? "the customer"} and credit revenue and VAT.`}
        onSubmit={() => createInvoice.mutate({ items: invoiceItems })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice date">
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-8 text-[13px]" />
          </Field>
          <Field label="Due date (blank = terms)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-[13px]" />
          </Field>
        </div>
        <TableShell>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th right>Qty</Th>
              <Th right>Unit price</Th>
              <Th right>Net</Th>
            </tr>
          </thead>
          <tbody>
            {invoiceItems.map((l, i) => (
              <tr key={i}>
                <Td>{l.description}</Td>
                <Td right>{num(l.quantity, 2)}</Td>
                <Td right>{money(l.unit_price)}</Td>
                <Td right>{money(l.quantity * l.unit_price)}</Td>
              </tr>
            ))}
            {!invoiceItems.length ? (
              <tr>
                <Td className="text-muted-foreground">Everything on this order has already been invoiced.</Td>
              </tr>
            ) : null}
          </tbody>
        </TableShell>
      </FormDialog>
    </>
  );
}

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
import { FormDialog, Field, ConfirmDialog } from "@/components/fin/forms";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import { ArrowLeft, PackageCheck, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/_app/purchases/$id")({
  head: () => ({
    meta: [
      { title: "Purchase order · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Purchase order detail with goods receipts, supplier bills, line-by-line three-way match variance and full audit history.",
      },
      { property: "og:title", content: "Purchase order · FIN" },
      { property: "og:description", content: "Order, receipt and bill matched line by line." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseOrderDetail,
  errorComponent: () => (
    <Panel>
      <div className="p-6 text-[13px] text-muted-foreground">
        This purchase order could not be loaded. Go back to Purchases and try again.
      </div>
    </Panel>
  ),
  notFoundComponent: () => (
    <Panel>
      <div className="p-6 text-[13px] text-muted-foreground">Purchase order not found.</div>
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

function PurchaseOrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [billDate, setBillDate] = useState(isoToday());
  const [supplierRef, setSupplierRef] = useState("");

  const po = useRow<any>(["po", id], () => supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle() as any);
  const items = useRow<any[]>(["po_items", id], () =>
    supabase.from("purchase_order_items").select("*").eq("purchase_order_id", id) as any,
  );
  const supplier = useQuery({
    queryKey: ["po_supplier", po.data?.supplier_id],
    enabled: !!po.data?.supplier_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("id", po.data.supplier_id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  const receipts = useRow<any[]>(["po_receipts", id], () =>
    supabase.from("goods_receipts").select("*").eq("purchase_order_id", id).order("receipt_date") as any,
  );
  const bills = useRow<any[]>(["po_bills", id], () =>
    supabase.from("supplier_bills").select("*").eq("purchase_order_id", id).order("bill_date") as any,
  );
  const audit = useRow<any[]>(["po_audit", id], () =>
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }) as any,
  );
  const activity = useRow<any[]>(["po_activity", id], () =>
    supabase.from("activity_feed").select("*").eq("entity_id", id).order("created_at", { ascending: false }) as any,
  );
  const docs = useRow<any[]>(["po_docs", id], () =>
    supabase.from("document_links").select("*").eq("entity_id", id) as any,
  );

  const open = useQuery({
    queryKey: ["po_open", id],
    queryFn: () => actions.poOpenLines(id),
  });
  const match = useQuery({
    queryKey: ["po_match", id],
    queryFn: () => actions.poMatchLines(id),
  });

  const receive = useAction(
    (lines: { purchase_order_item_id: string; quantity: number }[]) =>
      actions.receiveGoods({ purchase_order_id: id, date: isoToday(), lines }),
    {
      scope: "receive_goods",
      success: "Goods receipt posted — stock and accruals updated",
      onSuccess: () => {
        setReceiveOpen(false);
        setQty({});
      },
    },
  );

  const createBill = useAction(
    (p: { supplier_id: string; items: any[] }) =>
      actions.createSupplierBill({
        supplier_id: p.supplier_id,
        bill_date: billDate,
        items: p.items,
        supplier_ref: supplierRef || undefined,
        purchase_order_id: id,
        goods_receipt_id: (receipts.data ?? []).at(-1)?.id ?? null,
      }),
    {
      scope: "create_bill_from_po",
      success: "Supplier bill posted — payables, VAT input and accrual cleared in one entry",
      onSuccess: () => setBillOpen(false),
    },
  );

  const receivedTotal = (receipts.data ?? []).reduce((s, r: any) => s + Number(r.total_value), 0);
  const billedTotal = (bills.data ?? []).reduce((s, b: any) => s + Number(b.total), 0);
  const fullyReceived = (open.data ?? []).every((l) => Number(l.open_quantity) <= 0.0001);
  const editable = (receipts.data ?? []).length === 0 && (bills.data ?? []).length === 0;

  const pendingLines = useMemo(
    () =>
      (open.data ?? [])
        .map((l) => ({ purchase_order_item_id: l.purchase_order_item_id, quantity: Number(qty[l.purchase_order_item_id] ?? 0) }))
        .filter((l) => l.quantity > 0),
    [open.data, qty],
  );

  if (po.isLoading || items.isLoading) return <Loading rows={8} />;
  if (!po.data)
    return (
      <Panel>
        <div className="p-6 text-[13px] text-muted-foreground">Purchase order not found.</div>
      </Panel>
    );

  const billItems = (open.data ?? []).map((l) => ({
    product_id: l.product_id,
    description: l.description,
    quantity: Number(l.received_quantity) > 0 ? Number(l.received_quantity) : Number(l.ordered_quantity),
    unit_price: Number(l.unit_price),
    vat_rate: Number(l.vat_rate),
  }));

  return (
    <>
      <PageHeader
        title={`Purchase order ${po.data.number}`}
        subtitle={`${supplier.data?.name ?? "Supplier"} · ordered ${shortDate(po.data.order_date)} · expected ${shortDate(po.data.expected_date)}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/purchases" })}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Purchases
            </Button>
            {po.data.status !== "cancelled" && !fullyReceived ? (
              <Button size="sm" variant="outline" onClick={() => setReceiveOpen(true)}>
                <PackageCheck className="mr-1.5 h-3.5 w-3.5" /> Receive goods
              </Button>
            ) : null}
            {po.data.status !== "cancelled" ? (
              <Button size="sm" onClick={() => setBillOpen(true)}>
                <ReceiptText className="mr-1.5 h-3.5 w-3.5" /> Create bill
              </Button>
            ) : null}
          </>
        }
      />

      <AutomationNote>
        {editable
          ? "Nothing has been received or billed yet, so this order can still be edited."
          : "This order has posted receipts or bills — edits are locked. Use a reversal or credit note to correct it."}{" "}
        Receipts post goods into stock against the goods-received-not-invoiced accrual; the supplier bill clears that
        accrual and books VAT input in one transaction.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Order value" value={money(po.data.total, true)} hint={`Net ${money(po.data.subtotal)} + VAT ${money(po.data.vat)}`} />
        <Metric label="Received" value={money(receivedTotal, true)} hint={fullyReceived ? "Fully received" : "Partially received"} />
        <Metric label="Billed" value={money(billedTotal, true)} hint={`${(bills.data ?? []).length} supplier bill(s)`} />
        <Metric label="Status" value={titleCase(po.data.status)} hint={`Supplier ${supplier.data?.code ?? "—"}`} />
      </div>

      <Panel title="Lines — three-way match">
        <TableShell>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th right>Ordered</Th>
              <Th right>Unit price</Th>
              <Th right>Received</Th>
              <Th right>Billed</Th>
              <Th right>Qty variance</Th>
              <Th right>Price variance</Th>
              <Th right>VAT variance</Th>
            </tr>
          </thead>
          <tbody>
            {(match.data ?? []).map((l) => (
              <tr key={l.purchase_order_item_id} className="row-hover hover:bg-secondary/40">
                <Td>{l.description}</Td>
                <Td right>{num(l.ordered_quantity, 2)}</Td>
                <Td right>{money(l.ordered_price)}</Td>
                <Td right>{num(l.received_quantity, 2)}</Td>
                <Td right>{num(l.billed_quantity, 2)}</Td>
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
                  <span className={Math.abs(Number(l.vat_variance)) > 0.0001 ? "text-critical" : undefined}>
                    {money(l.vat_variance)}
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
        <Panel title="Goods receipts">
          <TableShell>
            <thead>
              <tr>
                <Th>GRN</Th>
                <Th>Received</Th>
                <Th right>Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(receipts.data ?? []).map((r: any) => (
                <tr key={r.id} className="row-hover hover:bg-secondary/40">
                  <Td>
                    <span className="num font-medium">{r.number}</span>
                  </Td>
                  <Td>{shortDate(r.receipt_date)}</Td>
                  <Td right>{money(r.total_value)}</Td>
                  <Td>
                    <Pill tone={statusTone(r.status)}>{titleCase(r.status)}</Pill>
                  </Td>
                </tr>
              ))}
              {!(receipts.data ?? []).length ? (
                <tr>
                  <Td className="text-muted-foreground">Nothing received yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>

        <Panel title="Supplier bills">
          <TableShell>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Date</Th>
                <Th right>Total</Th>
                <Th>Match</Th>
              </tr>
            </thead>
            <tbody>
              {(bills.data ?? []).map((b: any) => (
                <tr key={b.id} className="row-hover hover:bg-secondary/40">
                  <Td>
                    <span className="num font-medium">{b.number}</span>
                  </Td>
                  <Td>{shortDate(b.bill_date)}</Td>
                  <Td right>{money(b.total)}</Td>
                  <Td>
                    <Pill tone={statusTone(b.match_status)}>{titleCase(b.match_status)}</Pill>
                  </Td>
                </tr>
              ))}
              {!(bills.data ?? []).length ? (
                <tr>
                  <Td className="text-muted-foreground">No bill received against this order yet.</Td>
                </tr>
              ) : null}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Linked supplier">
          <div className="space-y-1 p-3 text-[13px]">
            <div className="font-medium">{supplier.data?.name ?? "—"}</div>
            <div className="text-muted-foreground">
              Code {supplier.data?.code ?? "—"} · TRN {supplier.data?.trn ?? "—"}
            </div>
            <div className="text-muted-foreground">
              {supplier.data?.email ?? "No email"} · terms {supplier.data?.payment_terms_days ?? 30} days
            </div>
            <Link to="/purchases" className="text-[12px] underline underline-offset-2">
              Open supplier list
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
                at: po.data.created_at,
                actor: "System",
                event: "Purchase order created",
                detail: `${po.data.number} — ${money(po.data.total, true)}`,
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
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        title={`Receive goods against ${po.data.number}`}
        description="Enter the quantity actually delivered. Partial receipts are allowed; you cannot receive more than ordered."
        submitLabel="Post goods receipt"
        busy={receive.isPending}
        wide
        extra={`${pendingLines.length} line(s) to receive`}
        onSubmit={() => {
          if (!pendingLines.length) return;
          setConfirmReceive(true);
        }}
      >
        <div className="space-y-2">
          {(open.data ?? []).map((l) => (
            <div key={l.purchase_order_item_id} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-6 text-[13px]">
                {l.description}
                <div className="text-xs text-muted-foreground">
                  Ordered {num(l.ordered_quantity, 2)} · received {num(l.received_quantity, 2)} · open{" "}
                  {num(l.open_quantity, 2)} @ {money(l.unit_price)}
                </div>
              </div>
              <Field label="Receive now" className="col-span-3">
                <Input
                  type="number"
                  min={0}
                  max={Number(l.open_quantity)}
                  step="0.01"
                  value={qty[l.purchase_order_item_id] ?? ""}
                  onChange={(e) => setQty((s) => ({ ...s, [l.purchase_order_item_id]: e.target.value }))}
                  className="h-8 text-[13px]"
                />
              </Field>
              <div className="col-span-3 pb-1.5 text-right text-[13px]">
                {money(Number(qty[l.purchase_order_item_id] ?? 0) * Number(l.unit_price))}
              </div>
            </div>
          ))}
          {!(open.data ?? []).length ? (
            <div className="text-[13px] text-muted-foreground">This order has no open lines.</div>
          ) : null}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmReceive}
        onOpenChange={setConfirmReceive}
        title="Post this goods receipt?"
        description="Stock will increase immediately and a goods-received-not-invoiced accrual will be booked. Receipts cannot be deleted — they must be reversed."
        confirmLabel="Post receipt"
        onConfirm={() => {
          setConfirmReceive(false);
          receive.mutate(pendingLines);
        }}
      />

      <FormDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        title={`Create bill from ${po.data.number}`}
        description="Supplier, lines, quantities and prices are prefilled from the order and what has been received. Change a quantity or price to simulate a mismatch — it will raise an Action Required exception."
        submitLabel="Post supplier bill"
        busy={createBill.isPending}
        wide
        extra={`Posting will debit stock/accrual and VAT input, and credit ${supplier.data?.name ?? "the supplier"}.`}
        onSubmit={() => createBill.mutate({ supplier_id: po.data.supplier_id, items: billItems })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bill date">
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="h-8 text-[13px]" />
          </Field>
          <Field label="Supplier reference">
            <Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} className="h-8 text-[13px]" />
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
            {billItems.map((l, i) => (
              <tr key={i}>
                <Td>{l.description}</Td>
                <Td right>{num(l.quantity, 2)}</Td>
                <Td right>{money(l.unit_price)}</Td>
                <Td right>{money(l.quantity * l.unit_price)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </FormDialog>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/fin-data";
import { money, shortDate, titleCase, daysBetween } from "@/lib/format";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Purchase orders, goods receipts, supplier bills and payments with automatic three-way matching and tolerance-based exception handling.",
      },
      { property: "og:title", content: "Purchases · FIN" },
      { property: "og:description", content: "Three-way matching that runs itself." },
    ],
  }),
  component: Purchases,
});

const TABS = ["Bills", "Orders", "Goods receipts", "Payments", "Suppliers"] as const;

function Purchases() {
  const bills = useTable<any>("supplier_bills", ["p"], (q: any) => q.order("bill_date", { ascending: false }));
  const orders = useTable<any>("purchase_orders", ["p"], (q: any) => q.order("order_date", { ascending: false }));
  const receipts = useTable<any>("goods_receipts", ["p"], (q: any) => q.order("receipt_date", { ascending: false }));
  const payments = useTable<any>("supplier_payments", ["p"], (q: any) => q.order("payment_date", { ascending: false }));
  const suppliers = useTable<any>("suppliers", ["p"], (q: any) => q.order("name"));
  const [tab, setTab] = useState<(typeof TABS)[number]>("Bills");
  const [term, setTerm] = useState("");

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (suppliers.data ?? []).forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [suppliers.data]);

  const ap = (bills.data ?? []).reduce((s: number, b: any) => s + Number(b.balance), 0);
  const spend = (bills.data ?? []).reduce((s: number, b: any) => s + Number(b.subtotal), 0);
  const matched = (bills.data ?? []).filter((b: any) => b.match_status === "matched").length;
  const matchRate = (bills.data ?? []).length ? (matched / (bills.data ?? []).length) * 100 : 0;
  const filter = (s: string) => s.toLowerCase().includes(term.toLowerCase());

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="Procure to pay — PO, goods receipt and supplier invoice matched line by line"
      />

      <AutomationNote>
        {matched} of {(bills.data ?? []).length} supplier bills cleared three-way matching within the
        1% / AED 100 tolerance and posted straight to payables. The rest are in Action Required with
        the exact price or quantity difference isolated.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Payables" value={money(ap, true)} hint="Open supplier balances" />
        <Metric label="Spend YTD" value={money(spend, true)} hint="Net of VAT" />
        <Metric label="Three-way match rate" value={`${matchRate.toFixed(1)}%`} hint="Auto-cleared bills" />
        <Metric label="Suppliers" value={String((suppliers.data ?? []).length)} hint="Active vendors" />
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
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Filter…"
          className="ml-auto h-8 w-[220px] text-[13px]"
        />
      </div>

      {bills.isLoading ? (
        <Loading rows={10} />
      ) : tab === "Bills" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Supplier</Th>
                <Th>Supplier ref</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th right>Total</Th>
                <Th right>Balance</Th>
                <Th>Match</Th>
              </tr>
            </thead>
            <tbody>
              {(bills.data ?? [])
                .filter((b: any) => filter(b.number) || filter(nameById.get(b.supplier_id) ?? ""))
                .slice(0, 120)
                .map((b: any) => (
                  <tr key={b.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{b.number}</span>
                    </Td>
                    <Td>{nameById.get(b.supplier_id) ?? "—"}</Td>
                    <Td>
                      <span className="num text-muted-foreground">{b.supplier_ref ?? "—"}</span>
                    </Td>
                    <Td>{shortDate(b.bill_date)}</Td>
                    <Td>
                      <span className={Number(b.balance) > 0 && daysBetween(b.due_date) > 0 ? "text-critical" : undefined}>
                        {shortDate(b.due_date)}
                      </span>
                    </Td>
                    <Td right>{money(b.total)}</Td>
                    <Td right>{money(b.balance)}</Td>
                    <Td>
                      <Pill tone={statusTone(b.match_status)}>{titleCase(b.match_status)}</Pill>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Orders" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Supplier</Th>
                <Th>Ordered</Th>
                <Th>Expected</Th>
                <Th right>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? [])
                .filter((o: any) => filter(o.number) || filter(nameById.get(o.supplier_id) ?? ""))
                .slice(0, 120)
                .map((o: any) => (
                  <tr key={o.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{o.number}</span>
                    </Td>
                    <Td>{nameById.get(o.supplier_id) ?? "—"}</Td>
                    <Td>{shortDate(o.order_date)}</Td>
                    <Td>{shortDate(o.expected_date)}</Td>
                    <Td right>{money(o.total)}</Td>
                    <Td>
                      <Pill tone={statusTone(o.status)}>{titleCase(o.status)}</Pill>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Goods receipts" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>GRN</Th>
                <Th>Supplier</Th>
                <Th>Received</Th>
                <Th right>Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(receipts.data ?? [])
                .filter((r: any) => filter(r.number))
                .slice(0, 120)
                .map((r: any) => (
                  <tr key={r.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{r.number}</span>
                    </Td>
                    <Td>{nameById.get(r.supplier_id) ?? "—"}</Td>
                    <Td>{shortDate(r.receipt_date)}</Td>
                    <Td right>{money(r.total_value)}</Td>
                    <Td>
                      <Pill tone={statusTone(r.status)}>{titleCase(r.status)}</Pill>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : tab === "Payments" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Payment</Th>
                <Th>Supplier</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(payments.data ?? [])
                .filter((p: any) => filter(p.number))
                .slice(0, 120)
                .map((p: any) => (
                  <tr key={p.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{p.number}</span>
                    </Td>
                    <Td>{nameById.get(p.supplier_id) ?? "—"}</Td>
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
      ) : (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Code</Th>
                <Th>TRN</Th>
                <Th>Terms</Th>
                <Th right>Open balance</Th>
              </tr>
            </thead>
            <tbody>
              {(suppliers.data ?? [])
                .filter((s: any) => filter(s.name))
                .map((s: any) => {
                  const bal = (bills.data ?? [])
                    .filter((b: any) => b.supplier_id === s.id)
                    .reduce((t: number, b: any) => t + Number(b.balance), 0);
                  return (
                    <tr key={s.id} className="row-hover hover:bg-secondary/40">
                      <Td>{s.name}</Td>
                      <Td>
                        <span className="num text-muted-foreground">{s.code}</span>
                      </Td>
                      <Td>
                        <span className="num text-muted-foreground">{s.trn ?? "—"}</span>
                      </Td>
                      <Td>{s.payment_terms_days} days</Td>
                      <Td right>{money(bal)}</Td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        </Panel>
      )}
    </>
  );
}

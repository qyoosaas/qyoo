import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTable } from "@/lib/fin-data";
import { money, pct } from "@/lib/format";
import { PageHeader, Panel, Loading, TableShell, Th, Td, AutomationNote } from "@/components/fin/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Profit & loss, balance sheet, VAT return and receivables reports built live from the general ledger — always current, never re-run.",
      },
      { property: "og:title", content: "Reports · FIN" },
      { property: "og:description", content: "Financial statements, live." },
    ],
  }),
  component: Reports,
});

const REPORTS = ["Profit & Loss", "Balance Sheet", "VAT Return"] as const;

function Reports() {
  const accounts = useTable<any>("accounts", ["r"], (q: any) => q.order("code"));
  const lines = useQuery({
    queryKey: ["jel", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entry_lines")
        .select("account_code,debit,credit")
        .limit(5000);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const invoices = useTable<any>("invoices", ["r"]);
  const bills = useTable<any>("supplier_bills", ["r"]);
  const expenses = useTable<any>("expenses", ["r"]);
  const [report, setReport] = useState<(typeof REPORTS)[number]>("Profit & Loss");

  const balances = useMemo(() => {
    const m = new Map<string, number>();
    (lines.data ?? []).forEach((l: any) => {
      m.set(l.account_code, (m.get(l.account_code) ?? 0) + Number(l.debit) - Number(l.credit));
    });
    return m;
  }, [lines.data]);

  const rows = (type: string) =>
    (accounts.data ?? [])
      .filter((a: any) => a.type === type && !a.is_group)
      .map((a: any) => ({ ...a, net: balances.get(a.code) ?? 0 }))
      .filter((a: any) => Math.abs(a.net) > 0.005);

  const sum = (rs: any[]) => rs.reduce((s, r) => s + r.net, 0);
  const revenue = -sum(rows("revenue"));
  const exp = rows("expense");
  const cogs = exp.filter((a: any) => a.subtype === "cogs");
  const opex = exp.filter((a: any) => a.subtype !== "cogs");
  const grossProfit = revenue - sum(cogs);
  const netProfit = grossProfit - sum(opex);

  const assets = rows("asset");
  const liabilities = rows("liability");
  const equity = rows("equity");
  const totalAssets = sum(assets);
  const totalLiab = -sum(liabilities);
  const totalEq = -sum(equity) + netProfit;

  const q3inv = (invoices.data ?? []).filter((i: any) => i.invoice_date >= "2026-07-01");
  const q3bill = (bills.data ?? []).filter((b: any) => b.bill_date >= "2026-07-01");
  const q3exp = (expenses.data ?? []).filter((e: any) => e.expense_date >= "2026-07-01");
  const outputVat = q3inv.reduce((s: number, i: any) => s + Number(i.vat), 0);
  const inputVat = q3bill.reduce((s: number, b: any) => s + Number(b.vat), 0) + q3exp.reduce((s: number, e: any) => s + Number(e.vat), 0);

  const loading = accounts.isLoading || lines.isLoading;

  const Line = ({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) => (
    <tr className={bold ? "font-medium" : undefined}>
      <Td className={cn(indent && "pl-8", bold && "border-t border-foreground/30")}>{label}</Td>
      <Td right className={cn(bold && "border-t border-foreground/30")}>
        {money(value)}
      </Td>
    </tr>
  );

  return (
    <>
      <PageHeader title="Reports" subtitle="Statements generated from the live ledger — as at today, always" />

      <AutomationNote>
        No month-end run required. Every figure below is computed from posted journal lines the moment
        you open the page. Gross margin is {pct(revenue ? (grossProfit / revenue) * 100 : 0)} year to date.
      </AutomationNote>

      <div className="flex gap-2 border-b border-border pb-2">
        {REPORTS.map((r) => (
          <button
            key={r}
            onClick={() => setReport(r)}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[13px]",
              report === r ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading rows={12} />
      ) : report === "Profit & Loss" ? (
        <Panel title="Profit & Loss" description="1 January – 19 August 2026 · AED">
          <TableShell>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th right>YTD</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="label-xs">Revenue</Td>
                <Td>{""}</Td>
              </tr>
              {rows("revenue").map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={-a.net} indent />
              ))}
              <Line label="Total revenue" value={revenue} bold />
              <tr>
                <Td className="label-xs">Cost of sales</Td>
                <Td>{""}</Td>
              </tr>
              {cogs.map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={a.net} indent />
              ))}
              <Line label="Gross profit" value={grossProfit} bold />
              <tr>
                <Td className="label-xs">Operating expenses</Td>
                <Td>{""}</Td>
              </tr>
              {opex.map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={a.net} indent />
              ))}
              <Line label="Total operating expenses" value={sum(opex)} bold />
              <Line label="Net profit" value={netProfit} bold />
            </tbody>
          </TableShell>
        </Panel>
      ) : report === "Balance Sheet" ? (
        <Panel title="Balance Sheet" description="As at 19 August 2026 · AED">
          <TableShell>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th right>Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="label-xs">Assets</Td>
                <Td>{""}</Td>
              </tr>
              {assets.map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={a.net} indent />
              ))}
              <Line label="Total assets" value={totalAssets} bold />
              <tr>
                <Td className="label-xs">Liabilities</Td>
                <Td>{""}</Td>
              </tr>
              {liabilities.map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={-a.net} indent />
              ))}
              <Line label="Total liabilities" value={totalLiab} bold />
              <tr>
                <Td className="label-xs">Equity</Td>
                <Td>{""}</Td>
              </tr>
              {equity.map((a: any) => (
                <Line key={a.code} label={`${a.code} ${a.name}`} value={-a.net} indent />
              ))}
              <Line label="Current year earnings" value={netProfit} indent />
              <Line label="Total equity" value={totalEq} bold />
              <Line label="Liabilities + equity" value={totalLiab + totalEq} bold />
            </tbody>
          </TableShell>
        </Panel>
      ) : (
        <Panel title="VAT Return — Q3 2026 (draft)" description="Federal Tax Authority format · 1 July – 19 August 2026">
          <TableShell>
            <thead>
              <tr>
                <Th>Box</Th>
                <Th>Description</Th>
                <Th right>Amount (AED)</Th>
                <Th right>VAT (AED)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>1a</Td>
                <Td>Standard-rated supplies (5%)</Td>
                <Td right>{money(q3inv.reduce((s: number, i: any) => s + Number(i.subtotal) - Number(i.discount), 0))}</Td>
                <Td right>{money(outputVat)}</Td>
              </tr>
              <tr>
                <Td>9</Td>
                <Td>Standard-rated expenses</Td>
                <Td right>{money(q3bill.reduce((s: number, b: any) => s + Number(b.subtotal), 0) + q3exp.reduce((s: number, e: any) => s + Number(e.amount) - Number(e.vat), 0))}</Td>
                <Td right>{money(inputVat)}</Td>
              </tr>
              <tr className="font-medium">
                <Td>{""}</Td>
                <Td>Net VAT payable</Td>
                <Td>{""}</Td>
                <Td right>{money(outputVat - inputVat)}</Td>
              </tr>
            </tbody>
          </TableShell>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Return due 28 October 2026. FIN will finalise this once September closes and flag any
            invoices missing a valid TRN.
          </p>
        </Panel>
      )}
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useTable } from "@/lib/fin-data";
import { actions } from "@/lib/fin-actions";
import { money, pct, daysBetween } from "@/lib/format";
import { PageHeader, Panel, Loading, TableShell, Th, Td, AutomationNote, Metric, SegmentedTabs } from "@/components/fin/primitives";
import { PeriodPicker, presetPeriods, periodCaption, type Period } from "@/components/fin/period-picker";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Profit & loss, balance sheet, cash flow statement, trial balance, VAT return and ageing for any period — built live from the general ledger.",
      },
      { property: "og:title", content: "Reports · Qyoo" },
      { property: "og:description", content: "Financial statements for any period, live." },
    ],
  }),
  component: Reports,
});

const REPORTS = ["Profit & Loss", "Balance Sheet", "Cash Flow", "Trial Balance", "VAT Return", "Ageing"] as const;
type ReportName = (typeof REPORTS)[number];

type Row = { code: string; name: string; type: string; subtype: string | null; opening: number; movement: number; debit: number; credit: number };

function Reports() {
  const [period, setPeriod] = useState<Period>(() => presetPeriods().find((p) => p.label.startsWith("FY") && p.label.endsWith("to date"))!);
  const [report, setReport] = useState<ReportName>("Profit & Loss");

  const ledger = useQuery({
    queryKey: ["report_period", period.from, period.to],
    queryFn: () => actions.reportPeriod(period.from, period.to),
    staleTime: 30_000,
  });
  const prior = useMemo(() => {
    const from = new Date(period.from);
    const to = new Date(period.to);
    const len = to.getTime() - from.getTime();
    const pTo = new Date(from.getTime() - 86400000);
    const pFrom = new Date(pTo.getTime() - len);
    return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
  }, [period]);
  const priorLedger = useQuery({
    queryKey: ["report_period", prior.from, prior.to],
    queryFn: () => actions.reportPeriod(prior.from, prior.to),
    staleTime: 30_000,
    enabled: report === "Profit & Loss",
  });
  const invoices = useTable<any>("invoices", ["r"]);
  const bills = useTable<any>("supplier_bills", ["r"]);
  const expenses = useTable<any>("expenses", ["r"]);
  const customers = useTable<any>("customers", ["r"]);
  const suppliers = useTable<any>("suppliers", ["r"]);

  const rows: Row[] = (ledger.data ?? []).map((r) => ({ ...r, opening: Number(r.opening), movement: Number(r.movement), debit: Number(r.debit), credit: Number(r.credit) }));
  const priorRows: Row[] = (priorLedger.data ?? []).map((r) => ({ ...r, movement: Number(r.movement) })) as Row[];
  const by = (type: string, src = rows) => src.filter((r) => r.type === type);
  const sumMove = (rs: Row[]) => rs.reduce((s, r) => s + r.movement, 0);
  const closing = (r: Row) => r.opening + r.movement;
  const sumClose = (rs: Row[]) => rs.reduce((s, r) => s + closing(r), 0);
  const priorMove = (code: string) => priorRows.find((r) => r.code === code)?.movement ?? 0;

  // P&L (period movements)
  const rev = by("revenue");
  const exp = by("expense");
  const cogs = exp.filter((r) => r.subtype === "cogs" || r.subtype === "contra");
  const opex = exp.filter((r) => r.subtype === "opex");
  const fin = exp.filter((r) => r.subtype === "finance");
  const revenue = -sumMove(rev);
  const grossProfit = revenue - sumMove(cogs);
  const ebit = grossProfit - sumMove(opex);
  const netProfit = ebit - sumMove(fin);
  const priorRevenue = -priorRows.filter((r) => r.type === "revenue").reduce((s, r) => s + r.movement, 0);
  const priorNet = priorRevenue - priorRows.filter((r) => r.type === "expense").reduce((s, r) => s + r.movement, 0);

  // Balance sheet (cumulative to period end)
  const assets = by("asset");
  const liabs = by("liability");
  const equity = by("equity");
  const plToDate = -(sumClose(rev) + sumClose(exp)); // cumulative earnings incl. prior years
  const totalAssets = sumClose(assets);
  const totalLiab = -sumClose(liabs);
  const totalEq = -sumClose(equity) + plToDate;

  // Cash flow (indirect) — derived from period movements of non-cash accounts
  const cashRows = rows.filter((r) => r.code === "1000");
  const openingCash = cashRows.reduce((s, r) => s + r.opening, 0);
  const closingCash = cashRows.reduce((s, r) => s + closing(r), 0);
  const mv = (code: string) => rows.find((r) => r.code === code)?.movement ?? 0;
  const wc = [
    { label: "(Increase) / decrease in receivables", value: -mv("1100") },
    { label: "(Increase) / decrease in inventory", value: -(mv("1210") + mv("1220") + mv("1230")) },
    { label: "(Increase) / decrease in prepayments", value: -mv("1300") },
    { label: "(Increase) / decrease in VAT input", value: -mv("1400") },
    { label: "Increase / (decrease) in payables", value: mv("2000") },
    { label: "Increase / (decrease) in VAT output", value: mv("2100") },
    { label: "Increase / (decrease) in accruals", value: mv("2200") },
  ];
  const cfo = netProfit + wc.reduce((s, w) => s + w.value, 0);
  const cfi = -mv("1500");
  const cff = mv("8000") + mv("8100") ? -(mv("8000") + mv("8100")) : 0;
  const netChange = cfo + cfi + cff;

  // VAT (documents dated in period)
  const inP = (d: string) => d >= period.from && d <= period.to;
  const pInv = (invoices.data ?? []).filter((i: any) => inP(i.invoice_date) && i.status !== "cancelled");
  const pBill = (bills.data ?? []).filter((b: any) => inP(b.bill_date) && b.status !== "cancelled");
  const pExp = (expenses.data ?? []).filter((e: any) => inP(e.expense_date) && e.status !== "cancelled");
  const outputVat = pInv.reduce((s: number, i: any) => s + Number(i.vat), 0);
  const inputVat = pBill.reduce((s: number, b: any) => s + Number(b.vat), 0) + pExp.reduce((s: number, e: any) => s + Number(e.vat), 0);

  // Ageing as at period end
  const ageBuckets = (docs: any[], dateKey: string, partyKey: string, names: Map<string, string>) => {
    const b = ["Current", "1–30", "31–60", "61–90", "90+"];
    const m = new Map<string, number[]>();
    docs
      .filter((d) => Number(d.balance) > 0 && d[dateKey] <= period.to && d.status !== "cancelled")
      .forEach((d) => {
        const days = daysBetween(d.due_date, period.to);
        const idx = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
        const key = names.get(d[partyKey]) ?? "—";
        const arr = m.get(key) ?? [0, 0, 0, 0, 0];
        arr[idx] = (arr[idx] ?? 0) + Number(d.balance);
        m.set(key, arr);
      });
    return { buckets: b, rows: Array.from(m.entries()).sort((a, c) => c[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0)) };
  };
  const custNames = new Map<string, string>((customers.data ?? []).map((c: any) => [c.id, c.name]));
  const supNames = new Map<string, string>((suppliers.data ?? []).map((c: any) => [c.id, c.name]));

  const exportCsv = () => {
    const el = document.getElementById("report-table");
    if (!el) return;
    const lines = Array.from(el.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td"))
        .map((c) => `"${(c.textContent ?? "").replace(/"/g, '""').trim()}"`)
        .join(","),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.replace(/\s|&/g, "_")}_${period.from}_${period.to}.csv`;
    a.click();
  };

  const loading = ledger.isLoading;

  const Line = ({ label, value, bold, indent, prev }: { label: string; value: number; bold?: boolean; indent?: boolean; prev?: number }) => (
    <tr className={bold ? "font-medium" : undefined}>
      <Td className={cn(indent && "pl-8", bold && "border-t border-foreground/30")}>{label}</Td>
      <Td right className={cn(bold && "border-t border-foreground/30")}>
        {money(value)}
      </Td>
      {prev !== undefined ? (
        <Td right className={cn("text-muted-foreground", bold && "border-t border-foreground/30")}>
          {money(prev)}
        </Td>
      ) : null}
    </tr>
  );
  const Section = ({ label, cols = 2 }: { label: string; cols?: number }) => (
    <tr>
      <Td className="label-xs">{label}</Td>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Td key={i}>{""}</Td>
      ))}
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Statements generated from the live ledger for any period"
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <AutomationNote>
        No month-end run required. Every figure is computed from posted journal lines for the period you choose.
        Gross margin for this period is {pct(revenue ? (grossProfit / revenue) * 100 : 0)}.
      </AutomationNote>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <SegmentedTabs items={REPORTS} value={report} onChange={setReport} label="Financial report" />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {report === "Profit & Loss" || report === "Cash Flow" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Revenue" value={money(revenue, true)} hint={priorRevenue ? `Prior period ${money(priorRevenue)}` : "Period"} />
          <Metric label="Gross profit" value={money(grossProfit, true)} hint={pct(revenue ? (grossProfit / revenue) * 100 : 0) + " margin"} />
          <Metric label="Net profit" value={money(netProfit, true)} hint={priorNet ? `Prior period ${money(priorNet)}` : "Period"} />
          <Metric label="Net cash movement" value={money(netChange, true)} hint={`Closing cash ${money(closingCash)}`} />
        </div>
      ) : null}

      {loading ? (
        <Loading rows={12} />
      ) : report === "Profit & Loss" ? (
        <Panel title="Profit & Loss" description={periodCaption(period)}>
          <div id="report-table">
            <TableShell>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th right>This period</Th>
                  <Th right>Prior period</Th>
                </tr>
              </thead>
              <tbody>
                <Section label="Revenue" cols={3} />
                {rev.map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={-a.movement} prev={-priorMove(a.code)} indent />
                ))}
                <Line label="Total revenue" value={revenue} prev={priorRevenue} bold />
                <Section label="Cost of sales" cols={3} />
                {cogs.map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={a.movement} prev={priorMove(a.code)} indent />
                ))}
                <Line label="Gross profit" value={grossProfit} prev={priorRevenue - priorRows.filter((r) => r.type === "expense" && (r.subtype === "cogs" || r.subtype === "contra")).reduce((s, r) => s + r.movement, 0)} bold />
                <Section label="Operating expenses" cols={3} />
                {opex.map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={a.movement} prev={priorMove(a.code)} indent />
                ))}
                <Line label="Operating profit" value={ebit} prev={priorNet + priorRows.filter((r) => r.subtype === "finance").reduce((s, r) => s + r.movement, 0)} bold />
                {fin.map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={a.movement} prev={priorMove(a.code)} indent />
                ))}
                <Line label="Net profit" value={netProfit} prev={priorNet} bold />
              </tbody>
            </TableShell>
          </div>
        </Panel>
      ) : report === "Balance Sheet" ? (
        <Panel title="Balance Sheet" description={`As at ${periodCaption(period).split(" – ")[1]}`}>
          <div id="report-table">
            <TableShell>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th right>Balance</Th>
                </tr>
              </thead>
              <tbody>
                <Section label="Assets" />
                {assets.filter((a) => Math.abs(closing(a)) > 0.005).map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={closing(a)} indent />
                ))}
                <Line label="Total assets" value={totalAssets} bold />
                <Section label="Liabilities" />
                {liabs.filter((a) => Math.abs(closing(a)) > 0.005).map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={-closing(a)} indent />
                ))}
                <Line label="Total liabilities" value={totalLiab} bold />
                <Section label="Equity" />
                {equity.filter((a) => Math.abs(closing(a)) > 0.005).map((a) => (
                  <Line key={a.code} label={`${a.code} ${a.name}`} value={-closing(a)} indent />
                ))}
                <Line label="Retained earnings to date" value={plToDate} indent />
                <Line label="Total equity" value={totalEq} bold />
                <Line label="Liabilities + equity" value={totalLiab + totalEq} bold />
              </tbody>
            </TableShell>
          </div>
          {Math.abs(totalAssets - totalLiab - totalEq) > 0.05 ? (
            <p className="px-4 py-2 text-xs text-critical">Out of balance by {money(totalAssets - totalLiab - totalEq)} — check unposted or one-sided entries.</p>
          ) : (
            <p className="px-4 py-2 text-xs text-muted-foreground">Balanced ✓</p>
          )}
        </Panel>
      ) : report === "Cash Flow" ? (
        <Panel title="Cash Flow Statement (indirect method)" description={periodCaption(period)}>
          <div id="report-table">
            <TableShell>
              <thead>
                <tr>
                  <Th>Line</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                <Section label="Operating activities" />
                <Line label="Net profit for the period" value={netProfit} indent />
                {wc.map((w) => (
                  <Line key={w.label} label={w.label} value={w.value} indent />
                ))}
                <Line label="Net cash from operating activities" value={cfo} bold />
                <Section label="Investing activities" />
                <Line label="Purchase of property, plant & equipment" value={cfi} indent />
                <Line label="Net cash from investing activities" value={cfi} bold />
                <Section label="Financing activities" />
                <Line label="Share capital / owner movements" value={cff} indent />
                <Line label="Net cash from financing activities" value={cff} bold />
                <Line label="Net increase / (decrease) in cash" value={netChange} bold />
                <Line label="Opening cash & bank" value={openingCash} indent />
                <Line label="Closing cash & bank" value={openingCash + netChange} bold />
              </tbody>
            </TableShell>
          </div>
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Ledger cash at period end: {money(closingCash)}
            {Math.abs(closingCash - (openingCash + netChange)) > 0.05 ? ` · reconciling difference ${money(closingCash - openingCash - netChange)}` : " · reconciles ✓"}
          </p>
        </Panel>
      ) : report === "Trial Balance" ? (
        <Panel title="Trial Balance" description={periodCaption(period)}>
          <div id="report-table">
            <TableShell>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th right>Opening</Th>
                  <Th right>Debit</Th>
                  <Th right>Credit</Th>
                  <Th right>Closing</Th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => Math.abs(r.opening) + r.debit + r.credit > 0.005)
                  .map((r) => (
                    <tr key={r.code}>
                      <Td>
                        <span className="num text-muted-foreground">{r.code}</span> {r.name}
                      </Td>
                      <Td right>{money(r.opening)}</Td>
                      <Td right>{money(r.debit)}</Td>
                      <Td right>{money(r.credit)}</Td>
                      <Td right>{money(closing(r))}</Td>
                    </tr>
                  ))}
                <tr className="font-medium">
                  <Td className="border-t border-foreground/30">Totals</Td>
                  <Td right className="border-t border-foreground/30">{money(rows.reduce((s, r) => s + r.opening, 0))}</Td>
                  <Td right className="border-t border-foreground/30">{money(rows.reduce((s, r) => s + r.debit, 0))}</Td>
                  <Td right className="border-t border-foreground/30">{money(rows.reduce((s, r) => s + r.credit, 0))}</Td>
                  <Td right className="border-t border-foreground/30">{money(rows.reduce((s, r) => s + closing(r), 0))}</Td>
                </tr>
              </tbody>
            </TableShell>
          </div>
        </Panel>
      ) : report === "VAT Return" ? (
        <Panel title="VAT Return (draft)" description={`Federal Tax Authority format · ${periodCaption(period)}`}>
          <div id="report-table">
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
                  <Td right>{money(pInv.reduce((s: number, i: any) => s + Number(i.subtotal) - Number(i.discount), 0))}</Td>
                  <Td right>{money(outputVat)}</Td>
                </tr>
                <tr>
                  <Td>9</Td>
                  <Td>Standard-rated expenses</Td>
                  <Td right>{money(pBill.reduce((s: number, b: any) => s + Number(b.subtotal), 0) + pExp.reduce((s: number, e: any) => s + Number(e.amount), 0))}</Td>
                  <Td right>{money(inputVat)}</Td>
                </tr>
                <tr className="font-medium">
                  <Td>{""}</Td>
                  <Td>Net VAT {outputVat - inputVat >= 0 ? "payable" : "refundable"}</Td>
                  <Td>{""}</Td>
                  <Td right>{money(Math.abs(outputVat - inputVat))}</Td>
                </tr>
              </tbody>
            </TableShell>
          </div>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {pInv.length} sales invoices and {pBill.length + pExp.length} purchase documents in scope. Qyoo flags any invoice missing a valid TRN before filing.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2" id="report-table">
          {[
            { title: "Receivables ageing", data: ageBuckets(invoices.data ?? [], "invoice_date", "customer_id", custNames) },
            { title: "Payables ageing", data: ageBuckets(bills.data ?? [], "bill_date", "supplier_id", supNames) },
          ].map(({ title, data }) => (
            <Panel key={title} title={title} description={`As at ${periodCaption(period).split(" – ")[1]}`}>
              <TableShell>
                <thead>
                  <tr>
                    <Th>Party</Th>
                    {data.buckets.map((b) => (
                      <Th key={b} right>
                        {b}
                      </Th>
                    ))}
                    <Th right>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(([name, arr]) => (
                    <tr key={name}>
                      <Td>{name}</Td>
                      {arr.map((v, i) => (
                        <Td key={i} right>
                          <span className={i >= 3 && v > 0 ? "text-critical" : undefined}>{v ? money(v) : "—"}</span>
                        </Td>
                      ))}
                      <Td right>{money(arr.reduce((s, x) => s + x, 0))}</Td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <Td className="border-t border-foreground/30">Total</Td>
                    {data.buckets.map((_, i) => (
                      <Td key={i} right className="border-t border-foreground/30">
                        {money(data.rows.reduce((s, [, arr]) => s + arr[i]!, 0))}
                      </Td>
                    ))}
                    <Td right className="border-t border-foreground/30">
                      {money(data.rows.reduce((s, [, arr]) => s + arr.reduce((a, b) => a + b, 0), 0))}
                    </Td>
                  </tr>
                </tbody>
              </TableShell>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

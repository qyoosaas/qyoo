import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTable } from "@/lib/fin-data";
import { money, moneyShort, shortDate, pct } from "@/lib/format";
import { PageHeader, Panel, Metric, Loading, TableShell, Th, Td, AutomationNote, Confidence } from "@/components/fin/primitives";

export const Route = createFileRoute("/_app/fpa")({
  head: () => ({
    meta: [
      { title: "FP&A · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Budget versus actual, rolling forecasts and 13-week cash projection generated continuously from the live ledger.",
      },
      { property: "og:title", content: "FP&A · Qyoo" },
      { property: "og:description", content: "Planning that updates itself." },
    ],
  }),
  component: FPA,
});

const tooltipStyle = { fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)" };

function FPA() {
  const budgets = useTable<any>("budgets", ["f"], (q: any) => q.order("period"));
  const forecasts = useTable<any>("forecasts", ["f"], (q: any) => q.order("period"));
  const cash = useTable<any>("cash_forecasts", ["f"], (q: any) => q.order("forecast_date"));
  const invoices = useTable<any>("invoices", ["f"]);
  const insights = useTable<any>("insights", ["f"]);

  const bva = useMemo(() => {
    const actualByMonth = new Map<string, number>();
    (invoices.data ?? []).forEach((i: any) => {
      const k = i.invoice_date.slice(0, 7);
      actualByMonth.set(k, (actualByMonth.get(k) ?? 0) + Number(i.subtotal) - Number(i.discount));
    });
    const rev = (budgets.data ?? []).filter((b: any) => b.account_code?.startsWith("4"));
    return rev.map((b: any) => ({
      period: b.period,
      label: new Date(`${b.period}-01`).toLocaleDateString("en-GB", { month: "short" }),
      budget: Number(b.amount),
      actual: actualByMonth.get(b.period) ?? 0,
    }));
  }, [budgets.data, invoices.data]);

  const ytdBudget = bva.filter((r) => r.period <= "2026-08").reduce((s, r) => s + r.budget, 0);
  const ytdActual = bva.filter((r) => r.period <= "2026-08").reduce((s, r) => s + r.actual, 0);
  const cashRows = cash.data ?? [];
  const minCash = cashRows.reduce((m: number, r: any) => Math.min(m, Number(r.closing_balance)), Infinity);
  const minRow = cashRows.find((r: any) => Number(r.closing_balance) === minCash);

  const opexBudget = (budgets.data ?? []).filter((b: any) => !b.account_code?.startsWith("4"));
  const byLabel = new Map<string, number>();
  opexBudget.forEach((b: any) => byLabel.set(b.label, (byLabel.get(b.label) ?? 0) + Number(b.amount)));

  return (
    <>
      <PageHeader title="FP&A" subtitle="Budget, forecast and cash — derived from the ledger, not a spreadsheet" />

      <AutomationNote>
        Forecasts refresh as invoices, bills and bank lines post. Lowest projected cash point is{" "}
        <strong className="font-medium">{money(minCash === Infinity ? 0 : minCash, true)}</strong>
        {minRow ? ` on ${shortDate(minRow.forecast_date)}` : ""} — comfortably above the AED 500k operating floor.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue budget YTD" value={money(ytdBudget, true)} hint="Jan – Aug" />
        <Metric
          label="Revenue actual YTD"
          value={money(ytdActual, true)}
          trend={{ value: `${pct(ytdBudget ? ((ytdActual - ytdBudget) / ytdBudget) * 100 : 0)} vs budget`, direction: ytdActual >= ytdBudget ? "up" : "down" }}
        />
        <Metric label="Forecast horizon" value={`${cashRows.length} days`} hint="Daily granularity" />
        <Metric label="Lowest cash point" value={money(minCash === Infinity ? 0 : minCash, true)} hint={minRow ? shortDate(minRow.forecast_date) : ""} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue — budget vs actual" description="Monthly, FY2026">
          {budgets.isLoading ? (
            <Loading />
          ) : (
            <div className="h-[240px] px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bva} barGap={2}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [money(v, true), n === "budget" ? "Budget" : "Actual"]} />
                  <Bar dataKey="budget" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="actual" fill="var(--foreground)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Cash projection" description="Closing balance per day">
          <div className="h-[240px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashRows.map((r: any) => ({ d: shortDate(r.forecast_date), closing: Number(r.closing_balance), inflow: Number(r.inflow), outflow: Number(r.outflow) }))}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={Math.ceil(cashRows.length / 7)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => moneyShort(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => money(v, true)} />
                <Line type="monotone" dataKey="closing" stroke="var(--foreground)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Operating budget by line" description="Annual allocation">
          <TableShell>
            <thead>
              <tr>
                <Th>Line</Th>
                <Th right>Annual budget</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byLabel.entries()).map(([label, amt]) => (
                <tr key={label}>
                  <Td>{label}</Td>
                  <Td right>{money(amt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>

        <Panel title="Rolling forecast" description="Metric projections by period">
          <TableShell>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th>Metric</Th>
                <Th>Basis</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(forecasts.data ?? []).map((f: any) => (
                <tr key={f.id}>
                  <Td>{f.period}</Td>
                  <Td>{f.metric}</Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">{f.basis}</span>
                  </Td>
                  <Td right>{money(f.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      </div>

      <Panel title="Insights" description="What changed, why, and what to do">
        <ul className="divide-y divide-border">
          {(insights.data ?? []).map((i: any) => (
            <li key={i.id} className="grid gap-2 px-4 py-3.5 md:grid-cols-[1fr_1fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="signal-dot" />
                  <span className="text-[13px] font-medium">{i.title}</span>
                </div>
                <div className="mt-1">
                  <Confidence value={i.confidence} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="label-xs block">What changed</span>
                {i.what_changed}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="label-xs block">Why</span>
                {i.why}
              </div>
              <div className="text-xs">
                <span className="label-xs block">Do this</span>
                {i.suggested_action}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

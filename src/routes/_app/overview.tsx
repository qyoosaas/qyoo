import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTable, useExceptions } from "@/lib/fin-data";
import { money, moneyShort, shortDate, relative, daysBetween, TODAY, titleCase } from "@/lib/format";
import { Metric, Panel, Pill, PageHeader, Loading, AutomationNote, Confidence } from "@/components/fin/primitives";
import { ArrowRight, Upload } from "lucide-react";
import { RunAutomationButton } from "@/components/fin/automation-button";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({
    meta: [
      { title: "Overview · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Live cash, receivables, payables, margin and automation health for Al Noor Manufacturing — plus the exceptions that need a human decision today.",
      },
      { property: "og:title", content: "Overview · Qyoo · Autonomous Finance OS" },
      { property: "og:description", content: "Finance happens automatically. People handle exceptions." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const invoices = useTable<any>("invoices", ["ov"]);
  const bills = useTable<any>("supplier_bills", ["ov"]);
  const banks = useTable<any>("bank_accounts", ["ov"]);
  const forecasts = useTable<any>("cash_forecasts", ["ov"], (q: any) => q.order("forecast_date"));
  const activity = useTable<any>("activity_feed", ["ov"], (q: any) =>
    q.order("created_at", { ascending: false }).limit(12),
  );
  const insights = useTable<any>("insights", ["ov"], (q: any) =>
    q.order("created_at", { ascending: false }),
  );
  const { data: exceptions } = useExceptions();
  const txns = useTable<any>("bank_transactions", ["ov"], (q: any) => q.limit(1000));

  const cash = (banks.data ?? []).reduce((s: number, b: any) => s + Number(b.current_balance), 0);
  const ar = (invoices.data ?? []).reduce((s: number, i: any) => s + Number(i.balance), 0);
  const ap = (bills.data ?? []).reduce((s: number, b: any) => s + Number(b.balance), 0);
  const overdueAr = (invoices.data ?? [])
    .filter((i: any) => Number(i.balance) > 0 && daysBetween(i.due_date) > 0)
    .reduce((s: number, i: any) => s + Number(i.balance), 0);

  const mtd = useMemo(() => {
    const rows = (invoices.data ?? []).filter(
      (i: any) => new Date(i.invoice_date) >= new Date("2026-08-01"),
    );
    const revenue = rows.reduce((s: number, i: any) => s + Number(i.subtotal) - Number(i.discount), 0);
    const cogs = rows.reduce((s: number, i: any) => s + Number(i.cogs), 0);
    return { revenue, cogs, margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0 };
  }, [invoices.data]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; cogs: number }>();
    (invoices.data ?? []).forEach((i: any) => {
      const d = new Date(i.invoice_date);
      const key = d.toLocaleDateString("en-GB", { month: "short" });
      const row = map.get(key) ?? { month: key, revenue: 0, cogs: 0 };
      row.revenue += Number(i.subtotal) - Number(i.discount);
      row.cogs += Number(i.cogs);
      map.set(key, row);
    });
    return Array.from(map.values());
  }, [invoices.data]);

  const forecastData = (forecasts.data ?? []).map((f: any) => ({
    date: shortDate(f.forecast_date),
    closing: Number(f.closing_balance),
  }));

  const total = (txns.data ?? []).length;
  const auto = (txns.data ?? []).filter((t: any) => t.status === "matched").length;
  const autoRate = total ? (auto / total) * 100 : 0;

  const open = (exceptions ?? []).filter((e: any) =>
    ["open", "in_review", "waiting"].includes(e.status),
  );
  const critical = open.filter((e: any) => e.priority === "critical");

  const loading = invoices.isLoading || banks.isLoading;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`Al Noor Manufacturing LLC · position as at ${shortDate(TODAY)}`}
        actions={
          <>
          <Button asChild size="sm" variant="outline">
            <Link to="/documents">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload document
            </Link>
          </Button>
          <RunAutomationButton />
          <Link
            to="/action-required"
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {open.length} need you
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          </>
        }
      />

      <AutomationNote>
        <strong className="font-medium">Qyoo processed {total.toLocaleString()} bank lines, {(invoices.data ?? []).length} invoices and {(bills.data ?? []).length} supplier bills this year.</strong>{" "}
        {autoRate.toFixed(1)}% posted to the ledger without a human touch. {open.length} items are
        waiting on a decision — {critical.length} critical.
      </AutomationNote>

      {loading ? (
        <Loading rows={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Cash position"
            value={money(cash, true)}
            hint={`${(banks.data ?? []).length} accounts`}
          />
          <Metric
            label="Accounts receivable"
            value={money(ar, true)}
            hint={`${money(overdueAr, true)} overdue`}
            trend={{ value: `${((overdueAr / (ar || 1)) * 100).toFixed(0)}% past due`, direction: "down" }}
          />
          <Metric label="Accounts payable" value={money(ap, true)} hint="Due to suppliers" />
          <Metric
            label="Gross margin MTD"
            value={`${mtd.margin.toFixed(1)}%`}
            hint={`${money(mtd.revenue, true)} revenue`}
            trend={{ value: money(mtd.revenue - mtd.cogs), direction: "up" }}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Cash forecast" description="13-week rolling projection from open AR, AP and recurring costs">
          <div className="h-[240px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.ceil(forecastData.length / 7)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v) => moneyShort(v)}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                  formatter={(v: any) => [money(v, true), "Closing balance"]}
                />
                <Area
                  type="monotone"
                  dataKey="closing"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  fill="url(#cashFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Needs a decision"
          description="Ranked by financial impact"
          actions={
            <Link to="/action-required" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {open.slice(0, 5).map((e: any) => (
              <li key={e.id}>
                <Link
                  to="/action-required"
                  className="row-hover block px-4 py-3 hover:bg-secondary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Pill tone={e.priority === "critical" ? "critical" : e.priority === "high" ? "warning" : "muted"}>
                          {titleCase(e.priority)}
                        </Pill>
                        <span className="num text-[11px] text-muted-foreground">{e.code}</span>
                      </div>
                      <p className="mt-1.5 truncate text-[13px] font-medium">{e.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.entity_label}</p>
                    </div>
                    <div className="text-right">
                      <div className="num text-[13px] font-medium">{money(e.amount)}</div>
                      <div className="mt-1">
                        <Confidence value={e.confidence} />
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
            {open.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing needs you. Finance is running itself.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Revenue vs cost of sales" description="By month, current fiscal year">
          <div className="h-[220px] px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} barGap={2}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v) => moneyShort(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)" }}
                  formatter={(v: any, n: any) => [money(v, true), n === "revenue" ? "Revenue" : "COGS"]}
                />
                <Bar dataKey="revenue" fill="var(--foreground)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cogs" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="What Qyoo noticed" description="Rule-based analysis over your ledger">
          <ul className="divide-y divide-border">
            {(insights.data ?? []).slice(0, 4).map((i: any) => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="signal-dot" />
                  <p className="text-[13px] font-medium">{i.title}</p>
                  <span className="ml-auto">
                    <Confidence value={i.confidence} />
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="text-foreground">{i.what_changed}</span> {i.why}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="label-xs">Do this</span> · {i.suggested_action}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Automation activity" description="Everything the system did without asking">
        <ul className="divide-y divide-border">
          {(activity.data ?? []).map((a: any) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: a.actor === "Qyoo" ? "var(--signal)" : "var(--muted-foreground)" }}
              />
              <span className="w-[68px] shrink-0 text-[11px] text-muted-foreground">{a.actor}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{a.title}</span>
              <span className="hidden max-w-[280px] truncate text-xs text-muted-foreground md:block">
                {a.detail}
              </span>
              {a.amount ? <span className="num w-[110px] text-right text-[13px]">{money(a.amount)}</span> : <span className="w-[110px]" />}
              <span className="w-[70px] shrink-0 text-right text-[11px] text-muted-foreground">
                {relative(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

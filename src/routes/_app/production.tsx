import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/fin-data";
import { money, num, shortDate, titleCase, pct } from "@/lib/format";
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

export const Route = createFileRoute("/_app/production")({
  head: () => ({
    meta: [
      { title: "Production · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Production orders, bills of materials, material consumption and cost variance — costed automatically as work orders close.",
      },
      { property: "og:title", content: "Production · FIN" },
      { property: "og:description", content: "Standard versus actual, every run." },
    ],
  }),
  component: Production,
});

function Production() {
  const orders = useTable<any>("production_orders", ["pr"], (q: any) => q.order("start_date", { ascending: false }));
  const boms = useTable<any>("boms", ["pr"]);
  const products = useTable<any>("products", ["pr"]);
  const materials = useTable<any>("production_materials", ["pr"]);
  const [selected, setSelected] = useState<string | null>(null);

  const prodById = useMemo(() => {
    const m = new Map<string, any>();
    (products.data ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [products.data]);

  const all = orders.data ?? [];
  const completed = all.filter((o: any) => o.status === "completed");
  const expected = completed.reduce((s: number, o: any) => s + Number(o.expected_total_cost), 0);
  const actual = completed.reduce((s: number, o: any) => s + Number(o.actual_total_cost), 0);
  const overVariance = all.filter((o: any) => Math.abs(Number(o.variance_pct)) > 5);
  const sel = all.find((o: any) => o.id === selected);
  const selMats = (materials.data ?? []).filter((m: any) => m.production_order_id === selected);

  return (
    <>
      <PageHeader title="Production" subtitle="Work orders costed against BOM standards as they close" />

      <AutomationNote>
        {completed.length} production orders closed this year. FIN consumed materials at weighted-average
        cost, capitalised labour and overhead, and booked finished goods automatically.{" "}
        {overVariance.length} runs exceeded the 5% variance threshold and were raised for review.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Orders YTD" value={String(all.length)} hint={`${completed.length} completed`} />
        <Metric label="Standard cost" value={money(expected, true)} hint="Completed runs" />
        <Metric
          label="Actual cost"
          value={money(actual, true)}
          trend={{
            value: `${pct(expected ? ((actual - expected) / expected) * 100 : 0)} vs standard`,
            direction: actual > expected ? "down" : "up",
          }}
        />
        <Metric label="Variance alerts" value={String(overVariance.length)} hint="Above 5% threshold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Production orders">
          {orders.isLoading ? (
            <Loading />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Product</Th>
                  <Th right>Qty</Th>
                  <Th>Start</Th>
                  <Th right>Standard</Th>
                  <Th right>Actual</Th>
                  <Th right>Variance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {all.map((o: any) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o.id)}
                    className={`row-hover cursor-pointer hover:bg-secondary/40 ${selected === o.id ? "bg-secondary/60" : ""}`}
                  >
                    <Td>
                      <span className="num font-medium">{o.number}</span>
                    </Td>
                    <Td>{prodById.get(o.product_id)?.name ?? "—"}</Td>
                    <Td right>{num(o.quantity)}</Td>
                    <Td>{shortDate(o.start_date)}</Td>
                    <Td right>{money(o.expected_total_cost)}</Td>
                    <Td right>{money(o.actual_total_cost)}</Td>
                    <Td right>
                      <span className={Math.abs(Number(o.variance_pct)) > 5 ? "text-critical" : Number(o.variance) < 0 ? "text-success" : undefined}>
                        {pct(o.variance_pct)}
                      </span>
                    </Td>
                    <Td>
                      <Pill tone={statusTone(o.status)}>{titleCase(o.status)}</Pill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title={sel ? `${sel.number} · materials` : "Select an order"} description={sel ? `${prodById.get(sel.product_id)?.name} · ${num(sel.quantity)} units` : "Click a row to see consumption"}>
            {sel ? (
              <TableShell>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th right>Expected</Th>
                    <Th right>Actual</Th>
                    <Th right>Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {selMats.map((m: any) => (
                    <tr key={m.id}>
                      <Td>{prodById.get(m.product_id)?.name ?? "—"}</Td>
                      <Td right>{num(m.expected_quantity, 1)}</Td>
                      <Td right>
                        <span className={Number(m.actual_quantity) > Number(m.expected_quantity) * 1.05 ? "text-critical" : undefined}>
                          {num(m.actual_quantity, 1)}
                        </span>
                      </Td>
                      <Td right>{money(m.value)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                Material consumption and variance detail will appear here.
              </p>
            )}
          </Panel>

          <Panel title="Bills of materials">
            <ul className="divide-y divide-border">
              {(boms.data ?? []).map((b: any) => (
                <li key={b.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {prodById.get(b.product_id)?.name} · yields {num(b.output_quantity)}
                    </div>
                  </div>
                  <span className="num text-xs text-muted-foreground">
                    L {money(b.labour_cost)} · OH {money(b.overhead_cost)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

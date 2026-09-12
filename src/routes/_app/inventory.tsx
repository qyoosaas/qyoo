import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/fin-data";
import { money, num, shortDate, titleCase } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Metric,
  Loading,
  TableShell,
  Th,
  Td,
  AutomationNote,
} from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Stock on hand, weighted-average cost and valuation by warehouse, with reorder alerts and a full movement ledger.",
      },
      { property: "og:title", content: "Inventory · FIN" },
      { property: "og:description", content: "Perpetual inventory, always valued." },
    ],
  }),
  component: Inventory,
});

function Inventory() {
  const products = useTable<any>("products", ["i"], (q: any) => q.order("sku"));
  const balances = useTable<any>("inventory_balances", ["i"]);
  const warehouses = useTable<any>("warehouses", ["i"]);
  const moves = useTable<any>("inventory_transactions", ["i"], (q: any) =>
    q.order("txn_date", { ascending: false }).limit(80),
  );
  const [tab, setTab] = useState<"Stock" | "Movements">("Stock");
  const [term, setTerm] = useState("");

  const whById = useMemo(() => {
    const m = new Map<string, string>();
    (warehouses.data ?? []).forEach((w: any) => m.set(w.id, w.name));
    return m;
  }, [warehouses.data]);

  const rows = useMemo(() => {
    return (products.data ?? []).map((p: any) => {
      const b = (balances.data ?? []).filter((x: any) => x.product_id === p.id);
      const qty = b.reduce((s: number, x: any) => s + Number(x.quantity), 0);
      const value = b.reduce((s: number, x: any) => s + Number(x.value), 0);
      return { ...p, qty, value, avg: qty ? value / qty : Number(p.cost), locations: b };
    });
  }, [products.data, balances.data]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const low = rows.filter((r) => r.qty <= Number(r.reorder_level));
  const raw = rows.filter((r) => r.kind === "raw_material").reduce((s, r) => s + r.value, 0);
  const finished = rows.filter((r) => r.kind === "finished_good").reduce((s, r) => s + r.value, 0);
  const prodById = new Map(rows.map((r) => [r.id, r]));

  return (
    <>
      <PageHeader title="Inventory" subtitle="Weighted-average costing across three warehouses" />

      <AutomationNote>
        Every goods receipt, production output and shipment revalued stock automatically. Cost of
        sales on {rows.length} SKUs is derived from live weighted-average cost — no month-end
        valuation run needed.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Stock value" value={money(totalValue, true)} hint="At weighted-average cost" />
        <Metric label="Raw materials" value={money(raw, true)} hint="Inputs" />
        <Metric label="Finished goods" value={money(finished, true)} hint="Ready to ship" />
        <Metric label="Below reorder level" value={String(low.length)} hint="Needs a purchase order" />
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-2">
        {(["Stock", "Movements"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[13px]",
              tab === t ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {t}
          </button>
        ))}
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="SKU or name…"
          className="ml-auto h-8 w-[220px] text-[13px]"
        />
      </div>

      {products.isLoading ? (
        <Loading rows={10} />
      ) : tab === "Stock" ? (
        <Panel>
          <TableShell>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Type</Th>
                <Th>Locations</Th>
                <Th right>On hand</Th>
                <Th right>Avg cost</Th>
                <Th right>Value</Th>
                <Th>Reorder</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(
                  (r) =>
                    r.sku.toLowerCase().includes(term.toLowerCase()) ||
                    r.name.toLowerCase().includes(term.toLowerCase()),
                )
                .map((r) => (
                  <tr key={r.id} className="row-hover hover:bg-secondary/40">
                    <Td>
                      <span className="num font-medium">{r.sku}</span>
                    </Td>
                    <Td>{r.name}</Td>
                    <Td>{titleCase(r.kind)}</Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {r.locations.map((l: any) => `${whById.get(l.warehouse_id) ?? "WH"} ${num(l.quantity)}`).join(" · ") || "—"}
                      </span>
                    </Td>
                    <Td right>
                      {num(r.qty)} {r.unit}
                    </Td>
                    <Td right>{money(r.avg)}</Td>
                    <Td right>{money(r.value)}</Td>
                    <Td>
                      {r.qty <= Number(r.reorder_level) ? (
                        <Pill tone="warning">Below {num(r.reorder_level)}</Pill>
                      ) : (
                        <Pill tone="muted">OK</Pill>
                      )}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        </Panel>
      ) : (
        <Panel title="Movement ledger" description="Most recent 80 transactions">
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Product</Th>
                <Th>Warehouse</Th>
                <Th>Type</Th>
                <Th>Source</Th>
                <Th right>Qty</Th>
                <Th right>Unit cost</Th>
                <Th right>Value</Th>
              </tr>
            </thead>
            <tbody>
              {(moves.data ?? []).map((m: any) => (
                <tr key={m.id} className="row-hover hover:bg-secondary/40">
                  <Td>{shortDate(m.txn_date)}</Td>
                  <Td>{prodById.get(m.product_id)?.name ?? "—"}</Td>
                  <Td>{whById.get(m.warehouse_id) ?? "—"}</Td>
                  <Td>
                    <Pill tone={Number(m.quantity) >= 0 ? "success" : "neutral"}>{titleCase(m.kind)}</Pill>
                  </Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">{titleCase(m.ref_type)}</span>
                  </Td>
                  <Td right>{num(m.quantity)}</Td>
                  <Td right>{money(m.unit_cost)}</Td>
                  <Td right>{money(m.value)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Panel>
      )}
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTable } from "@/lib/fin-data";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import { money, num, shortDate, titleCase, pct } from "@/lib/format";
import {
  PageHeader, Panel, Pill, Metric, Loading, TableShell, Th, Td, statusTone, AutomationNote, SegmentedTabs, EmptyState,
} from "@/components/fin/primitives";
import { Field, FormDialog, NativeSelect } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/production")({
  head: () => ({
    meta: [
      { title: "Production · Qyoo · Autonomous Finance OS" },
      { name: "description", content: "Plan, start and complete production orders from bills of materials — stock, finished goods and cost variance post automatically." },
      { property: "og:title", content: "Production · Qyoo" },
      { property: "og:description", content: "Standard versus actual, every run." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Production,
});

const FILTERS = ["All", "Planned", "In progress", "Completed"] as const;
type BomLine = { product_id: string; quantity_per_unit: string };

function Production() {
  const orders = useTable<any>("production_orders", ["pr"], (q: any) => q.order("created_at", { ascending: false }));
  const boms = useTable<any>("boms", ["pr"]);
  const bomItems = useTable<any>("bom_items", ["pr"], (q: any) => q);
  const products = useTable<any>("products", ["pr"]);
  const balances = useTable<any>("inventory_balances", ["pr"]);
  const materials = useTable<any>("production_materials", ["pr"], (q: any) => q);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [newOrder, setNewOrder] = useState<{ bom_id: string; quantity: string; start: string; end: string } | null>(null);
  const [newBom, setNewBom] = useState<{ name: string; product_id: string; output: string; labour: string; overhead: string; lines: BomLine[] } | null>(null);
  const [complete, setComplete] = useState<{ output: string; actual: Record<string, string>; date: string } | null>(null);

  const create = useAction(actions.createProductionOrder, { success: "Production order planned", onSuccess: (id) => { setNewOrder(null); setSelected(id); } });
  const status = useAction(actions.setProductionStatus, { success: "Order updated" });
  const finish = useAction(actions.completeProductionOrder, { success: "Production completed — stock and ledger updated", onSuccess: () => setComplete(null) });
  const saveBom = useAction(actions.saveBom, { success: "Bill of materials saved", onSuccess: () => setNewBom(null) });

  const prodById = useMemo(() => new Map((products.data ?? []).map((p: any) => [p.id, p])), [products.data]);
  const stock = (pid: string) => (balances.data ?? []).filter((b: any) => b.product_id === pid).reduce((s: number, b: any) => s + Number(b.quantity), 0);
  const all = orders.data ?? [];
  const shown = all.filter((o: any) => filter === "All" || o.status === filter.toLowerCase().replace(" ", "_"));
  const completed = all.filter((o: any) => o.status === "completed");
  const expected = completed.reduce((s: number, o: any) => s + Number(o.expected_total_cost), 0);
  const actual = completed.reduce((s: number, o: any) => s + Number(o.actual_total_cost), 0);
  const overVariance = completed.filter((o: any) => Math.abs(Number(o.variance_pct)) > 5);
  const open = all.filter((o: any) => o.status === "planned" || o.status === "in_progress");
  const sel = all.find((o: any) => o.id === selected);
  const selMats = (materials.data ?? []).filter((m: any) => m.production_order_id === selected);
  const selBom = (boms.data ?? []).find((b: any) => b.id === sel?.bom_id);

  useEffect(() => {
    if (!selected && all[0]) setSelected(all[0].id);
  }, [all, selected]);

  // Preview of the new order: material needs vs stock
  const preview = useMemo(() => {
    if (!newOrder?.bom_id) return [];
    const b = (boms.data ?? []).find((x: any) => x.id === newOrder.bom_id);
    const scale = Number(newOrder.quantity || 0) / Number(b?.output_quantity || 1);
    return (bomItems.data ?? []).filter((i: any) => i.bom_id === newOrder.bom_id).map((i: any) => {
      const p: any = prodById.get(i.product_id);
      const need = Number(i.quantity_per_unit) * scale;
      return { name: p?.name ?? "—", unit: p?.unit ?? "", need, have: stock(i.product_id), cost: need * Number(p?.cost ?? 0) };
    });
  }, [newOrder, boms.data, bomItems.data, prodById, balances.data]);

  const finishedGoods = (products.data ?? []).filter((p: any) => p.kind === "finished_good");
  const stockItems = (products.data ?? []).filter((p: any) => p.kind !== "service");

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Plan from a bill of materials, record what was used, and Qyoo costs the run"
        actions={<Button size="sm" onClick={() => setNewOrder({ bom_id: boms.data?.[0]?.id ?? "", quantity: "1", start: isoToday(), end: "" })}><Plus className="mr-1 h-3.5 w-3.5" />New production order</Button>}
      />

      <AutomationNote>
        Planning and starting an order posts nothing. On completion Qyoo consumes the materials you actually used at
        weighted-average cost, adds labour and overhead from the BOM, and moves the finished goods into stock with one
        journal. Runs more than 5% off standard are flagged.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open orders" value={String(open.length)} hint={`${all.filter((o: any) => o.status === "in_progress").length} in progress`} />
        <Metric label="Standard cost" value={money(expected, true)} hint="Completed runs" />
        <Metric label="Actual cost" value={money(actual, true)} trend={{ value: `${pct(expected ? ((actual - expected) / expected) * 100 : 0)} vs standard`, direction: actual > expected ? "down" : "up" }} />
        <Metric label="Variance alerts" value={String(overVariance.length)} hint="Above 5% threshold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Production orders" actions={<SegmentedTabs items={FILTERS} value={filter} onChange={setFilter} label="Status" />}>
          {orders.isLoading ? <Loading /> : !shown.length ? (
            <EmptyState title="No production orders" hint="Plan one from a bill of materials." />
          ) : (
            <TableShell>
              <thead><tr><Th>Order</Th><Th>Product</Th><Th right>Qty</Th><Th>Start</Th><Th right>Standard</Th><Th right>Actual</Th><Th right>Variance</Th><Th>Status</Th></tr></thead>
              <tbody>
                {shown.map((o: any) => (
                  <tr key={o.id} onClick={() => setSelected(o.id)} className={`row-hover cursor-pointer hover:bg-secondary/40 ${selected === o.id ? "bg-secondary/60" : ""}`}>
                    <Td><span className="num font-medium">{o.number}</span></Td>
                    <Td>{(prodById.get(o.product_id) as any)?.name ?? "—"}</Td>
                    <Td right>{num(o.quantity)}</Td>
                    <Td>{shortDate(o.start_date)}</Td>
                    <Td right>{money(o.expected_total_cost)}</Td>
                    <Td right>{o.status === "completed" ? money(o.actual_total_cost) : "—"}</Td>
                    <Td right>{o.status === "completed" ? <span className={Math.abs(Number(o.variance_pct)) > 5 ? "text-critical" : Number(o.variance) < 0 ? "text-success" : undefined}>{pct(o.variance_pct)}</span> : "—"}</Td>
                    <Td><Pill tone={o.status === "planned" ? "neutral" : statusTone(o.status)}>{titleCase(o.status)}</Pill></Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title={sel ? `${sel.number} · ${titleCase(sel.status)}` : "Select an order"}
            description={sel ? `${(prodById.get(sel.product_id) as any)?.name} · ${num(sel.quantity)} units${selBom ? ` · ${selBom.name}` : ""}` : "Click a row to see materials"}
            actions={sel ? (
              <div className="flex gap-1.5">
                {sel.status === "planned" ? <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={status.isPending} onClick={() => status.mutate({ id: sel.id, status: "in_progress" })}>Start</Button> : null}
                {sel.status === "planned" || sel.status === "in_progress" ? (
                  <>
                    <Button size="sm" className="h-7 text-[12px]" onClick={() => setComplete({ output: String(Number(sel.quantity)), date: isoToday(), actual: Object.fromEntries(selMats.map((m: any) => [m.id, String(+Number(m.expected_quantity).toFixed(4))])) })}>Complete</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[12px] text-muted-foreground" disabled={status.isPending} onClick={() => { if (confirm(`Cancel ${sel.number}? Nothing has been posted yet.`)) status.mutate({ id: sel.id, status: "cancelled" }); }}>Cancel</Button>
                  </>
                ) : null}
              </div>
            ) : null}
          >
            {sel ? (
              <TableShell>
                <thead><tr><Th>Material</Th><Th right>Standard</Th><Th right>{sel.status === "completed" ? "Used" : "In stock"}</Th><Th right>Value</Th></tr></thead>
                <tbody>
                  {selMats.map((m: any) => {
                    const p: any = prodById.get(m.product_id);
                    const over = sel.status === "completed" && Number(m.actual_quantity) > Number(m.expected_quantity) * 1.05;
                    const short = sel.status !== "completed" && stock(m.product_id) < Number(m.expected_quantity);
                    return (
                      <tr key={m.id}>
                        <Td>{p?.name ?? "—"}</Td>
                        <Td right>{num(m.expected_quantity, 1)} {p?.unit}</Td>
                        <Td right><span className={over || short ? "text-critical" : undefined}>{num(sel.status === "completed" ? m.actual_quantity : stock(m.product_id), 1)}</span></Td>
                        <Td right>{money(m.value)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            ) : <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Material consumption and variance detail will appear here.</p>}
          </Panel>

          <Panel title="Bills of materials" actions={
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setNewBom({ name: "", product_id: finishedGoods[0]?.id ?? "", output: "1", labour: "0", overhead: "0", lines: [{ product_id: "", quantity_per_unit: "1" }] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New BOM
            </Button>
          }>
            <ul className="divide-y divide-border">
              {(boms.data ?? []).map((b: any) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{(bomItems.data ?? []).filter((i: any) => i.bom_id === b.id).length} materials · yields {num(b.output_quantity)}</div>
                  </div>
                  <span className="num shrink-0 text-xs text-muted-foreground">L {money(b.labour_cost)} · OH {money(b.overhead_cost)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <FormDialog
        open={!!newOrder}
        onOpenChange={(v) => !v && setNewOrder(null)}
        title="New production order"
        description="Planning posts nothing. Stock moves only when you complete the order."
        submitLabel="Plan order"
        busy={create.isPending}
        onSubmit={async () => { if (newOrder) create.mutate({ bom_id: newOrder.bom_id, quantity: Number(newOrder.quantity), start_date: newOrder.start, end_date: newOrder.end || null }); }}
      >
        {newOrder ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bill of materials" className="sm:col-span-2">
                <NativeSelect value={newOrder.bom_id} onChange={(v) => setNewOrder({ ...newOrder, bom_id: v })}>
                  {(boms.data ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Quantity to produce"><Input type="number" min={0} step="any" value={newOrder.quantity} onChange={(e) => setNewOrder({ ...newOrder, quantity: e.target.value })} className="num h-8 text-[13px]" /></Field>
              <Field label="Start date"><Input type="date" value={newOrder.start} onChange={(e) => setNewOrder({ ...newOrder, start: e.target.value })} className="h-8 text-[13px]" /></Field>
            </div>
            {preview.length ? (
              <TableShell>
                <thead><tr><Th>Material needed</Th><Th right>Qty</Th><Th right>In stock</Th><Th right>Est. cost</Th></tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}><Td>{r.name}</Td><Td right>{num(r.need, 1)} {r.unit}</Td><Td right><span className={r.have < r.need ? "text-critical" : undefined}>{num(r.have, 1)}</span></Td><Td right>{money(r.cost)}</Td></tr>
                  ))}
                </tbody>
              </TableShell>
            ) : null}
            {preview.some((r) => r.have < r.need) ? <p className="text-xs text-critical">Some materials are short. You can still plan the order and buy or produce them first.</p> : null}
          </div>
        ) : null}
      </FormDialog>

      <FormDialog
        open={!!complete}
        onOpenChange={(v) => !v && setComplete(null)}
        title={`Complete ${sel?.number ?? ""}`}
        description="Enter what was actually produced and used. This posts stock and one journal and cannot be edited afterwards."
        submitLabel="Complete & post"
        busy={finish.isPending}
        onSubmit={async () => {
          if (!complete || !sel) return;
          finish.mutate({ id: sel.id, output: Number(complete.output), date: complete.date, actuals: Object.entries(complete.actual).map(([id, v]) => ({ id, actual_quantity: Number(v) })) });
        }}
      >
        {complete && sel ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Good units produced"><Input type="number" min={0} step="any" value={complete.output} onChange={(e) => setComplete({ ...complete, output: e.target.value })} className="num h-8 text-[13px]" /></Field>
              <Field label="Completion date"><Input type="date" value={complete.date} onChange={(e) => setComplete({ ...complete, date: e.target.value })} className="h-8 text-[13px]" /></Field>
            </div>
            <TableShell>
              <thead><tr><Th>Material</Th><Th right>Standard</Th><Th right>Actually used</Th></tr></thead>
              <tbody>
                {selMats.map((m: any) => {
                  const p: any = prodById.get(m.product_id);
                  return (
                    <tr key={m.id}>
                      <Td>{p?.name ?? "—"}</Td>
                      <Td right>{num(m.expected_quantity, 1)} {p?.unit}</Td>
                      <Td right><Input type="number" min={0} step="any" value={complete.actual[m.id] ?? ""} onChange={(e) => setComplete({ ...complete, actual: { ...complete.actual, [m.id]: e.target.value } })} className="num ml-auto h-7 w-[110px] text-right text-[13px]" /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
        ) : null}
      </FormDialog>

      <FormDialog
        open={!!newBom}
        onOpenChange={(v) => !v && setNewBom(null)}
        title="New bill of materials"
        description="The recipe for one batch: what goes in, what comes out, and the labour and overhead per batch."
        busy={saveBom.isPending}
        wide
        onSubmit={async () => {
          if (!newBom) return;
          const prod: any = prodById.get(newBom.product_id);
          saveBom.mutate({ name: newBom.name || `BOM — ${prod?.name ?? ""}`, product_id: newBom.product_id, output_quantity: Number(newBom.output), labour_cost: Number(newBom.labour), overhead_cost: Number(newBom.overhead), items: newBom.lines.map((l) => ({ product_id: l.product_id, quantity_per_unit: Number(l.quantity_per_unit) })) });
        }}
      >
        {newBom ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product made">
                <NativeSelect value={newBom.product_id} onChange={(v) => setNewBom({ ...newBom, product_id: v })}>
                  {finishedGoods.map((p: any) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Name (optional)"><Input value={newBom.name} onChange={(e) => setNewBom({ ...newBom, name: e.target.value })} className="h-8 text-[13px]" /></Field>
              <Field label="Batch yields (units)"><Input type="number" min={0} step="any" value={newBom.output} onChange={(e) => setNewBom({ ...newBom, output: e.target.value })} className="num h-8 text-[13px]" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Labour / batch"><Input type="number" min={0} step="any" value={newBom.labour} onChange={(e) => setNewBom({ ...newBom, labour: e.target.value })} className="num h-8 text-[13px]" /></Field>
                <Field label="Overhead / batch"><Input type="number" min={0} step="any" value={newBom.overhead} onChange={(e) => setNewBom({ ...newBom, overhead: e.target.value })} className="num h-8 text-[13px]" /></Field>
              </div>
            </div>
            <div className="space-y-2">
              <div className="label-xs">Materials per finished unit</div>
              {newBom.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <NativeSelect value={l.product_id} onChange={(v) => setNewBom({ ...newBom, lines: newBom.lines.map((x, j) => (j === i ? { ...x, product_id: v } : x)) })} className="flex-1">
                    <option value="">Choose material…</option>
                    {stockItems.filter((p: any) => p.id !== newBom.product_id).map((p: any) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </NativeSelect>
                  <Input type="number" min={0} step="any" value={l.quantity_per_unit} onChange={(e) => setNewBom({ ...newBom, lines: newBom.lines.map((x, j) => (j === i ? { ...x, quantity_per_unit: e.target.value } : x)) })} className="num h-8 w-[100px] text-right text-[13px]" />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove material" onClick={() => setNewBom({ ...newBom, lines: newBom.lines.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setNewBom({ ...newBom, lines: [...newBom.lines, { product_id: "", quantity_per_unit: "1" }] })}><Plus className="mr-1 h-3.5 w-3.5" /> Add material</Button>
            </div>
          </div>
        ) : null}
      </FormDialog>
    </>
  );
}

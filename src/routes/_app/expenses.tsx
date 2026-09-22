import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTable } from "@/lib/fin-data";
import { money, shortDate, titleCase } from "@/lib/format";
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
import { ExpenseDialog, RowAction, useVoid } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Employee and company expenses categorised, VAT-split and posted automatically, with receipt-policy enforcement.",
      },
      { property: "og:title", content: "Expenses · Qyoo" },
      { property: "og:description", content: "Expenses that file themselves." },
    ],
  }),
  component: Expenses,
});

function Expenses() {
  const expenses = useTable<any>("expenses", ["e"], (q: any) => q.order("expense_date", { ascending: false }).order("number", { ascending: false }));
  const categories = useTable<any>("expense_categories", ["e"]);
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);
  const { askVoid, dialog: voidDialog } = useVoid();

  const catById = useMemo(() => {
    const m = new Map<string, string>();
    (categories.data ?? []).forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [categories.data]);

  const all = (expenses.data ?? []).filter((e: any) => e.status !== "cancelled");
  const total = all.reduce((s: number, e: any) => s + Number(e.amount) + Number(e.vat), 0);
  const vat = all.reduce((s: number, e: any) => s + Number(e.vat), 0);
  const missingDocs = all.filter((e: any) => !e.has_document && Number(e.amount) > 100);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((e: any) => {
      const k = catById.get(e.category_id) ?? "Uncategorised";
      m.set(k, (m.get(k) ?? 0) + Number(e.amount));
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [all, catById]);

  const rows = (expenses.data ?? []).filter(
    (e: any) =>
      e.merchant.toLowerCase().includes(term.toLowerCase()) ||
      (e.employee ?? "").toLowerCase().includes(term.toLowerCase()) ||
      e.number.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Cards, cash and reimbursements — categorised and VAT-split on capture"
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Record expense
          </Button>
        }
      />

      <AutomationNote>
        {all.length} expenses captured this year. Qyoo assigned the category, split recoverable VAT and
        posted each one to the ledger. {missingDocs.length} above AED 100 still lack a receipt and are
        flagged under the receipt policy.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total expenses YTD" value={money(total, true)} hint="Including VAT" />
        <Metric label="Recoverable VAT" value={money(vat, true)} hint="Input tax" />
        <Metric label="Missing receipts" value={String(missingDocs.length)} hint="Above AED 100 policy" />
        <Metric label="Categories" value={String(byCat.length)} hint="In use" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Panel title="By category">
          <ul className="divide-y divide-border">
            {byCat.map(([name, amt]) => (
              <li key={name} className="px-4 py-2.5">
                <div className="flex justify-between text-[13px]">
                  <span>{name}</span>
                  <span className="num">{money(amt)}</span>
                </div>
                <div className="mt-1.5 h-1 bg-secondary">
                  <div className="h-1 bg-foreground" style={{ width: `${(amt / (total || 1)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="All expenses"
          actions={
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Merchant, employee or number…" className="h-8 w-[220px] text-[13px]" />
          }
        >
          {expenses.isLoading ? (
            <Loading />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Number</Th>
                  <Th>Merchant</Th>
                  <Th>Category</Th>
                  <Th>Employee</Th>
                  <Th right>Net</Th>
                  <Th right>VAT</Th>
                  <Th>Receipt</Th>
                  <Th>Status</Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e: any) => (
                  <tr key={e.id} className="row-hover hover:bg-secondary/40">
                    <Td>{shortDate(e.expense_date)}</Td>
                    <Td>
                      <span className="num text-muted-foreground">{e.number}</span>
                    </Td>
                    <Td>{e.merchant}</Td>
                    <Td>{catById.get(e.category_id) ?? "—"}</Td>
                    <Td>{e.employee ?? "—"}</Td>
                    <Td right>{money(e.amount)}</Td>
                    <Td right>{money(e.vat)}</Td>
                    <Td>
                      {e.has_document ? (
                        <Pill tone="success">Attached</Pill>
                      ) : Number(e.amount) > 100 ? (
                        <Pill tone="warning">Missing</Pill>
                      ) : (
                        <Pill tone="muted">Not required</Pill>
                      )}
                    </Td>
                    <Td>
                      <Pill tone={statusTone(e.status)}>{titleCase(e.status)}</Pill>
                    </Td>
                    <Td right>
                      {e.status !== "cancelled" ? (
                        <RowAction tone="danger" onClick={() => askVoid({ type: "expense", id: e.id, label: e.number })}>
                          Void
                        </RowAction>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>
      </div>

      <ExpenseDialog open={adding} onOpenChange={setAdding} />
      {voidDialog}
    </>
  );
}

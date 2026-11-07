import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID, money, shortDate, daysBetween } from "@/lib/format";
import { PageHeader, Panel, Metric, Loading, TableShell, Th, Td, EmptyState, SegmentedTabs, Pill } from "@/components/fin/primitives";
import { PeriodPicker, presetPeriods, type Period } from "@/components/fin/period-picker";
import { NativeSelect } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/statement/$party/$id")({
  head: () => ({
    meta: [
      { title: "Statement of account · Qyoo" },
      { name: "description", content: "Customer or supplier statement of account with date range, document filters, running balance and ageing." },
      { property: "og:title", content: "Statement of account · Qyoo" },
      { property: "og:description", content: "Every invoice, payment and note in one running balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Statement,
});

type Row = { id: string; date: string; type: string; number: string; detail: string; debit: number; credit: number; open?: { due: string; balance: number } | undefined; go: () => unknown };

const BUCKETS = [
  { label: "Current", min: -99999, max: 0 },
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: 99999 },
];

function Statement() {
  const { party, id } = Route.useParams();
  const isCustomer = party === "customer";
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(() => presetPeriods().find((p) => p.label.startsWith("FY") && p.label.includes("to date"))!);
  const [type, setType] = useState("all");
  const [term, setTerm] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [mode, setMode] = useState<"Ledger-wise" | "Bill-wise">("Ledger-wise");
  const [billStatus, setBillStatus] = useState("all");

  const q = useQuery({
    queryKey: ["statement", party, id],
    queryFn: async () => {
      const db = supabase as any;
      if (isCustomer) {
        const [p, inv, pay, cn] = await Promise.all([
          db.from("customers").select("*").eq("id", id).maybeSingle(),
          db.from("invoices").select("*").eq("company_id", COMPANY_ID).eq("customer_id", id).not("status", "in", "(cancelled,draft)"),
          db.from("customer_payments").select("*").eq("company_id", COMPANY_ID).eq("customer_id", id),
          db.from("credit_notes").select("*").eq("company_id", COMPANY_ID).eq("customer_id", id).neq("status", "cancelled"),
        ]);
        return { p: p.data, docs: inv.data ?? [], pays: pay.data ?? [], notes: cn.data ?? [] };
      }
      const [p, bills, pay, dn] = await Promise.all([
        db.from("suppliers").select("*").eq("id", id).maybeSingle(),
        db.from("supplier_bills").select("*").eq("company_id", COMPANY_ID).eq("supplier_id", id).not("status", "in", "(cancelled,draft)"),
        db.from("supplier_payments").select("*").eq("company_id", COMPANY_ID).eq("supplier_id", id),
        db.from("credit_notes").select("*").eq("company_id", COMPANY_ID).eq("supplier_id", id).neq("status", "cancelled"),
      ]);
      return { p: p.data, docs: bills.data ?? [], pays: pay.data ?? [], notes: dn.data ?? [] };
    },
  });

  // Balance is expressed as "owed": customer owes us (invoices increase), we owe supplier (bills increase).
  const rows: Row[] = useMemo(() => {
    if (!q.data) return [];
    const { docs, pays, notes } = q.data;
    const out: Row[] = [];
    docs.forEach((d: any) =>
      out.push({
        id: d.id,
        date: isCustomer ? d.invoice_date : d.bill_date,
        type: isCustomer ? "Invoice" : "Bill",
        number: d.number,
        detail: isCustomer ? `Due ${shortDate(d.due_date)}` : `${d.supplier_ref ? `Ref ${d.supplier_ref} · ` : ""}Due ${shortDate(d.due_date)}`,
        debit: Number(d.total),
        credit: 0,
        open: Number(d.balance) > 0.005 ? { due: d.due_date, balance: Number(d.balance) } : undefined,
        go: () => (isCustomer ? navigate({ to: "/invoices/$id", params: { id: d.id } }) : navigate({ to: "/docs/$type/$id", params: { type: "bill", id: d.id } })),
      }),
    );
    pays.forEach((p: any) =>
      out.push({
        id: p.id,
        date: p.payment_date,
        type: isCustomer ? "Receipt" : "Payment",
        number: p.number,
        detail: p.reference ?? p.method,
        debit: 0,
        credit: Number(p.amount),
        go: () => navigate({ to: "/docs/$type/$id", params: { type: isCustomer ? "receipt" : "payment", id: p.id } }),
      }),
    );
    notes.forEach((n: any) =>
      out.push({
        id: n.id,
        date: n.note_date,
        type: isCustomer ? "Credit note" : "Debit note",
        number: n.number,
        detail: n.reason ?? "",
        debit: 0,
        credit: Number(n.total),
        go: () => navigate({ to: "/notes/$id", params: { id: n.id } }),
      }),
    );
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  }, [q.data, isCustomer, navigate]);

  const view = useMemo(() => {
    const ob = Number(q.data?.p?.opening_balance ?? 0);
    const opening = ob + rows.filter((r) => r.date < period.from).reduce((s, r) => s + r.debit - r.credit, 0);
    let run = opening;
    const inRange = rows
      .filter((r) => r.date >= period.from && r.date <= period.to)
      .map((r) => {
        run += r.debit - r.credit;
        return { ...r, balance: run };
      });
    const shown = inRange
      .filter((r) => type === "all" || r.type === type)
      .filter((r) => !openOnly || r.open)
      .filter((r) => !term || `${r.number} ${r.detail}`.toLowerCase().includes(term.toLowerCase()));
    const buckets = BUCKETS.map(() => 0);
    rows.forEach((r) => {
      if (!r.open) return;
      const d = daysBetween(r.open.due, new Date());
      const i = BUCKETS.findIndex((b) => d >= b.min && d <= b.max);
      if (i >= 0) buckets[i]! += r.open.balance;
    });
    return {
      opening,
      closing: run,
      shown,
      debit: inRange.reduce((s, r) => s + r.debit, 0),
      credit: inRange.reduce((s, r) => s + r.credit, 0),
      buckets,
    };
  }, [rows, period, type, term, openOnly, q.data]);

  const types = isCustomer ? ["Invoice", "Receipt", "Credit note"] : ["Bill", "Payment", "Debit note"];
  const back = isCustomer ? { to: "/sales", label: "Sales" } : { to: "/purchases", label: "Purchases" };

  const bills = useMemo(() => {
    if (!q.data) return [];
    const today = new Date();
    return q.data.docs
      .map((d: any) => {
        const date = isCustomer ? d.invoice_date : d.bill_date;
        const notes = q.data!.notes.filter((n: any) => (isCustomer ? n.invoice_id : n.supplier_bill_id) === d.id).reduce((s: number, n: any) => s + Number(n.total), 0);
        const total = Number(d.total);
        const balance = Math.max(0, Number(d.balance));
        const paid = Math.max(0, total - balance - notes);
        const overdue = balance > 0.005 ? Math.max(0, daysBetween(d.due_date, today)) : 0;
        const status = balance <= 0.005 ? "Paid" : overdue > 0 ? "Overdue" : balance < total - 0.005 ? "Partially paid" : "Open";
        return { id: d.id, date, due: d.due_date, number: d.number, ref: d.supplier_ref ?? "", total, paid, notes, balance, overdue, status,
          go: () => (isCustomer ? navigate({ to: "/invoices/$id", params: { id: d.id } }) : navigate({ to: "/docs/$type/$id", params: { type: "bill", id: d.id } })) };
      })
      .filter((b: any) => b.date >= period.from && b.date <= period.to)
      .filter((b: any) => billStatus === "all" || (billStatus === "open" ? b.balance > 0.005 : b.status === "Overdue"))
      .filter((b: any) => !term || `${b.number} ${b.ref}`.toLowerCase().includes(term.toLowerCase()))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [q.data, isCustomer, navigate, period, billStatus, term]);

  const exportCsv = () => {
    if (mode === "Bill-wise") {
      const head = "Date,Number,Due,Amount,Paid,Notes,Outstanding,Days overdue,Status";
      const body = bills.map((b: any) => [b.date, b.number, b.due, b.total, b.paid.toFixed(2), b.notes, b.balance, b.overdue, b.status].join(","));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([[head, ...body].join("\n")], { type: "text/csv" }));
      a.download = `bills-${q.data?.p?.name ?? id}-${period.from}-${period.to}.csv`;
      a.click();
      return;
    }
    const head = "Date,Type,Number,Detail,Debit,Credit,Balance";
    const body = view.shown.map((r) => [r.date, r.type, r.number, `"${r.detail.replace(/"/g, "'")}"`, r.debit, r.credit, r.balance.toFixed(2)].join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head, ...body].join("\n")], { type: "text/csv" }));
    a.download = `statement-${q.data?.p?.name ?? id}-${period.from}-${period.to}.csv`;
    a.click();
  };

  if (q.isLoading) return <Loading rows={10} />;
  if (!q.data?.p) return <EmptyState title={isCustomer ? "Customer not found" : "Supplier not found"} />;
  const p = q.data.p;

  return (
    <>
      <PageHeader
        title={`Statement of account · ${p.name}`}
        subtitle={[p.code, p.trn ? `TRN ${p.trn}` : null, `${p.payment_terms_days} days terms`].filter(Boolean).join(" · ")}
        back={back}
        actions={<Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Opening balance" value={money(view.opening, true)} hint={`Before ${shortDate(period.from)}`} />
        <Metric label={isCustomer ? "Invoiced" : "Billed"} value={money(view.debit, true)} />
        <Metric label={isCustomer ? "Received & credited" : "Paid & debited"} value={money(view.credit, true)} />
        <Metric label="Closing balance" value={money(view.closing, true)} hint={isCustomer ? "Owed to you" : "You owe"} />
      </div>
      <Panel title="Outstanding by age">
        <div className="grid gap-px bg-border sm:grid-cols-5">
          {BUCKETS.map((b, i) => (
            <div key={b.label} className="bg-card px-4 py-4">
              <div className="label-xs">{b.label}</div>
              <div className="num mt-1.5 text-[16px] font-medium">{money(view.buckets[i])}</div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <SegmentedTabs items={["Ledger-wise", "Bill-wise"] as const} value={mode} onChange={setMode} label="Statement view" />
        <PeriodPicker value={period} onChange={setPeriod} />
        {mode === "Ledger-wise" ? (<>
        <NativeSelect value={type} onChange={setType} className="w-[150px]">
          <option value="all">All documents</option>
          {types.map((t) => <option key={t} value={t}>{t}s</option>)}
        </NativeSelect>
        <NativeSelect value={openOnly ? "open" : "all"} onChange={(v) => setOpenOnly(v === "open")} className="w-[130px]">
          <option value="all">All items</option>
          <option value="open">Open items only</option>
        </NativeSelect>
        </>) : (
        <NativeSelect value={billStatus} onChange={setBillStatus} className="w-[150px]">
          <option value="all">All {isCustomer ? "invoices" : "bills"}</option>
          <option value="open">Open only</option>
          <option value="overdue">Overdue only</option>
        </NativeSelect>
        )}
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Number or reference…" className="ml-auto h-8 w-[220px] text-[13px]" />
      </div>
      {mode === "Bill-wise" ? (
      <Panel>
        {!bills.length ? (
          <EmptyState title={`No ${isCustomer ? "invoices" : "bills"} in this range`} hint="Change the dates or filters." />
        ) : (
          <TableShell>
            <thead>
              <tr><Th>Date</Th><Th>Number</Th><Th>Due</Th><Th right>Amount</Th><Th right>{isCustomer ? "Received" : "Paid"}</Th><Th right>{isCustomer ? "Credit notes" : "Debit notes"}</Th><Th right>Outstanding</Th><Th right>Overdue</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {bills.map((b: any) => (
                <tr key={b.id} className="row-hover cursor-pointer hover:bg-secondary/40" onClick={b.go}>
                  <Td>{shortDate(b.date)}</Td>
                  <Td><span className="num font-medium">{b.number}</span></Td>
                  <Td>{shortDate(b.due)}</Td>
                  <Td right>{money(b.total)}</Td>
                  <Td right>{b.paid ? money(b.paid) : ""}</Td>
                  <Td right>{b.notes ? money(b.notes) : ""}</Td>
                  <Td right>{money(b.balance)}</Td>
                  <Td right>{b.overdue ? `${b.overdue} d` : ""}</Td>
                  <Td><Pill tone={b.status === "Paid" ? "success" : b.status === "Overdue" ? "critical" : b.status === "Partially paid" ? "warning" : "neutral"}>{b.status}</Pill></Td>
                </tr>
              ))}
              <tr className="font-medium"><Td>Total</Td><Td>{""}</Td><Td>{""}</Td>
                <Td right>{money(bills.reduce((s: number, b: any) => s + b.total, 0))}</Td>
                <Td right>{money(bills.reduce((s: number, b: any) => s + b.paid, 0))}</Td>
                <Td right>{money(bills.reduce((s: number, b: any) => s + b.notes, 0))}</Td>
                <Td right>{money(bills.reduce((s: number, b: any) => s + b.balance, 0))}</Td><Td right>{""}</Td><Td>{""}</Td></tr>
            </tbody>
          </TableShell>
        )}
      </Panel>
      ) : (
      <Panel>
        {!view.shown.length ? (
          <EmptyState title="No transactions in this range" hint="Change the dates or filters." />
        ) : (
          <TableShell>
            <thead>
              <tr><Th>Date</Th><Th>Type</Th><Th>Number</Th><Th>Detail</Th><Th right>{isCustomer ? "Debit" : "Credit"}</Th><Th right>{isCustomer ? "Credit" : "Debit"}</Th><Th right>Open</Th><Th right>Balance</Th></tr>
            </thead>
            <tbody>
              <tr className="text-muted-foreground"><Td>{shortDate(period.from)}</Td><Td>{""}</Td><Td>{""}</Td><Td>Opening balance</Td><Td right>{""}</Td><Td right>{""}</Td><Td right>{""}</Td><Td right>{money(view.opening)}</Td></tr>
              {view.shown.map((r) => (
                <tr key={r.id} className="row-hover cursor-pointer hover:bg-secondary/40" onClick={r.go}>
                  <Td>{shortDate(r.date)}</Td>
                  <Td>{r.type}</Td>
                  <Td><span className="num font-medium">{r.number}</span></Td>
                  <Td className="max-w-[280px] truncate text-muted-foreground">{r.detail}</Td>
                  <Td right>{r.debit ? money(r.debit) : ""}</Td>
                  <Td right>{r.credit ? money(r.credit) : ""}</Td>
                  <Td right>{r.open ? money(r.open.balance) : ""}</Td>
                  <Td right>{money(r.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
      )}
    </>
  );
}

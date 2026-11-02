import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_ID, money, shortDate, titleCase } from "@/lib/format";
import { PageHeader, Panel, Metric, Loading, TableShell, Th, Td, Pill, EmptyState } from "@/components/fin/primitives";
import { PeriodPicker, presetPeriods, type Period } from "@/components/fin/period-picker";
import { NativeSelect } from "@/components/fin/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/accounting_/$code")({
  head: () => ({
    meta: [
      { title: "General ledger · Qyoo" },
      { name: "description", content: "Account detail and general ledger with date range, source and text filters plus running balance." },
      { property: "og:title", content: "General ledger · Qyoo" },
      { property: "og:description", content: "Every posting behind a balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ledger,
});

const fyToDate = () => presetPeriods().find((p) => p.label.startsWith("FY") && p.label.includes("to date"))!;

function Ledger() {
  const { code } = Route.useParams();
  const [period, setPeriod] = useState<Period>(fyToDate);
  const [term, setTerm] = useState("");
  const [source, setSource] = useState("all");
  const [side, setSide] = useState("all");

  const account = useQuery({
    queryKey: ["accounts", "one", code],
    queryFn: async () => (await supabase.from("accounts").select("*").eq("company_id", COMPANY_ID).eq("code", code).maybeSingle()).data,
  });
  const lines = useQuery({
    queryKey: ["jel", "account", code],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("journal_entry_lines")
        .select("id,description,debit,credit,journal_entries!inner(id,number,entry_date,memo,source,ref_type,ref_label,company_id)")
        .eq("account_code", code)
        .eq("journal_entries.company_id", COMPANY_ID)
        .limit(10000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[])
        .map((l) => ({ ...l, je: l.journal_entries }))
        .sort((a, b) => a.je.entry_date.localeCompare(b.je.entry_date) || a.je.number.localeCompare(b.je.number));
    },
  });

  const creditNormal = ["liability", "equity", "revenue"].includes(account.data?.type ?? "");
  const sign = (d: number, c: number) => (creditNormal ? c - d : d - c);

  const view = useMemo(() => {
    const all = lines.data ?? [];
    const opening = all.filter((l) => l.je.entry_date < period.from).reduce((s, l) => s + sign(Number(l.debit), Number(l.credit)), 0);
    let run = opening;
    const rows = all
      .filter((l) => l.je.entry_date >= period.from && l.je.entry_date <= period.to)
      .map((l) => {
        run += sign(Number(l.debit), Number(l.credit));
        return { ...l, balance: run };
      })
      .filter((l) => (source === "all" ? true : source === "manual" ? l.je.source === "manual" : l.je.source !== "manual"))
      .filter((l) => (side === "all" ? true : side === "debit" ? Number(l.debit) > 0 : Number(l.credit) > 0))
      .filter((l) => {
        const t = term.toLowerCase();
        return !t || [l.je.number, l.je.memo, l.description, l.je.ref_label].some((x) => (x ?? "").toLowerCase().includes(t));
      });
    const debit = rows.reduce((s, l) => s + Number(l.debit), 0);
    const credit = rows.reduce((s, l) => s + Number(l.credit), 0);
    return { opening, rows, debit, credit, closing: run };
  }, [lines.data, period, term, source, side, creditNormal]);

  const exportCsv = () => {
    const head = "Date,Entry,Memo,Reference,Debit,Credit,Balance";
    const body = view.rows.map((l) => [l.je.entry_date, l.je.number, `"${(l.je.memo ?? "").replace(/"/g, "'")}"`, l.je.ref_label ?? "", l.debit, l.credit, l.balance.toFixed(2)].join(","));
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ledger-${code}-${period.from}-${period.to}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        title={`${code} · ${account.data?.name ?? "Account"}`}
        subtitle={`${titleCase(account.data?.type)}${account.data?.subtype ? ` · ${titleCase(account.data.subtype)}` : ""} · general ledger`}
        back={{ to: "/accounting", label: "Accounting" }}
        actions={<Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Opening balance" value={money(view.opening, true)} hint={`Before ${shortDate(period.from)}`} />
        <Metric label="Debits" value={money(view.debit, true)} hint={`${view.rows.length} lines`} />
        <Metric label="Credits" value={money(view.credit, true)} />
        <Metric label="Closing balance" value={money(view.closing, true)} hint={`At ${shortDate(period.to)}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <PeriodPicker value={period} onChange={setPeriod} />
        <NativeSelect value={source} onChange={setSource} className="w-[140px]">
          <option value="all">All sources</option>
          <option value="system">Qyoo</option>
          <option value="manual">Manual</option>
        </NativeSelect>
        <NativeSelect value={side} onChange={setSide} className="w-[130px]">
          <option value="all">Debit & credit</option>
          <option value="debit">Debits only</option>
          <option value="credit">Credits only</option>
        </NativeSelect>
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Entry, memo, reference…" className="ml-auto h-8 w-[220px] text-[13px]" />
      </div>
      <Panel>
        {lines.isLoading ? (
          <Loading rows={10} />
        ) : !view.rows.length ? (
          <EmptyState title="No postings in this range" hint="Change the dates or filters." />
        ) : (
          <TableShell>
            <thead>
              <tr><Th>Date</Th><Th>Entry</Th><Th>Memo</Th><Th>Source</Th><Th>Reference</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Balance</Th></tr>
            </thead>
            <tbody>
              <tr className="text-muted-foreground"><Td>{shortDate(period.from)}</Td><Td>{""}</Td><Td>Opening balance</Td><Td>{""}</Td><Td>{""}</Td><Td right>{""}</Td><Td right>{""}</Td><Td right>{money(view.opening)}</Td></tr>
              {view.rows.map((l) => (
                <tr key={l.id} className="row-hover hover:bg-secondary/40">
                  <Td>{shortDate(l.je.entry_date)}</Td>
                  <Td><span className="num">{l.je.number}</span></Td>
                  <Td className="max-w-[320px] truncate">{l.description ?? l.je.memo}</Td>
                  <Td><Pill tone={l.je.source === "manual" ? "neutral" : "signal"}>{l.je.source === "manual" ? "Manual" : "Qyoo"}</Pill></Td>
                  <Td><span className="num text-xs text-muted-foreground">{l.je.ref_label ?? titleCase(l.je.ref_type)}</span></Td>
                  <Td right>{Number(l.debit) ? money(l.debit) : ""}</Td>
                  <Td right>{Number(l.credit) ? money(l.credit) : ""}</Td>
                  <Td right>{money(l.balance)}</Td>
                </tr>
              ))}
              <tr className="font-medium"><Td>{""}</Td><Td>{""}</Td><Td>Totals</Td><Td>{""}</Td><Td>{""}</Td><Td right>{money(view.debit)}</Td><Td right>{money(view.credit)}</Td><Td right>{money(view.closing)}</Td></tr>
            </tbody>
          </TableShell>
        )}
      </Panel>
    </>
  );
}

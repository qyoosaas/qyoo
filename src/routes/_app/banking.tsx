import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTable, rankMatches } from "@/lib/fin-data";
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
  Confidence,
  AutomationNote,
} from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RunAutomationButton } from "@/components/fin/automation-button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/banking")({
  head: () => ({
    meta: [
      { title: "Banking · FIN Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Bank feeds, automatic transaction matching and reconciliation status across every account, with suggested matches and confidence scoring.",
      },
      { property: "og:title", content: "Banking · FIN" },
      { property: "og:description", content: "Reconciliation that keeps itself current." },
    ],
  }),
  component: Banking,
});

const FILTERS = ["all", "matched", "suggested", "unmatched"] as const;

function Banking() {
  const qc = useQueryClient();
  const accounts = useTable<any>("bank_accounts", ["b"], (q: any) => q.order("name"));
  const txns = useTable<any>("bank_transactions", ["b"], (q: any) =>
    q.order("txn_date", { ascending: false }).limit(500),
  );
  const recs = useTable<any>("bank_reconciliations", ["b"], (q: any) => q.order("period_label", { ascending: false }));
  const invoices = useTable<any>("invoices", ["b"], (q: any) => q.gt("balance", 0));
  const bills = useTable<any>("supplier_bills", ["b"], (q: any) => q.gt("balance", 0));

  const [account, setAccount] = useState<string>("all");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [term, setTerm] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    let r = txns.data ?? [];
    if (account !== "all") r = r.filter((t: any) => t.bank_account_id === account);
    if (filter !== "all") r = r.filter((t: any) => t.status === filter);
    if (term) r = r.filter((t: any) => t.description.toLowerCase().includes(term.toLowerCase()));
    return r;
  }, [txns.data, account, filter, term]);

  const all = txns.data ?? [];
  const matched = all.filter((t: any) => t.status === "matched").length;
  const unmatched = all.filter((t: any) => t.status === "unmatched").length;
  const suggested = all.filter((t: any) => t.status === "suggested").length;

  const confirm = async (txn: any, label: string, confidence: number) => {
    const { error } = await supabase
      .from("bank_transactions")
      .update({
        status: "matched",
        match_type: "manual",
        matched_label: label,
        confidence,
        reconciled: true,
      })
      .eq("id", txn.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
    toast.success(`Matched to ${label}`);
    setExpanded(null);
  };

  return (
    <>
      <PageHeader
        title="Banking"
        subtitle="Live feeds from Emirates NBD, Mashreq and FAB — matched as transactions land"
        actions={<RunAutomationButton variant="default" />}
      />

      <AutomationNote>
        {matched.toLocaleString()} of {all.length.toLocaleString()} imported lines matched
        automatically at 95%+ confidence. {suggested} carry a suggestion for you to confirm and{" "}
        {unmatched} found no candidate at all.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(accounts.data ?? []).map((a: any) => (
          <Metric
            key={a.id}
            label={`${a.name} · ${a.bank_name}`}
            value={money(a.current_balance, true)}
            hint={`${a.account_number_masked} · ${titleCase(a.reconciliation_status)}`}
          />
        ))}
        <Metric
          label="Auto-match rate"
          value={`${all.length ? ((matched / all.length) * 100).toFixed(1) : "0"}%`}
          hint={`${unmatched} unmatched lines`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="h-8 rounded-sm border border-border bg-card px-2 text-[13px]"
        >
          <option value="all">All accounts</option>
          {(accounts.data ?? []).map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[13px] capitalize",
              filter === f ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {f}
          </button>
        ))}
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search descriptions…"
          className="ml-auto h-8 w-[240px] text-[13px]"
        />
      </div>

      {txns.isLoading ? (
        <Loading rows={12} />
      ) : (
        <Panel title="Transactions" description={`${rows.length} lines`}>
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
                <Th>Matched to</Th>
                <Th>Confidence</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map((t: any) => {
                const isOpen = expanded === t.id;
                const candidates =
                  isOpen && t.status !== "matched"
                    ? rankMatches(t, invoices.data ?? [], bills.data ?? [])
                    : [];
                return (
                  <>
                    <tr
                      key={t.id}
                      className="row-hover cursor-pointer hover:bg-secondary/40"
                      onClick={() => setExpanded(isOpen ? null : t.id)}
                    >
                      <Td>{shortDate(t.txn_date)}</Td>
                      <Td className="max-w-[320px] truncate">{t.description}</Td>
                      <Td>
                        <span className="num text-muted-foreground">{t.reference ?? "—"}</span>
                      </Td>
                      <Td right>
                        <span className={t.direction === "in" ? "text-success" : undefined}>
                          {t.direction === "in" ? "+" : "−"}
                          {money(Math.abs(Number(t.amount)))}
                        </span>
                      </Td>
                      <Td>{t.matched_label ?? "—"}</Td>
                      <Td>
                        <Confidence value={t.confidence} />
                      </Td>
                      <Td>
                        <Pill tone={statusTone(t.status)}>{titleCase(t.status)}</Pill>
                      </Td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${t.id}-x`}>
                        <td colSpan={7} className="border-b border-border bg-secondary/40 px-4 py-4">
                          {t.status === "matched" ? (
                            <p className="text-[13px] text-muted-foreground">
                              Matched to <span className="text-foreground">{t.matched_label}</span> by{" "}
                              {titleCase(t.match_type ?? "rule")} at {Number(t.confidence).toFixed(0)}%
                              confidence and posted to the ledger.
                            </p>
                          ) : candidates.length === 0 ? (
                            <p className="text-[13px] text-muted-foreground">
                              No candidate above the matching threshold. FIN raised this as an
                              exception rather than guessing.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <div className="label-xs">Suggested matches</div>
                              {candidates.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card px-3 py-2.5"
                                >
                                  <span className="num text-[13px] font-medium">{c.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {c.counterparty || titleCase(c.kind)} · {shortDate(c.date)}
                                  </span>
                                  <span className="num text-[13px]">{money(c.amount)}</span>
                                  <Confidence value={c.confidence} />
                                  <span className="hidden max-w-[380px] truncate text-xs text-muted-foreground lg:block">
                                    {c.reasons.join(" · ")}
                                  </span>
                                  <Button
                                    size="sm"
                                    className="ml-auto"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      confirm(t, c.label, c.confidence);
                                    }}
                                  >
                                    Confirm match
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </TableShell>
        </Panel>
      )}

      <Panel title="Reconciliation status" description="Statement balance against ledger balance">
        <TableShell>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th right>Statement</Th>
              <Th right>Ledger</Th>
              <Th right>Difference</Th>
              <Th right>Matched</Th>
              <Th right>Unmatched</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(recs.data ?? []).map((r: any) => (
              <tr key={r.id}>
                <Td>{r.period_label}</Td>
                <Td right>{money(r.statement_balance)}</Td>
                <Td right>{money(r.ledger_balance)}</Td>
                <Td right>
                  <span className={Number(r.difference) !== 0 ? "text-warning" : undefined}>
                    {money(r.difference)}
                  </span>
                </Td>
                <Td right>{r.matched_count}</Td>
                <Td right>{r.unmatched_count}</Td>
                <Td>
                  <Pill tone={statusTone(r.status)}>{titleCase(r.status)}</Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Panel>
    </>
  );
}

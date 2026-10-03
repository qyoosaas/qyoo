import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
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
  SegmentedTabs,
} from "@/components/fin/primitives";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RunAutomationButton } from "@/components/fin/automation-button";
import { FormDialog, ConfirmDialog, Field, NativeSelect } from "@/components/fin/forms";
import { actions, useAction, isoToday } from "@/lib/fin-actions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/banking")({
  validateSearch: (search: Record<string, unknown>) => ({ action: typeof search['action'] === "string" ? search['action'] : "" }),
  head: () => ({
    meta: [
      { title: "Banking · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Import bank statements, allocate receipts and payments to invoices, bills or ledger accounts, and reconcile every account against its statement balance.",
      },
      { property: "og:title", content: "Banking · Qyoo" },
      { property: "og:description", content: "Reconciliation that keeps itself current." },
    ],
  }),
  component: Banking,
});

const FILTERS = ["all", "matched", "suggested", "unmatched"] as const;

/* ---------- statement parsing ---------- */

type ParsedRow = { txn_date: string; description: string; reference: string | null; amount: number; direction: string };

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === "\t" || ch === ";") && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = m[2]!.padStart(2, "0");
    let y = m[3]!;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const num = (v: string | undefined) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.\-()]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : 0;
};

/** Reads CSV/TSV text with a header row. Understands amount, or debit/credit columns. */
export function parseStatement(text: string): { rows: ParsedRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idx = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx("date");
  const iDesc = idx("description", "narration", "particular", "details");
  const iRef = idx("reference", "ref", "cheque");
  const iAmount = idx("amount", "value");
  const iDebit = idx("debit", "withdrawal", "paidout");
  const iCredit = idx("credit", "deposit", "paidin");

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const date = iDate >= 0 ? toIsoDate(c[iDate] ?? "") : null;
    let amount = iAmount >= 0 ? num(c[iAmount]) : 0;
    if (!amount && (iDebit >= 0 || iCredit >= 0)) {
      const dr = iDebit >= 0 ? num(c[iDebit]) : 0;
      const cr = iCredit >= 0 ? num(c[iCredit]) : 0;
      amount = cr > 0 ? cr : -dr;
    }
    if (!date || !amount) {
      skipped++;
      continue;
    }
    rows.push({
      txn_date: date,
      description: (iDesc >= 0 ? c[iDesc] : "") || "Bank line",
      reference: (iRef >= 0 ? c[iRef] : "") || null,
      amount: Math.abs(amount),
      direction: amount < 0 ? "out" : "in",
    });
  }
  return { rows, skipped };
}

function Banking() {
  const { action } = Route.useSearch();
  const navigate = Route.useNavigate();
  const accounts = useTable<any>("bank_accounts", ["b"], (q: any) => q.order("name"));
  const txns = useTable<any>("bank_transactions", ["b"], (q: any) =>
    q.order("txn_date", { ascending: false }).limit(500),
  );
  const recs = useTable<any>("bank_reconciliations", ["b"], (q: any) => q.order("created_at", { ascending: false }));
  const invoices = useTable<any>("invoices", ["b"], (q: any) => q.gt("balance", 0));
  const bills = useTable<any>("supplier_bills", ["b"], (q: any) => q.gt("balance", 0));
  const glAccounts = useTable<any>("accounts", ["b"], (q: any) => q.eq("is_group", false).order("code"));

  const [account, setAccount] = useState<string>("all");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [term, setTerm] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [pending, setPending] = useState<
    | null
    | { txn: any; kind: "invoice" | "bill" | "gl"; target?: string; code?: string; label: string }
  >(null);
  const [glPick, setGlPick] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    let r = txns.data ?? [];
    if (account !== "all") r = r.filter((t: any) => t.bank_account_id === account);
    if (filter !== "all") r = r.filter((t: any) => t.status === filter);
    if (term) r = r.filter((t: any) => (t.description ?? "").toLowerCase().includes(term.toLowerCase()));
    return r;
  }, [txns.data, account, filter, term]);

  const all = txns.data ?? [];
  const matched = all.filter((t: any) => t.status === "matched").length;
  const unmatched = all.filter((t: any) => t.status === "unmatched").length;
  const suggested = all.filter((t: any) => t.status === "suggested").length;

  useEffect(() => {
    if (action === "import") setImportOpen(true);
    if (action === "reconcile") setReconcileOpen(true);
    if (action) navigate({ search: { action: "" }, replace: true });
  }, [action, navigate]);

  const allocate = useAction(
    (p: { txn_id: string; kind: "invoice" | "bill" | "gl"; target_id?: string | null; account_code?: string | null }) =>
      actions.allocateBankTransaction(p),
    {
      scope: "bank_allocate",
      success: "Bank line allocated and posted",
      onSuccess: () => {
        setPending(null);
        setExpanded(null);
      },
    },
  );

  const reject = useAction((id: string) => actions.unmatchBankTransaction(id), {
    scope: "bank_unmatch",
    success: "Suggestion rejected — line back in the queue",
  });

  return (
    <>
      <PageHeader
        title="Banking"
        subtitle="Live feeds from Emirates NBD, Mashreq and FAB — matched as transactions land"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              Import statement
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
              Reconcile
            </Button>
            <RunAutomationButton variant="default" />
          </div>
        }
      />

      <AutomationNote>
        {matched.toLocaleString()} of {all.length.toLocaleString()} imported lines matched automatically at 95%+
        confidence. {suggested} carry a suggestion for you to confirm and {unmatched} found no candidate at all.
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
        <SegmentedTabs items={FILTERS} value={filter} onChange={setFilter} label="Transaction status" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search descriptions…"
          className="ml-auto h-8 w-[240px] text-[13px]"
        />
      </div>

      {txns.isLoading ? (
        <Loading rows={12} />
      ) : rows.length === 0 ? (
        <Panel title="Transactions">
          <p className="p-6 text-[13px] text-muted-foreground">
            No bank lines here yet. Import a statement to bring in receipts and payments, then allocate them to
            invoices, bills or ledger accounts.
          </p>
        </Panel>
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
                  isOpen && t.status !== "matched" ? rankMatches(t, invoices.data ?? [], bills.data ?? []) : [];
                return (
                  <Fragment key={t.id}>
                    <tr
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
                      <tr>
                        <td colSpan={7} className="border-b border-border bg-secondary/40 px-4 py-4">
                          {t.status === "matched" ? (
                            <p className="text-[13px] text-muted-foreground">
                              Matched to <span className="text-foreground">{t.matched_label}</span> by{" "}
                              {titleCase(t.match_type ?? "rule")} at {Number(t.confidence ?? 100).toFixed(0)}% confidence
                              and posted to the ledger.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {candidates.length === 0 ? (
                                <p className="text-[13px] text-muted-foreground">
                                  No open invoice or bill matches this line. Allocate it straight to a ledger account
                                  below.
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
                                          setPending({
                                            txn: t,
                                            kind: c.kind === "invoice" ? "invoice" : "bill",
                                            target: c.id,
                                            label: c.label,
                                          });
                                        }}
                                      >
                                        Allocate & post
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap items-end gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
                                <Field label="Post to ledger account" className="w-[320px]">
                                  <NativeSelect
                                    value={glPick[t.id] ?? ""}
                                    onChange={(v) => setGlPick((s) => ({ ...s, [t.id]: v }))}
                                  >
                                    <option value="">Select account…</option>
                                    {(glAccounts.data ?? []).map((a: any) => (
                                      <option key={a.id} value={a.code}>
                                        {a.code} — {a.name}
                                      </option>
                                    ))}
                                  </NativeSelect>
                                </Field>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!glPick[t.id]}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setPending({
                                      txn: t,
                                      kind: "gl",
                                      code: glPick[t.id]!,
                                      label: `ledger account ${glPick[t.id]}`,
                                    });
                                  }}
                                >
                                  Post to ledger
                                </Button>
                                {t.status === "suggested" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      reject.mutate(t.id);
                                    }}
                                  >
                                    Reject suggestion
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
                  <span className={Number(r.difference) !== 0 ? "text-warning" : undefined}>{money(r.difference)}</span>
                </Td>
                <Td right>{r.matched_count}</Td>
                <Td right>{r.unmatched_count}</Td>
                <Td>
                  <Pill tone={statusTone(r.status)}>{titleCase(r.status)}</Pill>
                </Td>
              </tr>
            ))}
            {(recs.data ?? []).length === 0 ? (
              <tr>
                <Td>No reconciliation recorded yet.</Td>
                <Td right>—</Td>
                <Td right>—</Td>
                <Td right>—</Td>
                <Td right>—</Td>
                <Td right>—</Td>
                <Td>—</Td>
              </tr>
            ) : null}
          </tbody>
        </TableShell>
      </Panel>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} accounts={accounts.data ?? []} />
      <ReconcileDialog open={reconcileOpen} onOpenChange={setReconcileOpen} accounts={accounts.data ?? []} />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title={pending?.kind === "gl" ? "Post this line to the ledger?" : `Allocate to ${pending?.label ?? ""}?`}
        description={
          pending?.kind === "gl"
            ? "A journal entry is posted against the bank account and this line is marked reconciled."
            : "A receipt or payment is recorded, the document balance is updated and the ledger entries are posted. This is audited and cannot be edited afterwards — only reversed."
        }
        confirmLabel="Allocate & post"
        onConfirm={() =>
          pending &&
          allocate.mutate({
            txn_id: pending.txn.id,
            kind: pending.kind,
            target_id: pending.target ?? null,
            account_code: pending.code ?? null,
          })
        }
      />
    </>
  );
}

/* ---------- import ---------- */

function ImportDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: any[];
}) {
  const [bank, setBank] = useState("");
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseStatement(text) : { rows: [], skipped: 0 }), [text]);

  const mut = useAction(
    async () => {
      if (!bank) throw new Error("Choose the bank account this statement belongs to");
      if (parsed.rows.length === 0)
        throw new Error("No usable lines found. The file needs a header row with date, description and amount.");
      return actions.importBankTransactions({ bank_account_id: bank, rows: parsed.rows });
    },
    {
      scope: "bank_import",
      success: (r: any) => `${r.imported} lines imported · ${r.suggested} pre-matched · ${r.duplicates} duplicates skipped`,
      onSuccess: () => {
        setText("");
        onOpenChange(false);
      },
    },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import bank statement"
      description="Upload or paste a CSV export from your bank. Lines already imported are skipped, and open invoices and bills are pre-matched."
      onSubmit={() => mut.mutate(undefined as never)}
      submitLabel="Import lines"
      busy={mut.isPending}
      wide
      extra={text.trim() ? `${parsed.rows.length} lines ready · ${parsed.skipped} ignored` : null}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bank account">
          <NativeSelect value={bank} onChange={setBank}>
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.bank_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Statement file (CSV)">
          <Input
            type="file"
            accept=".csv,.txt,text/csv"
            className="h-8 text-[13px]"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </Field>
      </div>
      <Field label="…or paste the statement">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="num text-[12px]"
          placeholder={"Date,Description,Reference,Amount\n2026-08-04,Al Futtaim payment,INV-10412,52500\n2026-08-05,Etisalat direct debit,,-1240"}
        />
      </Field>
      {parsed.rows.length > 0 ? (
        <div className="max-h-[220px] overflow-y-auto rounded-sm border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-secondary/60 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-normal">Date</th>
                <th className="px-2 py-1.5 font-normal">Description</th>
                <th className="px-2 py-1.5 font-normal">Reference</th>
                <th className="px-2 py-1.5 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {parsed.rows.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{shortDate(r.txn_date)}</td>
                  <td className="px-2 py-1">{r.description}</td>
                  <td className="px-2 py-1 text-muted-foreground">{r.reference ?? "—"}</td>
                  <td className={cn("num px-2 py-1 text-right", r.direction === "in" && "text-success")}>
                    {r.direction === "in" ? "+" : "−"}
                    {money(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FormDialog>
  );
}

/* ---------- reconcile ---------- */

function ReconcileDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: any[];
}) {
  const [bank, setBank] = useState("");
  const [period, setPeriod] = useState(isoToday().slice(0, 7));
  const [balance, setBalance] = useState("");
  const acct = accounts.find((a) => a.id === bank);
  const diff = acct ? Number(balance || 0) - Number(acct.ledger_balance) : 0;

  const mut = useAction(
    async () => {
      if (!bank) throw new Error("Choose a bank account");
      if (!period.trim()) throw new Error("Enter the period this statement covers");
      return actions.reconcileBankAccount({
        bank_account_id: bank,
        period_label: period.trim(),
        statement_balance: Number(balance || 0),
      });
    },
    { scope: "bank_reconcile", success: "Reconciliation saved", onSuccess: () => onOpenChange(false) },
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reconcile bank account"
      description="Enter the closing balance on the bank statement. Qyoo compares it against the ledger and records the difference."
      onSubmit={() => mut.mutate(undefined as never)}
      submitLabel="Save reconciliation"
      busy={mut.isPending}
      extra={acct ? `Ledger balance ${money(acct.ledger_balance)} · difference ${money(diff)}` : null}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bank account" className="sm:col-span-2">
          <NativeSelect value={bank} onChange={setBank}>
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.bank_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Period">
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 text-[13px]" placeholder="2026-08" />
        </Field>
        <Field label="Statement closing balance (AED)">
          <Input
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="num h-8 text-[13px]"
          />
        </Field>
      </div>
    </FormDialog>
  );
}

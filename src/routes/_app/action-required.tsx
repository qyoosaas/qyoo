import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useExceptions } from "@/lib/fin-data";
import { money, shortDate, titleCase } from "@/lib/format";
import {
  PageHeader,
  Panel,
  Pill,
  Confidence,
  Loading,
  EmptyState,
  AutomationNote,
  Metric,
} from "@/components/fin/primitives";
import { ExceptionDrawer } from "@/components/fin/exception-drawer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/action-required")({
  head: () => ({
    meta: [
      { title: "Action Required · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Every finance exception that needs a human decision, ranked by impact — with the reason, the recommendation and the accounting entry that will post.",
      },
      { property: "og:title", content: "Action Required · Qyoo" },
      { property: "og:description", content: "Only what genuinely needs a decision." },
    ],
  }),
  component: ActionRequired,
});

const FILTERS = ["all", "critical", "high", "medium", "low", "resolved"] as const;

function ActionRequired() {
  const { data, isLoading } = useExceptions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [selected, setSelected] = useState<any | null>(null);

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === "all") return all.filter((e: any) => !["resolved", "dismissed"].includes(e.status));
    if (filter === "resolved") return all.filter((e: any) => ["resolved", "dismissed"].includes(e.status));
    return all.filter(
      (e: any) => e.priority === filter && !["resolved", "dismissed"].includes(e.status),
    );
  }, [data, filter]);

  const open = (data ?? []).filter((e: any) => !["resolved", "dismissed"].includes(e.status));
  const exposure = open.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const resolved = (data ?? []).filter((e: any) => ["resolved", "dismissed"].includes(e.status));

  return (
    <>
      <PageHeader
        title="Action Required"
        subtitle="The only queue in Qyoo. Everything else posted itself."
      />

      <AutomationNote>
        Qyoo cleared everything it could match with confidence. {open.length} items remain, worth{" "}
        <strong className="font-medium">{money(exposure, true)}</strong> in financial exposure.
        Each one shows what happened, why it stopped, and the entry that posts when you decide.
      </AutomationNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open exceptions" value={String(open.length)} hint="Awaiting a decision" />
        <Metric
          label="Critical"
          value={String(open.filter((e: any) => e.priority === "critical").length)}
          hint="Escalate today"
        />
        <Metric label="Value at risk" value={money(exposure, true)} hint="Across open items" />
        <Metric label="Resolved YTD" value={String(resolved.length)} hint="With full audit trail" />
      </div>

      <Panel
        title="Exception queue"
        description="Sorted by priority, then most recent"
        actions={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-sm px-2 py-1 text-[11px] font-medium capitalize",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing here" hint="No exceptions match this filter." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((e: any) => (
              <li key={e.id}>
                <button
                  onClick={() => setSelected(e)}
                  className="row-hover w-full px-4 py-3.5 text-left hover:bg-secondary/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill
                          tone={
                            e.priority === "critical"
                              ? "critical"
                              : e.priority === "high"
                                ? "warning"
                                : "muted"
                          }
                        >
                          {titleCase(e.priority)}
                        </Pill>
                        <span className="num text-[11px] text-muted-foreground">{e.code}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {titleCase(e.type)}
                        </span>
                        {["resolved", "dismissed"].includes(e.status) ? (
                          <Pill tone="success">{titleCase(e.status)}</Pill>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[13.5px] font-medium">{e.title}</p>
                      <p className="mt-1 max-w-[720px] text-xs leading-relaxed text-muted-foreground">
                        {e.recommendation}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {titleCase(e.entity_type)} · {e.entity_label} ·{" "}
                        {shortDate(e.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-[15px] font-medium">{money(e.amount)}</div>
                      <div className="mt-1.5 flex justify-end">
                        <Confidence value={e.confidence} />
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ExceptionDrawer exception={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}

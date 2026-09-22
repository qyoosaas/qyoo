import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { money, shortDate, titleCase } from "@/lib/format";
import { Confidence, Pill } from "./primitives";
import { toast } from "sonner";

export const ACTION_LABELS: Record<string, string> = {
  record_discount: "Record as discount",
  keep_outstanding: "Keep outstanding",
  write_off: "Write off difference",
  credit_note: "Issue credit note",
  investigate: "Investigate further",
  supplier_credit: "Request supplier credit",
  dismiss: "Dismiss",
  approve: "Approve",
  adjust_inventory: "Post inventory adjustment",
  reassign: "Reassign",
};

export function ExceptionDrawer({
  exception,
  onOpenChange,
}: {
  exception: any | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!exception) return null;
  const actions: string[] = Array.isArray(exception.actions) ? exception.actions : [];
  const impact: any[] = Array.isArray(exception.accounting_impact) ? exception.accounting_impact : [];
  const done = ["resolved", "dismissed"].includes(exception.status);

  const run = async (action: string) => {
    setBusy(action);
    try {
      const { error } = await supabase.rpc("resolve_exception", {
        p_exception: exception.id,
        p_action: action,
      });
      if (error) throw error;
      if (notes.trim()) {
        await supabase
          .from("exception_actions")
          .insert({ exception_id: exception.id, action: "note", performed_by: "Ahmed Rahman", notes });
      }
      await qc.invalidateQueries();
      toast.success(`${ACTION_LABELS[action] ?? titleCase(action)} — posted to the ledger`);
      onOpenChange(false);
      setNotes("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not resolve this exception");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={!!exception} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Pill tone={exception.priority === "critical" ? "critical" : exception.priority === "high" ? "warning" : "muted"}>
              {titleCase(exception.priority)}
            </Pill>
            <span className="num text-[11px] text-muted-foreground">{exception.code}</span>
            <span className="ml-auto">
              <Pill tone={done ? "success" : "neutral"}>{titleCase(exception.status)}</Pill>
            </span>
          </div>
          <SheetTitle className="pt-1 text-[16px] leading-snug font-medium">
            {exception.title}
          </SheetTitle>
          <p className="text-[13px] text-muted-foreground">
            {titleCase(exception.entity_type)} · {exception.entity_label} · raised{" "}
            {shortDate(exception.created_at)}
          </p>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          <section>
            <div className="label-xs">What happened</div>
            <p className="mt-1.5 text-[13px] leading-relaxed">{exception.description}</p>
          </section>

          <section>
            <div className="label-xs">Why it stopped</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {exception.reason}
            </p>
          </section>

          <section className="rounded-sm border border-border bg-signal-soft/60 p-3.5">
            <div className="flex items-center justify-between">
              <div className="label-xs">Qyoo recommends</div>
              <Confidence value={exception.confidence} />
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed">{exception.recommendation}</p>
            {exception.history_note ? (
              <p className="mt-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                {exception.history_note}
              </p>
            ) : null}
          </section>

          {impact.length ? (
            <section>
              <div className="label-xs">Accounting impact if accepted</div>
              <table className="mt-2 w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="label-xs">
                    <th className="border-b border-border py-1.5 text-left font-medium">Account</th>
                    <th className="border-b border-border py-1.5 text-right font-medium">Debit</th>
                    <th className="border-b border-border py-1.5 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.map((l, i) => (
                    <tr key={i}>
                      <td className="border-b border-border/70 py-1.5">
                        <span className="num text-muted-foreground">{l.code}</span> {l.name}
                      </td>
                      <td className="num border-b border-border/70 py-1.5 text-right">
                        {Number(l.debit) ? money(l.debit) : "—"}
                      </td>
                      <td className="num border-b border-border/70 py-1.5 text-right">
                        {Number(l.credit) ? money(l.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {done ? (
            <section className="rounded-sm border border-border bg-secondary/60 p-3.5">
              <div className="label-xs">Resolved</div>
              <p className="mt-1.5 text-[13px]">{exception.resolution ?? "Closed"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {shortDate(exception.resolved_at)} · {exception.assigned_to ?? "Ahmed Rahman"}
              </p>
            </section>
          ) : (
            <section>
              <div className="label-xs">Add a note (optional)</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context for the audit trail…"
                className="mt-1.5 min-h-[72px] text-[13px]"
              />
            </section>
          )}
        </div>

        {!done ? (
          <div className="sticky bottom-0 mt-auto flex flex-wrap gap-2 border-t border-border bg-card px-5 py-4">
            {actions.map((a, idx) => (
              <Button
                key={a}
                variant={idx === 0 ? "default" : "outline"}
                size="sm"
                disabled={!!busy}
                onClick={() => run(a)}
              >
                {busy === a ? "Posting…" : (ACTION_LABELS[a] ?? titleCase(a))}
              </Button>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

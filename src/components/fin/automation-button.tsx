import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/fin/forms";
import { actions, useAction } from "@/lib/fin-actions";

/** Runs the automation engine: overdue marking, bank auto-matching, low-stock, due-soon and new exceptions. */
export function RunAutomationButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const [confirm, setConfirm] = useState(false);
  const run = useAction(() => actions.runAutomation(), {
    scope: "run_automation",
    success: (r: any) =>
      `Automation run — ${r?.matched ?? 0} bank lines matched, ${r?.marked_overdue ?? 0} invoices marked overdue, ${r?.created ?? 0} new exceptions`,
  });
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setConfirm(true)} disabled={run.isPending}>
        <Zap className="mr-1.5 h-3.5 w-3.5" />
        {run.isPending ? "Running…" : "Run automation"}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Run the automation cycle?"
        description="FIN will re-check overdue invoices, upcoming supplier payments, stock levels and unmatched bank lines, and may raise new items in Action Required. The whole run is a single transaction — if any step fails, nothing is changed."
        confirmLabel="Run automation"
        onConfirm={() => {
          setConfirm(false);
          run.mutate(undefined as never);
        }}
      />
    </>
  );
}

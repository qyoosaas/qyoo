import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actions, useAction } from "@/lib/fin-actions";

/** Runs the automation engine: overdue marking, bank auto-matching, low-stock, due-soon and new exceptions. */
export function RunAutomationButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const run = useAction(() => actions.runAutomation(), {
    success: (r: any) =>
      `Automation run — ${r?.matched ?? 0} bank lines matched, ${r?.marked_overdue ?? 0} invoices marked overdue, ${r?.created ?? 0} new exceptions`,
  });
  return (
    <Button size="sm" variant={variant} onClick={() => run.mutate(undefined as any)} disabled={run.isPending}>
      <Zap className="mr-1.5 h-3.5 w-3.5" />
      {run.isPending ? "Running…" : "Run automation"}
    </Button>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listTeam, inviteMember, updateMember, removeMember, TEAM_ROLES, type TeamRole, type TeamMember } from "@/lib/team.functions";
import { Panel, Pill, Loading } from "./primitives";
import { Field, FormDialog, NativeSelect, RowAction } from "./forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROLE_LABEL: Record<TeamRole, string> = { admin: "Admin", finance_manager: "Finance manager", accountant: "Accountant", viewer: "Viewer" };
const ROLE_HINT: Record<TeamRole, string> = {
  admin: "Everything, including team and settings",
  finance_manager: "Approve, post and close periods",
  accountant: "Record and prepare transactions",
  viewer: "Read-only access",
};
type Draft = { id?: string; email: string; full_name: string; job_title: string; role: TeamRole };

export function TeamPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listTeam);
  const invite = useServerFn(inviteMember);
  const update = useServerFn(updateMember);
  const remove = useServerFn(removeMember);
  const team = useQuery({ queryKey: ["team"], queryFn: () => list() });
  const [edit, setEdit] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = team.data?.canManage ?? false;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await update({ data: { id: edit.id, full_name: edit.full_name, job_title: edit.job_title, role: edit.role } });
      else await invite({ data: { ...edit, redirectTo: window.location.origin } });
      toast.success(edit.id ? "Member updated" : `Invitation sent to ${edit.email}`);
      setEdit(null);
      await qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await remove({ data: { id: removing.id } });
      toast.success(`${removing.label} removed`);
      await qc.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setRemoving(null);
  };

  return (
    <Panel
      title="Team"
      description="Roles are enforced on the server, not the browser"
      actions={canManage ? (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setEdit({ email: "", full_name: "", job_title: "", role: "accountant" })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Invite member
        </Button>
      ) : null}
    >
      {team.isLoading ? <Loading rows={3} /> : team.error ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Team could not be loaded. Refresh to try again.</p>
      ) : (
        <ul className="divide-y divide-border">
          {((team.data?.members ?? []) as TeamMember[]).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
              <div className="min-w-0">
                <div className="font-medium">{m.full_name || m.email}{m.is_you ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}{m.job_title ? ` · ${m.job_title}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                {m.status === "invited" ? <Pill tone="warning">Invited</Pill> : null}
                <Pill tone={m.role === "admin" ? "signal" : "neutral"}>{ROLE_LABEL[m.role]}</Pill>
                {canManage ? (
                  <>
                    <RowAction onClick={() => setEdit({ id: m.id, email: m.email, full_name: m.full_name ?? "", job_title: m.job_title ?? "", role: m.role })}>Edit</RowAction>
                    {!m.is_you ? <RowAction tone="danger" onClick={() => setRemoving({ id: m.id, label: m.full_name || m.email })}>Remove</RowAction> : null}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!canManage && team.data ? <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Only admins can invite or change members.</p> : null}

      <FormDialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
        title={edit?.id ? "Edit member" : "Invite member"}
        description={edit?.id ? "Changes apply the next time they load a page." : "They'll get an email to set a password and join."}
        onSubmit={save}
        submitLabel={edit?.id ? "Save" : "Send invite"}
        busy={busy}
      >
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><Input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className="h-8 text-[13px]" /></Field>
            <Field label="Email"><Input type="email" disabled={!!edit.id} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="h-8 text-[13px]" /></Field>
            <Field label="Job title"><Input value={edit.job_title} onChange={(e) => setEdit({ ...edit, job_title: e.target.value })} className="h-8 text-[13px]" /></Field>
            <Field label="Role">
              <NativeSelect value={edit.role} onChange={(v) => setEdit({ ...edit, role: v as TeamRole })}>
                {TEAM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </NativeSelect>
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">{ROLE_HINT[edit.role]}</p>
          </div>
        ) : null}
      </FormDialog>

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.label}?</AlertDialogTitle>
            <AlertDialogDescription>They lose access immediately. Their past entries and audit history stay untouched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

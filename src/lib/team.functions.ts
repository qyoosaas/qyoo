import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COMPANY_ID } from "@/lib/format";

export const TEAM_ROLES = ["admin", "editor", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export function normalizeRole(r: string): TeamRole {
  return r === "admin" ? "admin" : r === "viewer" ? "viewer" : "editor";
}
export type TeamMember = { id: string; full_name: string | null; email: string; job_title: string | null; role: TeamRole; status: "active" | "invited"; last_sign_in_at: string | null; is_you: boolean };

/**
 * Team management. Roles live in user_roles and are written only here, with the
 * service client, after confirming the caller is an admin. If the workspace has
 * no admin yet, the first signed-in user to open Settings becomes admin.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function ensureCaller(ctx: { supabase: any; userId: string; claims: any }) {
  const db = await admin();
  const { data: anyAdmin } = await db.from("user_roles").select("id").eq("role", "admin").eq("company_id", COMPANY_ID).limit(1);
  if (!anyAdmin?.length) {
    await db.from("user_roles").upsert({ user_id: ctx.userId, company_id: COMPANY_ID, role: "admin" }, { onConflict: "user_id,company_id" });
  }
  const { data: prof } = await db.from("profiles").select("id").eq("id", ctx.userId).maybeSingle();
  if (!prof) {
    await db.from("profiles").insert({ id: ctx.userId, company_id: COMPANY_ID, email: ctx.claims?.email ?? null, full_name: ctx.claims?.user_metadata?.full_name ?? null });
  }
  const { data: mine } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("company_id", COMPANY_ID).maybeSingle();
  return { db, isAdmin: mine?.role === "admin" };
}

async function requireAdmin(ctx: any) {
  const r = await ensureCaller(ctx);
  if (!r.isAdmin) throw new Error("Only admins can manage the team");
  return r.db;
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, isAdmin } = await ensureCaller(context);
    const [{ data: profiles }, { data: roles }, { data: users }] = await Promise.all([
      db.from("profiles").select("*").eq("company_id", COMPANY_ID).order("created_at"),
      db.from("user_roles").select("user_id, role").eq("company_id", COMPANY_ID),
      db.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const byId = new Map<string, any>((users?.users ?? []).map((u: any) => [u.id, u]));
    const members: TeamMember[] = (profiles ?? []).map((p: any): TeamMember => {
      const u = byId.get(p.id);
      return {
        id: p.id as string,
        full_name: (p.full_name ?? null) as string | null,
        email: (p.email ?? u?.email ?? "") as string,
        job_title: (p.job_title ?? null) as string | null,
        role: normalizeRole((roles ?? []).find((r: any) => r.user_id === p.id)?.role ?? "viewer"),
        status: (u?.last_sign_in_at ? "active" : "invited") as "active" | "invited",
        last_sign_in_at: (u?.last_sign_in_at ?? null) as string | null,
        is_you: p.id === context.userId,
      };
    });
    return { members, canManage: isAdmin };
  });

type MemberInput = { email: string; full_name: string; job_title?: string; role: TeamRole };

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: MemberInput & { redirectTo?: string }) => {
    const email = String(d.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
    if (!TEAM_ROLES.includes(d.role)) throw new Error("Choose a role");
    return { email, full_name: String(d.full_name ?? "").trim().slice(0, 120), job_title: String(d.job_title ?? "").trim().slice(0, 120), role: d.role, redirectTo: d.redirectTo };
  })
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    const { data: existing } = await db.from("profiles").select("id").eq("email", data.email).eq("company_id", COMPANY_ID).maybeSingle();
    if (existing) throw new Error("This person is already on the team");
    let userId: string | undefined;
    const inv = await db.auth.admin.inviteUserByEmail(data.email, { data: { full_name: data.full_name }, redirectTo: data.redirectTo });
    if (inv.error) {
      const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
      userId = list?.users?.find((u: any) => u.email?.toLowerCase() === data.email)?.id;
      if (!userId) throw new Error(inv.error.message);
    } else userId = inv.data.user.id;
    await db.from("profiles").upsert({ id: userId, company_id: COMPANY_ID, email: data.email, full_name: data.full_name || null, job_title: data.job_title || null });
    await db.from("user_roles").upsert({ user_id: userId, company_id: COMPANY_ID, role: data.role }, { onConflict: "user_id,company_id" });
    await db.from("audit_logs").insert({ company_id: COMPANY_ID, actor: context.claims?.email ?? "admin", action: "team.invite", entity_type: "user", entity_id: userId, entity_label: data.email, after: { role: data.role }, source: "settings" });
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; full_name: string; job_title?: string; role: TeamRole }) => {
    if (!TEAM_ROLES.includes(d.role)) throw new Error("Choose a role");
    return { id: String(d.id), full_name: String(d.full_name ?? "").trim().slice(0, 120), job_title: String(d.job_title ?? "").trim().slice(0, 120), role: d.role };
  })
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    if (data.id === context.userId && data.role !== "admin") {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin").eq("company_id", COMPANY_ID);
      if ((admins ?? []).length <= 1) throw new Error("You are the only admin — make someone else admin first");
    }
    await db.from("profiles").update({ full_name: data.full_name || null, job_title: data.job_title || null }).eq("id", data.id);
    await db.from("user_roles").upsert({ user_id: data.id, company_id: COMPANY_ID, role: data.role }, { onConflict: "user_id,company_id" });
    await db.from("audit_logs").insert({ company_id: COMPANY_ID, actor: context.claims?.email ?? "admin", action: "team.update", entity_type: "user", entity_id: data.id, after: { role: data.role, job_title: data.job_title }, source: "settings" });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);
    if (data.id === context.userId) throw new Error("You can't remove yourself");
    await db.from("user_roles").delete().eq("user_id", data.id).eq("company_id", COMPANY_ID);
    await db.from("profiles").delete().eq("id", data.id);
    await db.auth.admin.deleteUser(data.id);
    await db.from("audit_logs").insert({ company_id: COMPANY_ID, actor: context.claims?.email ?? "admin", action: "team.remove", entity_type: "user", entity_id: data.id, source: "settings" });
    return { ok: true };
  });

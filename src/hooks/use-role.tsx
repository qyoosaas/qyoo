import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

/** Current user's role (display only — the database enforces access). */
export function useRole() {
  const q = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_app_role" as any);
      const r = String(data ?? "viewer");
      return (r === "admin" || r === "viewer" ? r : "editor") as AppRole;
    },
    staleTime: 60_000,
  });
  const role = q.data;
  return { role, canEdit: role === "admin" || role === "editor", isAdmin: role === "admin" };
}

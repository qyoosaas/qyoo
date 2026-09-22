import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import qyooLogo from "@/assets/qyoo-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Qyoo · Autonomous Finance OS" },
      {
        name: "description",
        content:
          "Sign in to Qyoo, the autonomous finance operating system for manufacturing and distribution SMEs.",
      },
      { property: "og:title", content: "Sign in · Qyoo · Autonomous Finance OS" },
      { property: "og:description", content: "Finance happens automatically. People handle exceptions." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/overview" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/overview" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/overview`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created — signing you in");
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) {
          toast.info("Check your email to confirm your account.");
        } else {
          navigate({ to: "/overview" });
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-border bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <img src={qyooLogo.url} alt="Qyoo" className="h-[26px] w-auto" />
        </div>

        <div className="max-w-[440px]">
          <h1 className="text-[34px] leading-[1.1] font-medium tracking-[-0.03em]">
            Finance happens automatically.
            <br />
            <span className="text-muted-foreground">People handle exceptions.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Qyoo runs the finance function for manufacturing and distribution SMEs — invoices,
            three-way matching, bank reconciliation, inventory costing and the general ledger post
            themselves. What lands on your desk is only what genuinely needs a decision.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              ["94%", "auto-posted"],
              ["11", "open exceptions"],
              ["< 2h", "close to ledger"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="num text-[20px] font-medium tracking-tight">{v}</dt>
                <dd className="label-xs mt-1">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-muted-foreground">
          Al Noor Manufacturing LLC · Dubai, UAE · AED · FY2026 demo environment
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <h2 className="text-[19px] font-medium tracking-tight">
            {mode === "signin" ? "Sign in to Qyoo" : "Create your Qyoo account"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Use your work email to access the finance workspace."
              : "You'll join the Al Noor Manufacturing demo workspace."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-3.5">
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="label-xs">
                  Full name
                </Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmed Rahman"
                  required
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="label-xs">
                Work email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="finance@alnoor.ae"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="label-xs">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

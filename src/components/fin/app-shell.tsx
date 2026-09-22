import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  TriangleAlert,
  Receipt,
  ShoppingCart,
  Landmark,
  CreditCard,
  Boxes,
  Factory,
  BookOpen,
  FileText,
  Inbox,
  LineChart,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Bell,
  HelpCircle,
  ChevronsUpDown,
  LogOut,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExceptions } from "@/lib/fin-data";
import { cn } from "@/lib/utils";
import qyooLogo from "@/assets/qyoo-logo.png.asset.json";
import qyooIcon from "@/assets/qyoo-icon.png.asset.json";
import { CommandPalette } from "./command-palette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutGrid, badge: false },
  { to: "/action-required", label: "Action Required", icon: TriangleAlert, badge: true },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/banking", label: "Banking", icon: Landmark },
  { to: "/expenses", label: "Expenses", icon: CreditCard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/accounting", label: "Accounting", icon: BookOpen },
  { to: "/inbox", label: "Document Inbox", icon: Inbox },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/fpa", label: "FP&A", icon: LineChart },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const { data: exceptions } = useExceptions();

  const openCount = (exceptions ?? []).filter((e: any) =>
    ["open", "in_review", "waiting"].includes(e.status),
  ).length;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const userName = (email ? email.split("@")[0] : undefined) ?? "Ahmed Rahman";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <img src={qyooLogo.url} alt="Qyoo" className="h-[18px] w-auto" />
          <span className="label-xs ml-auto">OS</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "row-hover mb-0.5 flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-[13px]",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                {"badge" in item && item.badge && openCount > 0 ? (
                  <span className="num rounded-sm bg-signal px-1.5 py-0.5 text-[10px] font-semibold text-signal-foreground">
                    {openCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="row-hover flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left hover:bg-secondary">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-secondary text-[10px] font-semibold">
                AN
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">Al Noor Manufacturing</div>
                <div className="text-[11px] text-muted-foreground">AED · UAE · FY2026</div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="label-xs">Companies</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2">
                <Check className="h-3.5 w-3.5" /> Al Noor Manufacturing LLC
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="gap-2 pl-7 text-muted-foreground">
                Add company (multi-entity soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            to="/settings"
            className={cn(
              "row-hover mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-[13px]",
              pathname.startsWith("/settings")
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <SettingsIcon className="h-[15px] w-[15px]" strokeWidth={1.75} />
            Settings
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[228px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur">
          <button
            onClick={() => setPaletteOpen(true)}
            className="row-hover flex h-8 max-w-[420px] flex-1 items-center gap-2 rounded-sm border border-border bg-card px-2.5 text-left text-[13px] text-muted-foreground hover:border-foreground/25"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1">Search invoices, customers, transactions…</span>
            <kbd className="num rounded-[3px] border border-border px-1 py-px text-[10px]">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/action-required"
              className="row-hover relative flex h-8 w-8 items-center justify-center rounded-sm hover:bg-secondary"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              {openCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-signal" />
              ) : null}
            </Link>
            <a
              href="https://docs.lovable.dev"
              target="_blank"
              rel="noreferrer"
              className="row-hover flex h-8 w-8 items-center justify-center rounded-sm hover:bg-secondary"
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger className="row-hover ml-1 flex items-center gap-2 rounded-sm py-1 pr-1 pl-1 hover:bg-secondary">
                <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-[11px] font-semibold text-primary-foreground">
                  {userName.slice(0, 2).toUpperCase()}
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="text-[13px] font-medium">{userName}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">
                    {email || "finance@alnoor.ae"}
                  </div>
                  <div className="mt-1.5">
                    <span className="label-xs">Role · Finance Manager</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut} className="gap-2">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1240px] space-y-6">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

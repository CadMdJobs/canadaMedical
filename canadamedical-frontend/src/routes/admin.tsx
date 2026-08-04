import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { useAuthStore, type AuthUser } from "@/stores/auth";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  ClipboardList,
  Mail,
  Star,
  HelpCircle,
  LogOut,
  Bell,
  Search,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  UserCircle,
  Building2,
  DollarSign,
  Tags,
  Menu,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logo } from "@/components/site/Logo";
import { api, apiError } from "@/lib/api";
import { NotificationBell } from "@/components/site/NotificationBell";

export const Route = createFileRoute("/admin")({
  component: AdminRoot,
});

type AdminLink = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_GROUPS: { title: string; links: AdminLink[] }[] = [
  {
    title: "Overview",
    links: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Operations",
    links: [
      { to: "/admin/jobs", label: "Jobs", icon: Briefcase },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/assessments", label: "Assessments", icon: ClipboardList },
      { to: "/admin/contacts", label: "Contacts", icon: Mail },
      { to: "/admin/enterprise", label: "Enterprise Requests", icon: Building2 },
      { to: "/admin/revenue", label: "Revenue & Billing", icon: DollarSign },
      { to: "/admin/plans", label: "Pricing Plans", icon: Tags },
    ],
  },
  {
    title: "Content",
    links: [
      { to: "/admin/testimonials", label: "Testimonials", icon: Star },
      { to: "/admin/faq", label: "FAQ", icon: HelpCircle },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/profile", label: "My Profile", icon: UserCircle },
    ],
  },
];

function AdminRoot() {
  const { isAuthenticated, isAdmin, hydrated } = useAuthStore();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-accent" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return <AdminLoginPage />;
  }

  return <AdminLayout />;
}

function AdminLoginPage() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login/", { email, password, user_type: "admin" });
      const payload = res.data?.data ?? res.data;

      if (!payload.is_admin) {
        toast.error("This account does not have admin access.");
        setLoading(false);
        return;
      }

      const user: AuthUser = {
        email: payload.email,
        full_name: payload.full_name,
        first_name: payload.first_name,
        last_name: payload.last_name,
        user_type: payload.user_type,
        is_admin: payload.is_admin,
      };
      login({ user, access: payload.access, refresh: payload.refresh });
      toast.success("Welcome, Administrator!");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      {/* Background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-[0.04]" />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
          {/* Logo + badge */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-accent shadow-glow">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-center text-xl font-extrabold text-white">Admin Portal</h1>
              <p className="mt-1 text-center text-xs text-white/50">CanadianMdJobs — Staff only</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Email address
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@canadianmed.ca"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/30 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-white"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-accent px-6 py-3.5 text-sm font-bold text-primary shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {loading ? "Signing in…" : "Sign in to Admin"}
              {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
            </button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-5 text-center">
            <Link
              to="/"
              className="text-xs text-white/40 transition hover:text-white/70"
            >
              ← Back to site
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/25">
          Restricted access. Unauthorized use is prohibited.
        </p>
      </div>
    </div>
  );
}

function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ label: string; url: string }[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [enterprisePendingCount, setEnterprisePendingCount] = useState(0);

  useEffect(() => {
    api.get("/api/subscriptions/admin/enterprise/requests/", { params: { status: "pending", page_size: 1 } })
      .then((r) => {
        const d = r.data?.data ?? r.data;
        setEnterprisePendingCount(d?.count ?? (Array.isArray(d) ? d.length : 0));
      })
      .catch(() => {});
  }, [pathname]);

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const r = await api.get("/api/admin/search/", { params: { q } });
      const d = r.data?.data ?? r.data;
      const flat: { label: string; url: string }[] = [];
      (d?.users ?? []).forEach((u: { email: string; first_name?: string; last_name?: string; id: number }) =>
        flat.push({ label: `User: ${u.first_name ?? ""} ${u.last_name ?? ""} (${u.email})`.trim(), url: `/admin/users` })
      );
      (d?.jobs ?? []).forEach((j: { title: string; id: number }) =>
        flat.push({ label: `Job: ${j.title}`, url: `/admin/jobs` })
      );
      (d?.assessments ?? []).forEach((a: { full_name?: string; email?: string }) =>
        flat.push({ label: `Assessment: ${a.full_name ?? a.email ?? ""}`, url: `/admin/assessments` })
      );
      (d?.contacts ?? []).forEach((c: { full_name?: string; subject?: string }) =>
        flat.push({ label: `Contact: ${c.full_name ?? ""} — ${c.subject ?? ""}`, url: `/admin/contacts` })
      );
      setSearchResults(flat);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  const allLinks = NAV_GROUPS.flatMap((g) => g.links);
  const current = allLinks.find((l) => (l.exact ? pathname === l.to : pathname.startsWith(l.to))) ?? allLinks[0];

  function handleLogout() {
    logout();
    toast.success("Signed out");
    navigate({ to: "/admin" as never });
  }

  // Quick-access links shown in mobile bottom bar (most important 5)
  const MOBILE_QUICK = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/jobs", label: "Jobs", icon: Briefcase },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/enterprise", label: "Enterprise", icon: Building2 },
    { to: "/admin/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-secondary/40">

      {/* ── Mobile drawer backdrop ──────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-primary/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile slide-in drawer ──────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <Logo inverse size="sm" />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-white/10 transition"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/50">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.links.map((l) => {
                  const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
                  const badge = l.to === "/admin/enterprise" && enterprisePendingCount > 0 ? enterprisePendingCount : null;
                  return (
                    <li key={l.to}>
                      <Link
                        to={l.to as never}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          active ? "bg-white/10 text-white" : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <l.icon className={`h-4 w-4 flex-none ${active ? "text-accent" : ""}`} />
                        <span className="flex-1 truncate">{l.label}</span>
                        {badge !== null && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-primary">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/75 transition hover:bg-destructive/15 hover:text-white"
          >
            <LogOut className="h-4 w-4 flex-none" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="z-30 flex-none border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-3 lg:gap-3 lg:px-6">
          {/* Desktop: sidebar collapse */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground/70 transition hover:border-primary/30 hover:text-primary lg:inline-flex"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {/* Mobile: hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground/70 transition hover:bg-secondary lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Logo size="sm" />
          <div className="mx-2 hidden h-5 w-px bg-border lg:block" />

          <div className="hidden flex-1 sm:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground truncate">
              Admin{current && current.label !== "Dashboard" ? ` · ${current.label}` : ""}
            </p>
          </div>

          {/* Search — desktop only */}
          <div className="relative hidden flex-1 max-w-xs md:block" ref={searchRef}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQ}
              onChange={(e) => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setSearchResults(null), 200)}
              placeholder="Search users, jobs…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
            {(searchResults !== null || searchLoading) && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg">
                {searchLoading ? (
                  <div className="p-3 text-xs text-muted-foreground">Searching…</div>
                ) : searchResults && searchResults.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">No results</div>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {(searchResults ?? []).map((r, i) => (
                      <li key={i}>
                        <a href={r.url} className="block px-3 py-2 text-sm text-foreground hover:bg-secondary">
                          {r.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-1.5">
            <NotificationBell role="admin" />
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 sm:flex">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-accent text-xs font-bold text-primary shrink-0">
                {(user?.email ?? "A").slice(0, 1).toUpperCase()}
              </span>
              <div className="hidden text-xs md:block">
                <div className="font-semibold text-foreground leading-tight">{user?.first_name || "Admin"}</div>
                <div className="truncate text-muted-foreground max-w-32">{user?.email}</div>
              </div>
            </div>
            <Link
              to="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground/70 transition hover:text-primary hover:border-primary/30"
              title="Go to site"
            >
              <Home className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside
          className={`hidden flex-none overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-[width] duration-300 lg:flex lg:flex-col ${
            sidebarOpen ? "w-64" : "w-0 border-r-0"
          }`}
        >
          <div className={`flex flex-1 flex-col overflow-hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0"}`}>
            <nav className="flex-1 space-y-6 overflow-y-auto scrollbar-none px-3 py-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/50">
                    {group.title}
                  </div>
                  <ul className="space-y-1">
                    {group.links.map((l) => {
                      const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
                      const badge = l.to === "/admin/enterprise" && enterprisePendingCount > 0 ? enterprisePendingCount : null;
                      return (
                        <li key={l.to}>
                          <Link
                            to={l.to as never}
                            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                              active
                                ? "bg-white/10 text-white shadow-inner"
                                : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 h-6 w-1 -translate-x-1.5 -translate-y-1/2 rounded-r-full bg-accent shadow-glow" />
                            )}
                            <l.icon className={`h-4 w-4 flex-none ${active ? "text-accent" : ""}`} />
                            <span className="flex-1 truncate">{l.label}</span>
                            {badge !== null && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-primary">
                                {badge > 99 ? "99+" : badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="flex-none border-t border-white/10 p-3">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/75 transition hover:bg-destructive/15 hover:text-white"
              >
                <LogOut className="h-4 w-4 flex-none" /> Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab bar ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-xl lg:hidden">
        {MOBILE_QUICK.map((l) => {
          const active = l.exact ? pathname === l.to : pathname.startsWith(l.to);
          const badge = l.to === "/admin/enterprise" && enterprisePendingCount > 0 ? enterprisePendingCount : null;
          return (
            <Link
              key={l.to}
              to={l.to as never}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <l.icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className="leading-none truncate">{l.label.split(" ")[0]}</span>
              {badge !== null && (
                <span className="absolute top-1.5 right-[calc(50%-16px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-primary">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

    </div>
  );
}

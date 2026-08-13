import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Bookmark, User as UserIcon, Settings as SettingsIcon,
  LayoutDashboard, FileText, CheckCircle2, Clock, Star, Trash2, ExternalLink,
  LogOut, Home, PanelLeftClose, PanelLeftOpen, Menu, X,
  ChevronDown, ChevronUp, MapPin, Building2, Calendar, Phone, Linkedin,
  AlertTriangle, XCircle, Award, Search, Printer, Loader2, ThumbsUp, ThumbsDown,
  Pencil, Globe, Stethoscope, GraduationCap, FileCheck, Archive,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { api, apiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Field, Input, Select, SubmitButton } from "@/components/site/Form";
import { SPECIALTIES, PROVINCES } from "@/data/jobs";
import { useSubSpecialties } from "@/hooks/useSubSpecialties";
import { Logo } from "@/components/site/Logo";
import { NotificationBell } from "@/components/site/NotificationBell";
import { ChangePasswordCard } from "@/components/site/ChangePasswordCard";

export const Route = createFileRoute("/_authenticated/dashboard/physician")({
  head: () => ({ meta: [{ title: "Physician Dashboard — CanadianMdJobs" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: string; app?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    app: typeof s.app === "string" ? s.app : undefined,
  }),
  component: PhysicianDashboard,
});

type Tab = "overview" | "applications" | "saved" | "profile" | "settings";

const STATUS_STEPS = ["pending", "reviewed", "shortlisted", "interview", "offered"] as const;
type AppStatus = "pending" | "reviewed" | "shortlisted" | "interview" | "offered" | "accepted" | "offer_declined" | "rejected" | "withdrawn";

const STATUS_META: Record<AppStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:       { label: "Pending",        color: "text-amber-700",   bg: "bg-amber-100",   icon: Clock },
  reviewed:      { label: "Reviewed",       color: "text-blue-700",    bg: "bg-blue-100",    icon: Search },
  shortlisted:   { label: "Shortlisted",    color: "text-violet-700",  bg: "bg-violet-100",  icon: Star },
  interview:     { label: "Interview",      color: "text-indigo-700",  bg: "bg-indigo-100",  icon: Calendar },
  offered:       { label: "Offer Received", color: "text-amber-700",   bg: "bg-amber-100",   icon: Award },
  accepted:      { label: "Hired!",         color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  offer_declined:{ label: "Offer Declined", color: "text-slate-600",   bg: "bg-slate-100",   icon: XCircle },
  rejected:      { label: "Rejected",       color: "text-rose-700",    bg: "bg-rose-100",    icon: XCircle },
  withdrawn:     { label: "Withdrawn",      color: "text-slate-500",   bg: "bg-slate-100",   icon: AlertTriangle },
};

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "applications", label: "My Applications", icon: FileText },
  { id: "saved", label: "Saved Jobs", icon: Bookmark },
  { id: "profile", label: "My Profile", icon: UserIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

interface Application {
  id: number | string;
  job_id?: number;
  /** The listing has been taken down. The application record survives, but
   *  there is no job page left to link to. */
  job_archived?: boolean;
  job_title?: string;
  employer_name?: string;
  job_location?: string;
  status?: AppStatus;
  status_display?: string;
  applied_at?: string;
  updated_at?: string;
  cover_letter?: string;
  employer_notes?: string;
  resume_url?: string;
  profile_resume_url?: string;
  phone?: string;
  years_experience?: number;
  linkedin_url?: string;
  availability_date?: string;
  willing_to_relocate?: boolean;
}
interface SavedJob {
  id: number | string;
  job: number;
  job_detail?: {
    id: number;
    title: string;
    specialty_display?: string;
    specialty?: string;
    employer_name?: string;
    location_display?: string;
  };
  saved_at?: string;
}

function StatusBadge({ status }: { status?: AppStatus }) {
  const s = (status ?? "pending") as AppStatus;
  const meta = STATUS_META[s] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.bg} ${meta.color}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function StatusTimeline({ status }: { status?: AppStatus }) {
  const s = status ?? "pending";
  if (s === "rejected" || s === "withdrawn") {
    const meta = STATUS_META[s as AppStatus];
    const Icon = meta.icon;
    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${meta.bg} ${meta.color}`}>
        <Icon className="h-4 w-4" />
        Application {meta.label}
      </div>
    );
  }
  const activeIdx = STATUS_STEPS.indexOf(s as typeof STATUS_STEPS[number]);
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, idx) => {
        const meta = STATUS_META[step];
        const done = idx < activeIdx;
        const current = idx === activeIdx;
        return (
          <div key={step} className="flex items-center">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
              current ? `${meta.bg} ${meta.color} ring-2 ring-offset-1 ring-current` :
              done ? "bg-emerald-500 text-white" : "bg-secondary text-muted-foreground"
            }`}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 w-6 ${done ? "bg-emerald-400" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** How to address the signed-in physician.
 *
 * Falls back to a plain "Doctor" rather than the email address: the previous
 * fallback rendered "Dr. xifeb79870@careney.com", and only ever used
 * first_name, so anyone with a surname lost it.
 */
function doctorLabel(user: { first_name?: string; last_name?: string; full_name?: string } | null): string {
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    (user?.full_name ?? "").trim();
  return name ? `Dr. ${name}` : "Doctor";
}

function PhysicianDashboard() {
  const VALID_TABS: Tab[] = ["overview", "applications", "saved", "profile", "settings"];
  const { tab: tabParam, app: appParam } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview"
  );
  const [openAppId, setOpenAppId] = useState<string | undefined>(appParam);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: physicianProfile } = useQuery<{ avatar_url?: string | null; specialty?: string }>({
    queryKey: ["physician-profile"],
    queryFn: async () => {
      const r = await api.get("/api/profile/physician/");
      return r.data?.data ?? r.data ?? {};
    },
    staleTime: 60_000,
  });
  const avatarUrl = physicianProfile?.avatar_url ?? null;
  const displaySpecialty = physicianProfile?.specialty
    ? SPECIALTIES.find(s => s.value === physicianProfile.specialty)?.label ?? physicianProfile.specialty
    : "Physician";

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam as Tab)) {
      setTab(tabParam as Tab);
      if (appParam) setOpenAppId(appParam);
      navigate({ to: "/dashboard/physician", replace: true } as never);
    }
  }, [tabParam, appParam]);

  // Close drawer on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const currentTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  function handleLogout() {
    logout();
    toast.success("Signed out");
    navigate({ to: "/login" });
  }

  function switchTab(t: Tab) {
    setTab(t);
    setDrawerOpen(false);
  }

  const avatarInitial = (user?.first_name || user?.full_name || user?.email || "P")
    .trim().slice(0, 1).toUpperCase();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-secondary/40">

      {/* ── Mobile drawer backdrop ──────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile slide-in drawer ──────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card shadow-xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Logo size="sm" />
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded-xl bg-linear-to-br from-primary/10 to-accent/10 p-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-md">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                : <UserIcon className="h-6 w-6" />
              }
            </div>
            <p className="mt-2 text-sm font-bold text-primary">{doctorLabel(user)}</p>
            <p className="text-xs text-muted-foreground">{displaySpecialty}</p>
          </div>
          <nav className="space-y-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-secondary hover:text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-none" /> {t.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 hover:bg-rose-50 hover:text-rose-600 transition"
          >
            <LogOut className="h-4 w-4 flex-none" /> Log out
          </button>
        </div>
      </aside>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="z-30 flex-none border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-3 lg:gap-3 lg:px-6">
          {/* Desktop: sidebar collapse toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground/70 transition hover:border-primary/30 hover:text-primary lg:inline-flex"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {/* Mobile: hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-foreground/70 transition hover:bg-secondary lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Logo size="sm" />
          <div className="mx-3 hidden h-5 w-px bg-border lg:block" />
          <div className="hidden flex-1 sm:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Physician Portal · {currentTab.label}
            </p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-1.5">
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:border-primary/30 hover:text-primary sm:inline-flex"
            >
              <Home className="h-3.5 w-3.5" /> Home
            </Link>
            <Link to="/" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground/70 hover:text-primary transition sm:hidden">
              <Home className="h-4 w-4" />
            </Link>
            <NotificationBell role="physician" />
            <button
              type="button"
              onClick={() => switchTab("profile")}
              title="Edit profile"
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-background transition hover:bg-secondary"
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                : <span className="text-xs font-bold text-primary">{avatarInitial}</span>
              }
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className={`hidden flex-none overflow-hidden border-r border-border bg-card shadow-sm transition-[width] duration-300 lg:flex lg:flex-col ${sidebarOpen ? "w-64" : "w-0 border-r-0"}`}>
          <div className={`flex-1 overflow-y-auto transition-opacity duration-300 ${sidebarOpen ? "opacity-100 p-4" : "opacity-0"}`}>
            <div className="mb-5 rounded-xl bg-linear-to-br from-primary/10 to-accent/10 p-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-md">
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  : <UserIcon className="h-7 w-7" />
                }
              </div>
              <p className="mt-2 text-sm font-bold text-primary">{doctorLabel(user)}</p>
              <p className="text-xs text-muted-foreground">{displaySpecialty}</p>
            </div>
            <nav className="space-y-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-secondary hover:text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-none" /> {t.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="shrink-0 border-t border-border p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4 flex-none" /> Log out
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-3 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          <div className="space-y-5 lg:space-y-6">
            {tab === "overview" && <OverviewTab />}
            {tab === "applications" && <ApplicationsTab openAppId={openAppId} onAppOpened={() => setOpenAppId(undefined)} />}
            {tab === "saved" && <SavedTab />}
            {tab === "profile" && <ProfileTab />}
            {tab === "settings" && <SettingsTab />}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-xl lg:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className="leading-none">{t.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}

function OverviewTab() {
  const user = useAuthStore((s) => s.user);
  const { data: apps } = useQuery<Application[]>({
    queryKey: ["my-applications"],
    queryFn: async () => { const r = await api.get("/api/jobs/my-applications/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.results ?? []); },
    retry: 1,
  });
  const { data: saved } = useQuery<SavedJob[]>({
    queryKey: ["saved-jobs"],
    queryFn: async () => { const r = await api.get("/api/jobs/saved/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.results ?? []); },
    retry: 1,
  });

  const list = apps ?? [];
  const inProgress = list.filter((a) => !["rejected", "withdrawn"].includes(a.status ?? "pending")).length;
  const stats = [
    { label: "Total Applications", value: list.length, icon: FileText, tone: "bg-blue-50 text-blue-700" },
    { label: "In Progress", value: inProgress, icon: Clock, tone: "bg-amber-50 text-amber-700" },
    { label: "Shortlisted / Offered", value: list.filter((a) => a.status === "shortlisted" || a.status === "offered").length, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Saved Jobs", value: saved?.length ?? 0, icon: Bookmark, tone: "bg-violet-50 text-violet-700" },
  ];

  return (
    <>
      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground shadow-sm">
        <p className="text-sm uppercase tracking-wider opacity-80">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold">{doctorLabel(user)}</h1>
        <p className="mt-1 text-sm opacity-90">Here's what's happening with your career today.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-2xl font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">Recent Applications</h2>
          <Link to="/jobs" className="text-sm font-semibold text-accent hover:underline">
            Browse more jobs →
          </Link>
        </div>
        {list.length === 0 ? (
          <EmptyApplications />
        ) : (
          <ApplicationsTable items={list.slice(0, 5)} />
        )}
      </div>
    </>
  );
}

function ApplicationsTab({ openAppId, onAppOpened }: { openAppId?: string; onAppOpened?: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Application[]>({
    queryKey: ["my-applications"],
    queryFn: async () => { const r = await api.get("/api/jobs/my-applications/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.results ?? []); },
    retry: 1,
  });

  const withdraw = useMutation({
    mutationFn: (appId: number | string) => api.delete(`/api/jobs/applications/${appId}/`),
    onSuccess: () => {
      toast.success("Application withdrawn");
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const respondOffer = useMutation({
    mutationFn: ({ appId, action }: { appId: number | string; action: "accept" | "decline" }) =>
      api.post(`/api/jobs/applications/${appId}/respond-offer/`, { action }),
    onSuccess: (_, { action }) => {
      toast.success(action === "accept" ? "Congratulations! You accepted the offer." : "You declined the offer.");
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const [expanded, setExpanded] = useState<Set<number | string>>(new Set());
  const [withdrawing, setWithdrawing] = useState<number | string | null>(null);

  // Auto-expand and scroll to the application linked from a notification
  useEffect(() => {
    if (!openAppId || !data || data.length === 0) return;
    const numId = Number(openAppId);
    const id: number | string = isNaN(numId) ? openAppId : numId;
    setExpanded((prev) => { const next = new Set(prev); next.add(id); return next; });
    onAppOpened?.();
    setTimeout(() => {
      document.getElementById(`app-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [openAppId, data]);

  function toggleExpand(id: number | string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleWithdraw(app: Application) {
    if (app.status === "offered") {
      toast.error("Cannot withdraw an application with an active offer. Contact the employer.");
      return;
    }
    setWithdrawing(app.id);
    try {
      await withdraw.mutateAsync(app.id);
    } finally {
      setWithdrawing(null);
    }
  }

  const list = data ?? [];
  const TERMINAL = ["rejected", "withdrawn", "accepted", "offer_declined"] as const;
  const active = list.filter((a) => !TERMINAL.includes(a.status as typeof TERMINAL[number]));
  const closed = list.filter((a) => TERMINAL.includes(a.status as typeof TERMINAL[number]));

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {(["pending", "reviewed", "shortlisted", "interview", "offered", "accepted", "offer_declined", "rejected"] as AppStatus[]).map((s) => {
          const count = list.filter((a) => a.status === s || (!a.status && s === "pending")).length;
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div key={s} className={`rounded-xl border border-border p-3 text-center ${meta.bg}`}>
              <Icon className={`mx-auto h-4 w-4 ${meta.color}`} />
              <p className={`mt-1 text-xl font-bold ${meta.color}`}>{count}</p>
              <p className={`text-xs font-medium ${meta.color} opacity-80`}>{meta.label}</p>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm"><SkeletonRows /></div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm"><EmptyApplications /></div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Active Applications</h2>
              <div className="space-y-3">
                {active.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    expanded={expanded.has(app.id)}
                    onToggle={() => toggleExpand(app.id)}
                    onWithdraw={() => handleWithdraw(app)}
                    withdrawing={withdrawing === app.id}
                    onRespondOffer={(action) => respondOffer.mutate({ appId: app.id, action })}
                    respondingOffer={respondOffer.isPending && respondOffer.variables?.appId === app.id}
                  />
                ))}
              </div>
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Closed</h2>
              <div className="space-y-3">
                {closed.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    expanded={expanded.has(app.id)}
                    onToggle={() => toggleExpand(app.id)}
                    onWithdraw={() => handleWithdraw(app)}
                    withdrawing={withdrawing === app.id}
                    onRespondOffer={(action) => respondOffer.mutate({ appId: app.id, action })}
                    respondingOffer={respondOffer.isPending && respondOffer.variables?.appId === app.id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ApplicationCard({
  app, expanded, onToggle, onWithdraw, withdrawing, onRespondOffer, respondingOffer,
}: {
  app: Application;
  expanded: boolean;
  onToggle: () => void;
  onWithdraw: () => void;
  withdrawing: boolean;
  onRespondOffer: (action: "accept" | "decline") => void;
  respondingOffer: boolean;
}) {
  const isOffered = app.status === "offered";
  const isClosed = ["rejected", "withdrawn", "accepted", "offer_declined"].includes(app.status ?? "");
  const resumeUrl = app.resume_url ?? app.profile_resume_url;
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPDF() {
    if (!app.job_id) return;
    setDownloading(true);
    try {
      const response = await api.get(`/api/jobs/${app.job_id}/pdf/`, { responseType: "blob" });
      const blob = new Blob([response.data as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers["content-disposition"] as string | undefined;
      const filename = disposition
        ? disposition.split("filename=")[1]?.replace(/"/g, "") ?? `CanadianMdJobs_Job_${app.job_id}.pdf`
        : `CanadianMdJobs_Job_${app.job_id}.pdf`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article id={`app-card-${app.id}`} className={`rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md ${isClosed ? "border-border opacity-75" : "border-border"}`}>
      {/* Card header — always visible */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={app.status} />
            {app.applied_at && (
              <span className="text-xs text-muted-foreground">
                Applied {format(new Date(app.applied_at), "MMM d, yyyy")}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-base font-bold text-primary truncate">
            {app.job_title ?? `Application #${app.id}`}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {app.employer_name && (
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{app.employer_name}</span>
            )}
            {app.job_location && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{app.job_location}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Offer response buttons — shown only when status is "offered" */}
          {isOffered && (
            <>
              <button
                onClick={() => onRespondOffer("accept")}
                disabled={respondingOffer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {respondingOffer ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <ThumbsUp className="h-3.5 w-3.5" />
                )}
                Accept Offer
              </button>
              <button
                onClick={() => onRespondOffer("decline")}
                disabled={respondingOffer}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {respondingOffer ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                ) : (
                  <ThumbsDown className="h-3.5 w-3.5" />
                )}
                Decline
              </button>
            </>
          )}

          {/* Withdraw — only for non-offered, non-closed */}
          {!isClosed && !isOffered && (
            <button
              onClick={onWithdraw}
              disabled={withdrawing}
              title="Withdraw application"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {withdrawing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Withdraw
            </button>
          )}
          {/* Both of these open the job page, which no longer exists once the
              employer takes the listing down. The application itself is still
              here — say so rather than offering a link that 404s. */}
          {app.job_archived ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <Archive className="h-3.5 w-3.5" /> Listing removed
            </span>
          ) : (
            <>
              {app.job_id && (
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: String(app.job_id) }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:border-primary/30 hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View Job
                </Link>
              )}
              {app.job_id && (
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  title="Download job PDF"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                  PDF
                </button>
              )}
            </>
          )}
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:border-primary/30 hover:text-primary"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Less" : "Details"}
          </button>
        </div>
      </div>

      {/* Offer received banner */}
      {isOffered && (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-3">
          <p className="mb-1 text-xs font-bold text-amber-800 uppercase tracking-wider">You have received a job offer!</p>
          <p className="text-xs text-amber-700">Review the details below and accept or decline. You can hold multiple offers — accepting one does not affect your other applications.</p>
        </div>
      )}

      {/* Hired banner */}
      {app.status === "accepted" && (
        <div className="border-t border-emerald-200 bg-emerald-50 px-5 py-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold text-emerald-800">You accepted this offer — congratulations on your new position!</p>
        </div>
      )}

      {/* Status timeline (only for non-offered, non-terminal active) */}
      {!isClosed && !isOffered && (
        <div className="border-t border-border bg-secondary/30 px-5 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Application Progress</p>
          <StatusTimeline status={app.status} />
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Application details grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {app.phone && (
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{app.phone}</span>
              </div>
            )}
            {app.years_experience != null && (
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{app.years_experience} yr{app.years_experience !== 1 ? "s" : ""} experience</span>
              </div>
            )}
            {app.availability_date && (
              <div className="flex items-center gap-2 text-sm text-foreground/80">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>Available {format(new Date(app.availability_date), "MMM d, yyyy")}</span>
              </div>
            )}
            {app.willing_to_relocate && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Willing to relocate</span>
              </div>
            )}
            {app.linkedin_url && (
              <a
                href={app.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <Linkedin className="h-3.5 w-3.5 shrink-0" /> LinkedIn Profile
              </a>
            )}
            {resumeUrl && (
              <a
                href={resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" /> View Resume
              </a>
            )}
          </div>

          {/* Employer notes */}
          {app.employer_notes && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employer Notes</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 whitespace-pre-line leading-relaxed">
                {app.employer_notes}
              </div>
            </div>
          )}

          {/* Cover letter */}
          {app.cover_letter && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover Letter</p>
              <div className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-foreground/80 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                {app.cover_letter}
              </div>
            </div>
          )}

          {/* Last updated */}
          {app.updated_at && (
            <p className="text-xs text-muted-foreground">
              Last updated {format(new Date(app.updated_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function ApplicationsTable({ items }: { items: Application[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Job</th>
            <th className="px-3 py-2">Company</th>
            <th className="px-3 py-2">Applied</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-3 font-medium text-primary">{a.job_title ?? `Application #${a.id}`}</td>
              <td className="px-3 py-3 text-foreground/80">{a.employer_name ?? "—"}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {a.applied_at ? format(new Date(a.applied_at), "MMM d, yyyy") : "—"}
              </td>
              <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SavedTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<SavedJob[]>({
    queryKey: ["saved-jobs"],
    queryFn: async () => { const r = await api.get("/api/jobs/saved/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.results ?? []); },
    retry: 1,
  });
  const unsave = useMutation({
    mutationFn: (jobPk: number) => api.delete(`/api/jobs/${jobPk}/unsave/`),
    onSuccess: () => {
      toast.success("Removed from saved");
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      qc.invalidateQueries({ queryKey: ["saved-jobs-ids"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-primary">Saved Jobs</h2>
      {isLoading ? (
        <SkeletonRows />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved jobs yet"
          description="Bookmark jobs while browsing to revisit them later."
          action={{ to: "/jobs", label: "Browse jobs" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((s) => {
            const j = s.job_detail;
            return (
              <article key={s.id} className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-accent">{j?.specialty_display || j?.specialty || "—"}</p>
                <h3 className="mt-1 font-bold text-primary">{j?.title || "Job"}</h3>
                <p className="text-sm text-muted-foreground">{j?.employer_name || "—"} · {j?.location_display || "—"}</p>
                <div className="mt-3 flex gap-2">
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: String(s.job) }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-glow"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </Link>
                  <button
                    onClick={() => unsave.mutate(s.job)}
                    disabled={unsave.isPending}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    aria-label="Unsave"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PhysicianProfileData {
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  bio?: string;
  years_of_experience?: number | null;
  linkedin_url?: string;
  specialty?: string;
  sub_specialty?: string;
  cpso_number?: string;
  board_certifications?: string;
  degrees?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  zip_code?: string;
  work_eligibility?: boolean;
  resume?: string;
  resume_url?: string | null;
  profile_complete?: boolean;
}

function PhysicianSectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-border">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function ProfileTab() {
  const qc = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const { data: serverData, isLoading } = useQuery<PhysicianProfileData>({
    queryKey: ["physician-profile"],
    queryFn: async () => {
      const r = await api.get("/api/profile/physician/");
      return r.data?.data ?? r.data ?? {};
    },
    staleTime: 60_000,
  });

  const [form, setForm] = useState<Partial<PhysicianProfileData>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Seed form from server on first load
  useEffect(() => {
    if (serverData && Object.keys(form).length === 0) {
      setForm({
        first_name: serverData.first_name ?? "",
        last_name: serverData.last_name ?? "",
        phone: serverData.phone ?? "",
        bio: serverData.bio ?? "",
        years_of_experience: serverData.years_of_experience ?? undefined,
        linkedin_url: serverData.linkedin_url ?? "",
        specialty: serverData.specialty ?? "",
        sub_specialty: serverData.sub_specialty ?? "",
        cpso_number: serverData.cpso_number ?? "",
        board_certifications: serverData.board_certifications ?? "",
        degrees: serverData.degrees ?? "",
        address: serverData.address ?? "",
        city: serverData.city ?? "",
        province: serverData.province ?? "",
        country: serverData.country ?? "Canada",
        zip_code: serverData.zip_code ?? "",
        work_eligibility: serverData.work_eligibility ?? false,
      });
    }
  }, [serverData]);

  const { data: subSpecialties = [] } = useSubSpecialties(form.specialty || undefined);

  const isDirty = avatarFile != null || Object.keys(form).some(key => {
    const k = key as keyof PhysicianProfileData;
    return (form[k] ?? "") !== ((serverData?.[k] ?? "") as string | boolean | number);
  });

  function set<K extends keyof PhysicianProfileData>(key: K, value: PhysicianProfileData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string]) setErrors(prev => { const e = { ...prev }; delete e[key as string]; return e; });
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Avatar must be under 2 MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Resume must be under 5 MB"); return; }
    setResumeUploading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      await api.post("/api/profile/physician/resume/", fd, {
        headers: { "Content-Type": undefined as unknown as string },
      });
      await qc.invalidateQueries({ queryKey: ["physician-profile"] });
      toast.success("Resume uploaded successfully");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setResumeUploading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.first_name?.trim()) errs.first_name = "First name is required";
    if (!form.last_name?.trim()) errs.last_name = "Last name is required";
    if (!form.specialty) errs.specialty = "Specialty is required";
    if (form.zip_code && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(form.zip_code)) {
      errs.zip_code = "Enter a valid Canadian postal code (e.g. M5V 3L9)";
    }
    if (form.years_of_experience !== undefined && form.years_of_experience !== null) {
      const yr = Number(form.years_of_experience);
      if (isNaN(yr) || yr < 0 || yr > 60) errs.years_of_experience = "Enter a valid number (0–60)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== undefined && v !== null) payload.append(k, String(v));
      });
      if (avatarFile) payload.append("avatar", avatarFile);
      await api.put("/api/profile/physician/", payload, {
        headers: { "Content-Type": undefined as unknown as string },
      });
      await qc.invalidateQueries({ queryKey: ["physician-profile"] });
      setAvatarFile(null);
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  const avatarSrc = avatarPreview ?? serverData?.avatar_url ?? null;
  const initials = [form.first_name, form.last_name]
    .filter(Boolean).map(s => s![0]).join("").toUpperCase() || "Dr";

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-3">
              <div className="h-5 w-40 animate-pulse rounded-lg bg-secondary" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(j => <div key={j} className="h-10 animate-pulse rounded-lg bg-secondary" />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Avatar + header ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="relative group shrink-0">
            <div className="h-20 w-20 rounded-full border-2 border-border overflow-hidden bg-secondary flex items-center justify-center">
              {avatarSrc
                ? <img src={avatarSrc} alt="Avatar" className="h-full w-full object-cover" />
                : <span className="text-2xl font-bold text-muted-foreground">{initials}</span>
              }
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-5 w-5 text-white" />
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-lg">
              Dr. {[form.first_name, form.last_name].filter(Boolean).join(" ") || "Your Name"}
            </p>
            <p className="text-sm text-muted-foreground">{serverData?.email}</p>
            {serverData?.profile_complete && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Profile complete
              </span>
            )}
            {!serverData?.profile_complete && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Incomplete profile
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {avatarSrc ? "Change photo" : "Upload photo"} · Max 2 MB
            </button>
            {isDirty && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Unsaved changes
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Personal info ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <PhysicianSectionHeader icon={UserIcon} title="Personal Information" subtitle="Your name, contact and short bio" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              First Name <span className="text-rose-500">*</span>
            </label>
            <input value={form.first_name ?? ""} onChange={e => set("first_name", e.target.value)} placeholder="Jane"
              className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${errors.first_name ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`} />
            {errors.first_name && <p className="mt-1 text-xs text-rose-500">{errors.first_name}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Last Name <span className="text-rose-500">*</span>
            </label>
            <input value={form.last_name ?? ""} onChange={e => set("last_name", e.target.value)} placeholder="Smith"
              className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${errors.last_name ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`} />
            {errors.last_name && <p className="mt-1 text-xs text-rose-500">{errors.last_name}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Email Address</label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">{serverData?.email}</span>
              <span className="ml-auto text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">Read-only</span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Phone Number</label>
            <input type="tel" value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} placeholder="+1 (416) 555-0100"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Years of Experience</label>
            <input type="number" min={0} max={60} value={form.years_of_experience ?? ""} onChange={e => set("years_of_experience", e.target.value === "" ? undefined : Number(e.target.value))}
              placeholder="e.g. 8"
              className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${errors.years_of_experience ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`} />
            {errors.years_of_experience && <p className="mt-1 text-xs text-rose-500">{errors.years_of_experience}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">LinkedIn Profile</label>
            <div className="relative">
              <Linkedin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input value={form.linkedin_url ?? ""} onChange={e => set("linkedin_url", e.target.value)} placeholder="linkedin.com/in/yourname"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Professional Bio</label>
          <textarea value={form.bio ?? ""} onChange={e => set("bio", e.target.value)} rows={3}
            placeholder="Brief professional summary (shown to employers on your profile)…"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 resize-none" />
        </div>
      </div>

      {/* ── Clinical credentials ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <PhysicianSectionHeader icon={Stethoscope} title="Clinical Credentials" subtitle="Specialty, certifications and licensure" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Specialty <span className="text-rose-500">*</span>
            </label>
            <select value={form.specialty ?? ""} onChange={e => { set("specialty", e.target.value); set("sub_specialty", ""); }}
              className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${errors.specialty ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`}>
              <option value="">Select specialty…</option>
              {SPECIALTIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {errors.specialty && <p className="mt-1 text-xs text-rose-500">{errors.specialty}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sub-specialty</label>
            <select value={form.sub_specialty ?? ""} onChange={e => set("sub_specialty", e.target.value)}
              disabled={!form.specialty || subSpecialties.length === 0}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50">
              <option value="">Select sub-specialty…</option>
              {subSpecialties.map(s => <option key={String(s.id)} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">CPSO Number</label>
            <input value={form.cpso_number ?? ""} onChange={e => set("cpso_number", e.target.value)} placeholder="e.g. 123456"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div className="flex items-center gap-3 self-end pb-0.5">
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={form.work_eligibility ?? false}
                  onChange={e => set("work_eligibility", e.target.checked)} />
                <div className={`h-5 w-9 rounded-full transition-colors ${form.work_eligibility ? "bg-primary" : "bg-secondary border border-border"}`}>
                  <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${form.work_eligibility ? "translate-x-4.5 ml-0.5" : "translate-x-0.5"}`} />
                </div>
              </div>
              <span className="text-sm font-medium text-foreground">Eligible to work in Canada</span>
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Board Certifications</label>
          <textarea value={form.board_certifications ?? ""} onChange={e => set("board_certifications", e.target.value)} rows={2}
            placeholder="e.g. FRCPC — Internal Medicine, ABIM Board Certified…"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 resize-none" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Degrees &amp; Education</label>
          <textarea value={form.degrees ?? ""} onChange={e => set("degrees", e.target.value)} rows={2}
            placeholder="e.g. MD — University of Toronto (2010), MSc — McGill (2012)…"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 resize-none" />
        </div>
      </div>

      {/* ── Location ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <PhysicianSectionHeader icon={MapPin} title="Location" subtitle="Your current practice location" />
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Street Address</label>
          <input value={form.address ?? ""} onChange={e => set("address", e.target.value)} placeholder="123 University Ave"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">City</label>
            <input value={form.city ?? ""} onChange={e => set("city", e.target.value)} placeholder="Toronto"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Province / Territory</label>
            <select value={form.province ?? ""} onChange={e => set("province", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="">Select province…</option>
              {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Postal Code</label>
            <input value={form.zip_code ?? ""} onChange={e => set("zip_code", e.target.value.toUpperCase())} placeholder="M5V 3L9" maxLength={7}
              className={`w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${errors.zip_code ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`} />
            {errors.zip_code && <p className="mt-1 text-xs text-rose-500">{errors.zip_code}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Country</label>
            <input value={form.country ?? "Canada"} onChange={e => set("country", e.target.value)} placeholder="Canada"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
        </div>
      </div>

      {/* ── Resume ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <PhysicianSectionHeader icon={FileCheck} title="Resume / CV" subtitle="Upload your latest curriculum vitae (PDF, DOC, DOCX · Max 5 MB)" />
        {serverData?.resume_url && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-800">Resume on file</p>
              <p className="text-xs text-emerald-600 truncate">{serverData.resume_url.split("/").pop()}</p>
            </div>
            <a href={serverData.resume_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition">
              <ExternalLink className="h-3 w-3" /> View
            </a>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
          <button type="button" onClick={() => resumeInputRef.current?.click()} disabled={resumeUploading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50">
            {resumeUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {resumeUploading ? "Uploading…" : serverData?.resume_url ? "Replace Resume" : "Upload Resume"}
          </button>
          <p className="text-xs text-muted-foreground">PDF, DOC, DOCX only</p>
        </div>
      </div>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <p className="text-xs text-muted-foreground">
          {isDirty
            ? <span className="font-semibold text-amber-600">You have unsaved changes</span>
            : "All changes saved"}
        </p>
        <button type="submit" disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

    </form>
  );
}

function SettingsTab() {
  return <ChangePasswordCard />;
}

function EmptyApplications() {
  return (
    <EmptyState
      icon={Briefcase}
      title="No applications yet"
      description="Start exploring jobs across Canada and apply with one click."
      action={{ to: "/jobs", label: "Browse jobs" }}
    />
  );
}

function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && (
        <Link
          to={action.to as never}
          className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-glow"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary" />
      ))}
    </div>
  );
}


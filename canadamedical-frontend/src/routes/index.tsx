import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Heart, Brain, Baby, Smile, Scissors, Activity, Syringe, Sun, ScanLine, Stethoscope,
  HeartPulse, Bone,
  MapPin, ArrowRight, ArrowUpRight, CheckCircle2, Star, ShieldCheck,
  Search, Briefcase, Building2, UserPlus, FileSearch, Handshake,
  ClipboardList, Send, BadgeCheck, DollarSign, ChevronRight,
} from "lucide-react";
import { FeaturedRecruiters } from "@/components/site/FeaturedRecruiters";
import { api } from "@/lib/api";
import heroDoctorImg from "@/assets/herobanner.jpeg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CandianMdJobs — Premier Physician Recruitment Platform" },
      {
        name: "description",
        content:
          "Find your next physician role across Canada. 1,200+ vetted opportunities at hospitals, clinics, and academic centres in every province.",
      },
    ],
  }),
  component: Index,
});

const SPECIALTY_TILES = [
  { name: "Cardiology", icon: Heart, count: 87, color: "text-rose-500 bg-rose-50" },
  { name: "Neurology", icon: Brain, count: 64, color: "text-violet-500 bg-violet-50" },
  { name: "Pediatrics", icon: Baby, count: 110, color: "text-emerald-500 bg-emerald-50" },
  { name: "Psychiatry", icon: Smile, count: 78, color: "text-blue-500 bg-blue-50" },
  { name: "General Surgery", icon: Scissors, count: 90, color: "text-slate-500 bg-slate-50" },
  { name: "Emergency Medicine", icon: Activity, count: 58, color: "text-amber-500 bg-amber-50" },
  { name: "Anesthesiology", icon: Syringe, count: 53, color: "text-pink-500 bg-pink-50" },
  { name: "Dermatology", icon: Sun, count: 46, color: "text-yellow-500 bg-yellow-50" },
  { name: "Radiology", icon: ScanLine, count: 58, color: "text-sky-500 bg-sky-50" },
  { name: "Obstetrics", icon: Stethoscope, count: 72, color: "text-fuchsia-500 bg-fuchsia-50" },
  { name: "Family Medicine", icon: HeartPulse, count: 148, color: "text-teal-500 bg-teal-50" },
  { name: "Orthopedics", icon: Bone, count: 73, color: "text-indigo-500 bg-indigo-50" },
];

const PHYS_STEPS = [
  { icon: UserPlus, title: "Create your profile", desc: "Build your profile and tell us about your ideal role." },
  { icon: FileSearch, title: "Get matched", desc: "Our smart tools match you with top opportunities." },
  { icon: Handshake, title: "Land your role", desc: "Work with experts at every step until you're hired." },
];
const EMP_STEPS = [
  { icon: ClipboardList, title: "Post your opening", desc: "Publish a vetted job listing with help from our team." },
  { icon: Send, title: "Receive shortlists", desc: "We deliver pre-screened, qualified physician candidates within days." },
  { icon: BadgeCheck, title: "Hire with confidence", desc: "Average time to offer is 28 days — 4× faster than industry norms." },
];

const OTHER_SERVICES = [
  "CV review",
  "Interview preparation",
  "Relocation support",
  "Offer review",
  "More services",
];

function useCounter(target: number, duration = 1500, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val;
}

function useInView<T extends HTMLElement>(opts: IntersectionObserverInit = { rootMargin: "-80px" }) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, opts);
    io.observe(ref.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, seen] as const;
}

function Index() {
  return (
    <div className="overflow-x-hidden">
      <Hero />
      <Stats />
      <Specialties />
      <ProvinceCoverage />
      <HowItWorks />
      <FeaturedJobsSection />
      <FeaturedRecruiters />
      <AssessmentBanner />
      <Testimonials />
      <FinalCTA />
    </div>
  );
}

/* ─────────────────── HERO ─────────────────── */
const ROTATING_SPECIALTIES = [
  "Family Physician", "Cardiologist", "Neurologist",
  "Anesthesiologist", "Emergency Physician", "Radiologist", "Psychiatrist",
];

function Hero() {
  const [specIdx, setSpecIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSpecIdx((i) => (i + 1) % ROTATING_SPECIALTIES.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative min-h-150 lg:min-h-170 overflow-hidden bg-white">

      {/* ── Full-banner background image ── */}
      <div className="absolute inset-0">
        <img
          src={heroDoctorImg}
          alt="Physician"
          className="h-full w-full object-cover object-top-right"
        />
        {/* Mobile: navy overlay so text is readable */}
        <div className="absolute inset-0 bg-[#0A1628]/70 sm:bg-transparent" />
        {/* Desktop: left-side gradient */}
        <div className="absolute inset-0 hidden sm:block bg-linear-to-r from-white/80 via-white/50 via-40% to-transparent" />
        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-white/40 to-transparent" />
      </div>

      {/* ── Content ── */}
      <div className="relative mx-auto max-w-7xl px-4 pt-12 pb-28 lg:px-8 lg:pt-16 lg:pb-32">
        <div className="grid lg:grid-cols-2 lg:gap-8">

          {/* LEFT — text content */}
          <div className="max-w-xl">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white sm:bg-blue-50 sm:border-blue-100 sm:text-[#1a6fd4]">
                Simplify
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white sm:bg-blue-50 sm:border-blue-100 sm:text-[#1a6fd4]">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse sm:bg-[#1a6fd4]" />
                Canada's #1 Physician Job Site
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-primary sm:text-5xl lg:text-[56px]">
              <span className="block">The smarter way</span>
              <span className="block">to hire a</span>
              <span
                key={specIdx}
                className="block text-[#7eb8f7] sm:text-[#1a6fd4] mt-1"
                style={{ animation: "fadeUp 0.4s ease both" }}
              >
                {ROTATING_SPECIALTIES[specIdx]}
              </span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-white/80 sm:text-slate-600">
              Permanent, locum, and academic roles at Canada's top hospitals &amp; health authorities, and clinics — matched to your specialty, province, and lifestyle.
            </p>

            {/* Search bar */}
            <div className="mt-7">
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_4px_24px_rgba(0,0,0,0.10)] max-w-md"
              >
                <div className="relative flex-1 min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search by city, or employer…"
                    className="w-full rounded-xl bg-transparent py-2.5 pl-9 pr-2 text-sm text-foreground placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <select className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus:outline-none hidden sm:block">
                  <option value="">All provinces</option>
                  {["ON","BC","AB","QC","MB","NS","SK","NB","NL","PE"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <Link
                  to="/jobs"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1560be] sm:px-5"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Search</span>
                </Link>
              </form>
            </div>

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1560be] hover:scale-[1.02]"
              >
                Get matched now
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/employers"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 backdrop-blur-sm px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25 sm:border-slate-300 sm:bg-white/80 sm:text-slate-700 sm:hover:border-[#1a6fd4]/40 sm:hover:bg-white"
              >
                I'm hiring →
              </Link>
            </div>

            {/* Trust row */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-white/70 text-xs sm:text-slate-500">4.9/5 from 2,300+ reviews</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/70 sm:text-slate-500">
                <ShieldCheck className="h-4 w-4 text-white/80 sm:text-[#1a6fd4]" />
                College verified employers
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/70 sm:text-slate-500">
                <BadgeCheck className="h-4 w-4 text-white/80 sm:text-[#1a6fd4]" />
                3-5K more hires
              </div>
            </div>
          </div>

          {/* RIGHT — empty, image shows through */}
          <div className="hidden lg:block" />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── STATS ─────────────────── */
interface PlatformStats {
  total_active_jobs?: number;
  total_active_candidates?: number;
}

function Stats() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { data } = useQuery<PlatformStats>({
    queryKey: ["public-stats"],
    queryFn: async () => {
      const r = await api.get("/api/stats/");
      return r.data?.data ?? r.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = [
    { value: data?.total_active_jobs ?? 1, suffix: "+", label: "Active opportunities", icon: Briefcase },
    { value: data?.total_active_candidates ?? 3, suffix: "+", label: "Registered physicians", icon: UserPlus },
    { value: 487, suffix: "", label: "Healthcare partners", icon: Building2 },
    { value: 28, suffix: " days", label: "Average time to hire", icon: BadgeCheck },
  ];

  return (
    <section ref={ref} className="bg-transparent -mt-8 relative z-10">
      <div className="mx-auto max-w-5xl px-4 lg:px-8">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_32px_rgba(0,0,0,0.08)]">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 lg:grid-cols-4 lg:divide-y-0">
            {items.map((s, i) => (
              <StatItem key={s.label} {...s} seen={seen} delay={i * 80} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatItem({ value, label, suffix, icon: Icon, seen, delay }: { value: number; label: string; suffix: string; icon: typeof Briefcase; seen: boolean; delay: number }) {
  const v = useCounter(value, 1400, seen);
  return (
    <div
      className={`flex flex-col gap-2 px-8 py-6 ${seen ? "animate-fade-up" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <Icon className="h-5 w-5 text-slate-400" />
      <div className="text-2xl font-extrabold tracking-tight text-slate-800">
        {v.toLocaleString()}{suffix}
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

/* ─────────────────── SPECIALTIES ─────────────────── */
function Specialties() {
  return (
    <section className="bg-[#f0f4ff]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Browse by specialty</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Explore by specialty
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Find opportunities in your ideal expertise — from acute care to community practice.
            </p>
          </div>
          <Link to="/jobs" className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-[#1a6fd4] shrink-0">
            View all specialties <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {SPECIALTY_TILES.map(({ name, icon: Icon, count, color }, i) => (
            <Link
              key={name}
              to="/jobs"
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-fade-up group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#0f1f3d]">{name}</div>
                <div className="text-xs text-[#1a6fd4]">{count} positions</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── PROVINCE COVERAGE ─────────────────── */
const PROVINCE_LIST = [
  { code: "BC", label: "British Columbia" },
  { code: "AB", label: "Prairie Provinces" },
  { code: "ON", label: "Ontario" },
  { code: "QC", label: "Quebec" },
  { code: "MB", label: "Manitoba" },
  { code: "SK", label: "Saskatchewan" },
  { code: "NS", label: "Nova Scotia" },
  { code: "NB", label: "New Brunswick" },
  { code: "NL", label: "Newfoundland & Labrador" },
  { code: "PE", label: "Prince Edward Island" },
  { code: "NT", label: "Northwest Territories" },
  { code: "YT", label: "Yukon" },
  { code: "NU", label: "Nunavut" },
];

interface ProvinceCount { province: string; count: number; }

function ProvinceCoverage() {
  const { data: counts, isLoading } = useQuery<ProvinceCount[]>({
    queryKey: ["province-job-counts"],
    queryFn: async () => {
      const results = await Promise.all(
        PROVINCE_LIST.map(async ({ code }) => {
          const r = await api.get(`/api/jobs/?province=${code}&page_size=1`);
          const d = r.data?.data ?? r.data;
          const count = Array.isArray(d) ? d.length : (d?.count ?? d?.results?.length ?? 0);
          return { province: code, count };
        })
      );
      return results;
    },
    staleTime: 5 * 60 * 1000,
  });

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach(({ province, count }) => { countMap[province] = count; });

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Coast to coast</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
            Physician Opportunities Across Canada
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            From Vancouver to St. John's — coast to coast coverage
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {PROVINCE_LIST.map(({ code, label }, i) => {
            const jobCount = isLoading ? null : (countMap[code] ?? 0);
            const hasJobs = jobCount != null && jobCount > 0;
            return (
              <a
                key={code}
                href={`/jobs?province=${code}`}
                style={{ animationDelay: `${i * 35}ms` }}
                className={`animate-fade-up group flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  hasJobs
                    ? "border-[#1a6fd4]/15 bg-[#f0f6ff] hover:border-[#1a6fd4]/40 hover:bg-white"
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition ${
                  hasJobs ? "bg-red-50" : "bg-slate-50"
                }`}>
                  🍁
                </div>
                <div>
                  <div className="text-[13px] font-semibold leading-tight text-[#0f1f3d]">{label}</div>
                  {isLoading ? (
                    <div className="mx-auto mt-1.5 h-2.5 w-14 animate-pulse rounded-full bg-slate-200" />
                  ) : hasJobs ? (
                    <div className="mt-1 text-[11px] font-medium text-[#1a6fd4]">{jobCount} opportunities</div>
                  ) : (
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">Coming soon</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── HOW IT WORKS ─────────────────── */
function HowItWorks() {
  const [tab, setTab] = useState<"physician" | "employer">("physician");
  const steps = tab === "physician" ? PHYS_STEPS : EMP_STEPS;
  return (
    <section className="bg-[#0f1f3d]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">How it works</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            A simple, premium experience
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/55">
            Whether you're hiring or looking — we've removed the friction.
          </p>

          {/* Tab toggle */}
          <div className="mt-7 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {(["physician", "employer"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-full px-6 py-2 text-sm font-semibold capitalize transition ${
                  tab === k
                    ? "bg-white text-[#0f1f3d] shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
              >
                For {k === "physician" ? "Physicians" : "Employers"}
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="relative mt-12 grid gap-4 lg:grid-cols-3 lg:gap-5">
          {/* dashed connector */}
          <div className="pointer-events-none absolute left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] top-10 hidden h-px border-t-2 border-dashed border-white/10 lg:block" />

          {steps.map((s, i) => (
            <div
              key={s.title}
              style={{ animationDelay: `${i * 100}ms` }}
              className="animate-fade-up relative rounded-2xl border border-white/8 bg-[#162647] p-6 transition hover:border-[#1a6fd4]/40 hover:bg-[#1a2d55]"
            >
              {/* Step number top-right */}
              <span className="absolute right-5 top-4 text-4xl font-black text-white/10 select-none">
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* Icon */}
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a6fd4]/20 border border-[#1a6fd4]/30">
                <s.icon className="h-5 w-5 text-[#1a6fd4]" />
              </div>

              <h3 className="mt-5 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FEATURED JOBS ─────────────────── */
const SPEC_BADGE: Record<string, string> = {
  Cardiology: "bg-rose-100 text-rose-600",
  Neurology: "bg-violet-100 text-violet-600",
  Pediatrics: "bg-emerald-100 text-emerald-600",
  Psychiatry: "bg-blue-100 text-blue-600",
  "General Surgery": "bg-slate-100 text-slate-700",
  "Emergency Medicine": "bg-amber-100 text-amber-600",
  Anesthesiology: "bg-pink-100 text-pink-600",
  Dermatology: "bg-yellow-100 text-yellow-700",
  Radiology: "bg-sky-100 text-sky-600",
  Obstetrics: "bg-fuchsia-100 text-fuchsia-600",
  "Family Medicine": "bg-teal-100 text-teal-600",
};

interface FeaturedJob {
  id: number; title: string;
  specialty_display?: string; specialty?: string;
  job_type_display?: string;
  employer_name?: string;
  location_display?: string;
  salary_display?: string; salary_min?: number; salary_max?: number;
}

function getFeaturedSalaryLine(j: FeaturedJob): string | null {
  if (j.salary_display) return j.salary_display;
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : n.toLocaleString();
  if (j.salary_min != null && j.salary_max != null) return `$${fmt(j.salary_min)} – $${fmt(j.salary_max)}/yr`;
  if (j.salary_min != null) return `From $${fmt(j.salary_min)}/yr`;
  if (j.salary_max != null) return `Up to $${fmt(j.salary_max)}/yr`;
  return null;
}

function FeaturedJobsSection() {
  const { data, isLoading } = useQuery<FeaturedJob[]>({
    queryKey: ["featured-jobs"],
    queryFn: async () => {
      const r = await api.get("/api/jobs/?page_size=6");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    staleTime: 3 * 60 * 1000,
  });
  const featured = data ?? [];

  return (
    <section className="bg-[#f8faff]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Latest Opportunities</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Hand-picked physician roles
            </h2>
          </div>
          <Link to="/jobs" className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-[#1a6fd4] shrink-0">
            View all jobs <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-100 bg-white" />
              ))
            : featured.map((j, i) => {
                const specialty = j.specialty_display ?? j.specialty ?? "";
                const initials = (j.employer_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("");
                const badge = SPEC_BADGE[specialty] ?? "bg-slate-100 text-slate-600";
                return (
                  <Link
                    key={j.id}
                    to="/jobs/$jobId"
                    params={{ jobId: String(j.id) }}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className="animate-fade-up group relative flex flex-col rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1a6fd4]/20 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {specialty && (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge}`}>
                            {specialty}
                          </span>
                        )}
                        {j.job_type_display && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {j.job_type_display}
                          </span>
                        )}
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f1f3d] text-[11px] font-extrabold text-white shadow-sm">
                        {initials || "N"}
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">N</span>
                      </span>
                    </div>

                    <h3 className="mt-3 text-sm font-bold text-[#0f1f3d] group-hover:text-[#1a6fd4]">
                      {j.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                      {j.location_display && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {j.location_display}
                        </span>
                      )}
                      {j.employer_name && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {j.employer_name}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs font-semibold text-emerald-600">
                        {getFeaturedSalaryLine(j) ?? "Competitive salary"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#1a6fd4] px-3 py-1.5 text-[11px] font-bold text-white transition group-hover:bg-[#1560be]">
                        View position <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── ASSESSMENT BANNER ─────────────────── */
function AssessmentBanner() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14 lg:px-8 lg:py-16">
        <div className="relative isolate overflow-hidden rounded-3xl shadow-xl"
          style={{ background: "linear-gradient(135deg, #1de9b6 0%, #1a6fd4 50%, #1560be 100%)" }}
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative grid gap-8 p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-6 lg:p-12">
            {/* LEFT */}
            <div>
              <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                Free • 2 minutes
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Get matched with<br />the perfect role.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">
                Tell us about your specialty, lifestyle goals and practice preferences. Our match AI will find you perfect opportunities tailored to your needs and career goals.
              </p>
              <ul className="mt-4 space-y-2">
                {["Personalized job matches", "Confidential & secure matching process", "Completely free with guidance"].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-sm text-white/90">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-white" /> {t}
                  </li>
                ))}
              </ul>
              <Link
                to="/assessment"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0f1f3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#162647]"
              >
                Start free assessment <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* RIGHT — form mock */}
            <div className="hidden lg:block">
              <div className="rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-400">Step 1 of 4</span>
                  <span className="text-xs font-bold text-[#1a6fd4]">Personalize</span>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-100 mb-5">
                  <div className="h-full w-1/4 rounded-full bg-[#1a6fd4]" />
                </div>
                <div className="space-y-3">
                  {["YOUR SPECIALTY", "YOUR PROVINCE", "PREFERRED PRACTICE TYPE", "PREFERRED LOCATION"].map((l, idx) => (
                    <div key={l}>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{l}</div>
                      <div className={`h-9 rounded-lg border ${idx === 0 ? "border-[#1a6fd4]/40 bg-[#f0f6ff]" : "border-slate-100 bg-slate-50"}`} />
                    </div>
                  ))}
                </div>
                <button className="mt-4 w-full rounded-xl bg-[#0f1f3d] py-2.5 text-sm font-bold text-white transition hover:bg-[#162647]">
                  Continue →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── TESTIMONIALS ─────────────────── */
interface PublicTestimonial {
  id: number; physician_name: string; specialty?: string; location?: string; testimonial_text: string;
}

function Testimonials() {
  const { data, isLoading } = useQuery<PublicTestimonial[]>({
    queryKey: ["public-testimonials"],
    queryFn: async () => {
      const r = await api.get("/api/testimonials/");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });
  const items = data ?? [];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Physician Stories</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Trusted by Canada's medical community
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
                ))
              : items.length > 0 ? items.map((t, i) => {
                  const initials = t.physician_name.split(" ").map((w) => w[0]).slice(0, 2).join("");
                  return (
                    <figure
                      key={t.id}
                      style={{ animationDelay: `${i * 80}ms` }}
                      className="animate-fade-up flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star key={idx} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </div>
                      <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">
                        &ldquo;{t.testimonial_text}&rdquo;
                      </blockquote>
                      <figcaption className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f1f3d] text-xs font-bold text-white">
                          {initials}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-[#0f1f3d]">{t.physician_name}</div>
                          <div className="text-xs text-slate-400">{[t.specialty, t.location].filter(Boolean).join(" · ")}</div>
                        </div>
                      </figcaption>
                    </figure>
                  );
                })
              : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── FINAL CTA ─────────────────── */
function FinalCTA() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-14 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="relative isolate overflow-hidden rounded-3xl bg-[#0f1f3d] px-8 py-10 shadow-xl lg:px-14 lg:py-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#1a6fd4]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[#1a6fd4]/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Ready to take the next step?
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Join 6,250+ physicians who've found their ideal position through CandianMdJobs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
              <Link
                to="/register/physician"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#0f1f3d] transition hover:bg-slate-100"
              >
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/employers"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                I'm hiring
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

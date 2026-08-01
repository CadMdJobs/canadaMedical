import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Heart, ShieldCheck, Star, Target, Users,
  ArrowRight, CheckCircle2, MapPin, Award,
  Briefcase, TrendingUp, Globe, Stethoscope,
  Building2, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — CandianMdJobs" },
      { name: "description", content: "Canada's dedicated physician recruitment platform — built by healthcare professionals, for healthcare professionals." },
    ],
  }),
  component: AboutPage,
});

// ── Animated counter ────────────────────────────────────────────────────────────

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

function useCounter(target: number, duration = 1600, start = false) {
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

interface PlatformStats { total_active_jobs?: number; }

// ── Data ────────────────────────────────────────────────────────────────────────

const CORE_VALUES = [
  {
    icon: ShieldCheck,
    title: "Integrity & Trust",
    desc: "We operate with honesty and transparency in everything we do — earning the trust of physicians and employers nationwide.",
    iconBg: "bg-[#1a6fd4]/10",
    iconColor: "text-[#1a6fd4]",
  },
  {
    icon: Heart,
    title: "Physician-First Approach",
    desc: "Physicians come first in all of our decisions — we're here to champion your goals and support your professional fulfilment.",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-500",
  },
  {
    icon: Star,
    title: "Excellence in Service",
    desc: "We are committed to delivering exceptional service and a seamless experience — every interaction matters.",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-500",
  },
  {
    icon: Users,
    title: "Diversity & Inclusion",
    desc: "We celebrate Canada's diversity and are committed to creating equitable opportunities for physicians across all communities and backgrounds.",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
];

const TIMELINE = [
  { year: "2016", title: "CandianMdJobs Launched",         desc: "Started with a small team of healthcare professionals who understood the challenges physicians face in finding the right opportunities." },
  { year: "2018", title: "Nationwide Expansion",           desc: "Expanded our reach to all 13 provinces and territories, partnering with healthcare organizations across Canada." },
  { year: "2020", title: "1,500+ Employer Partners",       desc: "Built a network of over 1,500 verified healthcare employers across all specialties and care settings." },
  { year: "2023", title: "Free Career Assessment Launched",desc: "Introduced our free physician career assessment to help physicians discover their ideal career paths." },
  { year: "2024+",title: "1,200+ Physicians Placed",       desc: "Proud to have successfully placed over 1,200 physicians into roles across Canada in 2024 and beyond." },
];

const PROVINCES = [
  "British Columbia", "Alberta",       "Saskatchewan",          "Manitoba",
  "Ontario",          "Quebec",         "New Brunswick",          "Nova Scotia",
  "Prince Edward Island", "Newfoundland & Labrador", "Northwest Territories",
  "Yukon",            "Nunavut",
];

// ── Page ────────────────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <div className="overflow-x-hidden bg-white">
      <HeroSection />
      <OurStorySection />
      <MissionVisionSection />
      <CoreValuesSection />
      <TimelineSection />
      <ImpactSection />
      <ProvincesSection />
      <CTASection />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   1. Hero — white bg, left text + right doctor photo with floating stats
══════════════════════════════════════════════════════════════════════════════ */
function HeroSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">

          {/* Left */}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Our Story</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-[#0f1f3d] sm:text-5xl">
              Built for Canada's<br />
              <span className="text-[#1a6fd4]">Medical Community</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-500">
              We are Canada's dedicated physician recruitment platform — built by healthcare professionals, for healthcare professionals. Together, we connect top-tier physicians with the communities that need them most — and help build stronger healthcare across the country.
            </p>
            <div className="mt-7 flex flex-wrap gap-5">
              {[
                { icon: CheckCircle2, text: "College-verified employers" },
                { icon: CheckCircle2, text: "25+ employer partners" },
                { icon: CheckCircle2, text: "All provinces & territories" },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Icon className="h-4 w-4 text-[#1a6fd4]" /> {text}
                </span>
              ))}
            </div>
          </div>

          {/* Right — doctor image placeholder + floating stat cards */}
          <div className="relative hidden lg:block">
            {/* Main card */}
            <div className="overflow-hidden rounded-3xl bg-[#f0f4ff] shadow-lg" style={{ minHeight: 340 }}>
              <div className="flex h-full min-h-85 items-center justify-center">
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#0f1f3d]">
                    <Stethoscope className="h-10 w-10 text-white" />
                  </div>
                  <p className="text-lg font-bold text-[#0f1f3d]">Canada's #1 Physician Platform</p>
                  <p className="text-sm text-slate-500">Trusted by physicians & employers nationwide</p>
                </div>
              </div>
            </div>
            {/* Floating: satisfaction rate */}
            <div className="absolute -right-6 -top-6 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Satisfaction Rate</p>
              <p className="mt-1 text-3xl font-extrabold text-[#0f1f3d]">95%</p>
              <p className="text-xs text-slate-400">Employer satisfaction</p>
            </div>
            {/* Floating: national reach */}
            <div className="absolute -bottom-6 -left-6 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">National Reach</p>
              <p className="mt-1 text-3xl font-extrabold text-[#0f1f3d]">13</p>
              <p className="text-xs text-slate-400">Provinces & Territories</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   2. Our Story — 2-col text + Canada map card
══════════════════════════════════════════════════════════════════════════════ */
function OurStorySection() {
  return (
    <section className="bg-white border-t border-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Our Story</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Connecting Canada's Medical Talent
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-500">
              CandianMdJobs.com was founded with a simple mission: to simplify physician recruitment across Canada and create meaningful connections between talented physicians and outstanding healthcare organizations.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              We recognized a gap in the Canadian healthcare recruitment market — physicians and employers needed a dedicated, trustworthy platform that truly understands the unique landscape of Canadian medicine. From urban academic medical centres to remote northern clinics, every region of Canada deserves access to exceptional physician talent.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Today, CandianMdJobs is helping to transform how physicians and healthcare organizations connect — across 13 provinces and territories, featuring{" "}
              <strong className="font-semibold text-[#0f1f3d]">1,500+ active positions</strong> and{" "}
              <strong className="font-semibold text-[#0f1f3d]">25+ employer partners</strong>.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/jobs"
                className="inline-flex items-center gap-2 rounded-xl bg-[#0f1f3d] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#162647]"
              >
                Browse Jobs <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/employers"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#1a6fd4]/40 hover:text-[#1a6fd4]"
              >
                For Employers
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-[#f0f4ff] shadow-sm">
              <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Globe className="h-8 w-8 text-[#1a6fd4]" />
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-[#0f1f3d]">🍁 Canada</p>
                  <p className="mt-1 text-sm text-slate-500">All 13 provinces & territories</p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-xl sm:block">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nationwide</p>
              <p className="mt-0.5 text-2xl font-extrabold text-[#0f1f3d]">13</p>
              <p className="text-xs text-slate-400">Provinces & Territories</p>
            </div>
            <div className="absolute -right-5 -top-5 hidden rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-xl sm:block">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Satisfaction</p>
              <p className="mt-0.5 text-2xl font-extrabold text-[#0f1f3d]">95%</p>
              <p className="text-xs text-slate-400">Placement success rate</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   3. Mission / Vision / Values — white bg, 3 cards
══════════════════════════════════════════════════════════════════════════════ */
function MissionVisionSection() {
  const cards = [
    {
      icon: Target,
      label: "Our Mission",
      title: "Connect & Empower",
      body: "To connect Canada's physicians with meaningful career opportunities and enable them to make a lasting impact in healthcare across urban and rural Canada.",
      iconBg: "bg-[#1a6fd4]/10",
      iconColor: "text-[#1a6fd4]",
    },
    {
      icon: TrendingUp,
      label: "Our Vision",
      title: "Most Trusted Platform",
      body: "To be Canada's most trusted physician recruitment platform — recognized for quality, integrity and results — shaping the future of healthcare by connecting the right doctors with the right communities.",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      icon: Heart,
      label: "Our Values",
      title: "Genuine Care",
      body: "We prioritise transparency, respect and relationships. We listen to our community and build with purpose. We measure our success by the lives positively impacted by our work.",
      iconBg: "bg-rose-100",
      iconColor: "text-rose-500",
    },
  ];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">What Drives Us</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
            Our Mission, Vision & Values
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
            Every decision we make is guided by a clear north star — improving physician careers and Canada's healthcare outcomes.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.iconBg}`}>
                <c.icon className={`h-6 w-6 ${c.iconColor}`} />
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{c.label}</p>
              <h3 className="mt-1 text-lg font-extrabold text-[#0f1f3d]">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   4. Core Values — dark navy bg, 4 cards
══════════════════════════════════════════════════════════════════════════════ */
function CoreValuesSection() {
  return (
    <section className="bg-[#0f1f3d]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7eb3f5]">What We Stand For</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">What We Stand For</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Every decision we make is guided by our core values — from how we vet our employer partners to how we support physicians in their career journey.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_VALUES.map((v) => (
            <div key={v.title} className="rounded-2xl border border-white/8 bg-[#162647] p-6 transition hover:border-[#1a6fd4]/40">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${v.iconBg}`}>
                <v.icon className={`h-6 w-6 ${v.iconColor}`} />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   5. Timeline — white bg, vertical timeline with year pills
══════════════════════════════════════════════════════════════════════════════ */
function TimelineSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Our Journey</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
            How We've Grown
          </h2>
        </div>

        <div className="relative mt-14 ml-6 sm:ml-0">
          {/* Vertical line */}
          <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-linear-to-b from-[#1a6fd4] via-[#1a6fd4]/40 to-transparent sm:left-9" />

          <div className="space-y-6">
            {TIMELINE.map((item, i) => (
              <div key={item.year} className="relative flex items-start gap-5 sm:gap-7">
                {/* Year pill */}
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0f1f3d] shadow-lg sm:h-13 sm:w-13"
                  style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="text-[11px] font-extrabold text-white leading-none">{item.year}</span>
                </div>

                {/* Card */}
                <div className="flex-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h3 className="font-bold text-[#0f1f3d]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   6. Impact stats — white bg with light blue section header
══════════════════════════════════════════════════════════════════════════════ */
function ImpactSection() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { data } = useQuery<PlatformStats>({
    queryKey: ["public-stats"],
    queryFn: async () => { const r = await api.get("/api/stats/"); return r.data?.data ?? r.data; },
    staleTime: 5 * 60 * 1000,
  });
  const stats = [
    { value: 1200, suffix: "+", label: "Physicians Placed",     icon: Users },
    { value: data?.total_active_jobs ?? 500, suffix: "+", label: "Active Job Opportunities", icon: Briefcase },
    { value: 200,  suffix: "+", label: "Employer Partners",      icon: Building2 },
    { value: 95,   suffix: "%", label: "Employer Satisfaction Rate", icon: Star },
  ];
  return (
    <section ref={ref} className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Our Impact</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">Across Canada</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
            Numbers that reflect our commitment to Canadian healthcare
          </p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {stats.map((s, i) => <ImpactCard key={s.label} {...s} seen={seen} delay={i * 80} />)}
        </div>
      </div>
    </section>
  );
}

function ImpactCard({ value, suffix, label, icon: Icon, seen, delay }: {
  value: number; suffix: string; label: string; icon: typeof Users; seen: boolean; delay: number;
}) {
  const v = useCounter(value, 1800, seen);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f4ff]">
        <Icon className="h-6 w-6 text-[#1a6fd4]" />
      </div>
      <p className="mt-4 text-4xl font-extrabold tracking-tight text-[#0f1f3d]">
        {seen ? v.toLocaleString() : "0"}{suffix}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   7. Provinces — white bg, 2-col header, province grid
══════════════════════════════════════════════════════════════════════════════ */
function ProvincesSection() {
  return (
    <section className="bg-white border-t border-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">National Coverage</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Physician Opportunities in Every Province & Territory
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-500">
              We serve every province and territory across Canada — from major urban centres to remote northern communities.
            </p>
          </div>
          <Link
            to="/jobs"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[#1a6fd4] hover:underline"
          >
            View all jobs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {PROVINCES.map((province) => (
            <Link
              key={province}
              to="/jobs"
              className="group flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-4 py-3.5 transition hover:border-[#1a6fd4]/30 hover:shadow-md"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[#1a6fd4]" />
              <span className="text-sm font-medium text-slate-600 group-hover:text-[#0f1f3d]">{province}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   8. CTA — dark navy rounded card with briefcase icon + 2 buttons
══════════════════════════════════════════════════════════════════════════════ */
function CTASection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-2 sm:pb-24 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#0f1f3d] px-8 py-10 sm:px-14 sm:py-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#1a6fd4]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#1a6fd4]/10 blur-3xl" />

          <div className="relative flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              {/* Icon box */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#1a6fd4]/20">
                <Briefcase className="h-8 w-8 text-[#7eb3f5]" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7eb3f5]">
                  Join Canada's Medical Community
                </p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  Ready to take the next step?
                </h2>
                <p className="mt-1 max-w-md text-sm text-slate-400">
                  Whether you're exploring new opportunities or looking for top talent, we're here to help.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                to="/jobs"
                className="inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-[#1560be]"
              >
                Find a Job <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/employers"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                For Employers <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

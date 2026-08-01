import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, Search, Users, Briefcase, ShieldCheck, Headphones, Phone } from "lucide-react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ — CandianMdJobs" }] }),
  component: FAQPage,
});

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category?: string;
  order?: number;
}

const STATIC_FAQS: FAQItem[] = [
  { id: -1,  category: "General",    question: "Is CanadianMdJobs free for physicians?",              answer: "Yes — registration, profile creation, job applications, and recruiter support are completely free for physicians. You only pay for premium features if you choose to upgrade your profile." },
  { id: -2,  category: "General",    question: "How are jobs verified?",                              answer: "Every employer is vetted and every job listing is reviewed by our recruitment team before going live." },
  { id: -3,  category: "Physicians", question: "I'm an internationally trained physician. Can you help?", answer: "Absolutely. We work with IMGs through licensing pathways (MCC, Practice Ready Assessment) and immigration support across most provinces." },
  { id: -4,  category: "Physicians", question: "Will my profile be visible to my current employer?",  answer: "No. Your profile is confidential. Employers only see your details after you apply or you opt-in to be discoverable." },
  { id: -5,  category: "Physicians", question: "Do you handle locum work?",                          answer: "Yes — we offer permanent, contract and locum opportunities across all provinces." },
  { id: -6,  category: "Licensing",  question: "How do licensing and credentialing work?",            answer: "We guide physicians through the provincial licensing process, including MCC exams, Practice Ready Assessment programs, and college registration in each province." },
  { id: -7,  category: "Employers",  question: "How do I become an employer partner?",               answer: "Register on the For Employers page or contact our sales team. Onboarding takes 1–2 business days." },
  { id: -8,  category: "Employers",  question: "Can employers search physician profiles?",           answer: "Yes — employer plans include access to our physician search tool, allowing you to filter by specialty, province, licensure status and availability." },
  { id: -9,  category: "Recruitment",question: "How long does the recruitment process take?",        answer: "Most physicians receive a shortlist within 7 days. Time-to-hire averages 28 days, depending on credentialing." },
  { id: -10, category: "Billing",    question: "What information do employers see?",                 answer: "Your CV, specialty, licensure and the contact details you choose to share — never anything sensitive without your consent." },
  { id: -11, category: "Billing",    question: "Do you offer refunds?",                             answer: "We offer a 14-day refund policy on paid plans if you are not satisfied with the service. Contact our support team to initiate a refund." },
];

// Category colour mapping — badge bg + text
const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  General:    { bg: "bg-slate-100",       text: "text-slate-600" },
  Physicians: { bg: "bg-[#e8f4fd]",       text: "text-[#1a6fd4]" },
  Employers:  { bg: "bg-[#e8f4fd]",       text: "text-[#1a6fd4]" },
  Licensing:  { bg: "bg-amber-50",        text: "text-amber-700" },
  Recruitment:{ bg: "bg-purple-50",       text: "text-purple-700" },
  Billing:    { bg: "bg-emerald-50",      text: "text-emerald-700" },
};

function FAQPage() {
  const [open, setOpen] = useState<number | null>(0);
  const [q, setQ]       = useState("");
  const [cat, setCat]   = useState("All");

  const { data: apiFaqs, isLoading } = useQuery<FAQItem[]>({
    queryKey: ["public-faqs"],
    queryFn: async () => {
      const r = await api.get("/api/faq/");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    staleTime: 10 * 60 * 1000,
  });

  const faqs = (apiFaqs && apiFaqs.length > 0) ? apiFaqs : STATIC_FAQS;

  const categories = useMemo(() => {
    const cats = [...new Set(faqs.map((f) => f.category).filter(Boolean))] as string[];
    // Ensure canonical order
    const order = ["General", "Physicians", "Employers", "Licensing", "Recruitment", "Billing"];
    const sorted = order.filter((c) => cats.includes(c));
    const rest = cats.filter((c) => !order.includes(c));
    return ["All", ...sorted, ...rest];
  }, [faqs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return faqs.filter((f) =>
      (cat === "All" || f.category === cat) &&
      (!needle || f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle))
    );
  }, [faqs, q, cat]);

  return (
    <div className="min-h-screen bg-white">

      {/* ══════════════════════════════════════════════════════════════════════
          Hero — dark navy, 2-col: left text + right 3 cards
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#0f1f3d]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">

            {/* Left */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Help Center
              </span>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                Frequently asked<br />questions
              </h1>
              <p className="mt-4 max-w-md text-base text-slate-400">
                Quick answers to the most common questions from physicians and employers.
              </p>
            </div>

            {/* Right — 3 feature cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Users,
                  title: "For Physicians",
                  desc: "Get answers about jobs, profiles and more.",
                },
                {
                  icon: Briefcase,
                  title: "For Employers",
                  desc: "Learn about hiring, pricing and features.",
                },
                {
                  icon: ShieldCheck,
                  title: "Trusted Support",
                  desc: "We're here to help every step of the way.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-[#162647] p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a6fd4]/25">
                    <Icon className="h-5 w-5 text-[#7eb3f5]" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-white">{title}</p>
                  <p className="mt-1 text-xs text-slate-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Content — search, category pills, accordion list, CTA card
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16 lg:px-6">

        {/* Search bar */}
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(null); }}
            placeholder="Search FAQs..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/15"
            maxLength={120}
          />
        </div>

        {/* Category pill tabs */}
        <div className="mb-7 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); setOpen(null); }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                cat === c
                  ? "bg-[#0f1f3d] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* FAQ accordion */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
            <p className="text-sm text-slate-500">No matching questions. Try a different search or category.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden shadow-sm">
            {filtered.map((f, i) => {
              const active = open === i;
              const catStyle = CAT_STYLE[f.category ?? ""] ?? { bg: "bg-slate-100", text: "text-slate-500" };
              return (
                <div key={f.id}>
                  <button
                    onClick={() => setOpen(active ? null : i)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-slate-50 transition"
                  >
                    {/* Category badge */}
                    {f.category && (
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${catStyle.bg} ${catStyle.text}`}>
                        {f.category}
                      </span>
                    )}

                    {/* Question */}
                    <span className="flex-1 text-sm font-semibold text-[#0f1f3d]">
                      {f.question}
                    </span>

                    {/* Toggle icon — teal */}
                    <span className="shrink-0 text-[#1a6fd4]">
                      {active
                        ? <Minus className="h-4 w-4" />
                        : <Plus className="h-4 w-4" />}
                    </span>
                  </button>

                  {active && (
                    <div className="bg-slate-50 px-6 pb-5 pt-3">
                      <p className="text-sm leading-relaxed text-slate-600">{f.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Still need help CTA */}
        <div className="mt-10 flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-sm sm:flex-row sm:gap-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f0f4ff]">
            <Headphones className="h-7 w-7 text-[#1a6fd4]" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-bold text-[#0f1f3d]">Still need help?</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Can't find the answer you're looking for? Our support team is here to help.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-3 sm:flex-col sm:items-end">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]"
            >
              <Headphones className="h-4 w-4" /> Contact Support
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" /> Schedule a Call
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

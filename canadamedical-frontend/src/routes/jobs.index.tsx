import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, MapPin, Briefcase, Building2, SlidersHorizontal,
  ArrowRight, X, Clock, Stethoscope, BadgeCheck, LayoutGrid, List,
  ChevronDown, Check, DollarSign, Bookmark, BookmarkCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { SPECIALTIES as FALLBACK_SPECIALTIES, PROVINCES as FALLBACK_PROVINCES, JOB_TYPES } from "@/data/jobs";

export const Route = createFileRoute("/jobs/")({
  head: () => ({
    meta: [
      { title: "Find a Physician Job in Canada — CandianMdJobs" },
      { name: "description", content: "Search 1,200+ physician jobs across Canada by specialty, province, and employer type." },
    ],
  }),
  component: JobsPage,
});

interface Job {
  id: number; title: string; specialty: string; specialty_display: string;
  job_type: string; job_type_display: string; employer_name: string;
  city: string; province: string; province_display: string; location_display: string;
  created_at: string; is_featured?: boolean; summary?: string;
  salary_display?: string; salary_min?: number; salary_max?: number; practice_setting?: string;
}

interface PracticeSetting { value: string; label: string; }

function formatSalary(amount: number): string {
  if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
  return amount.toLocaleString();
}

function getSalaryLine(job: Job): string | null {
  if (job.salary_display) return job.salary_display;
  if (job.salary_min != null && job.salary_max != null)
    return `$${formatSalary(job.salary_min)} – $${formatSalary(job.salary_max)} / yr`;
  if (job.salary_min != null) return `From $${formatSalary(job.salary_min)} / yr`;
  if (job.salary_max != null) return `Up to $${formatSalary(job.salary_max)} / yr`;
  return null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 30) return `Posted ${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `Posted ${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

function JobCardSkeleton() {
  return (
    <div className="animate-pulse border-b border-slate-100 px-6 py-5 last:border-0">
      <div className="flex gap-4">
        <div className="h-14 w-14 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="h-5 w-48 rounded bg-slate-100" />
          <div className="h-3.5 w-32 rounded bg-slate-100" />
          <div className="h-3.5 w-40 rounded bg-slate-100" />
          <div className="flex gap-2 pt-1">
            <div className="h-6 w-24 rounded-full bg-slate-100" />
            <div className="h-6 w-20 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="h-5 w-32 rounded bg-slate-100" />
          <div className="h-8 w-8 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const salaryLine = getSalaryLine(job);
  const initials = job.employer_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <article className="group border-b border-slate-100 px-6 py-5 last:border-0 transition hover:bg-slate-50/60">
      <div className="flex items-start gap-4">
        {/* Employer logo/initials */}
        <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#0f1f3d] text-sm font-extrabold text-white shadow-sm">
          {initials || "?"}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to="/jobs/$jobId" params={{ jobId: String(job.id) }}
                className="text-base font-bold text-[#0f1f3d] hover:text-[#1a6fd4] transition-colors line-clamp-1">
                {job.title}
              </Link>
              <p className="mt-0.5 text-sm text-slate-500">{job.employer_name}</p>
              <div className="mt-1 flex items-center gap-1 text-sm text-slate-400">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{job.location_display}</span>
              </div>
            </div>
            {/* Salary + bookmark — right side */}
            <div className="hidden sm:flex shrink-0 flex-col items-end gap-2">
              {salaryLine && (
                <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">{salaryLine}</span>
              )}
              <button className="rounded-full p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500">
                <Bookmark className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tags row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(job.job_type_display || job.job_type) && (
              <span className="inline-flex items-center rounded-full border border-[#1a6fd4]/20 bg-[#f0f4ff] px-2.5 py-0.5 text-xs font-semibold text-[#1a6fd4]">
                {job.job_type_display || job.job_type}
              </span>
            )}
            {(job.specialty_display || job.specialty) && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                {job.specialty_display || job.specialty}
              </span>
            )}
            {job.is_featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-600">
                <BadgeCheck className="h-3 w-3" /> Featured
              </span>
            )}
            <span className="ml-auto text-xs text-slate-400">{timeAgo(job.created_at)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function GridJobCard({ job }: { job: Job }) {
  const salaryLine = getSalaryLine(job);
  const initials = job.employer_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-[#1a6fd4]/20">
      {job.is_featured && (
        <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
          <BadgeCheck className="h-3 w-3" /> Featured
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0f1f3d] text-xs font-extrabold text-white shadow-sm">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <Link to="/jobs/$jobId" params={{ jobId: String(job.id) }}
            className="block text-sm font-bold text-[#0f1f3d] group-hover:text-[#1a6fd4] transition-colors line-clamp-2">
            {job.title}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">{job.employer_name}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-300" />{job.location_display}</span>
        {salaryLine && <span className="flex items-center gap-1.5 font-bold text-emerald-600"><DollarSign className="h-3.5 w-3.5" />{salaryLine}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(job.job_type_display || job.job_type) && (
          <span className="rounded-full border border-[#1a6fd4]/20 bg-[#f0f4ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#1a6fd4]">
            {job.job_type_display || job.job_type}
          </span>
        )}
        {(job.specialty_display || job.specialty) && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500">
            {job.specialty_display || job.specialty}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
        <span className="text-[11px] text-slate-400">{timeAgo(job.created_at)}</span>
        <Link to="/jobs/$jobId" params={{ jobId: String(job.id) }}
          className="inline-flex items-center gap-1 rounded-lg bg-[#1a6fd4] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1560be]">
          View <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

function JobsPage() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [province, setProvince] = useState("");
  const [jobType, setJobType] = useState("");
  const [practiceSetting, setPracticeSetting] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const debouncedQ = useDebounce(q, 400);
  const debouncedSalaryMin = useDebounce(salaryMin, 600);
  const debouncedSalaryMax = useDebounce(salaryMax, 600);

  const { data: practiceSettings } = useQuery<PracticeSetting[]>({
    queryKey: ["practice-settings"],
    queryFn: async () => { const r = await api.get("/api/jobs/practice-settings/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : []; },
    staleTime: 60 * 60 * 1000,
  });

  const { data: apiSpecialties } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["job-specialties"],
    queryFn: async () => { const r = await api.get("/api/jobs/specialties/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : []; },
    staleTime: 5 * 60 * 1000,
  });

  const { data: apiProvinces } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["job-provinces"],
    queryFn: async () => { const r = await api.get("/api/jobs/provinces/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : []; },
    staleTime: 5 * 60 * 1000,
  });

  const SPECIALTY_OPTIONS = (apiSpecialties && apiSpecialties.length > 0) ? apiSpecialties : FALLBACK_SPECIALTIES;
  const PROVINCES_LIST = (apiProvinces && apiProvinces.length > 0) ? apiProvinces : FALLBACK_PROVINCES;

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", debouncedQ, specialty, province, jobType, practiceSetting, debouncedSalaryMin, debouncedSalaryMax],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page_size", "50");
      if (debouncedQ) params.set("search", debouncedQ);
      if (specialty) params.set("specialty", specialty);
      if (province) params.set("province", province);
      if (jobType) params.set("job_type", jobType);
      if (practiceSetting) params.set("practice_setting", practiceSetting);
      if (debouncedSalaryMin) params.set("salary_min", debouncedSalaryMin);
      if (debouncedSalaryMax) params.set("salary_max", debouncedSalaryMax);
      const r = await api.get(`/api/jobs/?${params}`);
      const d = r.data?.data ?? r.data;
      return (Array.isArray(d) ? d : (d?.results ?? [])) as Job[];
    },
    staleTime: 60_000,
  });

  const jobs: Job[] = data ?? [];
  const activeFilterCount = [specialty, province, jobType, practiceSetting, salaryMin || salaryMax].filter(Boolean).length;

  function clearAll() {
    setQ(""); setSpecialty(""); setProvince(""); setJobType("");
    setPracticeSetting(""); setSalaryMin(""); setSalaryMax("");
  }

  /* ── Sidebar filter sections with checkboxes/dropdowns like the reference ── */
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({
    specialty: false, province: false, practiceSetting: false, salary: false,
  });

  function toggleDropdown(key: string) {
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function SelectDropdown({ id, label, value, placeholder, options, onChange }: {
    id: string; label: string; value: string; placeholder: string;
    options: { value: string; label: string }[]; onChange: (v: string) => void;
  }) {
    const isOpen = openDropdowns[id];
    const selected = options.find(o => o.value === value);
    return (
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="mb-2 text-xs font-bold text-slate-700">{label}</p>
        <button type="button" onClick={() => toggleDropdown(id)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 transition hover:border-slate-300">
          <span className={selected ? "text-[#0f1f3d] font-medium" : ""}>{selected?.label || placeholder}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            <button onClick={() => { onChange(""); toggleDropdown(id); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm transition hover:bg-slate-50 ${!value ? "font-semibold text-[#1a6fd4]" : "text-slate-500"}`}>
              {placeholder} {!value && <Check className="h-3.5 w-3.5" />}
            </button>
            {options.map(opt => (
              <button key={opt.value} onClick={() => { onChange(opt.value); toggleDropdown(id); }}
                className={`flex w-full items-center justify-between border-t border-slate-50 px-3 py-2 text-sm transition hover:bg-slate-50 ${value === opt.value ? "font-semibold text-[#1a6fd4]" : "text-slate-600"}`}>
                {opt.label} {value === opt.value && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function CheckboxGroup({ label, options, value, onChange }: {
    label: string; options: { value: string; label: string }[];
    value: string; onChange: (v: string) => void;
  }) {
    return (
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="mb-2.5 text-xs font-bold text-slate-700">{label}</p>
        <div className="space-y-2">
          {options.map(opt => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 group">
              <div onClick={() => onChange(value === opt.value ? "" : opt.value)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  value === opt.value ? "border-[#1a6fd4] bg-[#1a6fd4]" : "border-slate-300 bg-white group-hover:border-[#1a6fd4]/60"
                }`}>
                {value === opt.value && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </div>
              <span className={`text-sm transition ${value === opt.value ? "font-semibold text-[#0f1f3d]" : "text-slate-600 group-hover:text-[#0f1f3d]"}`}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  function SalaryFilter() {
    return (
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="mb-2 text-xs font-bold text-slate-700">Salary Range</p>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400 uppercase tracking-wider">Min (CAD/yr)</label>
            <input type="number" min={0} step={10000} placeholder="e.g. 200,000" value={salaryMin}
              onChange={e => setSalaryMin(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0f1f3d] placeholder-slate-300 outline-none focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10 transition" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400 uppercase tracking-wider">Max (CAD/yr)</label>
            <input type="number" min={0} step={10000} placeholder="e.g. 500,000" value={salaryMax}
              onChange={e => setSalaryMax(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0f1f3d] placeholder-slate-300 outline-none focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10 transition" />
          </div>
        </div>
      </div>
    );
  }

  const FilterPanel = () => (
    <div>
      <CheckboxGroup
        label="Employment Type"
        options={JOB_TYPES}
        value={jobType}
        onChange={setJobType}
      />
      <SelectDropdown id="specialty" label="Specialty" value={specialty} placeholder="Select specialty" options={SPECIALTY_OPTIONS} onChange={setSpecialty} />
      <SelectDropdown id="province" label="Province / Territory" value={province} placeholder="Select province" options={PROVINCES_LIST} onChange={setProvince} />
      <SelectDropdown id="practiceSetting" label="Practice Setting" value={practiceSetting} placeholder="Select setting" options={practiceSettings ?? []} onChange={setPracticeSetting} />
      <SalaryFilter />
      {activeFilterCount > 0 && (
        <div className="px-4 py-3">
          <button onClick={clearAll}
            className="w-full rounded-lg bg-[#1a6fd4] py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
            Apply Filters
          </button>
          <button onClick={clearAll}
            className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50">
            Clear all
          </button>
        </div>
      )}
      {activeFilterCount === 0 && (
        <div className="px-4 py-3">
          <button
            className="w-full rounded-lg bg-[#1a6fd4] py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );

  const HEADER_H = 72;

  return (
    <div className="min-h-screen bg-white">

      {/* ── TOP NAV BAR with search (sticky) ── */}
      <div
        className={`sticky z-30 border-b border-slate-100 bg-white transition-shadow duration-200 ${scrolled ? "shadow-sm" : ""}`}
        style={{ top: HEADER_H }}
      >
        <div className="mx-auto max-w-7xl px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search jobs, keywords, or locations..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-[#0f1f3d] placeholder-slate-400 outline-none transition focus:border-[#1a6fd4] focus:bg-white focus:ring-2 focus:ring-[#1a6fd4]/10"
              />
            </div>
            {/* Sort by — desktop */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 shrink-0">
              <span>Sort by</span>
              <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#1a6fd4]">
                <option>Newest</option>
                <option>Salary</option>
              </select>
            </div>
            {/* View toggles */}
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setView("list")}
                className={`rounded-lg border p-2 transition ${view === "list" ? "border-[#1a6fd4] bg-[#f0f4ff] text-[#1a6fd4]" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
                <List className="h-4 w-4" />
              </button>
              <button onClick={() => setView("grid")}
                className={`rounded-lg border p-2 transition ${view === "grid" ? "border-[#1a6fd4] bg-[#f0f4ff] text-[#1a6fd4]" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            {/* Mobile filter button */}
            <button onClick={() => setMobileFilterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#1a6fd4]/40 lg:hidden shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1a6fd4] text-[9px] font-bold text-white">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8">
        <div className="flex gap-6 items-start">

          {/* ── LEFT SIDEBAR ── */}
          <aside
            className="hidden w-72 flex-none rounded-2xl border border-slate-200 bg-white lg:block sticky overflow-hidden"
            style={{ top: HEADER_H + 60, maxHeight: `calc(100vh - ${HEADER_H + 76}px)`, overflowY: "auto" }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#0f1f3d]">
                <SlidersHorizontal className="h-4 w-4 text-[#1a6fd4]" /> Filters
              </h2>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} className="text-xs font-semibold text-[#1a6fd4] hover:underline">
                  Clear all
                </button>
              )}
            </div>
            <FilterPanel />
          </aside>

          {/* ── RIGHT: results ── */}
          <div className="flex-1 min-w-0">

            {/* Results count + active tags */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-500">
                {isLoading
                  ? <span className="inline-block h-4 w-32 animate-pulse rounded bg-slate-100" />
                  : <>Showing 1–{jobs.length} of <span className="font-bold text-[#0f1f3d]">{jobs.length}</span> jobs</>
                }
              </p>
              {[
                specialty && { label: SPECIALTY_OPTIONS.find(s => s.value === specialty)?.label ?? specialty, clear: () => setSpecialty("") },
                province && { label: PROVINCES_LIST.find(p => p.value === province)?.label ?? province, clear: () => setProvince("") },
                jobType && { label: JOB_TYPES.find(t => t.value === jobType)?.label ?? jobType, clear: () => setJobType("") },
                practiceSetting && { label: (practiceSettings ?? []).find(s => s.value === practiceSetting)?.label ?? practiceSetting, clear: () => setPracticeSetting("") },
                (salaryMin || salaryMax) && { label: `$${salaryMin || "0"} – $${salaryMax || "∞"}`, clear: () => { setSalaryMin(""); setSalaryMax(""); } },
              ].filter(Boolean).map(tag => {
                const t = tag as { label: string; clear: () => void };
                return (
                  <button key={t.label} onClick={t.clear}
                    className="inline-flex items-center gap-1 rounded-full border border-[#1a6fd4]/25 bg-[#f0f4ff] px-2.5 py-0.5 text-xs font-medium text-[#1a6fd4] transition hover:bg-[#1a6fd4]/15">
                    {t.label} <X className="h-3 w-3" />
                  </button>
                );
              })}
            </div>

            {/* Cards container */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {isLoading && (
                <div>
                  {Array.from({ length: 8 }).map((_, i) => <JobCardSkeleton key={i} />)}
                </div>
              )}

              {!isLoading && jobs.length === 0 && (
                <div className="py-20 text-center">
                  <Search className="mx-auto h-12 w-12 text-slate-200" />
                  <p className="mt-4 text-base font-bold text-[#0f1f3d]">No jobs match your filters</p>
                  <p className="mt-1 text-sm text-slate-400">Try broadening your search or clearing some filters.</p>
                  <button onClick={clearAll}
                    className="mt-5 rounded-xl bg-[#1a6fd4] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
                    Clear filters
                  </button>
                </div>
              )}

              {!isLoading && jobs.length > 0 && (
                view === "list" ? (
                  <div>
                    {jobs.map(j => <JobCard key={j.id} job={j} />)}
                  </div>
                ) : (
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    {jobs.map(j => <GridJobCard key={j.id} job={j} />)}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE FILTER DRAWER ── */}
      {mobileFilterOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileFilterOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-80 flex-col bg-white shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-[#0f1f3d]">Filters</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto"><FilterPanel /></div>
            <div className="border-t border-slate-100 p-4">
              <button onClick={() => setMobileFilterOpen(false)}
                className="w-full rounded-xl bg-[#1a6fd4] py-3 text-sm font-bold text-white transition hover:bg-[#1560be]">
                Show {jobs.length} results
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

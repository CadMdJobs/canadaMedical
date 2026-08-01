import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  MapPin, Briefcase, Building2, DollarSign, Clock, ArrowLeft,
  Share2, Bookmark, BookmarkCheck, Stethoscope, Lock,
  ChevronRight, AlertCircle, CheckCircle2, Upload, X,
  FileText, Phone, Linkedin, Calendar, Globe, Home,
  ChevronLeft, Send, Eye, Users, Star, Printer, Loader2,
  BadgeCheck, ArrowRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { api, apiError, extractData } from "@/lib/api";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8faff] px-4 text-center">
      <div className="rounded-2xl border border-slate-100 bg-white p-12 shadow-sm max-w-md w-full">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-200" />
        <h1 className="mt-4 text-2xl font-extrabold text-[#0f1f3d]">Job not found</h1>
        <p className="mt-2 text-sm text-slate-400">This position may have been filled or removed.</p>
        <Link to="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
          Browse all jobs <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  ),
});

interface JobDetail {
  id: number;
  title: string;
  specialty?: string;
  specialty_display?: string;
  sub_specialty?: string;
  province?: string;
  province_display?: string;
  city?: string;
  location_display?: string;
  description?: string;
  qualifications?: string;
  requirements?: string;
  responsibilities?: string;
  compensation?: string;
  benefits?: string;
  application_deadline?: string;
  contact_person?: string;
  contact_email?: string;
  job_type?: string;
  job_type_display?: string;
  practice_setting?: string;
  practice_setting_display?: string;
  required_experience?: string;
  required_experience_display?: string;
  salary_min?: number;
  salary_max?: number;
  salary_display?: string;
  compensation_model?: string;
  compensation_model_display?: string;
  employer_name?: string;
  employer_type?: string;
  employer_website?: string;
  remote_option?: boolean;
  relocation_assistance?: boolean;
  is_featured?: boolean;
  is_active?: boolean;
  views_count?: number;
  total_applications?: number;
  created_at?: string;
  updated_at?: string;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function formatSalary(min?: number, max?: number, display?: string): string | null {
  if (display) return display;
  const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n.toLocaleString()}`;
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}/yr`;
  if (min != null) return `From ${fmt(min)}/yr`;
  if (max != null) return `Up to ${fmt(max)}/yr`;
  return null;
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="space-y-2.5">
      {text.split("\n").filter(Boolean).map((line, i) => {
        const clean = line.replace(/^[-•*]\s*/, "").trim();
        if (!clean) return null;
        const isBullet = /^[-•*]/.test(line.trim());
        return isBullet ? (
          <div key={i} className="flex items-start gap-3 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1a6fd4]" />
            <span>{clean}</span>
          </div>
        ) : (
          <p key={i} className="text-sm text-slate-600 leading-relaxed">{clean}</p>
        );
      })}
    </div>
  );
}

function QuickFactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-semibold text-[#0f1f3d]">{value}</dd>
    </div>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-64 bg-[#0f1f3d]/80" />
      <div className="bg-[#f8faff]">
        <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 rounded-full bg-slate-200" style={{ width: `${60 + (i % 3) * 15}%` }} />
              ))}
            </div>
            <div className="space-y-4">
              <div className="h-52 rounded-2xl bg-slate-200" />
              <div className="h-36 rounded-2xl bg-slate-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Apply Modal ─────────────────────────────────────────────────────────────

type ApplyStep = "profile_check" | "resume" | "details" | "cover_letter" | "review";

interface ApplyFormState {
  resume: File | null;
  useProfileResume: boolean;
  phone: string;
  years_experience: string;
  linkedin_url: string;
  availability_date: string;
  willing_to_relocate: boolean;
  cover_letter: string;
}

const STEP_ORDER: ApplyStep[] = ["profile_check", "resume", "details", "cover_letter", "review"];
const STEP_LABELS: Record<ApplyStep, string> = {
  profile_check: "Profile",
  resume: "Resume",
  details: "Details",
  cover_letter: "Cover Letter",
  review: "Review",
};

function ApplyModal({ job, onClose, onSuccess }: { job: JobDetail; onClose: () => void; onSuccess: () => void }) {
  const { isAuthenticated, userType } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ApplyStep>("profile_check");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ApplyFormState>({
    resume: null,
    useProfileResume: true,
    phone: "",
    years_experience: "",
    linkedin_url: "",
    availability_date: "",
    willing_to_relocate: false,
    cover_letter: "",
  });

  const { data: profile } = useQuery({
    queryKey: ["physician-profile"],
    queryFn: async () => {
      const r = await api.get("/api/profile/physician/");
      return r.data?.data ?? r.data;
    },
    enabled: isAuthenticated && userType === "physician",
  });

  const hasProfileResume = !!profile?.resume;
  const currentStepIndex = STEP_ORDER.indexOf(step);

  function update<K extends keyof ApplyFormState>(k: K, v: ApplyFormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext ?? '')) {
      toast.error('Only PDF, DOC, or DOCX files are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5 MB.');
      return;
    }
    update('resume', file);
    update('useProfileResume', false);
  }

  function canProceed(): boolean {
    if (step === "resume") {
      return form.useProfileResume ? hasProfileResume : !!form.resume;
    }
    return true;
  }

  function next() {
    if (!canProceed()) {
      toast.error("Please upload a resume to continue.");
      return;
    }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }

  function back() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (!form.useProfileResume && form.resume) fd.append("resume", form.resume);
      if (form.cover_letter) fd.append("cover_letter", form.cover_letter);
      if (form.phone) fd.append("phone", form.phone);
      if (form.years_experience) fd.append("years_experience", form.years_experience);
      if (form.linkedin_url) fd.append("linkedin_url", form.linkedin_url);
      if (form.availability_date) fd.append("availability_date", form.availability_date);
      fd.append("willing_to_relocate", String(form.willing_to_relocate));

      await api.post(`/api/jobs/${job.id}/apply/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["saved-jobs-ids"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      onSuccess();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <ModalShell onClose={onClose} title="Apply for this position">
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f0f4ff]">
            <Lock className="h-8 w-8 text-[#1a6fd4]" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-[#0f1f3d]">Sign in to apply</h3>
            <p className="mt-1.5 text-sm text-slate-400 max-w-xs">
              Create a free physician account or sign in to apply for <strong className="text-[#0f1f3d]">{job.title}</strong>.
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => { onClose(); navigate({ to: "/login", search: { redirect: `/jobs/${job.id}` } as never }); }}
              className="rounded-xl bg-[#1a6fd4] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
              Sign In
            </button>
            <Link to="/register/physician" onClick={onClose}
              className="rounded-xl border border-[#1a6fd4]/30 px-6 py-2.5 text-sm font-bold text-[#1a6fd4] transition hover:bg-[#f0f4ff]">
              Register Free
            </Link>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (userType !== "physician") {
    return (
      <ModalShell onClose={onClose} title="Apply for this position">
        <div className="py-10 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-slate-200" />
          <p className="mt-4 text-sm text-slate-500">Employer accounts cannot apply to jobs. Switch to a physician account.</p>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title={`Apply — ${job.title}`}>
      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-0">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex flex-1 items-center">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
              i < currentStepIndex ? "bg-emerald-500 text-white" :
              i === currentStepIndex ? "bg-[#1a6fd4] text-white ring-4 ring-[#1a6fd4]/20" :
              "bg-slate-100 text-slate-400"
            }`}>
              {i < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className={`h-0.5 flex-1 transition-all ${i < currentStepIndex ? "bg-emerald-500" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="mb-6 text-xs font-bold uppercase tracking-widest text-[#1a6fd4]">
        Step {currentStepIndex + 1} of {STEP_ORDER.length} — {STEP_LABELS[step]}
      </p>

      {/* Step content */}
      <div className="min-h-65">
        {step === "profile_check" && <ProfileCheckStep profile={profile} />}
        {step === "resume" && (
          <ResumeStep form={form} update={update} hasProfileResume={hasProfileResume}
            profile={profile} fileInputRef={fileInputRef} handleFileSelect={handleFileSelect} />
        )}
        {step === "details" && <DetailsStep form={form} update={update} />}
        {step === "cover_letter" && <CoverLetterStep form={form} update={update} jobTitle={job.title} />}
        {step === "review" && <ReviewStep form={form} job={job} profile={profile} />}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
        <button onClick={back} disabled={currentStepIndex === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {step !== "review" ? (
          <button onClick={next}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a6fd4] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60">
            {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Send className="h-4 w-4" />}
            {submitting ? "Submitting…" : "Submit Application"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-[#0f1f3d] line-clamp-1">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ProfileCheckStep({ profile }: { profile: Record<string, string> | undefined }) {
  const fields = [
    { label: "Name", value: profile?.full_name, ok: !!profile?.full_name },
    { label: "Specialty", value: profile?.specialty_display || profile?.specialty, ok: !!profile?.specialty },
    { label: "CPSO / Licence #", value: profile?.cpso_number, ok: !!profile?.cpso_number },
    { label: "Resume on file", value: profile?.resume ? "Uploaded" : "None", ok: !!profile?.resume },
  ];
  const complete = fields.filter(f => f.ok).length;
  const pct = Math.round((complete / fields.length) * 100);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Your profile information will be shared with the employer. A complete profile increases your chance of being shortlisted.</p>
      <div className="rounded-xl border border-slate-100 bg-[#f8faff] p-4">
        <div className="mb-3 flex items-center justify-between text-xs font-bold">
          <span className="text-slate-400 uppercase tracking-wider">Profile completeness</span>
          <span className={pct === 100 ? "text-emerald-600" : "text-amber-500"}>{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-[#1a6fd4] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="space-y-2">
        {fields.map(f => (
          <li key={f.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3">
            <span className="text-sm text-slate-500">{f.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#0f1f3d]">{f.value || "—"}</span>
              {f.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <AlertCircle className="h-4 w-4 text-amber-400" />}
            </div>
          </li>
        ))}
      </ul>
      {pct < 100 && (
        <p className="text-xs text-slate-400">
          <Link to="/dashboard/physician" className="font-semibold text-[#1a6fd4] hover:underline">Complete your profile →</Link>
          {" "}before applying for best results.
        </p>
      )}
    </div>
  );
}

function ResumeStep({ form, update, hasProfileResume, profile, fileInputRef, handleFileSelect }: {
  form: ApplyFormState;
  update: <K extends keyof ApplyFormState>(k: K, v: ApplyFormState[K]) => void;
  hasProfileResume: boolean;
  profile: Record<string, string> | undefined;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Choose which resume to submit with your application.</p>

      {hasProfileResume && (
        <button type="button" onClick={() => { update("useProfileResume", true); update("resume", null); }}
          className={`w-full rounded-xl border-2 p-4 text-left transition ${
            form.useProfileResume ? "border-[#1a6fd4] bg-[#f0f4ff]" : "border-slate-200 hover:border-[#1a6fd4]/40"
          }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${form.useProfileResume ? "bg-[#1a6fd4]/15" : "bg-slate-100"}`}>
              <FileText className={`h-5 w-5 ${form.useProfileResume ? "text-[#1a6fd4]" : "text-slate-400"}`} />
            </div>
            <div>
              <p className="font-semibold text-[#0f1f3d] text-sm">Use resume from my profile</p>
              <p className="text-xs text-slate-400 mt-0.5">Previously uploaded document</p>
            </div>
            {form.useProfileResume && <CheckCircle2 className="ml-auto h-5 w-5 text-[#1a6fd4]" />}
          </div>
        </button>
      )}

      <button type="button" onClick={() => { update("useProfileResume", false); fileInputRef.current?.click(); }}
        className={`w-full rounded-xl border-2 p-4 text-left transition ${
          !form.useProfileResume ? "border-[#1a6fd4] bg-[#f0f4ff]" : "border-slate-200 hover:border-[#1a6fd4]/40"
        }`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${!form.useProfileResume && form.resume ? "bg-[#1a6fd4]/15" : "bg-slate-100"}`}>
            <Upload className={`h-5 w-5 ${!form.useProfileResume && form.resume ? "text-[#1a6fd4]" : "text-slate-400"}`} />
          </div>
          <div>
            <p className="font-semibold text-[#0f1f3d] text-sm">
              {form.resume ? form.resume.name : "Upload a new resume"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, DOC, DOCX · max 5 MB</p>
          </div>
          {!form.useProfileResume && form.resume && <CheckCircle2 className="ml-auto h-5 w-5 text-[#1a6fd4]" />}
        </div>
      </button>

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileSelect} />

      {!hasProfileResume && !form.resume && (
        <p className="text-xs text-amber-500 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> A resume is required to apply.
        </p>
      )}
    </div>
  );
}

function DetailsStep({ form, update }: {
  form: ApplyFormState;
  update: <K extends keyof ApplyFormState>(k: K, v: ApplyFormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Optional details to strengthen your application.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input type="tel" value={form.phone} onChange={e => update("phone", e.target.value)}
              placeholder="+1 (416) 555-0100"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0f1f3d] placeholder-slate-300 outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Years of Experience</label>
          <select value={form.years_experience} onChange={e => update("years_experience", e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1f3d] outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10">
            <option value="">Select…</option>
            {["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20+"].map(y => (
              <option key={y} value={y}>{y} {y === "20+" ? "" : y === "1" ? "year" : "years"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">LinkedIn Profile</label>
          <div className="relative">
            <Linkedin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input type="url" value={form.linkedin_url} onChange={e => update("linkedin_url", e.target.value)}
              placeholder="linkedin.com/in/yourprofile"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0f1f3d] placeholder-slate-300 outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">Earliest Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input type="date" value={form.availability_date} onChange={e => update("availability_date", e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0f1f3d] outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10" />
          </div>
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-[#f8faff] transition">
        <input type="checkbox" checked={form.willing_to_relocate}
          onChange={e => update("willing_to_relocate", e.target.checked)}
          className="h-4 w-4 rounded accent-[#1a6fd4]" />
        <div>
          <p className="text-sm font-semibold text-[#0f1f3d] flex items-center gap-1.5">
            <Home className="h-4 w-4 text-[#1a6fd4]" /> Willing to relocate
          </p>
          <p className="text-xs text-slate-400">I am open to relocating for this position</p>
        </div>
      </label>
    </div>
  );
}

function CoverLetterStep({ form, update, jobTitle }: {
  form: ApplyFormState;
  update: <K extends keyof ApplyFormState>(k: K, v: ApplyFormState[K]) => void;
  jobTitle: string;
}) {
  const remaining = 2000 - form.cover_letter.length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Write a tailored cover letter for <strong className="text-[#0f1f3d]">{jobTitle}</strong>. A strong letter explains why you're the right fit for this specific role.
      </p>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Cover Letter <span className="normal-case font-normal">(optional)</span></label>
          <span className={`text-xs ${remaining < 100 ? "text-amber-500" : "text-slate-400"}`}>{remaining} chars remaining</span>
        </div>
        <textarea value={form.cover_letter} onChange={e => update("cover_letter", e.target.value)}
          maxLength={2000} rows={10}
          placeholder={`Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${jobTitle} position...`}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0f1f3d] placeholder-slate-300 outline-none transition focus:border-[#1a6fd4] focus:ring-2 focus:ring-[#1a6fd4]/10 resize-none" />
      </div>
    </div>
  );
}

function ReviewStep({ form, job, profile }: { form: ApplyFormState; job: JobDetail; profile: Record<string, string> | undefined }) {
  const resumeName = form.useProfileResume ? "Profile resume" : form.resume?.name ?? "None";
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Review your application before submitting. Once submitted you cannot edit it.</p>

      <div className="rounded-xl border border-[#1a6fd4]/15 bg-[#f0f4ff] p-4 space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Applying for</h4>
        <p className="font-bold text-[#0f1f3d]">{job.title}</p>
        <p className="text-sm text-slate-500">{job.employer_name} · {job.location_display}</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Submission details</h4>
        {[
          { icon: FileText, label: "Resume", value: resumeName },
          form.phone && { icon: Phone, label: "Phone", value: form.phone },
          form.years_experience && { icon: Briefcase, label: "Experience", value: `${form.years_experience} year${form.years_experience === "1" ? "" : "s"}` },
          form.linkedin_url && { icon: Linkedin, label: "LinkedIn", value: form.linkedin_url },
          form.availability_date && { icon: Calendar, label: "Available from", value: new Date(form.availability_date).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) },
          { icon: Home, label: "Willing to relocate", value: form.willing_to_relocate ? "Yes" : "No" },
        ].filter(Boolean).map((item: unknown) => {
          const it = item as { icon: React.ComponentType<{ className?: string }>; label: string; value: string };
          return (
            <div key={it.label} className="flex items-center gap-3 text-sm">
              <it.icon className="h-4 w-4 shrink-0 text-[#1a6fd4]" />
              <span className="text-slate-400 w-32">{it.label}</span>
              <span className="font-semibold text-[#0f1f3d] truncate">{it.value}</span>
            </div>
          );
        })}
      </div>

      {form.cover_letter && (
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Cover Letter preview</h4>
          <p className="text-sm text-slate-500 line-clamp-4 whitespace-pre-wrap">{form.cover_letter}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const { isAuthenticated, userType } = useAuthStore();
  const qc = useQueryClient();
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applied, setApplied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  async function handleDownloadPDF() {
    if (!isAuthenticated) {
      toast.error("Please login to download job details.");
      return;
    }
    setDownloading(true);
    try {
      const response = await api.get(`/api/jobs/${jobId}/pdf/`, { responseType: "blob" });
      const blob = new Blob([response.data as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers["content-disposition"] as string | undefined;
      const filename = disposition
        ? disposition.split("filename=")[1]?.replace(/"/g, "") ?? `CanadianMdJobs_Job_${jobId}.pdf`
        : `CanadianMdJobs_Job_${jobId}.pdf`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 2500);
    } catch {
      toast.error("Failed to download PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const { data: job, isLoading, isError } = useQuery<JobDetail>({
    queryKey: ["job-detail", jobId],
    queryFn: async () => {
      const r = await api.get(`/api/jobs/${jobId}/`);
      return extractData<JobDetail>(r);
    },
    retry: 1,
  });

  const { data: savedJobs } = useQuery<{ id: number; job: number }[]>({
    queryKey: ["saved-jobs-ids"],
    queryFn: async () => {
      const r = await api.get("/api/jobs/saved/");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    enabled: isAuthenticated && userType === "physician",
    staleTime: 60_000,
  });

  const savedEntry = savedJobs?.find(s => String(s.job) === String(jobId));
  const isSaved = !!savedEntry;

  const saveMutation = useMutation({
    mutationFn: () => api.post(`/api/jobs/${jobId}/save/`),
    onSuccess: () => { toast.success("Job saved"); qc.invalidateQueries({ queryKey: ["saved-jobs-ids"] }); },
    onError: e => toast.error(apiError(e)),
  });

  const unsaveMutation = useMutation({
    mutationFn: () => api.delete(`/api/jobs/${jobId}/unsave/`),
    onSuccess: () => { toast.success("Job removed from saved"); qc.invalidateQueries({ queryKey: ["saved-jobs-ids"] }); },
    onError: e => toast.error(apiError(e)),
  });

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied")).catch(() => {});
  }

  if (isLoading) return <JobDetailSkeleton />;

  if (isError || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8faff] px-4 text-center">
        <div className="rounded-2xl border border-slate-100 bg-white p-12 shadow-sm max-w-md w-full">
          <AlertCircle className="mx-auto h-12 w-12 text-slate-200" />
          <h1 className="mt-4 text-2xl font-extrabold text-[#0f1f3d]">Job not found</h1>
          <p className="mt-2 text-sm text-slate-400">This position may have been filled or removed.</p>
          <Link to="/jobs"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1560be]">
            Browse all jobs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const salaryLine = formatSalary(job.salary_min, job.salary_max, job.salary_display);
  const initials = (job.employer_name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("");

  return (
    <>
      {showApplyModal && !applied && (
        <ApplyModal
          job={job}
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setApplied(true);
            setShowApplyModal(false);
            toast.success("Application submitted! We'll notify you of any updates.");
          }}
        />
      )}

      {/* ── HERO ── */}
      <section className="bg-[#0f1f3d]">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-10 sm:px-6 lg:px-14">

          {/* Breadcrumb */}
          <Link to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 transition hover:text-white uppercase tracking-wider">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all jobs
          </Link>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

            {/* Left: title + meta */}
            <div className="flex-1">
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {job.is_featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                    <Star className="h-3 w-3 fill-current" /> Featured
                  </span>
                )}
                {(job.specialty_display || job.specialty) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1a6fd4]/20 border border-[#1a6fd4]/30 px-3 py-1 text-xs font-bold text-white">
                    <Stethoscope className="h-3.5 w-3.5 text-[#1a6fd4]" />
                    {job.specialty_display || job.specialty}
                  </span>
                )}
                {(job.job_type_display || job.job_type) && (
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold text-white/80">
                    {job.job_type_display || job.job_type}
                  </span>
                )}
                {job.remote_option && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold text-white/80">
                    <Globe className="h-3 w-3" /> Remote
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{job.title}</h1>

              {/* Employer row */}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
                {job.employer_name && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-[#1a6fd4]" />
                    <span className="font-semibold text-white/90">{job.employer_name}</span>
                  </span>
                )}
                {job.location_display && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[#1a6fd4]" /> {job.location_display}
                  </span>
                )}
                {salaryLine && (
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <DollarSign className="h-4 w-4" /> {salaryLine}
                  </span>
                )}
                {job.created_at && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-white/30" /> Posted {timeAgo(job.created_at)}
                  </span>
                )}
                {job.total_applications != null && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-white/30" /> {job.total_applications} applicants
                  </span>
                )}
              </div>
            </div>

            {/* Header action buttons */}
            <div className="flex shrink-0 items-center gap-2 lg:self-end">
              <button onClick={handleDownloadPDF} disabled={downloading}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15 disabled:opacity-60">
                {downloading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                ) : downloadDone ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Downloaded!</>
                ) : (
                  <><Printer className="h-4 w-4" /> Download PDF</>
                )}
              </button>
              <button onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15">
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ── BODY ── */}
      <div className="bg-[#f8faff]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:gap-8 lg:px-14 lg:py-10">

          {/* ── LEFT: Main content ── */}
          <article className="space-y-8">

            {/* Employer card */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#0f1f3d] text-sm font-extrabold text-white shadow-sm">
                  {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#0f1f3d]">{job.employer_name}</p>
                  {job.employer_type && (
                    <p className="mt-0.5 text-xs capitalize text-slate-400">{job.employer_type.replace(/_/g, " ")}</p>
                  )}
                  {job.employer_website && (
                    <a href={job.employer_website} target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1a6fd4] hover:underline">
                      Visit website <ChevronRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {job.contact_person && (
                  <div className="hidden sm:flex items-center gap-2.5 border-l border-slate-100 pl-4 shrink-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f4ff] text-[10px] font-extrabold text-[#1a6fd4]">
                      {job.contact_person.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Person</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#0f1f3d]">{job.contact_person}</p>
                      {job.contact_email && (
                        <a href={`mailto:${job.contact_email}`}
                          className="text-xs text-slate-400 hover:text-[#1a6fd4] transition">
                          {job.contact_email}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {job.views_count != null && (
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 shrink-0">
                    <Eye className="h-3.5 w-3.5" /> {job.views_count} views
                  </div>
                )}
              </div>
            </div>

            {/* Content sections */}
            {job.description && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-[#1a6fd4]" />
                  Position Overview
                </h2>
                <div className="mt-4"><TextBlock text={job.description} /></div>
              </div>
            )}

            {job.responsibilities && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-[#1a6fd4]" />
                  Responsibilities
                </h2>
                <div className="mt-4"><TextBlock text={job.responsibilities} /></div>
              </div>
            )}

            {job.qualifications && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-[#1a6fd4]" />
                  Qualifications
                </h2>
                <div className="mt-4"><TextBlock text={job.qualifications} /></div>
              </div>
            )}

            {job.requirements && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-[#1a6fd4]" />
                  Requirements
                </h2>
                <div className="mt-4"><TextBlock text={job.requirements} /></div>
              </div>
            )}

            {job.benefits && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-emerald-400" />
                  What&apos;s Offered
                </h2>
                <div className="mt-4"><TextBlock text={job.benefits} /></div>
              </div>
            )}

            {job.compensation && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#0f1f3d]">
                  <span className="h-5 w-1 rounded-full bg-emerald-400" />
                  Compensation Details
                </h2>
                <p className="mt-4 text-sm text-slate-600 leading-relaxed">{job.compensation}</p>
              </div>
            )}

            {/* CTA banner */}
            {!applied && (
              <div className="rounded-2xl bg-[#0f1f3d] p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#1a6fd4]">Ready to apply?</p>
                  <h3 className="mt-1 font-extrabold text-white">Interested in this role?</h3>
                  <p className="mt-1 text-sm text-white/50">A recruiter reviews applications within 1 business day.</p>
                </div>
                <button onClick={() => setShowApplyModal(true)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-7 py-3 text-sm font-bold text-white transition hover:bg-[#1560be] shadow-lg">
                  Apply Now <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </article>

          {/* ── RIGHT: Sidebar ── */}
          <aside className="space-y-5 lg:sticky lg:self-start" style={{ top: 72 + 16 }}>

            {/* Quick facts */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Quick Facts</h3>
              <dl className="mt-3">
                {job.specialty_display && <QuickFactRow label="Specialty" value={job.specialty_display} />}
                {job.sub_specialty && <QuickFactRow label="Sub-specialty" value={job.sub_specialty} />}
                {(job.job_type_display || job.job_type) && <QuickFactRow label="Type" value={job.job_type_display || job.job_type || ""} />}
                {job.practice_setting_display && <QuickFactRow label="Setting" value={job.practice_setting_display} />}
                {job.required_experience_display && <QuickFactRow label="Experience" value={job.required_experience_display} />}
                {salaryLine && <QuickFactRow label="Compensation" value={salaryLine} />}
                {job.compensation_model_display && <QuickFactRow label="Pay model" value={job.compensation_model_display} />}
                {job.location_display && <QuickFactRow label="Location" value={job.location_display} />}
                {job.relocation_assistance && <QuickFactRow label="Relocation" value="Assistance available" />}
                {job.remote_option && <QuickFactRow label="Remote" value="Option available" />}
                {job.application_deadline && <QuickFactRow label="Deadline" value={new Date(job.application_deadline).toLocaleDateString("en-CA")} />}
              </dl>
            </div>



            {/* Save job */}
            {isAuthenticated && userType === "physician" && (
              <button
                onClick={() => isSaved ? unsaveMutation.mutate() : saveMutation.mutate()}
                disabled={saveMutation.isPending || unsaveMutation.isPending}
                className={`w-full flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-semibold transition disabled:opacity-60 ${
                  isSaved
                    ? "border-[#1a6fd4]/30 bg-[#f0f4ff] text-[#1a6fd4]"
                    : "border-slate-200 bg-white text-slate-500 hover:border-[#1a6fd4]/30 hover:bg-[#f0f4ff] hover:text-[#1a6fd4]"
                }`}>
                {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {isSaved ? "Saved" : "Save Job"}
              </button>
            )}

            {/* Apply CTA — bottom */}
            {applied ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold text-white">
                <CheckCircle2 className="h-5 w-5" /> Application Submitted
              </div>
            ) : (
              <button onClick={() => setShowApplyModal(true)}
                className="w-full rounded-2xl bg-[#1a6fd4] py-4 text-sm font-bold text-white transition hover:bg-[#1560be] shadow-md">
                Apply for this Position
              </button>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  Check, ChevronLeft, ChevronRight, User, Stethoscope,
  MapPin, Target, FileUp, X, Upload, Loader2,
  Phone, Mail, Calendar, Star, Briefcase, Globe,
  CheckCircle2, Clock, ArrowRight,
} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SPECIALTIES, PROVINCES } from "@/data/jobs";

export const Route = createFileRoute("/assessment")({
  head: () => ({
    meta: [
      { title: "Free Career Assessment — CandianMdJobs" },
      { name: "description", content: "Get a personalized career roadmap from our recruiters. Free 5-minute assessment." },
    ],
  }),
  component: AssessmentPage,
});

// ── Schema ─────────────────────────────────────────────────────────────────────

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(7, "Phone number too short").max(20),
  current_location: z.string().trim().min(2, "Enter your current location").max(255),

  specialty: z.string().min(1, "Select your specialty"),
  sub_specialty: z.string().trim().max(100).optional(),
  years_of_experience: z.coerce.number({ invalid_type_error: "Enter years" }).min(0).max(60),
  licensure_status: z.string().min(1, "Select licensure status"),
  work_eligibility: z.string().min(1, "Select work eligibility"),

  desired_province_in_canada: z.string().min(1, "Select a preferred province"),
  preferred_job_type: z.string().optional(),
  preferred_practice_setting: z.string().optional(),
  relocation_support_needed: z.boolean(),

  career_goals: z.string().trim().min(10, "Tell us about your goals (min 10 characters)").max(2000),
  salary_expectation: z.string().trim().max(100).optional(),
  availability_date: z.string().optional(),
  additional_notes: z.string().trim().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: "personal",     label: "Personal",    icon: User },
  { id: "professional", label: "Professional", icon: Stethoscope },
  { id: "preferences",  label: "Preferences",  icon: MapPin },
  { id: "goals",        label: "Goals",        icon: Target },
  { id: "resume",       label: "Resume",       icon: FileUp },
] as const;

const STEP_FIELDS: Record<number, string[]> = {
  0: ["full_name", "email", "phone", "current_location"],
  1: ["specialty", "sub_specialty", "years_of_experience", "licensure_status", "work_eligibility"],
  2: ["desired_province_in_canada", "preferred_job_type", "preferred_practice_setting", "relocation_support_needed"],
  3: ["career_goals", "salary_expectation", "availability_date", "additional_notes"],
  4: [],
};

const LICENSURE_OPTIONS = [
  { value: "licensed_canada", label: "Licensed in Canada" },
  { value: "licensed_other",  label: "Licensed in Another Country" },
  { value: "in_process",      label: "In Process of Licensing" },
  { value: "not_yet",         label: "Not Yet Licensed" },
];

const ELIGIBILITY_OPTIONS = [
  { value: "citizen",          label: "Canadian Citizen" },
  { value: "pr",               label: "Permanent Resident" },
  { value: "work_permit",      label: "Work Permit Holder" },
  { value: "need_sponsorship", label: "Need Sponsorship" },
];

const JOB_TYPE_OPTIONS = [
  { value: "full_time",  label: "Full Time" },
  { value: "part_time",  label: "Part Time" },
  { value: "locum",      label: "Locum / Temp" },
  { value: "contract",   label: "Contract" },
  { value: "fellowship", label: "Fellowship" },
];

const PRACTICE_SETTING_OPTIONS = [
  { value: "hospital",   label: "Hospital" },
  { value: "clinic",     label: "Community Clinic" },
  { value: "academic",   label: "Academic / Teaching" },
  { value: "private",    label: "Private Practice" },
  { value: "telehealth", label: "Telehealth / Virtual" },
  { value: "rural",      label: "Rural / Remote" },
];

// ── Shared form primitives ──────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
      {children}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs font-medium text-rose-600">{msg}</p> : null;
}

function inputCls(error?: boolean) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:ring-2 ${
    error
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
      : "border-slate-200 focus:border-[#1a6fd4] focus:ring-[#1a6fd4]/15"
  }`;
}

function selectCls(error?: boolean) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:ring-2 ${
    error
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
      : "border-slate-200 focus:border-[#1a6fd4] focus:ring-[#1a6fd4]/15"
  }`;
}

function StepHeader({ icon: Icon, title, subtitle }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0f1f3d]">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-[#0f1f3d]">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

function AssessmentPage() {
  const [step, setStep]           = useState(0);
  const [done, setDone]           = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      relocation_support_needed: false,
      years_of_experience: undefined,
    },
  });

  async function next() {
    const fields = STEP_FIELDS[step];
    const valid = fields.length === 0 ? true : await trigger(fields as never);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(values).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
      });
      if (resumeFile) fd.append("resume", resumeFile);
      await api.post("/api/assessments/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-[#f8faff]">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:py-28">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 shadow-lg">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#0f1f3d]">Assessment Submitted!</h1>
          <p className="mt-4 text-base text-slate-500">
            A dedicated recruiter will review your profile and reach out within{" "}
            <strong className="text-slate-700">24–48 business hours</strong>.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Clock,   label: "Profile Review",      desc: "A recruiter reviews your profile within 1 business day." },
              { icon: Phone,   label: "Consultation Call",   desc: "We'll schedule a 30-minute discovery call to learn more." },
              { icon: Star,    label: "Career Roadmap",      desc: "Receive a personalized Canadian career placement plan." },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a6fd4]/10">
                  <Icon className="h-5 w-5 text-[#1a6fd4]" />
                </div>
                <p className="font-semibold text-[#0f1f3d]">{label}</p>
                <p className="mt-1 text-sm text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
          <a
            href="/"
            className="mt-10 inline-flex items-center gap-2 rounded-xl bg-[#1a6fd4] px-8 py-3 text-sm font-bold text-white shadow-md hover:bg-[#1560be] transition"
          >
            Back to Homepage <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // ── Page ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8faff]">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="bg-[#0f1f3d] py-16 text-center">
        <span className="inline-block rounded-full bg-[#1a6fd4]/20 px-4 py-1 text-xs font-bold uppercase tracking-widest text-[#7eb3f5]">
          Free · No Obligation · 5 Minutes
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Career Assessment
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-300">
          Tell us about your background and goals. Our Canadian recruiters will build you a personalised placement roadmap.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-slate-400">
          {[
            { icon: Star,      label: "200+ placements" },
            { icon: Globe,     label: "All Canadian provinces" },
            { icon: Briefcase, label: "Physicians & specialists" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-[#1a6fd4]" /> {label}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-24">

        {/* ── Step progress ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-[#f8faff]/95 py-5 backdrop-blur-sm">
          <ol className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon      = s.icon;
              const completed = i < step;
              const active    = i === step;
              return (
                <li key={s.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      completed ? "bg-emerald-500 text-white shadow-sm"
                      : active   ? "bg-[#1a6fd4] text-white shadow-md ring-4 ring-[#1a6fd4]/20"
                      :            "bg-white border border-slate-200 text-slate-400"
                    }`}>
                      {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className={`hidden text-[10px] font-semibold uppercase tracking-wide sm:block ${
                      active ? "text-[#1a6fd4]" : "text-slate-400"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 rounded-full transition-colors ${
                      completed ? "bg-emerald-400" : "bg-slate-200"
                    }`} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Form card ──────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

            {/* Step 1: Personal */}
            {step === 0 && (
              <div className="space-y-5">
                <StepHeader icon={User} title="Personal Information" subtitle="Let's start with your basic contact details." />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label required>Full Name</Label>
                    <input {...register("full_name")} maxLength={100} placeholder="Dr. Jane Smith" className={inputCls(!!errors.full_name)} />
                    <FieldError msg={errors.full_name?.message} />
                  </div>
                  <div>
                    <Label required>Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input {...register("email")} type="email" maxLength={255} placeholder="jane@example.com" className={`${inputCls(!!errors.email)} pl-9`} />
                    </div>
                    <FieldError msg={errors.email?.message} />
                  </div>
                  <div>
                    <Label required>Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input {...register("phone")} type="tel" maxLength={20} placeholder="+1 (416) 555-0100" className={`${inputCls(!!errors.phone)} pl-9`} />
                    </div>
                    <FieldError msg={errors.phone?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Current Location</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input {...register("current_location")} maxLength={255} placeholder="City, Country (e.g. Mumbai, India)" className={`${inputCls(!!errors.current_location)} pl-9`} />
                    </div>
                    <FieldError msg={errors.current_location?.message} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Professional */}
            {step === 1 && (
              <div className="space-y-5">
                <StepHeader icon={Stethoscope} title="Professional Background" subtitle="Help us understand your medical training and credentials." />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label required>Specialty</Label>
                    <select {...register("specialty")} className={selectCls(!!errors.specialty)}>
                      <option value="">Select specialty…</option>
                      {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <FieldError msg={errors.specialty?.message} />
                  </div>
                  <div>
                    <Label>Sub-specialty <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                    <input {...register("sub_specialty")} maxLength={100} placeholder="e.g. Interventional Cardiology" className={inputCls()} />
                  </div>
                  <div>
                    <Label required>Years of Experience</Label>
                    <input {...register("years_of_experience")} type="number" min={0} max={60} placeholder="0" className={inputCls(!!errors.years_of_experience)} />
                    <FieldError msg={errors.years_of_experience?.message} />
                  </div>
                  <div>
                    <Label required>Licensure Status</Label>
                    <select {...register("licensure_status")} className={selectCls(!!errors.licensure_status)}>
                      <option value="">Select status…</option>
                      {LICENSURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <FieldError msg={errors.licensure_status?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Canadian Work Eligibility</Label>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {ELIGIBILITY_OPTIONS.map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-[#f8faff] p-3 text-sm transition hover:border-[#1a6fd4]/40 has-checked:border-[#1a6fd4] has-checked:bg-[#f0f4ff]">
                          <input type="radio" value={o.value} {...register("work_eligibility")} className="mt-0.5 accent-[#1a6fd4]" />
                          <span className="font-medium leading-tight text-slate-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                    <FieldError msg={errors.work_eligibility?.message} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Preferences */}
            {step === 2 && (
              <div className="space-y-5">
                <StepHeader icon={MapPin} title="Location & Practice Preferences" subtitle="Tell us where and how you'd like to practice in Canada." />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label required>Preferred Province</Label>
                    <select {...register("desired_province_in_canada")} className={selectCls(!!errors.desired_province_in_canada)}>
                      <option value="">Select province…</option>
                      <option value="any">Open to any province</option>
                      {PROVINCES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <FieldError msg={errors.desired_province_in_canada?.message} />
                  </div>
                  <div>
                    <Label>Preferred Job Type</Label>
                    <select {...register("preferred_job_type")} className={selectCls()}>
                      <option value="">No preference</option>
                      {JOB_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Preferred Practice Setting</Label>
                    <select {...register("preferred_practice_setting")} className={selectCls()}>
                      <option value="">No preference</option>
                      {PRACTICE_SETTING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Relocation Support Needed?</Label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {[
                        { value: true,  label: "Yes — I need relocation assistance", desc: "Housing, licensing guidance, etc." },
                        { value: false, label: "No — I can manage independently",    desc: "I have resources in place." },
                      ].map((o) => (
                        <Controller key={String(o.value)} name="relocation_support_needed" control={control}
                          render={({ field }) => (
                            <label className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-sm transition ${
                              field.value === o.value
                                ? "border-[#1a6fd4] bg-[#f0f4ff]"
                                : "border-slate-200 bg-[#f8faff] hover:border-[#1a6fd4]/40"
                            }`}>
                              <input type="radio" checked={field.value === o.value} onChange={() => field.onChange(o.value)} className="sr-only" />
                              <span className="font-semibold text-[#0f1f3d]">{o.label}</span>
                              <span className="text-xs text-slate-500">{o.desc}</span>
                            </label>
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Goals */}
            {step === 3 && (
              <div className="space-y-5">
                <StepHeader icon={Target} title="Career Goals & Availability" subtitle="Help us tailor the best opportunities for your aspirations." />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label required>Career Goals</Label>
                    <textarea {...register("career_goals")} maxLength={2000} rows={5}
                      placeholder="Describe your goals — compensation targets, lifestyle balance, research interests, leadership aspirations, preferred patient population, work schedule, etc."
                      className={`${inputCls(!!errors.career_goals)} resize-none`} />
                    <FieldError msg={errors.career_goals?.message} />
                    <p className="mt-1 text-xs text-slate-400">Min 10 characters · Max 2,000</p>
                  </div>
                  <div>
                    <Label>Salary Expectation <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                    <input {...register("salary_expectation")} maxLength={100} placeholder="e.g. $350K–$450K annually" className={inputCls()} />
                  </div>
                  <div>
                    <Label>Earliest Availability <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input {...register("availability_date")} type="date" className={`${inputCls()} pl-9`} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Additional Notes <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                    <textarea {...register("additional_notes")} maxLength={1000} rows={3}
                      placeholder="Any other information that would help us find the right match…"
                      className={`${inputCls()} resize-none`} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Resume */}
            {step === 4 && (
              <div className="space-y-6">
                <StepHeader icon={FileUp} title="Upload Your CV / Resume" subtitle="Optional but highly recommended — helps us match you faster." />

                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) setResumeFile(file);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-[#f8faff] p-12 text-center transition hover:border-[#1a6fd4]/50 hover:bg-[#f0f4ff]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f1f3d]/5">
                    <Upload className="h-7 w-7 text-[#1a6fd4]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#0f1f3d]">Drop your CV here, or click to browse</p>
                    <p className="mt-1 text-xs text-slate-400">PDF, DOC, DOCX — max 5 MB</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) setResumeFile(file); }} />
                </div>

                {resumeFile && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                        <FileUp className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">{resumeFile.name}</p>
                        <p className="text-xs text-emerald-600">{(resumeFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setResumeFile(null)}
                      className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-[#f8faff] p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Ready to submit</p>
                  <p className="text-sm text-slate-500">
                    By submitting, you agree that a CandianMdJobs recruiter may contact you via the email and phone provided. We never share your data with third parties.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Navigation ─────────────────────────────────────────────────────── */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm disabled:opacity-40 hover:bg-slate-50 transition"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            <span className="text-xs text-slate-400">Step {step + 1} of {STEPS.length}</span>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a6fd4] px-7 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#1560be] transition"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-60 transition"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                  : <><Check className="h-4 w-4" /> Submit Assessment</>}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

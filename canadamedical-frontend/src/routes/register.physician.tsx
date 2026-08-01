import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ArrowLeft, Eye, EyeOff, Upload, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import { AuthLayout } from "@/components/site/AuthLayout";
import { FloatingInput, FloatingSelect, StepIndicator } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";
import { SPECIALTIES } from "@/data/jobs";

export const Route = createFileRoute("/register/physician")({
  head: () => ({
    meta: [
      { title: "Physician Registration — CanadianMdJobs" },
      { name: "description", content: "Create your physician profile and get matched with premier opportunities across Canada." },
    ],
  }),
  component: PhysicianRegister,
});

const COUNTRIES = ["Canada","United States","United Kingdom","Australia","Ireland","South Africa","Other"];

const STEPS = [
  { label: "Personal", description: "Who you are" },
  { label: "Credentials", description: "Specialty & licence" },
  { label: "Account", description: "Password & CV" },
];

type FormState = {
  first_name: string; last_name: string; email: string; phone: string; country: string; address: string;
  specialty: string; cpso_number: string; board_certifications: string;
  password: string; confirm_password: string; resume: File | null;
};

const initial: FormState = {
  first_name: "", last_name: "", email: "", phone: "", country: "Canada", address: "",
  specialty: "", cpso_number: "", board_certifications: "",
  password: "", confirm_password: "", resume: null,
};

function PhysicianRegister() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormState>(initial);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setData((d) => ({ ...d, [k]: v }));

  function validateStep(): string | null {
    if (step === 0) {
      if (!data.first_name || !data.last_name || !data.email || !data.phone) return "Please complete all personal fields.";
    } else if (step === 1) {
      if (!data.specialty || !data.cpso_number) return "Specialty and licence number are required.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (data.password !== data.confirm_password) return toast.error("Passwords don't match");
    if (data.password.length < 8) return toast.error("Password must be at least 8 characters");

    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (v instanceof File) fd.append(k, v);
      else fd.append(k, String(v));
    });
    fd.append("confirm_email", data.email);
    fd.append("terms_accepted", "true");

    setLoading(true);
    try {
      await api.post("/api/auth/register/physician/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Welcome aboard! Please sign in to continue.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="For Physicians"
      title="Your next chapter starts in Canada."
      subtitle="Join 4,200+ verified physicians using CanadianMdJobs to discover roles in hospitals, clinics, and health authorities — from Vancouver Island to St. John's."
      bullets={[
        "Free for physicians, forever",
        "Direct access to 380+ vetted employers",
        "Confidential — your profile is never sold",
      ]}
      footerNote={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
        </>
      }
    >
      <div className="space-y-7">
        <Link
          to="/register"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-primary"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Change account type
        </Link>

        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Physician sign up</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Create your profile
          </h2>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length} — takes about 2 minutes.</p>
        </header>

        <StepIndicator steps={STEPS} current={step} />

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatingInput label="First name" required value={data.first_name} onChange={(e) => update("first_name", e.target.value)} maxLength={50} autoComplete="given-name" />
              <FloatingInput label="Last name" required value={data.last_name} onChange={(e) => update("last_name", e.target.value)} maxLength={50} autoComplete="family-name" />
              <FloatingInput label="Email address" required type="email" value={data.email} onChange={(e) => update("email", e.target.value)} maxLength={200} autoComplete="email" />
              <FloatingInput label="Mobile" required type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)} maxLength={20} autoComplete="tel" />
              <FloatingSelect label="Country of residence" required value={data.country} onChange={(e) => update("country", e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </FloatingSelect>
              <FloatingInput label="City / Province" value={data.address} onChange={(e) => update("address", e.target.value)} maxLength={250} placeholder="Toronto, ON" />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatingSelect label="Primary specialty" required value={data.specialty} onChange={(e) => update("specialty", e.target.value)}>
                <option value="" disabled>Select a specialty</option>
                {SPECIALTIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </FloatingSelect>
              <FloatingInput label="CPSO / Licence number" required value={data.cpso_number} onChange={(e) => update("cpso_number", e.target.value)} maxLength={50} hint="Your provincial licensing body number." />
              <div className="sm:col-span-2">
                <FloatingInput label="Board certifications" value={data.board_certifications} onChange={(e) => update("board_certifications", e.target.value)} maxLength={200} hint="e.g. FRCPC, CCFP, ABIM" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FloatingInput
                  label="Password"
                  required
                  type={showPw ? "text" : "password"}
                  value={data.password}
                  onChange={(e) => update("password", e.target.value)}
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  hint="Min. 8 characters"
                  rightSlot={
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="text-muted-foreground hover:text-primary" aria-label={showPw ? "Hide" : "Show"}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
                <FloatingInput
                  label="Confirm password"
                  required
                  type={showPw ? "text" : "password"}
                  value={data.confirm_password}
                  onChange={(e) => update("confirm_password", e.target.value)}
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  error={data.confirm_password && data.password !== data.confirm_password ? "Passwords don't match" : undefined}
                />
              </div>

              <label className="group flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border bg-secondary/40 p-5 transition hover:border-accent hover:bg-accent-soft/30">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-accent-foreground">
                  <Upload className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{data.resume ? data.resume.name : "Upload your CV / Resume"}</div>
                  <div className="text-xs text-muted-foreground">PDF, DOC or DOCX — up to 10 MB. Optional but recommended.</div>
                </div>
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => update("resume", e.target.files?.[0] ?? null)} />
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-foreground">
                <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-border accent-[var(--accent)]" />
                <span>I confirm I am eligible to work in Canada (Citizen, PR, or eligible work permit). CanadianMdJobs can guide international physicians through licensing where required.</span>
              </label>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              <span />
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow"
              >
                Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                {loading ? "Creating profile…" : "Create my profile"}
                {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            )}
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

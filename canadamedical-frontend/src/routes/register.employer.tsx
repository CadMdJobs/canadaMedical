import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ArrowLeft, Eye, EyeOff, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import { AuthLayout } from "@/components/site/AuthLayout";
import { FloatingInput, FloatingSelect, StepIndicator } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";

export const Route = createFileRoute("/register/employer")({
  head: () => ({
    meta: [
      { title: "Employer Registration — CanadianMdJobs" },
      { name: "description", content: "Register your hospital, clinic or recruitment firm and start hiring physicians today." },
    ],
  }),
  component: EmployerRegister,
});

const COMPANY_TYPES = [
  { value: "employer", label: "Direct Employer (Hospital/Clinic/Health Authority)" },
  { value: "recruiter", label: "Recruitment Agency / Locum Network" },
];
const COUNTRIES = ["Canada", "United States", "Other"];

const STEPS = [
  { label: "Organization", description: "Company details" },
  { label: "Contact", description: "Primary contact" },
  { label: "Account", description: "Set credentials" },
];

type FormState = {
  first_name: string; last_name: string;
  company_name: string; company_type: string; address: string;
  email: string; phone: string; country: string;
  password: string; confirm_password: string;
};

const initial: FormState = {
  first_name: "", last_name: "",
  company_name: "", company_type: "", address: "",
  email: "", phone: "", country: "Canada",
  password: "", confirm_password: "",
};

function EmployerRegister() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormState>(initial);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setData((d) => ({ ...d, [k]: v }));

  function validateStep(): string | null {
    if (step === 0) {
      if (!data.company_name || !data.company_type || !data.address) return "Please complete your organization details.";
    } else if (step === 1) {
      if (!data.first_name || !data.last_name || !data.email) return "First name, last name and email are required.";
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
    setLoading(true);
    try {
      await api.post("/api/auth/register/employer/", {
        ...data,
        confirm_email: data.email,
        terms_accepted: true,
      });
      toast.success("Account created! Please sign in to continue.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="For Employers"
      title="Hire Canada's most qualified physicians."
      subtitle="380+ hospitals, clinics, and health authorities use CanadianMdJobs to fill critical roles — from rural family practice to subspecialty surgery."
      bullets={[
        "Curated physician matches in 48 hours",
        "Transparent pricing — no surprise fees",
        "Dedicated account manager included",
      ]}
      footerNote={
        <>
          Already registered?{" "}
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
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Employer sign up</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Register your organization
          </h2>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length} — quick and secure.</p>
        </header>

        <StepIndicator steps={STEPS} current={step} />

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FloatingInput label="Company name" required value={data.company_name} onChange={(e) => update("company_name", e.target.value)} maxLength={150} />
              </div>
              <FloatingSelect label="Company type" required value={data.company_type} onChange={(e) => update("company_type", e.target.value)}>
                <option value="" disabled>Select…</option>
                {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </FloatingSelect>
              <FloatingSelect label="Country" required value={data.country} onChange={(e) => update("country", e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </FloatingSelect>
              <div className="sm:col-span-2">
                <FloatingInput label="Address" required value={data.address} onChange={(e) => update("address", e.target.value)} maxLength={250} placeholder="Street, City, Province, Postal Code" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatingInput label="First name" required value={data.first_name} onChange={(e) => update("first_name", e.target.value)} maxLength={50} autoComplete="given-name" />
              <FloatingInput label="Last name" required value={data.last_name} onChange={(e) => update("last_name", e.target.value)} maxLength={50} autoComplete="family-name" />
              <FloatingInput label="Phone" type="tel" value={data.phone} onChange={(e) => update("phone", e.target.value)} maxLength={20} autoComplete="tel" />
              <div className="sm:col-span-2">
                <FloatingInput label="Work email" required type="email" value={data.email} onChange={(e) => update("email", e.target.value)} maxLength={200} autoComplete="email" />
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

              <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-foreground">
                <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-border accent-[var(--accent)]" />
                <span>
                  I agree to CanadianMdJobs's <Link to="/privacy" className="font-semibold text-primary hover:underline">Privacy Policy</Link> and confirm I am authorized to recruit on behalf of this organization.
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              <span />
            )}

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow">
                Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button type="submit" disabled={loading} className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60">
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                {loading ? "Creating account…" : "Create employer account"}
                {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            )}
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

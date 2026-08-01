import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Stethoscope, Building2, ArrowRight } from "lucide-react";
import { AuthLayout } from "@/components/site/AuthLayout";

export const Route = createFileRoute("/register/")({
  head: () => ({
    meta: [
      { title: "Create Account — CanadianMdJobs" },
      { name: "description", content: "Join CanadianMdJobs as a physician or employer." },
    ],
  }),
  component: RegisterPicker,
});

function RegisterPicker() {
  const [selected, setSelected] = useState<"physician" | "employer" | null>(null);
  const navigate = useNavigate();

  function handleContinue() {
    if (!selected) return;
    navigate({ to: selected === "physician" ? "/register/physician" : "/register/employer" });
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Your career in Canadian medicine starts here."
      subtitle="Whether you're a physician seeking new opportunities or an employer looking for top talent, CanadianMdJobs connects you with the best in Canadian healthcare."
      bullets={[
        "Free for physicians, forever",
        "380+ verified employers across Canada",
        "Confidential — your data is never sold",
      ]}
      footerNote={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-8">
        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Create account
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Join CanadianMdJobs.
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose your account type to continue.
          </p>
        </header>

        {/* Type selector — same segmented style as login */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-secondary/60 p-1.5">
          {(
            [
              { id: "physician" as const, label: "Physician", icon: Stethoscope },
              { id: "employer" as const, label: "Employer",  icon: Building2 },
            ]
          ).map(({ id, label, icon: Icon }) => {
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                className={`group relative flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-card text-primary shadow-card"
                    : "text-muted-foreground hover:text-primary"
                }`}
                aria-pressed={active}
              >
                <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Description card — appears after selection */}
        <div
          className={`overflow-hidden rounded-2xl border border-border bg-secondary/40 transition-all duration-300 ${
            selected ? "max-h-40 opacity-100" : "max-h-0 opacity-0 border-transparent"
          }`}
        >
          {selected === "physician" && (
            <div className="flex items-start gap-4 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Stethoscope className="h-5 w-5 text-primary" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Physician account</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Browse and apply to physician roles, upload your CV, track applications, and get matched with employers across every province and territory.
                </p>
              </div>
            </div>
          )}
          {selected === "employer" && (
            <div className="flex items-start gap-4 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <Building2 className="h-5 w-5 text-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Employer account</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Post physician vacancies, review applications, and connect with verified physicians. Hospitals, clinics, health authorities, and recruitment firms welcome.
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected}
          className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-accent opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
          <span className="relative flex items-center gap-2">
            {selected
              ? `Continue as ${selected === "physician" ? "Physician" : "Employer"}`
              : "Select an account type"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:text-accent hover:underline">
            Sign in →
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

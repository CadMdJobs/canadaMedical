import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight, Stethoscope, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { AuthLayout } from "@/components/site/AuthLayout";
import { FloatingInput } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log In — CanadianMdJobs" }] }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const [tab, setTab] = useState<"physician" | "employer">("physician");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login/", { email, password, user_type: tab });
      const payload = res.data?.data ?? res.data;

      const user: AuthUser = {
        email: payload.email,
        full_name: payload.full_name,
        user_type: payload.user_type,
        is_admin: payload.is_admin,
      };
      login({ user, access: payload.access, refresh: payload.refresh });
      toast.success(`Welcome back!`);
      if (redirect) {
        navigate({ to: redirect as never }).catch(() => (window.location.href = redirect));
        return;
      }
      if (payload.is_admin) {
        navigate({ to: "/admin" as never }).catch(() => (window.location.href = "/admin"));
        return;
      }
      const dest = (payload.user_type ?? tab) === "employer" ? "/dashboard/employer" : "/dashboard/physician";
      navigate({ to: dest as never }).catch(() => (window.location.href = dest));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  const isPhysician = tab === "physician";

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="The pulse of Canadian medical careers."
      subtitle="Sign in to track applications, save curated opportunities, and chat directly with verified recruiters from coast to coast."
      bullets={[
        "Real-time application tracking",
        "Verified recruiter messages — no spam",
        "Salary insights for every province",
      ]}
      footerNote={
        <>
          Protected by reCAPTCHA. By continuing you accept our{" "}
          <Link to="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <div className="space-y-7">
        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Sign in</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Welcome back to CanadianMdJobs.
          </h2>
          <p className="text-sm text-muted-foreground">Choose your account type to continue.</p>
        </header>

        {/* Account type segmented control */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-secondary/60 p-1.5">
          {(
            [
              { id: "physician" as const, label: "Physician", icon: Stethoscope },
              { id: "employer" as const, label: "Employer", icon: Building2 },
            ]
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingInput
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FloatingInput
            label="Password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="rounded-md p-1 text-muted-foreground transition hover:text-primary"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-border accent-[var(--accent)]" />
              <span>Keep me signed in</span>
            </label>
            <Link to="/forgot-password" className="font-semibold text-primary hover:text-accent hover:underline">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-accent opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
            <span className="relative flex items-center gap-2">
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              )}
              {loading ? "Signing in…" : `Sign in as ${isPhysician ? "Physician" : "Employer"}`}
              {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
            </span>
          </button>

          <p className="pt-2 text-center text-sm text-muted-foreground">
            New to CanadianMdJobs?{" "}
            <Link
              to="/register"
              className="font-semibold text-primary hover:text-accent hover:underline"
            >
              Create an account →
            </Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}

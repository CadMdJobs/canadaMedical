import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { AuthLayout } from "@/components/site/AuthLayout";
import { FloatingInput } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set New Password — CanadianMdJobs" }] }),
  component: ResetPasswordPage,
  validateSearch: (s: Record<string, unknown>) => ({
    uid: (s.uid as string) ?? "",
    token: (s.token as string) ?? "",
  }),
});

function ResetPasswordPage() {
  const { uid, token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const invalid = !uid || !token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/password/reset/confirm/", {
        uid,
        token,
        new_password: password,
      });
      setDone(true);
      setTimeout(() => navigate({ to: "/login" }), 3000);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Almost done — just set a new password."
      subtitle="Choose a strong password you haven't used before. The link is single-use and expires in 1 hour."
      bullets={[
        "Minimum 8 characters",
        "Link expires after use",
        "Need help? hello@CanadianMdJobs.ca",
      ]}
      footerNote={
        <>
          Back to{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
        </>
      }
    >
      <div className="space-y-7">
        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">New password</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Set your password</h2>
        </header>

        {invalid ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm font-semibold text-destructive">Invalid or expired reset link.</p>
            <Link to="/forgot-password" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
              Request a new link →
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
              <CheckCircle className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-primary">Password updated!</h3>
            <p className="text-sm text-foreground/80">Redirecting you to sign in…</p>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              Sign in now →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <FloatingInput
              label="New password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FloatingInput
              label="Confirm new password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
              {loading ? "Saving…" : "Set new password"}
              {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
            </button>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 flex-none text-accent" />
              <span>This link expires after one use. If it fails, request a new one from the forgot password page.</span>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

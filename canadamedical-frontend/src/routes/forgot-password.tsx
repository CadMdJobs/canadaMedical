import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { AuthLayout } from "@/components/site/AuthLayout";
import { FloatingInput } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset Password — CanadianMdJobs" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/api/auth/password/reset/", { email });
      setDone(true);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="We'll get you back in, in under a minute."
      subtitle="Reset links expire in 60 minutes for your security. We never store passwords in plain text."
      bullets={[
        "Encrypted link sent to your inbox",
        "Single-use, expires in 1 hour",
        "Need help? hello@CanadianMdJobs.ca",
      ]}
      footerNote={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link>
        </>
      }
    >
      <div className="space-y-7">
        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Forgot password</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Reset your password</h2>
          <p className="text-sm text-muted-foreground">Enter the email tied to your account and we'll send a secure reset link.</p>
        </header>

        {done ? (
          <div className="space-y-4 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6 text-center shadow-card">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-glow">
              <Mail className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold text-primary">Check your inbox</h3>
            <p className="text-sm text-foreground/80">
              We sent reset instructions to <span className="font-semibold text-primary">{email}</span>. The link expires in 1 hour.
            </p>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <FloatingInput
              label="Email address"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
              {loading ? "Sending link…" : "Send reset link"}
              {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
            </button>

            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 flex-none text-accent" />
              <span>For security, we'll always show this confirmation — even if the email isn't registered.</span>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

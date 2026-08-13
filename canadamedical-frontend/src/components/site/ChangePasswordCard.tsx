/**
 * Change-password panel shared by the physician and employer dashboards.
 *
 * Lifted out of the physician dashboard rather than copied into the employer
 * one: it validates credentials and signs every session out on success, and a
 * second copy is the kind that quietly falls behind when the rules change.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, Settings as SettingsIcon, XCircle } from "lucide-react";
import toast from "react-hot-toast";

import { api, apiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Lowercase letter", pass: /[a-z]/.test(password) },
    { label: "Number", pass: /\d/.test(password) },
    { label: "Special character", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const colors = ["bg-rose-400", "bg-rose-400", "bg-amber-400", "bg-amber-400", "bg-emerald-500"];
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= score ? colors[score - 1] : "bg-secondary"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map((c) => (
            <span key={c.label} className={`flex items-center gap-1 text-[11px] ${c.pass ? "text-emerald-600" : "text-muted-foreground"}`}>
              {c.pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {c.label}
            </span>
          ))}
        </div>
        <span className={`text-xs font-bold ${score >= 4 ? "text-emerald-600" : score >= 3 ? "text-amber-600" : "text-rose-500"}`}>
          {labels[score]}
        </span>
      </div>
    </div>
  );
}

function PwdInput({ id, value, show, onToggle, onChange, placeholder, error }: {
  id: string; value: string; show: boolean; onToggle: () => void;
  onChange: (v: string) => void; placeholder: string; error?: string;
}) {
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={id === "current" ? "current-password" : "new-password"}
          className={`w-full rounded-xl border bg-background px-3 py-2.5 pr-10 text-sm outline-none transition focus:ring-2 ${error ? "border-rose-400 focus:ring-rose-200" : "border-border focus:border-primary focus:ring-primary/15"}`}
        />
        <button type="button" tabIndex={-1} onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
          {show
            ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          }
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export function ChangePasswordCard() {
  const { user, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!current) errs.current = "Current password is required";
    if (!newPwd) errs.newPwd = "New password is required";
    else if (newPwd.length < 8) errs.newPwd = "At least 8 characters required";
    else if (current === newPwd) errs.newPwd = "Must be different from current password";
    if (!confirm) errs.confirm = "Please confirm your new password";
    else if (newPwd !== confirm) errs.confirm = "Passwords do not match";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post("/api/auth/password/change/", {
        current_password: current,
        new_password: newPwd,
        confirm_password: confirm,
        refresh_token: refreshToken ?? "",
      });
      setDone(true);
      // Tokens are blacklisted server-side, so the session in this tab is
      // already dead — send the user to log in rather than let them click
      // around and collect 401s.
      setTimeout(() => {
        logout();
        navigate({ to: "/login" } as never);
      }, 3000);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-emerald-900">Password Changed Successfully</h3>
        <p className="mt-2 text-sm text-emerald-700">
          Your password has been updated. You'll be redirected to log in again in a few seconds…
        </p>
        <div className="mt-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <SettingsIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Change Password</p>
            <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium">{user?.email}</span></p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Current Password
            </label>
            <PwdInput id="current" value={current} show={showCurrent} onToggle={() => setShowCurrent((v) => !v)}
              onChange={(v) => { setCurrent(v); setFieldErrors((p) => ({ ...p, current: "" })); }}
              placeholder="Your current password" error={fieldErrors.current} />
          </div>

          <div className="h-px bg-border" />

          <div>
            <label htmlFor="newPwd" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              New Password
            </label>
            <PwdInput id="newPwd" value={newPwd} show={showNew} onToggle={() => setShowNew((v) => !v)}
              onChange={(v) => { setNewPwd(v); setFieldErrors((p) => ({ ...p, newPwd: "" })); }}
              placeholder="Choose a strong password" error={fieldErrors.newPwd} />
            <PasswordStrengthBar password={newPwd} />
          </div>

          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Confirm New Password
            </label>
            <PwdInput id="confirm" value={confirm} show={showConfirm} onToggle={() => setShowConfirm((v) => !v)}
              onChange={(v) => { setConfirm(v); setFieldErrors((p) => ({ ...p, confirm: "" })); }}
              placeholder="Re-enter new password" error={fieldErrors.confirm} />
            {confirm && newPwd === confirm && !fieldErrors.confirm && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Passwords match
              </p>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs text-amber-800">
          After changing your password you will be signed out of all sessions and redirected to the login page.
          Make sure you remember your new password before saving.
        </p>
      </div>
    </div>
  );
}

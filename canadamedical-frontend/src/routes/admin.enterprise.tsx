import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Building2, Check, X, Eye, Clock, Search,
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
  DollarSign, Users, Calendar, Pencil, RotateCcw, AlertTriangle,
} from "lucide-react";
import { api, apiError } from "@/lib/api";

export const Route = createFileRoute("/admin/enterprise")({
  component: AdminEnterprisePage,
});

type RequestStatus = "pending" | "reviewing" | "approved" | "rejected" | "revoked";

interface ExistingPlanInfo {
  job_post_limit: number | null;
  price_monthly: string;
  valid_until: string | null;
  days_remaining: number | null;
  estimated_unused_value: number | null;
  payment_status: string;
  enterprise_request_id: number;
}

interface EnterpriseRequest {
  id: number;
  organization_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  monthly_hiring_volume: string;
  monthly_hiring_volume_display?: string;
  num_job_posts?: number | null;
  featured_jobs?: number | null;
  hiring_duration?: string;
  additional_services?: string;
  budget_range?: string;
  message?: string;
  status: RequestStatus;
  custom_job_limit?: number | null;
  custom_price_monthly?: string | null;
  custom_features?: string[];
  admin_notes?: string;
  approved_by_email?: string;
  approved_at?: string;
  rejected_reason?: string;
  revoked_by_email?: string;
  revoked_at?: string;
  revoked_reason?: string;
  custom_payment_status?: "pending_payment" | "paid" | "free" | "revoked" | null;
  custom_payment_link?: string | null;
  existing_plan_info?: ExistingPlanInfo | null;
  /** System-wide Stripe currency, read-only — the price below is billed in it. */
  currency?: string;
  created_at: string;
}

interface CustomPlan {
  id: number;
  user_email?: string;
  job_post_limit: number | null;
  price_monthly: string;
  features: string[];
  is_active: boolean;
  valid_until: string | null;
  jobs_posted?: number;
  created_at: string;
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "revoked", label: "Revoked" },
];

const STATUS_META: Record<RequestStatus, { bg: string; color: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { bg: "bg-amber-100",   color: "text-amber-800",   label: "Pending",   icon: Clock },
  reviewing: { bg: "bg-blue-100",    color: "text-blue-800",    label: "Reviewing", icon: Search },
  approved:  { bg: "bg-emerald-100", color: "text-emerald-800", label: "Approved",  icon: CheckCircle2 },
  rejected:  { bg: "bg-rose-100",    color: "text-rose-800",    label: "Rejected",  icon: XCircle },
  revoked:   { bg: "bg-slate-100",   color: "text-slate-700",   label: "Revoked",   icon: RotateCcw },
};

function StatusPill({ status }: { status: RequestStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.bg} ${m.color}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({ request, onClose, onDone }: { request: EnterpriseRequest; onClose: () => void; onDone: () => void }) {
  const ep = request.existing_plan_info;
  const hasActivePlan = !!ep;

  const fullPrice = request.custom_price_monthly ?? "799.00";
  const canAutoCalc = !!(ep?.estimated_unused_value && ep.estimated_unused_value > 0);

  // Auto-calculate discounted price when we have unused value info
  const autoDiscountedPrice = canAutoCalc
    ? Math.max(0, parseFloat(fullPrice) - ep!.estimated_unused_value!).toFixed(2)
    : fullPrice;

  const [jobLimit, setJobLimit] = useState(String(request.custom_job_limit ?? "20"));
  // Pre-fill with auto-discounted price; if no expiry, use full price
  const [price, setPrice] = useState(autoDiscountedPrice);
  // Manual discount input (used when expiry not set)
  const [manualDiscount, setManualDiscount] = useState("");
  const [featuresText, setFeaturesText] = useState(
    (request.custom_features?.length
      ? request.custom_features
      : ["20 Active Job Postings", "Priority support", "Dedicated account manager"]
    ).join("\n")
  );
  const [validUntil, setValidUntil] = useState("");
  const [adminNotes, setAdminNotes] = useState(request.admin_notes ?? "");
  const [loading, setLoading] = useState(false);
  const [revokeModal, setRevokeModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await api.patch(`/api/subscriptions/admin/enterprise/requests/${request.id}/approve/`, {
        custom_job_limit: jobLimit ? Number(jobLimit) : null,
        custom_price_monthly: price || "0",
        custom_features: featuresText.split("\n").map(l => l.trim()).filter(Boolean),
        admin_notes: adminNotes,
        ...(validUntil ? { valid_until: validUntil } : {}),
      });
      toast.success("Enterprise request approved — payment link sent to employer.");
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject(reason: string) {
    setLoading(true);
    try {
      await api.patch(`/api/subscriptions/admin/enterprise/requests/${request.id}/reject/`, { rejected_reason: reason });
      toast.success("Request rejected.");
      setRejectModal(false);
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(reason: string) {
    setLoading(true);
    try {
      await api.patch(`/api/subscriptions/admin/enterprise/requests/${request.id}/revoke/`, { revoked_reason: reason });
      const alreadyPaid = request.custom_payment_status === "paid";
      toast.success(alreadyPaid ? "Plan revoked and refund issued." : "Approval revoked. Payment link deactivated.");
      setRevokeModal(false);
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkReviewing() {
    setLoading(true);
    try {
      await api.patch(`/api/subscriptions/admin/enterprise/requests/${request.id}/review/`);
      toast.success("Marked as reviewing.");
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {/* ── Revoke confirmation modal ─────────────────────────────────────── */}
    {revokeModal && (
      <ReasonModal
        title={request.custom_payment_status === "paid" ? "Revoke Plan & Issue Refund" : "Revoke Approval"}
        description={request.custom_payment_status === "paid"
          ? "This employer has already paid. Revoking will cancel their plan and issue a full refund via Stripe."
          : "This will deactivate the payment link. The employer will no longer be able to pay for this plan."}
        reasonLabel="Reason for revocation (optional)"
        reasonPlaceholder="e.g. Fraudulent activity, policy violation, employer request…"
        confirmLabel={request.custom_payment_status === "paid" ? "Revoke & Refund" : "Revoke Approval"}
        confirmStyle="danger"
        loading={loading}
        onConfirm={(reason) => handleRevoke(reason)}
        onCancel={() => setRevokeModal(false)}
      />
    )}

    {/* ── Reject confirmation modal ──────────────────────────────────────── */}
    {rejectModal && (
      <ReasonModal
        title="Reject Enterprise Request"
        description="The employer will be notified that their request was not approved. You can provide a reason below."
        reasonLabel="Reason for rejection (optional)"
        reasonPlaceholder="e.g. Budget doesn't meet minimum, incomplete application…"
        confirmLabel="Reject Request"
        confirmStyle="warning"
        loading={loading}
        onConfirm={(reason) => handleReject(reason)}
        onCancel={() => setRejectModal(false)}
      />
    )}

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <h2 className="font-bold text-foreground">{request.organization_name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Enterprise Plan Request #{request.id} · {format(new Date(request.created_at), "MMM d, yyyy")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Existing active plan warning ─────────────────────────────── */}
          {hasActivePlan && ep && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900 text-sm">Employer Has an Active Paid Plan</p>
                  <p className="text-xs text-amber-700 mt-0.5">Approving this request will replace the existing plan below. Set the price to account for their unused credit.</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Current Price", value: `$${parseFloat(ep.price_monthly).toFixed(2)}/mo` },
                  { label: "Job Post Limit", value: ep.job_post_limit ? String(ep.job_post_limit) : "Unlimited" },
                  { label: "Expires", value: ep.valid_until ? format(new Date(ep.valid_until), "MMM d, yyyy") : "No expiry" },
                  { label: "Days Remaining", value: ep.days_remaining != null ? `${ep.days_remaining} days` : "—" },
                ].map(item => (
                  <div key={item.label} className="rounded-lg bg-amber-100 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">{item.label}</p>
                    <p className="text-sm font-bold text-amber-900 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
              {/* Branch 1: we can auto-calculate unused credit */}
              {canAutoCalc && (
                <div className="mt-3 rounded-lg bg-white border border-amber-200 px-4 py-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Estimated Unused Credit</p>
                      <p className="text-lg font-extrabold text-amber-700">−${ep!.estimated_unused_value!.toFixed(2)}</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        {ep!.days_remaining} days × ${parseFloat(ep!.price_monthly).toFixed(2)}/mo ÷ 30
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 justify-end">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Discount auto-applied
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        ${parseFloat(fullPrice).toFixed(2)} → <strong>${autoDiscountedPrice}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={() => setPrice(fullPrice)}
                        className="mt-1.5 text-[11px] text-amber-600 underline hover:text-amber-800 transition"
                      >
                        Reset to full price (${parseFloat(fullPrice).toFixed(2)})
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Branch 2: active plan exists but no expiry → manual discount input */}
              {!canAutoCalc && (
                <div className="mt-3 rounded-lg bg-white border border-amber-200 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">
                    No expiry set on existing plan — enter a manual discount if applicable
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={manualDiscount}
                        onChange={e => setManualDiscount(e.target.value)}
                        placeholder="Discount amount (e.g. 150)"
                        className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const disc = parseFloat(manualDiscount);
                        if (!isNaN(disc) && disc >= 0) {
                          setPrice(Math.max(0, parseFloat(fullPrice) - disc).toFixed(2));
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shrink-0"
                    >
                      <DollarSign className="h-3.5 w-3.5" /> Apply
                    </button>
                    {parseFloat(price) < parseFloat(fullPrice) && (
                      <button
                        type="button"
                        onClick={() => { setPrice(fullPrice); setManualDiscount(""); }}
                        className="text-[11px] text-amber-600 underline hover:text-amber-800 transition shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  {parseFloat(price) < parseFloat(fullPrice) && (
                    <p className="mt-1.5 text-[11px] text-emerald-700 font-semibold">
                      ✓ ${parseFloat(fullPrice).toFixed(2)} → ${parseFloat(price).toFixed(2)} (−${(parseFloat(fullPrice) - parseFloat(price)).toFixed(2)} discount)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Request details ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Request Details</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {[
                { label: "Organization", value: request.organization_name },
                { label: "Contact", value: request.contact_name },
                { label: "Email", value: request.contact_email },
                { label: "Phone", value: request.contact_phone || "—" },
                { label: "Job Posts Needed", value: request.num_job_posts ? String(request.num_job_posts) : "—" },
                { label: "Featured Jobs", value: request.featured_jobs ? String(request.featured_jobs) : "—" },
                { label: "Hiring Duration", value: request.hiring_duration || "—" },
                { label: "Monthly Volume", value: request.monthly_hiring_volume || "—" },
                { label: "Budget Range", value: request.budget_range || "—" },
              ].map(row => (
                <div key={row.label} className="flex gap-2">
                  <span className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">{row.label}</span>
                  <span className="text-sm text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
            {request.additional_services && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Additional Services</p>
                <p className="text-sm text-foreground">{request.additional_services}</p>
              </div>
            )}
            {request.message && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Message</p>
                <p className="italic text-foreground/80 text-sm">"{request.message}"</p>
              </div>
            )}
          </div>

          {/* ── Admin custom plan settings ───────────────────────────────── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              {hasActivePlan ? "New Plan Settings (replaces existing)" : "Custom Plan Settings"}
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Job Post Limit <span className="text-muted-foreground/50">(empty = unlimited)</span></label>
                  <input type="number" min={1} value={jobLimit} onChange={e => setJobLimit(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Monthly Price ({request.currency ?? "CAD"})
                    {hasActivePlan && ep?.estimated_unused_value && ep.estimated_unused_value > 0 && (
                      <span className="ml-1 text-amber-600">(consider discount)</span>
                    )}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="number" min={0} step={0.01} value={price} onChange={e => setPrice(e.target.value)}
                      placeholder="799.00"
                      className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Valid Until <span className="text-muted-foreground/50">(optional)</span></label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Custom Features <span className="text-muted-foreground/50">(one per line)</span></label>
                <textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={4}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 resize-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Internal Notes <span className="text-muted-foreground/50">(not shown to employer)</span></label>
                <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2}
                  placeholder="e.g. Large health network, negotiated rate, upgrade from $799 plan..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 resize-none" />
              </div>
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4 shrink-0">
          <div className="flex flex-wrap gap-2">
            {/* Revoked */}
            {request.status === "revoked" && (
              <div className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">
                  <RotateCcw className="h-4 w-4" /> Approval Revoked
                  {request.revoked_by_email && <span className="text-xs font-normal text-slate-400">by {request.revoked_by_email}</span>}
                  {request.revoked_at && <span className="text-xs font-normal text-slate-400">· {format(new Date(request.revoked_at), "MMM d, yyyy")}</span>}
                </span>
                {request.revoked_reason && (
                  <p className="text-xs text-slate-500 px-1"><span className="font-semibold">Reason:</span> {request.revoked_reason}</p>
                )}
              </div>
            )}

            {/* Already approved */}
            {request.status === "approved" && (
              <>
                <span className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                  request.custom_payment_status === "paid"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-blue-50 border-blue-200 text-blue-700"
                }`}>
                  <CheckCircle2 className="h-4 w-4" />
                  {request.custom_payment_status === "paid" ? "Paid & Active" : "Approved — Awaiting Payment"}
                </span>
                {request.custom_payment_status === "pending_payment" && (
                  <button onClick={() => setRevokeModal(true)} disabled={loading}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition disabled:opacity-60">
                    <RotateCcw className="h-4 w-4" />
                    Revoke Approval
                  </button>
                )}
                {request.custom_payment_status === "paid" && (
                  <button onClick={() => setRevokeModal(true)} disabled={loading}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-60">
                    <AlertTriangle className="h-4 w-4" />
                    Revoke Plan
                  </button>
                )}
              </>
            )}

            {/* Rejected */}
            {request.status === "rejected" && (
              <div className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600">
                  <XCircle className="h-4 w-4" /> Request Rejected
                </span>
                {request.rejected_reason && (
                  <p className="text-xs text-slate-500 px-1"><span className="font-semibold">Reason:</span> {request.rejected_reason}</p>
                )}
              </div>
            )}

            {/* Pending / Reviewing / Rejected */}
            {request.status !== "approved" && request.status !== "revoked" && (
              <>
                {request.status !== "rejected" && (
                  <button onClick={() => setRejectModal(true)} disabled={loading}
                    className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-60">
                    Reject
                  </button>
                )}
                {request.status !== "reviewing" && request.status !== "rejected" && (
                  <button onClick={handleMarkReviewing} disabled={loading}
                    className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition disabled:opacity-60">
                    Mark Reviewing
                  </button>
                )}
                <button onClick={handleApprove} disabled={loading}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {hasActivePlan ? "Approve Upgrade" : "Approve Plan"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// ─── ReasonModal ─────────────────────────────────────────────────────────────

function ReasonModal({
  title, description, reasonLabel, reasonPlaceholder,
  confirmLabel, confirmStyle, loading,
  onConfirm, onCancel,
}: {
  title: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirmLabel: string;
  confirmStyle: "danger" | "warning";
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  const btnClass = confirmStyle === "danger"
    ? "bg-rose-600 hover:bg-rose-700 text-white"
    : "bg-amber-600 hover:bg-amber-700 text-white";

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-6 py-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${confirmStyle === "danger" ? "bg-rose-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${confirmStyle === "danger" ? "text-rose-600" : "text-amber-600"}`} />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">This reason will be saved to the request record.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition disabled:opacity-60 ${btnClass}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Custom Plan Modal ───────────────────────────────────────────────────

function EditPlanModal({ plan, onClose, onDone }: { plan: CustomPlan; onClose: () => void; onDone: () => void }) {
  const [jobLimit, setJobLimit] = useState(String(plan.job_post_limit ?? ""));
  const [validUntil, setValidUntil] = useState(plan.valid_until ?? "");
  const [isActive, setIsActive] = useState(plan.is_active);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      await api.patch(`/api/subscriptions/admin/enterprise/custom-plans/${plan.id}/`, {
        job_post_limit: jobLimit ? Number(jobLimit) : null,
        valid_until: validUntil || null,
        is_active: isActive,
      });
      toast.success("Custom plan updated.");
      onDone();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-bold text-foreground">Edit Custom Plan</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">{plan.user_email}</p>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Job Post Limit <span className="text-muted-foreground/60">(empty = unlimited)</span></label>
            <input type="number" min={1} value={jobLimit} onChange={e => setJobLimit(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Valid Until</label>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-secondary/40 transition">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4 rounded accent-accent" />
            <span className="text-sm font-semibold text-foreground">Plan Active</span>
          </label>
          <div className="flex gap-3 border-t border-border pt-4">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition">Cancel</button>
            <button onClick={handleSave} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary-glow transition disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function AdminEnterprisePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [subTab, setSubTab] = useState<"requests" | "plans">("requests");
  const [selectedRequest, setSelectedRequest] = useState<EnterpriseRequest | null>(null);
  const [editPlan, setEditPlan] = useState<CustomPlan | null>(null);

  const { data: requests = [], isLoading } = useQuery<EnterpriseRequest[]>({
    queryKey: ["enterprise-requests", activeTab],
    queryFn: async () => {
      const params = activeTab !== "all" ? { status: activeTab } : {};
      const r = await api.get("/api/subscriptions/admin/enterprise/requests/", { params });
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
  });

  const { data: customPlans = [], isLoading: plansLoading } = useQuery<CustomPlan[]>({
    queryKey: ["enterprise-custom-plans"],
    queryFn: async () => {
      const r = await api.get("/api/subscriptions/admin/enterprise/custom-plans/");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    enabled: subTab === "plans",
  });

  const pendingCount = requests.filter(r => r.status === "pending").length;

  async function handleQuickAction(id: number, action: "review" | "reject") {
    try {
      if (action === "review") {
        await api.patch(`/api/subscriptions/admin/enterprise/requests/${id}/review/`);
        toast.success("Marked as reviewing.");
      } else {
        const reason = prompt("Reason for rejection (optional):");
        if (reason === null) return;
        await api.patch(`/api/subscriptions/admin/enterprise/requests/${id}/reject/`, { rejected_reason: reason });
        toast.success("Request rejected.");
      }
      qc.invalidateQueries({ queryKey: ["enterprise-requests"] });
    } catch (err) {
      toast.error(apiError(err));
    }
  }

  return (
    <div className="p-6 space-y-6">
      {selectedRequest && (
        <ApproveModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onDone={() => { setSelectedRequest(null); qc.invalidateQueries({ queryKey: ["enterprise-requests"] }); qc.invalidateQueries({ queryKey: ["enterprise-custom-plans"] }); }}
        />
      )}
      {editPlan && (
        <EditPlanModal
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onDone={() => { setEditPlan(null); qc.invalidateQueries({ queryKey: ["enterprise-custom-plans"] }); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Building2 className="h-6 w-6 text-accent" /> Enterprise Requests
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pendingCount}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage enterprise plan requests and active custom plans</p>
        </div>
      </div>

      {/* Sub-tab toggle */}
      <div className="flex gap-1 rounded-xl border border-border bg-secondary/40 p-1 w-fit">
        {([["requests", "Requests"], ["plans", "Active Custom Plans"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${subTab === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "requests" && (
        <>
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map(t => (
              <button key={t.value} onClick={() => setActiveTab(t.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${activeTab === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Requests table */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />)}</div>
            ) : requests.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 font-semibold text-foreground">No enterprise requests</p>
                <p className="text-sm text-muted-foreground mt-1">{activeTab !== "all" ? `No ${activeTab} requests` : "Requests will appear here"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/30 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Organization</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Volume</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map(req => (
                      <tr key={req.id} className="hover:bg-secondary/20 transition">
                        <td className="px-4 py-3 text-muted-foreground">#{req.id}</td>
                        <td className="px-4 py-3 font-semibold text-foreground max-w-48">
                          <p className="truncate">{req.organization_name}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <p className="font-medium text-foreground">{req.contact_name}</p>
                          <p className="text-xs">{req.contact_email}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {req.monthly_hiring_volume_display || req.monthly_hiring_volume}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {format(new Date(req.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={req.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setSelectedRequest(req)} title="View & Approve"
                              className="rounded-lg p-1.5 text-primary hover:bg-secondary transition" aria-label="View">
                              <Eye className="h-4 w-4" />
                            </button>
                            {req.status !== "reviewing" && req.status !== "approved" && req.status !== "rejected" && (
                              <button onClick={() => handleQuickAction(req.id, "review")} title="Mark Reviewing"
                                className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 transition" aria-label="Review">
                                <Search className="h-4 w-4" />
                              </button>
                            )}
                            {req.status !== "rejected" && req.status !== "approved" && (
                              <button onClick={() => handleQuickAction(req.id, "reject")} title="Reject"
                                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 transition" aria-label="Reject">
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {subTab === "plans" && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {plansLoading ? (
            <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />)}</div>
          ) : customPlans.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 font-semibold text-foreground">No active custom plans</p>
              <p className="text-sm text-muted-foreground mt-1">Approved enterprise requests will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3 text-center">Job Limit</th>
                    <th className="px-4 py-3 text-center">Price/mo</th>
                    <th className="px-4 py-3 text-center">Valid Until</th>
                    <th className="px-4 py-3 text-center">Active</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customPlans.map(plan => (
                    <tr key={plan.id} className="hover:bg-secondary/20 transition">
                      <td className="px-4 py-3 font-medium text-foreground">{plan.user_email ?? "—"}</td>
                      <td className="px-4 py-3 text-center font-semibold text-foreground">{plan.job_post_limit ?? "∞"}</td>
                      <td className="px-4 py-3 text-center text-foreground">${plan.price_monthly}/mo</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {plan.valid_until ? format(new Date(plan.valid_until), "MMM d, yyyy") : "No expiry"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${plan.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {plan.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button onClick={() => setEditPlan(plan)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground/70 hover:border-primary/30 hover:text-primary transition">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

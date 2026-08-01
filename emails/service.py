import logging
import resend
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

BRAND_COLOR = "#1a6b3c"
BRAND_NAME  = "CandianMdJobs"


def _get_api_key():
    return getattr(settings, "RESEND_API_KEY", "")


def _from():
    return getattr(settings, "RESEND_FROM_EMAIL", "onboarding@resend.dev")


def _base_html(title: str, body: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:{BRAND_COLOR};border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              {BRAND_NAME}
            </h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
              Canada's Physician Recruitment Platform
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px;border-radius:0 0 12px 12px;">
            {body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              &copy; 2025 {BRAND_NAME}. All rights reserved.<br/>
              You're receiving this email because you have an account on our platform.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _send(to: str, subject: str, html: str) -> bool:
    # Use Resend SDK only when a verified domain from-address is configured.
    # Otherwise fall back to Django's email backend (Gmail SMTP works without a domain).
    resend_from = getattr(settings, "RESEND_FROM_EMAIL", "")
    use_resend = (
        bool(_get_api_key())
        and bool(resend_from)
        and "resend.dev" not in resend_from  # onboarding@resend.dev = not verified
    )

    if use_resend:
        try:
            resend.api_key = _get_api_key()
            resend.Emails.send({"from": resend_from, "to": [to], "subject": subject, "html": html})
            logger.info("Email sent via Resend: '%s' → %s", subject, to)
            return True
        except Exception as exc:
            logger.error("Resend failed for '%s' to %s: %s", subject, to, exc)
            return False

    # Gmail SMTP fallback — works with any recipient, no domain needed
    try:
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@candianmdjobs.ca")
        msg = EmailMultiAlternatives(subject=subject, body="", from_email=from_email, to=[to])
        msg.attach_alternative(html, "text/html")
        msg.send()
        logger.info("Email sent via SMTP: '%s' → %s", subject, to)
        return True
    except Exception as exc:
        logger.error("SMTP failed for '%s' to %s: %s", subject, to, exc)
        return False


# ── Button helper ──────────────────────────────────────────────────────────────

def _btn(text: str, url: str, color: str = BRAND_COLOR) -> str:
    return f"""
<div style="text-align:center;margin:28px 0;">
  <a href="{url}"
     style="display:inline-block;background:{color};color:#ffffff;
            text-decoration:none;font-size:14px;font-weight:600;
            padding:13px 32px;border-radius:8px;letter-spacing:0.2px;">
    {text}
  </a>
</div>
"""


def _divider() -> str:
    return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>'


# ── 1. Welcome Email ───────────────────────────────────────────────────────────

def send_welcome_email(user) -> bool:
    name = getattr(user, "first_name", None) or user.email.split("@")[0]
    user_type = getattr(user, "user_type", "user")
    role_msg = (
        "You can now browse thousands of physician job opportunities across Canada."
        if user_type == "physician"
        else "You can now post physician job openings and connect with top candidates across Canada."
    )
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Welcome, {name}! 🎉</h2>
<p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Your account has been created successfully.</p>
<p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">{role_msg}</p>
{_btn("Go to Dashboard", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#6b7280;font-size:13px;">
  If you have any questions, reply to this email — we're here to help.
</p>
"""
    return _send(user.email, f"Welcome to {BRAND_NAME}!", _base_html(f"Welcome to {BRAND_NAME}", body))


# ── 2. Job Application Confirmation (to Physician) ────────────────────────────

def send_application_confirmation(physician_user, job_title: str, employer_name: str) -> bool:
    name = getattr(physician_user, "first_name", None) or physician_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Application Submitted ✅</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, your application has been received.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Position Applied</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">{employer_name}</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  The employer will review your profile and get back to you. You can track your application status from your dashboard.
</p>
{_btn("View My Applications", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#6b7280;font-size:13px;">Good luck with your application!</p>
"""
    return _send(
        physician_user.email,
        f"Application submitted — {job_title}",
        _base_html("Application Submitted", body),
    )


# ── 3. Job Approved (to Employer) ─────────────────────────────────────────────

def send_job_approved_email(employer_user, job_title: str) -> bool:
    name = getattr(employer_user, "first_name", None) or employer_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Your Job is Live! 🚀</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, great news!</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Approved Posting</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:6px 0 0;font-size:13px;color:#15803d;font-weight:600;">✓ Now visible to all physicians on our platform</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  Physicians can now find and apply to your posting. You'll receive an email whenever someone applies.
</p>
{_btn("View Job Posting", f"{frontend_url}/dashboard")}
"""
    return _send(
        employer_user.email,
        f"Job approved and live — {job_title}",
        _base_html("Job Approved", body),
    )


# ── 4. Job Rejected (to Employer) ─────────────────────────────────────────────

def send_job_rejected_email(employer_user, job_title: str, reason: str = "") -> bool:
    name = getattr(employer_user, "first_name", None) or employer_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")
    reason_block = f"""
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#c2410c;text-transform:uppercase;">Reason</p>
  <p style="margin:0;font-size:14px;color:#374151;">{reason}</p>
</div>
""" if reason else ""

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Job Posting Needs Revision</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, your posting requires some changes before it can go live.</p>

<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:16px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">Posting</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
</div>

{reason_block}

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  Please edit and resubmit your posting. Our team will review it again within 24 hours.
</p>
{_btn("Edit & Resubmit", f"{frontend_url}/dashboard", color="#dc2626")}
"""
    return _send(
        employer_user.email,
        f"Action required — {job_title}",
        _base_html("Job Posting Needs Revision", body),
    )


# ── 5. New Application Notification (to Employer) ─────────────────────────────

def send_new_application_email(employer_user, physician_name: str, job_title: str) -> bool:
    name = getattr(employer_user, "first_name", None) or employer_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">New Application Received 📩</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, a physician has applied to your posting.</p>

<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;">Applicant</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{physician_name}</p>
  <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Applied for: <strong>{job_title}</strong></p>
</div>

{_btn("Review Application", f"{frontend_url}/dashboard")}
"""
    return _send(
        employer_user.email,
        f"New application — {job_title}",
        _base_html("New Application", body),
    )


# ── 6. Password Reset ──────────────────────────────────────────────────────────

def send_password_reset_email(user, reset_url: str) -> bool:
    name = getattr(user, "first_name", None) or user.email.split("@")[0]

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Reset Your Password</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, we received a request to reset your password.</p>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  Click the button below to set a new password. This link expires in <strong>24 hours</strong>.
</p>
{_btn("Reset Password", reset_url)}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  If you didn't request this, you can safely ignore this email. Your password won't change.
</p>
"""
    return _send(
        user.email,
        "Reset your password",
        _base_html("Password Reset", body),
    )


# ── 7. Payment Confirmation ───────────────────────────────────────────────────

def send_payment_confirmation_email(user, plan_name: str, amount: str, period_end: str = "") -> bool:
    name = getattr(user, "first_name", None) or user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")
    renewal_line = f"<p style='margin:4px 0 0;font-size:13px;color:#6b7280;'>Next renewal: <strong>{period_end}</strong></p>" if period_end else ""

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Payment Confirmed ✅</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, your subscription is now active.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{plan_name}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#15803d;font-weight:600;">Active subscription</p>
      {renewal_line}
    </div>
    <div style="text-align:right;">
      <p style="margin:0;font-size:24px;font-weight:800;color:#111827;">{amount}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">CAD / month</p>
    </div>
  </div>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  You can manage your subscription, view payment history, and download invoices from your dashboard.
</p>
{_btn("Go to Billing", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  Questions about your bill? Reply to this email and we'll help right away.
</p>
"""
    return _send(
        user.email,
        f"Payment confirmed — {plan_name}",
        _base_html("Payment Confirmed", body),
    )


# ── 8. Application Status Change (to Physician) ───────────────────────────────

_STATUS_META = {
    "reviewed":   ("👀 Application Reviewed",      "#1d4ed8", "#eff6ff", "#bfdbfe", "Your application has been reviewed by the employer."),
    "shortlisted":("⭐ You've Been Shortlisted!",  "#15803d", "#f0fdf4", "#bbf7d0", "Great news — you've been shortlisted for the next stage."),
    "interview":  ("📅 Interview Invitation",       "#7e22ce", "#faf5ff", "#e9d5ff", "You've been invited to an interview. Check your dashboard for details."),
    "offered":    ("🎉 Job Offer Received!",        "#b45309", "#fffbeb", "#fde68a", "Congratulations! You have received a job offer."),
    "rejected":   ("Application Update",            "#6b7280", "#f9fafb", "#e5e7eb", "Thank you for applying. After careful consideration, the employer has decided to move forward with other candidates."),
}

def send_application_status_email(physician_user, job_title: str, employer_name: str, new_status: str) -> bool:
    name = getattr(physician_user, "first_name", None) or physician_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")
    meta = _STATUS_META.get(new_status)
    if not meta:
        return False
    heading, accent, bg, border, message = meta

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">{heading}</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name},</p>

<div style="background:{bg};border:1px solid {border};border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:{accent};text-transform:uppercase;">Position</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">{employer_name}</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">{message}</p>
{_btn("View My Applications", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  Log in to your dashboard to see full details and next steps.
</p>
"""
    return _send(
        physician_user.email,
        f"{heading} — {job_title}",
        _base_html("Application Update", body),
    )


# ── 9. Offer Accepted — to Employer ──────────────────────────────────────────

def send_offer_accepted_email(employer_user, physician_name: str, job_title: str) -> bool:
    name = getattr(employer_user, "first_name", None) or employer_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Offer Accepted! 🎉</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, great news from your candidate.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;">Position Filled</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:6px 0 0;font-size:14px;color:#374151;"><strong>{physician_name}</strong> has accepted your offer.</p>
  <p style="margin:8px 0 0;font-size:13px;color:#15803d;font-weight:600;">✓ Offer accepted</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  Congratulations on a successful hire! If this position is now filled, you can close the job posting from your dashboard to stop receiving new applications.
</p>
{_btn("View Applications", f"{frontend_url}/dashboard/employer?tab=applications")}
"""
    return _send(
        employer_user.email,
        f"Offer accepted — {physician_name} for {job_title}",
        _base_html("Offer Accepted", body),
    )


# ── 10. Offer Declined — to Employer ──────────────────────────────────────────

def send_offer_declined_email(employer_user, physician_name: str, job_title: str) -> bool:
    name = getattr(employer_user, "first_name", None) or employer_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Offer Declined</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, an update on your offer.</p>

<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#c2410c;text-transform:uppercase;">Position</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:6px 0 0;font-size:14px;color:#374151;"><strong>{physician_name}</strong> has declined your offer.</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  The job posting remains active and other candidates are still available for review. Consider shortlisting another candidate or extending a new offer.
</p>
{_btn("Review Applications", f"{frontend_url}/dashboard/employer?tab=applications")}
"""
    return _send(
        employer_user.email,
        f"Offer declined — {physician_name} for {job_title}",
        _base_html("Offer Declined", body),
    )


# ── 11. Offer Accepted Confirmation — to Physician ────────────────────────────

def send_offer_accepted_confirmation(physician_user, job_title: str, employer_name: str) -> bool:
    name = getattr(physician_user, "first_name", None) or physician_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Congratulations, Dr. {name}! 🎊</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">You have officially accepted a job offer.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;">Your New Position</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">{employer_name}</p>
  <p style="margin:10px 0 0;font-size:13px;color:#15803d;font-weight:600;">✓ Offer accepted</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  The employer has been notified. Expect them to be in touch with onboarding details.
  Best of luck in your new role — CandianMdJobs is proud to have helped you find it!
</p>
{_btn("View My Applications", f"{frontend_url}/dashboard/physician?tab=applications")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  Thank you for using CandianMdJobs. We wish you the very best in your new position.
</p>
"""
    return _send(
        physician_user.email,
        f"Offer accepted — {job_title} at {employer_name}",
        _base_html("Offer Accepted", body),
    )


# ── 12. Custom Email from Employer to Applicant ───────────────────────────────

def send_employer_custom_email(physician_user, employer_name: str, job_title: str, subject: str, message: str) -> bool:
    name = getattr(physician_user, "first_name", None) or physician_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Message from {employer_name}</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi {name}, you have a new message regarding your application.</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Regarding</p>
  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">{job_title}</p>
</div>

<div style="border-left:3px solid #1a6b3c;padding:12px 16px;margin:0 0 20px;background:#f0fdf4;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">{message}</p>
</div>

{_btn("View My Applications", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  This message was sent by {employer_name} via CandianMdJobs.
</p>
"""
    return _send(
        physician_user.email,
        subject,
        _base_html("New Message", body),
    )


# ── 13. Enterprise request submitted — notify admin ───────────────────────────

def send_enterprise_request_admin_email(admin_email: str, employer_name: str, org_name: str, request: object) -> bool:
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:8080')

    def _row(label, val):
        if not val:
            return ''
        return f'<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">{label}</td><td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{val}</td></tr>'

    rows = ''.join([
        _row('Organization', org_name),
        _row('Contact', getattr(request, 'contact_name', '')),
        _row('Email', getattr(request, 'contact_email', '')),
        _row('Phone', getattr(request, 'contact_phone', '')),
        _row('Hiring Volume', getattr(request, 'monthly_hiring_volume', '') or ''),
        _row('Job Posts Needed', getattr(request, 'num_job_posts', '') or ''),
        _row('Featured Jobs', getattr(request, 'featured_jobs', '') or ''),
        _row('Hiring Duration', getattr(request, 'hiring_duration', '')),
        _row('Budget Range', getattr(request, 'budget_range', '')),
        _row('Additional Services', getattr(request, 'additional_services', '')),
    ])
    notes = getattr(request, 'message', '')

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">New Enterprise Plan Request</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
  <strong>{employer_name}</strong> has submitted a custom plan request and is awaiting your review.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">{rows}</table>
</div>

{'<div style="border-left:3px solid #1a6b3c;padding:12px 16px;margin:0 0 20px;background:#f0fdf4;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;">' + notes + '</p></div>' if notes else ''}

{_btn('Review Request in Admin Dashboard', f'{frontend_url}/admin/enterprise')}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">This notification was sent automatically by CandianMdJobs.</p>
"""
    return _send(admin_email, f'New Enterprise Plan Request — {org_name}', _base_html('Enterprise Request', body))


# ── 14. Custom plan payment link ready — notify employer ──────────────────────

def send_custom_plan_payment_link_email(employer_user, payment_link: str, price: str, job_limit, features: list) -> bool:
    name = getattr(employer_user, 'first_name', None) or employer_user.email.split('@')[0]
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:8080')

    feature_items = ''.join(
        f'<li style="margin:4px 0;font-size:13px;color:#374151;">✓ {f}</li>'
        for f in (features or [])[:5]
    )
    limit_text = f'{job_limit} active job postings' if job_limit else 'Unlimited job postings'

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Your Custom Plan is Ready! 🎉</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
  Hi {name}, great news — your custom enterprise plan has been approved and your payment link is ready.
  Complete your payment below to activate the plan immediately.
</p>

<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;">Your Custom Plan</p>
  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;">${price}<span style="font-size:14px;font-weight:500;color:#6b7280;">/month</span></p>
  <ul style="margin:0;padding:0 0 0 4px;list-style:none;">
    <li style="margin:4px 0;font-size:13px;color:#374151;">✓ {limit_text}</li>
    {feature_items}
  </ul>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  Click the button below to complete your payment securely via Stripe. Your plan will activate immediately after payment.
</p>

{_btn('Complete Payment Now', payment_link, '#7c3aed')}

<p style="margin:20px 0 0;color:#6b7280;font-size:13px;text-align:center;">
  You can also access your payment link from your <a href="{frontend_url}/dashboard/employer?tab=billing" style="color:#7c3aed;">billing dashboard</a>.
</p>
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  If you have questions, reply to this email or contact your account manager.
</p>
"""
    return _send(
        employer_user.email,
        'Your CandianMdJobs Custom Plan Payment Link',
        _base_html('Custom Plan Payment', body),
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN NOTIFICATION EMAILS
# ══════════════════════════════════════════════════════════════════════════════

# ── A1. New user signup ───────────────────────────────────────────────────────

def send_admin_new_user_email(admin_email: str, user_email: str, user_type: str, full_name: str) -> bool:
    role_badge = 'Physician' if user_type == 'physician' else 'Employer'
    role_color = '#1d4ed8' if user_type == 'physician' else '#7e22ce'

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">New User Registration 👤</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A new account has been created on the platform.</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Name</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{full_name or '—'}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Email</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{user_email}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Role</td>
      <td style="padding:6px 0;">
        <span style="background:{role_color};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;">{role_badge}</span>
      </td>
    </tr>
  </table>
</div>

{_btn('View in Admin Dashboard', getattr(__import__('django.conf', fromlist=['settings']).settings, 'FRONTEND_URL', '') + '/admin/users')}
"""
    return _send(admin_email, f'New {role_badge} Registration — {user_email}', _base_html('New User Registration', body))


# ── A2. New job post submitted (pending review) ───────────────────────────────

def send_admin_new_job_email(admin_email: str, job_title: str, employer_name: str, employer_email: str, province: str) -> bool:
    from django.conf import settings
    frontend_url = getattr(settings, 'FRONTEND_URL', '')

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">New Job Post Pending Review 📋</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A new job posting has been submitted and requires your approval.</p>

<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#b45309;text-transform:uppercase;">Pending Approval</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">{employer_name} · {province}</p>
  <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">{employer_email}</p>
</div>

{_btn('Review & Approve Job', f'{frontend_url}/admin/jobs')}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">Log in to the admin dashboard to approve or reject this posting.</p>
"""
    return _send(admin_email, f'New Job Post Pending Review — {job_title}', _base_html('New Job Post', body))


# ── A3. Payment received ──────────────────────────────────────────────────────

def send_admin_payment_email(admin_email: str, employer_email: str, employer_name: str, plan_name: str, amount: str) -> bool:
    from django.conf import settings
    frontend_url = getattr(settings, 'FRONTEND_URL', '')

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Payment Received 💳</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A new subscription payment has been processed.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Employer</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{employer_name}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Email</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;">{employer_email}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Plan</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{plan_name}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Amount</td>
      <td style="padding:6px 0;font-size:16px;font-weight:800;color:#15803d;">{amount} CAD</td>
    </tr>
  </table>
</div>

{_btn('View Payment History', f'{frontend_url}/admin/payments')}
"""
    return _send(admin_email, f'Payment Received — {plan_name} ({amount} CAD)', _base_html('Payment Received', body))


# ── A4. Stripe payment failed ─────────────────────────────────────────────────

def send_admin_payment_failed_email(admin_email: str, employer_email: str, plan_name: str) -> bool:
    from django.conf import settings
    frontend_url = getattr(settings, 'FRONTEND_URL', '')

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">⚠️ Payment Failed</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">A subscription payment has failed and the account is now past due.</p>

<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Employer</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{employer_email}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Plan</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{plan_name}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Status</td>
      <td style="padding:6px 0;"><span style="color:#dc2626;font-weight:700;">Past Due</span></td>
    </tr>
  </table>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;">The account has been marked as past due. Stripe will retry automatically. No action needed unless the issue persists.</p>
{_btn('View in Stripe Dashboard', 'https://dashboard.stripe.com/payments')}
"""
    return _send(admin_email, f'⚠️ Payment Failed — {employer_email}', _base_html('Payment Failed', body))


# ── A5. Subscription cancelled ────────────────────────────────────────────────

def send_admin_subscription_cancelled_email(admin_email: str, employer_email: str, employer_name: str, plan_name: str) -> bool:
    from django.conf import settings
    frontend_url = getattr(settings, 'FRONTEND_URL', '')

    body = f"""
<h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">Subscription Cancelled</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">An employer has cancelled their subscription.</p>

<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;">Employer</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{employer_name}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Email</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;">{employer_email}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Plan</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{plan_name}</td>
    </tr>
  </table>
</div>

{_btn('View Subscriptions', f'{frontend_url}/admin/subscriptions')}
"""
    return _send(admin_email, f'Subscription Cancelled — {employer_name}', _base_html('Subscription Cancelled', body))

import logging
import resend
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger(__name__)

# Palette sampled from the approved mock-up rather than guessed, so the mail
# matches the site instead of the green it used to be.
BRAND_COLOR  = "#1660dd"   # primary blue: buttons, the rule under the header
BRAND_NAVY   = "#0f1f3d"   # headings
HEADER_BG    = "#eaf0fb"   # pale blue band behind the logo
PAGE_BG      = "#f7f8fc"   # canvas the card floats on
CARD_BORDER  = "#e6eaf2"
BRAND_NAME   = "CanadianMdJobs"

FONT_STACK = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
    "Helvetica,Arial,sans-serif"
)


def _logo_url():
    """Absolute URL to the email logo.

    Mail clients cannot resolve relative paths and Outlook will not render
    WebP, so this points at a plain PNG that Vite copies verbatim out of
    `public/` — no content hash in the name, so the URL survives every deploy.
    """
    base = (getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    return f"{base}/email-logo.png"


def _get_api_key():
    return getattr(settings, "RESEND_API_KEY", "")


def _from():
    return getattr(settings, "RESEND_FROM_EMAIL", "onboarding@resend.dev")


def _base_html(title: str, body: str) -> str:
    """Wrap a message body in the shared shell.

    Table-based and inline-styled throughout because Outlook renders mail
    through Word, which ignores most modern CSS. Rounded corners degrade to
    square there, which is the only visible difference.
    """
    year = timezone.now().year
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:{PAGE_BG};font-family:{FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:{PAGE_BG};">
    <tr><td align="center" style="padding:32px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#ffffff;
                    border:1px solid {CARD_BORDER};border-radius:14px;">

        <!-- Header: logo over a pale blue band, closed by the brand rule -->
        <tr>
          <td align="center"
              style="background:{HEADER_BG};border-radius:13px 13px 0 0;
                     padding:34px 28px 26px;border-bottom:3px solid {BRAND_COLOR};">
            <img src="{_logo_url()}" alt="{BRAND_NAME}" width="320"
                 style="display:block;margin:0 auto;width:320px;max-width:80%;
                        height:auto;border:0;outline:none;text-decoration:none;" />
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"
                   style="margin:18px auto 0;">
              <tr>
                <td width="46" style="border-top:1px solid #b9cdf0;font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:0 14px;color:#15305e;font-size:14px;font-family:{FONT_STACK};">
                  Canada's Physician Recruitment Platform
                </td>
                <td width="46" style="border-top:1px solid #b9cdf0;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:34px 36px 32px;border-radius:0 0 13px 13px;">
            {body}
          </td>
        </tr>

      </table>

      <!-- Footer sits on the canvas, outside the card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:20px 20px 0;font-family:{FONT_STACK};">
            <p style="margin:0;font-size:13px;color:#6b7280;">
              &copy; {year}
              <span style="color:{BRAND_COLOR};font-weight:700;">{BRAND_NAME}</span>.
              All rights reserved.
            </p>
            <p style="margin:6px 0 0;font-size:12.5px;color:#8b93a3;">
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
    # bgcolor on the cell as well as the style: Outlook drops the background
    # shorthand and would otherwise render white text on white.
    return f"""
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"
       style="margin:28px auto;">
  <tr>
    <td align="center" bgcolor="{color}" style="background:{color};border-radius:10px;">
      <a href="{url}"
         style="display:inline-block;padding:15px 34px;color:#ffffff;
                text-decoration:none;font-size:16px;font-weight:700;
                font-family:{FONT_STACK};letter-spacing:0.1px;">
        <span style="vertical-align:middle;">{text}</span>
        <span style="display:inline-block;vertical-align:middle;margin-left:10px;
                     width:22px;height:22px;line-height:21px;text-align:center;
                     border:2px solid #ffffff;border-radius:50%;font-size:13px;">&#8594;</span>
      </a>
    </td>
  </tr>
</table>
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Welcome, {name}! 🎉</h2>
<p style="margin:0 0 16px;color:#5a6172;font-size:16px;line-height:1.55;">Your account has been created successfully.</p>
<p style="margin:0 0 20px;color:#1f2937;font-size:16px;line-height:1.65;">{role_msg}</p>
{_btn("Go to Dashboard", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
  If you have any questions, reply to this email — we're here to help.
</p>
"""
    return _send(user.email, f"Welcome to {BRAND_NAME}!", _base_html(f"Welcome to {BRAND_NAME}", body))


# ── 2. Job Application Confirmation (to Physician) ────────────────────────────

def send_application_confirmation(physician_user, job_title: str, employer_name: str) -> bool:
    name = getattr(physician_user, "first_name", None) or physician_user.email.split("@")[0]
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8080")

    body = f"""
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Application Submitted ✅</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, your application has been received.</p>

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
<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Good luck with your application!</p>
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Your Job is Live! 🚀</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, great news!</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Job Posting Needs Revision</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, your posting requires some changes before it can go live.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">New Application Received 📩</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, a physician has applied to your posting.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Reset Your Password</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, we received a request to reset your password.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Payment Confirmed ✅</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, your subscription is now active.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">{heading}</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name},</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Offer Accepted! 🎉</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, great news from your candidate.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Offer Declined</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, an update on your offer.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Congratulations, Dr. {name}! 🎊</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">You have officially accepted a job offer.</p>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#15803d;text-transform:uppercase;">Your New Position</p>
  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">{job_title}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">{employer_name}</p>
  <p style="margin:10px 0 0;font-size:13px;color:#15803d;font-weight:600;">✓ Offer accepted</p>
</div>

<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
  The employer has been notified. Expect them to be in touch with onboarding details.
  Best of luck in your new role — CanadianMdJobs is proud to have helped you find it!
</p>
{_btn("View My Applications", f"{frontend_url}/dashboard/physician?tab=applications")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  Thank you for using CanadianMdJobs. We wish you the very best in your new position.
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Message from {employer_name}</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">Hi {name}, you have a new message regarding your application.</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Regarding</p>
  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">{job_title}</p>
</div>

<div style="border-left:3px solid #16a34a;padding:12px 16px;margin:0 0 20px;background:#f0fdf4;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">{message}</p>
</div>

{_btn("View My Applications", f"{frontend_url}/dashboard")}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">
  This message was sent by {employer_name} via CanadianMdJobs.
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">New Enterprise Plan Request</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">
  <strong>{employer_name}</strong> has submitted a custom plan request and is awaiting your review.
</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
  <table style="width:100%;border-collapse:collapse;">{rows}</table>
</div>

{'<div style="border-left:3px solid #16a34a;padding:12px 16px;margin:0 0 20px;background:#f0fdf4;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;">' + notes + '</p></div>' if notes else ''}

{_btn('Review Request in Admin Dashboard', f'{frontend_url}/admin/enterprise')}
{_divider()}
<p style="margin:0;color:#9ca3af;font-size:13px;">This notification was sent automatically by CanadianMdJobs.</p>
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Your Custom Plan is Ready! 🎉</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">
  Hi {name}, great news — your custom enterprise plan has been approved and your payment link is ready.
  Complete your payment below to activate the plan immediately.
</p>

<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin-bottom:20px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;">Your Custom Plan</p>
  <p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;">${price} {settings.STRIPE_CURRENCY.upper()}<span style="font-size:14px;font-weight:500;color:#6b7280;">/month</span></p>
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
        'Your CanadianMdJobs Custom Plan Payment Link',
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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">New User Registration 👤</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">A new account has been created on the platform.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">New Job Post Pending Review 📋</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">A new job posting has been submitted and requires your approval.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Payment Received 💳</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">A new subscription payment has been processed.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">⚠️ Payment Failed</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">A subscription payment has failed and the account is now past due.</p>

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
<h2 style="margin:0 0 10px;color:#0f1f3d;font-size:28px;font-weight:800;line-height:1.22;letter-spacing:-0.4px;">Subscription Cancelled</h2>
<p style="margin:0 0 20px;color:#5a6172;font-size:16px;line-height:1.55;">An employer has cancelled their subscription.</p>

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

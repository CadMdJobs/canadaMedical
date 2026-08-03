# DNS Setup — Instructions for the Domain Owner

Hand this to whoever controls the domain. It assumes no prior DNS knowledge and
asks for four records and one screenshot back. Nothing here gives away access
to anything else: DNS records only say "this name points at this server".

The domain is `canadianmdjobs.com`. Confirm the server IP is still
`148.230.92.247` before sending.

> **Status: the three A records below were added on 2026-08-03 and verified
> resolving.** Keep this file for the SPF/DKIM round described at the bottom —
> Resend needs a second set of records from the same owner.

---

## What you need to do

Log in wherever the domain was purchased — GoDaddy, Namecheap, Hostinger,
Cloudflare, or similar. Find the section called **DNS**, **DNS Management**,
**DNS Records**, or **Manage DNS**.

Add the three records below. If a record with the same Name already exists,
edit it rather than adding a second one.

| Type | Name / Host | Value / Points to | TTL       |
| ---- | ----------- | ----------------- | --------- |
| A    | `@`         | `148.230.92.247`  | Automatic |
| A    | `www`       | `148.230.92.247`  | Automatic |
| A    | `api`       | `148.230.92.247`  | Automatic |

That is it. Save, and send back a screenshot of the record list.

---

## Notes that prevent the usual mistakes

**In the Name field, enter only what the table says.** Type `api`, not
`api.canadianmdjobs.com`. The control panel adds the domain part itself. Some
panels show the full name back to you after saving — that is correct.

**`@` means the domain on its own** (`canadianmdjobs.com` with nothing in front).
A few panels label this "root", "apex", or want the field left blank instead.

**Changes take time to spread** — usually 5–30 minutes, occasionally a few
hours. Nothing is broken during that window.

**If the domain is on Cloudflare:** each record has an orange cloud toggle
(Proxy status). Set all three to **DNS only** (grey cloud) for now. The
security certificate cannot be issued while the orange cloud is on. Once the
site is live over HTTPS, the orange cloud can be turned back on — tell us
before you do, as one Cloudflare setting has to be changed at the same time.

---

## What happens after

Once the records are in, we finish the setup on the server: security
certificates, switching the site to HTTPS, and connecting the payment and email
services to the new domain. That is roughly 30 minutes of work on our side.

We will confirm when the site is live on the domain.

---

## Two things we will need separately

Not part of DNS, but required before the site can take real payments or send
real email:

1. **Stripe** — the account that receives payments should be in your name, not
   ours. We will need either an invite to it or the live API keys.
2. **Email sending domain** — we will send you two or three more DNS records
   (SPF and DKIM) to add. Without them, password-reset and notification emails
   will be rejected as spam.

Both can wait until after the domain is pointing at the server.

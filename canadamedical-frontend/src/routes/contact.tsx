import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, MapPin, Search, ClipboardList, Building2, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/site/PageHeader";
import { Field, Input, Select, Textarea, SubmitButton, SuccessNotice } from "@/components/site/Form";
import { api, apiError } from "@/lib/api";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact Us — CanadianMdJobs" }] }),
  component: ContactPage,
});

const QUICK_HELP = [
  {
    icon: Search,
    title: "Find a Job",
    desc: "Browse 500+ physician jobs across every province and specialty.",
    cta: "Browse Jobs",
    to: "/jobs",
  },
  {
    icon: ClipboardList,
    title: "Career Assessment",
    desc: "Get your free personalized career roadmap in under 5 minutes.",
    cta: "Start Free",
    to: "/assessment",
  },
  {
    icon: Building2,
    title: "Post a Job",
    desc: "Register free and post your first physician position today.",
    cta: "Register",
    to: "/register/employer",
  },
];

function ContactPage() {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      full_name: fd.get("full_name") as string,
      email: fd.get("email") as string,
      phone: (fd.get("phone") as string) || undefined,
      user_type: fd.get("user_type") as string,
      subject: fd.get("subject") as string,
      message: fd.get("message") as string,
    };
    setSubmitting(true);
    try {
      await api.post("/api/contact/", payload);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div>
      <PageHeader eyebrow="Get in touch" title="Contact CanadianMdJobs" subtitle="Whether you're a physician exploring options or an employer ready to hire — we're here." />

      <section className="mx-auto max-w-7xl gap-8 px-4 pb-16 pt-8 lg:-mt-12 lg:grid lg:grid-cols-[1fr_2fr] lg:px-8 lg:pt-0">
        <aside className="space-y-3 sm:space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 text-accent" /><div><div className="font-semibold text-primary">Headquarters</div><div className="text-sm text-muted-foreground">100 King St W, Suite 4200<br/>Toronto, ON M5X 1E2</div></div></div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
            <div className="flex items-start gap-3"><Phone className="mt-0.5 h-5 w-5 text-accent" /><div><div className="font-semibold text-primary">Phone</div><div className="text-sm text-muted-foreground">+1 (800) 555-0199<br/>Mon–Fri 8am–6pm ET</div></div></div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
            <div className="flex items-start gap-3"><Mail className="mt-0.5 h-5 w-5 text-accent" /><div><div className="font-semibold text-primary">Email</div><div className="text-sm text-muted-foreground">hello@CanadianMdJobs.ca</div></div></div>
          </div>
        </aside>
        <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) sm:p-10 lg:mt-0">
          {done ? <SuccessNotice message="Message received. Our team will reply within one business day." /> : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full Name" required><Input name="full_name" required maxLength={100} /></Field>
                <Field label="Email" required><Input name="email" required type="email" maxLength={200} /></Field>
                <Field label="Phone"><Input name="phone" type="tel" maxLength={20} /></Field>
                <Field label="I am a…" required>
                  <Select name="user_type" required defaultValue=""><option value="" disabled>Select…</option><option value="physician">Physician</option><option value="employer">Employer / Recruiter</option><option value="other">Other</option></Select>
                </Field>
              </div>
              <Field label="Subject" required><Input name="subject" required maxLength={150} /></Field>
              <Field label="Message" required><Textarea name="message" required maxLength={1500} /></Field>
              <SubmitButton loading={submitting}>Send Message</SubmitButton>
            </form>
          )}
        </div>
      </section>

      {/* Quick Help */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:pb-20 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Quick help</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">Not sure where to start?</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-3">
          {QUICK_HELP.map(({ icon: Icon, title, desc, cta, to }) => (
            <div key={title} className="flex flex-col rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-(--shadow-card) transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-primary">{title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{desc}</p>
              <Link
                to={to}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-glow"
              >
                {cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

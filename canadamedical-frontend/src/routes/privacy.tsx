import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CanadianMdJobs" },
      { name: "description", content: "How CanadianMdJobs collects, uses, and protects your personal information under PIPEDA and provincial law." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div>
      <PageHeader eyebrow="Legal" title="Privacy Policy" subtitle="Last updated: May 1, 2026" />
      <article className="prose-policy mx-auto max-w-3xl space-y-6 px-4 py-10 text-foreground/85 sm:py-16 lg:px-8">
        <Section title="1. Overview">
          CanadianMdJobs Inc. ("CanadianMdJobs", "we", "us") respects your privacy. This policy explains what information we collect,
          how we use it, and the choices you have. We comply with the federal <em>Personal Information Protection and Electronic
          Documents Act</em> (PIPEDA) and applicable provincial legislation.
        </Section>
        <Section title="2. Information we collect">
          We collect information you provide when you register an account, complete a profile, upload a CV, apply to a posting, or
          contact us — including name, email, phone, licensure details, employment history, and (for employers) organization details.
          We also collect technical information such as IP address, device type, and pages viewed.
        </Section>
        <Section title="3. How we use information">
          We use information to operate the platform, match physicians and employers, communicate with you, comply with legal
          obligations, and improve our services. We never sell your personal information.
        </Section>
        <Section title="4. Sharing">
          Physician profiles are shared with employers only when you apply to a posting or opt-in to be discoverable. We use
          carefully selected service providers (hosting, email, analytics) bound by contract to protect your data.
        </Section>
        <Section title="5. Storage and retention">
          Data is stored on Canadian servers where possible. We retain your information for as long as your account is active
          and as required to comply with legal obligations. You may request deletion at any time.
        </Section>
        <Section title="6. Your rights">
          You have the right to access, correct, and delete your personal information, withdraw consent, and lodge a complaint
          with the Office of the Privacy Commissioner of Canada. Email <a className="text-primary underline" href="mailto:privacy@CanadianMdJobs.ca">privacy@CanadianMdJobs.ca</a>.
        </Section>
        <Section title="7. Cookies">
          We use essential cookies for authentication and analytics cookies to understand usage. You can manage cookie preferences
          in your browser settings.
        </Section>
        <Section title="8. Changes">
          We will notify registered users of any material changes to this policy by email at least 14 days before they take effect.
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <p className="mt-2 leading-relaxed">{children}</p>
    </section>
  );
}
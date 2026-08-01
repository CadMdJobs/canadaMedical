import { createFileRoute } from "@tanstack/react-router";
import { Star, Quote } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";

export const Route = createFileRoute("/testimonials")({
  head: () => ({ meta: [{ title: "Physician Testimonials — CanadianMdJobs" }] }),
  component: TestimonialsPage,
});

const items = [
  { name: "Dr. Sarah Mitchell", role: "Family Physician — Calgary, AB", quote: "CanadianMdJobs helped me transition from a busy Toronto hospital to a rewarding rural practice. The team handled every detail — from licensing to housing referrals." },
  { name: "Dr. Rajiv Patel", role: "Cardiologist — Vancouver, BC", quote: "Within three weeks of registering, I had four interviews lined up — all matching exactly what I was looking for in compensation and lifestyle." },
  { name: "Dr. Amélie Dubois", role: "Anesthesiologist — Montreal, QC", quote: "As an internationally trained physician, the licensing guidance alone was worth it. Truly a partner, not a portal." },
  { name: "Dr. Michael O'Brien", role: "Emergency Medicine — Halifax, NS", quote: "I joined a phenomenal ER team at a hospital I would have never discovered on my own. The recruiter advocated for me throughout." },
  { name: "Dr. Priya Singh", role: "Pediatrician — Toronto, ON", quote: "Professional, fast and respectful of my schedule. The whole experience felt human, not transactional." },
  { name: "Dr. James Wong", role: "General Surgeon — Edmonton, AB", quote: "After 12 years in academic medicine, CanadianMdJobs helped me find a community hospital that fit my new chapter perfectly." },
];

function TestimonialsPage() {
  return (
    <div>
      <PageHeader eyebrow="Voices" title="Stories from physicians across Canada" subtitle="Real experiences from doctors who found their next chapter through CanadianMdJobs." />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:py-16 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <figure key={t.name} className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <Quote className="absolute right-5 top-5 h-8 w-8 text-accent/30" />
              <div className="flex gap-1 text-accent">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
              </div>
              <blockquote className="mt-4 flex-1 text-foreground/85">"{t.quote}"</blockquote>
              <figcaption className="mt-6 border-t border-border pt-4">
                <div className="font-semibold text-primary">{t.name}</div>
                <div className="text-sm text-muted-foreground">{t.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
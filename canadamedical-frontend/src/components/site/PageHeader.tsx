/**
 * Simple hero for the secondary pages (contact, privacy, testimonials).
 *
 * Deliberately the same flat navy as the assessment and FAQ heroes rather than
 * its own treatment: this used to layer a mesh gradient over the navy and fade
 * the bottom 8rem into the page background, which read as a grey smudge across
 * the lower third and matched nothing else on the site.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="bg-[#0f1f3d]">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:py-20 lg:px-8">
        {eyebrow && (
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full bg-[#1a6fd4]/20 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7eb3f5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7eb3f5]" /> {eyebrow}
          </span>
        )}
        <h1
          className="animate-fade-up mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl"
          style={{ animationDelay: "60ms" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="animate-fade-up mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300"
            style={{ animationDelay: "120ms" }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { Linkedin, Facebook, Instagram, Youtube } from "lucide-react";
import { Logo } from "@/components/site/Logo";

const sections = [
  {
    title: "For Physicians",
    links: [
      { to: "/jobs", label: "Find a Job" },
      { to: "/assessment", label: "Career Assessment" },
      { to: "/register/physician", label: "Upload Resume" },
      { to: "/jobs", label: "Job Alerts" },
      { to: "/about", label: "Resources" },
      { to: "/faq", label: "Licensure Guide" },
    ],
  },
  {
    title: "For Employers",
    links: [
      { to: "/employers", label: "Post a Job" },
      { to: "/employers", label: "Search Physicians" },
      { to: "/employers", label: "Recruiter Solutions" },
      { to: "/pricing", label: "Pricing" },
      { to: "/login", label: "Employer Login" },
    ],
  },
  {
    title: "Specialties",
    links: [
      { to: "/jobs", label: "All Specialties" },
      { to: "/jobs", label: "Popular Specialties" },
      { to: "/jobs", label: "Subspecialties" },
      { to: "/jobs", label: "Niche Specialties" },
    ],
  },
  {
    title: "Resources",
    links: [
      { to: "/faq", label: "FAQ" },
      { to: "/about", label: "Hiring Guide" },
      { to: "/about", label: "Market Insights" },
      { to: "/about", label: "Salary Guide" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About Us" },
      { to: "/testimonials", label: "Testimonials" },
      { to: "/about", label: "Careers" },
      { to: "/about", label: "Blog" },
      { to: "/contact", label: "Contact Us" },
    ],
  },
];

const SOCIALS = [
  { Icon: Linkedin, label: "LinkedIn" },
  { Icon: Facebook, label: "Facebook" },
  { Icon: Instagram, label: "Instagram" },
  { Icon: Youtube, label: "YouTube" },
];

export function Footer() {
  return (
    <footer className="bg-[#0f1f3d] text-white">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-8 lg:px-8 lg:pt-16">

        {/* ── Top row: brand + nav columns ── */}
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">

          {/* Brand */}
          <div>
            <div className="[&_a]:text-white [&_img]:brightness-0 [&_img]:invert">
              <Logo size="lg" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/55 max-w-50">
              Canada's trusted physician recruitment platform connecting exceptional physicians with outstanding healthcare opportunities across Canada.
            </p>
            {/* Social icons */}
            <div className="mt-6 flex items-center gap-2">
              {SOCIALS.map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:border-white/30 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map((s) => (
              <div key={s.title}>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 mb-3">
                  {s.title}
                </h4>
                <ul className="space-y-2">
                  {s.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        to={l.to}
                        className="text-sm text-white/65 transition hover:text-white"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="mt-12 flex flex-col gap-3 border-t border-white/8 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CanadianMdJobs. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/privacy" className="transition hover:text-white">Privacy Policy</Link>
            <Link to="/terms" className="transition hover:text-white">Terms of Service</Link>
            <Link to="/privacy" className="transition hover:text-white">Cookie Policy</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}

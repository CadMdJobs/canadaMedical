import { Link } from "@tanstack/react-router";
import logoImg from "@/Images/CanadianMDJobs Logo.webp";

export function Logo({
  inverse = false,
  size = "md",
}: {
  inverse?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const heights: Record<string, string> = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
  };

  return (
    <Link
      to="/"
      className="group inline-flex items-center shrink-0"
      aria-label="CanadianMdJobs home"
    >
      {/* On dark backgrounds (inverse) wrap in a semi-transparent white pill so
          the coloured logo remains readable */}
      <span
        className={`inline-flex items-center rounded-xl transition-opacity group-hover:opacity-90 ${
          inverse
            ? "bg-white/90 px-2.5 py-1 shadow-sm"
            : ""
        }`}
      >
        <img
          src={logoImg}
          alt="CanadianMdJobs"
          className={`${heights[size]} w-auto object-contain`}
          draggable={false}
        />
      </span>
    </Link>
  );
}

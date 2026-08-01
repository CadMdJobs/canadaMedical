import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { Link } from "@tanstack/react-router";
import { Building2, MapPin, Briefcase, ArrowRight } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { ErrorState } from "@/components/site/QueryState";

interface FeaturedRecruiter {
  id: number | string;
  name: string;
  logo?: string;
  location?: string;
  province?: string;
  open_jobs?: number;
  jobs_count?: number;
  description?: string;
  specialties?: string[];
}

function useFeaturedRecruiters() {
  return useQuery({
    queryKey: ["featured-recruiters"],
    queryFn: async () => {
      const res = await api.get<FeaturedRecruiter[] | { results: FeaturedRecruiter[] }>(
        "/api/jobs/featured-recruiters/",
      );
      const data = res.data;
      return Array.isArray(data) ? data : data.results ?? [];
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    staleTime: 1000 * 60 * 5,
  });
}

const FALLBACK: FeaturedRecruiter[] = [
  { id: "tgh", name: "Vancouver Coastal Health", location: "Vancouver, BC", open_jobs: 34, description: "Community hospitals, clinics & research" },
  { id: "stp", name: "St. Paul's Hospital", location: "Vancouver, BC", open_jobs: 31, description: "Leading in research & education" },
  { id: "csj", name: "OCH Regional Health", location: "Ottawa, Ontario", open_jobs: 14, description: "Community hospitals and specialized care." },
  { id: "ral", name: "Alberta Health Services", location: "Edmonton, AB", open_jobs: 34, description: "Large health network & hospitals across Alberta." },
];

export function FeaturedRecruiters() {
  const { data, isLoading, isError, error, refetch, isFetching } = useFeaturedRecruiters();
  useEffect(() => {
    if (isError) toast.error(`Featured employers: ${apiError(error)}`, { id: "feat-rec-err" });
  }, [isError, error]);
  const recruiters = (!isError && data && data.length > 0 ? data : FALLBACK).slice(0, 4);

  return (
    <section className="bg-[#f8faff]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a6fd4]">Featured Employers</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0f1f3d] sm:text-4xl">
              Hospitals &amp; clinics hiring now
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Canada's leading healthcare organisations are actively recruiting through CanadianMdJobs.
            </p>
          </div>
          <Link to="/jobs" className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-[#1a6fd4] shrink-0">
            View all employers <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-100 bg-white" />
              ))
            : recruiters.map((r) => (
                <article
                  key={r.id}
                  className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1a6fd4]/20 hover:shadow-lg"
                >
                  {/* Logo / icon */}
                  <div className="flex items-center gap-3 mb-3">
                    {r.logo ? (
                      <img src={r.logo} alt={r.name} loading="lazy" className="h-10 w-10 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4]/10">
                        <Building2 className="h-5 w-5 text-[#1a6fd4]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-[#0f1f3d]">{r.name}</h3>
                      {r.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="h-3 w-3" /> {r.location}
                        </p>
                      )}
                    </div>
                  </div>

                  {r.description && (
                    <p className="flex-1 text-xs leading-relaxed text-slate-500 line-clamp-2">{r.description}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <Briefcase className="h-3 w-3" />
                      {(r.open_jobs ?? r.jobs_count ?? 0)} open roles
                    </span>
                    <Link
                      to="/jobs"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-[#1a6fd4] hover:text-[#1a6fd4]"
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </article>
              ))}
        </div>

        {isError && (
          <div className="mt-6">
            <ErrorState
              error={error}
              title="Couldn't load featured employers"
              onRetry={() => refetch()}
            />
            {isFetching && (
              <p className="mt-2 text-xs text-slate-400">Retrying…</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

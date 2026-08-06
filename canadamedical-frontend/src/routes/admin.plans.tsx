import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { AlertTriangle, Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Modal } from "@/components/admin/Modal";
import { Field, Input, SubmitButton } from "@/components/site/Form";

export const Route = createFileRoute("/admin/plans")({
  component: AdminPlansPage,
});

interface Plan {
  id: number;
  name: string;
  plan_type: string;
  price_monthly: string;
  is_free: boolean;
  is_enterprise: boolean;
  is_popular: boolean;
  job_post_limit: number | null;
  features: string[];
  order: number;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  stripe_price_id_annual: string | null;
  subscriber_count: number;
  stripe_in_sync: boolean;
  annual_discount_percent: number;
  annual_monthly_equivalent: string;
  price_annual_total: string;
}

// job_post_limit is deliberately a string in the form: an empty input means
// "unlimited" (null), which a numeric field cannot express.
const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    price_monthly: z.coerce.number().min(0, "Price cannot be negative"),
    annual_discount_percent: z.coerce
      .number()
      .min(0, "Discount cannot be negative")
      // Matches the server cap: a 100% discount is a zero-amount recurring
      // price, which Stripe refuses to create.
      .max(90, "Discount cannot exceed 90%"),
    job_post_limit: z.string().optional(),
    order: z.coerce.number().min(0),
    is_free: z.boolean().optional(),
    is_enterprise: z.boolean().optional(),
    is_popular: z.boolean().optional(),
    features: z.array(z.object({ value: z.string().min(1, "Feature cannot be empty") })),
  })
  .refine((v) => !(v.is_free && v.is_enterprise), {
    message: "A plan cannot be both free and enterprise",
    path: ["is_enterprise"],
  })
  .refine((v) => !(v.is_free && v.price_monthly > 0), {
    message: "A free plan must have a price of 0",
    path: ["price_monthly"],
  })
  .refine((v) => v.is_free || v.is_enterprise || v.price_monthly > 0, {
    message: "A paid plan needs a price above 0",
    path: ["price_monthly"],
  })
  .refine((v) => !(v.annual_discount_percent > 0 && (v.is_free || v.is_enterprise)), {
    message: "Only a paid plan can carry an annual discount",
    path: ["annual_discount_percent"],
  });
type FormInput = z.infer<typeof schema>;

function AdminPlansPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const r = await api.get("/api/admin/plans/");
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
  });
  const rows: Plan[] = data ?? [];

  const save = useMutation({
    mutationFn: async (input: FormInput & { id?: number }) => {
      const { features, job_post_limit, id, ...rest } = input;
      const payload = {
        ...rest,
        features: features.map((f) => f.value),
        job_post_limit: job_post_limit?.trim() ? Number(job_post_limit) : null,
      };
      if (id) return (await api.put(`/api/admin/plans/${id}/`, payload)).data;
      return (await api.post("/api/admin/plans/", payload)).data;
    },
    onSuccess: (res) => {
      // The API returns a warning when the price moved out of step with
      // Stripe — surface it rather than a generic "Saved".
      toast.success(res?.message ?? "Saved");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/admin/plans/${id}/`),
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const sync = useMutation({
    mutationFn: async (id: number) => (await api.post(`/api/admin/plans/${id}/sync-stripe/`)).data,
    onSuccess: (res) => {
      toast.success(res?.message ?? "Synced to Stripe");
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const outOfSync = rows.filter((r) => !r.stripe_in_sync);

  const columns: Column<Plan>[] = [
    {
      key: "name",
      header: "Plan",
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.name}</span>
          {r.is_popular && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              Popular
            </span>
          )}
        </div>
      ),
    },
    {
      key: "price_monthly",
      header: "Price",
      sortable: true,
      render: (r) =>
        r.is_enterprise ? (
          <span className="text-muted-foreground">Custom</span>
        ) : (
          <span className="font-semibold">${Number(r.price_monthly).toFixed(0)}/mo</span>
        ),
    },
    {
      key: "annual_discount_percent",
      header: "Annual",
      render: (r) =>
        r.annual_discount_percent > 0 && !r.is_free && !r.is_enterprise ? (
          <div className="leading-tight">
            <span className="font-semibold text-emerald-600">
              {r.annual_discount_percent}% off
            </span>
            <div className="text-[11px] text-muted-foreground">
              ${Number(r.annual_monthly_equivalent).toFixed(0)}/mo · $
              {Number(r.price_annual_total).toFixed(0)}/yr
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "job_post_limit",
      header: "Job posts",
      render: (r) => (r.job_post_limit === null ? "Unlimited" : r.job_post_limit),
    },
    {
      key: "subscriber_count",
      header: "Subscribers",
      sortable: true,
      render: (r) => (
        <span className={r.subscriber_count > 0 ? "font-semibold" : "text-muted-foreground"}>
          {r.subscriber_count}
        </span>
      ),
    },
    {
      key: "stripe_in_sync",
      header: "Stripe",
      render: (r) =>
        r.is_free || r.is_enterprise ? (
          <span className="text-xs text-muted-foreground">Not billed</span>
        ) : r.stripe_in_sync ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Linked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <X className="h-3.5 w-3.5" /> Not linked
          </span>
        ),
    },
    { key: "order", header: "Order", sortable: true },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {!r.is_free && !r.is_enterprise && (
            <button
              onClick={() => sync.mutate(r.id)}
              disabled={sync.isPending}
              className="rounded-md border border-border p-1.5 hover:bg-secondary disabled:opacity-50"
              title="Create a Stripe price matching this plan"
            >
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => {
              setEditing(r);
              setOpen(true);
            }}
            className="rounded-md border border-border p-1.5 hover:bg-secondary"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const warning =
                r.subscriber_count > 0
                  ? `${r.name} has ${r.subscriber_count} active subscriber(s) and cannot be deleted. Continue anyway?`
                  : `Delete the ${r.name} plan?`;
              if (confirm(warning)) del.mutate(r.id);
            }}
            className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Pricing Plans</h1>
          <p className="text-sm text-muted-foreground">
            Prices, features and posting limits shown on the public pricing page.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-glow"
        >
          <Plus className="h-4 w-4" /> New Plan
        </button>
      </div>

      {outOfSync.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {outOfSync.length} paid plan{outOfSync.length > 1 ? "s are" : " is"} not linked to Stripe
            </p>
            <p className="mt-1">
              Checkout is disabled for {outOfSync.length > 1 ? "these plans" : "this plan"} until you
              sync {outOfSync.length > 1 ? "them" : "it"}. Editing a price here changes what visitors
              see; the sync button is what changes what they are charged.
            </p>
          </div>
        </div>
      )}

      <AdminTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        rowKey={(r) => r.id}
        searchKeys={["name"]}
        exportName="plans.csv"
      />

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.name}` : "New Plan"}
        size="lg"
      >
        <PlanForm
          key={editing?.id ?? "new"}
          initial={editing}
          submitting={save.isPending}
          onSubmit={(v) => save.mutate({ ...v, id: editing?.id })}
        />
      </Modal>
    </div>
  );
}

function PlanForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial: Plan | null;
  onSubmit: (v: FormInput) => void;
  submitting?: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      price_monthly: initial ? Number(initial.price_monthly) : 0,
      annual_discount_percent: initial?.annual_discount_percent ?? 0,
      job_post_limit:
        initial?.job_post_limit === null || initial?.job_post_limit === undefined
          ? ""
          : String(initial.job_post_limit),
      order: initial?.order ?? 0,
      is_free: initial?.is_free ?? false,
      is_enterprise: initial?.is_enterprise ?? false,
      is_popular: initial?.is_popular ?? false,
      features: (initial?.features ?? []).map((value) => ({ value })),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "features" });
  const isFree = watch("is_free");
  const isEnterprise = watch("is_enterprise");
  const monthly = Number(watch("price_monthly")) || 0;
  const discount = Number(watch("annual_discount_percent")) || 0;

  // Mirrors SubscriptionPlan.annual_monthly_equivalent so the preview matches
  // what the server will store and what Stripe will be told to charge.
  const annualMonthly = discount > 0 ? (monthly * (100 - discount)) / 100 : monthly;
  const annualTotal = annualMonthly * 12;
  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

  const priceChanged =
    initial && !initial.is_free && !initial.is_enterprise &&
    (monthly !== Number(initial.price_monthly) ||
      discount !== initial.annual_discount_percent);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" required>
          <Input {...register("name")} />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
        </Field>
        <Field label="Price per month (USD)" required>
          <Input type="number" step="1" min="0" disabled={isFree || isEnterprise} {...register("price_monthly")} />
          {errors.price_monthly && (
            <p className="mt-1 text-xs text-destructive">{errors.price_monthly.message}</p>
          )}
        </Field>
      </div>

      <Field label="Annual discount (%)">
        <Input
          type="number"
          step="1"
          min="0"
          max="90"
          disabled={isFree || isEnterprise}
          {...register("annual_discount_percent")}
        />
        {errors.annual_discount_percent ? (
          <p className="mt-1 text-xs text-destructive">
            {errors.annual_discount_percent.message}
          </p>
        ) : discount > 0 && !isFree && !isEnterprise ? (
          <p className="mt-1 text-xs text-emerald-600">
            Shows as {fmt(annualMonthly)}/mo with {fmt(monthly)} struck through — billed{" "}
            {fmt(annualTotal)} once a year.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            0 hides the annual option and sells this plan monthly only.
          </p>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job post limit">
          <Input type="number" min="0" placeholder="Leave blank for unlimited" {...register("job_post_limit")} />
          <p className="mt-1 text-xs text-muted-foreground">Blank means unlimited.</p>
        </Field>
        <Field label="Display order">
          <Input type="number" min="0" {...register("order")} />
          <p className="mt-1 text-xs text-muted-foreground">Lower numbers appear first.</p>
        </Field>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Features</span>
          <button
            type="button"
            onClick={() => append({ value: "" })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No features yet. These appear as the ticked list on the pricing card.
          </p>
        )}
        {fields.map((field, i) => (
          <div key={field.id} className="flex gap-2">
            <Input {...register(`features.${i}.value` as const)} placeholder="e.g. 5 Active Job Postings" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 rounded-md border border-border p-2 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {errors.features && (
          <p className="text-xs text-destructive">Features cannot be empty.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_free")} className="h-4 w-4 rounded border-border" />
          Free plan
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_enterprise")} className="h-4 w-4 rounded border-border" />
          Enterprise (custom quote)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_popular")} className="h-4 w-4 rounded border-border" />
          Highlight as "Most Popular"
        </label>
      </div>
      {errors.is_enterprise && (
        <p className="text-xs text-destructive">{errors.is_enterprise.message}</p>
      )}

      {priceChanged && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Saving updates what visitors see. Checkout keeps charging the old rate
            {initial && ` ($${Number(initial.price_monthly).toFixed(0)}/mo`}
            {initial && initial.annual_discount_percent > 0 &&
              `, ${initial.annual_discount_percent}% off yearly`}
            {initial && ")"} until you press the sync button on this plan.
            {initial && initial.subscriber_count > 0 && (
              <> Existing subscribers stay on their current price either way.</>
            )}
          </span>
        </div>
      )}

      <SubmitButton loading={submitting}>{initial ? "Update Plan" : "Create Plan"}</SubmitButton>
    </form>
  );
}

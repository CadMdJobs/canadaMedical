import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Mail, Trash2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Modal } from "@/components/admin/Modal";

export const Route = createFileRoute("/admin/contacts")({
  component: AdminContactsPage,
});

// Field names follow the API exactly. They used to be guessed — name/created_at
// against the server's full_name/submitted_at — which left the From and Date
// columns blank and the message body empty in the reader.
interface Contact {
  id: number;
  full_name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  status: "new" | "read" | "replied";
  submitted_at?: string;
}

const STATUSES = ["new", "read", "replied"] as const;

const STATUS_STYLE: Record<Contact["status"], string> = {
  new: "border-blue-300 bg-blue-50 text-blue-700",
  read: "border-amber-300 bg-amber-50 text-amber-800",
  replied: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

function AdminContactsPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "contacts"],
    queryFn: async () => { const r = await api.get("/api/admin/contacts/"); const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.results ?? []); },
  });
  const rows: Contact[] = data ?? [];

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Contact["status"] }) =>
      (await api.patch(`/api/admin/contacts/${id}/`, { status })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "contacts"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/admin/contacts/${id}/`),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "contacts"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  /** Open the reader, and mark an unread enquiry as read while doing so. */
  function open(r: Contact) {
    setView(r);
    if (r.status === "new") update.mutate({ id: r.id, status: "read" });
  }

  const columns: Column<Contact>[] = [
    { key: "full_name", header: "From", sortable: true, render: (r) => (
      <div>
        <div className={`text-foreground ${r.status === "new" ? "font-bold" : "font-medium"}`}>
          {r.full_name}
        </div>
        <div className="text-xs text-muted-foreground">{r.email}</div>
      </div>
    ) },
    { key: "subject", header: "Subject", sortable: true, render: (r) => (
      <button onClick={() => open(r)} className="max-w-md text-left hover:underline">
        <div className={r.status === "new" ? "font-semibold text-foreground" : "text-foreground"}>
          {r.subject || "(no subject)"}
        </div>
        {/* One line of the message, so the list is scannable without opening
            each row. */}
        <div className="truncate text-xs text-muted-foreground">{r.message}</div>
      </button>
    ) },
    { key: "submitted_at", header: "Date", sortable: true, render: (r) => (
      r.submitted_at
        ? <span title={new Date(r.submitted_at).toLocaleString()}>
            {new Date(r.submitted_at).toLocaleDateString()}
          </span>
        : "—"
    ) },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <select
          value={r.status}
          onChange={(e) => update.mutate({ id: r.id, status: e.target.value as Contact["status"] })}
          className={`rounded-md border px-2 py-1 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}
        >
          {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => open(r)}
            title="Read message"
            className="rounded-md border border-border p-1.5 hover:bg-secondary"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            onClick={() => confirm("Delete message?") && del.mutate(r.id)}
            title="Delete"
            className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Contact Inquiries</h1>
        <p className="text-sm text-muted-foreground">Messages submitted via the public contact form.</p>
      </header>
      <AdminTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        rowKey={(r) => r.id}
        searchKeys={["full_name", "email", "subject", "message"]}
        exportName="contacts.csv"
      />

      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject || "Message"} size="lg">
        {view && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="font-semibold text-foreground">{view.full_name}</p>
                <p className="text-muted-foreground">{view.email}</p>
                {view.phone && <p className="text-muted-foreground">{view.phone}</p>}
              </div>
              {view.submitted_at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(view.submitted_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* whitespace-pre-wrap keeps the sender's own line breaks; the
                message arrives as plain text, never HTML. */}
            <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-md bg-secondary/50 p-4 leading-relaxed text-foreground/90">
              {view.message}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <a
                href={`mailto:${view.email}?subject=${encodeURIComponent(`Re: ${view.subject ?? "Your inquiry"}`)}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-glow"
              >
                <Mail className="h-4 w-4" /> Reply via email
              </a>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Status
                <select
                  value={view.status}
                  onChange={(e) => {
                    const status = e.target.value as Contact["status"];
                    setView({ ...view, status });
                    update.mutate({ id: view.id, status });
                  }}
                  className={`rounded-md border px-2 py-1 text-xs font-medium capitalize ${STATUS_STYLE[view.status]}`}
                >
                  {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
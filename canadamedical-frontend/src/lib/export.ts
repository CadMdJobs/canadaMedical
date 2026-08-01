import { format } from "date-fns";

export interface ExportRow {
  id: number;
  title: string;
  employer: string | undefined;
  specialty: string | undefined;
  province: string | undefined;
  city: string | undefined;
  job_type: string | undefined;
  practice_setting: string | undefined;
  status: string | undefined;
  salary: string | undefined;
  applications: number;
  views: number;
  remote: string;
  relocation: string;
  posted: string;
  approved: string;
  rejected: string;
}

export function buildExportRows(rows: {
  id: number;
  title: string;
  employer_name?: string;
  specialty_display?: string;
  specialty?: string;
  province_display?: string;
  province?: string;
  city?: string;
  job_type_display?: string;
  job_type?: string;
  practice_setting_display?: string;
  practice_setting?: string;
  status_label?: string;
  salary_display?: string;
  total_applications?: number;
  views_count?: number;
  remote_option?: boolean;
  relocation_assistance?: boolean;
  created_at?: string;
  approved_at?: string;
  rejected_at?: string;
}[]): ExportRow[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    employer: r.employer_name,
    specialty: r.specialty_display || r.specialty,
    province: r.province_display || r.province,
    city: r.city,
    job_type: r.job_type_display || r.job_type,
    practice_setting: r.practice_setting_display || r.practice_setting,
    status: r.status_label,
    salary: r.salary_display,
    applications: r.total_applications ?? 0,
    views: r.views_count ?? 0,
    remote: r.remote_option ? "Yes" : "No",
    relocation: r.relocation_assistance ? "Yes" : "No",
    posted: r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd") : "",
    approved: r.approved_at ? format(new Date(r.approved_at), "yyyy-MM-dd") : "",
    rejected: r.rejected_at ? format(new Date(r.rejected_at), "yyyy-MM-dd") : "",
  }));
}

const HEADERS: { key: keyof ExportRow; label: string }[] = [
  { key: "id",               label: "ID" },
  { key: "title",            label: "Job Title" },
  { key: "employer",         label: "Employer" },
  { key: "specialty",        label: "Specialty" },
  { key: "province",         label: "Province" },
  { key: "city",             label: "City" },
  { key: "job_type",         label: "Job Type" },
  { key: "practice_setting", label: "Practice Setting" },
  { key: "status",           label: "Status" },
  { key: "salary",           label: "Salary" },
  { key: "applications",     label: "Applications" },
  { key: "views",            label: "Views" },
  { key: "remote",           label: "Remote" },
  { key: "relocation",       label: "Relocation" },
  { key: "posted",           label: "Posted Date" },
  { key: "approved",         label: "Approved Date" },
  { key: "rejected",         label: "Rejected Date" },
];

// ── CSV ────────────────────────────────────────────────────────────────────────

export function exportCsv(filename: string, rows: ExportRow[]) {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    HEADERS.map((h) => escape(h.label)).join(","),
    ...rows.map((r) => HEADERS.map((h) => escape(r[h.key])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ── XLSX ───────────────────────────────────────────────────────────────────────

export async function exportXlsx(filename: string, rows: ExportRow[]) {
  const XLSX = await import("xlsx");
  const wsData = [
    HEADERS.map((h) => h.label),
    ...rows.map((r) => HEADERS.map((h) => r[h.key] ?? "")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = HEADERS.map((h) =>
    ["title", "employer"].includes(h.key) ? { wch: 35 } :
    ["specialty", "job_type", "practice_setting", "salary"].includes(h.key) ? { wch: 22 } :
    { wch: 14 }
  );

  // Style header row bold (xlsx doesn't natively support styles without xlsx-style — skip)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jobs");
  XLSX.writeFile(wb, filename);
}

// ── PDF ────────────────────────────────────────────────────────────────────────

export async function exportPdf(
  filename: string,
  rows: ExportRow[],
  meta: { total: number; filters: string }
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

  // ── Cover header ──────────────────────────────────────────────────────────
  // Background strip
  doc.setFillColor(22, 78, 99); // slate-800
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Canadian Medical Staffing", 12, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Job Postings Export Report", 12, 16);

  doc.setFontSize(8);
  doc.text(`Generated: ${now}`, pageW - 12, 10, { align: "right" });
  doc.text(`Total records: ${meta.total}`, pageW - 12, 16, { align: "right" });

  // ── Sub-header meta row ───────────────────────────────────────────────────
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(0, 22, pageW, 10, "F");
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(meta.filters || "No filters applied", 12, 28);

  // ── Visible columns (subset for PDF readability) ─────────────────────────
  const pdfCols = [
    { key: "id",           label: "ID",          width: 10 },
    { key: "title",        label: "Job Title",   width: 52 },
    { key: "employer",     label: "Employer",    width: 40 },
    { key: "specialty",    label: "Specialty",   width: 28 },
    { key: "province",     label: "Province",    width: 18 },
    { key: "job_type",     label: "Type",        width: 18 },
    { key: "status",       label: "Status",      width: 18 },
    { key: "applications", label: "Apps",        width: 14 },
    { key: "views",        label: "Views",       width: 14 },
    { key: "posted",       label: "Posted",      width: 22 },
  ] as const;

  const statusColors: Record<string, [number, number, number]> = {
    Active:   [209, 250, 229],
    Pending:  [254, 243, 199],
    Rejected: [254, 226, 226],
    Inactive: [241, 245, 249],
  };

  autoTable(doc, {
    startY: 34,
    head: [pdfCols.map((c) => c.label)],
    body: rows.map((r) =>
      pdfCols.map((c) => {
        const val = r[c.key as keyof ExportRow];
        return val == null ? "" : String(val);
      })
    ),
    columnStyles: Object.fromEntries(
      pdfCols.map((c, i) => [i, { cellWidth: c.width }])
    ),
    headStyles: {
      fillColor: [22, 78, 99],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 6) {
        const status = String(data.cell.text[0] || "");
        const color = statusColors[status];
        if (color) data.cell.styles.fillColor = color;
      }
    },
    margin: { left: 10, right: 10 },
    styles: { overflow: "ellipsize" },
    // Footer
    didDrawPage(pageData) {
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${pageData.pageNumber} of ${pageCount} · canadamedicalstaffing.com`,
        pageW / 2,
        h - 5,
        { align: "center" }
      );
    },
  });

  doc.save(filename);
}

// ── helper ─────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

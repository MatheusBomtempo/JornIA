import { STATUS_LABELS, type PostStatus } from "@/lib/domain";

const COLORS: Record<string, string> = {
  processing_ai: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25",
  editing_art: "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/25",
  in_review: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/25",
  approved: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
  publishing: "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/25",
  published: "bg-emerald-500 text-white",
  rejected: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25",
  failed: "bg-red-500/20 text-red-200 ring-1 ring-inset ring-red-500/40",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as PostStatus] ?? status;
  const color = COLORS[status] ?? "bg-line text-muted";
  return <span className={`badge ${color}`}>{label}</span>;
}

import { STATUS_LABELS, type PostStatus } from "@/lib/domain";

const COLORS: Record<string, string> = {
  processing_ai: "bg-amber-100 text-amber-800",
  editing_art: "bg-blue-100 text-blue-800",
  in_review: "bg-violet-100 text-violet-800",
  approved: "bg-emerald-100 text-emerald-800",
  publishing: "bg-cyan-100 text-cyan-800",
  published: "bg-emerald-600 text-white",
  rejected: "bg-red-100 text-red-800",
  failed: "bg-red-600 text-white",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as PostStatus] ?? status;
  const color = COLORS[status] ?? "bg-gray-100 text-gray-700";
  return <span className={`badge ${color}`}>{label}</span>;
}

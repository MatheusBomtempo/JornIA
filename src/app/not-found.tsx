import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-3xl font-extrabold tracking-tight">
        Jorn<span className="text-brand-400">IA</span>
      </div>
      <p className="text-muted">Página não encontrada.</p>
      <Link href="/dashboard" className="btn-primary">
        Voltar ao feed
      </Link>
    </div>
  );
}

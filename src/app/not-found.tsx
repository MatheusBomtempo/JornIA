import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-3xl font-bold tracking-tight">
        Jorn<span className="text-brand-600">IA</span>
      </div>
      <p className="text-gray-500">Página não encontrada.</p>
      <Link href="/dashboard" className="btn-primary">
        Voltar ao feed
      </Link>
    </div>
  );
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listPosts, listAuditLogs } from "@/lib/services/posts";
import { maybeCleanupExpiredPosts } from "@/lib/services/retention";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { DeletePostButton } from "@/components/DeletePostButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Precisa terminar ANTES de ler posts/log em paralelo — senão a leitura
  // do log pode correr antes da linha ser inserida pela própria limpeza.
  await maybeCleanupExpiredPosts();
  const [posts, auditLogs] = await Promise.all([listPosts(), listAuditLogs()]);

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <div className="alert-info mb-5">
        🎬 Em breve: suporte a <strong>vídeos</strong>, além de foto — mesma
        proposta, novo formato de post.
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Feed de pautas</h1>
          <p className="text-sm text-muted">
            {posts.length} {posts.length === 1 ? "post" : "posts"} no fluxo
          </p>
        </div>
        <Link href="/capture" className="btn-primary shrink-0">
          + Nova pauta
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-3xl" aria-hidden>📰</p>
          <p className="mt-3 font-medium">Nenhuma pauta ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Cole um texto ou um link, anexe a foto e a IA monta o post pra você.
          </p>
          <Link href="/capture" className="btn-primary mt-5 inline-flex">
            Criar a primeira pauta
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const v = post.versions[0];
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="card group relative overflow-hidden transition-colors hover:border-brand-500/50"
              >
                {(user.role === "admin" ||
                  user.role === "manager" ||
                  post.author.id === user.id) && (
                  <DeletePostButton postId={post.id} />
                )}
                <div className="aspect-square bg-black">
                  {v?.renderedArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.renderedArtUrl}
                      alt={v.title ?? "Arte do post"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
                      arte ainda não gerada
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <StatusBadge status={post.status} />
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {v?.title ?? "(sem título)"}
                  </p>
                  <p className="text-xs text-faint">
                    {post.author.name} ·{" "}
                    {new Date(post.updatedAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {auditLogs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-muted">
            Publicações removidas automaticamente
          </h2>
          <p className="hint mb-3 mt-0">
            Limpeza de retenção: posts publicados somem do banco 2 dias depois
            (o post no Instagram continua no ar); em revisão ou falhos que
            passam 3 dias sem aprovação também saem. Fica só este registro
            básico, pra auditoria futura.
          </p>
          <div className="card divide-y divide-lineSoft">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusBadge status={log.status} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {log.title ?? "(sem título)"}
                    </p>
                    <p className="text-xs text-faint">{log.authorName}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {new Date(log.createdAt).toLocaleDateString("pt-BR")} → apagado{" "}
                  {new Date(log.purgedAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

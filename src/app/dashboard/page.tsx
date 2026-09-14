import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/services/posts";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const posts = await listPosts();

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
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
                className="card group overflow-hidden transition-colors hover:border-brand-500/50"
              >
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
    </AppShell>
  );
}

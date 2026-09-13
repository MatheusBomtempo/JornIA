import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/services/posts";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null; // middleware já redireciona

  const posts = await listPosts();

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Feed de pautas</h1>
          <p className="text-sm text-gray-500">
            {posts.length} {posts.length === 1 ? "post" : "posts"} no fluxo
          </p>
        </div>
        <Link href="/capture" className="btn-primary">
          + Nova pauta
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          Nenhuma pauta ainda. Comece enviando uma foto, texto ou link em{" "}
          <Link href="/capture" className="text-brand-600 underline">
            Nova pauta
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const v = post.versions[0];
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="card overflow-hidden transition hover:shadow-md"
              >
                <div className="aspect-square bg-gray-100">
                  {v?.renderedArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.renderedArtUrl}
                      alt={v.title ?? "Arte"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      arte ainda não renderizada
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <StatusBadge status={post.status} />
                  <div className="line-clamp-2 text-sm font-medium">
                    {v?.title ?? "(sem título)"}
                  </div>
                  <div className="text-xs text-gray-500">
                    por {post.author.name} ·{" "}
                    {new Date(post.updatedAt).toLocaleString("pt-BR")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

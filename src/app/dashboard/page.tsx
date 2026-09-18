import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listPosts, listAuditLogs } from "@/lib/services/posts";
import { maybeCleanupExpiredPosts } from "@/lib/services/retention";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { DeletePostButton } from "@/components/DeletePostButton";
import { CardQuickActions } from "@/components/CardQuickActions";
import { getServerDictionary } from "@/lib/i18n/server";
import { POST_STATUS } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return null;

  const { locale, dict } = await getServerDictionary();
  const dateLocale = locale === "pt" ? "pt-BR" : "en-US";

  // Precisa terminar ANTES de ler posts/log em paralelo — senão a leitura
  // do log pode correr antes da linha ser inserida pela própria limpeza.
  await maybeCleanupExpiredPosts();
  const [posts, auditLogs] = await Promise.all([
    listPosts(user.companyId),
    listAuditLogs(user.companyId),
  ]);

  return (
    <AppShell user={{ name: user.name, role: user.role, mustSetPassword: user.passwordResetAt !== null }}>
      <div className="alert-info mb-5">
        🎬 {dict.dashboard.videoBannerPrefix}
        <strong>{dict.dashboard.videoBannerBold}</strong>
        {dict.dashboard.videoBannerSuffix}
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{dict.dashboard.title}</h1>
          <p className="text-sm text-muted">
            {posts.length} {posts.length === 1 ? dict.dashboard.postCountOne : dict.dashboard.postCountOther}
          </p>
        </div>
        <Link href="/capture" className="btn-primary shrink-0">
          {dict.dashboard.newStory}
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-3xl" aria-hidden>📰</p>
          <p className="mt-3 font-medium">{dict.dashboard.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {dict.dashboard.emptyDescription}
          </p>
          <Link href="/capture" className="btn-primary mt-5 inline-flex">
            {dict.dashboard.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const v = post.versions[0];
            const isFinished =
              post.status === POST_STATUS.PUBLISHED || post.status === POST_STATUS.REJECTED;
            const isManagerOrAdmin = user.role === "admin" || user.role === "manager";
            const canReview =
              !isFinished &&
              (isManagerOrAdmin || (user.role === "staff" && post.author.id !== user.id));
            const alreadyApproved =
              v?.decisions.some((d) => d.reviewerId === user.id) ?? false;
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="card group relative overflow-hidden transition-colors hover:border-brand-500/50"
              >
                {canReview && v && (
                  <CardQuickActions
                    variant="overlay"
                    postId={post.id}
                    versionId={v.id}
                    hasArt={!!v.renderedArtUrl || !!v.renderedVideoUrl}
                    alreadyApproved={alreadyApproved}
                  />
                )}
                {(isManagerOrAdmin || post.author.id === user.id) && (
                  <DeletePostButton postId={post.id} />
                )}
                <div className="aspect-square bg-black">
                  {v?.renderedVideoUrl ? (
                    <video
                      src={v.renderedVideoUrl}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : v?.renderedArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.renderedArtUrl}
                      alt={v.title ?? dict.instagramPreview.artAlt}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
                      {dict.dashboard.artNotGenerated}
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <StatusBadge status={post.status} />
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {v?.title ?? dict.dashboard.untitled}
                  </p>
                  <p className="text-xs text-faint">
                    {post.author.name} ·{" "}
                    {new Date(post.updatedAt).toLocaleString(dateLocale, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {canReview && v && (
                    <CardQuickActions
                      variant="inline"
                      postId={post.id}
                      versionId={v.id}
                      hasArt={!!v.renderedArtUrl}
                      alreadyApproved={alreadyApproved}
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {auditLogs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-muted">
            {dict.dashboard.purgedSectionTitle}
          </h2>
          <p className="hint mb-3 mt-0">{dict.dashboard.purgedSectionHint}</p>
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
                      {log.title ?? dict.dashboard.untitled}
                    </p>
                    <p className="text-xs text-faint">{log.authorName}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {new Date(log.createdAt).toLocaleDateString(dateLocale)} →{" "}
                  {dict.dashboard.purgedAt}{" "}
                  {new Date(log.purgedAt).toLocaleDateString(dateLocale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

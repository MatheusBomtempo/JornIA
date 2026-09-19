import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPostDetail } from "@/lib/services/posts";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { PostWorkspace } from "@/components/PostWorkspace";
import type { EditorTemplate } from "@/components/ArtEditor";
import { sortTemplatesByFormat, type Credit } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return null;

  const { id } = await params;
  const post = await getPostDetail(id);
  if (!post || post.companyId !== user.companyId) notFound();

  const [templatesRaw, company] = await Promise.all([
    prisma.artTemplate.findMany({
      where: { companyId: user.companyId, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findUnique({ where: { id: user.companyId } }),
  ]);
  const sortedTemplates = sortTemplatesByFormat(templatesRaw);

  // Serializa para props client-safe (datas -> ISO, JSON -> tipado).
  // Ordenado com 4:5 primeiro — é o formato pré-selecionado no editor.
  const templates: EditorTemplate[] = sortedTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    canvasWidth: t.canvasWidth,
    canvasHeight: t.canvasHeight,
    overlayAssetUrl: t.overlayAssetUrl,
    photoSlot: t.photoSlot as EditorTemplate["photoSlot"],
    titleSlot: t.titleSlot as EditorTemplate["titleSlot"],
    subtitleSlot: (t.subtitleSlot ?? null) as EditorTemplate["subtitleSlot"],
  }));

  const serialized = {
    id: post.id,
    status: post.status,
    sourceType: post.sourceType,
    createdBy: post.createdBy,
    author: { name: post.author.name },
    credits: (post.credits as Credit[] | null) ?? [],
    photos: post.photos.map((p) => ({ id: p.id, storageUrl: p.storageUrl })),
    videos: post.videos.map((v) => ({
      id: v.id,
      storageUrl: v.storageUrl,
      previewFrameUrl: v.previewFrameUrl,
      width: v.width,
      height: v.height,
    })),
    versions: post.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      origin: v.origin,
      title: v.title,
      subtitle: v.subtitle,
      instagramCaption: v.instagramCaption,
      imageSuggestions: (v.imageSuggestions as string[] | null) ?? [],
      aiProvider: v.aiProvider,
      aiModel: v.aiModel,
      renderedArtUrl: v.renderedArtUrl,
      selectedPhotoId: v.selectedPhotoId,
      artTemplateId: v.artTemplateId,
      photoTransform: v.photoTransform as {
        offsetX: number;
        offsetY: number;
        scale: number;
      } | null,
      titleOffset: v.titleOffset as { offsetX: number; offsetY: number } | null,
      subtitleOffset: v.subtitleOffset as { offsetX: number; offsetY: number } | null,
      selectedVideoId: v.selectedVideoId,
      videoTemplate: v.videoTemplate,
      renderedVideoUrl: v.renderedVideoUrl,
      createdAt: v.createdAt.toISOString(),
      decisions: v.decisions.map((d) => ({
        id: d.id,
        decision: d.decision,
        reason: d.reason,
        reviewer: { id: d.reviewer.id, name: d.reviewer.name },
        createdAt: d.createdAt.toISOString(),
      })),
    })),
  };

  return (
    <AppShell user={{ name: user.name, role: user.role, mustSetPassword: user.passwordResetAt !== null }}>
      <PostWorkspace
        user={{ id: user.id, name: user.name, role: user.role }}
        post={serialized}
        templates={templates}
        company={{
          name: company?.name ?? null,
          logoUrl: company?.logoUrl ?? null,
          instagramHandle: company?.instagramHandle ?? null,
          brandColorDark: company?.brandColorDark ?? null,
          brandColorLight: company?.brandColorLight ?? null,
        }}
      />
    </AppShell>
  );
}

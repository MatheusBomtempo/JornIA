import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPostDetail } from "@/lib/services/posts";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { PostWorkspace } from "@/components/PostWorkspace";
import type { EditorTemplate } from "@/components/ArtEditor";
import { sortTemplatesByFormat } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await params;
  const post = await getPostDetail(id);
  if (!post) notFound();

  const templatesRaw = sortTemplatesByFormat(
    await prisma.artTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    }),
  );

  // Serializa para props client-safe (datas -> ISO, JSON -> tipado).
  // Ordenado com 4:5 primeiro — é o formato pré-selecionado no editor.
  const templates: EditorTemplate[] = templatesRaw.map((t) => ({
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
    photos: post.photos.map((p) => ({ id: p.id, storageUrl: p.storageUrl })),
    versions: post.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      origin: v.origin,
      title: v.title,
      subtitle: v.subtitle,
      instagramCaption: v.instagramCaption,
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
      createdAt: v.createdAt.toISOString(),
      decisions: v.decisions.map((d) => ({
        id: d.id,
        decision: d.decision,
        reason: d.reason,
        reviewer: { name: d.reviewer.name },
        createdAt: d.createdAt.toISOString(),
      })),
    })),
  };

  return (
    <AppShell user={{ name: user.name, role: user.role }}>
      <PostWorkspace
        user={{ id: user.id, name: user.name, role: user.role }}
        post={serialized}
        templates={templates}
      />
    </AppShell>
  );
}

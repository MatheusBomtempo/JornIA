import "server-only";
import { prisma } from "../db";
import { generatePostContent } from "../ai";
import { scrapeUrl } from "../scrape";
import { renderAndStore } from "../render";
import { publishToInstagram } from "../instagram";
import { canEditPost, can } from "../rbac";
import { ApiError, badRequest, forbidden, notFound } from "../http";
import { POST_STATUS, PUBLICATION_STATUS } from "../domain";
import type { z } from "zod";
import type {
  createPostSchema,
  saveArtSchema,
  regenerateSchema,
  editVersionSchema,
} from "../validation";
import type { User, PostVersion } from "@prisma/client";

type CreatePostInput = z.infer<typeof createPostSchema>;
type SaveArtInput = z.infer<typeof saveArtSchema>;
type RegenerateInput = z.infer<typeof regenerateSchema>;
type EditVersionInput = z.infer<typeof editVersionSchema>;

async function nextVersionNumber(postId: string): Promise<number> {
  const last = await prisma.postVersion.findFirst({
    where: { postId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

async function latestVersion(postId: string): Promise<PostVersion> {
  const v = await prisma.postVersion.findFirst({
    where: { postId },
    orderBy: { versionNumber: "desc" },
  });
  if (!v) throw notFound("Post sem versões.");
  return v;
}

// ── 1) Criar post + pipeline de IA (só texto) ────────────────
export async function createPostWithAi(user: User, input: CreatePostInput) {
  let scrapedContent: string | null = null;
  let sourceText = input.sourceText ?? null;

  if (input.sourceType === "link" && input.sourceUrl) {
    const scraped = await scrapeUrl(input.sourceUrl);
    scrapedContent = scraped.content;
    if (!sourceText && scraped.title) sourceText = scraped.title;
  }

  const post = await prisma.post.create({
    data: {
      createdBy: user.id,
      region: input.region ?? null,
      sourceType: input.sourceType,
      sourceText,
      sourceUrl: input.sourceUrl ?? null,
      scrapedContent,
      status: POST_STATUS.PROCESSING_AI,
      photos: {
        create: (input.photos ?? []).map((p, i) => ({
          storageUrl: p.storageUrl,
          orderIndex: p.orderIndex ?? i,
        })),
      },
    },
    include: { photos: true },
  });

  try {
    const content = await generatePostContent({
      sourceType: input.sourceType,
      sourceText,
      sourceUrl: input.sourceUrl,
      scrapedContent,
      region: input.region,
    });

    await prisma.postVersion.create({
      data: {
        postId: post.id,
        versionNumber: 1,
        origin: "ai_generated",
        title: content.title,
        shortNews: content.shortNews,
        instagramCaption: content.instagramCaption,
        artText: content.artText,
        // pré-seleciona a primeira foto, se houver
        selectedPhotoId: post.photos[0]?.id ?? null,
        editedBy: user.id,
      },
    });

    await prisma.post.update({
      where: { id: post.id },
      data: { status: POST_STATUS.EDITING_ART },
    });
  } catch (err) {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: POST_STATUS.FAILED },
    });
    throw new ApiError(
      502,
      `Falha no pipeline de IA: ${(err as Error).message}`,
    );
  }

  return getPostDetail(post.id);
}

// ── 2) Salvar arte + render final ────────────────────────────
export async function saveArtAndRender(
  user: User,
  postId: string,
  input: SaveArtInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  if (!canEditPost(user, post)) throw forbidden("Você não pode editar este post.");

  const [photo, template, version] = await Promise.all([
    prisma.postPhoto.findUnique({ where: { id: input.selectedPhotoId } }),
    prisma.artTemplate.findUnique({ where: { id: input.artTemplateId } }),
    latestVersion(postId),
  ]);
  if (!photo || photo.postId !== postId) throw badRequest("Foto inválida.");
  if (!template) throw badRequest("Template inválido.");

  const renderedArtUrl = await renderAndStore(
    {
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      overlayAssetUrl: template.overlayAssetUrl,
      photoUrl: photo.storageUrl,
      photoSlot: template.photoSlot,
      textSlot: template.textSlot,
      transform: input.photoTransform,
      artText: input.artText,
    },
    `art/${postId}/v${version.versionNumber}-${Date.now()}.png`,
  );

  await prisma.postVersion.update({
    where: { id: version.id },
    data: {
      selectedPhotoId: photo.id,
      artTemplateId: template.id,
      photoTransform: input.photoTransform,
      artText: input.artText,
      renderedArtUrl,
      editedBy: user.id,
    },
  });

  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.IN_REVIEW },
  });

  return getPostDetail(postId);
}

// ── 3) Regenerar (novo ciclo de IA, nova versão) ─────────────
export async function regeneratePost(
  user: User,
  postId: string,
  input: RegenerateInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  // staff pode refazer as próprias; manager/admin qualquer uma.
  if (!canEditPost(user, post)) throw forbidden("Sem permissão para refazer.");

  const prev = await latestVersion(postId);

  const content = await generatePostContent({
    sourceType: post.sourceType as "photo" | "text" | "link",
    sourceText: post.sourceText,
    sourceUrl: post.sourceUrl,
    scrapedContent: post.scrapedContent,
    region: post.region,
    guidance: input.guidance,
  });

  const version = await prisma.postVersion.create({
    data: {
      postId,
      versionNumber: await nextVersionNumber(postId),
      origin: "ai_regenerated",
      title: content.title,
      shortNews: content.shortNews,
      instagramCaption: content.instagramCaption,
      artText: content.artText,
      // carrega escolhas de arte da versão anterior (arte precisa ser re-renderizada)
      selectedPhotoId: prev.selectedPhotoId,
      artTemplateId: prev.artTemplateId,
      photoTransform: prev.photoTransform ?? undefined,
      editedBy: user.id,
    },
  });

  // Se veio de uma revisão, registra a decisão.
  if (can.review(user)) {
    await prisma.reviewDecision.create({
      data: {
        postVersionId: prev.id,
        reviewerId: user.id,
        decision: "regenerate",
        reason: input.guidance ?? null,
      },
    });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.EDITING_ART },
  });

  return { post: await getPostDetail(postId), versionId: version.id };
}

// ── 4) Edição manual de texto (nova versão) ──────────────────
export async function editVersionManually(
  user: User,
  postId: string,
  versionId: string,
  input: EditVersionInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  if (!canEditPost(user, post)) throw forbidden("Sem permissão para editar.");

  const source = await prisma.postVersion.findUnique({
    where: { id: versionId },
  });
  if (!source || source.postId !== postId) throw notFound("Versão não encontrada.");

  const artTextChanged =
    input.artText !== undefined && input.artText !== source.artText;

  // nova versão manual_edit (nunca sobrescreve)
  const version = await prisma.postVersion.create({
    data: {
      postId,
      versionNumber: await nextVersionNumber(postId),
      origin: "manual_edit",
      title: input.title ?? source.title,
      shortNews: input.shortNews ?? source.shortNews,
      instagramCaption: input.instagramCaption ?? source.instagramCaption,
      artText: input.artText ?? source.artText,
      selectedPhotoId: source.selectedPhotoId,
      artTemplateId: source.artTemplateId,
      photoTransform: source.photoTransform ?? undefined,
      renderedArtUrl: source.renderedArtUrl,
      editedBy: user.id,
    },
  });

  // Re-render se o texto da arte mudou e há template+foto definidos.
  if (artTextChanged && version.artTemplateId && version.selectedPhotoId) {
    const [photo, template] = await Promise.all([
      prisma.postPhoto.findUnique({ where: { id: version.selectedPhotoId } }),
      prisma.artTemplate.findUnique({ where: { id: version.artTemplateId } }),
    ]);
    if (photo && template) {
      const url = await renderAndStore(
        {
          canvasWidth: template.canvasWidth,
          canvasHeight: template.canvasHeight,
          overlayAssetUrl: template.overlayAssetUrl,
          photoUrl: photo.storageUrl,
          photoSlot: template.photoSlot,
          textSlot: template.textSlot,
          transform: version.photoTransform ?? {},
          artText: version.artText ?? "",
        },
        `art/${postId}/v${version.versionNumber}-${Date.now()}.png`,
      );
      await prisma.postVersion.update({
        where: { id: version.id },
        data: { renderedArtUrl: url },
      });
    }
  }

  if (can.review(user)) {
    await prisma.reviewDecision.create({
      data: {
        postVersionId: source.id,
        reviewerId: user.id,
        decision: "manual_edit",
      },
    });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.IN_REVIEW },
  });

  return { post: await getPostDetail(postId), versionId: version.id };
}

// ── 5) Aprovar → publicar no Instagram ───────────────────────
export async function approveAndPublish(
  user: User,
  postId: string,
  versionId: string,
) {
  if (!can.publish(user)) throw forbidden("Apenas editor/gerente ou admin publicam.");

  const version = await prisma.postVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.postId !== postId) throw notFound("Versão não encontrada.");
  if (!version.renderedArtUrl) {
    throw badRequest("A arte ainda não foi renderizada para esta versão.");
  }

  await prisma.reviewDecision.create({
    data: { postVersionId: versionId, reviewerId: user.id, decision: "approved" },
  });

  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.PUBLISHING },
  });

  const publication = await prisma.publication.create({
    data: { postVersionId: versionId, status: PUBLICATION_STATUS.PENDING },
  });

  try {
    const result = await publishToInstagram(
      version.renderedArtUrl,
      version.instagramCaption ?? version.title ?? "",
    );
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: PUBLICATION_STATUS.PUBLISHED,
        instagramMediaId: result.mediaId,
        instagramPostUrl: result.permalink ?? null,
        publishedAt: new Date(),
      },
    });
    await prisma.post.update({
      where: { id: postId },
      data: { status: POST_STATUS.PUBLISHED },
    });
  } catch (err) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: PUBLICATION_STATUS.FAILED,
        errorMessage: (err as Error).message,
      },
    });
    await prisma.post.update({
      where: { id: postId },
      data: { status: POST_STATUS.FAILED },
    });
    throw new ApiError(502, `Falha ao publicar: ${(err as Error).message}`);
  }

  return getPostDetail(postId);
}

// ── 6) Recusar ───────────────────────────────────────────────
export async function rejectPost(
  user: User,
  postId: string,
  versionId: string,
  reason: string,
) {
  if (!can.review(user)) throw forbidden("Apenas editor/gerente ou admin recusam.");

  const version = await prisma.postVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.postId !== postId) throw notFound("Versão não encontrada.");

  await prisma.reviewDecision.create({
    data: {
      postVersionId: versionId,
      reviewerId: user.id,
      decision: "rejected",
      reason,
    },
  });
  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.REJECTED },
  });

  return getPostDetail(postId);
}

// ── Leitura ──────────────────────────────────────────────────
export function getPostDetail(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
      photos: { orderBy: { orderIndex: "asc" } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          decisions: {
            include: { reviewer: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          },
          publications: { orderBy: { createdAt: "desc" } },
          artTemplate: true,
          selectedPhoto: true,
        },
      },
    },
  });
}

export function listPosts(opts: { status?: string; mineFor?: string } = {}) {
  return prisma.post.findMany({
    where: {
      status: opts.status,
      createdBy: opts.mineFor,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { id: true, name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          title: true,
          shortNews: true,
          renderedArtUrl: true,
          versionNumber: true,
        },
      },
    },
  });
}

import "server-only";
import { prisma } from "../db";
import { generatePostContent } from "../ai";
import { scrapeUrl } from "../scrape";
import { compactSource } from "../compact";
import { renderAndStore } from "../render";
import { publishToInstagram } from "../instagram";
import { canEditPost, canReviewPost, can } from "../rbac";
import { purgePostsWithMedia } from "./retention";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http";
import { POST_STATUS, PUBLICATION_STATUS, PEER_APPROVALS_NEEDED, type Credit } from "../domain";
import type { z } from "zod";
import type {
  createPostSchema,
  saveArtSchema,
  regenerateSchema,
  editVersionSchema,
  addPhotoSchema,
} from "../validation";
import type { User, PostVersion } from "@prisma/client";
import type { CompactResult } from "../compact";

type CreatePostInput = z.infer<typeof createPostSchema>;
type SaveArtInput = z.infer<typeof saveArtSchema>;
type RegenerateInput = z.infer<typeof regenerateSchema>;
type EditVersionInput = z.infer<typeof editVersionSchema>;
type AddPhotoInput = z.infer<typeof addPhotoSchema>;

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
  let sourceText = input.text ?? null;

  // Material de apoio: link raspado e/ou documento anexado (PDF/txt) —
  // passa pelo pipeline de compactação antes de ir pro prompt (ver compact.ts):
  // documento estruturado (boletim, laudo, nota) tem só os campos extraídos
  // por regra, sem gastar token de IA nisso; texto genérico é cortado num
  // teto mais justo. Reduz tokens e redige dado pessoal ANTES da IA ver.
  const support: string[] = [];
  if (input.url) {
    const scraped = await scrapeUrl(input.url);
    const compacted = compactSource(scraped.content);
    logCompaction("link", compacted);
    support.push(
      `[Link (${labelKind(compacted.kind)}): ${input.url}]\n${compacted.text}`,
    );
    if (!sourceText && scraped.title) sourceText = scraped.title;
  }
  if (input.document) {
    const compacted = compactSource(input.document.text);
    logCompaction("documento", compacted);
    support.push(
      `[Documento anexado (${labelKind(compacted.kind)}): ${input.document.name}]\n${compacted.text}`,
    );
  }
  const scrapedContent = support.length ? support.join("\n\n---\n\n") : null;

  // Tipo de fonte derivado (a UI não pergunta mais).
  const sourceType = input.url
    ? "link"
    : input.document
      ? "document"
      : input.text
        ? "text"
        : "photo";

  const credits = (input.credits ?? []).filter((c) => c.handle.trim());

  const post = await prisma.post.create({
    data: {
      createdBy: user.id,
      sourceType,
      sourceText,
      sourceUrl: input.url ?? null,
      scrapedContent,
      credits: credits.length ? credits : undefined,
      status: POST_STATUS.PROCESSING_AI,
      photos: input.photo
        ? { create: [{ storageUrl: input.photo.storageUrl, orderIndex: 0 }] }
        : undefined,
    },
    include: { photos: true },
  });

  try {
    const content = await generatePostContent({
      text: sourceText,
      sourceUrl: input.url,
      scrapedContent,
      hasPhoto: !!input.photo,
      credits: credits as Credit[],
    });

    await prisma.postVersion.create({
      data: {
        postId: post.id,
        versionNumber: 1,
        origin: "ai_generated",
        title: content.title,
        subtitle: content.subtitle,
        instagramCaption: content.instagramCaption,
        imageSuggestions: content.imageSuggestions.length
          ? content.imageSuggestions
          : undefined,
        aiProvider: content.meta?.provider,
        aiModel: content.meta?.model,
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
      titleSlot: template.titleSlot,
      subtitleSlot: template.subtitleSlot ?? undefined,
      transform: input.photoTransform,
      title: input.title,
      subtitle: input.subtitle,
      titleOffset: input.titleOffset,
      subtitleOffset: input.subtitleOffset,
    },
    `art/${postId}/v${version.versionNumber}-${Date.now()}.png`,
  );

  await prisma.postVersion.update({
    where: { id: version.id },
    data: {
      selectedPhotoId: photo.id,
      artTemplateId: template.id,
      photoTransform: input.photoTransform,
      title: input.title,
      subtitle: input.subtitle,
      titleOffset: input.titleOffset,
      subtitleOffset: input.subtitleOffset,
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

// ── 2b) Anexar foto extra a um post já criado ────────────────
/**
 * O jornalista pode decidir a foto DEPOIS de gerar o texto: achou uma opção
 * melhor, baixou uma do Google Imagens ou de um banco gratuito a partir de
 * uma sugestão da IA. Isso só adiciona uma foto à lista do post — nunca
 * troca nem remove a que já estava lá; a escolha de qual usar continua sendo
 * manual, no editor de arte.
 */
export async function addPhotoToPost(
  user: User,
  postId: string,
  input: AddPhotoInput,
) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { _count: { select: { photos: true } } },
  });
  if (!post) throw notFound("Post não encontrado.");
  if (!canEditPost(user, post)) throw forbidden("Você não pode editar este post.");

  const photo = await prisma.postPhoto.create({
    data: {
      postId,
      storageUrl: input.storageUrl,
      orderIndex: post._count.photos,
    },
  });

  return { photo, post: await getPostDetail(postId) };
}

// ── 3) Regenerar (novo ciclo de IA, nova versão) ─────────────
export async function regeneratePost(
  user: User,
  postId: string,
  input: RegenerateInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  // staff pode refazer as próprias; manager/admin qualquer uma; um colega
  // (revisor por pares) também pode pedir reescrita na pauta de outro staff.
  if (!canEditPost(user, post) && !canReviewPost(user, post)) {
    throw forbidden("Sem permissão para refazer.");
  }

  const prev = await latestVersion(postId);

  const photoCount = await prisma.postPhoto.count({ where: { postId } });
  let content;
  try {
    content = await generatePostContent({
      text: post.sourceText,
      sourceUrl: post.sourceUrl,
      scrapedContent: post.scrapedContent,
      hasPhoto: photoCount > 0,
      credits: (post.credits as Credit[] | null) ?? undefined,
      guidance: input.guidance,
    });
  } catch (err) {
    // Nada foi alterado ainda — o post continua exatamente como estava.
    throw new ApiError(
      502,
      `Falha ao reescrever com IA: ${(err as Error).message}`,
    );
  }

  const version = await prisma.postVersion.create({
    data: {
      postId,
      versionNumber: await nextVersionNumber(postId),
      origin: "ai_regenerated",
      title: content.title,
      subtitle: content.subtitle,
      instagramCaption: content.instagramCaption,
      imageSuggestions: content.imageSuggestions.length
        ? content.imageSuggestions
        : undefined,
      aiProvider: content.meta?.provider,
      aiModel: content.meta?.model,
      // carrega escolhas de arte da versão anterior (arte precisa ser re-renderizada)
      selectedPhotoId: prev.selectedPhotoId,
      artTemplateId: prev.artTemplateId,
      photoTransform: prev.photoTransform ?? undefined,
      titleOffset: prev.titleOffset ?? undefined,
      subtitleOffset: prev.subtitleOffset ?? undefined,
      editedBy: user.id,
    },
  });

  // Se veio de uma revisão (manager/admin ou colega revisando), registra a decisão.
  if (canReviewPost(user, post)) {
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

  // Título e subtítulo aparecem na arte — mudou, precisa re-renderizar.
  const artChanged =
    (input.title !== undefined && input.title !== source.title) ||
    (input.subtitle !== undefined && input.subtitle !== source.subtitle);

  // nova versão manual_edit (nunca sobrescreve)
  const version = await prisma.postVersion.create({
    data: {
      postId,
      versionNumber: await nextVersionNumber(postId),
      origin: "manual_edit",
      title: input.title ?? source.title,
      subtitle: input.subtitle ?? source.subtitle,
      instagramCaption: input.instagramCaption ?? source.instagramCaption,
      imageSuggestions: source.imageSuggestions ?? undefined,
      selectedPhotoId: source.selectedPhotoId,
      artTemplateId: source.artTemplateId,
      photoTransform: source.photoTransform ?? undefined,
      titleOffset: source.titleOffset ?? undefined,
      subtitleOffset: source.subtitleOffset ?? undefined,
      renderedArtUrl: source.renderedArtUrl,
      editedBy: user.id,
    },
  });

  if (artChanged && version.artTemplateId && version.selectedPhotoId) {
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
          titleSlot: template.titleSlot,
          subtitleSlot: template.subtitleSlot ?? undefined,
          transform: version.photoTransform ?? {},
          title: version.title ?? "",
          subtitle: version.subtitle ?? "",
          titleOffset: version.titleOffset ?? undefined,
          subtitleOffset: version.subtitleOffset ?? undefined,
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
/**
 * Manager/admin aprovam com autoridade própria: 1 clique publica na hora.
 * Staff não pode aprovar a própria pauta — só a de um colega (revisão por
 * pares) — e sozinho não publica: o voto fica registrado e só quando
 * PEER_APPROVALS_NEEDED colegas distintos tiverem aprovado esta versão é
 * que a publicação de fato dispara.
 */
export async function approveAndPublish(
  user: User,
  postId: string,
  versionId: string,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  if (!canReviewPost(user, post)) throw forbidden("Você não pode revisar este post.");

  const version = await prisma.postVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.postId !== postId) throw notFound("Versão não encontrada.");
  if (!version.renderedArtUrl) {
    throw badRequest("A arte ainda não foi renderizada para esta versão.");
  }

  const isDirect = can.publish(user);

  if (!isDirect) {
    const already = await prisma.reviewDecision.findFirst({
      where: { postVersionId: versionId, reviewerId: user.id, decision: "approved" },
    });
    if (already) throw conflict("Você já aprovou esta versão.");

    await prisma.reviewDecision.create({
      data: { postVersionId: versionId, reviewerId: user.id, decision: "approved" },
    });

    const approvedCount = await prisma.reviewDecision.count({
      where: { postVersionId: versionId, decision: "approved" },
    });
    // Faltam colegas — o voto foi registrado, mas ainda não publica.
    if (approvedCount < PEER_APPROVALS_NEEDED) return getPostDetail(postId);
  } else {
    await prisma.reviewDecision.create({
      data: { postVersionId: versionId, reviewerId: user.id, decision: "approved" },
    });
  }

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
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  // Uma recusa é sempre imediata (de manager/admin ou de um colega revisor)
  // — o objetivo é facilitar barrar algo ruim, não também exigir 2 votos pra isso.
  if (!canReviewPost(user, post)) throw forbidden("Você não pode recusar este post.");

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

/**
 * Não aciona a limpeza de retenção aqui dentro: quem chama `listPosts`
 * costuma também chamar `listAuditLogs` em paralelo (`Promise.all`), e se a
 * limpeza rodasse como efeito colateral escondido aqui, a leitura do log
 * poderia correr ANTES da linha ser inserida (post some do feed mas o log
 * ainda não apareceu). Por isso quem monta a página aciona
 * `maybeCleanupExpiredPosts()` explicitamente antes de ler os dois.
 */
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
          subtitle: true,
          renderedArtUrl: true,
          versionNumber: true,
        },
      },
    },
  });
}

/**
 * Apaga um post agora, na mão do usuário — independente de status ou idade
 * (diferente da limpeza automática, que só pega post expirado). Mesma regra
 * de canEditPost: admin/manager apagam qualquer post, staff só o que ele
 * mesmo criou. Mesma garantia da limpeza automática: storage (fotos + arte)
 * some junto com o banco, e fica um registro mínimo em post_audit_log. Não
 * mexe em nada já publicado no Instagram, só no nosso lado.
 */
export async function deletePostNow(user: User, id: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      createdBy: true,
      photos: { select: { storageUrl: true } },
      versions: { select: { renderedArtUrl: true } },
    },
  });
  if (!post) throw notFound("Post não encontrado.");
  if (!canEditPost(user, post)) {
    throw forbidden("Você só pode apagar pautas que você mesmo criou.");
  }
  await purgePostsWithMedia([post]);
}

/**
 * Rastro do que foi apagado pela limpeza automática — só o essencial
 * (título, status, autor, datas) pra responder "quem postou o quê e
 * quando" numa auditoria futura, sem guardar fotos/versões/decisões.
 */
export function listAuditLogs(limit = 50) {
  return prisma.postAuditLog.findMany({
    orderBy: { purgedAt: "desc" },
    take: limit,
  });
}

function labelKind(kind: "structured" | "generic"): string {
  return kind === "structured" ? "documento estruturado" : "matéria";
}

function logCompaction(source: string, r: CompactResult) {
  const savedPct =
    r.originalChars > 0
      ? Math.round((1 - r.compactChars / r.originalChars) * 100)
      : 0;
  console.log(
    `[JornAI] compactação (${source}): ${r.kind} · ${r.originalChars} → ${r.compactChars} chars` +
      (savedPct > 0 ? ` (-${savedPct}%)` : "") +
      (r.redactedCount > 0 ? ` · ${r.redactedCount} dado(s) sensível(is) redigido(s)` : "") +
      (r.removedDuplicateLines > 0 ? ` · ${r.removedDuplicateLines} linha(s) repetida(s) removida(s)` : ""),
  );
}

import "server-only";
import { prisma } from "../db";
import { generatePostContent } from "../ai";
import { scrapeUrl } from "../scrape";
import { compactSource } from "../compact";
import { renderAndStore } from "../render";
import { renderVideoAndStore, extractAndStoreMiddleFrame } from "../render/video";
import { publishToInstagram, publishVideoToInstagram } from "../instagram";
import { canEditPost, canReviewPost, can } from "../rbac";
import { purgePostsWithMedia } from "./retention";
import { getAppSettings } from "./settings";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http";
import { POST_STATUS, PUBLICATION_STATUS, PEER_APPROVALS_NEEDED, type Credit } from "../domain";
import type { z } from "zod";
import type {
  createPostSchema,
  saveArtSchema,
  saveVideoSchema,
  regenerateSchema,
  editVersionSchema,
  addPhotoSchema,
  addVideoSchema,
} from "../validation";
import type { User, PostVersion } from "@prisma/client";
import type { CompactResult } from "../compact";

type CreatePostInput = z.infer<typeof createPostSchema>;
type SaveArtInput = z.infer<typeof saveArtSchema>;
type SaveVideoInput = z.infer<typeof saveVideoSchema>;
type RegenerateInput = z.infer<typeof regenerateSchema>;
type EditVersionInput = z.infer<typeof editVersionSchema>;
type AddPhotoInput = z.infer<typeof addPhotoSchema>;
type AddVideoInput = z.infer<typeof addVideoSchema>;

/** Todo serviço de post exige empresa — ver requireCompanyUser() em lib/auth.ts. */
type CompanyUser = User & { companyId: string };

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

/**
 * Toda função abaixo que recebe um postId busca o post e chama isto antes de
 * ler canEditPost/canReviewPost — impede que alguém de outra empresa
 * edite/aprove/apague um post só por adivinhar o UUID (canEditPost/
 * canReviewPost checam papel e autoria, não empresa). 404 em vez de 403 de
 * propósito: não revela nem a existência do post pra quem é de outra empresa.
 */
function assertSameCompany(postCompanyId: string, userCompanyId: string): void {
  if (postCompanyId !== userCompanyId) throw notFound("Post não encontrado.");
}

// ── 1) Criar post + pipeline de IA (só texto) ────────────────
export async function createPostWithAi(user: CompanyUser, input: CreatePostInput) {
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
      companyId: user.companyId,
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

// ── 2) Salvar arte + render final (foto) ─────────────────────
export async function saveArtAndRender(
  user: CompanyUser,
  postId: string,
  input: SaveArtInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
  if (!canEditPost(user, post)) throw forbidden("Você não pode editar este post.");

  const [photo, template, version] = await Promise.all([
    prisma.postPhoto.findUnique({ where: { id: input.selectedPhotoId } }),
    prisma.artTemplate.findUnique({ where: { id: input.artTemplateId } }),
    latestVersion(postId),
  ]);
  if (!photo || photo.postId !== postId) throw badRequest("Foto inválida.");
  if (!template || template.companyId !== user.companyId) {
    throw badRequest("Template inválido.");
  }

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

  const updatedVersion = await prisma.postVersion.update({
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

  await advanceAfterRender(post.companyId, postId, updatedVersion);
  return getPostDetail(postId);
}

// ── 2v) Salvar vídeo + render final (texto animado) ──────────
export async function saveVideoAndRender(
  user: CompanyUser,
  postId: string,
  input: SaveVideoInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
  if (!canEditPost(user, post)) throw forbidden("Você não pode editar este post.");

  const [video, version, company] = await Promise.all([
    prisma.postVideo.findUnique({ where: { id: input.selectedVideoId } }),
    latestVersion(postId),
    prisma.company.findUnique({ where: { id: post.companyId } }),
  ]);
  if (!video || video.postId !== postId) throw badRequest("Vídeo inválido.");

  const renderedVideoUrl = await renderVideoAndStore(
    {
      videoUrl: video.storageUrl,
      title: input.title,
      logoUrl: company?.logoUrl,
      titleOffsetY: input.titleOffsetY,
      videoTemplate: input.videoTemplate,
      brandColors: { dark: company?.brandColorDark, light: company?.brandColorLight },
    },
    `video/${postId}/v${version.versionNumber}-${Date.now()}.mp4`,
  );

  const updatedVersion = await prisma.postVersion.update({
    where: { id: version.id },
    data: {
      selectedVideoId: video.id,
      title: input.title,
      // Mesmo campo que a foto usa pro deslocamento do título — aqui só o Y.
      titleOffset: { offsetX: 0, offsetY: input.titleOffsetY ?? 0 },
      videoTemplate: input.videoTemplate,
      renderedVideoUrl,
      editedBy: user.id,
    },
  });

  await advanceAfterRender(post.companyId, postId, updatedVersion);
  return getPostDetail(postId);
}

/**
 * Depois que a arte/vídeo final está pronta: com o fluxo de revisão
 * desligado no admin, publica direto — ninguém precisa aprovar. Ligado
 * (padrão), segue pro "em revisão". Compartilhado por foto e vídeo.
 */
async function advanceAfterRender(
  companyId: string,
  postId: string,
  version: PostVersion,
): Promise<void> {
  const settings = await getAppSettings(companyId);
  if (settings.reviewRequired) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: POST_STATUS.IN_REVIEW },
    });
  } else {
    await publishVersion(postId, version);
  }
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
  user: CompanyUser,
  postId: string,
  input: AddPhotoInput,
) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { _count: { select: { photos: true } } },
  });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
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

// ── 2c) Anexar vídeo extra a um post já criado ───────────────
export async function addVideoToPost(
  user: CompanyUser,
  postId: string,
  input: AddVideoInput,
) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { _count: { select: { videos: true } } },
  });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
  if (!canEditPost(user, post)) throw forbidden("Você não pode editar este post.");

  // Frame do meio já no enquadramento final (9:16): é o fundo do preview no
  // editor, e o probe diz quanto o corte 9:16 vai comer das laterais. Se
  // falhar, o vídeo entra assim mesmo — o editor só fica sem o preview.
  let previewFrameUrl: string | null = null;
  let probe: { durationSec: number; width: number; height: number } | null = null;
  // Motivo da falha vai junto na resposta (não só no log do servidor): sem
  // isso o editor só mostra "sem prévia" e a causa real fica presa no painel
  // da Vercel.
  let previewError: string | null = null;
  try {
    const frame = await extractAndStoreMiddleFrame(
      input.storageUrl,
      `video/${postId}/frames/${Date.now()}.jpg`,
    );
    previewFrameUrl = frame.url;
    probe = frame.probe;
  } catch (err) {
    previewError = err instanceof Error ? err.message : String(err);
    console.error("[JornAI] Falha ao extrair frame de preview do vídeo:", err);
  }

  const video = await prisma.postVideo.create({
    data: {
      postId,
      storageUrl: input.storageUrl,
      durationMs: probe ? Math.round(probe.durationSec * 1000) : input.durationMs,
      previewFrameUrl,
      width: probe?.width,
      height: probe?.height,
      orderIndex: post._count.videos,
    },
  });

  return { video, previewError, post: await getPostDetail(postId) };
}

// ── 3) Regenerar (novo ciclo de IA, nova versão) ─────────────
export async function regeneratePost(
  user: CompanyUser,
  postId: string,
  input: RegenerateInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
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
      // carrega escolhas de arte/vídeo da versão anterior (precisa ser re-renderizada)
      selectedPhotoId: prev.selectedPhotoId,
      artTemplateId: prev.artTemplateId,
      photoTransform: prev.photoTransform ?? undefined,
      titleOffset: prev.titleOffset ?? undefined,
      subtitleOffset: prev.subtitleOffset ?? undefined,
      selectedVideoId: prev.selectedVideoId,
      videoTemplate: prev.videoTemplate,
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
  user: CompanyUser,
  postId: string,
  versionId: string,
  input: EditVersionInput,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
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
      selectedVideoId: source.selectedVideoId,
      videoTemplate: source.videoTemplate,
      renderedVideoUrl: source.renderedVideoUrl,
      editedBy: user.id,
    },
  });

  let finalRenderedArtUrl = version.renderedArtUrl;
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
      finalRenderedArtUrl = url;
    }
  }

  // Post de vídeo: título mudou -> o cartão animado precisa ser regravado.
  let finalRenderedVideoUrl = version.renderedVideoUrl;
  if (artChanged && version.selectedVideoId) {
    const [video, company] = await Promise.all([
      prisma.postVideo.findUnique({ where: { id: version.selectedVideoId } }),
      prisma.company.findUnique({ where: { id: post.companyId } }),
    ]);
    if (video) {
      const offset = version.titleOffset as { offsetY?: number } | null;
      const url = await renderVideoAndStore(
        {
          videoUrl: video.storageUrl,
          title: version.title ?? "",
          logoUrl: company?.logoUrl,
          titleOffsetY: offset?.offsetY ?? 0,
          videoTemplate: version.videoTemplate as "classic" | "light" | "bold",
          brandColors: { dark: company?.brandColorDark, light: company?.brandColorLight },
        },
        `video/${postId}/v${version.versionNumber}-${Date.now()}.mp4`,
      );
      await prisma.postVersion.update({
        where: { id: version.id },
        data: { renderedVideoUrl: url },
      });
      finalRenderedVideoUrl = url;
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

  // Mesma regra do salvamento de arte/vídeo: com revisão desligada e a mídia
  // já pronta, publica direto em vez de esperar em "em revisão".
  const settings = await getAppSettings(user.companyId);
  const mediaReady = !!finalRenderedArtUrl || !!finalRenderedVideoUrl;
  if (settings.reviewRequired || !mediaReady) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: POST_STATUS.IN_REVIEW },
    });
  } else {
    await publishVersion(postId, {
      ...version,
      renderedArtUrl: finalRenderedArtUrl,
      renderedVideoUrl: finalRenderedVideoUrl,
    });
  }

  return { post: await getPostDetail(postId), versionId: version.id };
}

/**
 * Publica de fato no Instagram (foto ou vídeo) e reflete o resultado no
 * post — usado tanto pela aprovação manual (approveAndPublish) quanto pelo
 * auto-publish quando o fluxo de revisão está desligado (ver
 * AppSettings.reviewRequired).
 */
async function publishVersion(postId: string, version: PostVersion) {
  const isVideo = !!version.renderedVideoUrl;
  if (!version.renderedArtUrl && !version.renderedVideoUrl) {
    throw badRequest("A arte/vídeo ainda não foi renderizado para esta versão.");
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: POST_STATUS.PUBLISHING },
  });

  const publication = await prisma.publication.create({
    data: { postVersionId: version.id, status: PUBLICATION_STATUS.PENDING },
  });

  try {
    const caption = version.instagramCaption ?? version.title ?? "";
    const result = isVideo
      ? await publishVideoToInstagram(version.renderedVideoUrl!, caption)
      : await publishToInstagram(version.renderedArtUrl!, caption);
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
  user: CompanyUser,
  postId: string,
  versionId: string,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
  if (!canReviewPost(user, post)) throw forbidden("Você não pode revisar este post.");

  const version = await prisma.postVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.postId !== postId) throw notFound("Versão não encontrada.");
  if (!version.renderedArtUrl && !version.renderedVideoUrl) {
    throw badRequest("A arte/vídeo ainda não foi renderizado para esta versão.");
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

  await publishVersion(postId, version);
  return getPostDetail(postId);
}

// ── 6) Recusar ───────────────────────────────────────────────
export async function rejectPost(
  user: CompanyUser,
  postId: string,
  versionId: string,
  reason: string,
) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
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
      videos: { orderBy: { orderIndex: "asc" } },
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
          selectedVideo: true,
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
export function listPosts(companyId: string, opts: { status?: string; mineFor?: string } = {}) {
  return prisma.post.findMany({
    where: {
      companyId,
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
          id: true,
          title: true,
          subtitle: true,
          renderedArtUrl: true,
          renderedVideoUrl: true,
          versionNumber: true,
          // Só o frame estático — o card do feed nunca precisa baixar o
          // vídeo renderizado inteiro (pesado) só pra mostrar uma miniatura.
          selectedVideo: { select: { previewFrameUrl: true } },
          decisions: {
            where: { decision: "approved" },
            select: { reviewerId: true },
          },
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
export async function deletePostNow(user: CompanyUser, id: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      createdBy: true,
      photos: { select: { storageUrl: true } },
      videos: { select: { storageUrl: true } },
      versions: { select: { renderedArtUrl: true, renderedVideoUrl: true } },
    },
  });
  if (!post) throw notFound("Post não encontrado.");
  assertSameCompany(post.companyId, user.companyId);
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
export function listAuditLogs(companyId: string, limit = 50) {
  return prisma.postAuditLog.findMany({
    where: { companyId },
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

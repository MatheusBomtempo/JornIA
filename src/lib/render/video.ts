import "server-only";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { putObject } from "../storage";
import { renderTextToSvg } from "./text";
import type { TextSlot } from "./slots";
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  SAFE_X,
  CARD_WIDTH,
  CARD_PADDING_X,
  CARD_PADDING_Y,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  TITLE_MAX_TEXT_HEIGHT,
  LOGO_HEIGHT,
  LOGO_GAP,
  FADE_IN_START,
  FADE_IN_END,
  FADE_OUT_START,
  FADE_OUT_END,
  SLIDE_DISTANCE,
  EXIT_SLIDE_DISTANCE,
  buildVideoCardStyles,
  DEFAULT_VIDEO_TEMPLATE,
  needsBlurBackground,
  defaultGroupTop,
  clampGroupTop,
  type VideoCardStyle,
  type CompanyBrandColors,
} from "./video-layout";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Render final do post de vídeo: baixa o vídeo original, normaliza pra 9:16
 * (sempre a mesma proporção, qualquer que seja o formato enviado), desenha
 * por cima o bloco de título + logo da empresa com animação de entrada
 * (desliza + aparece) e saída (some), e reencoda num único MP4 pronto pro
 * Instagram (Reels).
 *
 * Por que overlay de PNG em vez de drawtext do ffmpeg: drawtext depende de
 * libfreetype conseguir carregar a fonte, e a Poppins só está disponível em
 * .woff (@fontsource) — não é garantido que o freetype do ffmpeg abra woff
 * em toda plataforma. Gerando o bloco como PNG (mesmo pipeline vetorizado do
 * render de imagem), reaproveitamos exatamente o mesmo texto da arte.
 */

/** Teto do encode — abaixo do maxDuration da rota (ver /api/posts/[id]/video). */
const RENDER_TIMEOUT_MS = 240_000;

export interface RenderVideoParams {
  videoUrl: string;
  title: string;
  /** Logo da empresa, centralizada abaixo do texto. */
  logoUrl?: string | null;
  /** Ajuste vertical do bloco feito no editor (px, já em escala 1080x1920). */
  titleOffsetY?: number;
  /** Estilo fixo do cartão — ver buildVideoCardStyles. */
  videoTemplate?: VideoCardStyle["id"];
  /** Cores da marca da empresa (Admin → Empresa), usadas em "Claro"/"Destaque". */
  brandColors?: CompanyBrandColors;
}

export interface VideoProbe {
  durationSec: number;
  width: number;
  height: number;
}

async function downloadToTemp(url: string, suffix: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(os.tmpdir(), `${randomUUID()}${suffix}`);
  await fs.writeFile(dest, buf);
  return dest;
}

/** Duração e dimensões do vídeo — base do frame do meio e da validação de proporção. */
export function probeVideoFile(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      if (!stream) return reject(new Error("O arquivo enviado não tem faixa de vídeo."));
      resolve({
        durationSec: Number(data.format.duration) || 0,
        width: stream.width ?? 0,
        height: stream.height ?? 0,
      });
    });
  });
}

/** scale+crop que normaliza pra 9:16 vídeos que já são altos o bastante (só corta em cima/embaixo). */
const NORMALIZE_9x16 =
  `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
  `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`;

/**
 * Núcleo do fundo desfocado: divide o stream em dois — uma cópia vira fundo
 * (ampliada pra preencher 1080x1920, espelhada e borrada) e a outra fica
 * inteira, sem cortar nada, encaixada por cima e centralizada. Usado quando
 * o vídeo enviado é mais largo que 9:16 (deitado) — em vez de cortar as
 * laterais pra caber, preenche o espaço vertical sobrando com o próprio
 * vídeo desfocado.
 */
function blurPadGraph(tag: string, inputLabel?: string, outputLabel?: string): string {
  const input = inputLabel ? `[${inputLabel}]` : "";
  const output = outputLabel ? `[${outputLabel}]` : "";
  return [
    `${input}split=2[${tag}bg][${tag}fg]`,
    `[${tag}bg]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},hflip,gblur=sigma=30,eq=brightness=-0.08:saturation=0.85[${tag}bgblur]`,
    `[${tag}fg]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease[${tag}fgfit]`,
    `[${tag}bgblur][${tag}fgfit]overlay=(W-w)/2:(H-h)/2${output}`,
  ].join(";");
}

/**
 * Filtro que normaliza qualquer vídeo pra 1080x1920: corta em cima/embaixo
 * se já for alto o bastante, ou usa o fundo desfocado (ver acima) se for
 * deitado — nesse caso nada da imagem original se perde.
 */
function buildNormalizeFilter(
  srcWidth: number,
  srcHeight: number,
  opts: { inputLabel?: string; outputLabel?: string } = {},
): string {
  if (needsBlurBackground(srcWidth, srcHeight)) {
    return blurPadGraph("n", opts.inputLabel, opts.outputLabel);
  }
  const input = opts.inputLabel ? `[${opts.inputLabel}]` : "";
  const output = opts.outputLabel ? `[${opts.outputLabel}]` : "";
  return `${input}${NORMALIZE_9x16}${output}`;
}

/**
 * Frame do meio do vídeo, já normalizado em 9:16 — é o fundo do preview no
 * editor, então precisa passar pelo MESMO enquadramento do render final.
 */
export async function extractMiddleFrame(
  videoUrl: string,
): Promise<{ jpeg: Buffer; probe: VideoProbe }> {
  const srcPath = await downloadToTemp(videoUrl, path.extname(videoUrl) || ".mp4");
  const outPath = path.join(os.tmpdir(), `${randomUUID()}-frame.jpg`);
  try {
    const probe = await probeVideoFile(srcPath);
    const middle = probe.durationSec > 0 ? probe.durationSec / 2 : 0;
    const vf = buildNormalizeFilter(probe.width, probe.height);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(srcPath)
        .seekInput(middle)
        .outputOptions(["-frames:v 1", `-vf ${vf}`, "-q:v 3"])
        .on("error", reject)
        .on("end", () => resolve())
        .save(outPath);
    });

    return { jpeg: await fs.readFile(outPath), probe };
  } finally {
    await Promise.all([
      fs.unlink(srcPath).catch(() => {}),
      fs.unlink(outPath).catch(() => {}),
    ]);
  }
}

/** Frame do meio + upload, devolvendo URL pública e os dados do probe. */
export async function extractAndStoreMiddleFrame(
  videoUrl: string,
  key: string,
): Promise<{ url: string; probe: VideoProbe }> {
  const { jpeg, probe } = await extractMiddleFrame(videoUrl);
  const { url } = await putObject(key, jpeg, "image/jpeg");
  return { url, probe };
}

/**
 * Bloco sobreposto: caixa com o título e, abaixo dela, a logo da empresa
 * centralizada. Sai com a largura do vídeo (1080) pra ser sobreposto em x=0.
 * O visual da caixa (cor, borda, barra de destaque) vem do estilo escolhido
 * no editor — ver VIDEO_CARD_STYLES; o layout (posição do texto e da logo)
 * é sempre o mesmo nos 3 estilos.
 */
async function buildOverlayCardPng(
  title: string,
  style: VideoCardStyle,
  logoUrl?: string | null,
): Promise<{ buffer: Buffer; height: number }> {
  const slot: TextSlot = {
    x: SAFE_X + CARD_PADDING_X,
    y: CARD_PADDING_Y,
    width: CARD_WIDTH - CARD_PADDING_X * 2,
    height: TITLE_MAX_TEXT_HEIGHT,
    fontSize: TITLE_FONT_SIZE,
    color: style.textColor,
    align: "center",
    weight: 700,
    lineHeight: TITLE_LINE_HEIGHT,
    transform: "none",
  };

  const rendered = await renderTextToSvg(title, slot);
  const boxHeight = Math.max(1, Math.round(rendered.height + CARD_PADDING_Y * 2));

  const logo = logoUrl ? await loadLogo(logoUrl) : null;
  const totalHeight = boxHeight + (logo ? LOGO_GAP + logo.height : 0);

  const cardRect = `x="${SAFE_X}" y="0" width="${CARD_WIDTH}" height="${boxHeight}" rx="${style.cardRadius}"`;
  const border = style.cardBorder ? ` stroke="${style.cardBorder}" stroke-width="1.5"` : "";
  const box = `<rect ${cardRect} fill="${style.cardFill}" fill-opacity="${style.cardOpacity}"${border}/>`;

  // A barra de destaque é clipada com o mesmo raio da caixa pra não escapar
  // dos cantos arredondados.
  const hasAccent = Boolean(style.accentColor) && style.accentHeight > 0;
  const defs = hasAccent ? `<defs><clipPath id="cardClip"><rect ${cardRect}/></clipPath></defs>` : "";
  const accentBar = hasAccent
    ? `<rect x="${SAFE_X}" y="0" width="${CARD_WIDTH}" height="${style.accentHeight}" fill="${style.accentColor}" clip-path="url(#cardClip)"/>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO_WIDTH}" height="${totalHeight}">` +
    `${defs}${box}${accentBar}${rendered.svg}</svg>`;

  let image = sharp(Buffer.from(svg));
  if (logo) {
    image = sharp(await image.png().toBuffer()).composite([
      {
        input: logo.buffer,
        left: Math.round((VIDEO_WIDTH - logo.width) / 2),
        top: boxHeight + LOGO_GAP,
      },
    ]);
  }

  return { buffer: await image.png().toBuffer(), height: totalHeight };
}

/** Logo redimensionada pra LOGO_HEIGHT, mantendo proporção. */
async function loadLogo(
  logoUrl: string,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const resized = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ height: LOGO_HEIGHT, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    return {
      buffer: resized,
      width: meta.width ?? LOGO_HEIGHT,
      height: meta.height ?? LOGO_HEIGHT,
    };
  } catch {
    // Logo é enfeite: se falhar o download, o vídeo sai sem ela em vez de quebrar.
    return null;
  }
}

/** Progresso 0–1 no intervalo [start, end], travado nas pontas. */
function clamp01Progress(start: number, end: number): string {
  return `min(1,max(0,(t-${start})/${end - start}))`;
}

/** Suaviza um progresso 0–1 linear em uma curva easing (lenta-rápida-lenta). */
function smoothstep(progress: string): string {
  return `(${progress}*${progress}*(3-2*${progress}))`;
}

/**
 * Y do overlay ao longo do tempo: desliza de baixo pra cima na entrada e um
 * pouco pra baixo na saída — sempre com easing (smoothstep) em vez de
 * progresso linear, pra ficar fluido em vez de robótico.
 */
function yExpr(restY: number): string {
  const enterEase = smoothstep(clamp01Progress(FADE_IN_START, FADE_IN_END));
  const exitEase = smoothstep(clamp01Progress(FADE_OUT_START, FADE_OUT_END));
  return `${restY}+(1-${enterEase})*${SLIDE_DISTANCE}+${exitEase}*${EXIT_SLIDE_DISTANCE}`;
}

export async function renderVideoWithAnimatedTitle(
  params: RenderVideoParams,
): Promise<Buffer> {
  const srcPath = await downloadToTemp(params.videoUrl, path.extname(params.videoUrl) || ".mp4");
  const outPath = path.join(os.tmpdir(), `${randomUUID()}-out.mp4`);
  const probe = await probeVideoFile(srcPath);
  const style = buildVideoCardStyles(params.brandColors)[params.videoTemplate ?? DEFAULT_VIDEO_TEMPLATE];
  const card = await buildOverlayCardPng(params.title || "", style, params.logoUrl);
  const cardPath = path.join(os.tmpdir(), `${randomUUID()}-card.png`);
  await fs.writeFile(cardPath, card.buffer);

  // Posição do bloco: padrão encostado no fim da área segura, mais o ajuste
  // do editor — sempre travado dentro da área segura do Reels.
  const restY = clampGroupTop(
    defaultGroupTop(card.height) + (params.titleOffsetY ?? 0),
    card.height,
  );

  const filterComplex = [
    buildNormalizeFilter(probe.width, probe.height, { inputLabel: "0:v", outputLabel: "main" }),
    `[1:v]format=rgba,fade=t=in:st=${FADE_IN_START}:d=${FADE_IN_END - FADE_IN_START}:alpha=1,fade=t=out:st=${FADE_OUT_START}:d=${FADE_OUT_END - FADE_OUT_START}:alpha=1[txt]`,
    // eof_action=pass: quando o cartão acaba (fim da animação), o vídeo segue
    // sem overlay até o próprio fim — e o encode termina junto com ele.
    `[main][txt]overlay=x=0:y='${yExpr(restY)}':eval=frame:format=auto:eof_action=pass[outv]`,
  ].join(";");

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .input(srcPath)
      .input(cardPath)
      // O PNG é um frame só: `-loop 1` vira stream contínuo e `-t` o limita à
      // janela da animação. Sem esse `-t`, o stream do cartão é INFINITO e o
      // encode nunca acaba quando o vídeo de origem não tem faixa de áudio
      // (`-shortest` só se ancora em stream não-filtrado, então não corta nada
      // e o ffmpeg fica duplicando o último frame pra sempre).
      .inputOptions(["-loop", "1", "-t", String(FADE_OUT_END)])
      .complexFilter(filterComplex)
      .outputOptions([
        "-map [outv]",
        "-map 0:a?",
        "-c:v libx264",
        "-preset veryfast",
        "-crf 21",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
      ]);

    // Rede de segurança: sem isso, qualquer encode que não termine deixa a
    // tela do jornalista em "gerando o vídeo…" pra sempre, sem erro nenhum.
    const timer = setTimeout(() => {
      command.kill("SIGKILL");
      reject(new Error(`O render do vídeo passou de ${RENDER_TIMEOUT_MS / 1000}s e foi interrompido.`));
    }, RENDER_TIMEOUT_MS);

    command
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .on("end", () => {
        clearTimeout(timer);
        resolve();
      })
      .save(outPath);
  });

  const buf = await fs.readFile(outPath);
  await Promise.all([
    fs.unlink(srcPath).catch(() => {}),
    fs.unlink(cardPath).catch(() => {}),
    fs.unlink(outPath).catch(() => {}),
  ]);
  return buf;
}

/** Render + upload no storage, devolvendo a URL pública. */
export async function renderVideoAndStore(
  params: RenderVideoParams,
  key: string,
): Promise<string> {
  const buf = await renderVideoWithAnimatedTitle(params);
  const { url } = await putObject(key, buf, "video/mp4");
  return url;
}

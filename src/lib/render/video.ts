import "server-only";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
  titleTiming,
  type TitleTiming,
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

/**
 * Taxa de quadros FIXA da saída. Sem isso a saída herdava a taxa declarada
 * na origem: WebM gravado pelo navegador declara 1000 fps (timebase de 1 ms)
 * e saía um MP4 de 1000 fps — 6.004 frames pra 6 s, render 4x mais lento e
 * rejeitado pelo Instagram (Reels aceita até 60). Câmera lenta (240 fps) e
 * gravação de tela têm o mesmo problema. 30 é o recomendado pro Reels.
 */
const OUTPUT_FPS = 30;

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

/**
 * Duração, dimensões e rotação do vídeo — base do frame do meio e da
 * validação de proporção.
 *
 * Dimensões já na orientação EXIBIDA: celular filmando em pé costuma gravar
 * o arquivo "deitado" (1920x1080) com uma matriz de rotação de 90° — o
 * ffmpeg gira os frames sozinho ao decodificar, mas a largura/altura do
 * stream continuam as do arquivo. Sem trocar aqui, vídeo em pé era tratado
 * como deitado: aviso errado no editor e render ~2,5x mais lento, montando
 * à toa o fundo desfocado (medido em produção).
 */
export async function probeVideoFile(filePath: string): Promise<VideoProbe> {
  const data = await new Promise<ffmpeg.FfprobeData>((resolve, reject) =>
    ffmpeg.ffprobe(filePath, (err, d) => (err ? reject(err) : resolve(d))),
  );
  const stream = data.streams.find((s) => s.codec_type === "video");
  if (!stream) throw new Error("O arquivo enviado não tem faixa de vídeo.");

  // fluent-ffmpeg expõe a matriz de rotação em `rotation`; ffprobe antigo
  // (o do build Linux da Vercel) usa a tag `rotate`. Vale ±90 e ±270.
  const s = stream as typeof stream & { rotation?: string | number; tags?: { rotate?: string } };
  const rotation = Math.abs(Number(s.rotation ?? s.tags?.rotate ?? 0)) % 180;
  const [width, height] =
    rotation === 90 ? [stream.height ?? 0, stream.width ?? 0] : [stream.width ?? 0, stream.height ?? 0];

  // Duração da FAIXA DE VÍDEO, não do container: o áudio costuma ser uns
  // décimos mais longo e a saída do título é calculada pelo fim — tem que
  // terminar antes do último frame de imagem. Sem duração na faixa cai na do
  // container; sem nenhuma das duas (WebM gravado pelo navegador/MediaRecorder
  // não escreve duração no cabeçalho), lê o último pacote — sem isso o título
  // sumia aos ~4s num vídeo de 60s.
  const durationSec =
    Number(stream.duration) || Number(data.format.duration) || (await lastPacketTime(filePath));

  return { durationSec, width, height };
}

/**
 * Timestamp do último pacote de vídeo — só demux (não decodifica), então é
 * rápido mesmo em arquivo grande. 0 se não der pra ler.
 */
function lastPacketTime(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      ffprobeInstaller.path,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", filePath],
      { maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(0);
        let max = 0;
        for (const line of stdout.split("\n")) {
          const t = Number.parseFloat(line);
          if (Number.isFinite(t) && t > max) max = t;
        }
        resolve(max);
      },
    );
  });
}

/**
 * scale+crop que normaliza pra 9:16 vídeos que já são altos o bastante (só
 * corta em cima/embaixo).
 *
 * ATENÇÃO à forma: função + array.join, igual ao blurPadGraph — NÃO uma
 * const `template + template` interpolada dentro de outro template. O
 * minificador do SWC no build Linux (o da Vercel) perdia o último trecho do
 * template da esquerda ao inlinar essa const: o ffmpeg recebia
 * "scale=1080:1920crop=1080:1920" e caía com "Option '1920crop' not found".
 * Reproduzido com `next build` em WSL; no Windows o bundle do servidor sai
 * sem minificar, por isso local sempre funcionou.
 */
function cropGraph(inputLabel?: string, outputLabel?: string): string {
  const input = inputLabel ? `[${inputLabel}]` : "";
  const output = outputLabel ? `[${outputLabel}]` : "";
  return [
    `${input}scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}${output}`,
  ].join(",");
}

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
  return cropGraph(opts.inputLabel, opts.outputLabel);
}

/**
 * fluent-ffmpeg descarta do err.message toda linha de stderr que começa com
 * "[" ou espaço — justamente as linhas "[filtro @ 0x…] Option 'x' not found"
 * que dizem o que quebrou de verdade. Devolve um erro com o comando exato e
 * o stderr inteiro (o ring de ~100 linhas) pra isso não sumir.
 */
function withFfmpegContext(err: Error, command: string, stderr: string | null): Error {
  return new Error(
    `${err.message}\n--- binário ---\n${ffmpegInstaller.path} (${ffmpegInstaller.version})` +
      `\n--- comando ---\n${command}\n--- stderr ---\n${(stderr ?? "").trim()}`,
  );
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
      let command = "";
      ffmpeg(srcPath)
        .seekInput(middle)
        .outputOptions(["-frames:v 1", `-vf ${vf}`, "-q:v 3"])
        .on("start", (cmd: string) => {
          command = cmd;
        })
        .on("error", (err: Error, _stdout: string | null, stderr: string | null) =>
          reject(withFfmpegContext(err, command, stderr)),
        )
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
 * progresso linear, pra ficar fluido em vez de robótico. Sem janela de
 * saída (vídeo curto), só a entrada.
 */
function yExpr(restY: number, timing: TitleTiming): string {
  const enterEase = smoothstep(clamp01Progress(FADE_IN_START, FADE_IN_END));
  const expr = `${restY}+(1-${enterEase})*${SLIDE_DISTANCE}`;
  if (timing.exitStart === null || timing.exitEnd === null) return expr;
  const exitEase = smoothstep(clamp01Progress(timing.exitStart, timing.exitEnd));
  return `${expr}+${exitEase}*${EXIT_SLIDE_DISTANCE}`;
}

/** Filtros do cartão: entra com fade fixo no começo; sai com fade relativo ao fim do vídeo. */
function cardFilter(timing: TitleTiming): string {
  const fadeIn = `fade=t=in:st=${FADE_IN_START}:d=${FADE_IN_END - FADE_IN_START}:alpha=1`;
  const fadeOut =
    timing.exitStart !== null && timing.exitEnd !== null
      ? `,fade=t=out:st=${timing.exitStart}:d=${round2(timing.exitEnd - timing.exitStart)}:alpha=1`
      : "";
  return `[1:v]format=rgba,${fadeIn}${fadeOut}[txt]`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function renderVideoWithAnimatedTitle(
  params: RenderVideoParams,
): Promise<Buffer> {
  const srcPath = await downloadToTemp(params.videoUrl, path.extname(params.videoUrl) || ".mp4");
  const outPath = path.join(os.tmpdir(), `${randomUUID()}-out.mp4`);
  const cardPath = path.join(os.tmpdir(), `${randomUUID()}-card.png`);
  // try/finally: a instância da function é reaproveitada entre requisições
  // (Fluid Compute) e o /tmp é pequeno — se só limpasse no sucesso, cada
  // render que falhasse deixava o vídeo de origem (até 100 MB) no disco, e
  // poucas falhas bastavam pra derrubar os próximos renders daquela instância.
  try {
    return await renderInTemp(params, srcPath, cardPath, outPath);
  } finally {
    await Promise.all([
      fs.unlink(srcPath).catch(() => {}),
      fs.unlink(cardPath).catch(() => {}),
      fs.unlink(outPath).catch(() => {}),
    ]);
  }
}

async function renderInTemp(
  params: RenderVideoParams,
  srcPath: string,
  cardPath: string,
  outPath: string,
): Promise<Buffer> {
  const probe = await probeVideoFile(srcPath);
  const style = buildVideoCardStyles(params.brandColors)[params.videoTemplate ?? DEFAULT_VIDEO_TEMPLATE];
  const card = await buildOverlayCardPng(params.title || "", style, params.logoUrl);
  await fs.writeFile(cardPath, card.buffer);

  // Posição do bloco: padrão encostado no fim da área segura, mais o ajuste
  // do editor — sempre travado dentro da área segura do Reels.
  const restY = clampGroupTop(
    defaultGroupTop(card.height) + (params.titleOffsetY ?? 0),
    card.height,
  );

  // Saída do cartão calculada pelo fim do vídeo: fica na tela o tempo todo
  // e some pouco antes de acabar (ver titleTiming).
  const timing = titleTiming(probe.durationSec);

  const filterComplex = [
    // fps logo na entrada: o resto do grafo (e o encode) já trabalha só com
    // os 30 quadros/s que vão sair — ver OUTPUT_FPS.
    `[0:v]fps=${OUTPUT_FPS}[src]`,
    buildNormalizeFilter(probe.width, probe.height, { inputLabel: "src", outputLabel: "main" }),
    cardFilter(timing),
    // eof_action=pass: quando o cartão acaba (fim da animação), o vídeo segue
    // sem overlay até o próprio fim — e o encode termina junto com ele.
    `[main][txt]overlay=x=0:y='${yExpr(restY, timing)}':eval=frame:format=auto:eof_action=pass[outv]`,
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
      .inputOptions(["-loop", "1", "-t", String(timing.cardEnd)])
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

    let commandLine = "";
    command
      .on("start", (cmd: string) => {
        commandLine = cmd;
      })
      .on("error", (err: Error, _stdout: string | null, stderr: string | null) => {
        clearTimeout(timer);
        reject(withFfmpegContext(err, commandLine, stderr));
      })
      .on("end", () => {
        clearTimeout(timer);
        resolve();
      })
      .save(outPath);
  });

  return fs.readFile(outPath);
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

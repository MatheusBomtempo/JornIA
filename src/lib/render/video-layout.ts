/**
 * Geometria do post de vídeo (Reels 9:16) — compartilhada entre o render do
 * servidor (ffmpeg + Sharp) e o preview do editor no navegador. Os dois
 * PRECISAM usar os mesmos números: o preview só vale alguma coisa se o que o
 * jornalista vê na tela for onde o texto realmente cai no vídeo final.
 *
 * Sem "server-only" de propósito — é só constante e aritmética, e o client
 * importa daqui.
 */

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
/** Todo vídeo é normalizado pra esta proporção, não importa o que foi enviado. */
export const VIDEO_ASPECT = VIDEO_WIDTH / VIDEO_HEIGHT; // 9:16

/**
 * Faixas que a interface do Instagram cobre no Reels — texto e logo nunca
 * entram nelas, senão ficam escondidos atrás do perfil/legenda/botões.
 */
export const SAFE_TOP = Math.round(VIDEO_HEIGHT * 0.14); // 269px
export const SAFE_BOTTOM = Math.round(VIDEO_HEIGHT * 0.2); // 384px
export const SAFE_X = Math.round(VIDEO_WIDTH * 0.06); // 65px
/** Coluna de botões (curtir/comentar/enviar) à direita. */
export const SAFE_RIGHT_ACTIONS = Math.round(VIDEO_WIDTH * 0.19); // 205px

/** Onde a área utilizável termina (início da faixa de legenda/perfil). */
export const CONTENT_BOTTOM = VIDEO_HEIGHT - SAFE_BOTTOM;

// ── Cartão de título ─────────────────────────────────────────
export const CARD_WIDTH = VIDEO_WIDTH - SAFE_X * 2;
export const CARD_PADDING_X = 40;
export const CARD_PADDING_Y = 28;
export const CARD_RADIUS = 24;
export const TITLE_FONT_SIZE = 58;
export const TITLE_LINE_HEIGHT = 1.22;
export const TITLE_MAX_TEXT_HEIGHT = 320;

// ── Logo da empresa (abaixo do texto, centralizada) ──────────
export const LOGO_HEIGHT = 120;
export const LOGO_GAP = 24;

// ── Animação (segundos) ──────────────────────────────────────
export const FADE_IN_START = 0.3;
export const FADE_IN_END = 0.9;
export const HOLD_END = 3.5;
export const FADE_OUT_END = 4.2;
/** Px que o bloco sobe durante a entrada. */
export const SLIDE_DISTANCE = 36;

/** Y padrão do topo do bloco (texto + logo): encostado no fim da área segura. */
export function defaultGroupTop(groupHeight: number): number {
  return CONTENT_BOTTOM - groupHeight;
}

/**
 * Mantém o bloco inteiro dentro da área segura, qualquer que seja o ajuste
 * do jornalista — é o que garante que o texto nunca sobrepõe a UI do Reels.
 */
export function clampGroupTop(top: number, groupHeight: number): number {
  const max = CONTENT_BOTTOM - groupHeight;
  if (max <= SAFE_TOP) return SAFE_TOP;
  return Math.min(max, Math.max(SAFE_TOP, top));
}

/**
 * Quanto do vídeo enviado se perde ao normalizar pra 9:16 (0 = nada).
 * Usado pra avisar quem mandou um vídeo deitado que as laterais vão sumir.
 */
export function cropLossRatio(srcWidth: number, srcHeight: number): number {
  if (!srcWidth || !srcHeight) return 0;
  const srcAspect = srcWidth / srcHeight;
  if (srcAspect > VIDEO_ASPECT) {
    // Mais largo que 9:16 — corta nas laterais.
    return 1 - VIDEO_ASPECT / srcAspect;
  }
  // Mais alto que 9:16 — corta em cima/embaixo.
  return 1 - srcAspect / VIDEO_ASPECT;
}

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
export const TITLE_FONT_SIZE = 58;
export const TITLE_LINE_HEIGHT = 1.22;
export const TITLE_MAX_TEXT_HEIGHT = 320;

// ── Logo da empresa (abaixo do texto, centralizada) ──────────
export const LOGO_HEIGHT = 120;
export const LOGO_GAP = 24;

/**
 * Estilos fixos do cartão de título do vídeo — o jornalista escolhe um, não
 * dá pra criar outro (diferente do ArtTemplate da foto, que tem builder).
 * `accent` é uma barrinha colorida decorativa (largura do cartão); nula nos
 * estilos que não têm.
 */
export interface VideoCardStyle {
  id: "classic" | "light" | "bold";
  /** Cor de fundo do cartão. */
  cardFill: string;
  /** Opacidade do fundo (0–1) — o vídeo por trás aparece através dela. */
  cardOpacity: number;
  cardRadius: number;
  /** Borda sutil (mistura melhor com fundos claros); nula = sem borda. */
  cardBorder: string | null;
  textColor: string;
  /** Barra de destaque no topo do cartão, cor da marca do jornal. */
  accentColor: string | null;
  accentHeight: number;
}

/** Cores da marca configuradas pela empresa (Admin → Empresa). Ambas opcionais. */
export interface CompanyBrandColors {
  dark?: string | null;
  light?: string | null;
}

/** Usado quando a empresa ainda não configurou as cores da marca. */
export const FALLBACK_BRAND_DARK = "#111827";
export const FALLBACK_BRAND_LIGHT = "#f8fafc";

/**
 * Monta os 3 estilos fixos com as cores da marca do jornal. "Clássico" é
 * sempre preto/branco, independente da empresa — só "Claro" e "Destaque"
 * usam a cor escura/clara configurada (ou o fallback, se a empresa não
 * configurou nenhuma ainda).
 */
export function buildVideoCardStyles(
  colors: CompanyBrandColors = {},
): Record<VideoCardStyle["id"], VideoCardStyle> {
  const dark = colors.dark || FALLBACK_BRAND_DARK;
  const light = colors.light || FALLBACK_BRAND_LIGHT;

  return {
    classic: {
      id: "classic",
      cardFill: "#000000",
      cardOpacity: 0.5,
      cardRadius: 24,
      cardBorder: null,
      textColor: "#ffffff",
      accentColor: null,
      accentHeight: 0,
    },
    light: {
      id: "light",
      cardFill: "#f8fafc",
      cardOpacity: 0.96,
      cardRadius: 16,
      cardBorder: "rgba(15,23,42,0.08)",
      textColor: "#0f172a",
      accentColor: dark,
      accentHeight: 8,
    },
    bold: {
      id: "bold",
      cardFill: dark,
      cardOpacity: 1,
      cardRadius: 0,
      cardBorder: null,
      textColor: "#ffffff",
      accentColor: light,
      accentHeight: 3,
    },
  };
}

// "bold" é o 3º template (ver VIDEO_TEMPLATE_ORDER em VideoEditor) — fica
// pré-selecionado tanto na UI quanto no fallback do render server-side.
export const DEFAULT_VIDEO_TEMPLATE: VideoCardStyle["id"] = "bold";

// ── Animação (segundos) ────────────────────────────────────────
// Entrada e saída usam easing (smoothstep) em vez de progresso linear — ver
// `smoothstep`/`clamp01Progress` em render/video.ts — e a saída também
// desliza (não só desaparece), pra ficar simétrica com a entrada e parecer
// mais fluida. A entrada é fixa no começo; a saída é relativa ao FIM do
// vídeo (ver `titleTiming`) — o título fica na tela o vídeo inteiro e só
// some pouco antes de acabar, em vez de piscar por 4 s num Reels de 15.
export const FADE_IN_START = 0.28;
export const FADE_IN_END = 1.05;
/** Duração do fade/slide de saída. */
export const EXIT_DURATION = 0.75;
/** Folga entre o fim da saída e o fim do vídeo — a saída precisa terminar antes do último frame. */
export const EXIT_END_MARGIN = 0.35;
/** Mínimo de leitura parada entre o fim da entrada e o começo da saída. */
export const MIN_HOLD = 0.8;
/** Janela fixa (comportamento antigo) pra quando o ffprobe não informa a duração. */
export const FALLBACK_CARD_END = 4.35;
/** Px que o bloco sobe durante a entrada. */
export const SLIDE_DISTANCE = 46;
/** Px que o bloco desce durante a saída (mais sutil que a entrada). */
export const EXIT_SLIDE_DISTANCE = 22;

export interface TitleTiming {
  /** Início e fim do fade/slide de saída; null = fica até o fim, sem saída. */
  exitStart: number | null;
  exitEnd: number | null;
  /** Até quando o stream do cartão existe (o `-t` do PNG em loop). */
  cardEnd: number;
}

/**
 * Temporização do cartão a partir da duração do vídeo. O `fade` do ffmpeg
 * só aceita instantes absolutos, então a saída é calculada aqui: termina
 * `EXIT_END_MARGIN` antes do fim e dura `EXIT_DURATION`. Vídeo curto demais
 * pra entrada + leitura + saída fica com o cartão até o fim, sem saída.
 * Sem duração conhecida, cai na janela fixa antiga — melhor que arriscar
 * um stream de cartão infinito (encode que nunca termina).
 */
export function titleTiming(durationSec: number): TitleTiming {
  if (!(durationSec > 0)) {
    return {
      exitStart: FALLBACK_CARD_END - EXIT_DURATION,
      exitEnd: FALLBACK_CARD_END,
      cardEnd: FALLBACK_CARD_END,
    };
  }
  const exitEnd = round2(durationSec - EXIT_END_MARGIN);
  const exitStart = round2(exitEnd - EXIT_DURATION);
  if (exitStart < FADE_IN_END + MIN_HOLD) {
    return { exitStart: null, exitEnd: null, cardEnd: round2(durationSec) };
  }
  return { exitStart, exitEnd, cardEnd: exitEnd };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
 * Vídeo DEITADO de verdade (largura > altura, ex.: 16:9) — em vez de cortar
 * as laterais, o render usa uma cópia ampliada, espelhada e desfocada do
 * próprio vídeo como fundo, e mantém o original inteiro e centralizado por
 * cima (ver blurPadGraph em render/video.ts). Nada da imagem se perde.
 *
 * Importante: NÃO usar "srcAspect > VIDEO_ASPECT" aqui — como 9:16 é bem
 * mais estreito que a maioria dos formatos comuns, isso classificaria até
 * vídeo vertical (4:5, 3:4) como "deitado". O critério certo é width > height.
 */
export function needsBlurBackground(srcWidth: number, srcHeight: number): boolean {
  if (!srcWidth || !srcHeight) return false;
  return srcWidth > srcHeight;
}

/**
 * Quanto do vídeo enviado se perde ao normalizar pra 9:16 (0 = nada). Vídeo
 * deitado não cai mais aqui — ver `needsBlurBackground` — só vídeo vertical
 * mais largo que 9:16 (corta as laterais, ex.: 4:5, 3:4) ou mais alto (corta
 * em cima/embaixo).
 */
export function cropLossRatio(srcWidth: number, srcHeight: number): number {
  if (!srcWidth || !srcHeight || needsBlurBackground(srcWidth, srcHeight)) return 0;
  const srcAspect = srcWidth / srcHeight;
  if (srcAspect > VIDEO_ASPECT) return 1 - VIDEO_ASPECT / srcAspect;
  return 1 - srcAspect / VIDEO_ASPECT;
}

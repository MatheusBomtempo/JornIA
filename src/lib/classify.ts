/**
 * Classifica o conteúdo (já markdownificado — ver markdownify.ts) em
 * "estruturado" (boletim de ocorrência, laudo, nota oficial — documentos com
 * campos rotulados) ou "genérico" (matéria de jornal, texto corrido).
 * Puramente por padrão de texto — nenhuma chamada de IA, o que torna essa
 * etapa gratuita e instantânea.
 */

const STRUCTURED_SIGNALS: RegExp[] = [
  /boletim de ocorr[êe]ncia/i,
  /\bnatureza\s*[:\-]/i,
  /\bdata (?:do fato|da ocorr[êe]ncia|do registro)\s*[:\-]/i,
  /\blocal(?: do fato| da ocorr[êe]ncia)?\s*[:\-]/i,
  /\benvolvidos?\s*[:\-]/i,
  /\bv[íi]tima(?:s)?\s*[:\-]/i,
  /\bcomunicante\s*[:\-]/i,
  /\brelato\s*[:\-]?/i,
  /\bhist[óo]rico\s*[:\-]?/i,
  /\bn[º°]\s*(?:de\s*)?(?:registro|ocorr[êe]ncia|bo)\b/i,
  /\blaudo (?:pericial|m[ée]dico)/i,
  /\bnota (?:oficial|[àa] imprensa)/i,
];

export type ContentKind = "structured" | "generic";

/** 2+ sinais de campo rotulado = provavelmente um documento oficial. */
export function classifyContent(text: string): ContentKind {
  const hits = STRUCTURED_SIGNALS.reduce(
    (n, re) => (re.test(text) ? n + 1 : n),
    0,
  );
  return hits >= 2 ? "structured" : "generic";
}

/**
 * "Rótulo: valor" no início de um parágrafo inteiro — mesma ideia de
 * LOOKS_LIKE_LABELED_LINE em markdownify.ts, mas aplicada ao parágrafo já
 * remontado (que pode ter várias frases depois do rótulo).
 */
const LABELED_PARAGRAPH = /^([A-Za-zÀ-ÿ][\wÀ-ÿ ]{0,40})\s*[:\-]\s*(\S[\s\S]*)$/;

/** "Relato: ..." inline (não como cabeçalho de seção próprio). */
const NARRATIVE_INLINE =
  /^\s*(?:relato|hist[óo]rico|descri[çc][ãa]o dos fatos)\s*[:\-]\s*(.+)$/i;
/** Cabeçalho de seção "## RELATO" — o parágrafo seguinte é o valor. */
const NARRATIVE_HEADER =
  /^##\s*(?:relato|hist[óo]rico|descri[çc][ãa]o dos fatos)\b/i;
const DOC_TYPE_HEADER =
  /(boletim de ocorr[êe]ncia|laudo pericial|nota (?:oficial|[àa] imprensa))/i;

/** Rótulos conhecidos ganham um nome de exibição fixo; o resto usa o próprio
 * texto do rótulo como veio no documento (capturado em `labels`, ver baixo). */
const FIELD_LABELS: Record<string, string> = {
  tipo: "Tipo de documento",
  natureza: "Natureza",
  data: "Data",
  local: "Local",
  relato: "Relato",
  dia_semana: "Dia da semana",
};

const FIELD_CAP: Record<string, number> = { relato: 1500 };
const DEFAULT_CAP = 300;

function clipField(key: string, value: string): string {
  const cap = FIELD_CAP[key] ?? DEFAULT_CAP;
  return value.length > cap ? value.slice(0, cap) + "…" : value;
}

/** "natureza", "data do fato", "hora da comunicação" → "natureza", "data", "hora" */
function normalizeKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(do fato|da ocorrencia|do registro)\b/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/**
 * Extrai TODOS os campos rotulados do texto markdownificado, parágrafo por
 * parágrafo — não só uma lista fixa. Um boletim de ocorrência tem dezenas de
 * formatações diferentes ("Causa presumida:", "Vítimas:", "Veículos
 * envolvidos:" …); uma lista fixa de campos reconhecidos jogava fora
 * silenciosamente qualquer rótulo que não estivesse nela, deixando a IA sem
 * fatos reais pra escrever e forçando ela a "preencher" com generalidades
 * (esse foi o bug real que causou informação inventada num post).
 *
 * Heurística, não um parser garantido — mas ao capturar qualquer "Rótulo:
 * valor" em vez de só os que a gente antecipou, a chance de perder um fato
 * relevante cai bastante. O texto genérico (markdownificado) continua
 * servindo de rede de segurança em compact.ts pros casos fora do padrão.
 */
export interface ExtractedFields {
  fields: Record<string, string>;
  /** Rótulo original (como apareceu no documento) pros campos capturados
   * genericamente — pros campos conhecidos, `fieldLabel()` já cobre. */
  labels: Record<string, string>;
}

export function extractStructuredFields(markdownText: string): ExtractedFields {
  const paragraphs = markdownText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const fields: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const setField = (key: string, value: string, label?: string) => {
    if (fields[key]) return;
    fields[key] = clipField(key, value);
    if (label) labels[key] = label;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const headerMatch = p.match(/^##\s+(.+)$/);

    if (headerMatch) {
      const headerText = headerMatch[1];
      if (!fields.relato && NARRATIVE_HEADER.test(p)) {
        const next = paragraphs[i + 1];
        if (next && !next.startsWith("##")) {
          setField("relato", next);
        }
      }
      if (!fields.tipo && DOC_TYPE_HEADER.test(headerText)) {
        setField("tipo", headerText);
      }
      continue;
    }

    if (!fields.relato) {
      const m = p.match(NARRATIVE_INLINE);
      if (m?.[1]?.trim()) {
        setField("relato", m[1].trim());
        continue;
      }
    }
    if (!fields.tipo && DOC_TYPE_HEADER.test(p)) {
      const m = p.match(DOC_TYPE_HEADER);
      if (m) setField("tipo", m[0]);
      continue;
    }

    const labeled = p.match(LABELED_PARAGRAPH);
    if (labeled) {
      const key = normalizeKey(labeled[1]);
      if (key) setField(key, labeled[2].trim(), labeled[1].trim());
    }
  }

  return { fields, labels };
}

const WEEKDAYS_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/**
 * Calcula o dia da semana de uma data em texto (ex.: "19/08/2026") de forma
 * determinística — nunca deixa a IA "calcular" ou adivinhar isso sozinha
 * (é um erro fácil de um modelo de linguagem cometer, e apareceu de verdade
 * num post: data certa, dia da semana errado).
 */
export function weekdayPtBr(dateStr: string): string | null {
  const m = dateStr.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return WEEKDAYS_PT[date.getDay()];
}

export function fieldLabel(key: string, labels?: Record<string, string>): string {
  const captured = labels?.[key];
  if (captured) return captured.charAt(0).toUpperCase() + captured.slice(1);
  return (
    FIELD_LABELS[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

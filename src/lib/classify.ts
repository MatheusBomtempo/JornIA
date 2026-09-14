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

interface LineField {
  key: string;
  patterns: RegExp[];
}

// Cada padrão testa um PARÁGRAFO INTEIRO (já uma linha única, graças ao
// markdownify — sem mais o bug de "[\s\S]+" vazando pro próximo campo).
const LINE_FIELDS: LineField[] = [
  { key: "natureza", patterns: [/^\s*natureza\s*[:\-]\s*(.+)$/i] },
  {
    key: "data",
    patterns: [/^\s*data(?: do fato| da ocorr[êe]ncia| do registro)?\s*[:\-]\s*(.+)$/i],
  },
  {
    key: "local",
    patterns: [/^\s*local(?: do fato| da ocorr[êe]ncia)?\s*[:\-]\s*(.+)$/i],
  },
];

/** "Relato: ..." inline (não como cabeçalho de seção próprio). */
const NARRATIVE_INLINE =
  /^\s*(?:relato|hist[óo]rico|descri[çc][ãa]o dos fatos)\s*[:\-]\s*(.+)$/i;
/** Cabeçalho de seção "## RELATO" — o parágrafo seguinte é o valor. */
const NARRATIVE_HEADER =
  /^##\s*(?:relato|hist[óo]rico|descri[çc][ãa]o dos fatos)\b/i;
const DOC_TYPE_HEADER =
  /(boletim de ocorr[êe]ncia|laudo pericial|nota (?:oficial|[àa] imprensa))/i;

const FIELD_LABELS: Record<string, string> = {
  tipo: "Tipo de documento",
  natureza: "Natureza",
  data: "Data",
  local: "Local",
  relato: "Relato",
};

const FIELD_CAP: Record<string, number> = { relato: 1500 };
const DEFAULT_CAP = 300;

function clipField(key: string, value: string): string {
  const cap = FIELD_CAP[key] ?? DEFAULT_CAP;
  return value.length > cap ? value.slice(0, cap) + "…" : value;
}

/**
 * Extrai campos rotulados do texto markdownificado, parágrafo por
 * parágrafo. Heurística, não um parser garantido — documentos fora do
 * padrão simplesmente não preenchem os campos, e o texto genérico
 * (markdownificado) continua servindo de rede de segurança em compact.ts.
 */
export function extractStructuredFields(markdownText: string): Record<string, string> {
  const paragraphs = markdownText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const fields: Record<string, string> = {};

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const headerMatch = p.match(/^##\s+(.+)$/);

    if (headerMatch) {
      const headerText = headerMatch[1];
      if (!fields.relato && NARRATIVE_HEADER.test(p)) {
        const next = paragraphs[i + 1];
        if (next && !next.startsWith("##")) {
          fields.relato = clipField("relato", next);
        }
      }
      if (!fields.tipo && DOC_TYPE_HEADER.test(headerText)) {
        fields.tipo = clipField("tipo", headerText);
      }
      continue;
    }

    for (const field of LINE_FIELDS) {
      if (fields[field.key]) continue;
      for (const re of field.patterns) {
        const m = p.match(re);
        if (m) {
          fields[field.key] = clipField(field.key, m[1].trim());
          break;
        }
      }
    }

    if (!fields.relato) {
      const m = p.match(NARRATIVE_INLINE);
      if (m?.[1]?.trim()) fields.relato = clipField("relato", m[1].trim());
    }
    if (!fields.tipo && DOC_TYPE_HEADER.test(p)) {
      const m = p.match(DOC_TYPE_HEADER);
      if (m) fields.tipo = clipField("tipo", m[0]);
    }
  }

  return fields;
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

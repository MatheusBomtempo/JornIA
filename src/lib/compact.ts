import { redactSensitive } from "./redact";
import { markdownify } from "./markdownify";
import { classifyContent, extractStructuredFields, fieldLabel } from "./classify";

/**
 * Pipeline de compactação de conteúdo, rodando ANTES da IA:
 *
 *   PDF / URL / TEXTO ──▶ (já normalizado por pdf.ts/scrape.ts)
 *        │
 *        ▼
 *   REDATOR (regex — CPF, telefone, placa, CEP)
 *        │
 *        ▼
 *   MARKDOWNIFY (junta linhas quebradas em parágrafos, remove cabeçalho/
 *                rodapé repetido, marca seções em CAIXA ALTA)
 *        │
 *        ▼
 *   CLASSIFICADOR (estruturado vs. genérico — sem IA)
 *        │
 *   ┌────┴────┐
 *   ▼         ▼
 * ESTRUTURADO GENÉRICO
 * (extrai      (o markdown
 *  campos)      já compacto,
 *               só corta no teto)
 *   └────┬────┘
 *        ▼
 *   TEXTO COMPACTO ──▶ IA (modelo de escrita)
 *
 * Documento estruturado (boletim, laudo, nota oficial): em vez de mandar as
 * 10-20 páginas inteiras pra IA "ler", extrai só os campos relevantes por
 * regra — nenhum token gasto nessa etapa, resultado costuma ser uma fração
 * do tamanho original.
 *
 * Sem nenhum campo reconhecido (matéria de link, texto solto, ou qualquer
 * documento fora do padrão): não corta cegamente o texto bruto — usa o
 * resultado do markdownify (já sem ruído repetido, já em parágrafos de
 * verdade) e só então aplica o teto de tamanho. Genérico de propósito: um
 * PDF de contrato, uma ata de reunião, qualquer coisa sem campos
 * reconhecidos passa por aqui e ainda sai mais legível/compacto que o bruto.
 */

const GENERIC_MAX_CHARS = 3000;

export interface CompactResult {
  kind: "structured" | "generic";
  /** Texto pronto pra entrar no prompt da IA. */
  text: string;
  originalChars: number;
  compactChars: number;
  redactedCount: number;
  removedDuplicateLines: number;
}

export function compactSource(raw: string): CompactResult {
  const trimmed = raw.trim();
  const { text: redacted, redactedCount } = redactSensitive(trimmed);
  const { text: markdown, removedDuplicateLines } = markdownify(redacted);
  const kind = classifyContent(markdown);

  let compactText: string;
  if (kind === "structured") {
    const fields = extractStructuredFields(markdown);
    const lines = Object.entries(fields)
      .filter(([, v]) => v)
      .map(([key, value]) => `${fieldLabel(key)}: ${value}`);
    // Não confia nos campos sozinhos se não veio um relato substancial —
    // sem isso a IA fica só com "Natureza: X" e nenhum fato pra escrever
    // (bug real: um relato inteiro em CAIXA ALTA podia ser mal-detectado
    // como vários cabeçalhos, esvaziando a extração). Nesse caso cai pro
    // markdown inteiro, que sempre tem o conteúdo de verdade.
    const hasSubstance = (fields.relato?.length ?? 0) > 60;
    compactText = hasSubstance ? lines.join("\n") : clip(markdown, GENERIC_MAX_CHARS);
  } else {
    compactText = clip(markdown, GENERIC_MAX_CHARS);
  }

  // Última rede de segurança: se o resultado ficou curto demais perto de um
  // original substancial, algo deu errado na compactação — usa o texto
  // original (só redigido) cortado no teto em vez de mandar quase nada pra IA.
  if (compactText.trim().length < 80 && trimmed.length > 300) {
    compactText = clip(redacted, GENERIC_MAX_CHARS);
  }

  return {
    kind,
    text: compactText,
    originalChars: trimmed.length,
    compactChars: compactText.length,
    redactedCount,
    removedDuplicateLines,
  };
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

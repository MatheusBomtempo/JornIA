import { redactSensitive } from "./redact";
import { markdownify } from "./markdownify";
import {
  classifyContent,
  extractStructuredFields,
  fieldLabel,
  weekdayPtBr,
} from "./classify";
import { looksLikeFormDocument, cleanFormDocument } from "./form-bo";

/**
 * Pipeline de compactação de conteúdo, rodando ANTES da IA:
 *
 *   PDF / URL / TEXTO ──▶ (já normalizado por pdf.ts/scrape.ts)
 *        │
 *        ▼
 *   MARKDOWNIFY (junta linhas quebradas em parágrafos, remove cabeçalho/
 *                rodapé repetido, marca seções em CAIXA ALTA)
 *        │
 *        ▼
 *   REDATOR (regex — CPF, telefone, placa, CEP, "Nome, NN anos") — roda
 *            DEPOIS do markdownify de propósito: um PDF pode quebrar um
 *            nome ou telefone no meio da linha por largura de página, e o
 *            regex só bate na linha já remontada em parágrafo.
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

// Teto do texto que segue pro prompt. Era 3000 na época do Groq gratuito
// (teto de tokens/minuto); com provedor pago barato isso virou o gargalo
// errado: num BO de 15 páginas o corte em 3000 ficava SÓ com o cabeçalho
// burocrático e jogava fora o histórico — a IA inventava a notícia inteira.
const GENERIC_MAX_CHARS = 8000;

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
  const { text: joined, removedDuplicateLines } = markdownify(trimmed);
  const { text: markdown, redactedCount } = redactSensitive(joined);
  const kind = classifyContent(markdown);

  let compactText: string;
  if (kind === "structured" && looksLikeFormDocument(markdown)) {
    // FORMULÁRIO (BO SISP etc.): células viram cabeçalhos soltos e o valor
    // flutua no vizinho — o extrator "Rótulo: valor" não acha nada aqui.
    // O perfil de formulário remove dado pessoal + burocracia, destila os
    // campos noticiosos e traz o histórico pra frente do texto.
    // Whitelist: o descarte em massa do formulário não conta como "redação"
    // no log — redactedCount segue medindo só os padrões de dado sensível.
    const form = cleanFormDocument(markdown);
    compactText = clip(form.text, GENERIC_MAX_CHARS);
  } else if (kind === "structured") {
    const { fields, labels } = extractStructuredFields(markdown);
    const lines = Object.entries(fields)
      .filter(([, v]) => v)
      .map(([key, value]) => `${fieldLabel(key, labels)}: ${value}`);
    // Não confia nos campos sozinhos se não veio conteúdo substancial — sem
    // isso a IA fica só com "Natureza: X" e nenhum fato pra escrever (bug
    // real: um relato inteiro em CAIXA ALTA podia ser mal-detectado como
    // vários cabeçalhos, esvaziando a extração). Um relato longo já basta;
    // na ausência dele, aceita também vários campos rotulados com conteúdo
    // real (ex.: BO que espalha os fatos em "Vítimas:", "Veículos:", "Causa
    // presumida:" em vez de um único parágrafo narrativo). Sem nenhum dos
    // dois, cai pro markdown inteiro, que sempre tem o conteúdo de verdade.
    const totalFieldChars = Object.values(fields).reduce((n, v) => n + v.length, 0);
    const hasSubstance =
      (fields.relato?.length ?? 0) > 60 ||
      (Object.keys(fields).length >= 4 && totalFieldChars > 150);
    compactText = hasSubstance ? lines.join("\n") : clip(markdown, GENERIC_MAX_CHARS);
  } else {
    compactText = clip(markdown, GENERIC_MAX_CHARS);
  }

  // Última rede de segurança: se o resultado ficou curto demais perto de um
  // original substancial, algo deu errado na compactação — usa o texto
  // original (só redigido) cortado no teto em vez de mandar quase nada pra IA.
  if (compactText.trim().length < 80 && trimmed.length > 300) {
    compactText = clip(markdown, GENERIC_MAX_CHARS);
  }

  // Dia da semana calculado por código a partir das datas do texto — NUNCA
  // deixado pro modelo "calcular" (errava de verdade: data certa, dia errado).
  const weekdayLine = computedWeekdayLine(compactText);
  if (weekdayLine) compactText += `\n${weekdayLine}`;

  return {
    kind,
    text: compactText,
    originalChars: trimmed.length,
    compactChars: compactText.length,
    redactedCount,
    removedDuplicateLines,
  };
}

/** "Dia da semana de 19/08/2026: quarta-feira" pra data mais citada no texto. */
function computedWeekdayLine(text: string): string | null {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)) {
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [date, count] of counts) {
    if (count > bestCount) {
      best = date;
      bestCount = count;
    }
  }
  if (!best) return null;
  const weekday = weekdayPtBr(best);
  if (!weekday) return null;
  return `Dia da semana de ${best} (calculado automaticamente — use este, não calcule): ${weekday}`;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

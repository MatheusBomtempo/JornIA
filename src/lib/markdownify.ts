/**
 * Transforma texto bruto extraído de PDF/link num formato mais legível e
 * compacto, sem IA nenhuma — puro processamento de texto:
 *
 *  1. Remove ruído repetido (cabeçalho/rodapé que PDFs repetem em toda
 *     página — ex.: nome da delegacia, "Página X de Y").
 *  2. Junta linhas quebradas pelo PDF (por largura de página, não por
 *     frase) de volta em parágrafos corridos.
 *  3. Marca linhas em CAIXA ALTA como títulos de seção ("## RELATO").
 *
 * Serve tanto pro caminho "documento estruturado" (facilita achar os
 * campos, já que cada um vira um parágrafo único, sem quebra no meio) quanto
 * pro "genérico" (quando nenhum campo reconhecido aparece, isso aqui já é o
 * resultado final — mais enxuto e legível que o texto bruto, em vez de só
 * cortar cegamente).
 */

/**
 * Detecta título de seção ("RELATO", "TESTEMUNHAS", nome de delegacia).
 *
 * "Está em CAIXA ALTA" sozinho NÃO basta: muitos boletins de ocorrência são
 * digitados INTEIROS em caixa alta, inclusive o relato — usar só isso trata
 * cada linha da narrativa como um cabeçalho novo e destrói o texto (bug real
 * encontrado em produção). O sinal que realmente distingue título de frase é
 * o número de palavras: um título é curto (poucas palavras), uma frase
 * narrativa — mesmo em caixa alta — tem muito mais palavras encadeadas.
 */
function looksLikeSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 70) return false;
  if (!/[A-ZÀ-Ú]/.test(trimmed)) return false;
  if (/[a-zà-ú]/.test(trimmed)) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount <= 7;
}

/**
 * "Rótulo: valor" no início da linha (ex.: "Natureza:", "CPF:", "Data do
 * fato:") — sinal de um NOVO campo, mesmo sem linha em branco antes dele no
 * PDF original. Precisa disso porque, ao contrário do fim de frase (que NÃO
 * indica fim de parágrafo — um relato de várias frases deve continuar junto
 * até a próxima linha em branco de verdade), um rótulo sempre começa algo novo.
 */
const LOOKS_LIKE_LABELED_LINE = /^[A-Za-zÀ-ÿ][\wÀ-ÿ ]{0,40}[:\-]\s*\S/;

export interface MarkdownifyResult {
  text: string;
  removedDuplicateLines: number;
}

export function markdownify(raw: string): MarkdownifyResult {
  const lines = raw.split("\n").map((l) => l.trim());

  // 1) Detecta e remove ruído repetido (cabeçalho/rodapé de página): uma
  // linha que aparece 3+ vezes no documento provavelmente não é conteúdo.
  const counts = new Map<string, number>();
  for (const l of lines) {
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const seenNoise = new Set<string>();
  let removedDuplicateLines = 0;
  const deduped: string[] = [];
  for (const l of lines) {
    if (!l) {
      deduped.push("");
      continue;
    }
    const isNoise = (counts.get(l) ?? 0) >= 3 && l.length < 100;
    if (isNoise) {
      if (seenNoise.has(l)) {
        removedDuplicateLines++;
        continue; // já apareceu antes — pula a repetição
      }
      seenNoise.add(l); // mantém a 1ª ocorrência, dá pra ter contexto
    }
    deduped.push(l);
  }

  // 2) Junta linhas quebradas em parágrafos; linhas em CAIXA ALTA viram
  // cabeçalhos de seção Markdown.
  const paragraphs: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer.trim()) paragraphs.push(buffer.trim());
    buffer = "";
  };

  for (const l of deduped) {
    if (!l) {
      flush();
      continue;
    }
    if (looksLikeSectionHeader(l)) {
      flush();
      paragraphs.push(`## ${l}`);
      continue;
    }
    // Só quebra o parágrafo por linha em branco de verdade (tratada acima)
    // ou por um novo rótulo — NUNCA por pontuação de fim de frase, senão um
    // relato de várias frases seria fatiado em vários "parágrafos" soltos.
    if (buffer && LOOKS_LIKE_LABELED_LINE.test(l)) flush();
    buffer = buffer ? `${buffer} ${l}` : l;
  }
  flush();

  return {
    text: paragraphs.join("\n\n"),
    removedDuplicateLines,
  };
}

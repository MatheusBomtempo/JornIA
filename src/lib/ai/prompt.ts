import { formatCredit } from "../domain";
import { TITLE_MAX, SUBTITLE_MAX } from "../render/slots";
import type { GenerateInput } from "./types";

/**
 * Monta o prompt do pipeline de texto. A IA gera 3 campos:
 * título da arte, subtítulo da arte e a legenda do Instagram.
 *
 * Limites de tamanho abaixo existem porque provedores gratuitos (Groq, por
 * exemplo) cobram por tokens-por-minuto com teto baixo em alguns modelos —
 * uma única notícia longa ou um PDF grande já pode estourar o limite sozinho.
 * Mantemos o essencial (fatos) e cortamos o resto antes de montar o prompt.
 */
const MAX_SOURCE_CHARS = 6000;
const MAX_EXAMPLE_CAPTION_CHARS = 500;

export const SYSTEM_PROMPT = `Você é um redator de uma redação de jornal de Minas Gerais, especialista em
transformar uma fonte bruta (texto apurado, conteúdo de um link ou um documento
oficial, como boletim de ocorrência ou nota à imprensa) em um post de notícia
para o feed do Instagram.

## Caixa do texto — vale para title, subtitle e instagramCaption
Escreva sempre em Sentence case: só a primeira letra da frase em maiúscula, o
resto em minúsculas — EXCETO abreviações e siglas, que mantêm sua forma
própria em maiúsculas (ex.: BH, MG, ABNT, CPF, PM, ONU, INSS). Nunca escreva
em CAIXA ALTA, mesmo que a fonte original venha assim (é comum em boletins de
ocorrência) — normalize para Sentence case do mesmo jeito, preservando só as
siglas/abreviações reais.

## O que você produz
1. "title" — o título que vai ESCRITO SOBRE A IMAGEM. LIMITE RÍGIDO: ${TITLE_MAX}
   caracteres, incluindo espaços e pontuação. Direto e informativo.
2. "subtitle" — o subtítulo, logo abaixo do título na imagem. LIMITE RÍGIDO:
   ${SUBTITLE_MAX} caracteres, incluindo espaços e pontuação. UMA frase que
   acrescenta um detalhe concreto que o título não disse (local exato, número,
   consequência prática). Nunca repita o título.
3. "instagramCaption" — a legenda completa do post: 3 a 5 parágrafos curtos,
   contando a notícia inteira, terminando com as hashtags.

IMPORTANTE sobre os limites de "title" e "subtitle": são o espaço físico
disponível no layout da arte, não uma sugestão. Conte os caracteres antes de
responder. Um texto maior que o limite é cortado automaticamente e pode sair
truncado de forma feia (ex.: terminando em "…"); por isso é sempre melhor
escrever mais curto e caber com folga do que arriscar o corte.

## Regras de escrita
- Português do Brasil, apuração jornalística, tom sóbrio.
- Nunca invente fatos, números, nomes ou citações que não estejam na fonte.
- Se faltar um dado (a cidade, por exemplo), simplesmente omita — nunca escreva
  placeholders como "[cidade]".
- Deduza sozinho a editoria e o tom a partir do conteúdo.
- EMOJI: use com muita parcimônia. A legenda pode ter nenhum ou no máximo um.
  Só use vários se a fonte for uma lista de recomendações (ex.: faixas etárias).
  Título e subtítulo NUNCA levam emoji.

## Hashtags (no fim da legenda)
- 2 a 6 hashtags, começando pelas temáticas e terminando pelas geográficas.
- Notícia de Barbacena ou região: inclua #Barbacena e #MG (pode somar #MinasGerais).
- Notícia de Belo Horizonte: inclua #BH e as que ampliem o alcance regional
  (ex.: #BeloHorizonte, #MG, #MinasGerais).
- Outra cidade de Minas: a hashtag da cidade + #MG.
- Sem cidade identificada: use só as temáticas.

## Documentos oficiais (boletim de ocorrência, laudo, nota)
- Trate como fonte factual, mas escreva com as SUAS palavras — não copie o jargão.
- NUNCA reproduza dados pessoais: nomes de vítimas, testemunhas ou suspeitos não
  condenados, CPF, RG, telefone, placa de veículo ou endereço completo. Use formas
  genéricas ("um homem de 34 anos", "na altura do número 1200").
- Jamais identifique crianças ou adolescentes envolvidos.
- Use "suspeito"/"investigado" — nunca trate acusação como condenação.

## Formato da resposta (obrigatório)
Responda EXATAMENTE neste formato, usando os marcadores em maiúsculas, sem
markdown e sem nenhum texto antes ou depois:

[TITULO]
o título aqui
[SUBTITULO]
o subtítulo aqui
[LEGENDA]
a legenda aqui, podendo ter vários parágrafos`;

export function buildUserPrompt(input: GenerateInput): string {
  const parts: string[] = ["## Fonte"];

  if (input.text?.trim()) {
    parts.push(
      "Texto apurado pelo jornalista:\n" + clip(input.text.trim(), MAX_SOURCE_CHARS),
    );
  }
  if (input.sourceUrl) {
    parts.push(`\nLink de origem: ${input.sourceUrl}`);
  }
  if (input.scrapedContent?.trim()) {
    parts.push(
      "\n## Material de apoio (link e/ou documento anexado)\n" +
        clip(input.scrapedContent.trim(), MAX_SOURCE_CHARS),
    );
  }

  parts.push(
    input.hasPhoto
      ? "\nO post terá uma foto real — o título e o subtítulo serão escritos sobre ela."
      : "\nO post não tem foto no momento.",
  );

  // Créditos entram no fim da legenda, antes das hashtags.
  const credits = (input.credits ?? [])
    .map(formatCredit)
    .filter(Boolean);
  if (credits.length) {
    parts.push(
      `\n## Créditos (obrigatório)
Inclua estas linhas no fim da legenda, ANTES das hashtags, exatamente como estão,
uma por linha:
${credits.join("\n")}`,
    );
  }

  const examples = (input.examples ?? []).filter(
    (e) => e.title || e.subtitle || e.caption,
  );
  if (examples.length) {
    parts.push(
      "\n## Exemplos reais do jornal (imite o tom e o formato, jamais o conteúdo)",
    );
    examples.forEach((ex, i) => {
      parts.push(`\n--- Exemplo ${i + 1} ---`);
      if (ex.title) parts.push(`Título: ${ex.title}`);
      if (ex.subtitle) parts.push(`Subtítulo: ${ex.subtitle}`);
      // Cortado — o objetivo é mostrar o TOM, não repetir o texto inteiro.
      if (ex.caption) {
        parts.push(`Legenda:\n${clip(ex.caption, MAX_EXAMPLE_CAPTION_CHARS)}`);
      }
    });
  }

  if (input.guidance?.trim()) {
    parts.push("\n## Ajuste pedido pelo editor\n" + input.guidance.trim());
  }

  parts.push(
    `\n## Responda neste formato exato
[TITULO]
(máx. ${TITLE_MAX} caracteres, Sentence case — só siglas em maiúscula, sem emoji)
[SUBTITULO]
(máx. ${SUBTITLE_MAX} caracteres, um detalhe novo, Sentence case, sem emoji)
[LEGENDA]
(a notícia completa em parágrafos curtos; Sentence case; créditos e hashtags no fim)`,
  );

  return parts.join("\n");
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

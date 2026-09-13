import type { GenerateInput } from "./types";

/**
 * Monta o prompt do pipeline de texto. A IA gera 4 campos:
 * título, notícia curta, legenda do Instagram e o texto sugerido da arte.
 */

export const SYSTEM_PROMPT = `Você é um redator de uma redação de jornal brasileira, especialista em transformar
uma fonte bruta (foto legendada, texto pronto ou conteúdo de um link) em um post de
notícia para o feed do Instagram.

Regras:
- Escreva em português do Brasil, com apuração jornalística e tom sóbrio.
- Nunca invente fatos, números, nomes ou citações que não estejam na fonte.
- Se a fonte for vaga, seja conservador: não extrapole.
- O "título" é uma manchete curta e direta (máx. ~70 caracteres).
- A "notícia curta" tem 2 a 4 frases, factual, sem opinião.
- A "legenda do Instagram" é mais coloquial, pode ter 1 ou 2 hashtags relevantes
  e um call-to-action leve; evite exageros e clickbait.
- O "texto da arte" é curtíssimo (o que vai escrito sobre a imagem): no máximo
  ~10 palavras, em caixa alta ou não conforme o exemplo de referência.
- Responda ESTRITAMENTE com um objeto JSON válido, sem markdown, sem comentários.`;

export function buildUserPrompt(input: GenerateInput): string {
  const parts: string[] = [];

  parts.push("## Fonte");
  parts.push(`Tipo de fonte: ${input.sourceType}`);
  if (input.region) parts.push(`Região/editoria: ${input.region}`);

  if (input.sourceType === "text" && input.sourceText) {
    parts.push("\nTexto enviado pelo jornalista:\n" + input.sourceText.trim());
  }
  if (input.sourceType === "link") {
    if (input.sourceUrl) parts.push(`\nLink de origem: ${input.sourceUrl}`);
    if (input.scrapedContent) {
      parts.push(
        "\nConteúdo extraído do link:\n" +
          input.scrapedContent.trim().slice(0, 8000),
      );
    }
  }
  if (input.sourceType === "photo") {
    parts.push(
      "\nA fonte é uma foto. Use a legenda/descrição fornecida como base factual:",
    );
    if (input.sourceText) parts.push(input.sourceText.trim());
    else parts.push("(sem legenda — gere um texto genérico e sinalize que precisa de apuração)");
  }

  if (input.style) {
    parts.push("\n## Exemplo de referência de estilo (imite o tom, não o conteúdo)");
    if (input.style.title) parts.push(`Título de exemplo: ${input.style.title}`);
    if (input.style.shortNews)
      parts.push(`Notícia curta de exemplo: ${input.style.shortNews}`);
    if (input.style.caption)
      parts.push(`Legenda de exemplo: ${input.style.caption}`);
    if (input.style.artText)
      parts.push(`Texto de arte de exemplo: ${input.style.artText}`);
  }

  if (input.guidance) {
    parts.push("\n## Ajuste pedido pelo editor\n" + input.guidance.trim());
  }

  parts.push(
    `\n## Formato da resposta
Responda apenas com este JSON:
{
  "title": "...",
  "shortNews": "...",
  "instagramCaption": "...",
  "artText": "..."
}`,
  );

  return parts.join("\n");
}

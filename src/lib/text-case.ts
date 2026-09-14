/**
 * Transformações de caixa para o texto da arte. Compartilhado entre o
 * render do servidor (Sharp/opentype) e os previews no cliente (Fabric.js,
 * construtor de template) para garantir que mostram sempre o mesmo resultado.
 */
export type TextTransform = "none" | "sentence" | "capitalize" | "uppercase";

export function applyTextCase(text: string, transform?: TextTransform): string {
  switch (transform) {
    case "uppercase":
      return text.toLocaleUpperCase("pt-BR");

    case "capitalize":
      // Cada Palavra Com Inicial Maiúscula.
      return text.replace(
        /(^|\s)(\p{L})/gu,
        (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("pt-BR"),
      );

    case "sentence": {
      // Só a primeira letra da frase, resto em minúsculas.
      const lower = text.toLocaleLowerCase("pt-BR");
      return lower.replace(
        /^(\s*)(\p{L})/u,
        (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("pt-BR"),
      );
    }

    default:
      return text;
  }
}

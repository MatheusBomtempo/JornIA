import "server-only";

/**
 * Extração de texto de PDF (boletim de ocorrência, nota oficial, matéria).
 *
 * O pdf.js usado pelo `unpdf` depende de `Promise.withResolvers`, que só existe
 * a partir do Node 22. Como o projeto suporta Node 20, aplicamos o polyfill
 * antes de carregar a biblioteca. Em Node 22+ isso é um no-op.
 */
if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== "function") {
  (Promise as unknown as { withResolvers: unknown }).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/** Teto de caracteres enviados à IA (evita estourar a janela de contexto). */
export const MAX_DOC_CHARS = 20000;

export interface ExtractedDocument {
  text: string;
  pages: number;
  truncated: boolean;
}

export async function extractPdfText(
  buffer: Buffer,
): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    throw new Error(
      "Não foi possível ler o PDF (arquivo corrompido ou protegido por senha).",
    );
  }

  const { text, totalPages } = await extractText(doc, { mergePages: true });
  const normalized = normalize(Array.isArray(text) ? text.join("\n") : text);

  if (!normalized) {
    throw new Error(
      "O PDF não tem texto selecionável — provavelmente é um documento escaneado (imagem). Copie o texto manualmente.",
    );
  }

  return {
    text: normalized.slice(0, MAX_DOC_CHARS),
    pages: totalPages,
    truncated: normalized.length > MAX_DOC_CHARS,
  };
}

/** Texto simples (.txt) — mesma normalização. */
export function extractPlainText(buffer: Buffer): ExtractedDocument {
  const normalized = normalize(buffer.toString("utf8"));
  if (!normalized) throw new Error("O arquivo está vazio.");
  return {
    text: normalized.slice(0, MAX_DOC_CHARS),
    pages: 1,
    truncated: normalized.length > MAX_DOC_CHARS,
  };
}

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

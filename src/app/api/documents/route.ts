import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { extractPdfText, extractPlainText } from "@/lib/pdf";
import { badRequest, ok, route } from "@/lib/http";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const PDF_TYPES = new Set(["application/pdf"]);
const TXT_TYPES = new Set(["text/plain", "text/markdown"]);

/**
 * POST /documents — recebe um PDF (boletim de ocorrência, nota oficial,
 * matéria) ou .txt e devolve o texto extraído, que o jornalista anexa
 * à pauta como material de apoio para a IA.
 *
 * O arquivo não é armazenado: guardamos apenas o texto, junto do post.
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Campo 'file' ausente.");
  if (file.size > MAX_BYTES) throw badRequest("O arquivo passa de 20 MB.");

  const isPdf = PDF_TYPES.has(file.type) || file.name.toLowerCase().endsWith(".pdf");
  const isTxt = TXT_TYPES.has(file.type) || /\.(txt|md)$/i.test(file.name);
  if (!isPdf && !isTxt) {
    throw badRequest("Formato não suportado. Envie um PDF (ou .txt).");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = isPdf ? await extractPdfText(buffer) : extractPlainText(buffer);
  } catch (err) {
    throw badRequest((err as Error).message);
  }

  return ok({
    name: file.name,
    pages: result.pages,
    chars: result.text.length,
    truncated: result.truncated,
    text: result.text,
  });
});

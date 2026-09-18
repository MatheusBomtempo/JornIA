import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { isPhotoSearchEnabled, searchPhotos } from "@/lib/services/photo-search";
import { badRequest, ok, route } from "@/lib/http";

// GET /photo-search?q=&page= — busca embutida no Pexels pra anexar foto sem
// sair do site (ver ImageSuggestions/PhotoPickerModal em PostWorkspace).
// Sem PEXELS_API_KEY configurada, devolve enabled:false (o botão cai pra
// abrir a busca numa aba nova, como antes).
export const GET = route(async (req: NextRequest) => {
  await requireCompanyUser();
  if (!isPhotoSearchEnabled()) return ok({ enabled: false as const });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) throw badRequest("Parâmetro 'q' ausente.");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const { photos, nextPage } = await searchPhotos(q, page);
  return ok({ enabled: true as const, photos, nextPage });
});

-- Frame do meio do vídeo (já normalizado em 9:16) + dimensões do arquivo
-- enviado. O frame é o fundo do preview no editor; width/height servem pra
-- avisar quanto das laterais o enquadramento 9:16 vai cortar.
ALTER TABLE "post_videos" ADD COLUMN "preview_frame_url" TEXT;
ALTER TABLE "post_videos" ADD COLUMN "width" INTEGER;
ALTER TABLE "post_videos" ADD COLUMN "height" INTEGER;

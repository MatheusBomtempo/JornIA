-- Multi-tenant: introduz "companies" (empresas/redações). Cada empresa passa
-- a ter seu próprio feed, templates, exemplos de estilo, API keys e
-- configurações — isolados das demais. Como só havia 1 tenant até aqui, esta
-- migration cria uma empresa padrão e liga tudo que já existe a ela (ver o
-- bloco DO $$ abaixo); nenhum dado é perdido.
--
-- Também adiciona post_videos + os campos de vídeo em post_versions
-- (selected_video_id, rendered_video_url) — suporte a posts de vídeo.

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "instagram_handle" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_videos" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "storage_url" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "order_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_videos_pkey" PRIMARY KEY ("id")
);

-- AlterTable: company_id nullable por enquanto — trava NOT NULL depois do backfill.
ALTER TABLE "users" ADD COLUMN "company_id" UUID;
ALTER TABLE "posts" ADD COLUMN "company_id" UUID;
ALTER TABLE "art_templates" ADD COLUMN "company_id" UUID;
ALTER TABLE "style_examples" ADD COLUMN "company_id" UUID;
ALTER TABLE "api_keys" ADD COLUMN "company_id" UUID;
ALTER TABLE "post_audit_log" ADD COLUMN "company_id" UUID;

-- AlterTable: post_versions ganha os campos de vídeo.
ALTER TABLE "post_versions" ADD COLUMN "selected_video_id" UUID;
ALTER TABLE "post_versions" ADD COLUMN "rendered_video_url" TEXT;

-- AlterTable: app_settings troca a PK fixa (id sempre 1) por um uuid de
-- verdade + company_id único (1 linha de config por empresa).
ALTER TABLE "app_settings" ADD COLUMN "company_id" UUID;
ALTER TABLE "app_settings" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- Backfill: cria a empresa padrão e liga tudo que já existe a ela.
DO $$
DECLARE
  default_company_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO "companies" ("id", "name", "created_at")
  VALUES (default_company_id, 'Minha Empresa', CURRENT_TIMESTAMP);

  UPDATE "users" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "posts" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "art_templates" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "style_examples" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "api_keys" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "post_audit_log" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
  UPDATE "app_settings" SET "company_id" = default_company_id WHERE "company_id" IS NULL;
END $$;

-- Agora que todo mundo tem company_id, trava NOT NULL onde é obrigatório.
-- users.company_id fica de propósito opcional: um admin recém-criado sem
-- empresa ainda passa pelo onboarding (ver /onboarding) antes de criar uma.
ALTER TABLE "posts" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "art_templates" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "style_examples" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "post_audit_log" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "app_settings" ALTER COLUMN "company_id" SET NOT NULL;

-- app_settings: troca de fato a PK (id inteiro fixo -> uuid).
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey";
ALTER TABLE "app_settings" DROP COLUMN "id";
ALTER TABLE "app_settings" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_company_id_key" UNIQUE ("company_id");

-- CreateIndex
CREATE INDEX "posts_company_id_idx" ON "posts"("company_id");
CREATE INDEX "art_templates_company_id_idx" ON "art_templates"("company_id");
CREATE INDEX "style_examples_company_id_idx" ON "style_examples"("company_id");
CREATE INDEX "api_keys_company_id_idx" ON "api_keys"("company_id");
CREATE INDEX "post_audit_log_company_id_idx" ON "post_audit_log"("company_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "art_templates" ADD CONSTRAINT "art_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "style_examples" ADD CONSTRAINT "style_examples_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_videos" ADD CONSTRAINT "post_videos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_selected_video_id_fkey" FOREIGN KEY ("selected_video_id") REFERENCES "post_videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- post_audit_log agora exige company_id — purge_posts() precisa gravá-lo
-- (ver prisma/migrations/20260915120000_purge_posts_function).
CREATE OR REPLACE FUNCTION purge_posts(post_ids UUID[]) RETURNS void AS $$
DECLARE
  expired RECORD;
BEGIN
  FOR expired IN
    SELECT p.id, p.status, p.created_at, p.company_id, u.name AS author_name
    FROM posts p
    JOIN users u ON u.id = p.created_by
    WHERE p.id = ANY(post_ids)
  LOOP
    INSERT INTO post_audit_log
      (id, post_id, company_id, title, status, author_name, created_at, published_at, purged_at)
    SELECT
      gen_random_uuid(),
      expired.id,
      expired.company_id,
      (SELECT v.title FROM post_versions v
         WHERE v.post_id = expired.id
         ORDER BY v.version_number DESC LIMIT 1),
      expired.status,
      expired.author_name,
      expired.created_at,
      (SELECT pub.published_at FROM publications pub
         JOIN post_versions v2 ON v2.id = pub.post_version_id
         WHERE v2.post_id = expired.id AND pub.status = 'published'
         ORDER BY pub.published_at DESC LIMIT 1),
      now();

    DELETE FROM review_decisions
      WHERE post_version_id IN (SELECT id FROM post_versions WHERE post_id = expired.id);
    DELETE FROM publications
      WHERE post_version_id IN (SELECT id FROM post_versions WHERE post_id = expired.id);
    -- post_versions, post_photos e post_videos têm ON DELETE CASCADE a partir de posts.
    DELETE FROM posts WHERE id = expired.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'manager', 'staff');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'staff',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by" UUID,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "region" TEXT,
    "source_type" TEXT NOT NULL,
    "source_text" TEXT,
    "source_url" TEXT,
    "scraped_content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing_ai',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_photos" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "storage_url" TEXT NOT NULL,
    "order_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "art_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "canvas_width" INTEGER NOT NULL DEFAULT 1080,
    "canvas_height" INTEGER NOT NULL DEFAULT 1080,
    "overlay_asset_url" TEXT NOT NULL,
    "photo_slot" JSONB NOT NULL,
    "text_slot" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "art_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_reference" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "example_title" TEXT,
    "example_short_news" TEXT,
    "example_caption" TEXT,
    "example_art_text" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_versions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "title" TEXT,
    "short_news" TEXT,
    "instagram_caption" TEXT,
    "art_text" TEXT,
    "selected_photo_id" UUID,
    "photo_transform" JSONB,
    "art_template_id" UUID,
    "rendered_art_url" TEXT,
    "edited_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL,
    "post_version_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "post_version_id" UUID NOT NULL,
    "instagram_media_id" TEXT,
    "instagram_post_url" TEXT,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "posts_status_idx" ON "posts"("status");

-- CreateIndex
CREATE INDEX "posts_created_by_idx" ON "posts"("created_by");

-- CreateIndex
CREATE INDEX "post_versions_post_id_idx" ON "post_versions"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_versions_post_id_version_number_key" ON "post_versions"("post_id", "version_number");

-- CreateIndex
CREATE INDEX "review_decisions_post_version_id_idx" ON "review_decisions"("post_version_id");

-- CreateIndex
CREATE INDEX "publications_post_version_id_idx" ON "publications"("post_version_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_photos" ADD CONSTRAINT "post_photos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_reference" ADD CONSTRAINT "style_reference_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_selected_photo_id_fkey" FOREIGN KEY ("selected_photo_id") REFERENCES "post_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_art_template_id_fkey" FOREIGN KEY ("art_template_id") REFERENCES "art_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_post_version_id_fkey" FOREIGN KEY ("post_version_id") REFERENCES "post_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_version_id_fkey" FOREIGN KEY ("post_version_id") REFERENCES "post_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

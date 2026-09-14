-- AlterTable
ALTER TABLE "art_templates" ADD COLUMN     "subtitle_slot" JSONB;

-- AlterTable
ALTER TABLE "post_versions" ADD COLUMN     "subtitle" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "credits" JSONB;

-- CreateTable
CREATE TABLE "style_examples" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "caption" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "style_examples_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "style_examples" ADD CONSTRAINT "style_examples_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

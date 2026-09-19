-- AlterTable
ALTER TABLE "app_settings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post_versions" ADD COLUMN     "video_template" TEXT NOT NULL DEFAULT 'classic';

-- CreateTable
CREATE TABLE "post_audit_log" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "purged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_audit_log_purged_at_idx" ON "post_audit_log"("purged_at");

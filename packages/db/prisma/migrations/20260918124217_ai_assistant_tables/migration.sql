-- CreateEnum
CREATE TYPE "ai_run_kind" AS ENUM ('product_description', 'store_summary');

-- CreateEnum
CREATE TYPE "ai_run_status" AS ENUM ('ok', 'failed');

-- CreateTable
CREATE TABLE "ai_summary" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "metric_snapshot" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "dismissed_at" TIMESTAMPTZ(3),
    "is_seed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ai_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_run_log" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "summary_id" TEXT,
    "kind" "ai_run_kind" NOT NULL,
    "status" "ai_run_status" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "response_text" TEXT,
    "error_code" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ai_run_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_summary_store_id_generated_at_idx" ON "ai_summary"("store_id", "generated_at");

-- CreateIndex
CREATE INDEX "ai_run_log_store_id_created_at_idx" ON "ai_run_log"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_run_log_summary_id_idx" ON "ai_run_log"("summary_id");

-- AddForeignKey
ALTER TABLE "ai_summary" ADD CONSTRAINT "ai_summary_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run_log" ADD CONSTRAINT "ai_run_log_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_run_log" ADD CONSTRAINT "ai_run_log_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "ai_summary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

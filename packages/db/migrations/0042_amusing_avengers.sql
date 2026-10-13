ALTER TABLE "memories" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "embedding_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "memories_embedding_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);
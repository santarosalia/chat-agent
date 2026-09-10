-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chat_agent";

-- CreateTable
CREATE TABLE "chat_agent"."messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rag_used" BOOLEAN,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_role_check" CHECK ("role" IN ('user', 'assistant'))
);

-- CreateIndex
CREATE INDEX "messages_session_id_created_at_idx" ON "chat_agent"."messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_user_id_session_id_created_at_idx" ON "chat_agent"."messages"("user_id", "session_id", "created_at");

import { db, memory, memoryHistory, memoryPreference } from "@/db";
import { createMemoryEmbedding } from "@/lib/memory/retrieval";
import type { ActorContext, ChatMessage } from "@/lib/types";
import type { Tool, UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

export function rememberMemory(params: {
  session: ActorContext;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
  return tool({
    description:
      "Save a useful, durable personal fact or preference for the user. Only use this when the user explicitly asks you to remember something or clearly provides a stable preference that will improve future conversations.",
    inputSchema: z.object({
      key: z.string().trim().min(1).max(200),
      content: z.string().trim().min(1).max(20_000),
      importance: z.number().int().min(0).max(100).default(60),
    }),
    execute: async (input) => {
      if (!params.session.organizationId)
        throw new Error("An organization is required for personal memory");
      const preference = await db.query.memoryPreference.findFirst({
        where: and(
          eq(memoryPreference.organizationId, params.session.organizationId),
          eq(memoryPreference.userId, params.session.userId),
        ),
      });
      if (preference && !preference.savedMemoryEnabled) {
        return {
          status: "disabled",
          message: "Saved memory is disabled for this user.",
        };
      }

      const existing = await db.query.memory.findFirst({
        where: and(
          eq(memory.organizationId, params.session.organizationId),
          eq(memory.scope, "user"),
          eq(memory.userId, params.session.userId),
          eq(memory.key, input.key),
        ),
      });
      const embedding = await createMemoryEmbedding({
        key: input.key,
        content: input.content,
        userId: params.session.userId,
      });
      if (existing) {
        await db.insert(memoryHistory).values({
          memoryId: existing.id,
          organizationId: existing.organizationId,
          userId: existing.userId ?? existing.createdBy,
          key: existing.key,
          content: existing.content,
          metadata: existing.metadata,
          importance: existing.importance,
        });
      }
      const [saved] = existing
        ? await db
            .update(memory)
            .set({
              content: input.content,
              importance: input.importance,
              embedding: embedding?.embedding ?? null,
              embeddingModel: embedding?.model ?? null,
              embeddingUpdatedAt: embedding ? new Date() : null,
              sourceType: "chat",
              sourceId: params.chatId,
              updatedAt: new Date(),
            })
            .where(eq(memory.id, existing.id))
            .returning()
        : await db
            .insert(memory)
            .values({
              organizationId: params.session.organizationId,
              userId: params.session.userId,
              chatId: null,
              agentId: null,
              createdBy: params.session.userId,
              scope: "user",
              key: input.key,
              content: input.content,
              embedding: embedding?.embedding ?? null,
              embeddingModel: embedding?.model ?? null,
              embeddingUpdatedAt: embedding ? new Date() : null,
              importance: input.importance,
              sourceType: "chat",
              sourceId: params.chatId,
            })
            .returning();
      if (!saved) throw new Error("Unable to save personal memory");
      if (preference?.automaticManagementEnabled !== false) {
        await db
          .insert(memoryPreference)
          .values({
            organizationId: params.session.organizationId,
            userId: params.session.userId,
          })
          .onConflictDoNothing();
        const memories = await db.query.memory.findMany({
          where: and(
            eq(memory.organizationId, params.session.organizationId),
            eq(memory.scope, "user"),
            eq(memory.userId, params.session.userId),
          ),
          orderBy: desc(memory.importance),
          limit: 100,
        });
        await db
          .update(memoryPreference)
          .set({
            summary:
              memories
                .map((entry) => `- ${entry.key}: ${entry.content}`)
                .join("\n") || null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                memoryPreference.organizationId,
                params.session.organizationId,
              ),
              eq(memoryPreference.userId, params.session.userId),
            ),
          );
      }
      params.dataStream.write({
        type: "data-memoryUpdated",
        data: { id: saved.id, key: saved.key },
        transient: false,
      });
      return {
        status: "saved",
        memoryId: saved.id,
        message: "Saved as a personal memory for future conversations.",
      };
    },
  });
}

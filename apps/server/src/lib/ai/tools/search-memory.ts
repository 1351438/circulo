import { memory } from "@/db";
import { retrieveMemories } from "@/lib/memory/retrieval";
import type { Tool } from "ai";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

export function searchMemory(params: {
  organizationId: string;
  userId: string;
  chatId: string;
  canReadUserMemory: boolean;
  canReadOrganizationMemory: boolean;
  canReadChatMemory: boolean;
  readableAgentIds: string[];
}): Tool {
  return {
    description:
      "Search the memories this chat is authorized to use. Results are limited by workspace, chat, and enabled-agent policy.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(500),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    execute: async ({ query, limit }) => {
      const scopes = [
        ...(params.canReadUserMemory
          ? [and(eq(memory.scope, "user"), eq(memory.userId, params.userId))]
          : []),
        ...(params.canReadOrganizationMemory
          ? [eq(memory.scope, "organization")]
          : []),
        ...(params.canReadChatMemory
          ? [and(eq(memory.scope, "chat"), eq(memory.chatId, params.chatId))]
          : []),
        ...(params.readableAgentIds.length
          ? [
              and(
                eq(memory.scope, "agent"),
                or(
                  ...params.readableAgentIds.map((id) =>
                    eq(memory.agentId, id),
                  ),
                ),
              ),
            ]
          : []),
      ];
      if (!scopes.length) return { results: [] };
      const results = await retrieveMemories({
        organizationId: params.organizationId,
        userId: params.userId,
        scopes,
        query,
        limit,
      });
      return {
        results: results.map((item) => ({
          id: item.id,
          scope: item.scope,
          key: item.key,
          content: item.content,
        })),
      };
    },
  };
}

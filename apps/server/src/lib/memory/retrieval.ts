import { db, memory } from "@/db";
import { createKnowledgeEmbeddingWithMetadata } from "@/lib/knowledge/embeddings";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

const MAX_MEMORY_RESULTS = 20;

export async function retrieveMemories(params: {
  organizationId: string;
  userId: string;
  scopes: Array<SQL | undefined>;
  query: string;
  limit: number;
  queryEmbedding?: { embedding: number[]; model: string } | null;
}) {
  const scopes = params.scopes.filter((scope): scope is SQL => Boolean(scope));
  if (!scopes.length) return [];
  const query = params.query.trim();
  if (!query) return [];

  const queryEmbedding =
    params.queryEmbedding === undefined
      ? await createKnowledgeEmbeddingWithMetadata(query, "", {
          userId: params.userId,
        }).catch(() => null)
      : params.queryEmbedding;
  const lexicalRank = sql<number>`ts_rank(
    to_tsvector('simple', ${memory.key} || ' ' || ${memory.content}),
    plainto_tsquery('simple', ${query})
  )`;
  const lexicalMatch = sql`to_tsvector(
    'simple', ${memory.key} || ' ' || ${memory.content}
  ) @@ plainto_tsquery('simple', ${query})`;
  const baseConditions = and(
    sql`${memory.organizationId} = ${params.organizationId}`,
    or(...scopes),
  );
  const candidateLimit = Math.max(
    40,
    Math.min(params.limit * 8, MAX_MEMORY_RESULTS * 8),
  );
  const [lexicalCandidates, semanticCandidates] = await Promise.all([
    db.query.memory.findMany({
      where: and(baseConditions, lexicalMatch),
      orderBy: desc(lexicalRank),
      limit: candidateLimit,
    }),
    queryEmbedding
      ? db.query.memory.findMany({
          where: and(
            baseConditions,
            eq(memory.embeddingModel, queryEmbedding.model),
            sql`${memory.embedding} IS NOT NULL`,
          ),
          orderBy: asc(
            sql`${memory.embedding} <=> ${JSON.stringify(queryEmbedding.embedding)}::vector`,
          ),
          limit: candidateLimit,
        })
      : Promise.resolve([]),
  ]);

  const ranked = new Map<
    string,
    { item: (typeof lexicalCandidates)[number]; score: number }
  >();
  const addRanked = (items: typeof lexicalCandidates, weight: number) => {
    items.forEach((item, index) => {
      const existing = ranked.get(item.id);
      ranked.set(item.id, {
        item,
        score: (existing?.score ?? 0) + weight / (60 + index + 1),
      });
    });
  };
  addRanked(lexicalCandidates, 1);
  addRanked(semanticCandidates, 1);
  const results = [...ranked.values()]
    .sort((a, b) => {
      if (a.item.isPinned !== b.item.isPinned) return a.item.isPinned ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      if (a.item.importance !== b.item.importance)
        return b.item.importance - a.item.importance;
      return b.item.updatedAt.getTime() - a.item.updatedAt.getTime();
    })
    .slice(0, Math.max(1, Math.min(params.limit, MAX_MEMORY_RESULTS)))
    .map(({ item }) => item);

  if (results.length) {
    await db
      .update(memory)
      .set({ lastUsedAt: new Date() })
      .where(
        inArray(
          memory.id,
          results.map((item) => item.id),
        ),
      );
  }

  return results;
}

export async function createMemoryEmbedding(params: {
  key: string;
  content: string;
  userId: string;
}) {
  try {
    return await createKnowledgeEmbeddingWithMetadata(
      params.key,
      params.content,
      {
        userId: params.userId,
      },
    );
  } catch {
    // Memory writes should still work when an embedding provider is unavailable.
    return null;
  }
}

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import type { ChatMessagePagination } from "@/hooks/api/chats/use-message-pagination";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getApiBaseUrl(): Promise<string> {
  return (
    process.env.SERVER_API_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "http://localhost:3002"
  );
}

type ChatPageData = {
  chat: {
    id: string;
    title: string;
    visibility: "private" | "public";
    isDeleted: boolean;
  };
  messages: Awaited<
    ReturnType<typeof import("@/lib/utils").convertToUIMessages>
  >;
  hasMore: boolean;
  nextCursor: string | null;
};

async function getChatPageData(id: string): Promise<ChatPageData | null> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  if (!cookie) return null;
  try {
    const response = await fetch(`${await getApiBaseUrl()}/api/chat/${id}`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ChatPageData;
  } catch {
    return null;
  }
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const data = await getChatPageData(id);
  if (!data || data.chat.isDeleted) notFound();

  const messagePagination: ChatMessagePagination = {
    cursor: data.nextCursor ?? undefined,
    hasMore: data.hasMore,
  };

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={data.chat.id}
          initialMessages={data.messages}
          initialMessagePagination={messagePagination}
          initialVisibilityType={data.chat.visibility}
          isReadonly={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        id={data.chat.id}
        initialChatModel={chatModelFromCookie.value}
        initialMessages={data.messages}
        initialMessagePagination={messagePagination}
        initialVisibilityType={data.chat.visibility}
        isReadonly={false}
      />
      <DataStreamHandler />
    </>
  );
}

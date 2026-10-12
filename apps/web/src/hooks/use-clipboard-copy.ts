"use client";

import { writeTextToClipboard } from "@/lib/clipboard";
import { useCallback, useEffect, useRef, useState } from "react";

type UseClipboardCopyOptions = {
  onError?: (error: Error) => void;
  timeout?: number;
};

export function useClipboardCopy({
  onError,
  timeout = 2000,
}: UseClipboardCopyOptions = {}) {
  const [copied, setCopied] = useState(false);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const reset = useCallback(() => {
    if (resetTimeout.current) clearTimeout(resetTimeout.current);
    resetTimeout.current = undefined;
    setCopied(false);
  }, []);

  useEffect(() => reset, [reset]);

  const copy = useCallback(
    async (text: string) => {
      try {
        await writeTextToClipboard(text);
        if (resetTimeout.current) clearTimeout(resetTimeout.current);
        setCopied(true);
        resetTimeout.current = setTimeout(reset, timeout);
        return true;
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    },
    [onError, reset, timeout],
  );

  return { copied, copy, reset };
}

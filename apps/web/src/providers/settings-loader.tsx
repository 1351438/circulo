"use client";

import { useSession } from "@/lib/auth-client";
import { useGeneralStore } from "@/stores/settings/general/store";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * Loads user settings from database once per workspace session.
 * This ensures settings are synced from DB on initial load but uses
 * localStorage cache for subsequent navigation within the app.
 */
export function SettingsLoader() {
  const { data: session, isPending: isSessionPending } = useSession();
  const loadSettings = useGeneralStore((state) => state.loadSettings);
  const theme = useGeneralStore((state) => state.theme);
  const { setTheme } = useTheme();
  const loadedUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only load settings once per session for authenticated users
    if (!isSessionPending && !session?.user) {
      loadedUserIdRef.current = undefined;
      return;
    }
    if (
      !isSessionPending &&
      session?.user &&
      loadedUserIdRef.current !== session.user.id
    ) {
      const userId = session.user.id;
      let active = true;
      // Force load from DB on initial workspace entry
      void loadSettings(true).then(() => {
        if (!active) return;
        loadedUserIdRef.current = userId;
        setTheme(useGeneralStore.getState().theme);
      });
      return () => {
        active = false;
      };
    }
  }, [isSessionPending, session?.user, loadSettings, setTheme]);

  useEffect(() => {
    if (loadedUserIdRef.current) setTheme(theme);
  }, [setTheme, theme]);

  return null;
}

import { createLogger } from "@/lib/logs/console/logger";
import type {
  General,
  GeneralStore,
  UserSettings,
} from "@/stores/settings/general/types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const logger = createLogger("GeneralStore");

const CACHE_TIMEOUT = 3600000; // 1 hour - settings rarely change

export const useGeneralStore = create<GeneralStore>()(
  devtools(
    persist(
      (set, get) => {
        let lastLoadTime = 0;
        let hasLoadedFromDb = false; // Track if we've loaded from DB in this session

        const store: General = {
          theme: "system",
          isLoading: false,
          error: null,
        };

        return {
          ...store,
          // API Actions
          loadSettings: async (force = false) => {
            // Skip if we've already loaded from DB and not forcing
            if (hasLoadedFromDb && !force) {
              logger.debug(
                "Already loaded settings from DB, using cached data",
              );
              return;
            }

            // Skip repeated reads while a recent request is still settling.
            const now = Date.now();
            if (!force && now - lastLoadTime < CACHE_TIMEOUT) {
              logger.debug("Skipping settings load - recently loaded");
              return;
            }

            try {
              set({ isLoading: true, error: null });

              const response = await fetch("/api/users/me/settings");

              if (!response.ok) {
                throw new Error("Failed to fetch settings");
              }

              const { data } = await response.json();

              set({
                theme: data.theme ?? "system",
                isLoading: false,
              });

              lastLoadTime = Date.now();
              hasLoadedFromDb = true;
            } catch (error) {
              logger.error("Error loading settings:", error);
              set({
                error: error instanceof Error ? error.message : "Unknown error",
                isLoading: false,
              });
            }
          },

          updateSetting: async (key, value) => {
            const previousTheme = get().theme;
            if (key === "theme") {
              set({ theme: value as UserSettings["theme"], error: null });
            }

            try {
              const response = await fetch("/api/users/me/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [key]: value }),
              });

              if (!response.ok) {
                throw new Error(`Failed to update setting: ${key}`);
              }

              set({ error: null });
              lastLoadTime = Date.now();
            } catch (error) {
              logger.error(`Error updating setting ${key}:`, error);
              set({
                ...(key === "theme" ? { theme: previousTheme } : {}),
                error: error instanceof Error ? error.message : "Unknown error",
              });

              // Don't auto-retry on individual setting updates to avoid conflicts
              throw error;
            }
          },
        };
      },
      {
        name: "general-settings",
      },
    ),
    { name: "general-store" },
  ),
);

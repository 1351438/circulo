import type { ServicesFromTokens } from "@circulo-ai/di";
import type { DI_TOKENS } from "./container";

export type RequestServices = ServicesFromTokens<typeof DI_TOKENS>;

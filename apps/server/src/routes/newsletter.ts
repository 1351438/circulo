import { db, newsletterSubscription } from "@/db";
import { createRouter } from "@/lib/create-app";
import { env } from "@/lib/env";
import { rateLimit } from "@/middleware/rate-limit";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { createHash } from "node:crypto";
import { z } from "zod";

const router = createRouter();
const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  consent: z.literal(true),
  website: z.string().max(500).optional(),
});

function clientAddress(c: Context) {
  const trustedHops = Math.max(0, Number(env.TRUSTED_PROXY_HOPS ?? "0"));
  const forwarded = c.req.header("x-forwarded-for");
  let address: string | undefined;

  if (trustedHops > 0 && forwarded) {
    const addresses = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    address = addresses[Math.max(0, addresses.length - trustedHops - 1)];
  } else if (trustedHops > 0) {
    address = c.req.header("x-real-ip");
  }

  const socketAddress = (
    c.req.raw as Request & { socket?: { remoteAddress?: string } }
  ).socket?.remoteAddress;
  address ??= socketAddress;

  // Hash the address before it becomes a rate-limit key stored in the database.
  return createHash("sha256")
    .update(address || "newsletter-anonymous")
    .digest("hex");
}

router.post(
  "/newsletter/subscribe",
  rateLimit({
    bucket: "api",
    limit: 5,
    windowMs: 60 * 60 * 1000,
    keyResolver: (c) => clientAddress(c),
  }),
  zValidator("json", subscribeSchema),
  async (c) => {
    const { email, website } = c.req.valid("json");

    // Quietly accept honeypot submissions so bots do not learn the trap.
    if (website) {
      return c.json({ message: "Thanks for your interest in Circulo." }, 202);
    }

    const now = new Date();
    await db
      .insert(newsletterSubscription)
      .values({ email, consentedAt: now, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: newsletterSubscription.email,
        set: { consentedAt: now, updatedAt: now },
      });

    return c.json(
      { message: "You're on the list. Thanks for joining us." },
      201,
    );
  },
);

export default router;

import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Email addresses submitted with explicit consent to receive Circulo updates. */
export const newsletterSubscription = pgTable(
  "newsletter_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("newsletter_subscriptions_email_unique").on(table.email),
    index("newsletter_subscriptions_consented_at_idx").on(table.consentedAt),
  ],
);

export type NewsletterSubscription = typeof newsletterSubscription.$inferSelect;

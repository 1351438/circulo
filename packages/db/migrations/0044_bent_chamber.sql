CREATE TABLE "newsletter_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscriptions_email_unique" ON "newsletter_subscriptions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "newsletter_subscriptions_consented_at_idx" ON "newsletter_subscriptions" USING btree ("consented_at");
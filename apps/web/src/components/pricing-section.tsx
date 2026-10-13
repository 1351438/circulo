import { generateRandomPath, type Step } from "@/lib/border-walk";
import { isBillingEnabled } from "@/lib/environment";
import {
  BILLING_PLANS,
  formatBillingLimit,
  type BillingPlan,
} from "@circulo-ai/types";
import {
  Bot,
  Check,
  Gauge,
  LibraryBig,
  MessageSquare,
  MessageSquareText,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { PricingBackground } from "./pricing-background";

const starts: Step[] = [
  { x: 2, y: 0, border: "bottom", direction: "forward" },
  { x: 4, y: 11, border: "bottom", direction: "backward" },
  { x: 0, y: 6, border: "right", direction: "backward" },
  { x: 7, y: 4, border: "right", direction: "forward" },
];

const paths = starts.map((start, index) =>
  generateRandomPath({
    rows: 8,
    cols: 12,
    start,
    maxSteps: 128,
    seed: index + 3,
    avoidPerimeter: true,
    forwardBias: 0.75,
  }),
);

const numericFeatures = [
  { key: "maxAgents", label: "AI agents", icon: Bot },
  { key: "apiCalls", label: "API calls / month", icon: MessageSquareText },
  {
    key: "maxMessagesPerDay",
    label: "Messages / day",
    icon: MessageSquareText,
  },
  { key: "kbSlots", label: "Knowledge base slots", icon: LibraryBig },
  { key: "maxChats", label: "Chats", icon: MessageSquare },
  { key: "teamMembers", label: "Team members", icon: Users },
  { key: "maxAgentsInChat", label: "Agents per chat", icon: UsersRound },
  { key: "rateLimitPerMinute", label: "Requests / minute", icon: Gauge },
] as const satisfies ReadonlyArray<{
  key: keyof BillingPlan["features"];
  label: string;
  icon: typeof Bot;
}>;

const booleanFeatures = [
  { key: "createTeamOrg", label: "Team workspace" },
  { key: "prioritySupport", label: "Priority support" },
] as const;

export function PricingSection() {
  if (!isBillingEnabled) return null;

  return (
    <section
      id="pricing"
      className="main-section relative !h-auto min-h-dvh !scroll-mt-20 overflow-hidden px-4 pt-24 pb-16 sm:px-6 md:pt-28 md:pb-20"
    >
      <PricingBackground paths={paths} />
      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <header className="mx-auto mb-9 max-w-2xl text-center sm:mb-12">
          <h2 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl">
            Plans that grow with your work
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-pretty text-foreground/70 sm:text-lg">
            Start with the essentials, then add capacity as your conversations
            and team grow.
          </p>
        </header>

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          {BILLING_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: BillingPlan }) {
  return (
    <article
      className={`relative flex min-w-0 flex-col rounded-2xl border p-5 shadow-sm backdrop-blur-md sm:p-6 ${
        plan.recommended
          ? "border-primary/60 bg-card/95 shadow-lg ring-1 shadow-primary/10 ring-primary/30"
          : "border-border/80 bg-card/90"
      }`}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          Recommended
        </span>
      )}

      <div className="mb-5 border-b border-border/70 pb-5">
        <h3 className="text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl">
          {plan.name}
        </h3>
        <p className="mt-2 min-h-12 text-sm leading-6 text-card-foreground/70">
          {plan.description}
        </p>
        <div className="mt-5 flex min-h-10 items-baseline gap-1.5">
          {plan.monthlyPrice === null ? (
            <span className="text-2xl font-semibold tracking-tight text-card-foreground">
              Custom
            </span>
          ) : (
            <>
              <span className="text-3xl font-semibold tracking-tight text-card-foreground tabular-nums">
                ${plan.monthlyPrice.toLocaleString()}
              </span>
              <span className="text-sm text-card-foreground/65">/ month</span>
            </>
          )}
        </div>
      </div>

      <h4 className="mb-3 text-sm font-semibold text-card-foreground">
        Plan limits
      </h4>
      <dl className="space-y-3">
        {numericFeatures.map(({ key, label, icon: FeatureIcon }) => (
          <div key={key} className="flex min-w-0 items-start gap-2.5 text-sm">
            <FeatureIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <dt className="min-w-0 flex-1 leading-5 text-card-foreground/75">
              {label}
            </dt>
            <dd className="shrink-0 text-right leading-5 font-medium text-card-foreground tabular-nums">
              {formatBillingLimit(plan.features[key])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-border/70 pt-4">
        <h4 className="mb-3 text-sm font-semibold text-card-foreground">
          Included
        </h4>
        <ul className="space-y-3">
          {booleanFeatures.map(({ key, label }) => {
            const included = plan.features[key];
            const FeatureIcon = included ? Check : X;

            return (
              <li
                key={key}
                className="flex items-center gap-2.5 text-sm leading-5"
              >
                <FeatureIcon
                  aria-hidden="true"
                  className={`size-4 shrink-0 ${
                    included ? "text-primary" : "text-card-foreground/45"
                  }`}
                />
                <span
                  className={
                    included
                      ? "text-card-foreground/80"
                      : "text-card-foreground/55"
                  }
                >
                  {label}
                  {!included && <span className="sr-only"> not included</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

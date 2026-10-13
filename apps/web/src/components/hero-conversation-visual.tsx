import { ArrowUpRight, Check, MessageCircle, Sparkles } from "lucide-react";

/** A product illustration of several focused agents contributing to one reply. */
export function HeroConversationVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[1.05] w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-foreground/10 bg-background/55 p-5 shadow-[0_28px_80px_-32px_color-mix(in_oklab,var(--foreground)_30%,transparent)] backdrop-blur-sm lg:p-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,color-mix(in_oklab,var(--color-teal-500)_18%,transparent),transparent_48%),radial-gradient(ellipse_at_90%_85%,color-mix(in_oklab,var(--color-orange-500)_12%,transparent),transparent_44%)]" />
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 600 560"
        fill="none"
      >
        <path
          d="M94 154C166 164 179 223 254 250M502 147C426 167 410 218 347 247M110 421C170 384 201 330 265 305M490 414C421 383 388 332 339 305"
          stroke="currentColor"
          strokeOpacity=".2"
          strokeWidth="1.5"
          strokeDasharray="5 7"
        />
        <circle cx="94" cy="154" r="4" fill="var(--color-teal-600)" />
        <circle cx="502" cy="147" r="4" fill="var(--color-orange-500)" />
        <circle cx="110" cy="421" r="4" fill="var(--color-lime-600)" />
        <circle cx="490" cy="414" r="4" fill="var(--color-indigo-500)" />
      </svg>

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/75 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <span className="size-1.5 rounded-full bg-teal-600" />A circle at
            work
          </span>
          <span className="text-xs text-muted-foreground">Shared thinking</span>
        </div>

        <div className="absolute top-[49%] left-1/2 w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-xl shadow-foreground/10 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MessageCircle className="size-3.5 text-teal-700 dark:text-teal-300" />
            Conversation
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground sm:text-base">
            Make this launch unmistakably ours.
          </p>
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-teal-700 text-[10px] font-semibold text-white">
                R
              </span>
              <span className="text-xs font-medium text-foreground">
                Research
              </span>
              <Check className="ms-auto size-3.5 text-teal-700 dark:text-teal-300" />
            </div>
            <p className="mt-2 pl-8 text-xs leading-relaxed text-muted-foreground">
              Anchor it in the moment your team wants to remember.
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="max-w-[38%] rounded-xl border border-border/75 bg-background/80 p-2.5 shadow-md shadow-foreground/5">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="grid size-5 place-items-center rounded-full bg-orange-500 text-[9px] font-semibold text-white">
                S
              </span>
              Strategy
            </div>
          </div>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full border border-border/75 bg-background/85 text-foreground shadow-md shadow-foreground/5">
            <Sparkles className="size-4 text-teal-700 dark:text-teal-300" />
          </div>
          <div className="max-w-[38%] rounded-xl border border-border/75 bg-background/80 p-2.5 shadow-md shadow-foreground/5">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="grid size-5 place-items-center rounded-full bg-indigo-600 text-[9px] font-semibold text-white">
                C
              </span>
              Creative
            </div>
          </div>
        </div>
      </div>
      <ArrowUpRight className="absolute right-5 bottom-5 size-4 text-muted-foreground/60" />
    </div>
  );
}

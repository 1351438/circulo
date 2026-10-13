"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormRoot } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function NewsletterSignup() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          consent: data.get("consent") === "on",
          website: data.get("website"),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          result?.message ??
            result?.error ??
            "We couldn't add you right now. Please try again shortly.",
        );
      }

      form.reset();
      setState({
        status: "success",
        message:
          result?.message ?? "You're on the list. Thanks for joining us.",
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We couldn't add you right now. Please try again shortly.",
      });
    }
  }

  const isSubmitting = state.status === "submitting";

  return (
    <FormRoot className="w-full max-w-xl" onSubmit={submit}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel className="sr-only" htmlFor="newsletter-email">
            Email address
          </FieldLabel>
          <InputGroup className="h-14 rounded-2xl border-border bg-background/90 p-1.5 shadow-sm">
            <InputGroupInput
              id="newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              disabled={isSubmitting}
              placeholder="you@example.com"
              className="h-11 rounded-xl border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0"
            />
            <InputGroupAddon align="inline-end" className="pr-0.5">
              <InputGroupButton
                type="submit"
                variant="default"
                disabled={isSubmitting}
                className="h-11 rounded-xl px-4"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight className="size-4" aria-hidden="true" />
                )}
                {isSubmitting ? "Joining…" : "Join the list"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Field orientation="horizontal" className="items-start gap-2.5">
          <Checkbox
            id="newsletter-consent"
            name="consent"
            value="on"
            required
            disabled={isSubmitting}
          />
          <FieldLabel
            htmlFor="newsletter-consent"
            className="cursor-pointer text-sm leading-relaxed font-normal text-foreground/80"
          >
            I agree to receive occasional product news by email.
          </FieldLabel>
        </Field>
      </FieldGroup>
      <div
        aria-hidden="true"
        className="absolute top-auto -left-[10000px] size-px overflow-hidden"
      >
        <label htmlFor="newsletter-website">Leave this field empty</label>
        <Input
          id="newsletter-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className="absolute size-px border-0 p-0 opacity-0"
        />
      </div>
      <p
        aria-live={state.status === "error" ? "assertive" : "polite"}
        className={`mt-3 min-h-5 text-sm ${state.status === "error" ? "text-destructive" : state.status === "success" ? "text-teal-800 dark:text-teal-200" : "text-foreground/75"}`}
      >
        {state.status === "success" || state.status === "error"
          ? state.message
          : "No spam. Just useful updates, sent occasionally."}
      </p>
    </FormRoot>
  );
}

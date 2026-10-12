# Repository audit and fixes — 2026-10-11

Audit of the `circulo-ai` monorepo at `949cc28` (branch `master`), covering
~151k lines of TypeScript across `apps/web`, `apps/server`, `apps/desktop` and
the ten workspace packages.

The audit ran the repository's own quality gates (lint, typecheck, test, build),
plus static analysis for dead code, duplication, suppressed diagnostics,
security-boundary configuration and log hygiene. Fixes in part 2 are applied in
the working tree; part 3 lists what was deliberately left alone and why.

---

## 1. Headline

**Three of the four quality gates were not actually enforcing anything.**

| Gate                   | Before                                                                         | After                                            |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| `bun run lint:check`   | **Crashed** — binary not found. Even when run, 0 rules were enabled.           | Passes, with Biome's recommended ruleset active. |
| `bun run typecheck`    | Passed, but with 1 777 lines of auth code excluded via `@ts-nocheck`.          | Passes (exclusion still present — see 3.1).      |
| `bun run test`         | Failed intermittently (~2 in 3 full runs) on a hanging workflow-security test. | Passes; 3 consecutive forced full runs clean.    |
| `bun run format:check` | Failed on **1 114 of 1 114 files**.                                            | Fixed at the cause (line-ending normalisation).  |
| `bun run build`        | Passed.                                                                        | Passes.                                          |

The most consequential functional finding is **2.1**: production server logging
was disabled outright, silencing 196 log calls across 35 modules.

---

## 2. Fixed

### 2.1 Production server logging was entirely suppressed — High

`apps/server/src/lib/logs/console/logger.ts:130`

`shouldLog()` returned `false` for every level whenever `NODE_ENV=production`:

```ts
// In production, only log on server-side (where window is undefined)
if (ENV === "production") {
  return false;
}
```

The comment describes the intent correctly, but the implementation dropped the
`window` condition. The near-identical web copy
(`apps/web/src/lib/logs/console/logger.ts`) still has it:

```ts
if (ENV === "production" && typeof window !== "undefined") {
```

so this is a copy-paste regression in the server twin, not a design decision.
Because the server never has a `window`, the branch matched unconditionally.

**Impact.** Every `logger.debug/info/warn/error` call was a no-op in production
— **196 call sites across 35 modules**, including the workflow runtime, auth,
billing and the scheduler. `LOG_LEVEL` and `LOG_CONFIG.production.minLevel` were
both dead config. A production incident would have left no application-level
trace. This also explains the 31 raw `console.*` calls noted in 3.4: they are
the only server logging that actually reached stdout.

**Fix.** The server logger only ever runs server-side, so the branch has no
valid meaning there and was removed. Production logging is now governed by
`config.minLevel`, which already defaults to `ERROR` and honours `LOG_LEVEL`.
The stale `// Will be checked at runtime` marker on
`LOG_CONFIG.production.enabled` was removed too.

> Mirroring the web guard (`typeof window !== "undefined"`) was the first
> attempt; it fails to compile, because `apps/server/tsconfig.json` sets
> `lib: ["ES2022"]` with no DOM lib. That is further confirmation the condition
> was never meaningful on the server.

### 2.2 Hanging test in the workflow security suite — High (CI reliability)

`packages/wf/test/security.test.ts:78,224`

Two tests synchronised on a single macrotask:

```ts
const nextEvent = iterator.next();
await new Promise((resolve) => setTimeout(resolve, 0));
await bus.publish({
  /* ... */
});
await expect(nextEvent).resolves.toMatchObject({
  /* ... */
});
```

Both gateways (`SecureWorkflowStreamGateway`,
`SecureWorkflowHistoryStreamGateway`) only call `eventBus.subscribe()` _after_
awaiting `tokens.verify(token)` — see
`packages/wf/src/security/history-stream-gateway.ts:48-60`. One `setTimeout(0)`
does not guarantee that await chain has settled.

Both in-memory buses drop events published with no subscriber
(`packages/wf/src/history/in-memory-history-event-bus.ts:14-15`:
`if (!callbacks) return;`). So when the event landed first it was lost
permanently and the pending `iterator.next()` **never settled** — the test hung
until the suite timeout rather than failing fast.

**Impact.** Under the monorepo-wide parallel run the suite reported
`import 107.92s` of contention and the race lost roughly 2 in 3 times, failing
on whichever of the two tests lost it. Raising `testTimeout` does not help a
promise that never resolves; a 30s timeout still hung.

**Fix.** Added a `trackSubscription()` helper that wraps the bus's `subscribe`
and resolves a promise on real registration, replacing both `setTimeout(0)`
calls with `await subscribed`. Verified: 3 consecutive `turbo run test --force`
full runs clean, where the previous state failed 2 of 3.

### 2.3 Lint gate did not run, and enforced nothing when it did — High

`package.json` (scripts, devDependencies), `biome.json`

Two independent defects:

1. **The binary was not where the scripts looked.** `lint`, `lint:check` and
   `check` all invoke `./node_modules/@biomejs/biome/bin/biome`, but
   `@biomejs/biome` was declared only in `apps/server` and `packages/upload`.
   It installs to those workspaces, never the root, so `bun run lint:check`
   exited with `error: Module not found`.
2. **The ruleset was empty.** `biome.json` set `linter.rules.recommended: false`
   with no rule explicitly enabled — the only entry was
   `style.noNonNullAssertion: "off"`. Biome checked all 1 106 files and reported
   nothing. CI's "Run repository lint" step was a no-op by construction.

**Fix.** Added `@biomejs/biome` to the root `devDependencies` (lockfile delta:
2 lines) and set `recommended: true`.

Enabling the recommended set surfaced **347 errors, 458 warnings and 96 infos**
— too large to clear in one pass without a red gate. So `biome.json` now turns
on `recommended` and explicitly lists the 42 currently-violated rules as `off`,
with their counts recorded in 3.2 as a backlog. This makes every _clean_ rule
enforced from now on, including these, which were fixed as part of this pass:

- `suspicious/noDuplicateObjectKeys`
- `suspicious/noFallthroughSwitchClause`
- `suspicious/noDoubleEquals`
- `correctness/noEmptyPattern`

116 files also received Biome's safe auto-fixes — type-only imports marked
`import type` (material here, since `verbatimModuleSyntax: true`) and `node:`
protocol prefixes on builtin imports.

### 2.4 `format:check` failed on every file in the repository — Medium

No `.gitattributes` existed. With `core.autocrlf=true` (the Windows default) the
checkout is CRLF, while `prettier.config.mjs` sets `endOfLine: "lf"` — so
Prettier flagged **1 114 of 1 114 files**. The gate was unusable for any Windows
contributor, which is likely why it is the one quality script absent from CI.

**Fix.** Added `.gitattributes` with `* text=auto eol=lf`, plus `binary` markers
for image/font/PDF assets and `linguist-generated` on `bun.lock`.

### 2.5 Production CORS trusted loopback origins — Medium (security)

`apps/server/src/app.ts:70`

`allowedOrigins` unconditionally included `http://localhost:3000`,
`http://127.0.0.1:3000` and `http://localhost:3001`, and the CORS middleware is
configured with `credentials: true`. In production that let any process
listening on those loopback ports on a user's machine make credentialed
cross-origin calls to the API and read the response. The same list also feeds
`enforceCookieMutationOrigin`.

**Fix.** Moved the loopback entries into a `DEVELOPMENT_ORIGINS` constant,
spread only when `NODE_ENV !== "production"`. Non-production (including CI's
`NODE_ENV=test`) keeps them; production declares its origins through
`NEXT_PUBLIC_APP_URL`, `getBaseUrl()` and `CORS_ALLOWED_ORIGINS`.

### 2.6 Electron exposed its IPC bridge to third-party origins — Medium (security)

`apps/desktop/src/main.cjs:28,340,347`

The window is otherwise configured correctly (`contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`), but:

- `setWindowOpenHandler` returned `{ action: "allow" }` for **any** `https://`
  URL. A child window inherits the parent's `webPreferences`, including
  `preload.cjs`, so an arbitrary remote origin would have been handed the
  `circuloDesktop` bridge — which exposes `downloadUpdate()` and
  `installUpdate()`.
- There was no `will-navigate` handler at all, so the main window could be
  navigated away from the local runtime, carrying the same bridge with it.

**Fix.** `setWindowOpenHandler` now always denies and hands `https://` URLs to
`shell.openExternal` (so external links still work, in the user's own browser).
Added a `will-navigate` handler that permits only the bundled runtime origins
via a new `isLocalRuntimeUrl()` helper and routes anything else to the external
browser.

### 2.7 Latent switch fallthrough in the upload router — Medium

`packages/upload/src/routes/next.ts:473`

`case "multipart":` contained an inner `switch (action)` whose cases all return,
with no `break`, `return` or exhaustiveness guard after it. Any `action` that
escaped the inner switch would **fall through into `case "upload"`** and be
handled as a plain upload.

Unreachable today, because `multipartActionSchema.parse()` throws first — but
the safety depends entirely on that schema staying in sync with the switch, with
nothing enforcing it at compile time or runtime.

**Fix.** Added an explicit `return notFound()` after the inner switch. The rule
that catches this class (`noFallthroughSwitchClause`) is now enforced.

### 2.8 Stale syntax highlighting could win a race — Medium

`apps/web/src/components/ai-elements/code-block.tsx:88`

The effect's guard was inverted:

```ts
const mounted = useRef(false);
useEffect(() => {
  highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
    if (!mounted.current) {
      // only paints when NOT mounted
      setHtml(light);
      mounted.current = true;
    }
  });
  return () => {
    mounted.current = false;
  };
}, [code, language, showLineNumbers]);
```

Intended as a "still mounted" check, it did the opposite:

- When `code` changes, two highlight runs can be in flight. Whichever resolves
  _first_ sets `mounted.current = true`; the newer run then sees it `true` and is
  **skipped** — so the block keeps rendering the _older_ code. For tool
  input/output that updates while streaming, stale output sticks.
- On unmount the cleanup sets the flag to `false`, so a late resolution passes
  the guard and calls `setState` on an unmounted component — precisely what the
  guard was meant to prevent.

There was also no `.catch()`; `codeToHtml` rejects on an unsupported language,
which would surface as an unhandled rejection and a permanently blank block.

**Fix.** Replaced the ref with a local `cancelled` flag in the standard
cancellation shape, and added a `.catch()` that clears the markup instead of
rejecting unhandled. Dropped the now-unused `useRef` import.

### 2.9 Smaller cleanups

| Item                                     | Location                                                                                                                   | Change                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swallowed sandbox-kill failure           | `apps/server/src/lib/execution/e2b.ts:108`                                                                                 | `catch {}` hid failures to tear down an E2B sandbox — a leak that keeps billing and quota. Now `logger.warn` with the `sandboxId`.                                                                                                                                                                   |
| Wrong dev fallback port                  | `apps/web/src/lib/urls/utils.ts:23`                                                                                        | `getBaseUrl()` fell back to `http://localhost:3001`, which is neither the web app (3000) nor the API (3002); every other fallback in the same file uses 3000. Corrected to 3000.                                                                                                                     |
| Foreign product name in outbound headers | `apps/server/src/lib/auth.ts:511,534,1286`                                                                                 | Three GitHub API calls sent `User-Agent: sim-studio` / `sim-studio/1.0`, identifying the app as an unrelated product. Now `circulo` / `circulo/1.0`.                                                                                                                                                 |
| Stale commented-out example block        | `apps/server/src/lib/permissions.ts`                                                                                       | Removed a 48-line commented "Usage Examples" block whose import path (`@/lib/auth/permissions`) no longer exists. 402 → 355 lines.                                                                                                                                                                   |
| Duplicate object key                     | `apps/desktop/src/main.cjs`                                                                                                | `NEXT_PUBLIC_CIRCULO_RUNTIME_KIND` was declared twice in the runtime env (same value, so harmless). Removed the duplicate.                                                                                                                                                                           |
| Loose equality                           | `apps/web/src/components/app-sidebar.tsx`, `apps/web/src/components/ui/field.tsx`, `packages/db/repositories/vote-repo.ts` | Three `==` comparisons changed to `===`.                                                                                                                                                                                                                                                             |
| Empty destructuring pattern              | `.../account/account.tsx`                                                                                                  | `({}) => (` → `() => (`.                                                                                                                                                                                                                                                                             |
| Stale lockfile                           | `bun.lock`                                                                                                                 | The lockfile recorded `packages/upload@1.7.0` while its `package.json` says `2.0.0` — the "Version Packages" release commit (`2f2b44d`) bumped the package without regenerating the lock. Resynced as a side effect of the root install. Worth checking why the release workflow leaves this behind. |

---

## 3. Not fixed — recommended, with rationale

These are real findings I deliberately left in place because each is a judgement
call with meaningful blast radius, or a larger piece of work than a cleanup pass
should decide unilaterally.

### 3.1 `@ts-nocheck` disables typechecking for the entire auth boundary — High

`apps/server/src/lib/auth.ts:1`

A single `// @ts-nocheck` excludes **1 777 lines** — the Better Auth
configuration, the access-control statements, every OAuth provider, organization
and API-key wiring — from a `strict` + `noUncheckedIndexedAccess` project whose
typecheck is a CI gate.

I measured the cost: removing the pragma produces **70 errors**.

| Count | Code    | Meaning                                              |
| ----- | ------- | ---------------------------------------------------- |
| 48    | TS18046 | `'data' / 'emails' / 'profile' is of type 'unknown'` |
| 11    | TS7006  | `Parameter 'tokens' implicitly has an 'any' type`    |
| 4     | TS2304  | `Cannot find name 'HeadersInit'` / `'User'`          |
| 3     | TS2339  | Property missing on type                             |
| 2     | TS2352  | Unsound `as` conversion on the session/user shape    |
| 1     | TS2532  | `Object is possibly 'undefined'`                     |
| 1     | TS2322  | Provider config type mismatch                        |

The 48 `unknown` errors are the ones that matter: they are OAuth provider
responses consumed without narrowing, e.g.
`apps/server/src/lib/auth.ts:526` —

```ts
const profile = await profileResponse.json(); // unknown
if (!profile.email) {
  /* ... */
} // unchecked
```

There is no runtime validation either, so the identity-provider response shape
is trusted implicitly. The 4 `TS2304`s are genuine compile errors (no DOM lib in
this tsconfig), meaning that code has never been type-verified at all.

**Recommendation.** Replace the file-level pragma with a Zod schema per provider
response (`profile`, `emails`, `tokens`) and explicit types for the
`getUserInfo` callbacks, then delete the pragma. If that has to be staged, use
narrow per-line `@ts-expect-error` with a tracking comment instead of
`@ts-nocheck`, so new code in the file is checked by default and the debt is
visible and countable.

### 3.2 Lint backlog — 715 violations across 42 suppressed rules

`biome.json` now enables `recommended` and lists these as `off`. Clearing them
makes the gate progressively stronger. Ordered by likely value, not count:

**Bug-prone — worth fixing deliberately**

| Count       | Rule                                                                                         | Note                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 39          | `correctness/useExhaustiveDependencies`                                                      | Stale-closure class. This is the family that produced 2.8; worth auditing rather than auto-fixing.                                                                                       |
| 22          | `suspicious/noControlCharactersInRegex`                                                      | Needs review — plausibly intentional in sanitisation regexes, but each should be confirmed.                                                                                              |
| 17          | `suspicious/noArrayIndexKey`                                                                 | React reconciliation bugs on reorder.                                                                                                                                                    |
| 14 + 13 + 6 | `correctness/noUnusedVariables`, `noUnusedFunctionParameters`, `noUnusedPrivateClassMembers` | 33 dead bindings; mechanical.                                                                                                                                                            |
| 12          | `suspicious/useIterableCallbackReturn`                                                       | I checked all 12: every one is a `forEach` callback with an implicit arrow return. Harmless today, cheap to tidy.                                                                        |
| 7           | `suspicious/noPrototypeBuiltins`                                                             | Mostly `packages/di` — real hazard on untrusted keys.                                                                                                                                    |
| 5           | `suspicious/noShadowRestrictedNames`                                                         | `packages/di`.                                                                                                                                                                           |
| 4           | `suspicious/noImplicitAnyLet`                                                                |                                                                                                                                                                                          |
| 3           | `security/noDangerouslySetInnerHtml`                                                         | All three reviewed and safe: two are Shiki `codeToHtml` output (escaped), one is `chart.tsx` CSS variables. Keep the rule off with a targeted suppression, or add inline justifications. |
| 3           | `correctness/useParseIntRadix`                                                               |                                                                                                                                                                                          |

**Mechanical / stylistic — safe to auto-fix in one commit**

`suspicious/noExplicitAny` (244 — largest single item, concentrated in
`packages/di` and `packages/file-parsers` where some is legitimate),
`complexity/useLiteralKeys` (47), `complexity/*` (~24 across 9 rules),
`style/*` (~20).

**Accessibility — 233 across 13 rules**

`a11y/noSvgWithoutTitle` alone is 183, almost entirely
`apps/web/src/components/icons/icons.tsx` (a 5 014-line icon catalogue). The
rest — `useSemanticElements` (12), `noLabelWithoutControl` (10),
`useButtonType` (8), `useAnchorContent` (6) — are genuine UI defects on real
components and the better place to start.

13 `useNodejsImportProtocol` and 7 `useTemplate` infos remain unfixed because
Biome classes those fixes as unsafe; `biome check --write --unsafe` handles them
after review.

### 3.3 782 lines of unused security-validation code — Medium

`apps/server/src/lib/security/input-validation.ts`

16 exported validators — `validatePathSegment`, `validateUUID`,
`validateHostname`, `validateExternalUrl`, `validateImageUrl`,
`validateProxyUrl`, `sanitizeForLogging` and others — with **zero importers
anywhere in the repository**. The actual validation layer is Zod, used in 27 of
36 route files.

I left this in place rather than deleting it because the choice is genuinely
yours: it is dead weight that also _reads_ as active protection, which is its
own risk, but several of these helpers are things the codebase arguably should
be using. Two concrete cases where one of them applies right now:

- `apps/server/src/lib/execution/e2b.ts:24` logs the full user-supplied `code`
  at `info` level. Harmless while production `minLevel` is `ERROR`, but an
  operator setting `LOG_LEVEL=INFO` would write arbitrary user code to logs —
  exactly what `sanitizeForLogging` exists for. Note this became _reachable_
  with fix 2.1; it was dead before.
- `validateExternalUrl` / `validateProxyUrl` overlap with the
  `message-url.ts` work recorded as SEC-006 in
  `security_best_practices_report.md`.

**Recommendation.** Decide per helper: wire it up, or delete it. Leaving a
dormant security module is the worst of the three options.

```bash
# if deleting
git rm apps/server/src/lib/security/input-validation.ts
```

### 3.4 31 raw `console.*` calls bypass the structured logger — Medium

16 files under `apps/server/src`, including `app.ts:165` (the global error
handler), `routes/chat.ts`, `routes/chat-stream.ts`, `routes/webhooks.ts`,
`services/scheduler.ts` and `workflows/runtime/workflow-run-service.ts`.

These skip module tagging, level filtering and `LOG_LEVEL`. Before fix 2.1 they
were the _only_ server logging that worked in production, which is probably how
they accumulated. Now that `createLogger` functions, they should be migrated to
it — and the global error handler at `app.ts:165` is the one to do first.

### 3.5 `apps/web` has no tests at all — Medium

| Workspace               | Lines  | Test files               |
| ----------------------- | ------ | ------------------------ |
| `apps/web`              | 73 753 | **0** (no `test` script) |
| `apps/server`           | 35 239 | 26                       |
| `packages/wf`           | 16 985 | 15                       |
| `packages/upload`       | 9 624  | 16                       |
| `packages/di`           | 7 354  | 3                        |
| `packages/db`           | 5 653  | **0**                    |
| `packages/file-parsers` | 930    | **0**                    |
| `packages/redis`        | 325    | **0**                    |
| `packages/core`         | 290    | **0**                    |

The largest surface in the repository is entirely unverified, and it is where
2.8 lived. `packages/db` holds the repository layer, also untested.

**Recommendation.** Add a `test` script to `apps/web` so the gate exists, then
cover the highest-risk non-visual logic first: `src/lib/api/client.ts`,
`src/hooks/api/*`, `src/stores/*`.

### 3.6 Two server test suites cannot run without a database — Low

`apps/server/src/lib/ai/provider-registry.test.ts` and
`src/workflows/orchestrate/agent-loop-state.test.ts` fail collection with
`Error: Missing DATABASE_URL environment variable`. Both are unit tests that
transitively import the DB module.

CI sets `DATABASE_URL`, so this is green there — but `bun run test` fails on a
clean developer machine, and these tests pull in the whole env/DB graph for
logic that does not need it. Breaking that import edge would make them real
unit tests. (With `DATABASE_URL` set, all 26 server files pass: 79 tests.)

### 3.7 Env access bypasses the validated schema — Low

37 direct `process.env.*` reads sit outside the `@t3-oss/env` modules. Nine
variables are in neither the schema nor `.env.example`:

`S3_BUCKET`, `S3_KB_BUCKET`, `S3_ORG_BUCKET`, `S3_CHAT_BUCKET`,
`S3_PROFILE_PICTURES_BUCKET`, `AWS_REGION`, `PORT`, `HOSTNAME` — read in
`lib/storage/config.ts`, `routes/health.ts`, `index.ts` and `node-server.ts`.

So a storage misconfiguration is not caught at boot and is undiscoverable from
the example file — notable given `/health/ready` is documented as verifying
bucket configuration. Others (`E2B_API_KEY`, `REDIS_URL`,
`INTERNAL_API_SECRET`, `GITHUB_REPO_CLIENT_ID/SECRET`,
`CIRCULO_MODEL_PRICING_JSON`) _are_ in the schema but are read raw anyway,
skipping validation.

**Recommendation.** Add the nine to the schema and `.env.example`; route all
reads through `env`.

### 3.8 Duplicated modules between web and server — Low

Thirteen paths exist in both `apps/web/src/lib` and `apps/server/src/lib`.
Byte-identical: `lib/execution/constants.ts`, `lib/execution/languages.ts`,
`lib/usage.ts`. Differing only by an import specifier:
`lib/ai/prompts.ts` (126 lines, 1 line apart — the `ArtifactKind` import).

These four are drift waiting to happen and belong in `packages/types` or
`packages/core`. The rest (`lib/auth.ts`, `lib/env.ts`, `lib/urls/utils.ts`,
`lib/environment.ts`, `lib/types.ts`, `lib/utils.ts`, `lib/branding/branding.ts`,
`lib/ai/providers.ts`) legitimately differ by tier — but sharing a filename
while behaving differently is how 2.1 went unnoticed for so long. Worth renaming
to make the tier explicit.

### 3.9 `format:check` is absent from CI — Low

`ci-application.yml` runs lint, build, typecheck and test, but not
`format:check`. With 2.4 in place it can now pass cross-platform, so it should
be added after a one-time `bun run format` normalisation pass. That pass will
touch most files, so it is best landed as its own commit.

### 3.10 62 `TODO` comments — Informational

Across 20 files, heavily concentrated in `apps/web` UI
(`new-chat.tsx` has 14, `pricing-background.tsx` 7, `layout.tsx` 7). Almost all
are cosmetic or refactor notes rather than correctness issues. `layout.tsx:75`
links to a ChatGPT conversation as if it were documentation, which will not
survive for the next reader.

---

## 4. Verification

Every gate below was run after the changes in part 2.

```bash
bun install
bun run lint:check    # passes — 33 infos, 0 errors, recommended ruleset active
bun run typecheck     # passes — 17/17 tasks
bun run build         # passes — 10/10 tasks
```

Tests need a database URL (see 3.6):

```bash
DATABASE_URL="postgres://user:password@localhost:5432/circulo" bun run test
```

Test stability was confirmed specifically for 2.2 — three consecutive forced
full runs, each 12/12 tasks green, against a baseline that failed 2 of 3:

```bash
DATABASE_URL="..." bun ./node_modules/turbo/bin/turbo run test --force
```

### Changed files

133 tracked files changed (357 insertions, 270 deletions), plus one new
untracked file. 116 of the changed files are Biome auto-fixes — `import type`
markers and `node:` prefixes — 108 of them three lines or fewer. The 18
substantive edits are:

```
biome.json                                          lint gate (2.3)
package.json + bun.lock                             biome dependency (2.3), stale lock (2.9)
.gitattributes                                      new — line endings (2.4)
apps/server/src/lib/logs/console/logger.ts          production logging (2.1)
apps/server/src/app.ts                              CORS origins (2.5)
apps/server/src/lib/permissions.ts                  dead example block (2.9)
apps/server/src/lib/auth.ts                         User-Agent strings (2.9)
apps/server/src/lib/execution/e2b.ts                swallowed error (2.9)
apps/desktop/src/main.cjs                           navigation hardening (2.6), dup key (2.9)
apps/web/src/components/ai-elements/code-block.tsx  highlight race (2.8)
apps/web/src/lib/urls/utils.ts                      dev fallback port (2.9)
packages/upload/src/routes/next.ts                  switch fallthrough (2.7)
packages/wf/test/security.test.ts                   hanging test (2.2)
packages/db/repositories/vote-repo.ts               strict equality (2.9)
apps/web/src/components/app-sidebar.tsx             strict equality (2.9)
apps/web/src/components/ui/field.tsx                strict equality (2.9)
.../settings-modal/components/account/account.tsx   empty pattern (2.9)
```

Nothing is committed; all changes are in the working tree.

### Suggested next steps, in order

1. **3.1** — remove `@ts-nocheck` from `auth.ts` and validate OAuth responses.
   Highest residual risk, and 70 errors is a bounded, measurable job.
2. **3.3** — decide the fate of `input-validation.ts`; wire up
   `sanitizeForLogging` at `e2b.ts:24`, now that logging is live.
3. **3.4** — migrate the 31 `console.*` calls, starting with the global error
   handler.
4. **3.2** — clear the mechanical half of the lint backlog in one auto-fix
   commit, then work the `useExhaustiveDependencies` and a11y findings by hand.
5. **3.5** — give `apps/web` a test script and first tests.

# Contributing to Thermomixer

Thanks for your interest! Thermomixer turns ordinary recipes into working
Thermomix TM7 recipes. The most valuable contributions are **improvements to
the conversion rules** — if you've cooked something and know better settings,
that knowledge is exactly what this project needs.

## Getting started

Requires **Node ≥ 22.12** (use [`nvm`](https://github.com/nvm-sh/nvm): `nvm use 22`).

```sh
git clone git@github.com:chuckcarpenter/thermomixer.git
cd thermomixer
npm install
cp .env.example .env   # optional — only needed for photo/AI features
npm run dev            # http://localhost:4321
```

URL import and the full rules-based conversion work **without** any API key.

## How it's structured

```
src/lib/tm/          The conversion core — PURE, no I/O, fully unit-tested
  ├─ types.ts        Data model + TM7 device limits
  ├─ rules.ts        Verb → setting rules + off-device detection   ← most PRs touch this
  ├─ convert.ts      Orchestration + guardrails (device-limit validation)
  ├─ scale.ts        Servings / time scaling
  └─ format.ts       Rendering settings to text (Cookidoo, Markdown)
src/lib/ingest/      URL + image ingestion → CanonicalRecipe
src/lib/llm.ts       The ONLY place that calls a model (extraction + fallback)
src/components/      Preact UI islands
src/pages/api/       Server endpoints (ingest, convert)
```

**Architectural rule:** keep `src/lib/tm/` pure and deterministic. No network,
no model calls, no `process.env` in there — that's what makes it testable and
trustworthy. Anything involving a model goes through `src/lib/llm.ts`, and any
model-proposed setting must still pass through `applyGuardrails`.

## Adding or fixing a conversion rule

This is the most common contribution. In [`src/lib/tm/rules.ts`](src/lib/tm/rules.ts):

1. Add a `Rule` to the `RULES` array. **Order matters** — rules are matched
   top-to-bottom, so put specific phrases ("finely chop") *above* general ones
   ("chop").
2. Keep settings within TM7 limits (37–160 °C, speed 0–10); the guardrails will
   clamp, but get it right at the source.
3. **Add a test** in [`src/lib/tm/rules.test.ts`](src/lib/tm/rules.test.ts)
   asserting the expected setting. PRs that change conversion behaviour without
   a test won't be merged.
4. In the PR description, briefly explain the *cooking* rationale (why that
   time/temp/speed) — ideally from real TM7 experience or a Cookidoo recipe.

## Before you open a PR

```sh
npm test           # vitest — must pass
npm run build      # must succeed
```

- Use a feature branch; keep PRs focused.
- Conventional-style commit subjects are appreciated (`feat:`, `fix:`, `docs:`).

## Reporting a recipe that converts badly

Open an issue with: the source (URL or pasted text), what Thermomixer produced,
and what the settings *should* be (with reasoning). Concrete examples are the
best fuel for rule improvements.

## A note on safety

Converted settings are sensible **starting points**, not guaranteed results.
Contributions should preserve the guardrails that keep output within what the
TM7 can physically do. Always encourage users to sanity-check before cooking.

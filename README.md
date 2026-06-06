# 🍲 Thermomixer

Turn recipes you like (from a URL or a photo) into working **Thermomix TM7**
recipes — each step annotated with time / temperature / speed / reverse — and
get copy-paste-ready fields for adding them to **Cookidoo**.

## How it works

```
URL  ──► fetch + JSON-LD parse ─┐
                                ├─► CanonicalRecipe ─► rules engine ─► TMRecipe ─► editor + Cookidoo panel
photo ─► Claude vision extract ─┘                       (+ LLM fallback for odd steps)
```

- **Conversion is deterministic.** A rules engine (`src/lib/tm/rules.ts`) maps
  cooking verbs to TM7 settings (chop → 5 s / speed 7, sauté → 100 °C / speed 1
  / reverse, knead → dough mode, …) and enforces the device's real limits
  (temps clamped to 37–160 °C, steaming ≤ speed 5, off-device steps like
  "bake in the oven" flagged rather than faked).
- **The LLM only does extraction** (vision for photos, parsing pages with no
  structured data) and proposes settings for steps the rules can't map — and
  every such suggestion is re-validated by the same guardrails.
- **Cookidoo has no public API**, so we produce a clean, paste-ready recipe for
  its "Created Recipes" editor (My Recipes → Created Recipes → Create recipe).

## Setup

Requires **Node ≥ 22.12** (this machine's default `node` is older — use
`nvm use 22` first).

```sh
npm install
cp .env.example .env   # optional: add ANTHROPIC_API_KEY for photos + AI fallback
npm run dev            # http://localhost:4321
```

The rules-based conversion and URL import work **without** an API key. A key
unlocks: photo import (vision), the fallback for sites with no structured data,
and AI suggestions for unmapped steps.

## Scripts

| Command         | What                                            |
|-----------------|-------------------------------------------------|
| `npm run dev`   | Dev server                                      |
| `npm test`      | Unit tests for the conversion core (vitest)     |
| `npm run build` | Production build (Node standalone server)       |

## Notes & limits

- Some large sites (AllRecipes, Serious Eats) hard-block server fetches — use
  the **photo** or **paste-text** options for those.
- Converted settings are sensible starting points you tweak in the editor, not
  guaranteed bakes. Always sanity-check before cooking.

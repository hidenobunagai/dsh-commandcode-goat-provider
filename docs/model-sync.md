# Model Catalog Maintenance

`src/catalog/data.ts` (`CATALOG`) is the single source of truth for every model this provider exposes:
id, name, context window, max tokens, wire protocol, modalities, reasoning efforts, pricing and tier.
`src/catalog/index.ts` derives every lookup map (`STATIC_MODELS`, `KNOWN_EFFORTS`, `KNOWN_IMAGE_MODELS`,
`KNOWN_STATS`, `FALLBACK_MODELS`) from that array — never hand-edit a derived map.
`src/catalog/pricing.ts` is the one place price text is spelled (`$0.20→$1.20`, or `Free`); both the picker
row and the model description read their figure from it, so the two can never disagree.

The full procedure — drift detection, capability curation rules, version bump, publishing and the automated
daily run — lives next to the VS Code extension that shares this catalog:

**`~/projects/commandcode-goat-provider/docs/model-sync.md`**
(<https://github.com/hidenobunagai/commandcode-goat-provider/blob/main/docs/model-sync.md>)

## Checklist for a catalog change

```bash
bun run test && bun run build        # the gate that must be green
# bun run check runs typecheck + lint + test in one pass; `bun run typecheck` alone is fine too
```

1. Add or update the entry in `CATALOG` (one line per model, all fields in the same place).
2. Bump `version` in `package.json` (patch) — this repo has no CHANGELOG; the catalog commit is the record.
3. Commit as `feat(catalog): ...` (or `fix(catalog): ...`) and push `main`.
4. `bun run build` is the deploy step: the DSH profile consumes this checkout through the symlink
   `~/.dsh/profiles/node_modules/dsh-commandcode-goat-provider`. Restart the `dsh web` process to pick up
   the new catalog (there is no npm publish for this package).
5. Mirror the change into the VS Code extension catalog
   (`commandcode-goat-provider/src/constants.ts` + `docs/models.md`) and publish it per the playbook above —
   the extension derives its capability tables from this file.

Discovery source: `GET https://api.commandcode.ai/provider/v1/models` (public) returns only
`id` / `name` / `context_length`; capabilities and pricing must be curated from `commandcode.ai/models`.
Never invent values — an omitted capability is safer than a wrong one.

A row added by the daily watch may carry no price. The live API publishes none (see above), so a newly
synced model lands with `inputPrice` / `outputPrice` absent by design, and the picker renders its bare
name until a price is curated from `commandcode.ai/models`. Add the pair when you have both sides; do not
invent one. In particular never pair a `free` input with a paid output — the picker would print `Free`
for a billed model, which is exactly the mistake the rows are there to prevent.
`tests/pricing.test.ts` pins this: a one-sided or mixed pair fails, and a price-less entry must render as
a bare name rather than a borrowed figure.

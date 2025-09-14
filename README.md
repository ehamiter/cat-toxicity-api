# cat-toxicity-api

An API (Cloudflare Worker + D1) mirroring the ASPCA “Cats: Plant List,” focused on searchable toxicity info for cats

## Quick links
 - Human docs: GET /docs
 - LLM manifest: GET /llm
 - OpenAPI: GET /openapi.json
 - Swagger UI: GET /swagger

## API overview
 - GET /docs → Markdown API docs
 - GET /llm → machine-readable API summary
 - GET /openapi.json → OpenAPI 3.1 spec
 - GET /swagger → Interactive docs

```
curl -s https://cat-toxicity-api.ehamiter.workers.dev/health | jq
curl -s https://cat-toxicity-api.ehamiter.workers.dev/version | jq
curl -s https://cat-toxicity-api.ehamiter.workers.dev/species/1 | jq
curl -s "https://cat-toxicity-api.ehamiter.workers.dev/search?q=lily" | jq
```


## Local set-up / development
Prereqs: Node 18+, Wrangler.

### Setup
```bash
# Install deps
npm install

# (First time) Create D1 and update wrangler.toml with database_id
wrangler d1 create cattox

# Create tables
wrangler d1 execute cattox --file ./schema.sql

# (Optional) Seed from a prepared SQL dump
wrangler d1 execute cattox --file ./seed.sql

# Run locally
npm run dev

# Deploy
npm run deploy
```

### Add data
```bash
node aspca_cats_to_csv.mjs
npx wrangler d1 execute cattox --file ./out/seed_generated.sql
# to remote:
npx wrangler d1 execute cattox --remote --file ./out/seed_generated.sql
```

### Testing
This repo uses Vitest with Cloudflare Workers pool.

```bash
npm test
```

What’s covered:
- Health, Version, Search, Species endpoints
- Minimal in-memory D1 seed per test suite

## Data model (D1)
See `schema.sql` for tables:
- species, names (synonyms + primary flag), sources, toxicity, search_index (FTS5), meta

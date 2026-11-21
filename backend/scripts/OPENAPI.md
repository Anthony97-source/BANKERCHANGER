# OpenAPI Contributor Guide

This guide explains how the OpenAPI specification is generated, validated, and
maintained, and what documentation each endpoint must include.

## Documentation Requirements

Every endpoint must be fully documented in the generated `backend/openapi.yaml`.
When adding or changing an operation, ensure it includes:

- **Description** — a human-readable `summary` and `description` explaining what
  the endpoint does, its side effects, and any important caveats.
- **Examples** — request and response examples for each operation. Provide
  `example`/`examples` on parameters, request bodies, and responses so consumers
  can see realistic payloads.
- **Authentication** — declare the security scheme(s) the endpoint requires via
  the `security` field (or inherit the global default). Document any scopes or
  roles needed in the description.
- **Rate limits** — document applicable rate limits (per-endpoint or global) in
  the operation description, including the limit, window, and the error returned
  when exceeded.
- **Error codes** — list every response status the endpoint can return, each with
  a description and example error body. Include validation (`400`), auth
  (`401`/`403`), not-found (`404`), rate-limit (`429`), and server (`500`) errors
  where relevant.

The curated contracts in `openapi-base.yaml` are the source of truth for shared
schemas and existing operations; keep their descriptions, examples, security, and
error responses up to date when contracts change.

## Generate / Validate Workflow

Run `npm run openapi:generate` from `backend/`, then `npm run openapi:validate`.
Commit the generated `backend/openapi.yaml` with annotation changes. CI
regenerates, validates, and checks that the committed output is current.

`openapi-base.yaml` preserves the curated API contracts and shared schemas.
`swagger-jsdoc` extracts annotations from every TypeScript file in `src/routes/`;
new paths and operations extend the curated contracts. For overlapping operations,
the curated contract takes precedence. Update that source when changing an existing
contract. Root operation annotations live in `operations.routes.ts`.

Legacy annotations without status documentation receive a descriptive default
response. Numeric exclusive minima are normalized to OpenAPI 3.0 boolean syntax;
path parameters omitted by legacy annotations are included as required strings.
These defaults do not replace endpoint-specific request/response schemas.

## Adding Documentation for New Routes

1. Add the route handler under `src/routes/` and annotate it with `swagger-jsdoc`
   JSDoc comments (`@openapi`), including `summary`, `description`, `security`,
   parameters, request body, and all response codes with examples.
2. If the operation extends or overrides a curated contract, update
   `openapi-base.yaml` (or `operations.routes.ts` for root operations) instead of
   relying on defaults.
3. Run `npm run openapi:generate` and `npm run openapi:validate` from `backend/`.
4. Review the generated `backend/openapi.yaml` to confirm descriptions, examples,
   auth, rate limits, and error codes are present, then commit it alongside your
   annotation changes.

## Integration Test Notes

The real PostgreSQL rollback and 50-request betting test runs with
`BET_LOAD_DATABASE_URL=postgresql://... npm test -- --runInBand tests/integration/betPostgresConcurrency.test.ts`.
It creates and removes its own isolated schema. Backend CI supplies this variable
using its disposable PostgreSQL service; without it, only this database test skips.
# features/rules

SS-1086 implements `/rules` for RP3 FU-35 (UC-96–97), FU-41 (UC-76), BR-25,
BR-42 and BR-43. It consumes the SS-1084 configuration API in `orca_be`;
deploy that API and its migration before enabling this screen.

## Configuration workflow

Admin and Ops Dispatcher can list allocation/carrier rules, create and edit drafts,
publish, disable, soft-delete, review version history and restore a historical
definition into a new published version. Every mutation requires a reason and
existing-rule commands send the reviewed `expectedVersion`.

The IF–THEN editor supports typed predicates and nested ALL/ANY groups, limited to
eight levels and 100 nodes. VND values are decimal strings; weights are grams.
Carrier actions use a primary service and up to ten distinct ordered fallback
services. Active warehouse/service selectors consume paginated ID/name metadata
from `/v1/rules/targets`, without carrier account credentials. A seller exception
uses a verified seller UUID; the screen does not grant access to seller administration.

Draft order can be changed with drag-and-drop or keyboard-accessible move buttons.
The screen loads the complete visible rule kind, up to 500 entries, before sending
an atomic batch of priorities. Saving order or editing a draft does not replace an
effective policy: each changed rule must be published separately. The published
version remains visible alongside the draft version.

Creation retries keep the same operation UUID. HTTP 409 keeps the editor contents;
loading the latest version shows the server configuration for review before an
explicit save. Mutations update the list only after server confirmation. Identity,
role and scope changes unmount forms and cancel pending reads.

## API and access

All requests use `apiClient` and validate responses with Zod. Routes: `GET/POST
/v1/rules`, `GET /v1/rules/targets`, `GET/PATCH/DELETE /v1/rules/:id`,
`GET /v1/rules/:id/versions`, `PUT /v1/rules/priority` and
`POST /v1/rules/:id/{publish,disable,rollback}`. The UI capability
`routing.rule.set` grants PLATFORM Admin/Ops only, matching the backend action.
PostgreSQL rechecks current assignments; UI visibility does not authorize a write.

`tests/rules-builder.test.mjs` covers typed AST boundaries, fallback uniqueness,
malformed responses, API pagination, retry references, versioned commands, role
denials, priority immutability and English/Vietnamese translation parity. Run the
repository gate documented in `AGENTS.md` before committing.

## Simulator (SS-1090 / SS-1088)

The inline simulator consumes `POST /v1/rules/simulate` from SS-1089. Ops may preview
ALLOCATION; Admin/Ops may preview CARRIER, through separate central capabilities.
Sample seller/warehouse references never change authenticated scope. Typed optional
facts retain zero/false and canonical VND strings; empty fields stay absent.

Current published policies are the default. Selecting a visible rule and an exact
saved draft/historical version previews it alongside other published policies;
it does not activate that version. Match traces explain priority, seller/warehouse
exclusion and missing facts. Carrier primary/fallback names retain policy order.
Planning/FEFO/split and tariff quote projections are shown as pending, without
fabricating prices, chosen warehouses or operational effects.

The form retains input on errors, supports retry, cancels obsolete requests and
only displays results for the current sample/configuration revision. Parent identity
changes unmount/reset the form; late API responses after auth-scope changes are denied.
Response validation rejects private fields, wrong kind/mode/version, inconsistent
trace/match, reordered carrier chains and fake selections. English/Vietnamese text
uses `RuleSimulator` messages. Tests: `tests/rule-simulator.test.mjs`.

Order splitting, physical allocation and carrier booking belong to their owning
workflows. Full SS-1088 acceptance awaits the verified P4/P5 projections.

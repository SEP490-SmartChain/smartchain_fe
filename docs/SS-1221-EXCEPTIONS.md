# SS-1221 — Exception investigation UI

`/exceptions` is backed by the real BE operations exception API. Admin/Manager retain scoped read access; `exceptions.manage` permits only Ops Dispatcher mutations. There is no seller, accountant or warehouse-staff access.

Filters cover status, type and accessible warehouse. The list and investigation show a safe source reference, seller name and business status, without buyer details, prices or job payloads. Empty results, failed loading, unavailable telemetry and partial bounded scans remain distinct.

The investigation form supports notes, live assignees, a durable retry request and verified resolution. Backend eligibility is advisory until mutation rechecks current state; stale updates refresh the detail. An uncertain response keeps the original request reference/content in page memory, including when closing and reopening the investigation. Auth/scope change aborts requests, suppresses stale responses and erases pending free text. Refreshing the browser discards page memory; backend state validation/idempotency still protects completed effects.

UC-114 is a separate explicit address-correction action. Only Ops can load the protected address projection, and only for editable blocked SALES orders without fulfillment work. The form selects supported province/ward codes, records a reason and revalidates the same order. WITHDRAWAL cannot be rerouted. The form reads current exception/order versions from this source after a conflict, retains the note for review and replays uncertain requests using the original reference even after the source is no longer editable. Old/new addresses stay in the private immutable backend audit and are omitted from general investigation history.

Times use Asia/Ho_Chi_Minh. Labels exist in both catalogs. Existing Common components provide the table, modal, form controls, recovery alerts and responsive layout. Local design artifact: [exception queue](sprint7/SS-1221-exception-queue.html). No Figma file was supplied, so no external Figma upload is claimed.

Requires the SS-1221 BE branch and migration. Claims are delivered separately under SS-1314. Project/production database migration and deployment are outside this implementation run.

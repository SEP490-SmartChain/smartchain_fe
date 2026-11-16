# SS-1221 UI verification

Run `node tests/fixtures/preview-exceptions.mjs`, then open `http://127.0.0.1:2327/tests/fixtures/exceptions-preview.html` in the current Chrome profile. It uses production components with synthetic API responses only. `?role=manager` selects read-only Manager.

2 November checks: Ops opened PARCEL_LIMIT, selected Retry, added investigation note and submitted. Reopening showed VALIDATED, immutable history and Retry disabled. Manager saw details/history without mutation controls. All filter defaults use explicit All labels and remain selectable. TypeScript, lint, format, all 1,386 FE tests and production build passed. Database authorization, actual retry/outbox and collector behavior are verified separately in BE disposable PostgreSQL/Redis tests.

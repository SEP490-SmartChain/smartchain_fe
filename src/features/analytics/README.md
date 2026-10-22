# features/analytics

SS-1029 implements role-scoped ORCA reports (UC-147–154, FE-53/54) through GET /v1/reports. Dashboard, Analytics, Admin Audit and health pages share ReportWorkspace; source errors are never replaced by fixture success.

Server options determine the available views and required warehouse per view. Existing route guards stay in force; Seller Staff has no financial fields, Seller audit remains denied, and no report action mutates business data. Changing auth revision unmounts the workspace and aborts requests.

Integer-string money is formatted with BigInt. Stock is current; date ranges apply to the stated event/cohort basis. Null metrics retain unavailable state. Health separates validation, timeout, circuit and unknown outcomes, with bounded safe business references and retry timestamps. Never infer payment, stock confirmation or resolved failures from these views.

See backend docs/SS-1029-ROLE-REPORTS.md for role/metric contracts, isolated source tests and historical-SLA/telemetry limitations.

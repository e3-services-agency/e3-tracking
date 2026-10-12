# Shared Findings table — 2026-10-12

User-approved D-84 / T-5-28 replaces the individual shared finding prose list with a semantic table consistent with event/property tables. Columns: Number, Severity, Event, Message, Status, Actions. Comparison appears under the message to retain context without crowding another column. Full names/messages wrap; comments and history stay on exact finding targets. Public tracking documents project only open findings; table status does not imply discussion completion or assignment.

Separate implementation, review and mounted UI QA are required before accepting source. Preserve summary aggregates, sidebar/event navigation, stable row links and existing Markdown payloads. No API, schema, identity, permission or production data changes are part of this task.

Execution limitation: normal sandbox and browser Node initialization still fail `setup refresh had errors` after user restart. Scoped escalated shell works. Actual visual desktop/narrow browser acceptance and deployment remain pending; no screenshot or live deployment may be claimed from source/tests alone.

T-5-27 remains separate: correct phone/general bare example to string +421949336382 while preserving other examples/metadata; classify email_invalid via scoped system_customer override. Attachment says email_invalid does not affect transactional emails, so existing voucher/order-update wording needs careful correction. Diagnosis only; no live data edits completed.

## Accepted source checks
Owner focused 15 tests/3 files PASS; backend/Vite production build, TypeScript, color lint and diff checks PASS. Independent reviewer repeated 15/3 PASS (31.40 seconds), independent mounted/source QA repeated 15/3 PASS (28.12 seconds), no skips. Exactly three source/test files. Current-finding row links deliberately differ from immutable report finding anchors, and an initial-hash reload regression passed. No visual geometry evidence, server starts, production data changes or deployment occurred.

## Integration checkpoint
Accepted owner ed504ee2240633040f8ecbb6d96cb84a6d0a8171 integrated on agent-setup as 5795058. Task status QA, not DONE. Existing production remains unchanged. Pending next gate: actual browser desktop/narrow inspection, then the already established release procedure if accepted. Do not conflate source integration with deployment.

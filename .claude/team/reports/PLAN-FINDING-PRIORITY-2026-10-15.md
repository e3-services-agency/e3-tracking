# Plan 2026-10-15: finding priority (D-89)

Requested by Ján Pan on 2026-10-15: plan a priority for findings, "proceed as usual; transactional back-end based data are most important". Decision D-89. Planning only; no code yet.

## Why
Today, findings are ordered by severity, then by finding number:
- `finding.dal.ts:122`
- `sharedFindingsModel.ts:11`
- the MCP `list_findings` tool

Event priority (critical, high, medium, low), the implementation method and use-case requirement levels (R/O) never affect that order. A warning on `purchase` therefore sorts below an error on a low-priority event. Clients and E3 have to re-rank the list by hand.

## Reading of the request
"Transactional back-end based data" means events whose data comes from the client's backend through the Tracking API: `events.implementation_method = 'server_api'`.
- Migration 0025 backfilled purchase, purchase_item, refund-like and consent events to it.
- Its derivation is in `src/domain/` (implementation method by name, class and sources).

These rank above every other business signal. If the user means something narrower (only purchase/refund-like events) or wider (any revenue event), only the tier predicate in the pure function below changes.

## Rule (pure, deterministic, explainable)
New pure module `src/domain/findingPriority.ts`, taking `(finding, context)` and returning `{ priority: 'P1'|'P2'|'P3'|'P4', rank: number, reasons: string[] }`.

**Business tier of the finding's event:**

| Tier | When | Reason text |
|---|---|---|
| `transactional` | the event's effective implementation method is `server_api` | "Transactional backend event" |
| `required` | a use case that is not dropped has a requirement with level `R` on this event, one of its variants, or the finding's property linked on this event | "Required by UC-03" (codes listed, at most three, then "+N") |
| `important` | the event's priority is `critical` or `high` | "Event priority high" |
| `normal` | everything else, including project-level findings with no event | none |

**Priority matrix (severity × tier):**

| | transactional | required | important | normal |
|---|---|---|---|---|
| error | P1 | P1 | P2 | P2 |
| warning | P2 | P3 | P3 | P4 |
| info | P3 | P4 | P4 | P4 |

**Rank** is a single integer for sorting: priority, then severity, then tier, then event priority, then finding_sequence. Lower sorts first. It is stable for identical inputs.

**Reasons** always start with the severity ("Error: blocks certification" or "Warning"), then the tier reasons. They name only data that is already public: the event name, use case codes, the event priority value.

## Where it is computed: backend, at read time, never stored
Priority depends on mutable definitions: an event's priority or method, use case status, requirements. A stored value would go stale, so it is derived on every read from the same transaction-consistent snapshot the read already uses. There is no migration. One context builder loads the inputs in batched queries (events, effective methods, live R requirements by event/variant/property, use case codes), never one query per finding:

- **`document.service.ts`:** `EventCardFinding` and `unattached_findings` items gain additive `priority`, `priority_rank` and `priority_reasons`. This reaches the internal card, the tracking document JSON, the HTML export, the public projection (`toPublicTrackingDocument`), `findings.json`, the document summary (`open_finding_count` stays; add `open_p1_count`), and MCP `get_event_card`/`get_tracking_document`.
- **`GET /api/projects/:id/findings`:** each row carries the three fields. It is sorted by `priority_rank` by default (`?sort=priority`, the default, or `?sort=severity` for the old order) and filterable with `?priority=P1,P2`.
- **MCP `list_findings`:** same fields, priority order, an optional `priority` filter.
- **QA reports (`captureQaReport`):** each recorded item stores the priority, rank and reasons as they were at capture time, inside its recorded JSON. That keeps reports immutable: report #4 shows what P1 meant then. Additive JSON, no migration. Older reports without the fields render without a priority.
- **Certification is unchanged:** only open, unacknowledged errors block it, as today. Priority is an ordering and explanation aid, not a new gate.

Tests:
- pure unit tests of every matrix cell and tier predicate, including a dropped use case, an O-level requirement, variant and property requirements, and a project-level finding
- route tests for the sort, the filter, and the public projection carrying only public reason text
- report capture freezing priority
- MCP order
- no N+1 queries (count queries for 500 findings)

## UI (after the backend)
- **Internal Findings page and portal QA findings table:**
  - a Priority column (P1 to P4 badge with the reasons as tooltip)
  - default sort by priority, plus a priority filter
  - the T-5-42 100-row cap and deep links keep working; the "Showing N of M" count respects the filter
- **Event card findings block and portal event page:** a priority badge per finding.
- **Portal overview:** an "Open P1" count beside findings by severity.
- **QA report view:** the recorded priority per item.
- Badge vocabulary (`badges.tsx`, a `PriorityBadge`-like `FindingPriorityBadge`), field hints for the new column, no raw hex.

## Tasks
- **T-5-47 (backend, first):** the pure rule, the batched context, the card/document/public projection, the findings route sort and filter, MCP, the report snapshot, and tests. Docs: `docs/TRACKING-DOCUMENT.md`, `docs/MCP.md`, `docs/SHARING.md` (new public fields).
- **T-5-48 (UI, after T-5-47 merges):** the internal Findings page, event card, portal QA, event page and overview, the QA report view, plus a help/glossary entry "Finding priority".

## Out of scope
- Manual priority overrides per finding.
- A configurable matrix per project.
- Notifications.
- Changing certification.
- Changing severities of existing finding kinds.

## Open question for the user (does not block T-5-47)
1. Should "transactional" be all `server_api` events (planned default), or only purchase/refund-like ones?

# QA sampler conformance build: intake answers and plan (2026-10-12)

For `e3-services-agency/e3-tools-extension` (handover d0c7693, section 11). Written from the e3-tracking side, which is the tracking-plan authority.

## Intake answers

**1. Authority.** The real tracking plan lives in e3-tracking (this repo), not in Bloomreach's `project/schemas`. The Bloomreach schema is the *Data Manager declaration* (shape only), which e3-tracking already imports (`data-manager-events.json`, `src/domain/import/dataManagerEvents.ts`) and compares with the plan (comparison 4, `definitionVsDataManager.ts`). What the plan carries that Bloomreach does not: required-ness (per event property link and per use case requirement level), named definitions per event (D-58), allowed values (enums), data formats (money, e164, iso dates…), naming convention (D-65), variants and discriminators (D-03), state-list consistency rules (D-63), money tolerance, identifiers each event must carry (D-67), ownership and status. So the conformance rules should NOT be re-implemented in the extension: e3-tracking's comparison 3 (`definitionVsObservations.ts`) already produces them from observations. The extension's job is to *collect* observations and the schema and hand them over.

**2. What fails a handover.** e3-tracking's certification (D-05/D-42): an event is certified when it has observations and no open `error` finding; acknowledged findings do not block. Severity mapping of the proposed rules onto existing finding kinds:

| proposed rule | e3-tracking kind | severity |
|---|---|---|
| type_mismatch | `type_mismatch` (plus `format_violation`) | error |
| undeclared_event | `unexpected_event` | error |
| undeclared_property | `unexpected_property` | warning |
| missing_required_property | `missing_required` | error |
| pii_not_declared | none today; proposal: new kind in comparison 4 (Data Manager `private` flag vs plan `pii`) | error |
| value_outside_examples | not a kind; allowed values are the gate (`enum_violation`, error); examples are documentation | drop or info in the extension only |

One type mismatch in 800 events and an undeclared event are indeed different: the app already treats both as errors but the Findings page lets you acknowledge the known ones, and certification is per event, so one bad event does not fail the whole handover.

**3. `value_outside_examples`.** Agree: examples are documentation. e3-tracking derives an enum's examples from its allowed values (T-5-11) and gates on `enum_violation` only.

**4. Volume.** e3-tracking shows counts per finding kind and family; `unexpected_property` on a real project (Airshoppen seed, 23 events, 194 properties) is the kind to watch. Run one sample through the comparison and read the counts before deciding on a gate.

## C0: the Bloomreach `type` vocabulary (captured from live exports, D-37)

`string`, `long text`, `url`, `number`, `boolean`, `date`, `datetime`, `list`. Mapping to the plan's types (`src/domain/bloomreach/dataManagerTypes.ts`): string/long text/url → string (+format long_text / uri), number → number, boolean → boolean, date → timestamp (+iso8601_date), datetime → timestamp, list → array. Unknown types import as string with a warning. Observed JS types map the obvious way (typeof string/number/boolean, Array.isArray → list, ISO or epoch → datetime). This is already exercised by comparison 3 and 4 tests; do not re-derive.

## Proposed plan

**Phase A, deliver observations instead of rules (replaces C1–C3).** The extension exports what it samples in the format e3-tracking already imports: `customer-events-export.json` = `{ customer_id, events: [{type, timestamp (epoch seconds), properties}] }` (one file per sampled customer or one combined file; customer_id is the Bloomreach id, matching the pseudonymous rule) plus `data-manager-events.json` from `project/schemas` (the existing Data Manager import). e3-tracking imports them as a QA run (preview + confirm, D-04), runs comparisons 1–4 and the rules, and shows findings, certification and the numbered QA report. No new rule code in the extension; the sampler stays read-only and replay-only.

**Phase B, direct submission (optional).** The extension talks to e3-tracking's MCP or REST: `submit_observations_batch` + `finish_qa_run` + `run_comparison` + `list_findings` (29-tool MCP, local `.mcp.json` or the GCP tunnel). Same data, no files.

**Phase C, targeted sampling (section 5 of the handover).** e3-tracking knows each event's variants and discriminators (`cart_update[action=add]`) and which use cases require them; export that list (`GET /export/tracking-document.json` → events[].variants) so the extension builds per-variant customer filters from captured console filter payloads. Only then is "declared but not observed" a population statement; until then keep the wording "not found in an N-customer sample; population not checked" (e3-tracking's `missing_event` finding carries the sample context).

**Phase D, the gaps that are real additions to e3-tracking.** (1) `pii_not_declared` as a comparison-4 finding (Data Manager `private` vs plan `pii`); (2) a sample-size field on QA runs so findings state N customers / M events; (3) the Data Manager events import accepting the `project/schemas` JSON shape directly if it differs from the export file shape.

## Constraints carried over
Read-only extension; no client data in either repo (e3-tracking's samples are synthetic or sandbox); ids-only archives are pseudonymous; diagnostics via console.info.

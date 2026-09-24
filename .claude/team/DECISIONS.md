# Decision records

Format in the `refactor-plan` skill. Never delete; supersede.

## D-01 In-house app is the single system of record
Date: 2026-09-24  Status: accepted
Context: The current workflow splits the tracking document between a Google Sheet, an Apps Script library, and this app. Multiple sources of truth made QA and documentation inconsistent.
Decision: The e3-tracking app holds all data. Google Sheets and Apps Script are retired. Exports are CSV and JSON files.
Consequences: The app must provide table editing, history, and client collaboration itself. Sheet import is at most a one-off migration tool, not a feature.

## D-02 No legacy compatibility
Date: 2026-09-24  Status: accepted
Context: The product will be used for new clients going forward; existing workbooks are not migrated as a requirement.
Decision: No compatibility with the old workbook, connector, or library is maintained. The old workbook serves only as a coverage reference.
Consequences: Agents may remove Sheet-era code freely once the audit confirms what depends on it.

## D-03 Variants are event plus discriminator conditions
Date: 2026-09-24  Status: accepted
Context: Use cases depend on event variants such as cart_update with action=add or purchase with purchase_status=success. Modelling every combination of variant and location explodes.
Decision: A variant is an event plus conditions over one or two discriminator properties, which are enums. Location-like dimensions are context enums that feed a computed coverage grid and never create variants. This matches Bloomreach's data-mapping filter format exactly.
Consequences: Discriminators must be flagged and highlighted in the UI. Export to Bloomreach mapping is one to one. Coverage is reported, not authored.

## D-04 Bloomreach JSON formats are first-class import and export with diff
Date: 2026-09-24  Status: accepted
Context: The user copies customer events exports, data mapping, and expiration settings as JSON via a Bloomreach bridge.
Decision: Each format has paste-in import producing a diff that must be confirmed, and copy-out export. No silent overwrite.
Consequences: The diff engine is shared with the QA comparison engine.

## D-05 Certified status is derived, not set
Date: 2026-09-24  Status: accepted
Context: The certified data product pattern requires an objective certification rule.
Decision: An event is certified when the three comparisons (definition vs mapping, mapping vs observations, definition vs observations) yield zero error findings for it.
Consequences: Status cannot be edited by hand; it changes when definitions, mapping, or observations change.

## D-06 Use cases are templates plus client instances
Date: 2026-09-24  Status: accepted
Context: E3 deploys about 90 standard use cases; the library will be loaded later.
Decision: Model UseCaseTemplate and UseCase (instance) from the start. Requirements hang off instances. Library content is out of scope until the user provides it.
Consequences: Loading the library later is an import, not a refactor.

## D-07 Simplified UI during the agent build phase
Date: 2026-09-24  Status: accepted
Context: Agents work best against plain, predictable, testable UI; polish is wasted while the model is moving.
Decision: Plain tables and forms only until the user lifts this. No design work in tasks unless explicitly requested.
Consequences: qa-tester verifies behaviour, not appearance.

## D-08 Branching and commits
Date: 2026-09-24  Status: accepted
Context: The deployed product on `main` must stay untouched and easy to revert to.
Decision: All work on `agent-setup` and `task/<id>-<slug>` branches. Commits only when the user asks. No merge to `main` without the user.
Consequences: Reverting the whole effort is deleting branches.

## D-09 Local-first development and testing
Date: 2026-09-24  Status: accepted
Context: The current product is deployed remotely. The rebuild must be usable and verifiable before anything touches a remote environment.
Decision: Every phase runs and is QA-tested entirely on the local machine, including persistence. Remote deployment is a separate, later step approved by the user.
Consequences: The audit must report what the app needs from remote services today. The plan must provide a local persistence and run story in phase 1. qa-tester runs against localhost only.

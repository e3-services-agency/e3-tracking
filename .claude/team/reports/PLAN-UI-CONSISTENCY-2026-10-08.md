# Approved UI consistency follow-up

User approved the three-part proposal with "Proceed" on2026-10-08. D-77 supplements D-73; existing coordinator/implementer/reviewer/QA separation and accepted task-commit/integration authorization continue. Root is sole writer of team records. Main, staging and machine.mcp remain untouched.

## T-5-18: Internal property counts and hierarchy
- Show a compact definition count beside every property name, including1definition; count includes general and uses the already loaded definitions array.
- Clicking the count expands/collapses inline definitions without opening the edit drawer. Keep the existing right-hand Definitions edit shortcut.
- Category headers gain clearer background/spacing. Indent property names under categories, then definition names one level further; other columns stay aligned.
- Provide one reusable presentational `DefinitionCountBadge({count:number})` component for both views. It renders a noninteractive span, so each view can supply its own accessible expansion control without nested buttons. File ownership: T18 owns this component.
- Preserve filters, sorting, expand-all, row editing and copy-name actions. Long names/counts must remain readable without hiding the badge.

## T-5-19: Shared presentation consistency
- Reuse internal visual primitives/branding for the header, typography, buttons, badges, icons, table treatment, page gutters and sidebar spacing. Use available content width effectively.
- Show the same definition count beside shared property names and apply the same category/property/definition hierarchy; counts reflect only permitted public document data.
- Full names/descriptions continue to wrap; keep current single-document navigation, anchors, expansion, comments, identity controls, exports and direct links.
- Public read/comment capabilities and server-side projection remain enforced. Internal edit/delete controls and privileged data do not become shared features.
- T19 owns SharedProject, SharedNav, SharedEntityTable and any layout-only reusable extraction needed; it consumes T18's count badge without editing it. No backend, migrations, OAuth, package or deployment-script changes in this UI scope.

## T-5-20: Acceptance and live release
- Separate reviewer and QA verdicts for both implementations; meaningful focused behavioral checks for count expansion/row editing interaction and existing public boundaries.
- Coordinator runs one final controlled full suite on the integrated changes, plus build/lint and actual browser checks of internal/shared desktop and narrow layouts with a disposable fixture.
- Use existing managed task worktrees. Do not install/remove/archive through the preserved portal node_modules junction.
- Commit accepted changes and integrate agent-setup. Existing dirty machine.mcp remains excluded; record image input commit/digest.
- Deploy through approved GCP SDK scripts, each relevant script dry-run first; verify current schema0038, health, backup and data counts. The prior pre0037 snapshot is historical recovery evidence, not a new snapshot recipe for0038. This release introduces no schema change.
- Update BOARD/TASKS/CONTEXT/DECISIONS and deployment handover/runbook with verified outcomes and any limits. Preserve user staging and existing auth configuration.

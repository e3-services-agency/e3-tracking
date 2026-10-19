# Compact MCP reads — deployed 2026-10-19

The owner explicitly approved production deployment in this chat. Tracking and Cortex are healthy;
business-table fingerprints are unchanged. No real finding references were attached, no business
approvals were executed, and the Codex Cortex allowlist and server grants remain unchanged.

## Immutable release identity

Tracking source: `4f178f7839b5ca32b14eb668eabd9087943808e3`, rebased onto the current production
revision `7352c1c9` through `0cec1c4b`, preserving the existing decision reconciliation features.

| Component | Registry image digest |
| --- | --- |
| Tracking app, backup, MCP | `europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:bc76a866f4603eda1c64f15306a27b59d22285c6d6bd1fc34ff86e177535ce9f` |
| Cortex pilot | `europe-west1-docker.pkg.dev/e3-cortex/e3-cortex/agency-pilot@sha256:721f53e48c4d1bf3c7c38f9a4d8314d05ff60408431a45f4ef661bd4428acc51` |
| Cortex gateway | `europe-west1-docker.pkg.dev/e3-cortex/e3-cortex/agency-gateway@sha256:1bc954062851e7c80641975dd0d83b58f193c750cdd5524183977c7adc37b0e8` |

Cortex used a verified frozen overlay over its exact deployed source, retaining unrelated checkout
work. Source manifest: `16626afbd86cb67e62d8d62825c1e243e6c9153069ed421a083bcd86920c103f`;
tag: `cortex-fbd20ec41a2e-16626afbd86c`. Both servers advertise agent conventions `2026-10-19.1`.
Tracking now runs `0054_external_references.sql`; Cortex has no schema change in this release.

## Acceptance evidence

Live Tracking MCP and the existing authenticated connector agree:

| ODO response | Characters | Result |
| --- | ---: | --- |
| Findings summary | 1,692 | 486 open findings; totals match database and default list |
| Default findings page | 6,026 | 10 rows, readable event/property names, explicit continuation |
| Default use cases | 8,565 | All 33 rows, total 33, limit 100, no truncation |

All pages reproduced the exact full-detail result: 584 total finding IDs, including resolved
history, with consistent markers and preserved public rows/order. Matching conditional reads
returned unchanged replies with state and no body; a different hash returned the current object.
All 42 original business tables retained their original rows and column values. Integrity and
foreign-key checks passed, and the external-reference table remains empty.

Live Cortex HTTPS checks verified capability revision, all page-envelope fields, stable markers,
conditional state without body, field projection, fields overriding body inclusion, and scope
denials. Its existing company reader advertised 12 tools and 26 library resources. Library access
continued to refuse raw workspace-document access. The Codex three-tool filter still explains the
client-side difference from Claude's separately reported 16-tool OAuth inventory.

Public health endpoints returned 200 and unauthenticated MCP returned 401 on both services.
Running digests were independently checked after cutover. Existing edge images, OAuth configuration
and authority boundaries were preserved.

Validation included build/lint/inventory checks, 71 post-rebase tests covering changed behavior and
retained production functionality, exact Tracking-image MCP discovery, 85 Cortex gateway tests,
75 PostgreSQL/helper tests and combined real HTTP/PostgreSQL MCP acceptance. The final Cortex
metadata-only correction passed 25 gateway/contract tests. Initial verification harness issues
(local fixed-subnet collision, environment inheritance, host health-port assumption, and reader
scope assumptions) were corrected; successful deployed checks above supersede those failed probes.

## Recovery and operational receipts

Tracking: fresh offsite backups of all four projects restored through the candidate image with
zero warnings and GCS size/MD5 matches. A quiescent full snapshot and extracted-copy migration
rehearsal passed before cutover:
`/var/backups/e3-tracking/post-portal-0050-20261019T165307Z`.
The old image is `europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:bc736232cff6ca2b63f4e33364d12e2cc8220f41dd76443d203bfa62c1617bc7`.
All four projects uploaded successfully again after restart at `2026-10-19T16-54-35-260Z`.
Host operation receipts: `/var/backups/e3-tracking/compact-release-20261019`.
The schema0050 recovery script is retained with the operation scripts; the
[schema0054 maintenance helper](../deploy/gcp/maintenance-mcp0054.sh) supports future releases.

Cortex: verified offsite backup and restore rehearsal at `/data/backups/framework-20261019T165250Z`;
previous image/config pins and exact before/after fingerprints remain under
`/data/cortex-agent-conventions-release-20261019`. The backup timer resumed its previous active state.
Previous pilot digest: `0487581e759440c07d28b91cec4b4696ab4092507e9818e115da6fda42fd6561`;
previous gateway digest: `6b181846674f90f6d868a1dbd80ae224c5d62ec15adb7a5050958b325e22e428`.

Rollback must restore matched data/config and image pins. Never run the old Tracking image on
schema0054. A full restore must revoke connector authorizations before exposure, as the retained
maintenance procedures require.

## Client migration

[MCP documentation](MCP.md) records changed defaults and list envelopes. Refresh/reconnect the
client to discover the new tool schemas. Lists now return bounded `items` envelopes with defaults
10 for findings/history and 100 for events/use cases. Request explicit fields or `include=detail`
for long evidence fields. The [shared agent conventions](AGENT-CONVENTIONS.md) and
[shared error codes](AGENT-ERRORS.md) are linked by both servers.

Attaching the Cortex review to the seven real P1 findings remains a separate owner-approved action.

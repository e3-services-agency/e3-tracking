# WP6 operator parity audit — 2026-10-19

Scope: current staff/shared UI persistence routes and their registered MCP equivalents, plus explicit
WP-UC additions. This is a source audit of release candidate 0.5.1, not authorization to build WP6
gaps. Local view filters/sorting/browser identity preferences do not mutate project records and
remain UI-only. Download/export GETs are reads. OAuth connection management remains human UI-only.

Classification: MCP-covered means a tool exists for that action; it does not imply every REST
field has an identical schema. Missing means no equivalent complete action was found. Deliberately
UI-only is the recommended boundary to retain, not a newly enforced policy. A broader future scope
needs Ján's selection. Tool source of truth: [registration](../src/mcp/registerTools.ts),
[write inventory](../src/mcp/tools/writeTools.ts), [policy](../src/mcp/toolPolicy.ts).

## Principal findings

- UI use-case statuses remain `proposed`, `approved`, `in_progress`, `live`, `dropped` (or unset);
  priorities remain `critical`, `high`, `medium`, `low` (or unset):
  [enums](../src/domain/enums.ts#L16), [lifecycle](../src/domain/enums.ts#L303).
- `get_history(entity_type="use_case")` already exists. Request `include="detail"` for before/after
  diffs; actor, agent and batch ID are compact metadata:
  [history](../src/mcp/tools/history.ts#L24).
- WP1 adds guarded lifecycle/priority/owner/note maintenance, not use-case creation, narratives or
  requirements. WP2 exposes separately labelled unverified pointers, preserving the existing
  evidence-backed mapping importer: [mapping service](../src/backend/services/assetLinks.service.ts#L41),
  [new tools](../src/mcp/tools/writeUseCases.ts).
- The brief overstates identifier, identity-rule, catalog-field and QA metadata parity: creation
  or finish exists, while complete edit/order/delete parity does not.
- The UI currently has open/resolved findings, not accept-as-intended or won't-fix:
  [finding writes](../src/backend/routes/findings.ts#L68). Do not invent business statuses in WP1–5.
- Native decision approvals require staff identity, exact browser origin and explicit human
  confirmation. Agents may later gain proposal tools; approval is not an agent write:
  [decision routes](../src/backend/routes/decision-inbox.ts#L18),
  [staff guard](../src/backend/middleware/staffMutation.ts#L3).

## Action inventory

The table inventories literal mutation routes backing current editing surfaces. Dynamic captured
evidence preview/apply modes are expanded. Endpoint paths are relative to the file's mounted resource.
Some routes share one UI submit operation; every route remains listed for completeness. Binary uploads, comment attachments and shared comment actions are included. OAuth protocol internals
are excluded from operator data-maintenance parity; consent and connection revocation remain human UI-only.

| Resource | Method/path | Classification | Existing coverage / gap | Source |
| --- | --- | --- | --- | --- |
| bundles | `POST /` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/bundles.ts#L27) |
| bundles | `PATCH /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/bundles.ts#L41) |
| bundles | `DELETE /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/bundles.ts#L55) |
| captured-evidence | `POST /links/preview` | Deliberately UI-only (reviewed mapping) | Reviewed mappings require exact retained source captures plus human confirmation. New pointer tools do not bypass that evidence/authority boundary. | [route](../src/backend/routes/captured-evidence.ts#L12) |
| captured-evidence | `POST /links/apply` | Deliberately UI-only (reviewed mapping) | Reviewed mappings require exact retained source captures plus human confirmation. New pointer tools do not bypass that evidence/authority boundary. | [route](../src/backend/routes/captured-evidence.ts#L12) |
| captured-evidence | `POST /preview` | Missing | Reviewed mappings require exact retained source captures plus human confirmation. New pointer tools do not bypass that evidence/authority boundary. | [route](../src/backend/routes/captured-evidence.ts#L16) |
| captured-evidence | `POST /apply` | Missing | Reviewed mappings require exact retained source captures plus human confirmation. New pointer tools do not bypass that evidence/authority boundary. | [route](../src/backend/routes/captured-evidence.ts#L16) |
| catalogs | `POST /` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L40) |
| catalogs | `PATCH /:id` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L69) |
| catalogs | `POST /:id/live` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L83) |
| catalogs | `DELETE /:id` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L96) |
| catalogs | `POST /:id/fields` | MCP-covered | create_catalog_field | [route](../src/backend/routes/catalogs.ts#L132) |
| catalogs | `PUT /:id/fields/order` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L150) |
| catalogs | `PATCH /:id/fields/:fieldId` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L163) |
| catalogs | `DELETE /:id/fields/:fieldId` | Missing | Adding fields is covered; catalog lifecycle and field maintenance are separate gaps. | [route](../src/backend/routes/catalogs.ts#L177) |
| clients | `POST /` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/clients.ts#L19) |
| clients | `PATCH /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/clients.ts#L45) |
| clients | `DELETE /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/clients.ts#L63) |
| commentAttachments | `POST /` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/commentAttachments.ts#L44) |
| commentAttachments | `DELETE /:attId` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/commentAttachments.ts#L55) |
| comments | `POST /` | Missing | Applies to event/property/use_case/finding/requirement and other supported discussion targets. No comment write tools registered. | [route](../src/backend/routes/comments.ts#L88) |
| comments | `PATCH /:id` | Missing | Applies to event/property/use_case/finding/requirement and other supported discussion targets. No comment write tools registered. | [route](../src/backend/routes/comments.ts#L112) |
| comments | `POST /:id/reactions` | Missing | Applies to event/property/use_case/finding/requirement and other supported discussion targets. No comment write tools registered. | [route](../src/backend/routes/comments.ts#L141) |
| comments | `DELETE /:id` | Missing | Applies to event/property/use_case/finding/requirement and other supported discussion targets. No comment write tools registered. | [route](../src/backend/routes/comments.ts#L162) |
| comparison | `POST /run` | MCP-covered | run_comparison | [route](../src/backend/routes/comparison.ts#L19) |
| consent-categories | `POST /` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/consent-categories.ts#L30) |
| consent-categories | `PATCH /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/consent-categories.ts#L56) |
| consent-categories | `DELETE /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/consent-categories.ts#L69) |
| consent-categories | `POST /reorder` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/consent-categories.ts#L79) |
| decision-inbox | `POST /preview` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L12) |
| decision-inbox | `POST /import` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L13) |
| decision-inbox | `POST /:id/reconcile/preview` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L14) |
| decision-inbox | `POST /:id/reconcile/apply` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L15) |
| decision-inbox | `POST /:id/sources/preview` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L16) |
| decision-inbox | `POST /:id/sources/apply` | Missing | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L17) |
| decision-inbox | `POST /:id/actions` | Deliberately UI-only (human approval) | Agent proposal/reconciliation may be considered in WP6. Human acceptance and native approval remain human actions. | [route](../src/backend/routes/decision-inbox.ts#L18) |
| events | `POST /` | MCP-covered | create_event | [route](../src/backend/routes/events.ts#L84) |
| events | `PATCH /:id` | MCP-covered | update_event | [route](../src/backend/routes/events.ts#L107) |
| events | `DELETE /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L116) |
| events | `POST /:id/properties` | MCP-covered | link_event_property | [route](../src/backend/routes/events.ts#L139) |
| events | `POST /:id/properties/from-bundle` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L154) |
| events | `PUT /:id/properties` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L167) |
| events | `PATCH /:id/properties/:propertyId` | MCP-covered | link_event_property | [route](../src/backend/routes/events.ts#L182) |
| events | `DELETE /:id/properties/:propertyId` | Deliberately UI-only (retain) | unlink_event_property | [route](../src/backend/routes/events.ts#L196) |
| events | `POST /:id/variants` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L264) |
| events | `PATCH /:id/variants/:variantId` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L290) |
| events | `DELETE /:id/variants/:variantId` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L304) |
| events | `POST /:id/rules` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L342) |
| events | `POST /:id/rules/from-template/:key` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/events.ts#L359) |
| files | `POST /` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/files.ts#L14) |
| findings | `PATCH /:id` | Missing | Current UI supports only open/resolved. Accept-as-intended, won’t-fix and reason-required workflows were not found. No new finding statuses in WP1–5. | [route](../src/backend/routes/findings.ts#L68) |
| historical-files | `POST /sources` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/historical-files.ts#L12) |
| historical-files | `POST /preview` | MCP-covered | preview_historical_validation | [route](../src/backend/routes/historical-files.ts#L19) |
| historical-files | `POST /apply` | MCP-covered | apply_historical_validation | [route](../src/backend/routes/historical-files.ts#L20) |
| identifiers | `POST /` | Missing | set_event_identifiers selects identifiers on an event; it does not manage registry entries. create_identity_rule can incidentally register one. | [route](../src/backend/routes/identifiers.ts#L29) |
| identifiers | `PUT /order` | Missing | set_event_identifiers selects identifiers on an event; it does not manage registry entries. create_identity_rule can incidentally register one. | [route](../src/backend/routes/identifiers.ts#L39) |
| identifiers | `PATCH /:id` | Missing | set_event_identifiers selects identifiers on an event; it does not manage registry entries. create_identity_rule can incidentally register one. | [route](../src/backend/routes/identifiers.ts#L52) |
| identifiers | `DELETE /:id` | Missing | set_event_identifiers selects identifiers on an event; it does not manage registry entries. create_identity_rule can incidentally register one. | [route](../src/backend/routes/identifiers.ts#L60) |
| identity-rules | `POST /` | MCP-covered | create_identity_rule (including new identifier registration) | [route](../src/backend/routes/identity-rules.ts#L56) |
| identity-rules | `PUT /:id/carried-by` | Missing | Create is covered; edit, carried-by links, order and deletion are separate gaps. | [route](../src/backend/routes/identity-rules.ts#L103) |
| identity-rules | `PATCH /:id` | Missing | Create is covered; edit, carried-by links, order and deletion are separate gaps. | [route](../src/backend/routes/identity-rules.ts#L119) |
| identity-rules | `DELETE /:id` | Missing | Create is covered; edit, carried-by links, order and deletion are separate gaps. | [route](../src/backend/routes/identity-rules.ts#L132) |
| identity-rules | `POST /reorder` | Missing | Create is covered; edit, carried-by links, order and deletion are separate gaps. | [route](../src/backend/routes/identity-rules.ts#L142) |
| imports | `POST /data-mapping/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L42) |
| imports | `POST /data-mapping/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L50) |
| imports | `POST /expiration-settings/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L59) |
| imports | `POST /expiration-settings/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L67) |
| imports | `POST /customer-events-export/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L76) |
| imports | `POST /customer-events-export/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L84) |
| imports | `POST /data-manager-customers/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L97) |
| imports | `POST /data-manager-customers/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L105) |
| imports | `POST /data-manager-events/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L114) |
| imports | `POST /data-manager-events/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L122) |
| imports | `POST /qa-sample/preview` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L144) |
| imports | `POST /qa-sample/apply` | Missing | Submitting observations is not equivalent to importing source mappings/Data Manager snapshots/QA manifests. | [route](../src/backend/routes/imports.ts#L153) |
| observations | `PATCH /:id` | MCP-covered | update_observation | [route](../src/backend/routes/observations.ts#L25) |
| observations | `DELETE /:id` | MCP-covered | delete_observation | [route](../src/backend/routes/observations.ts#L46) |
| project-promotion | `POST /preview` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/project-promotion.ts#L10) |
| project-promotion | `POST /apply` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/project-promotion.ts#L13) |
| projects | `POST /sandbox` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L17) |
| projects | `POST /` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L38) |
| projects | `PATCH /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L97) |
| projects | `DELETE /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L132) |
| projects | `POST /:id/share` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L175) |
| projects | `PATCH /:id/share` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L187) |
| projects | `POST /:id/share/members` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L203) |
| projects | `PATCH /:id/share/members/:memberId` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L214) |
| projects | `DELETE /:id/share/members/:memberId` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L224) |
| projects | `DELETE /:id/share` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/projects.ts#L234) |
| properties | `POST /` | MCP-covered | create_property | [route](../src/backend/routes/properties.ts#L98) |
| properties | `PATCH /:id` | MCP-covered | update_property | [route](../src/backend/routes/properties.ts#L137) |
| properties | `DELETE /:id` | Deliberately UI-only (retain) | Named-definition CRUD/order lacks full MCP parity; link_event_property can incidentally create one by name. | [route](../src/backend/routes/properties.ts#L150) |
| properties | `POST /:id/definitions` | Missing | Named-definition CRUD/order lacks full MCP parity; link_event_property can incidentally create one by name. | [route](../src/backend/routes/properties.ts#L184) |
| properties | `PATCH /:id/definitions/:definitionId` | Missing | Named-definition CRUD/order lacks full MCP parity; link_event_property can incidentally create one by name. | [route](../src/backend/routes/properties.ts#L202) |
| properties | `DELETE /:id/definitions/:definitionId` | Deliberately UI-only (retain) | Named-definition CRUD/order lacks full MCP parity; link_event_property can incidentally create one by name. | [route](../src/backend/routes/properties.ts#L216) |
| properties | `PUT /:id/definitions/order` | Missing | Named-definition CRUD/order lacks full MCP parity; link_event_property can incidentally create one by name. | [route](../src/backend/routes/properties.ts#L225) |
| qa-runs | `PATCH /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/qa-runs.ts#L36) |
| qa-runs | `POST /:id/finish` | MCP-covered | finish_qa_run | [route](../src/backend/routes/qa-runs.ts#L53) |
| qa-runs | `DELETE /:id` | MCP-covered | delete_qa_run | [route](../src/backend/routes/qa-runs.ts#L64) |
| restore-backup | `POST /preview` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/restore-backup.ts#L14) |
| restore-backup | `POST /apply` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/restore-backup.ts#L22) |
| rules | `PATCH /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/rules.ts#L45) |
| rules | `DELETE /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/rules.ts#L54) |
| shared | `POST /:token/comments` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/shared.ts#L367) |
| shared | `POST /:token/comments/:commentId/attachments` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/shared.ts#L433) |
| shared | `PATCH /:token/comments/:id/status` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/shared.ts#L478) |
| shared | `POST /:token/comments/:id/reactions` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/shared.ts#L506) |
| sharedAuth | `POST /:token/auth/google` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/sharedAuth.ts#L163) |
| sharedAuth | `POST /:token/auth/logout` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/sharedAuth.ts#L187) |
| sources | `POST /` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/sources.ts#L26) |
| sources | `PATCH /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/sources.ts#L46) |
| sources | `DELETE /:id` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/sources.ts#L61) |
| standard-event-mappings | `PUT /:standardEvent` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/standard-event-mappings.ts#L28) |
| standard-event-mappings | `DELETE /:standardEvent` | Missing | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/standard-event-mappings.ts#L47) |
| use-case-templates | `POST /import/preview` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/use-case-templates.ts#L31) |
| use-case-templates | `POST /import/apply` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/use-case-templates.ts#L54) |
| use-case-templates | `PATCH /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/use-case-templates.ts#L76) |
| use-case-templates | `DELETE /:id` | Deliberately UI-only (retain) | No corresponding write tool registered; decide in WP6. | [route](../src/backend/routes/use-case-templates.ts#L89) |
| use-cases | `POST /` | Missing | WP1 covers only status, priority, business/technical owners, status note. Other edits remain missing. | [route](../src/backend/routes/use-cases.ts#L45) |
| use-cases | `POST /from-template/:templateId` | MCP-covered | instantiate_use_case_template | [route](../src/backend/routes/use-cases.ts#L71) |
| use-cases | `POST /from-template/:templateId/preview` | MCP-covered | instantiate_use_case_template (dry_run) | [route](../src/backend/routes/use-cases.ts#L114) |
| use-cases | `PATCH /:id` | Missing | WP1 covers only status, priority, business/technical owners, status note. Other edits remain missing. | [route](../src/backend/routes/use-cases.ts#L132) |
| use-cases | `POST /:id/narrative/regenerate` | Missing | WP1 covers only status, priority, business/technical owners, status note. Other edits remain missing. | [route](../src/backend/routes/use-cases.ts#L146) |
| use-cases | `DELETE /:id` | Deliberately UI-only (retain) | WP1 covers only status, priority, business/technical owners, status note. Other edits remain missing. | [route](../src/backend/routes/use-cases.ts#L167) |
| use-cases | `PUT /:id/requirements` | Missing | WP1 covers only status, priority, business/technical owners, status note. Other edits remain missing. | [route](../src/backend/routes/use-cases.ts#L198) |

Additional MCP-only maintained actions: `submit_observation`, `submit_observations_batch`,
`set_event_identifiers`, `add_reference`, `update_use_case`, `link_use_case_asset`,
`unlink_use_case_asset`, and `batch_apply` (the three use-case operations are batch operations too).
Use-case pointer attachments are read through `get_use_case`; list metadata includes `asset_count`.

Recommended next review order after WP1–5: use-case creation/narrative/requirements; reasoned finding
resolution within the existing status model; variants/rules; catalog/identifier maintenance; scoped
comments. Retain destructive entity deletion and access/approval management in the human UI until
an explicitly reviewed design changes that boundary. No WP6 gap is implemented by this audit.

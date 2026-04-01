export type PropertyValueType = 'string' | 'boolean' | 'integer' | 'float';
export type PresenceRule = 'Always sent' | 'Sometimes sent' | 'Never sent';

export interface CustomFieldDef {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'url';
}

export interface Settings {
  customEventFields: CustomFieldDef[];
  customPropertyFields: CustomFieldDef[];
  /** Client logo URL for co-branded header (optional). */
  client_logo_url?: string | null;
  /** Client/project name for co-branded header (optional). */
  client_name?: string | null;
  /** Client primary color; sets --brand-primary when present. */
  client_primary_color?: string | null;
}

export interface Property {
  id: string;
  name: string; // snake_case
  description: string;
  property_value_type: PropertyValueType;
  is_list: boolean;
  attached_events: { eventId: string; presence: PresenceRule }[];
  value_constraints: string | string[];
  categories: string[];
  tags: string[];
  customFields?: Record<string, any>;
}

export interface PropertyBundle {
  id: string;
  name: string;
  description: string;
  propertyIds: string[];
}

export interface Source {
  id: string;
  name: string;
  color?: string;
}

export interface Destination {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface EventAction {
  id: string;
  type: string; // e.g., "Log Event", "Log Page View"
  eventProperties: string[]; // Property IDs
  systemProperties: string[]; // Property IDs
  pinnedProperties?: Record<string, string>; // Property ID -> Pinned Value
}

export type TrackingStatus = 'Draft' | 'Ready' | 'Implementing' | 'Implemented';

export interface EventVariant {
  id: string;
  name: string;
  description?: string;
  propertyOverrides: Record<string, { presence?: PresenceRule; constraints?: string | string[] }>;
  triggerOverrides?: string;
  /** Same status options as event (customFields.trackingStatus). */
  trackingStatus?: TrackingStatus;
}

export interface Event {
  id: string;
  name: string;
  description: string;
  categories: string[];
  tags: string[];
  sources: Source[];
  actions: EventAction[];
  variants: EventVariant[];
  ownerTeamId?: string;
  stakeholderTeamIds: string[];
  customFields?: Record<string, any>;
}

export type QAStatus = 'Pending' | 'Passed' | 'Failed';

export interface TestingProfile {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export interface QAProof {
  id: string;
  name: string;
  type: 'image' | 'text' | 'json';
  content: string;
  createdAt: string;
  /**
   * Optional persisted validation evidence for payload-like proofs.
   * Stored in QA run payload JSON (not a DB column).
   */
  validation_status?: 'pass' | 'fail' | 'unknown';
  validation_issues?: string[];
}

export interface QAVerification {
  nodeId: string;
  status: QAStatus;
  notes?: string;

  /**
   * Manual JSON payload pasted by tester in sidebar.
   * Kept separately from uploaded JSON proof files.
   */
  proofText?: string;

  /**
   * Persisted uploaded proofs for this node verification.
   * Supports multiple images and JSON files.
   */
  proofs?: QAProof[];

  /**
   * Run-level testing profiles linked to this node.
   */
  testingProfileIds?: string[];

  /**
   * Node-specific extra testing profiles.
   */
  extraTestingProfiles?: TestingProfile[];
}

export interface QARun {
  id: string;
  name: string;
  createdAt: string;
  /**
   * When set, the run is "ended" (locked) and UI should be read-only.
   */
  endedAt?: string | null;

  /**
   * Optional QA metadata
   */
  testerName?: string;
  environment?: string;
  overallNotes?: string;

  /**
   * Shared testing profiles for the run
   */
  testingProfiles?: TestingProfile[];

  /**
   * Snapshot of journey layout for this run
   */
  nodes?: any[];
  edges?: any[];

  /**
   * Node-level QA verification data
   */
  verifications: Record<string, QAVerification>;
}

export interface Journey {
  id: string;
  name: string;
  nodes: any[]; // ReactFlow nodes
  edges: any[]; // ReactFlow edges
  /** Explicit journey step order (journeyStepNode ids). */
  step_order?: string[] | null;
  qaRuns?: QARun[];
  /** Homepage optimization: total QA runs count for this journey. */
  qaRunsCount?: number;
  /** Homepage optimization: reconstructed latest QA run used for derived status. */
  latestQARun?: QARun | null;
  /** Counts of step implementation types (new / enrichment / fix). Set on canvas save. */
  type_counts?: { new?: number; enrichment?: number; fix?: number } | null;
  /** Global testing instructions for AI/human testers (Markdown). Synced to API. */
  testing_instructions_markdown?: string | null;
  /** Preferred codegen tab/style shown in trigger/docs context. */
  codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
  /**
   * Public sharing toggle is derived from this:
   * - null => not publicly shareable
   * - non-null => public share is enabled (legacy token value)
   */
  share_token?: string | null;
}

export interface TrackingPlanData {
  settings: Settings;
  properties: Property[];
  propertyBundles: PropertyBundle[];
  sources: Source[];
  destinations: Destination[];
  teams: Team[];
  events: Event[];
  journeys: Journey[];
  /** Category names created via "New Category" (shown even with no events). */
  customCategories?: string[];
}

export interface Branch {
  id: string;
  name: string;
  baseData: TrackingPlanData;
  draftData: TrackingPlanData;
  approvals: string[]; // Team IDs that have approved
}

// ---------------------------------------------------------------------------
// Phase 1 Core Data Foundation — DB/API schema types (relational model).
// See docs/DATA_SCHEMA_AND_ARCHITECTURE_PLAN.md. Use for API and DB layer.
// ---------------------------------------------------------------------------
export type {
  PropertyContext,
  PropertyDataType,
  PropertyDataFormat,
  CatalogFieldDataType,
  CatalogFieldFamily,
  CatalogFieldItemLevel,
  CatalogFieldSourceMappingType,
  EventPropertyPresence,
  MetricAggregationType,
  QARunStatus,
  NamingConvention,
  WorkspaceAuditRules,
  WorkspaceRow,
  WorkspaceSettingsRow,
  SourceRow,
  PropertyRow,
  CreatePropertyInput,
  PropertySourceRow,
  EventRow,
  EventTriggerEntry,
  CreateEventInput,
  EventSourceRow,
  MetricRow,
  CreateMetricInput,
  EventPropertyRow,
  JourneyRow,
  JourneyEventRow,
  QARunRow,
  QARunEvidenceRow,
  QARunPayloadRow,
  CatalogFieldSourceMapping,
  PropertyValueSchemaNode,
  PropertyValueSchema,
  PropertyExampleValue,
  PropertyNameMappingRole,
  PropertyNameMapping,
} from './types/schema';
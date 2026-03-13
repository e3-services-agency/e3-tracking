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

export interface EventVariant {
  id: string;
  name: string;
  description?: string;
  propertyOverrides: Record<string, { presence?: PresenceRule; constraints?: string | string[] }>;
  triggerOverrides?: string;
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
  qaRuns?: QARun[];
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
}

export interface Branch {
  id: string;
  name: string;
  baseData: TrackingPlanData;
  draftData: TrackingPlanData;
  approvals: string[]; // Team IDs that have approved
}
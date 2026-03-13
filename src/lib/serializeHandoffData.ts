import {
  TrackingPlanData,
  Journey,
  QARun,
  QAVerification,
  TestingProfile,
  Property,
  Event,
} from '@/src/types';
import { AuditViolation } from '@/src/lib/audit';

export interface HandoffAuditConfigSnapshot {
  eventNaming: string;
  propertyNaming: string;
  requireEventDescription: boolean;
  requirePropertyDescription: boolean;
  requireAuditPassForMerge: boolean;
}

export interface SerializedHandoffMetric {
  label: string;
  value: number;
}

export interface SerializedHandoffProperty {
  id: string;
  name: string;
  type: string;
  isList: boolean;
  description: string;
  categories: string[];
  tags: string[];
}

export interface SerializedHandoffEventProperty {
  id: string;
  name: string;
  type: string;
  isList: boolean;
  description: string;
}

export interface SerializedHandoffEvent {
  id: string;
  name: string;
  description: string;
  owner: string;
  categories: string[];
  tags: string[];
  variants: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  properties: SerializedHandoffEventProperty[];
}

export interface SerializedJourneyNodeSummary {
  id: string;
  type: string;
  label: string;
  description?: string;
  connectedEventName?: string;
  connectedEventDescription?: string;
}

export interface SerializedTestingProfile {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export interface SerializedQAVerification {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: string;
  notes?: string;
  proofUrl?: string;
  proofText?: string;
  linkedRunProfiles: SerializedTestingProfile[];
  extraTestingProfiles: SerializedTestingProfile[];
}

export interface SerializedQARun {
  id: string;
  name: string;
  createdAt: string;
  testerName?: string;
  environment?: string;
  overallNotes?: string;
  testingProfiles: SerializedTestingProfile[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
  };
  verifications: SerializedQAVerification[];
}

export interface SerializedJourney {
  id: string;
  name: string;
  totalNodes: number;
  totalEdges: number;
  stepCount: number;
  triggerCount: number;
  noteCount: number;
  annotationCount: number;
  nodes: SerializedJourneyNodeSummary[];
  triggers: SerializedJourneyNodeSummary[];
  qaRuns: SerializedQARun[];
}

export interface SerializedAuditViolationGroup {
  type: string;
  count: number;
  items: string[];
}

export interface SerializedHandoffData {
  generatedAt: string;
  metrics: SerializedHandoffMetric[];
  auditConfig: HandoffAuditConfigSnapshot;
  auditSummary: {
    totalViolations: number;
    groups: SerializedAuditViolationGroup[];
    passed: boolean;
  };
  events: SerializedHandoffEvent[];
  properties: SerializedHandoffProperty[];
  journeys: SerializedJourney[];
}

const safeArray = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);
const safeString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeTestingProfile = (
  profile: TestingProfile | undefined | null
): SerializedTestingProfile | null => {
  if (!profile) return null;

  return {
    id: safeString(profile.id),
    label: safeString(profile.label),
    url: safeString(profile.url),
    note: safeString(profile.note) || undefined,
  };
};

const groupViolations = (violations: AuditViolation[]): SerializedAuditViolationGroup[] => {
  const grouped = new Map<string, string[]>();

  for (const violation of safeArray(violations)) {
    const type = violation.type === 'event' ? 'Event' : violation.type === 'property' ? 'Property' : 'Other';
    const message = safeString(violation.message) || 'Unknown violation';

    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(message);
  }

  return Array.from(grouped.entries()).map(([type, items]) => ({
    type,
    count: items.length,
    items,
  }));
};

const buildEventPropertyMap = (data: TrackingPlanData): Map<string, Property> => {
  const map = new Map<string, Property>();

  for (const property of safeArray(data.properties)) {
    map.set(property.id, property);
  }

  return map;
};

const buildTeamMap = (data: TrackingPlanData): Map<string, string> => {
  const map = new Map<string, string>();

  for (const team of safeArray(data.teams)) {
    map.set(team.id, team.name);
  }

  return map;
};

const serializeEvent = (
  event: Event,
  propertyMap: Map<string, Property>,
  teamMap: Map<string, string>
): SerializedHandoffEvent => {
  const attachedPropertyIds = Array.from(
    new Set(
      safeArray(event.actions).flatMap((action) => [
        ...safeArray(action.eventProperties),
        ...safeArray(action.systemProperties),
      ])
    )
  );

  const properties = attachedPropertyIds
    .map((id) => propertyMap.get(id))
    .filter((property): property is Property => Boolean(property))
    .map((property) => ({
      id: property.id,
      name: property.name,
      type: property.property_value_type,
      isList: !!property.is_list,
      description: safeString(property.description),
    }));

  return {
    id: event.id,
    name: safeString(event.name),
    description: safeString(event.description),
    owner: teamMap.get(safeString(event.ownerTeamId)) || 'Unassigned',
    categories: safeArray(event.categories),
    tags: safeArray(event.tags),
    variants: safeArray(event.variants).map((variant) => ({
      id: variant.id,
      name: safeString(variant.name),
      description: safeString(variant.description) || undefined,
    })),
    properties,
  };
};

const serializeProperty = (property: Property): SerializedHandoffProperty => ({
  id: property.id,
  name: safeString(property.name),
  type: property.property_value_type,
  isList: !!property.is_list,
  description: safeString(property.description),
  categories: safeArray(property.categories),
  tags: safeArray(property.tags),
});

const getNodeSummary = (node: any): SerializedJourneyNodeSummary => ({
  id: safeString(node?.id),
  type: safeString(node?.type),
  label:
    safeString(node?.data?.label) ||
    safeString(node?.data?.connectedEvent?.name) ||
    (safeString(node?.type) === 'noteNode' ? 'Sticky Note' : 'Unnamed Node'),
  description: safeString(node?.data?.description) || safeString(node?.data?.text) || undefined,
  connectedEventName: safeString(node?.data?.connectedEvent?.name) || undefined,
  connectedEventDescription: safeString(node?.data?.connectedEvent?.description) || undefined,
});

const serializeVerification = (
  verification: QAVerification,
  nodeLookup: Map<string, any>,
  runProfiles: SerializedTestingProfile[]
): SerializedQAVerification => {
  const node = nodeLookup.get(verification.nodeId);
  const nodeSummary = getNodeSummary(node);

  const linkedRunProfiles = safeArray(verification.testingProfileIds)
    .map((profileId) => runProfiles.find((profile) => profile.id === profileId) || null)
    .filter((profile): profile is SerializedTestingProfile => Boolean(profile));

  const extraTestingProfiles = safeArray(verification.extraTestingProfiles)
    .map(normalizeTestingProfile)
    .filter((profile): profile is SerializedTestingProfile => Boolean(profile));

  return {
    nodeId: verification.nodeId,
    nodeName: nodeSummary.label,
    nodeType: nodeSummary.type,
    status: verification.status,
    notes: safeString(verification.notes) || undefined,
    proofUrl: safeString(verification.proofUrl) || undefined,
    proofText:
      safeString((verification as any).proofText) ||
      safeString(verification.payloadJson) ||
      undefined,
    linkedRunProfiles,
    extraTestingProfiles,
  };
};

const serializeQARun = (qaRun: QARun, nodeLookup: Map<string, any>): SerializedQARun => {
  const testingProfiles = safeArray((qaRun as any).testingProfiles)
    .map(normalizeTestingProfile)
    .filter((profile): profile is SerializedTestingProfile => Boolean(profile));

  const verifications = Object.values(qaRun.verifications || {}).map((verification) =>
    serializeVerification(verification, nodeLookup, testingProfiles)
  );

  const stats = {
    total: verifications.length,
    passed: verifications.filter((item) => item.status === 'Passed').length,
    failed: verifications.filter((item) => item.status === 'Failed').length,
    pending: verifications.filter((item) => item.status === 'Pending').length,
  };

  return {
    id: qaRun.id,
    name: safeString(qaRun.name),
    createdAt: safeString(qaRun.createdAt),
    testerName: safeString((qaRun as any).testerName) || undefined,
    environment: safeString((qaRun as any).environment) || undefined,
    overallNotes: safeString((qaRun as any).overallNotes) || undefined,
    testingProfiles,
    stats,
    verifications,
  };
};

const serializeJourney = (journey: Journey): SerializedJourney => {
  const nodes = safeArray(journey.nodes);
  const nodeLookup = new Map<string, any>(nodes.map((node) => [safeString(node.id), node]));

  const nodeSummaries = nodes.map(getNodeSummary);
  const triggers = nodeSummaries.filter((node) => node.type === 'triggerNode');
  const qaRuns = safeArray(journey.qaRuns).map((qaRun) => serializeQARun(qaRun, nodeLookup));

  return {
    id: journey.id,
    name: safeString(journey.name),
    totalNodes: nodes.length,
    totalEdges: safeArray(journey.edges).length,
    stepCount: nodes.filter((node) => node.type === 'journeyStepNode').length,
    triggerCount: nodes.filter((node) => node.type === 'triggerNode').length,
    noteCount: nodes.filter((node) => node.type === 'noteNode').length,
    annotationCount: nodes.filter((node) => node.type === 'annotationNode').length,
    nodes: nodeSummaries,
    triggers,
    qaRuns,
  };
};

export function serializeHandoffData(
  data: TrackingPlanData,
  auditConfig: HandoffAuditConfigSnapshot,
  violations: AuditViolation[] = []
): SerializedHandoffData {
  const propertyMap = buildEventPropertyMap(data);
  const teamMap = buildTeamMap(data);
  const auditGroups = groupViolations(violations);

  const events = safeArray(data.events).map((event) => serializeEvent(event, propertyMap, teamMap));
  const properties = safeArray(data.properties).map(serializeProperty);
  const journeys = safeArray(data.journeys).map(serializeJourney);

  const totalQARuns = journeys.reduce((acc, journey) => acc + journey.qaRuns.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Events', value: events.length },
      { label: 'Properties', value: properties.length },
      { label: 'Journeys', value: journeys.length },
      { label: 'QA Runs', value: totalQARuns },
    ],
    auditConfig: {
      eventNaming: auditConfig.eventNaming,
      propertyNaming: auditConfig.propertyNaming,
      requireEventDescription: auditConfig.requireEventDescription,
      requirePropertyDescription: auditConfig.requirePropertyDescription,
      requireAuditPassForMerge: auditConfig.requireAuditPassForMerge,
    },
    auditSummary: {
      totalViolations: violations.length,
      groups: auditGroups,
      passed: violations.length === 0,
    },
    events,
    properties,
    journeys,
  };
}
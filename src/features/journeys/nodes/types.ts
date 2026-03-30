import { Node, Edge } from '@xyflow/react';
import type { QAProof, QAVerification } from '@/src/types';

export type ConnectedEventData = {
  eventId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  description?: string;
};

export type BaseJourneyNodeData = {
  activeQARunId?: string | null;
  qaVerification?: QAVerification;
  pendingProofs?: QAProof[];
  /** Used for Storage uploads (step screenshots). */
  journeyId?: string;
  /** Used for backend upload / event list; `null` on public shared canvas (no workspace API). */
  workspaceId?: string | null;
};

/** AI Agent step action type. */
export type JourneyStepActionType = 'click' | 'type' | 'hover' | 'verify';

export const JOURNEY_STEP_ACTION_TYPES: JourneyStepActionType[] = [
  'click',
  'type',
  'hover',
  'verify',
];

/** Implementation scope / type for the step. */
export type ImplementationType = 'new' | 'enrichment' | 'fix';

export const IMPLEMENTATION_TYPES: ImplementationType[] = [
  'new',
  'enrichment',
  'fix',
];

export type JourneyStepNodeData = BaseJourneyNodeData & {
  label: string;
  description: string;
  imageUrl?: string;
  /** URL for this step (e.g. screen or flow) to open during QA testing. */
  url?: string;
  /** Implementation scope: new implementation, enrichment, or fix. */
  implementationType?: ImplementationType;
  /** AI Agent: action to perform at this step. */
  actionType?: JourneyStepActionType;
  /** AI Agent: HTML snippet or CSS selector for the target element. */
  targetElement?: string;
  /** AI Agent: optional JSON string for test data (e.g. input values, expected text). */
  testDataJson?: string;
};

export type TriggerNodeData = BaseJourneyNodeData & {
  description: string;
  connectedEvent: ConnectedEventData | null;
};

export type NoteNodeData = BaseJourneyNodeData & {
  text: string;
};

export type AnnotationNodeData = BaseJourneyNodeData & {
  color: string;
};

export type JourneyStepFlowNode = Node<JourneyStepNodeData, 'journeyStepNode'>;
export type TriggerFlowNode = Node<TriggerNodeData, 'triggerNode'>;
export type NoteFlowNode = Node<NoteNodeData, 'noteNode'>;
export type AnnotationFlowNode = Node<AnnotationNodeData, 'annotationNode'>;

export type JourneyFlowNode =
  | JourneyStepFlowNode
  | TriggerFlowNode
  | NoteFlowNode
  | AnnotationFlowNode;

export type JourneyFlowEdge = Edge;

export type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target' | null;
};

export type Point = {
  x: number;
  y: number;
};

export const isJourneyStepNode = (
  node: JourneyFlowNode | undefined,
): node is JourneyStepFlowNode => !!node && node.type === 'journeyStepNode';

export const isTriggerNode = (
  node: JourneyFlowNode | undefined,
): node is TriggerFlowNode => !!node && node.type === 'triggerNode';

export const isNoteNode = (
  node: JourneyFlowNode | undefined,
): node is NoteFlowNode => !!node && node.type === 'noteNode';

export const isAnnotationNode = (
  node: JourneyFlowNode | undefined,
): node is AnnotationFlowNode => !!node && node.type === 'annotationNode';


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
};

export type JourneyStepNodeData = BaseJourneyNodeData & {
  label: string;
  description: string;
  imageUrl?: string;
  /** URL for this step (e.g. screen or flow) to open during QA testing. */
  url?: string;
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


/**
 * One icon map (lucide) for the app's sections (D-64, T-4-20): used by the sidebar and by the
 * shared documentation view's section headers and navigation, so the two never drift. Keys of
 * `NAV_ICONS` are the sidebar tab ids; `SHARED_SECTION_ICONS` maps the shared page's section DOM
 * ids (`SECTION_IDS` in `src/features/shared/viewHelpers.ts`) to the same icons.
 */
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  Database,
  Fingerprint,
  GitBranch,
  Grid3x3,
  HelpCircle,
  History,
  LayoutDashboard,
  LayoutList,
  ListChecks,
  MessageSquare,
  Rocket,
  Settings,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';

export const NAV_ICONS = {
  events: Activity,
  properties: Database,
  catalogs: LayoutList,
  identityRules: Fingerprint,
  consentCategories: ShieldCheck,
  standardEvents: GitBranch,
  useCases: ListChecks,
  useCaseTemplates: BookOpen,
  requirementsMatrix: Grid3x3,
  sources: LayoutDashboard,
  import: UploadCloud,
  qaRuns: ClipboardCheck,
  findings: AlertTriangle,
  history: History,
  comments: MessageSquare,
  gettingStarted: Rocket,
  clients: Database,
  settings: Settings,
  help: HelpCircle,
} as const satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof NAV_ICONS;

/** Shared page section id -> icon (Events, Properties, Use cases, Identity, Consents, Catalogs, Mapping, Findings). */
export const SHARED_SECTION_ICONS: Record<string, LucideIcon> = {
  events: NAV_ICONS.events,
  properties: NAV_ICONS.properties,
  'use-cases': NAV_ICONS.useCases,
  identity: NAV_ICONS.identityRules,
  consents: NAV_ICONS.consentCategories,
  catalogs: NAV_ICONS.catalogs,
  mapping: NAV_ICONS.standardEvents,
  findings: NAV_ICONS.findings,
};

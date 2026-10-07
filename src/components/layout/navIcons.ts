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
  Box,
  CheckCircle2,
  Circle,
  CircleAlert,
  Globe,
  CircleDashed,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Code2,
  Eye,
  EyeOff,
  Info,
  Layers,
  ListOrdered,
  Minus,
  OctagonAlert,
  Package,
  Pencil,
  Server,
  Split,
  User,
  XCircle,
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

/** T-4-24: icons of the badge vocabulary (`src/components/ui/badges.tsx`) and the requirement target kinds. */
export const CLASS_ICONS: Record<string, LucideIcon> = { custom: Pencil, sdk: Code2, platform: Server };
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  system_customer: User,
  customer: User,
  sdk_default: Code2,
  event: NAV_ICONS.events,
};
export const PROPERTY_KIND_ICONS: Record<string, LucideIcon> = {
  event: NAV_ICONS.events,
  item: Package,
  state_list: ListOrdered,
  context: Layers,
};
export const PRIORITY_ICONS: Record<string, LucideIcon> = {
  critical: ChevronsUp,
  high: ChevronUp,
  medium: Minus,
  low: ChevronDown,
};
export const STATUS_ICONS: Record<string, LucideIcon> = {
  planned: CircleDashed,
  in_review: Eye,
  implemented: CheckCircle2,
  ignored: EyeOff,
  proposed: CircleDashed,
  approved: CheckCircle2,
  in_progress: Activity,
  live: CheckCircle2,
  dropped: XCircle,
  open: AlertTriangle,
  resolved: CheckCircle2,
  gap: AlertTriangle,
};
export const SEVERITY_ICONS: Record<string, LucideIcon> = { error: OctagonAlert, warning: AlertTriangle, info: Info };
/** Requirement target kind -> icon (requirements matrix, use case requirement rows). */
export const BUNDLE_ICON: LucideIcon = Box;

/** T-4-31: one entity-kind -> icon map. Variant is `Split` everywhere (internal and shared view). */
export const ENTITY_ICONS = {
  event: NAV_ICONS.events,
  variant: Split,
  property: NAV_ICONS.properties,
  catalog: NAV_ICONS.catalogs,
  consent: NAV_ICONS.consentCategories,
  source: NAV_ICONS.sources,
  use_case: NAV_ICONS.useCases,
  bundle: BUNDLE_ICON,
  customer_property: User,
  event_property: NAV_ICONS.properties,
  variant_property: NAV_ICONS.properties,
  catalog_attribute: NAV_ICONS.catalogs,
} as const satisfies Record<string, LucideIcon>;
export type EntityKind = keyof typeof ENTITY_ICONS;

/** T-4-31: icons for the enums rendered by `EnumSelect` that had none in the badge vocabulary. */
export const IMPLEMENTATION_ICONS: Record<string, LucideIcon> = { client_web: Globe, server_api: Server, sdk_auto: Code2 };
export const LEVEL_ICONS: Record<string, LucideIcon> = { R: CircleAlert, O: Circle };
export const CATALOG_KIND_ICONS: Record<string, LucideIcon> = { product: Package, variant: Split, other: Box };

/** Requirement target kind -> icon (requirements matrix, use case rows): a view of `ENTITY_ICONS`. */
export const TARGET_KIND_ICONS: Record<string, LucideIcon> = {
  customer_property: ENTITY_ICONS.customer_property,
  event: ENTITY_ICONS.event,
  variant: ENTITY_ICONS.variant,
  event_property: ENTITY_ICONS.event_property,
  variant_property: ENTITY_ICONS.variant_property,
  catalog_attribute: ENTITY_ICONS.catalog_attribute,
  consent: ENTITY_ICONS.consent,
};

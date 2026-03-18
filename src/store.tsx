import { create } from 'zustand';
import {
  TrackingPlanData,
  Event,
  Property,
  Source,
  Journey,
  Branch,
  PropertyBundle,
  Settings,
} from './types';
import { v4 as uuidv4 } from 'uuid';

export interface AuditConfig {
  eventNaming: string;
  propertyNaming: string;
  requireEventDescription: boolean;
  requirePropertyDescription: boolean;
  requireAuditPassForMerge: boolean;
}

const initialData: TrackingPlanData = {
  settings: {
    customEventFields: [],
    customPropertyFields: [],
  },
  properties: [],
  propertyBundles: [],
  sources: [],
  destinations: [],
  teams: [],
  events: [],
  journeys: [],
};

interface StoreState {
  mainData: TrackingPlanData;
  branches: Branch[];
  activeBranchId: string | 'main';
  selectedItemIdToEdit: string | null;
  auditConfig: AuditConfig;

  setActiveBranch: (id: string | 'main') => void;
  createBranch: (name: string) => void;
  mergeBranch: (id: string) => void;
  approveBranch: (branchId: string, teamId: string) => void;
  setSelectedItemIdToEdit: (id: string | null) => void;
  updateAuditConfig: (config: Partial<AuditConfig>) => void;

  updateSettings: (settings: Partial<Settings>) => void;

  addEvent: (event: Omit<Event, 'id'>) => void;
  updateEvent: (id: string, event: Partial<Event>) => void;
  deleteEvent: (id: string) => void;

  addProperty: (property: Omit<Property, 'id'>) => void;
  updateProperty: (id: string, property: Partial<Property>) => void;
  deleteProperty: (id: string) => void;

  addPropertyBundle: (bundle: Omit<PropertyBundle, 'id'>) => void;
  updatePropertyBundle: (id: string, bundle: Partial<PropertyBundle>) => void;
  deletePropertyBundle: (id: string) => void;

  addSource: (source: Omit<Source, 'id'>) => void;
  updateSource: (id: string, source: Partial<Source>) => void;
  deleteSource: (id: string) => void;

  addJourney: (journey: Omit<Journey, 'id'>) => string;
  updateJourney: (id: string, journey: Partial<Journey>) => void;
  deleteJourney: (id: string) => void;
  setJourneys: (journeys: Journey[]) => void;

  addCustomCategory: (name: string) => void;

  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
}

export const useStore = create<StoreState>((set, get) => {
  const updateActiveData = (updater: (data: TrackingPlanData) => TrackingPlanData) => {
    set((state) => {
      if (state.activeBranchId === 'main') {
        return { mainData: updater(state.mainData) };
      }

      return {
        branches: state.branches.map((branch) =>
          branch.id === state.activeBranchId
            ? { ...branch, draftData: updater(branch.draftData) }
            : branch
        ),
      };
    });
  };

  const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

  return {
    mainData: initialData,
    branches: [],
    activeBranchId: 'main',
    selectedItemIdToEdit: null,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,

    auditConfig: {
      eventNaming: 'Title Case',
      propertyNaming: 'snake_case',
      requireEventDescription: true,
      requirePropertyDescription: true,
      requireAuditPassForMerge: false,
    },

    setSelectedItemIdToEdit: (id) => set({ selectedItemIdToEdit: id }),

    setActiveBranch: (id) => set({ activeBranchId: id }),

    updateAuditConfig: (config) =>
      set((state) => ({
        auditConfig: {
          ...state.auditConfig,
          ...config,
        },
      })),

    createBranch: (name) =>
      set((state) => {
        const snapshot = JSON.parse(JSON.stringify(state.mainData)) as TrackingPlanData;

        const newBranch: Branch = {
          id: uuidv4(),
          name,
          baseData: snapshot,
          draftData: JSON.parse(JSON.stringify(snapshot)) as TrackingPlanData,
          approvals: [],
        };

        return {
          branches: [...state.branches, newBranch],
          activeBranchId: newBranch.id,
        };
      }),

    mergeBranch: (id) =>
      set((state) => {
        const branch = state.branches.find((item) => item.id === id);
        if (!branch) return state;

        return {
          mainData: branch.draftData,
          branches: state.branches.filter((item) => item.id !== id),
          activeBranchId: 'main',
        };
      }),

    approveBranch: (branchId, teamId) =>
      set((state) => ({
        branches: state.branches.map((branch) =>
          branch.id === branchId && !branch.approvals.includes(teamId)
            ? { ...branch, approvals: [...branch.approvals, teamId] }
            : branch
        ),
      })),

    updateSettings: (settingsUpdate) =>
      updateActiveData((data) => ({
        ...data,
        settings: {
          ...data.settings,
          ...settingsUpdate,
        },
      })),

    addEvent: (event) =>
      updateActiveData((data) => ({
        ...data,
        events: [...data.events, { ...event, id: uuidv4() }],
      })),

    updateEvent: (id, eventUpdate) =>
      updateActiveData((data) => ({
        ...data,
        events: data.events.map((event) =>
          event.id === id ? { ...event, ...eventUpdate } : event
        ),
      })),

    deleteEvent: (id) =>
      updateActiveData((data) => ({
        ...data,
        events: data.events.filter((event) => event.id !== id),
      })),

    addProperty: (property) =>
      updateActiveData((data) => ({
        ...data,
        properties: [...data.properties, { ...property, id: uuidv4() }],
      })),

    updateProperty: (id, propertyUpdate) =>
      updateActiveData((data) => ({
        ...data,
        properties: data.properties.map((property) =>
          property.id === id ? { ...property, ...propertyUpdate } : property
        ),
      })),

    deleteProperty: (id) =>
      updateActiveData((data) => ({
        ...data,
        properties: data.properties.filter((property) => property.id !== id),
        events: data.events.map((event) => ({
          ...event,
          actions: event.actions.map((action) => ({
            ...action,
            eventProperties: action.eventProperties.filter((propertyId) => propertyId !== id),
            systemProperties: action.systemProperties.filter((propertyId) => propertyId !== id),
          })),
        })),
      })),

    addPropertyBundle: (bundle) =>
      updateActiveData((data) => ({
        ...data,
        propertyBundles: [...data.propertyBundles, { ...bundle, id: uuidv4() }],
      })),

    updatePropertyBundle: (id, bundleUpdate) =>
      updateActiveData((data) => ({
        ...data,
        propertyBundles: data.propertyBundles.map((bundle) =>
          bundle.id === id ? { ...bundle, ...bundleUpdate } : bundle
        ),
      })),

    deletePropertyBundle: (id) =>
      updateActiveData((data) => ({
        ...data,
        propertyBundles: data.propertyBundles.filter((bundle) => bundle.id !== id),
      })),

    addSource: (source) =>
      updateActiveData((data) => ({
        ...data,
        sources: [...data.sources, { ...source, id: uuidv4() }],
      })),

    updateSource: (id, sourceUpdate) =>
      updateActiveData((data) => ({
        ...data,
        sources: data.sources.map((source) =>
          source.id === id ? { ...source, ...sourceUpdate } : source
        ),
      })),

    deleteSource: (id) =>
      updateActiveData((data) => ({
        ...data,
        sources: data.sources.filter((source) => source.id !== id),
        events: data.events.map((event) => ({
          ...event,
          sources: event.sources.filter((source) => source.id !== id),
        })),
      })),

    addJourney: (journey) => {
      const id = uuidv4();

      updateActiveData((data) => ({
        ...data,
        journeys: [...data.journeys, { ...journey, id }],
      }));

      return id;
    },

    updateJourney: (id, journeyUpdate) =>
      updateActiveData((data) => ({
        ...data,
        journeys: data.journeys.map((journey) =>
          journey.id === id ? { ...journey, ...journeyUpdate } : journey
        ),
      })),

    deleteJourney: (id) =>
      updateActiveData((data) => ({
        ...data,
        journeys: data.journeys.filter((journey) => journey.id !== id),
      })),

    setJourneys: (journeys) =>
      updateActiveData((data) => ({
        ...data,
        journeys: Array.isArray(journeys) ? journeys : data.journeys,
      })),

    addCustomCategory: (name) =>
      updateActiveData((data) => {
        const trimmed = name.trim();
        if (!trimmed) return data;
        const list = data.customCategories ?? [];
        if (list.includes(trimmed)) return data;
        return { ...data, customCategories: [...list, trimmed] };
      }),

    setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  };
});

export const useActiveData = () => {
  const { mainData, branches, activeBranchId } = useStore();

  if (activeBranchId === 'main') {
    return mainData;
  }

  const branch = branches.find((item) => item.id === activeBranchId);
  return branch ? branch.draftData : mainData;
};
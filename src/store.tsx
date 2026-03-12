import { create } from 'zustand';
import { TrackingPlanData, Event, Property, Source, Journey, Branch, Team, Destination, PropertyBundle, Settings } from './types';
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
  properties: [
    { id: 'p1', name: 'user_id', property_value_type: 'string', is_list: false, categories: ['User Profile'], tags: ['Core'], description: 'Unique identifier for the user', attached_events: [{ eventId: 'e1', presence: 'Always sent' }], value_constraints: '' },
    { id: 'p2', name: 'plan_type', property_value_type: 'string', is_list: false, categories: ['User Profile'], tags: [], description: 'Subscription plan type', attached_events: [{ eventId: 'e1', presence: 'Always sent' }], value_constraints: ['Free', 'Pro', 'Enterprise'] },
    { id: 'p3', name: 'is_trial', property_value_type: 'boolean', is_list: false, categories: ['User Profile'], tags: [], description: 'Whether the user is on a trial', attached_events: [{ eventId: 'e1', presence: 'Always sent' }], value_constraints: '' },
    { id: 'p4', name: 'payment_method', property_value_type: 'string', is_list: false, categories: ['E-commerce'], tags: [], description: 'Method of payment', attached_events: [], value_constraints: '' },
  ],
  propertyBundles: [
    { id: 'b1', name: 'User Identity', description: 'Core user identity properties', propertyIds: ['p1', 'p2', 'p3'] }
  ],
  sources: [
    { id: 's1', name: 'iOS', color: 'bg-blue-100 text-blue-800' },
    { id: 's2', name: 'Android', color: 'bg-green-100 text-green-800' },
    { id: 's3', name: 'Web', color: 'bg-purple-100 text-purple-800' },
  ],
  destinations: [
    { id: 'd1', name: 'Amplitude' },
    { id: 'd2', name: 'Mixpanel' },
    { id: 'd3', name: 'Segment' },
  ],
  teams: [
    { id: 't1', name: 'Marketing' },
    { id: 't2', name: 'Data' },
    { id: 't3', name: 'Core Product' },
  ],
  events: [
    {
      id: 'e1',
      name: 'user_signed_up',
      description: 'Fired when a user completes the registration process.',
      categories: ['User Lifecycle'],
      tags: ['Core'],
      sources: [
        { id: 's1', name: 'iOS' },
        { id: 's2', name: 'Android' },
        { id: 's3', name: 'Web' }
      ],
      actions: [
        {
          id: 'a1',
          type: 'Log Event',
          eventProperties: ['p1', 'p2'],
          systemProperties: []
        }
      ],
      variants: [],
      ownerTeamId: 't3',
      stakeholderTeamIds: ['t1', 't2'],
    },
    {
      id: 'e2',
      name: 'subscription_upgraded',
      description: 'Fired when a user upgrades their plan.',
      categories: ['Revenue'],
      tags: [],
      sources: [
        { id: 's3', name: 'Web' }
      ],
      actions: [
        {
          id: 'a2',
          type: 'Log Event',
          eventProperties: ['p1', 'p2', 'p3'],
          systemProperties: []
        }
      ],
      variants: [],
      ownerTeamId: 't3',
      stakeholderTeamIds: ['t2'],
    },
  ],
  journeys: [
    {
      id: 'j1',
      name: 'Customer Journey Flow',
      nodes: [],
      edges: []
    }
  ]
};

interface StoreState {
  mainData: TrackingPlanData;
  branches: Branch[];
  activeBranchId: string | 'main';
  selectedItemIdToEdit: string | null;
  auditConfig: AuditConfig;
  
  // Actions
  setActiveBranch: (id: string | 'main') => void;
  createBranch: (name: string) => void;
  mergeBranch: (id: string) => void;
  approveBranch: (branchId: string, teamId: string) => void;
  setSelectedItemIdToEdit: (id: string | null) => void;
  updateAuditConfig: (config: Partial<AuditConfig>) => void;
  
  // Data actions (apply to active branch or main)
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
}

export const useStore = create<StoreState>((set, get) => {
  const updateActiveData = (updater: (data: TrackingPlanData) => TrackingPlanData) => {
    set((state) => {
      if (state.activeBranchId === 'main') {
        return { mainData: updater(state.mainData) };
      } else {
        return {
          branches: state.branches.map(b => 
            b.id === state.activeBranchId 
              ? { ...b, draftData: updater(b.draftData) } 
              : b
          )
        };
      }
    });
  };

  return {
    mainData: initialData,
    branches: [],
    activeBranchId: 'main',
    selectedItemIdToEdit: null,
    auditConfig: {
      eventNaming: 'Title Case',
      propertyNaming: 'snake_case',
      requireEventDescription: true,
      requirePropertyDescription: true,
      requireAuditPassForMerge: false,
    },

    setSelectedItemIdToEdit: (id) => set({ selectedItemIdToEdit: id }),
    setActiveBranch: (id) => set({ activeBranchId: id }),
    updateAuditConfig: (config) => set((state) => ({
      auditConfig: { ...state.auditConfig, ...config }
    })),
    createBranch: (name) => set((state) => {
      const newBranch: Branch = {
        id: uuidv4(),
        name,
        baseData: JSON.parse(JSON.stringify(state.mainData)),
        draftData: JSON.parse(JSON.stringify(state.mainData)),
        approvals: []
      };
      return {
        branches: [...state.branches, newBranch],
        activeBranchId: newBranch.id
      };
    }),
    mergeBranch: (id) => set((state) => {
      const branch = state.branches.find(b => b.id === id);
      if (!branch) return state;
      return {
        mainData: branch.draftData,
        branches: state.branches.filter(b => b.id !== id),
        activeBranchId: 'main'
      };
    }),
    approveBranch: (branchId, teamId) => set((state) => ({
      branches: state.branches.map(b => 
        b.id === branchId && !b.approvals.includes(teamId)
          ? { ...b, approvals: [...b.approvals, teamId] }
          : b
      )
    })),

    updateSettings: (settingsUpdate) => updateActiveData(data => ({
      ...data, settings: { ...data.settings, ...settingsUpdate }
    })),

    addEvent: (event) => updateActiveData(data => ({
      ...data, events: [...data.events, { ...event, id: uuidv4() }]
    })),
    updateEvent: (id, eventUpdate) => updateActiveData(data => ({
      ...data, events: data.events.map(e => e.id === id ? { ...e, ...eventUpdate } : e)
    })),
    deleteEvent: (id) => updateActiveData(data => ({
      ...data, events: data.events.filter(e => e.id !== id)
    })),

    addProperty: (property) => updateActiveData(data => ({
      ...data, properties: [...data.properties, { ...property, id: uuidv4() }]
    })),
    updateProperty: (id, propertyUpdate) => updateActiveData(data => ({
      ...data, properties: data.properties.map(p => p.id === id ? { ...p, ...propertyUpdate } : p)
    })),
    deleteProperty: (id) => updateActiveData(data => ({
      ...data, 
      properties: data.properties.filter(p => p.id !== id),
      events: data.events.map(e => ({
        ...e,
        actions: e.actions.map(a => ({
          ...a,
          eventProperties: a.eventProperties.filter(pid => pid !== id),
          systemProperties: a.systemProperties.filter(pid => pid !== id)
        }))
      }))
    })),

    addPropertyBundle: (bundle) => updateActiveData(data => ({
      ...data, propertyBundles: [...data.propertyBundles, { ...bundle, id: uuidv4() }]
    })),
    updatePropertyBundle: (id, bundleUpdate) => updateActiveData(data => ({
      ...data, propertyBundles: data.propertyBundles.map(b => b.id === id ? { ...b, ...bundleUpdate } : b)
    })),
    deletePropertyBundle: (id) => updateActiveData(data => ({
      ...data, propertyBundles: data.propertyBundles.filter(b => b.id !== id)
    })),

    addSource: (source) => updateActiveData(data => ({
      ...data, sources: [...data.sources, { ...source, id: uuidv4() }]
    })),
    updateSource: (id, sourceUpdate) => updateActiveData(data => ({
      ...data, sources: data.sources.map(s => s.id === id ? { ...s, ...sourceUpdate } : s)
    })),
    deleteSource: (id) => updateActiveData(data => ({
      ...data, 
      sources: data.sources.filter(s => s.id !== id),
      events: data.events.map(e => ({
        ...e,
        sources: e.sources.filter(s => s.id !== id)
      }))
    })),

    addJourney: (journey) => {
      const id = uuidv4();
      updateActiveData(data => ({
        ...data, journeys: [...data.journeys, { ...journey, id }]
      }));
      return id;
    },
    updateJourney: (id, journeyUpdate) => updateActiveData(data => ({
      ...data, journeys: data.journeys.map(j => j.id === id ? { ...j, ...journeyUpdate } : j)
    })),
    deleteJourney: (id) => updateActiveData(data => ({
      ...data, journeys: data.journeys.filter(j => j.id !== id)
    })),
  };
});

export const useActiveData = () => {
  const { mainData, branches, activeBranchId } = useStore();
  if (activeBranchId === 'main') return mainData;
  const branch = branches.find(b => b.id === activeBranchId);
  return branch ? branch.draftData : mainData;
};
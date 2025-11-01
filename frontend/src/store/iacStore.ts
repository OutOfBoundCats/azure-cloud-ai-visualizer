import { create } from 'zustand';
import { parseBicepResources } from '@/services/bicepParser';

export interface BicepResourceSnippet {
  name: string;
  type: string;
  apiVersion?: string;
  fullText: string;
  body: string;
  properties: string[];
  iconTitle?: string;
  serviceName?: string;
}

type BicepResourceMap = Record<string, BicepResourceSnippet[]>;

interface IaCState {
  bicepResourcesByService: BicepResourceMap;
  currentBicepTemplate: string | null;
  pendingBicepTemplateUpdate: string | null;
  setBicepTemplate: (template: string) => void;
  updateBicepResource: (resourceName: string, previousSnippet: string, updatedSnippet: string) => string | null;
  applyBicepTemplateEdit: (template: string) => void;
  consumePendingBicepTemplate: () => string | null;
  clear: () => void;
}

const normalizeKey = (value: string | undefined | null) => (value ?? '').trim().toLowerCase();

const buildResourceMap = (resources: BicepResourceSnippet[]): BicepResourceMap => {
  const map: BicepResourceMap = {};
  for (const resource of resources) {
    const keys = [normalizeKey(resource.iconTitle), normalizeKey(resource.serviceName)].filter(Boolean);
    if (keys.length === 0) {
      keys.push(normalizeKey(resource.type));
    }

    keys.forEach((key) => {
      if (!key) return;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(resource);
    });
  }
  return map;
};

export const useIacStore = create<IaCState>((set, get) => ({
  bicepResourcesByService: {},
  currentBicepTemplate: null,
  pendingBicepTemplateUpdate: null,

  setBicepTemplate: (template) => {
    if (!template?.trim()) {
      set({
        currentBicepTemplate: null,
        bicepResourcesByService: {},
        pendingBicepTemplateUpdate: null,
      });
      return;
    }

    const resources = parseBicepResources(template);
    set({
      currentBicepTemplate: template,
      bicepResourcesByService: buildResourceMap(resources),
      pendingBicepTemplateUpdate: null,
    });
  },

  updateBicepResource: (resourceName, previousSnippet, updatedSnippet) => {
    let newTemplate: string | null = null;

    set((state) => {
      if (!state.currentBicepTemplate) {
        return state;
      }

      let targetSnippet = previousSnippet?.trim()
        ? previousSnippet
        : null;

      if (!targetSnippet || !state.currentBicepTemplate.includes(targetSnippet)) {
        const resources = Object.values(state.bicepResourcesByService).flat();
        const match = resources.find((resource) => resource.name === resourceName);
        if (!match) {
          return state;
        }
        targetSnippet = match.fullText;
      }

      if (!targetSnippet || !state.currentBicepTemplate.includes(targetSnippet)) {
        return state;
      }

      newTemplate = state.currentBicepTemplate.replace(targetSnippet, updatedSnippet);
      const parsedResources = parseBicepResources(newTemplate);

      return {
        currentBicepTemplate: newTemplate,
        bicepResourcesByService: buildResourceMap(parsedResources),
        pendingBicepTemplateUpdate: newTemplate,
      };
    });

    return newTemplate;
  },

  applyBicepTemplateEdit: (template) => {
    set(() => {
      if (!template?.trim()) {
        return {
          currentBicepTemplate: null,
          bicepResourcesByService: {},
          pendingBicepTemplateUpdate: template,
        };
      }

      const parsedResources = parseBicepResources(template);

      return {
        currentBicepTemplate: template,
        bicepResourcesByService: buildResourceMap(parsedResources),
        pendingBicepTemplateUpdate: template,
      };
    });
  },

  consumePendingBicepTemplate: () => {
    const pending = get().pendingBicepTemplateUpdate;
    if (!pending) {
      return null;
    }

    set({ pendingBicepTemplateUpdate: null });
    return pending;
  },

  clear: () =>
    set({
      bicepResourcesByService: {},
      currentBicepTemplate: null,
      pendingBicepTemplateUpdate: null,
    }),
}));

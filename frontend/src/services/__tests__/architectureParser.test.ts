import { describe, expect, it } from 'vitest';
import { ArchitectureParser, type ParsedArchitecture } from '../architectureParser';
import type { AzureService } from '@/data/azureServices';

const baseService = (overrides: Partial<AzureService> = {}): AzureService => ({
  id: 'svc-1',
  type: 'azure.service',
  category: 'test',
  categoryId: 'test',
  title: 'Test Service',
  iconPath: 'test.svg',
  description: 'A test service',
  ...overrides,
});

describe('ArchitectureParser.generateNodes', () => {
  it('handles cyclic group references without infinite recursion', () => {
    const architecture: ParsedArchitecture = {
      services: [
        baseService({ id: 'svc-1', title: 'Service One' }),
        baseService({ id: 'svc-2', title: 'Service Two' }),
      ],
      connections: [],
      layout: 'horizontal',
      groups: [
        {
          id: 'group-a',
          label: 'Group A',
          type: 'resourceGroup',
          members: ['group-b', 'svc-1'],
          parentId: 'group-b',
        },
        {
          id: 'group-b',
          label: 'Group B',
          type: 'resourceGroup',
          members: ['group-a', 'svc-2'],
          parentId: 'group-a',
        },
      ],
    };

    const nodes = ArchitectureParser.generateNodes(architecture);
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((node) => node.id === 'svc-1')).toBe(true);
    expect(nodes.some((node) => node.id === 'svc-2')).toBe(true);
  });
});

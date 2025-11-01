import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchitectureParser } from './architectureParser';

const resetConsoleSpies = () => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
};

resetConsoleSpies();

afterEach(() => {
  resetConsoleSpies();
});

describe('ArchitectureParser.parseStructuredDiagram', () => {
  it('creates container groups when only services are provided', () => {
    const structured = {
      services: [
        {
          id: 'general/10011-icon-service-Management-Groups',
          title: 'Management Groups',
        },
        {
          id: 'compute/10021-icon-service-Virtual-Machine',
          title: 'Virtual Machine',
          groupIds: ['general/10011-icon-service-Management-Groups'],
        },
      ],
      groups: [],
      connections: [
        {
          from: 'compute/10021-icon-service-Virtual-Machine',
          to: 'general/10011-icon-service-Management-Groups',
          label: 'scope',
        },
      ],
    };

    const result = ArchitectureParser.parseStructuredDiagram(structured);
    expect(result).not.toBeNull();
    expect(result?.services.map((svc) => svc.id)).toEqual(['compute/10021-icon-service-Virtual-Machine']);
    const managementGroup = result?.groups?.find(
      (group) => group.id === 'general/10011-icon-service-Management-Groups'
    );
    expect(managementGroup).toBeDefined();
    expect(managementGroup?.members).toContain('compute/10021-icon-service-Virtual-Machine');
    expect(result?.connections).toEqual([
      {
        from: 'compute/10021-icon-service-Virtual-Machine',
        to: 'general/10011-icon-service-Management-Groups',
        label: 'scope',
      },
    ]);
  });

  it('deduplicates services, keeps memberships, and filters invalid connections', () => {
    const structured = {
      services: [
        {
          id: 'networking/10061-icon-service-Virtual-Networks',
          title: 'Virtual Networks',
          groupIds: ['general/10002-icon-service-Subscriptions'],
        },
        {
          id: 'networking/10061-icon-service-Virtual-Networks',
          title: 'Virtual Networks',
          groupIds: ['networking/02742-icon-service-Subnet'],
        },
        {
          id: 'networking/02742-icon-service-Subnet',
          title: 'Subnet',
          groupIds: ['networking/10061-icon-service-Virtual-Networks'],
        },
      ],
      groups: [
        {
          id: 'general/10002-icon-service-Subscriptions',
          label: 'Subscriptions',
          members: ['networking/10061-icon-service-Virtual-Networks', 'networking/10061-icon-service-Virtual-Networks'],
        },
      ],
      connections: [
        {
          from: 'networking/10061-icon-service-Virtual-Networks',
          to: 'networking/10061-icon-service-Virtual-Networks',
        },
        {
          from: 'networking/02742-icon-service-Subnet',
          to: 'networking/10061-icon-service-Virtual-Networks',
          label: 'contained in',
        },
      ],
    };

    const result = ArchitectureParser.parseStructuredDiagram(structured);
    expect(result).not.toBeNull();
    expect(result?.services ?? []).toEqual([]);

    const subscriptionGroup = result?.groups?.find(
      (group) => group.id === 'general/10002-icon-service-Subscriptions'
    );
    expect(subscriptionGroup).toBeDefined();
    expect(subscriptionGroup?.members).toEqual([
      'networking/10061-icon-service-Virtual-Networks',
    ]);

    const vnetGroup = result?.groups?.find(
      (group) => group.id === 'networking/10061-icon-service-Virtual-Networks'
    );
    expect(vnetGroup).toBeDefined();
    expect(vnetGroup?.members).toEqual(
      expect.arrayContaining(['networking/02742-icon-service-Subnet'])
    );

    expect(result?.connections).toEqual([
      {
        from: 'networking/02742-icon-service-Subnet',
        to: 'networking/10061-icon-service-Virtual-Networks',
        label: 'contained in',
      },
    ]);
  });
});
















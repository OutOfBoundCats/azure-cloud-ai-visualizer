
import { AzureService } from '@/data/azureServices';
import { ParsedGroupType } from './types';


export interface ParsedArchitecture {
  services: AzureService[];
  connections: { from: string; to: string; label?: string }[];
  layout: 'horizontal' | 'vertical' | 'grid';
  groups?: ParsedGroup[];
  bicepResources?: { resourceType: string; resourceName: string }[];
}

export interface ParsedGroup {
  id: string;
  label: string;
  type: ParsedGroupType;
  members: string[];
  parentId?: string;
  metadata?: Record<string, unknown>;
  sourceServiceId?: string;
}
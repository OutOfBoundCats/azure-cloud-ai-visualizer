/**
 * Comprehensive mapping between Bicep resource types and Azure service icons
 * This service handles the mapping between ARM/Bicep resource types and the actual
 * Azure service icons available in our application for both parsing and generation.
 */

import { AzureService, azureServices } from '@/data/azureServices';

export interface BicepResourceMapping {
  resourceType: string;
  serviceName: string;
  iconTitle: string;
  category: string;
  bicepProperties?: {
    apiVersion: string;
    commonProperties?: string[];
    requiredProperties?: string[];
  };
}

/**
 * Comprehensive mapping of Bicep resource types to Azure services
 * Updated with all major Azure services and their corresponding icons
 */
export const BICEP_RESOURCE_MAPPINGS: BicepResourceMapping[] = [
  // Compute Services
  {
    resourceType: 'Microsoft.Web/sites',
    serviceName: 'App Service',
    iconTitle: 'App Services',
    category: 'app services',
    bicepProperties: {
      apiVersion: '2023-01-01',
      commonProperties: ['location', 'serverFarmId', 'httpsOnly', 'siteConfig'],
      requiredProperties: ['location', 'serverFarmId']
    }
  },
  {
    resourceType: 'Microsoft.Web/serverfarms',
    serviceName: 'App Service Plan',
    iconTitle: 'App Service Plans',
    category: 'app services',
    bicepProperties: {
      apiVersion: '2023-01-01',
      commonProperties: ['location', 'sku', 'kind'],
      requiredProperties: ['location', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.Web/sites/functions',
    serviceName: 'Azure Functions',
    iconTitle: 'Function App',
    category: 'compute',
    bicepProperties: {
      apiVersion: '2023-01-01',
      commonProperties: ['location', 'serverFarmId', 'kind', 'functionAppConfig'],
      requiredProperties: ['location', 'serverFarmId']
    }
  },
  {
    resourceType: 'Microsoft.Compute/virtualMachines',
    serviceName: 'Virtual Machine',
    iconTitle: 'Virtual Machine',
    category: 'compute',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'hardwareProfile', 'storageProfile', 'osProfile', 'networkProfile'],
      requiredProperties: ['location', 'hardwareProfile', 'storageProfile', 'osProfile', 'networkProfile']
    }
  },
  {
    resourceType: 'Microsoft.ContainerService/managedClusters',
    serviceName: 'Azure Kubernetes Service',
    iconTitle: 'Kubernetes Services',
    category: 'containers',
    bicepProperties: {
      apiVersion: '2023-10-01',
      commonProperties: ['location', 'dnsPrefix', 'agentPoolProfiles', 'servicePrincipalProfile'],
      requiredProperties: ['location', 'dnsPrefix', 'agentPoolProfiles']
    }
  },
  {
    resourceType: 'Microsoft.ContainerInstance/containerGroups',
    serviceName: 'Container Instance',
    iconTitle: 'Container Instances',
    category: 'containers',
    bicepProperties: {
      apiVersion: '2023-05-01',
      commonProperties: ['location', 'containers', 'osType', 'restartPolicy'],
      requiredProperties: ['location', 'containers', 'osType']
    }
  },
  {
    resourceType: 'Microsoft.ContainerRegistry/registries',
    serviceName: 'Container Registry',
    iconTitle: 'Container Registries',
    category: 'containers',
    bicepProperties: {
      apiVersion: '2023-07-01',
      commonProperties: ['location', 'sku', 'adminUserEnabled'],
      requiredProperties: ['location', 'sku']
    }
  },

  // Database Services
  {
    resourceType: 'Microsoft.Sql/servers',
    serviceName: 'SQL Server',
    iconTitle: 'SQL Database',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-05-01-preview',
      commonProperties: ['location', 'administratorLogin', 'administratorLoginPassword', 'version'],
      requiredProperties: ['location', 'administratorLogin', 'administratorLoginPassword']
    }
  },
  {
    resourceType: 'Microsoft.Sql/servers/databases',
    serviceName: 'SQL Database',
    iconTitle: 'Azure SQL',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-05-01-preview',
      commonProperties: ['location', 'sku', 'collation', 'maxSizeBytes'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.DocumentDB/databaseAccounts',
    serviceName: 'Cosmos DB',
    iconTitle: 'Azure Cosmos DB',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-09-15',
      commonProperties: ['location', 'databaseAccountOfferType', 'locations', 'consistencyPolicy'],
      requiredProperties: ['location', 'databaseAccountOfferType']
    }
  },
  {
    resourceType: 'Microsoft.Cache/Redis',
    serviceName: 'Redis Cache',
    iconTitle: 'Azure Cache for Redis',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-08-01',
      commonProperties: ['location', 'sku', 'enableNonSslPort', 'redisConfiguration'],
      requiredProperties: ['location', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.DBforMySQL/flexibleServers',
    serviceName: 'MySQL Flexible Server',
    iconTitle: 'Azure Database for MySQL servers',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-06-30',
      commonProperties: ['location', 'sku', 'administratorLogin', 'administratorLoginPassword', 'version'],
      requiredProperties: ['location', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.DBforPostgreSQL/flexibleServers',
    serviceName: 'PostgreSQL Flexible Server',
    iconTitle: 'Azure Database for PostgreSQL servers',
    category: 'databases',
    bicepProperties: {
      apiVersion: '2023-06-01-preview',
      commonProperties: ['location', 'sku', 'administratorLogin', 'administratorLoginPassword', 'version'],
      requiredProperties: ['location', 'sku']
    }
  },

  // Storage Services
  {
    resourceType: 'Microsoft.Storage/storageAccounts',
    serviceName: 'Storage Account',
    iconTitle: 'Storage Accounts',
    category: 'storage',
    bicepProperties: {
      apiVersion: '2023-01-01',
      commonProperties: ['location', 'sku', 'kind', 'accessTier', 'allowBlobPublicAccess'],
      requiredProperties: ['location', 'sku', 'kind']
    }
  },
  {
    resourceType: 'Microsoft.DataLakeStore/accounts',
    serviceName: 'Data Lake Store',
    iconTitle: 'Data Lake Store Gen1',
    category: 'analytics',
    bicepProperties: {
      apiVersion: '2016-11-01',
      commonProperties: ['location', 'tier', 'encryptionState'],
      requiredProperties: ['location']
    }
  },

  // Networking
  {
    resourceType: 'Microsoft.Network/virtualNetworks',
    serviceName: 'Virtual Network',
    iconTitle: 'Virtual Networks',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'addressSpace', 'subnets'],
      requiredProperties: ['location', 'addressSpace']
    }
  },
  {
    resourceType: 'Microsoft.Network/networkSecurityGroups',
    serviceName: 'Network Security Group',
    iconTitle: 'Network Security Groups',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'securityRules'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.Network/publicIPAddresses',
    serviceName: 'Public IP Address',
    iconTitle: 'Public IP addresses',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'publicIPAllocationMethod', 'sku'],
      requiredProperties: ['location', 'publicIPAllocationMethod']
    }
  },
  {
    resourceType: 'Microsoft.Network/loadBalancers',
    serviceName: 'Load Balancer',
    iconTitle: 'Load balancers',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'frontendIPConfigurations', 'backendAddressPools', 'loadBalancingRules'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.Network/applicationGateways',
    serviceName: 'Application Gateway',
    iconTitle: 'Application gateways',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'sku', 'gatewayIPConfigurations', 'frontendIPConfigurations', 'frontendPorts'],
      requiredProperties: ['location', 'sku', 'gatewayIPConfigurations']
    }
  },
  {
    resourceType: 'Microsoft.Network/trafficManagerProfiles',
    serviceName: 'Traffic Manager',
    iconTitle: 'Traffic Manager profiles',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2022-04-01',
      commonProperties: ['trafficRoutingMethod', 'dnsConfig', 'monitorConfig'],
      requiredProperties: ['trafficRoutingMethod', 'dnsConfig', 'monitorConfig']
    }
  },

  // Security & Identity
  {
    resourceType: 'Microsoft.KeyVault/vaults',
    serviceName: 'Key Vault',
    iconTitle: 'Key vaults',
    category: 'security',
    bicepProperties: {
      apiVersion: '2023-07-01',
      commonProperties: ['location', 'tenantId', 'sku', 'accessPolicies', 'enabledForDeployment'],
      requiredProperties: ['location', 'tenantId', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.ManagedIdentity/userAssignedIdentities',
    serviceName: 'Managed Identity',
    iconTitle: 'Managed identities',
    category: 'identity',
    bicepProperties: {
      apiVersion: '2023-01-31',
      commonProperties: ['location'],
      requiredProperties: ['location']
    }
  },

  // Integration Services
  {
    resourceType: 'Microsoft.ServiceBus/namespaces',
    serviceName: 'Service Bus',
    iconTitle: 'Service Bus',
    category: 'integration',
    bicepProperties: {
      apiVersion: '2022-10-01-preview',
      commonProperties: ['location', 'sku', 'properties'],
      requiredProperties: ['location', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.EventGrid/topics',
    serviceName: 'Event Grid',
    iconTitle: 'Event Grid Topics',
    category: 'integration',
    bicepProperties: {
      apiVersion: '2023-06-01-preview',
      commonProperties: ['location', 'inputSchema', 'publicNetworkAccess'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.EventHub/namespaces',
    serviceName: 'Event Hub',
    iconTitle: 'Event Hubs',
    category: 'analytics',
    bicepProperties: {
      apiVersion: '2023-01-01-preview',
      commonProperties: ['location', 'sku', 'properties'],
      requiredProperties: ['location', 'sku']
    }
  },
  {
    resourceType: 'Microsoft.Logic/workflows',
    serviceName: 'Logic App',
    iconTitle: 'Logic apps',
    category: 'integration',
    bicepProperties: {
      apiVersion: '2019-05-01',
      commonProperties: ['location', 'definition', 'parameters'],
      requiredProperties: ['location']
    }
  },

  // Monitoring & Management
  {
    resourceType: 'Microsoft.Insights/components',
    serviceName: 'Application Insights',
    iconTitle: 'Application Insights',
    category: 'monitor',
    bicepProperties: {
      apiVersion: '2020-02-02',
      commonProperties: ['location', 'kind', 'applicationType', 'workspaceResourceId'],
      requiredProperties: ['location', 'kind']
    }
  },
  {
    resourceType: 'Microsoft.OperationalInsights/workspaces',
    serviceName: 'Log Analytics Workspace',
    iconTitle: 'Log Analytics workspaces',
    category: 'analytics',
    bicepProperties: {
      apiVersion: '2023-09-01',
      commonProperties: ['location', 'sku', 'retentionInDays', 'workspaceCapping'],
      requiredProperties: ['location']
    }
  },

  // AI & Machine Learning
  {
    resourceType: 'Microsoft.CognitiveServices/accounts',
    serviceName: 'Cognitive Services',
    iconTitle: 'Cognitive Services',
    category: 'ai + machine learning',
    bicepProperties: {
      apiVersion: '2023-05-01',
      commonProperties: ['location', 'sku', 'kind', 'properties'],
      requiredProperties: ['location', 'sku', 'kind']
    }
  },
  {
    resourceType: 'Microsoft.MachineLearningServices/workspaces',
    serviceName: 'Machine Learning Workspace',
    iconTitle: 'Machine Learning',
    category: 'ai + machine learning',
    bicepProperties: {
      apiVersion: '2023-10-01',
      commonProperties: ['location', 'friendlyName', 'keyVault', 'storageAccount', 'applicationInsights'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.Search/searchServices',
    serviceName: 'Cognitive Search',
    iconTitle: 'Cognitive Search',
    category: 'ai + machine learning',
    bicepProperties: {
      apiVersion: '2023-11-01',
      commonProperties: ['location', 'sku', 'replicaCount', 'partitionCount'],
      requiredProperties: ['location', 'sku']
    }
  },

  // API Management
  {
    resourceType: 'Microsoft.ApiManagement/service',
    serviceName: 'API Management',
    iconTitle: 'API Management services',
    category: 'integration',
    bicepProperties: {
      apiVersion: '2023-05-01-preview',
      commonProperties: ['location', 'sku', 'publisherName', 'publisherEmail'],
      requiredProperties: ['location', 'sku', 'publisherName', 'publisherEmail']
    }
  },

  // Governance
  {
    resourceType: 'Microsoft.Resources/resourceGroups',
    serviceName: 'Resource Group',
    iconTitle: 'Resource Groups',
    category: 'governance',
    bicepProperties: {
      apiVersion: '2021-04-01',
      commonProperties: ['location', 'tags'],
      requiredProperties: ['location'],
    },
  },
  {
    resourceType: 'Microsoft.Management/managementGroups',
    serviceName: 'Management Group',
    iconTitle: 'Management Groups',
    category: 'governance',
    bicepProperties: {
      apiVersion: '2021-04-01',
      commonProperties: ['displayName', 'details'],
      requiredProperties: [],
    },
  },

  // Content Delivery
  {
    resourceType: 'Microsoft.Cdn/profiles',
    serviceName: 'Azure Front Door and CDN Profiles',
    iconTitle: 'Azure Front Door And CDN Profiles',
    category: 'networking',
    bicepProperties: {
      apiVersion: '2023-05-01',
      commonProperties: ['location', 'sku'],
      requiredProperties: ['sku']
    }
  },

  // IoT Services
  {
    resourceType: 'Microsoft.Devices/IotHubs',
    serviceName: 'IoT Hub',
    iconTitle: 'IoT Hub',
    category: 'iot',
    bicepProperties: {
      apiVersion: '2023-06-30',
      commonProperties: ['location', 'sku', 'properties'],
      requiredProperties: ['location', 'sku']
    }
  },

  // Data Services
  {
    resourceType: 'Microsoft.DataFactory/factories',
    serviceName: 'Data Factory',
    iconTitle: 'Data factories',
    category: 'analytics',
    bicepProperties: {
      apiVersion: '2018-06-01',
      commonProperties: ['location', 'identity', 'properties'],
      requiredProperties: ['location']
    }
  },
  {
    resourceType: 'Microsoft.Synapse/workspaces',
    serviceName: 'Synapse Analytics',
    iconTitle: 'Azure Synapse Analytics',
    category: 'analytics',
    bicepProperties: {
      apiVersion: '2021-06-01',
      commonProperties: ['location', 'defaultDataLakeStorage', 'sqlAdministratorLogin', 'sqlAdministratorLoginPassword'],
      requiredProperties: ['location', 'defaultDataLakeStorage']
    }
  }
];

/**
 * Service to handle Bicep resource type mappings
 */
export class BicepResourceMapper {
  private static mappings = new Map<string, BicepResourceMapping>();
  private static reverseMappings = new Map<string, BicepResourceMapping>();

  static {
    // Initialize mappings
    BICEP_RESOURCE_MAPPINGS.forEach(mapping => {
      this.mappings.set(mapping.resourceType.toLowerCase(), mapping);
      this.reverseMappings.set(mapping.iconTitle.toLowerCase(), mapping);
      this.reverseMappings.set(mapping.serviceName.toLowerCase(), mapping);
    });
  }

  /**
   * Find Azure service by Bicep resource type
   */
  static findServiceByResourceType(resourceType: string): AzureService | null {
    const mapping = this.mappings.get(resourceType.toLowerCase());
    if (!mapping) return null;

    return azureServices.find(service => 
      service.title.toLowerCase().includes(mapping.iconTitle.toLowerCase()) ||
      service.category.toLowerCase() === mapping.category.toLowerCase()
    ) || null;
  }

  /**
   * Find Bicep resource type by service name or icon title
   */
  static findResourceTypeByService(serviceName: string): BicepResourceMapping | null {
    return this.reverseMappings.get(serviceName.toLowerCase()) || null;
  }

  /**
   * Generate Bicep resource definition
   */
  static generateBicepResource(
    serviceName: string, 
    resourceName: string, 
    location: string = 'resourceGroup().location',
    additionalProperties: Record<string, unknown> = {}
  ): string {
    const mapping = this.findResourceTypeByService(serviceName);
    if (!mapping) {
      throw new Error(`No Bicep mapping found for service: ${serviceName}`);
    }

    const { resourceType, bicepProperties } = mapping;
    const cleanResourceName = resourceName.replace(/[^a-zA-Z0-9]/g, '');

    let bicepTemplate = `@description('${mapping.serviceName}')\n`;
    bicepTemplate += `resource ${cleanResourceName} '${resourceType}@${bicepProperties?.apiVersion || '2023-01-01'}' = {\n`;
    bicepTemplate += `  name: '${resourceName}'\n`;
    bicepTemplate += `  location: ${location}\n`;

    // Add required properties with defaults
    if (bicepProperties?.requiredProperties) {
      bicepTemplate += `  properties: {\n`;
      
      bicepProperties.requiredProperties.forEach(prop => {
        if (prop !== 'location' && !additionalProperties[prop]) {
          switch (prop) {
            case 'sku':
              if (resourceType.includes('storageAccounts')) {
                bicepTemplate += `    sku: {\n      name: 'Standard_LRS'\n    }\n`;
              } else if (resourceType.includes('Web/serverfarms')) {
                bicepTemplate += `    sku: {\n      name: 'B1'\n      tier: 'Basic'\n      capacity: 1\n    }\n`;
              } else {
                bicepTemplate += `    sku: {\n      name: 'Standard'\n    }\n`;
              }
              break;
            case 'kind':
              if (resourceType.includes('storageAccounts')) {
                bicepTemplate += `    kind: 'StorageV2'\n`;
              } else if (resourceType.includes('components')) {
                bicepTemplate += `    kind: 'web'\n`;
              }
              break;
            case 'databaseAccountOfferType':
              bicepTemplate += `    databaseAccountOfferType: 'Standard'\n`;
              break;
            default:
              if (additionalProperties[prop]) {
                bicepTemplate += `    ${prop}: ${JSON.stringify(additionalProperties[prop])}\n`;
              }
          }
        }
      });

      // Add any additional properties
      Object.entries(additionalProperties).forEach(([key, value]) => {
        if (!bicepProperties.requiredProperties?.includes(key)) {
          bicepTemplate += `    ${key}: ${JSON.stringify(value)}\n`;
        }
      });

      bicepTemplate += `  }\n`;
    }

    bicepTemplate += `}\n`;

    return bicepTemplate;
  }

  /**
   * Get all supported resource types
   */
  static getSupportedResourceTypes(): string[] {
    return Array.from(this.mappings.keys());
  }

  /**
   * Get mapping by resource type
   */
  static getMapping(resourceType: string): BicepResourceMapping | null {
    return this.mappings.get(resourceType.toLowerCase()) || null;
  }

  /**
   * Extract resource types from Bicep content
   */
  static extractResourceTypesFromBicep(bicepContent: string): string[] {
    const resourceMatches = bicepContent.match(/resource\s+\w+\s+'([^'@]+)@[^']+'/g) || [];
    return resourceMatches.map(match => {
      const typeMatch = match.match(/'([^'@]+)@/);
      return typeMatch ? typeMatch[1] : '';
    }).filter(Boolean);
  }
}

export default BicepResourceMapper;

export const SERVICE_TO_ICON_MAPPINGS: { [key: string]: string } = {
  // App Services
  'app service': 'App Services',
  'web app': 'App Services',
  'azure app service': 'App Services',
  'webApp': 'App Services',
  'Microsoft.Web/sites': 'App Services',
  
  // Cosmos DB
  'cosmos db': 'Azure Cosmos Db',
  'azure cosmos db': 'Azure Cosmos Db',
  'cosmosdb': 'Azure Cosmos Db',
  'cosmos': 'Azure Cosmos Db',
  'Microsoft.DocumentDB/databaseAccounts': 'Azure Cosmos Db',
  
  // SQL Database
  'sql database': 'SQL Database',
  'azure sql': 'SQL Database', 
  'azure sql database': 'SQL Database',
  'Microsoft.Sql/servers': 'SQL Server',
  'Microsoft.Sql/servers/databases': 'SQL Database',
  
  // Storage
  'storage account': 'Storage Accounts',
  'storage accounts': 'Storage Accounts',
  'azure storage': 'Storage Accounts',
  'blob storage': 'Storage Accounts',
  'azure blob storage': 'Storage Accounts',
  'Microsoft.Storage/storageAccounts': 'Storage Accounts',
  
  // Functions
  'function app': 'Function Apps',
  'azure functions': 'Function Apps',
  'functions': 'Function Apps',
  'function apps': 'Function Apps',
  'Microsoft.Web/sites/functions': 'Function Apps',
  
  // Application Gateway
  'application gateway': 'Application Gateways',
  'azure application gateway': 'Application Gateways',
  'Microsoft.Network/applicationGateways': 'Application Gateways',
  
  // Virtual Network
  'virtual network': 'Virtual Networks',
  'vnet': 'Virtual Networks',
  'azure vnet': 'Virtual Networks',
  'Microsoft.Network/virtualNetworks': 'Virtual Networks',

  // Subnet / NSG / Landing zone
  'subnet': 'Subnet',
  'network security group': 'Network Security Group',
  'nsg': 'Network Security Group',
  'landing zone': 'Landing Zone',
  'landing-zone': 'Landing Zone',
  'management group': 'Management Groups',
  'management groups': 'Management Groups',
  'subscription': 'Subscriptions',
  'subscriptions': 'Subscriptions',
  'policy assignment': 'Policy',
  'policy definition': 'Policy',
  'policy': 'Policy',
  'role assignment': 'Entra Identity Roles And Administrators',
  'rbac': 'Entra Identity Roles And Administrators',
  'event hubs': 'Event Hubs',
  'event hub': 'Event Hubs',
  'azure event hub': 'Event Hubs',
  'azure event hubs': 'Event Hubs',
  'stream analytics': 'Stream Analytics Jobs',
  'azure stream analytics': 'Stream Analytics Jobs',
  'stream analytics jobs': 'Stream Analytics Jobs',
  'synapse': 'Azure Synapse Analytics',
  'azure synapse analytics': 'Azure Synapse Analytics',
  'synapse workspace': 'Azure Synapse Analytics',
  'power bi': 'Power BI',
  'managed identity': 'Managed Identities',
  'managed identities': 'Managed Identities',
  
  // Key Vault
  'key vault': 'Key Vaults',
  'azure key vault': 'Key Vaults',
  'Microsoft.KeyVault/vaults': 'Key Vaults',
  
  // Service Bus
  'service bus': 'Service Bus',
  'azure service bus': 'Service Bus',
  'Microsoft.ServiceBus/namespaces': 'Service Bus',
  
  // Redis Cache
  'redis cache': 'Cache Redis',
  'cache redis': 'Cache Redis',
  'azure cache for redis': 'Cache Redis',
  'Microsoft.Cache/Redis': 'Cache Redis',
  
  // Event Grid
  'event grid': 'Event Grid Topics',
  'azure event grid': 'Event Grid Topics',
  'Microsoft.EventGrid/topics': 'Event Grid Topics',
  
  // API Management
  'api management': 'API Management Services',
  'azure api management': 'API Management Services',
  'Microsoft.ApiManagement/service': 'API Management Services',
  
  // Container Registry
  'container registry': 'Container Registries',
  'azure container registry': 'Container Registries',
  'Microsoft.ContainerRegistry/registries': 'Container Registries',
  
  // Kubernetes Service
  'kubernetes service': 'Kubernetes Services',
  'aks': 'Kubernetes Services',
  'azure kubernetes service': 'Kubernetes Services',
  'Microsoft.ContainerService/managedClusters': 'Kubernetes Services',
  
  // Resource Groups
  'resource group': 'Resource Groups',
  'resource groups': 'Resource Groups',
  'Microsoft.Resources/resourceGroups': 'Resource Groups',
  
  // Service Plans
  'app service plan': 'App Service Plans',
  'service plan': 'App Service Plans',
  'Microsoft.Web/serverfarms': 'App Service Plans',
  
  // Data Factory
  'data factory': 'Data Factories',
  'azure data factory': 'Data Factories',
  'data factories': 'Data Factories',
  
  // Data Lake
  'data lake storage': 'Data Lake Store Gen1',
  'azure data lake storage': 'Data Lake Store Gen1',
  'data lake store': 'Data Lake Store Gen1',
  
  // Exact Bicep resource type mappings
  'microsoft.web/sites': 'App Services',
  'microsoft.documentdb/databaseaccounts': 'Azure Cosmos Db',
  'microsoft.web/serverfarms': 'App Service Plans',
};
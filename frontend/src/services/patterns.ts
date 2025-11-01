    export const patterns = [
      // App Service typically connects to databases
      {
        from: ['app services', 'app service'],
        to: ['azure cosmos db', 'sql database', 'mysql', 'postgresql'],
        label: 'data access'
      },
      // Subscriptions enforce policy assignments
      {
        from: ['policy'],
        to: ['subscriptions', 'management groups', 'landing zone'],
        label: 'policy scope'
      },
      // Role assignments apply to subscriptions/landing zones
      {
        from: ['entra identity roles and administrators'],
        to: ['subscriptions', 'resource groups', 'landing zone'],
        label: 'rbac'
      },
      // App Service connects to App Service Plan
      {
        from: ['app services'],
        to: ['app service plans'],
        label: 'hosted on'
      },
      // Services connect to Key Vault for secrets
      {
        from: ['app services', 'function app', 'azure cosmos db'],
        to: ['key vaults'],
        label: 'secrets'
      },
      // Function App connects to Storage
      {
        from: ['function app'],
        to: ['storage accounts'],
        label: 'runtime storage'
      },
      // API Management in front of services
      {
        from: ['api management services'],
        to: ['app services', 'function app'],
        label: 'api gateway'
      },
      // Application Gateway load balances
      {
        from: ['application gateways'],
        to: ['app services'],
        label: 'load balancer'
      },
      // Management group scopes subscriptions
      {
        from: ['management groups'],
        to: ['subscriptions'],
        label: 'scope'
      },
      // Subscriptions contain landing zones and resource groups
      {
        from: ['subscriptions'],
        to: ['landing zone', 'resource groups'],
        label: 'contains'
      },
      // Landing zones include virtual networks
      {
        from: ['landing zone'],
        to: ['virtual networks', 'virtual network', 'subnet'],
        label: 'network'
      },
      // Event ingestion into Stream Analytics
      {
        from: ['event hubs', 'event hub', 'azure event hub', 'azure iot hub', 'iot hub'],
        to: ['stream analytics jobs', 'stream analytics'],
        label: 'stream input'
      },
      // Stream Analytics outputs to Synapse
      {
        from: ['stream analytics jobs', 'stream analytics'],
        to: ['azure synapse analytics', 'synapse workspace'],
        label: 'analytics sink'
      },
      // Stream Analytics outputs to Power BI dashboards
      {
        from: ['stream analytics jobs', 'stream analytics'],
        to: ['power bi'],
        label: 'visualization'
      },
      // Managed identity used by Stream Analytics / Synapse
      {
        from: ['managed identities', 'managed identity'],
        to: ['stream analytics jobs', 'stream analytics', 'azure synapse analytics'],
        label: 'identity'
      },
    ];

    export const connectionPatterns = [
      // Direct connection words
      /(\w+(?:\s+\w+)*)\s+(?:connects?\s+to|talks?\s+to|calls?|uses?|accesses?|queries?|stores?\s+data\s+in)\s+(\w+(?:\s+\w+)*)/gi,
      // Arrow patterns
      /(\w+(?:\s+\w+)*)\s*(?:<-->|->|→)\s*(\w+(?:\s+\w+)*)/gi,
      // Bicep dependencies - look for dependsOn patterns
      /dependsOn:\s*\[?\s*(\w+)\s*\]?/gi,
    ];

    export const bicepResourcePatterns = [
      /Microsoft\.Web\/sites(?:\/\w+)?/gi,
      /Microsoft\.DocumentDB\/databaseAccounts/gi,
      /Microsoft\.Storage\/storageAccounts/gi,
      /Microsoft\.Sql\/servers(?:\/databases)?/gi,
      /Microsoft\.KeyVault\/vaults/gi,
      /Microsoft\.Network\/virtualNetworks/gi,
      /Microsoft\.Network\/applicationGateways/gi,
      /Microsoft\.Web\/serverfarms/gi,
      /Microsoft\.Cache\/Redis/gi,
      /Microsoft\.ServiceBus\/namespaces/gi,
      /Microsoft\.EventGrid\/topics/gi,
      /Microsoft\.ApiManagement\/service/gi,
      /Microsoft\.ContainerRegistry\/registries/gi,
      /Microsoft\.ContainerService\/managedClusters/gi,
    ];

        // Common service name patterns in natural language
    export const serviceNamePatterns = [
      /\b(azure\s+)?app\s+service\b/gi,
      /\bweb\s+app\b/gi,
      /\b(azure\s+)?cosmos\s+db\b/gi,
      /\bcosmosdb\b/gi,
      /\b(azure\s+)?sql\s+(database|server)\b/gi,
      /\bstorage\s+account\b/gi,
      /\bblob\s+storage\b/gi,
      /\b(azure\s+)?function\s+app\b/gi,
      /\b(azure\s+)?functions\b/gi,
      /\b(azure\s+)?key\s+vault\b/gi,
      /\bvirtual\s+network\b/gi,
      /\bvnet\b/gi,
      /\bresource\s+group\b/gi,
      /\bapplication\s+gateway\b/gi,
      /\bmanagement\s+group\b/gi,
      /\bsubscription(s)?\b/gi,
      /\bpolicy\s+(assignment|definition)\b/gi,
      /\brole\s+assignment\b/gi,
      /\brbac\b/gi,
    ];
    
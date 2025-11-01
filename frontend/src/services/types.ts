export type ParsedGroupType =
  | 'region'
  | 'landingZone'
  | 'virtualNetwork'
  | 'subnet'
  | 'cluster'
  | 'resourceGroup'
  | 'networkSecurityGroup'
  | 'securityBoundary'
  | 'managementGroup'
  | 'subscription'
  | 'policyAssignment'
  | 'roleAssignment'
  | 'default';
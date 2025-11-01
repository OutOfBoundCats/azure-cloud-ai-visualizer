import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Icon } from '@iconify/react';
import { DiagramAnalyzer, DiagramAnalysisResult } from '@/services/diagramAnalyzer';
import { ArchitectureParser, ParsedArchitecture, ParsedGroup, ParsedGroupType } from '@/services/architectureParser';
import { AzureService } from '@/data/azureServices';
import { useDiagramStore } from '@/store/diagramStore';
import { toast } from 'sonner';

interface ImageUploadProps {
  onAnalysisComplete?: (result: DiagramAnalysisResult) => void;
  onDiagramUpdated?: () => void;
}

const normalizeGroupKey = (value?: string | null): string => {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const mapBackendGroupType = (type?: string, label?: string): ParsedGroupType => {
  const normalizedType = (type || '').toLowerCase();
  const normalizedLabel = (label || '').toLowerCase();

  const matches = (...keys: string[]) => keys.some((key) => normalizedType.includes(key) || normalizedLabel.includes(key));

  if (matches('region')) return 'region';
  if (matches('landing zone', 'landing_zone', 'landing-zone')) return 'landingZone';
  if (matches('resource group')) return 'resourceGroup';
  if (matches('virtual network', 'virtual_network', 'vnet')) return 'virtualNetwork';
  if (matches('subnet')) return 'subnet';
  if (matches('network security group', 'nsg')) return 'networkSecurityGroup';
  if (matches('cluster', 'aks')) return 'cluster';
  if (matches('security boundary')) return 'securityBoundary';
  if (matches('management group', 'tenant root')) return 'managementGroup';
  if (matches('subscription')) return 'subscription';
  if (matches('policy assignment', 'policy definition')) return 'policyAssignment';
  if (matches('role assignment', 'rbac')) return 'roleAssignment';

  return 'default';
};

export const ImageUpload: React.FC<ImageUploadProps> = ({ onAnalysisComplete, onDiagramUpdated }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const addNodesFromArchitecture = useDiagramStore((state) => state.addNodesFromArchitecture);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    // Validate file
    const validation = DiagramAnalyzer.validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    // Show preview
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    
    try {
      setIsAnalyzing(true);
      setProgress(10);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);
      
      // Analyze the image
      const analysisResult = await DiagramAnalyzer.analyzeImage(file);
      
      clearInterval(progressInterval);
      setProgress(100);
      
      // Convert analysis result directly to nodes without text parsing
      const parsedServices: AzureService[] = [];
      
      // Map each detected service name to an actual Azure service
      console.log('🔍 Backend detected services:', analysisResult.services);
      for (const serviceName of analysisResult.services) {
        console.log(`🎯 Looking for service: "${serviceName}"`);
        const azureService = ArchitectureParser.findAzureServiceByName(serviceName);
        console.log(`✅ Found Azure service:`, azureService?.title || 'NOT FOUND');
        if (azureService && !parsedServices.find(s => s.id === azureService.id)) {
          parsedServices.push(azureService);
        }
      }
      console.log('📋 Final parsed services:', parsedServices.map(s => s.title));
      
      // Helper: ensure a detected service name maps to an AzureService and is included in parsedServices
      const ensureParsedService = (name?: string): AzureService | null => {
        if (!name || typeof name !== 'string') return null;
        const svc = ArchitectureParser.findAzureServiceByName(name);
        if (svc) {
          const exists = parsedServices.find(s => s.id === svc.id);
          if (!exists) parsedServices.push(svc);
          return svc;
        }
        return null;
      };

      const rawGroups = analysisResult.groups ?? [];
      const parsedGroups: ParsedGroup[] = [];
      const groupKeyToId = new Map<string, string>();
      const nestedGroupLinks: Array<{ parentId: string; childKey: string }> = [];

      rawGroups.forEach((group, index) => {
        const label = group.label || group.id || `Group ${index + 1}`;
        const serviceForGroup = ArchitectureParser.findAzureServiceByName(label);
        if (serviceForGroup && !parsedServices.find((s) => s.id === serviceForGroup.id)) {
          parsedServices.push(serviceForGroup);
        }

        const resolvedId =
          serviceForGroup?.id || `group-${index}-${normalizeGroupKey(label) || index.toString()}`;

        const members: string[] = [];
        (group.members || []).forEach((memberName) => {
          const svc = ensureParsedService(memberName);
          if (svc) {
            members.push(svc.id);
            return;
          }
          const childKey = normalizeGroupKey(memberName);
          if (childKey) {
            nestedGroupLinks.push({ parentId: resolvedId, childKey });
          }
        });

        const parsedGroup: ParsedGroup = {
          id: resolvedId,
          label,
          type: mapBackendGroupType(group.group_type, label),
          members,
          metadata: group.metadata,
          sourceServiceId: serviceForGroup?.id,
        };

        parsedGroups.push(parsedGroup);

        [group.id, label].forEach((key) => {
          const normalizedKey = normalizeGroupKey(key);
          if (normalizedKey) {
            groupKeyToId.set(normalizedKey, resolvedId);
          }
        });
      });

      rawGroups.forEach((group, index) => {
        const parsedGroup = parsedGroups[index];
        if (!parsedGroup) return;
        const parentKey = normalizeGroupKey(group.parent_id);
        if (parentKey) {
          const parentId = groupKeyToId.get(parentKey);
          if (parentId && parentId !== parsedGroup.id) {
            parsedGroup.parentId = parentId;
          }
        }
      });

      nestedGroupLinks.forEach(({ parentId, childKey }) => {
        const childId = groupKeyToId.get(childKey);
        if (!childId || childId === parentId) return;
        const childGroup = parsedGroups.find((group) => group.id === childId);
        const parentGroup = parsedGroups.find((group) => group.id === parentId);
        if (!childGroup || !parentGroup) return;
        childGroup.parentId = childGroup.parentId ?? parentId;
        if (!parentGroup.members.includes(childId)) {
          parentGroup.members.push(childId);
        }
      });

      parsedGroups.forEach((group) => {
        if (group.parentId) {
          const parentGroup = parsedGroups.find((candidate) => candidate.id === group.parentId);
          if (parentGroup && !parentGroup.members.includes(group.id)) {
            parentGroup.members.push(group.id);
          }
        }
        group.members = Array.from(new Set(group.members));
      });

      // Map connections using the correct field names from backend and ensure endpoint services exist
      const mappedConnections = analysisResult.connections.map(conn => {
        // Resolve or add services referenced by connections
        const fromService = ensureParsedService(conn.from_service) || undefined;
        const toService = ensureParsedService(conn.to_service) || undefined;

        return {
          from: fromService?.id || null,
          to: toService?.id || null,
          label: conn.label || 'connection'
        };
      }).filter(conn => {
        // Only include connections where both endpoints resolved to actual service ids
        return conn.from && conn.to;
      }) as { from: string; to: string; label?: string }[];
      
      // Create architecture object directly from analysis result
      const architecture: ParsedArchitecture = {
        services: parsedServices,
        connections: mappedConnections,
        layout: parsedServices.length <= 3 ? 'horizontal' : parsedServices.length <= 6 ? 'vertical' : 'grid',
        groups: parsedGroups.length > 0 ? parsedGroups : undefined
      };
      console.log('[ImageUpload] Parsed architecture from diagram analysis', {
        services: architecture.services.map((svc) => ({ id: svc.id, title: svc.title })),
        groups: architecture.groups?.map((group) => ({
          id: group.id,
          label: group.label,
          type: group.type,
          members: group.members,
        })),
        connections: architecture.connections,
      });
      
      // Generate nodes and add to diagram
      const nodes = ArchitectureParser.generateNodes(architecture);
      console.log('[ImageUpload] Generated nodes from diagram analysis', {
        nodeCount: nodes.length,
        connectionCount: architecture.connections.length,
        sample: nodes.slice(0, 5).map((node) => ({ id: node.id, type: node.type })),
      });
      
      // Add to diagram using the existing method
      addNodesFromArchitecture(nodes, architecture.connections);
      onDiagramUpdated?.();
      
      toast.success(`Successfully analyzed diagram! Found ${nodes.length} services and ${mappedConnections.length} connections.`);
      onAnalysisComplete?.(analysisResult);
      
    } catch (error) {
      console.error('Analysis failed:', error);
      toast.error('Failed to analyze diagram. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
      setTimeout(() => setPreview(null), 3000); // Clear preview after 3 seconds
    }
  }, [addNodesFromArchitecture, onAnalysisComplete, onDiagramUpdated]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    disabled: isAnalyzing
  });
  
  return (
    <div className="space-y-4">
      <Card
        {...getRootProps()}
        className={`
          border-2 border-dashed p-6 transition-all cursor-pointer
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
          ${isAnalyzing ? 'pointer-events-none opacity-50' : 'hover:border-primary hover:bg-primary/5'}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Icon 
              icon={isAnalyzing ? 'mdi:loading' : 'mdi:cloud-upload'} 
              className={`text-3xl text-primary ${isAnalyzing ? 'animate-spin' : ''}`}
            />
          </div>
          
          <div className="text-center">
            <h3 className="font-semibold text-lg mb-2">
              {isAnalyzing ? 'Analyzing Diagram...' : 'Upload Architecture Diagram'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isDragActive 
                ? 'Drop your diagram here...'
                : 'Drag & drop an image here, or click to select'
              }
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports JPEG, PNG, GIF, WebP (max 10MB)
            </p>
          </div>
          
          {!isAnalyzing && (
            <Button variant="outline" size="sm">
              <Icon icon="mdi:folder-open" className="mr-2" />
              Choose File
            </Button>
          )}
        </div>
      </Card>
      
      {isAnalyzing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:brain" className="text-primary" />
            <span className="text-sm font-medium">AI analyzing diagram...</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
      
      {preview && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <img 
              src={preview} 
              alt="Upload preview" 
              className="w-16 h-16 object-cover rounded-lg border"
            />
            <div className="flex-1">
              <p className="font-medium text-sm">Diagram uploaded</p>
              <p className="text-xs text-muted-foreground">
                {isAnalyzing ? 'Extracting services and connections...' : 'Analysis complete!'}
              </p>
            </div>
            <Icon 
              icon={isAnalyzing ? 'mdi:loading' : 'mdi:check-circle'} 
              className={`text-xl ${isAnalyzing ? 'animate-spin text-primary' : 'text-green-500'}`}
            />
          </div>
        </Card>
      )}
    </div>
  );
};

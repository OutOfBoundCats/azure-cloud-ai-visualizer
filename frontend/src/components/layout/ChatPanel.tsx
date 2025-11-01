import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/context/SupabaseContext';
import { useChat } from '@/hooks/useChat';
import RunProgress from '@/components/RunProgress';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useDiagramStore } from '@/store/diagramStore';
import { ArchitectureParser, ParsedArchitecture } from '@/services/architectureParser';
import { AzureService } from '@/data/azureServices';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { saveProjectDiagramState, type ProjectDiagramState } from '@/services/projectService';

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
  projectId?: string;
  onIacGenerated?: (payload: {
    bicep?: { template: string; parameters?: Record<string, unknown> | null };
    terraform?: { template: string; parameters?: Record<string, unknown> | null };
  }) => void | Promise<void>;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onToggle,
  initialPrompt,
  onInitialPromptConsumed,
  projectId,
  onIacGenerated,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showImageUpload, setShowImageUpload] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { addNodesFromArchitecture, replaceDiagram } = useDiagramStore();
  const initialPromptRef = useRef<string | null>(null);
  const processedDiagramMessages = useRef<Set<string>>(new Set());
  const { client: supabaseClient } = useSupabase();
  const [isRunProgressOpen, setIsRunProgressOpen] = useState(false);

  const {
    messages,
    isConnected,
    isTyping,
    sendMessage,
    connectWebSocket,
    disconnect,
    addAssistantMessage,
    runState,
    latestDiagram,
  } = useChat({
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    supabase: supabaseClient ?? undefined,
    projectId,
  });
  

  // Function to check if a message contains architecture information
  const containsArchitecture = (content: string): boolean => {
    const architectureKeywords = [
      'architecture', 'azure app service', 'sql database', 'storage account',
      'azure functions', 'application gateway', 'virtual network', 'bicep',
      'terraform', 'resource', 'microsoft.web', 'microsoft.sql', 'microsoft.storage'
    ];
    
    const lowerContent = content.toLowerCase();
    return architectureKeywords.some(keyword => lowerContent.includes(keyword));
  };

  const persistDiagramState = useCallback(async () => {
    if (!projectId || !supabaseClient) {
      return;
    }
    try {
      const { nodes, edges } = useDiagramStore.getState();
      const payload: ProjectDiagramState = {
        nodes,
        edges,
        saved_at: new Date().toISOString(),
      };
      await saveProjectDiagramState(supabaseClient, projectId, payload);
      console.log('[ChatPanel] Persisted diagram state', {
        projectId,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      });
    } catch (error) {
      console.error('[ChatPanel] Failed to persist diagram state', error);
    }
  }, [projectId, supabaseClient]);

  useEffect(() => {
    processedDiagramMessages.current.clear();
  }, [projectId]);

  // Function to visualize architecture from AI response
  const visualizeArchitecture = useCallback(
    (messageContent: string, replaceExisting: boolean = false, structured?: ParsedArchitecture | null) => {
      try {
        const architecture = structured ?? ArchitectureParser.parseResponse(messageContent);
        console.log('[ChatPanel] Parsed architecture for visualization', {
          replaceExisting,
          services: architecture.services.map((svc) => ({ id: svc.id, title: svc.title })),
          connections: architecture.connections,
          groups: architecture.groups?.map((group) => ({
            id: group.id,
            label: group.label,
            type: group.type,
            members: group.members,
          })),
        });

        if (architecture.services.length === 0) {
          toast({
            title: 'No Architecture Found',
            description: 'Could not extract Azure services from this message.',
            variant: 'destructive',
          });
          return;
        }

        const nodes = ArchitectureParser.generateNodes(architecture);
        console.log('[ChatPanel] Generated nodes for visualization', {
          nodeCount: nodes.length,
          sample: nodes.slice(0, 5).map((node) => ({
            id: node.id,
            type: node.type,
            parentNode: (node as { parentNode?: string }).parentNode,
          })),
          connectionCount: architecture.connections.length,
        });

        if (replaceExisting) {
          replaceDiagram(nodes, architecture.connections);
        } else {
          addNodesFromArchitecture(nodes, architecture.connections);
        }
        void persistDiagramState();

        toast({
          title: 'Architecture Visualized',
          description: `Applied ${architecture.services.length} Azure services from the assistant response.`,
        });
      } catch (error) {
        console.error('[ChatPanel] Error visualizing architecture', error);
        toast({
          title: 'Visualization Error',
          description: error instanceof Error ? error.message : 'Failed to process the architecture payload.',
          variant: 'destructive',
        });
      }
    },
    [addNodesFromArchitecture, persistDiagramState, replaceDiagram, toast]
  );

  // WebSocket connection management - DISABLED for stability, using REST API
  useEffect(() => {
    // Disabled WebSocket auto-connection to avoid unnecessary connection attempts
    // The chat uses REST API which is working perfectly with OpenAI
    console.log('Chat panel ready; team streaming will connect on demand');
  }, [isOpen]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) {
      return;
    }
    await sendMessage(content);
    setInputMessage('');
  }, [sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputMessage);
  };

  useEffect(() => {
    if (!latestDiagram) {
      return;
    }
    if (processedDiagramMessages.current.has(latestDiagram.messageId)) {
      return;
    }
    processedDiagramMessages.current.add(latestDiagram.messageId);
    try {
      let architecture = latestDiagram.architecture;
      if (
        (!architecture || architecture.services.length === 0) &&
        latestDiagram.messageText
      ) {
        console.log('[ChatPanel] Falling back to text-based architecture parsing');
        architecture = ArchitectureParser.parseResponse(latestDiagram.messageText);
      }

      if (!architecture) {
        throw new Error('No architecture data was returned by the agent.');
      }

      const nodes = ArchitectureParser.generateNodes(architecture);
      replaceDiagram(nodes, architecture.connections);
      void persistDiagramState();
      toast({
        title: 'Diagram Updated',
        description: `Applied ${architecture.services.length} services from the latest agent run.`,
      });
    } catch (error) {
      console.error('[ChatPanel] Failed to apply structured diagram payload', error);
      toast({
        title: 'Diagram Update Failed',
        description: error instanceof Error ? error.message : 'Unable to apply the generated architecture.',
        variant: 'destructive',
      });
    }

    const iac = latestDiagram.iac;
    if (iac && onIacGenerated) {
      const { bicep, terraform } = iac;
      const bicepTemplate =
        bicep && typeof bicep.bicep_code === 'string' ? bicep.bicep_code : undefined;
      const terraformTemplate =
        terraform && typeof terraform.terraform_code === 'string' ? terraform.terraform_code : undefined;
      if (bicepTemplate || terraformTemplate) {
        onIacGenerated({
          bicep: bicepTemplate
            ? {
                template: bicepTemplate,
                parameters:
                  bicep &&
                  typeof bicep === 'object' &&
                  'parameters' in bicep &&
                  bicep.parameters &&
                  typeof bicep.parameters === 'object'
                    ? (bicep.parameters as Record<string, unknown>)
                    : null,
              }
            : undefined,
          terraform: terraformTemplate
            ? {
                template: terraformTemplate,
                parameters:
                  terraform &&
                  typeof terraform === 'object' &&
                  'parameters' in terraform &&
                  terraform.parameters &&
                  typeof terraform.parameters === 'object'
                    ? (terraform.parameters as Record<string, unknown>)
                    : null,
              }
            : undefined,
        });
      }
    }
  }, [latestDiagram, onIacGenerated, persistDiagramState, replaceDiagram, toast]);

  useEffect(() => {
    if (!runState?.runId) {
      setIsRunProgressOpen(false);
      return;
    }

    if (runState.status === 'running') {
      setIsRunProgressOpen(true);
      return;
    }

    if (runState.status === 'completed') {
      const timeout = setTimeout(() => setIsRunProgressOpen(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [runState]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputMessage);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) {
      return;
    }
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, runState]);

  useEffect(() => {
    if (!initialPrompt) {
      return;
    }
    if (initialPromptRef.current === initialPrompt) {
      return;
    }
    initialPromptRef.current = initialPrompt;
    setInputMessage(initialPrompt);
    handleSendMessage(initialPrompt);
    onInitialPromptConsumed?.();
  }, [handleSendMessage, initialPrompt, onInitialPromptConsumed]);
  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending':
        return <Icon icon="mdi:clock-outline" className="text-yellow-500 animate-pulse" />;
      case 'sent':
        return <Icon icon="mdi:check" className="text-green-500" />;
      case 'error':
        return <Icon icon="mdi:alert-circle" className="text-red-500" />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 h-full bg-background border-l border-border/50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:robot" className="text-xl text-primary" />
          <div>
            <h3 className="font-semibold">Azure AI Assistant</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
        <div className="ml-2">
          {isConnected ? (
            <Button size="sm" variant="ghost" onClick={() => disconnect()}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={() => connectWebSocket()}>
              Connect
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
        >
          <Icon icon="mdi:close" />
        </Button>
      </div>

      {runState?.runId && (
        <Accordion
          type="single"
          collapsible
          value={isRunProgressOpen ? 'run-progress' : ''}
          onValueChange={(value) => setIsRunProgressOpen(value === 'run-progress')}
        >
          <AccordionItem value="run-progress" className="border-border/50 bg-muted/10">
            <AccordionTrigger className="px-4 pt-3 text-xs uppercase tracking-wide text-muted-foreground text-left">
              <div className="flex w-full items-center justify-between">
                <span>
                  Well-Architected review {runState.status === 'running' ? 'in progress' : 'completed'}
                </span>
                <span className="font-mono text-[10px] opacity-60">{runState.runId}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0">
              <RunProgress runId={runState.runId} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">

          {messages.map((message) => {
            const structuredDiagram = message.meta?.diagram?.structured ?? null;
            const showArchitectureActions =
              message.role === 'assistant' &&
              (structuredDiagram || message.meta?.analysisResult || containsArchitecture(message.content));

            return (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <Card className={`max-w-[85%] p-3 ${
                  message.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}>
                  <div className="whitespace-pre-wrap text-sm prose prose-sm dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                  
                  {/* Visualization buttons for assistant messages with architecture */}
                  {showArchitectureActions && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const analysis = message.meta?.analysisResult;
                          if (structuredDiagram) {
                            visualizeArchitecture(message.content, false, structuredDiagram);
                            return;
                          }
                          if (!analysis) {
                            visualizeArchitecture(message.content, false);
                            return;
                          }

                          // Collect unique service names from the analysis (services + connection endpoints)
                          const nameSet = new Set<string>();
                          (analysis.services || []).forEach((s: string) => nameSet.add(s));
                          (analysis.connections || []).forEach((c: { from_service?: string; to_service?: string; label?: string }) => {
                            if (c.from_service) nameSet.add(c.from_service);
                            if (c.to_service) nameSet.add(c.to_service);
                          });

                          const allNames = Array.from(nameSet);
                          const unmapped: string[] = [];
                          const servicesArr: AzureService[] = [];
                          const nameToId = new Map<string, string>();

                          for (const name of allNames) {
                            const found = ArchitectureParser.findAzureServiceByName(name);
                            if (found) {
                              servicesArr.push(found);
                              nameToId.set(name, found.id);
                            } else {
                              // create a stub AzureService so the node will appear
                              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                              const stub: AzureService = {
                                id: `ai:${slug}`,
                                type: `ai.detected/${slug}`,
                                category: 'AI Detected',
                                categoryId: 'ai-detected',
                                title: name,
                                iconPath: '',
                                description: 'Detected by AI from diagram',
                              } as AzureService;
                              servicesArr.push(stub);
                              nameToId.set(name, stub.id);
                              unmapped.push(name);
                            }
                          }

                          // Build connections using ids (fallback to stub ids)
                          const connections = (analysis.connections || []).map((c: { from_service?: string; to_service?: string; label?: string }) => ({
                            from: nameToId.get(c.from_service || '') || `ai:${(c.from_service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                            to: nameToId.get(c.to_service || '') || `ai:${(c.to_service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                            label: c.label,
                          }));

                          const architecture: ParsedArchitecture = {
                            services: servicesArr,
                            connections,
                            layout: servicesArr.length <= 3 ? 'horizontal' : servicesArr.length <= 6 ? 'vertical' : 'grid'
                          };

                          const nodes = ArchitectureParser.generateNodes(architecture);
                          addNodesFromArchitecture(nodes, architecture.connections);
                          void persistDiagramState();

                          if (unmapped.length) {
                            toast({ title: 'Some detected services were unmapped', description: unmapped.slice(0,10).join(', ') });
                          }
                        }}
                        className="text-xs"
                      >
                        <Icon icon="mdi:diagram-outline" className="mr-1" />
                        Add to<br />Diagram
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const analysis = message.meta?.analysisResult;
                          if (structuredDiagram) {
                            visualizeArchitecture(message.content, true, structuredDiagram);
                            return;
                          }
                          if (!analysis) {
                            visualizeArchitecture(message.content, true);
                            return;
                          }

                          // Collect unique names (services + connection endpoints)
                          const nameSet = new Set<string>();
                          (analysis.services || []).forEach((s: string) => nameSet.add(s));
                          (analysis.connections || []).forEach((c: { from_service?: string; to_service?: string; label?: string }) => {
                            if (c.from_service) nameSet.add(c.from_service);
                            if (c.to_service) nameSet.add(c.to_service);
                          });

                          const allNames = Array.from(nameSet);
                          const unmapped: string[] = [];
                          const servicesArr: AzureService[] = [];
                          const nameToId = new Map<string, string>();

                          for (const name of allNames) {
                            const found = ArchitectureParser.findAzureServiceByName(name);
                            if (found) {
                              servicesArr.push(found);
                              nameToId.set(name, found.id);
                            } else {
                              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                              const stub: AzureService = {
                                id: `ai:${slug}`,
                                type: `ai.detected/${slug}`,
                                category: 'AI Detected',
                                categoryId: 'ai-detected',
                                title: name,
                                iconPath: '',
                                description: 'Detected by AI from diagram',
                              } as AzureService;
                              servicesArr.push(stub);
                              nameToId.set(name, stub.id);
                              unmapped.push(name);
                            }
                          }

                          const connections = (analysis.connections || []).map((c: { from_service?: string; to_service?: string; label?: string }) => ({
                            from: nameToId.get(c.from_service || '') || `ai:${(c.from_service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                            to: nameToId.get(c.to_service || '') || `ai:${(c.to_service || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                            label: c.label,
                          }));

                          const architecture: ParsedArchitecture = {
                            services: servicesArr,
                            connections,
                            layout: servicesArr.length <= 3 ? 'horizontal' : servicesArr.length <= 6 ? 'vertical' : 'grid'
                          };

                          const nodes = ArchitectureParser.generateNodes(architecture);
                          replaceDiagram(nodes, architecture.connections);
                          void persistDiagramState();

                          if (unmapped.length) {
                            toast({ title: 'Some detected services were unmapped', description: unmapped.slice(0,10).join(', ') });
                          }
                        }}
                        className="text-xs"
                      >
                        <Icon icon="mdi:refresh" className="mr-1" />
                        Replace<br />Diagram
                      </Button>
                    </div>
                  )}
                
                <div className={`flex items-center justify-between mt-2 text-xs ${
                  message.role === 'user' 
                    ? 'text-primary-foreground/70' 
                    : 'text-muted-foreground'
                }`}>
                  <span>{formatTimestamp(message.timestamp)}</span>
                  {message.role === 'user' && getStatusIcon(message.status)}
                </div>
              </Card>
            </div>
          );
        })}
          
          {isTyping && (
            <div className="flex justify-start">
              <Card className="bg-muted p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                  Assistant is typing...
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Image Upload Section */}
      {showImageUpload && (
        <div className="p-4 border-t">
          <ImageUpload
                onAnalysisComplete={(result) => {
                  toast({
                    title: "Diagram Analyzed",
                    description: `Found ${result.services.length} services in your diagram!`,
                  });
                  // Push the assistant's analysis description into the chat so users see it
                  console.log('Image analysis completed, result preview:', {
                    services: result.services?.slice?.(0, 10),
                    connections: result.connections?.slice?.(0, 10),
                    description: result.description?.slice?.(0, 200)
                  });
                  if (typeof addAssistantMessage === 'function') {
                      const meta = { analysisResult: result };
                      if (result.description) {
                        console.log('Adding assistant message from analysis description with meta');
                        addAssistantMessage(result.description, meta);
                        toast({ title: 'Assistant message added', description: result.description.slice(0, 200) });
                      } else {
                        console.log('Adding assistant message with summary fallback and meta');
                        const summary = `Analyzed diagram: found ${result.services.length} services.`;
                        addAssistantMessage(summary, meta);
                        toast({ title: 'Assistant message added', description: summary });
                      }
                  } else {
                    console.error('addAssistantMessage is not available on useChat hook');
                  }
                  setShowImageUpload(false);
                }}
                onDiagramUpdated={() => void persistDiagramState()}
          />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowImageUpload(!showImageUpload)}
            className="shrink-0"
          >
            <Icon icon={showImageUpload ? "mdi:close" : "mdi:image-plus"} />
          </Button>
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about Azure architecture or upload a diagram..."
            className="flex-1"
            disabled={isTyping}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputMessage.trim() || isTyping}
          >
            <Icon icon="mdi:send" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for a new line. Click the image button to upload diagrams.
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;

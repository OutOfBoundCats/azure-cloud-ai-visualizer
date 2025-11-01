import { useState, useCallback, useRef, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getProjectById,
  updateProjectAzureConversationId,
  upsertConversationMessage,
} from '@/services/projectService';
import { ArchitectureParser, type ParsedArchitecture } from '@/services/architectureParser';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  meta?: ChatMeta;
}

export type ChatMeta = {
  analysisResult?: {
    services?: string[];
    connections?: { from_service: string; to_service: string; label?: string }[];
    description?: string;
  };
  diagram?: {
    structured?: ParsedArchitecture | null;
    raw?: string | null;
    runId?: string;
  };
  iac?: {
    bicep?: {
      bicep_code?: string;
      parameters?: Record<string, unknown> | null;
      [key: string]: unknown;
    } | null;
    terraform?: {
      terraform_code?: string;
      parameters?: Record<string, unknown> | null;
      [key: string]: unknown;
    } | null;
  };
};

export interface UseChatOptions {
  onError?: (error: Error) => void;
  apiUrl?: string;
  wsUrl?: string;
  supabase?: SupabaseClient;
  projectId?: string;
  teamMode?: boolean;
}

type RunStatus = 'running' | 'completed';

export interface RunState {
  runId: string;
  status: RunStatus;
  startedAt: Date;
  completedAt?: Date;
}

interface DiagramUpdate {
  messageId: string;
  runId?: string;
  architecture: ParsedArchitecture | null;
  raw?: string | null;
  messageText: string;
  receivedAt: Date;
  iac?: ChatMeta['iac'];
}

const GREETING_MESSAGE =
  "Hello! I'm your Azure Architect AI assistant. I can help you design cloud architectures, generate Infrastructure as Code, and analyze your diagrams. How can I assist you today?";
const RECENT_CONTEXT_LIMIT = 8;

const buildSummary = (history: ChatMessage[]) => {
  const recent = history.slice(-RECENT_CONTEXT_LIMIT);
  const summary = recent
    .map((msg) => {
      const speaker = msg.role === 'assistant' ? 'Assistant' : msg.role === 'user' ? 'User' : 'System';
      return `${speaker}: ${msg.content}`;
    })
    .join('\n');

  return {
    summary,
    recent_messages: recent.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };
};

export const useChat = (options: UseChatOptions = {}) => {
  const {
    onError,
    apiUrl = 'http://localhost:8000/api/chat',
    wsUrl = 'ws://localhost:8000/ws/chat',
    supabase,
    projectId,
    teamMode = true,
  } = options;

  const createGreetingMessage = useCallback(
    (): ChatMessage => ({
      id: 'greeting',
      role: 'assistant',
      content: GREETING_MESSAGE,
      timestamp: new Date(),
      status: 'sent',
    }),
    []
  );

  const [messages, setMessages] = useState<ChatMessage[]>([createGreetingMessage()]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef<Promise<void> | null>(null);
  const [azureConversationId, setAzureConversationId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [latestDiagram, setLatestDiagram] = useState<DiagramUpdate | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);

  const persistMessage = useCallback(
    async (message: ChatMessage, explicitConversationId?: string | null) => {
      if (!supabase || !projectId) {
        return;
      }
      try {
        await upsertConversationMessage(supabase, {
          projectId,
          role: message.role,
          content: message.content,
          azureConversationId: explicitConversationId ?? azureConversationId,
        });
      } catch (error) {
        console.error('Failed to persist conversation message', error);
      }
    },
    [azureConversationId, projectId, supabase]
  );

  const syncAzureConversationId = useCallback(
    async (incomingId: string) => {
      if (!supabase || !projectId) {
        return;
      }
      try {
        await updateProjectAzureConversationId(supabase, projectId, incomingId);
        await supabase
          .from('conversations')
          .update({ azure_conversation_id: incomingId })
          .eq('project_id', projectId)
          .is('azure_conversation_id', null);
      } catch (error) {
        console.error('Failed to sync Azure conversation id', error);
      }
    },
    [projectId, supabase]
  );

  const handleSocketMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        const type = typeof data.type === 'string' ? data.type : undefined;

        if (type === 'message') {
          const content = typeof data.content === 'string' ? data.content : '';
          const assistantMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content,
            timestamp: new Date(),
            status: 'sent',
          };
          setMessages((prev) => [...prev, assistantMessage]);
          void persistMessage(assistantMessage, azureConversationId);
          setIsTyping(false);
          return;
        }

        if (type === 'typing') {
          setIsTyping(Boolean(data.typing));
          return;
        }

        if (type === 'run_started') {
          const runId = typeof data.run_id === 'string' ? data.run_id : undefined;
          if (runId) {
            setRunState({ runId, status: 'running', startedAt: new Date() });
            setIsTyping(true);
          }
          return;
        }

        if (type === 'trace_event') {
          const runId = typeof data.run_id === 'string' ? data.run_id : undefined;
          if (runId) {
            setRunState((prev) => {
              if (!prev || prev.runId !== runId) {
                return { runId, status: 'running', startedAt: new Date() };
              }
              return prev;
            });
          }
          return;
        }

        if (type === 'team_final') {
          const messageText = typeof data.message === 'string' ? data.message : '';
          const runId = typeof data.run_id === 'string' ? data.run_id : undefined;
          const rawDiagram = typeof data.diagram_raw === 'string' ? data.diagram_raw : undefined;
          const diagramPayload = data.diagram;
          const iacPayloadRaw = data.iac;

          let structuredDiagram: ParsedArchitecture | null = null;
          if (diagramPayload && typeof diagramPayload === 'object') {
            try {
              structuredDiagram = ArchitectureParser.parseStructuredDiagram(diagramPayload) ?? null;
            } catch (error) {
              console.warn('[useChat] Failed to interpret structured diagram payload object', error);
            }
          }

          if (!structuredDiagram && rawDiagram) {
            try {
              const parsedRaw = JSON.parse(rawDiagram);
              structuredDiagram = ArchitectureParser.parseStructuredDiagram(parsedRaw) ?? null;
            } catch (error) {
              console.warn('[useChat] Failed to parse raw diagram JSON string', error);
            }
          }

          if (!structuredDiagram && diagramPayload && typeof diagramPayload === 'string') {
            try {
              const parsedPayload = JSON.parse(diagramPayload);
              structuredDiagram = ArchitectureParser.parseStructuredDiagram(parsedPayload) ?? null;
            } catch (error) {
              console.warn('[useChat] Failed to parse string diagram payload', error);
            }
          }

          let iacPayload: ChatMeta['iac'] | undefined;
          if (iacPayloadRaw && typeof iacPayloadRaw === 'object') {
            const rawBicep = (iacPayloadRaw as Record<string, unknown>).bicep;
            const rawTerraform = (iacPayloadRaw as Record<string, unknown>).terraform;
            const bicep =
              rawBicep && typeof rawBicep === 'object'
                ? (rawBicep as Record<string, unknown>)
                : undefined;
            const terraform =
              rawTerraform && typeof rawTerraform === 'object'
                ? (rawTerraform as Record<string, unknown>)
                : undefined;
            if (bicep || terraform) {
              iacPayload = {
                bicep: bicep as ChatMeta['iac']['bicep'],
                terraform: terraform as ChatMeta['iac']['terraform'],
              };
            }
          }

          const messageId = (Date.now() + 1).toString();
          const assistantMessage: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: messageText || 'No response received',
            timestamp: new Date(),
            status: 'sent',
            meta:
              structuredDiagram || rawDiagram || iacPayload
                ? {
                    diagram: {
                      structured: structuredDiagram,
                      raw: rawDiagram ?? null,
                      runId,
                    },
                    iac: iacPayload,
                  }
                : undefined,
          };
          setMessages((prev) => {
            const patched = prev.map((msg) =>
              msg.id === lastUserMessageRef.current ? { ...msg, status: 'sent' as const } : msg
            );
            return [...patched, assistantMessage];
          });
          void persistMessage(assistantMessage);
          lastUserMessageRef.current = null;
          setIsTyping(false);
          if (runId) {
            setRunState((prev) =>
              prev && prev.runId === runId ? { ...prev, status: 'completed', completedAt: new Date() } : prev
            );
          }
          if (structuredDiagram) {
            console.log('[useChat] Received structured diagram payload', {
              services: structuredDiagram.services.length,
              connections: structuredDiagram.connections.length,
              groups: structuredDiagram.groups?.length ?? 0,
            });
          }
          setLatestDiagram({
            messageId,
            runId,
            architecture: structuredDiagram,
            raw: rawDiagram ?? null,
            messageText,
            receivedAt: new Date(),
            iac: iacPayload,
          });
          return;
        }

        if (type === 'run_completed') {
          const runId = typeof data.run_id === 'string' ? data.run_id : undefined;
          if (runId) {
            setRunState((prev) =>
              prev && prev.runId === runId ? { ...prev, status: 'completed', completedAt: new Date() } : prev
            );
          }
          setIsTyping(false);
          return;
        }

        if (type === 'error') {
          const errorMessage = typeof data.message === 'string' ? data.message : 'Unknown error';
          console.error('WebSocket error message:', errorMessage);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === lastUserMessageRef.current ? { ...msg, status: 'error' as const } : msg
            )
          );
          setIsTyping(false);
          onError?.(new Error(errorMessage));
          lastUserMessageRef.current = null;
          setRunState((prev) => (prev ? { ...prev, status: 'completed', completedAt: new Date() } : prev));
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    [onError, persistMessage]
  );

  const connectWebSocket = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsConnected(true);
      return;
    }

    if (connectingRef.current) {
      return connectingRef.current;
    }

    console.log(`Attempting to connect to WebSocket: ${wsUrl}`);
    connectingRef.current = new Promise<void>((resolve, reject) => {
      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          setIsConnected(true);
          connectingRef.current = null;
          console.log('✔ WebSocket connected successfully');
          resolve();
        };

        socket.onmessage = (event) => handleSocketMessage(event as MessageEvent<string>);

        socket.onerror = (error) => {
          console.error('⚠ WebSocket error details:', {
            error,
            readyState: socket.readyState,
            url: wsUrl,
            protocols: socket.protocol,
          });
          setIsConnected(false);
          if (socket.readyState !== WebSocket.OPEN) {
            connectingRef.current = null;
            reject(new Error('WebSocket connection failed'));
          }
        };

        socket.onclose = (event) => {
          setIsConnected(false);
          connectingRef.current = null;
          console.log('ℹ WebSocket disconnected:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
        };
      } catch (error) {
        console.error('⚠ Failed to create WebSocket:', error);
        connectingRef.current = null;
        setIsConnected(false);
        reject(error as Error);
      }
    });

    return connectingRef.current;
  }, [handleSocketMessage, wsUrl]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connectingRef.current = null;
    setIsConnected(false);
    setRunState(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string, opts?: { useTeam?: boolean }) => {
      if (!content.trim()) {
        return;
      }

      const trimmed = content.trim();
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        status: 'sending',
      };

      setMessages((prev) => [...prev, userMessage]);
      void persistMessage(userMessage, azureConversationId);
      setIsTyping(true);
      lastUserMessageRef.current = userMessage.id;

      const useTeamPath = opts?.useTeam ?? teamMode;
      if (useTeamPath) {
        try {
          await connectWebSocket();
          const payload: Record<string, unknown> = {
            type: 'team_stream_chat',
            message: trimmed,
            conversation_id: azureConversationId ?? undefined,
            context: buildSummary([...messages, userMessage]),
          };
          wsRef.current?.send(JSON.stringify(payload));
          return;
        } catch (error) {
          console.warn('Falling back to REST API after WebSocket failure', error);
        }
      }

      try {
        console.log('[chat] Sending message via REST API');
        const targetUrl = projectId ? `${apiUrl}?project_id=${encodeURIComponent(projectId)}` : apiUrl;
        const conversationHistory = [...messages, userMessage].map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        const contextPayload = {
          ...buildSummary([...messages, userMessage]),
          azure_conversation_id: azureConversationId ?? undefined,
        };

        setRunState(null);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: trimmed,
            conversation_id: azureConversationId ?? undefined,
            conversation_history: conversationHistory,
            context: contextPayload,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error:', response.status, errorText);
          throw new Error('Failed to send message');
        }

        const data = await response.json();
        console.log('[chat] Received response:', data);

        const resolvedConversationId =
          (typeof data.conversation_id === 'string' && data.conversation_id) || azureConversationId;

        if (resolvedConversationId && resolvedConversationId !== azureConversationId) {
          setAzureConversationId(resolvedConversationId);
          void syncAzureConversationId(resolvedConversationId);
        }

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message?.content || data.response || data.message || 'No response received',
          timestamp: new Date(),
          status: 'sent',
        };

        setMessages((prev) => [
          ...prev.map((msg) => (msg.id === userMessage.id ? { ...msg, status: 'sent' as const } : msg)),
          assistantMessage,
        ]);
        void persistMessage(assistantMessage, resolvedConversationId);
        setIsTyping(false);
        lastUserMessageRef.current = null;
      } catch (error) {
        console.error('Error sending message:', error);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === userMessage.id ? { ...msg, status: 'error' } : msg))
        );
        setIsTyping(false);
        onError?.(error as Error);
        lastUserMessageRef.current = null;
      }
    },
    [
      apiUrl,
      azureConversationId,
      connectWebSocket,
      messages,
      onError,
      persistMessage,
      projectId,
      syncAzureConversationId,
      teamMode,
    ]
  );

  const clearMessages = useCallback(() => {
    setMessages([createGreetingMessage()]);
    setAzureConversationId(null);
    setLatestDiagram(null);
  }, [createGreetingMessage]);

  const addAssistantMessage = useCallback(
    (content: string, meta?: ChatMeta) => {
      if (!content) return;
      const msg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        status: 'sent',
        meta,
      };
      setMessages((prev) => [...prev, msg]);
      void persistMessage(msg, azureConversationId);
    },
    [persistMessage]
  );

  useEffect(() => {
    if (!supabase || !projectId) {
      setAzureConversationId(null);
      setMessages([createGreetingMessage()]);
      return;
    }

    let isCurrent = true;
    const loadConversation = async () => {
      try {
        const [projectResult, conversationResult] = await Promise.all([
          getProjectById(supabase, projectId).catch((error) => {
            console.error('Failed to load project for chat', error);
            return null;
          }),
          supabase
            .from('conversations')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true }),
        ]);

        if (!isCurrent) return;

        if (projectResult?.azure_conversation_id) {
          setAzureConversationId(projectResult.azure_conversation_id);
        }

        if (conversationResult.error) {
          throw conversationResult.error;
        }

        const rows = (conversationResult.data ?? []) as {
          id: string;
          project_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          created_at: string;
          azure_conversation_id: string | null;
        }[];

        if (!projectResult?.azure_conversation_id) {
          const rowConversationId = rows.find((row) => row.azure_conversation_id)?.azure_conversation_id ?? null;
          if (rowConversationId) {
            setAzureConversationId(rowConversationId);
          }
        }

        if (rows.length === 0) {
          setMessages([createGreetingMessage()]);
          return;
        }

        const restored = rows.map((row) => ({
          id: row.id ?? crypto.randomUUID(),
          role: row.role,
          content: row.content ?? '',
          timestamp: row.created_at ? new Date(row.created_at) : new Date(),
          status: 'sent' as const,
        }));

        setMessages(restored);
      } catch (error) {
        console.error('Unexpected error loading conversation history', error);
        setMessages([createGreetingMessage()]);
      }
    };

    void loadConversation();

    return () => {
      isCurrent = false;
    };
  }, [createGreetingMessage, projectId, supabase]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      connectingRef.current = null;
    };
  }, []);

  return {
    messages,
    isConnected,
    isTyping,
    sendMessage,
    connectWebSocket,
    disconnect,
    clearMessages,
    addAssistantMessage,
    runState,
    latestDiagram,
  };
};

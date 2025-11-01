import type { SupabaseClient } from '@supabase/supabase-js';
import type { Edge, Node as RFNode } from '@xyflow/react';

export interface ProjectDiagramState {
  nodes: RFNode[];
  edges: Edge[];
  saved_at: string;
}

export interface ProjectRecord {
  id: string;
  title: string;
  description: string | null;
  prompt: string | null;
  cover_url: string | null;
  user_id: string | null;
  azure_conversation_id: string | null;
  diagram_state: ProjectDiagramState | null;
  bicep_template: string | null;
  bicep_parameters: Record<string, unknown> | null;
  terraform_template: string | null;
  terraform_parameters: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationRecord {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  azure_conversation_id: string | null;
  created_at: string;
}

export const createProjectWithPrompt = async (
  supabase: SupabaseClient,
  options: {
    prompt: string;
    userId: string | null;
    title?: string;
    coverFile?: File | null;
    diagramState?: ProjectDiagramState | null;
  }
) => {
  const title = options.title?.trim() || options.prompt.slice(0, 60);

  let coverUrl: string | null = null;
  if (options.coverFile) {
    const fileExt = options.coverFile.name.split('.').pop() || 'png';
    const filePath = `project-covers/${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('project-assets').upload(filePath, options.coverFile, {
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadError) {
      throw uploadError;
    }
    const { data: publicUrl } = supabase.storage.from('project-assets').getPublicUrl(filePath);
    coverUrl = publicUrl.publicUrl;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      title,
      description: null,
      prompt: options.prompt,
      cover_url: coverUrl,
      user_id: options.userId,
      azure_conversation_id: null,
      diagram_state: options.diagramState ?? null,
      bicep_template: null,
      bicep_parameters: null,
      terraform_template: null,
      terraform_parameters: null,
    })
    .select()
    .single<ProjectRecord>();

  if (error || !data) {
    throw error || new Error('Failed to create project');
  }

  return data;
};

export const listRecentProjects = async (supabase: SupabaseClient, userId: string | null) => {
  const query = supabase.from('projects').select('*').order('updated_at', { ascending: false }).limit(12);
  if (userId) {
    query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data as ProjectRecord[]) ?? [];
};

export const getProjectById = async (supabase: SupabaseClient, projectId: string) => {
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single<ProjectRecord>();
  if (error) {
    throw error;
  }
  return data;
};

export const updateProjectAzureConversationId = async (
  supabase: SupabaseClient,
  projectId: string,
  azureConversationId: string
) => {
  const { data, error } = await supabase
    .from('projects')
    .update({ azure_conversation_id: azureConversationId })
    .eq('id', projectId)
    .select()
    .single<ProjectRecord>();
  if (error) {
    throw error;
  }
  return data;
};

export const updateProjectTitle = async (
  supabase: SupabaseClient,
  projectId: string,
  title: string
) => {
  const { data, error } = await supabase
    .from('projects')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select()
    .single<ProjectRecord>();

  if (error) {
    throw error;
  }

  return data;
};

export const deleteProject = async (supabase: SupabaseClient, projectId: string) => {
  // Delete the project row. Caller should ensure permissions and cleanup of related resources if needed.
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) {
    throw error;
  }
  return true;
};

export const upsertConversationMessage = async (
  supabase: SupabaseClient,
  options: {
    projectId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    azureConversationId?: string | null;
  }
) => {
  const { error } = await supabase.from('conversations').insert({
    project_id: options.projectId,
    role: options.role,
    content: options.content,
    azure_conversation_id: options.azureConversationId ?? null,
  });
  if (error) {
    throw error;
  }
};

export const saveProjectDiagramState = async (
  supabase: SupabaseClient,
  projectId: string,
  diagramState: ProjectDiagramState
) => {
  const { error } = await supabase
    .from('projects')
    .update({
      diagram_state: diagramState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) {
    throw error;
  }
};

export const updateProjectBicepTemplate = async (
  supabase: SupabaseClient,
  projectId: string,
  template: string | null,
  parameters?: Record<string, unknown> | null
) => {
  const { error } = await supabase
    .from('projects')
    .update({
      bicep_template: template,
      bicep_parameters: parameters ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (error) {
    throw error;
  }
};

export const updateProjectIacTemplates = async (
  supabase: SupabaseClient,
  projectId: string,
  options: {
    bicepTemplate?: string | null;
    bicepParameters?: Record<string, unknown> | null;
    terraformTemplate?: string | null;
    terraformParameters?: Record<string, unknown> | null;
  }
) => {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('bicepTemplate' in options) {
    payload.bicep_template = options.bicepTemplate ?? null;
  }
  if ('bicepParameters' in options) {
    payload.bicep_parameters = options.bicepParameters ?? null;
  }
  if ('terraformTemplate' in options) {
    payload.terraform_template = options.terraformTemplate ?? null;
  }
  if ('terraformParameters' in options) {
    payload.terraform_parameters = options.terraformParameters ?? null;
  }

  if (Object.keys(payload).length <= 1) {
    // Nothing to update besides updated_at guard.
    return;
  }

  const { error } = await supabase.from('projects').update(payload).eq('id', projectId);
  if (error) {
    throw error;
  }
};

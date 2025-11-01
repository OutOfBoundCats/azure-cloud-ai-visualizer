# Supabase Setup for Cloud Visualizer Pro

The prompt-first landing page, project gallery, and persistent chat history rely on Supabase for authentication and storage. This document explains the schema, creation script, and data flow that keep the Azure Architect agent in sync with your workspace.

## 1. Environment Variables

Add the following keys to your frontend environment (for Vite use `.env.local` or `.env.development`):

```bash
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

These values are available in the Supabase dashboard under **Project Settings -> API**.

## 2. SQL Schema

Run the script below in the Supabase SQL editor. It creates the tables, storage bucket, and helpful indexes required by the app.

```sql
-- Projects capture the prompt-first workspace metadata that powers the landing gallery.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  prompt text,
  cover_url text,
  user_id uuid,
  azure_conversation_id text,
  diagram_state jsonb,
  bicep_template text,
  bicep_parameters jsonb,
  terraform_template text,
  terraform_parameters jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

-- Conversations store the full chat history for a project, including the Azure agent thread id.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  azure_conversation_id text,
  created_at timestamptz not null default now()
);

create index if not exists conversations_project_id_idx on public.conversations (project_id, created_at);
create index if not exists conversations_azure_conversation_idx on public.conversations (azure_conversation_id);

-- Storage bucket for optional cover images attached on the landing page prompt UI.
insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', true)
on conflict (id) do nothing;
```

If you created the `projects` table before diagram persistence was introduced, run the following once to add the new column:

```sql
alter table public.projects
  add column if not exists diagram_state jsonb,
  add column if not exists bicep_template text,
  add column if not exists bicep_parameters jsonb,
  add column if not exists terraform_template text,
  add column if not exists terraform_parameters jsonb;
```

### Row-Level Security (Optional but Recommended)

If you enable RLS, add policies similar to the following to allow authenticated users to manage their own data while keeping anonymous demos read-only:

```sql
alter table public.projects enable row level security;
alter table public.conversations enable row level security;

create policy "Users can view their projects"
  on public.projects for select
  using (auth.uid() = user_id or user_id is null);

create policy "Users can insert/update their projects"
  on public.projects for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

create policy "Users can manage conversation history"
  on public.conversations for all
  using (
    auth.uid() = (
      select user_id from public.projects p where p.id = project_id
    ) or (
      select user_id from public.projects p where p.id = project_id
    ) is null
  )
  with check (
    auth.uid() = (
      select user_id from public.projects p where p.id = project_id
    ) or (
      select user_id from public.projects p where p.id = project_id
    ) is null
  );
```

Adjust the policies if you require stricter access controls.

## 3. How the Frontend Uses Supabase

1. **Landing Prompt -> Project Creation**  
   `createProjectWithPrompt` inserts a project row and optionally uploads a cover image into the `project-assets` bucket.

2. **Project Gallery**  
   `listRecentProjects` queries the latest projects for the signed-in user (or all public projects when unauthenticated) and renders the cards on the front page.

3. **Chat and Azure Conversation Thread**  
   - When you open a project, `useChat` fetches both project metadata and the associated `conversations` rows.  
   - On the first successful agent response, the Azure conversation/thread id returned by the backend is written to `projects.azure_conversation_id` and echoed onto any conversation rows where it was previously `NULL`.  
   - Subsequent messages reuse the same Azure conversation id, keeping the Microsoft Agent Framework thread alive across sessions without relying on `localStorage`.

4. **Context Summary to the Agent**  
   Each chat turn submits a compact summary of the recent conversation (limited to the last eight messages) through the backend `context` payload. This mirrors the thread management patterns described in `maf.md` and lets the agent continue diagram generation with awareness of prior steps even if the Azure thread has to be rehydrated.

5. **Auth Providers**  
   GitHub OAuth can be enabled in **Authentication -> Providers** in the Supabase dashboard. Once active, the "Sign in with GitHub" action on the landing page uses Supabase's OAuth flow automatically.

## 4. Local Development Tips

- The app degrades gracefully when Supabase keys are not provided: you can still explore the landing page and prompt UX without persistence.
- To seed demo projects, run insert statements against the `projects` table. Sample cover art can be dropped into the `project-assets` bucket using the Supabase dashboard or `supabase storage upload`.
- When running automated tests (`npm run test`), Supabase calls are mocked via Vitest to keep the suite deterministic.

You're ready to run the new prompt-first workflow end-to-end once the schema and environment variables are in place. Enjoy architecting!

-- Adds Terraform persistence columns for projects table.
alter table if exists public.projects
  add column if not exists terraform_template text,
  add column if not exists terraform_parameters jsonb;

-- Backfill existing rows with NULLs to avoid leaving junk values.
update public.projects
   set terraform_template = terraform_template,
       terraform_parameters = terraform_parameters;

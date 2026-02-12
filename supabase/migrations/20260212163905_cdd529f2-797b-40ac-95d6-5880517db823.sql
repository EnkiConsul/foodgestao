-- Add profile_type column to companies table
ALTER TABLE public.companies
ADD COLUMN profile_type text NOT NULL DEFAULT 'empresarial'
CHECK (profile_type IN ('pessoal', 'empresarial'));
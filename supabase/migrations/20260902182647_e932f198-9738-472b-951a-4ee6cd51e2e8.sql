ALTER TABLE public.companies
  ALTER COLUMN profile_type SET DEFAULT 'empresarial';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_profile_type_empresarial_chk
  CHECK (profile_type = 'empresarial');
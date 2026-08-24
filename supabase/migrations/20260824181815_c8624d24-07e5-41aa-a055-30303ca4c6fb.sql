ALTER TABLE public.companies DISABLE TRIGGER USER;

UPDATE public.companies
SET user_id = '0b385a24-dd98-4ac9-88a4-3bc18e669e90', updated_at = now()
WHERE id = 'bab7a4ac-0b95-4b69-ba18-ac862bfb038b';

ALTER TABLE public.companies ENABLE TRIGGER USER;

INSERT INTO public.company_members (company_id, user_id, role)
VALUES ('bab7a4ac-0b95-4b69-ba18-ac862bfb038b', '0b385a24-dd98-4ac9-88a4-3bc18e669e90', 'owner')
ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner';

UPDATE public.company_members
SET role = 'admin'
WHERE company_id = 'bab7a4ac-0b95-4b69-ba18-ac862bfb038b'
  AND user_id = '9bde0e92-f331-4e8a-97d9-ba18068c2f99';

UPDATE public.profiles
SET onboarding_completed = true, updated_at = now()
WHERE user_id = '0b385a24-dd98-4ac9-88a4-3bc18e669e90';
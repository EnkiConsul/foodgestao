-- Historical data repair for one existing tenant. A clean database has no target row.
DO $repair$
DECLARE
  target_company constant uuid := 'bab7a4ac-0b95-4b69-ba18-ac862bfb038b';
  target_owner constant uuid := '0b385a24-dd98-4ac9-88a4-3bc18e669e90';
  former_owner constant uuid := '9bde0e92-f331-4e8a-97d9-ba18068c2f99';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_owner) THEN
    RAISE EXCEPTION 'Target owner is missing for historical company repair';
  END IF;

  ALTER TABLE public.companies DISABLE TRIGGER USER;

  UPDATE public.companies
  SET user_id = target_owner, updated_at = now()
  WHERE id = target_company;

  ALTER TABLE public.companies ENABLE TRIGGER USER;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (target_company, target_owner, 'owner')
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner';

  UPDATE public.company_members
  SET role = 'admin'
  WHERE company_id = target_company
    AND user_id = former_owner;

  UPDATE public.profiles
  SET onboarding_completed = true, updated_at = now()
  WHERE user_id = target_owner;
END
$repair$;

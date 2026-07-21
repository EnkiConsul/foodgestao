
CREATE OR REPLACE FUNCTION public.prevent_company_id_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Alteração de company_id não permitida (cross-tenant transfer bloqueado)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budgets','transactions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_company_id_transfer_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER prevent_company_id_transfer_trg BEFORE UPDATE OF company_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_company_id_transfer()',
      t
    );
  END LOOP;
END $$;

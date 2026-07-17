
CREATE OR REPLACE FUNCTION public.prevent_company_ownership_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Ownership transfer is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_company_ownership_transfer_trg ON public.companies;
CREATE TRIGGER prevent_company_ownership_transfer_trg
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.prevent_company_ownership_transfer();

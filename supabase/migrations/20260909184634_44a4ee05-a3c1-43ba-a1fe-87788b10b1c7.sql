CREATE OR REPLACE FUNCTION public.prevent_company_ownership_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _jwt_role text;
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    _jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );
    IF _jwt_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF auth.uid() IS NULL THEN
      -- contexto sem usuário (service role / manutenção interna)
      RETURN NEW;
    END IF;
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Ownership transfer is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.seed_default_contacts(_user_id uuid, _company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fornecedor_id uuid;
  _cliente_id uuid;
BEGIN
  SELECT id INTO _fornecedor_id
    FROM public.contacts
   WHERE user_id = _user_id
     AND contact_type = 'fornecedor'
     AND name = 'Fornecedor Diversos'
   LIMIT 1;

  IF _fornecedor_id IS NULL THEN
    INSERT INTO public.contacts (user_id, name, contact_type, is_active, visible_pf)
    VALUES (_user_id, 'Fornecedor Diversos', 'fornecedor', true, false)
    RETURNING id INTO _fornecedor_id;
  END IF;

  SELECT id INTO _cliente_id
    FROM public.contacts
   WHERE user_id = _user_id
     AND contact_type = 'cliente'
     AND name = 'Clientes Diversos'
   LIMIT 1;

  IF _cliente_id IS NULL THEN
    INSERT INTO public.contacts (user_id, name, contact_type, is_active, visible_pf)
    VALUES (_user_id, 'Clientes Diversos', 'cliente', true, false)
    RETURNING id INTO _cliente_id;
  END IF;

  INSERT INTO public.contact_companies (contact_id, company_id)
  VALUES (_fornecedor_id, _company_id), (_cliente_id, _company_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_contacts_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_default_contacts(NEW.user_id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_default_contacts_on_company failed for company %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_contacts_on_company ON public.companies;
CREATE TRIGGER trg_seed_default_contacts_on_company
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.seed_default_contacts_on_company();
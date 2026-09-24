ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS perfil text NOT NULL DEFAULT 'personalizado',
  ADD COLUMN IF NOT EXISTS modulos jsonb NOT NULL DEFAULT '{"financeiro":true,"pessoas":true,"conta":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS ver_saldos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ver_salarios boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS situacao text NOT NULL DEFAULT 'ativo';

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS perfil text NOT NULL DEFAULT 'personalizado',
  ADD COLUMN IF NOT EXISTS modulos jsonb NOT NULL DEFAULT '{"financeiro":true,"pessoas":true,"conta":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS ver_saldos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ver_salarios boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

ALTER TABLE public.company_invites ALTER COLUMN invited_email DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.company_access_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.perfil NOT IN ('dono','administrador','gerente','assistente_financeiro','rh_dp','colaborador','contabilidade','visualizador','personalizado') THEN
    RAISE EXCEPTION 'Perfil inválido: %', NEW.perfil USING ERRCODE = '22023';
  END IF;
  IF TG_TABLE_NAME = 'company_members' AND NEW.situacao NOT IN ('ativo','bloqueado') THEN
    RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023';
  END IF;
  IF TG_TABLE_NAME = 'company_invites' THEN
    IF NEW.full_name IS NOT NULL THEN NEW.full_name := upper(btrim(NEW.full_name)); END IF;
    IF NEW.whatsapp IS NOT NULL THEN NEW.whatsapp := regexp_replace(NEW.whatsapp, '\D', '', 'g'); END IF;
    IF NEW.invited_email IS NOT NULL THEN NEW.invited_email := nullif(lower(btrim(NEW.invited_email)), ''); END IF;
    IF NEW.invited_email IS NULL AND (NEW.whatsapp IS NULL OR length(NEW.whatsapp) NOT IN (10,11)) THEN
      RAISE EXCEPTION 'Informe um WhatsApp válido ou um e-mail' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF jsonb_typeof(NEW.modulos) <> 'object' THEN
    RAISE EXCEPTION 'Módulos inválidos' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_company_members_access_validate ON public.company_members;
CREATE TRIGGER trg_company_members_access_validate BEFORE INSERT OR UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.company_access_validate();
DROP TRIGGER IF EXISTS trg_company_invites_access_validate ON public.company_invites;
CREATE TRIGGER trg_company_invites_access_validate BEFORE INSERT OR UPDATE ON public.company_invites
  FOR EACH ROW EXECUTE FUNCTION public.company_access_validate();

-- nível: 0 sem acesso, 1 consulta, 2 inclusão, 3 alteração, 4 total
CREATE OR REPLACE FUNCTION public.nivel_permissao_valor(_v text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _v
    WHEN 'none' THEN 0 WHEN 'consulta' THEN 1 WHEN 'view' THEN 1
    WHEN 'inclusao' THEN 2 WHEN 'alteracao' THEN 3
    WHEN 'total' THEN 4 WHEN 'edit' THEN 4 ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.tem_permissao(_company_id uuid, _item text, _nivel text DEFAULT 'consulta')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; _mod text; _req int; _atual int;
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL OR _item IS NULL THEN RETURN false; END IF;
  _req := coalesce(public.nivel_permissao_valor(_nivel), 4);
  SELECT role::text AS role, permissions, modulos, situacao INTO m
    FROM public.company_members WHERE company_id = _company_id AND user_id = auth.uid();
  IF NOT FOUND OR m.situacao <> 'ativo' THEN RETURN false; END IF;
  IF m.role IN ('owner','admin') THEN RETURN true; END IF;
  _mod := CASE WHEN _item LIKE 'dp.%' THEN 'pessoas' WHEN _item LIKE 'conta.%' THEN 'conta' ELSE 'financeiro' END;
  IF coalesce((m.modulos ->> _mod)::boolean, false) = false THEN RETURN false; END IF;
  IF m.role = 'viewer' OR m.role = 'contabilidade' THEN RETURN _req <= 1 AND _mod = 'financeiro'; END IF;
  _atual := coalesce(public.nivel_permissao_valor(m.permissions ->> regexp_replace(_item, '^(fin|dp|conta)\.', '')),
                     public.nivel_permissao_valor(m.permissions ->> _item), 0);
  RETURN _atual >= _req;
END $$;

REVOKE ALL ON FUNCTION public.tem_permissao(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_permissao(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_access_validate() FROM PUBLIC, anon, authenticated;

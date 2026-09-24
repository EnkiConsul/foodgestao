CREATE OR REPLACE FUNCTION private.member_permission(_user_id uuid, _company_id uuid, _module text)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
  SELECT CASE
    WHEN cm.situacao <> 'ativo' THEN 'none'
    WHEN cm.role IN ('owner','admin') THEN 'edit'
    WHEN coalesce((cm.modulos ->> CASE WHEN _module LIKE 'dp.%' THEN 'pessoas' WHEN _module LIKE 'conta.%' THEN 'conta' ELSE 'financeiro' END)::boolean, true) = false THEN 'none'
    WHEN cm.role = 'viewer' THEN 'view'
    WHEN cm.role = 'member' THEN
      CASE
        WHEN cm.permissions = '{}'::jsonb THEN 'edit'
        ELSE CASE coalesce(public.nivel_permissao_valor(
                 cm.permissions ->> CASE _module WHEN 'categorias' THEN 'categories' ELSE _module END), -1)
          WHEN -1 THEN CASE WHEN cm.perfil = 'personalizado' AND NOT (cm.permissions ? 'dp.colaboradores') THEN 'edit' ELSE 'none' END
          WHEN 0 THEN 'none' WHEN 1 THEN 'view' ELSE 'edit' END
      END
    ELSE 'none'
  END
  FROM public.company_members cm
  WHERE cm.user_id = _user_id AND cm.company_id = _company_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.is_company_member(_user_id uuid, _company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT private.dp_access_enabled(_user_id)
     AND EXISTS (SELECT 1 FROM public.company_members
                 WHERE user_id = _user_id AND company_id = _company_id AND situacao = 'ativo')
$function$;

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
  IF m.role IN ('viewer','contabilidade') THEN RETURN _req <= 1 AND _mod = 'financeiro'; END IF;
  IF m.permissions = '{}'::jsonb AND _mod = 'financeiro' THEN RETURN true; END IF;
  _atual := coalesce(public.nivel_permissao_valor(m.permissions ->> _item), 0);
  RETURN _atual >= _req;
END $$;

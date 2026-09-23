-- =====================================================================
-- Gestão de usuários do Backoffice (papel super_admin)
-- Todas as rotinas são SECURITY DEFINER e falham fechado:
-- somente quem já é super_admin pode listar, conceder ou revogar.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_backoffice_usuarios()
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  concedido_em timestamptz,
  ultimo_acesso timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito ao Backoffice.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    COALESCE(NULLIF(BTRIM(p.full_name), ''), split_part(u.email, '@', 1))::text AS nome,
    u.email::text,
    ur.created_at AS concedido_em,
    u.last_sign_in_at AS ultimo_acesso
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'super_admin'
  ORDER BY ur.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backoffice_usuarios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backoffice_usuarios() TO authenticated;

-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_backoffice_candidatos(_busca text DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  criado_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  termo text := NULLIF(BTRIM(COALESCE(_busca, '')), '');
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito ao Backoffice.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    COALESCE(NULLIF(BTRIM(p.full_name), ''), split_part(u.email, '@', 1))::text AS nome,
    u.email::text,
    u.created_at AS criado_em
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND u.email IS NOT NULL
    -- colaboradores do portal não são candidatos ao Backoffice
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = u.id AND r.role = 'dp_colaborador'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = u.id AND r.role = 'super_admin'
    )
    AND (
      termo IS NULL
      OR u.email ILIKE '%' || termo || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || termo || '%'
      OR COALESCE(p.document, '') ILIKE '%' || termo || '%'
    )
  ORDER BY COALESCE(NULLIF(BTRIM(p.full_name), ''), u.email) ASC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backoffice_candidatos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backoffice_candidatos(text) TO authenticated;

-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_backoffice_conceder(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  autor uuid := auth.uid();
  alvo_email text;
BEGIN
  IF NOT public.is_super_admin(autor) THEN
    RAISE EXCEPTION 'Acesso restrito ao Backoffice.' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Informe o usuário que receberá o acesso.' USING ERRCODE = '22023';
  END IF;

  SELECT u.email INTO alvo_email
  FROM auth.users u
  WHERE u.id = _user_id AND u.deleted_at IS NULL;

  IF alvo_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado na plataforma.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = 'dp_colaborador'
  ) THEN
    RAISE EXCEPTION 'Contas do portal do colaborador não podem acessar o Backoffice.' USING ERRCODE = '22023';
  END IF;

  -- Idempotente: conceder duas vezes não gera erro nem duplica registro.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      autor,
      'backoffice_acesso_concedido',
      'user_roles',
      _user_id::text,
      jsonb_build_object('email', alvo_email, 'papel', 'super_admin')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backoffice_conceder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backoffice_conceder(uuid) TO authenticated;

-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_backoffice_revogar(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  autor uuid := auth.uid();
  alvo_email text;
  restantes int;
BEGIN
  IF NOT public.is_super_admin(autor) THEN
    RAISE EXCEPTION 'Acesso restrito ao Backoffice.' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Informe o usuário que perderá o acesso.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Este usuário não tem acesso ao Backoffice.' USING ERRCODE = '22023';
  END IF;

  -- Trava: o sistema nunca pode ficar sem nenhum acesso ao Backoffice.
  SELECT count(*) INTO restantes
  FROM public.user_roles r
  WHERE r.role = 'super_admin' AND r.user_id <> _user_id;

  IF restantes < 1 THEN
    RAISE EXCEPTION 'É necessário manter pelo menos um acesso ao Backoffice.' USING ERRCODE = '22023';
  END IF;

  SELECT u.email INTO alvo_email FROM auth.users u WHERE u.id = _user_id;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = 'super_admin';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    autor,
    'backoffice_acesso_revogado',
    'user_roles',
    _user_id::text,
    jsonb_build_object('email', alvo_email, 'papel', 'super_admin', 'auto_revogacao', autor = _user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backoffice_revogar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backoffice_revogar(uuid) TO authenticated;
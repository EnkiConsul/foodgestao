CREATE OR REPLACE FUNCTION private.dp_acesso_situacao(_colaborador_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN c.deleted_at IS NOT NULL THEN 'cadastro_removido'
    WHEN co.is_active IS NOT TRUE
      OR lower(COALESCE(co.status_tenant, '')) IN
         ('suspenso','suspended','cancelado','canceled','bloqueado','blocked',
          'expirado','expired','inativo','inactive') THEN 'empresa_inativa'
    WHEN c.user_id IS NOT NULL
      AND COALESCE((SELECT s.access_blocked FROM public.auth_user_security_state s
                     WHERE s.user_id = c.user_id), false) THEN 'bloqueado'
    WHEN c.ativo IS TRUE THEN 'ok'
    WHEN c.acesso_portal_ate IS NOT NULL
      AND c.acesso_portal_ate >= (now() AT TIME ZONE COALESCE(NULLIF(co.timezone, ''), 'America/Sao_Paulo'))::date
      THEN 'prazo_documentos'
    ELSE 'vinculo_encerrado'
  END
  FROM public.dp_colaboradores c
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.id = _colaborador_id
  UNION ALL
  SELECT 'cadastro_nao_encontrado'
  WHERE NOT EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = _colaborador_id)
  LIMIT 1;
$$;

-- ROLLBACK: restaurar a versão anterior desta função (sem 'prazo_documentos').
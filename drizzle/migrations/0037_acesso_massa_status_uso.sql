CREATE OR REPLACE FUNCTION public.dp_acesso_massa_analisar(p_company uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT tem_permissao(p_company, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar acessos de colaboradores.';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome,
      'cpf', regexp_replace(coalesce(c.cpf,''), '\D', '', 'g'),
      'whatsapp', regexp_replace(coalesce(c.whatsapp, c.telefone, ''), '\D', '', 'g'),
      'tem_conta', c.user_id IS NOT NULL,
      'ja_acessou', c.user_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM auth_user_security_state s WHERE s.user_id = c.user_id AND s.password_changed_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id AND u.last_sign_in_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM dp_documento_aceites a WHERE a.colaborador_id = c.id)),
      'bloqueado', EXISTS (SELECT 1 FROM auth_user_security_state s WHERE s.user_id = c.user_id AND s.access_blocked)
    ) ORDER BY c.nome)
    FROM dp_colaboradores c
    WHERE c.company_id = p_company AND c.deleted_at IS NULL AND coalesce(c.ativo, true)
      AND c.data_desligamento IS NULL
  ), '[]'::jsonb);
END $function$;
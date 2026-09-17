-- ROLLBACK (não destrutivo): recriar dp_preadmissao_efetivar(uuid, uuid) a partir do
-- histórico de migrations, caso algum consumidor legado precise da assinatura antiga.
DROP FUNCTION IF EXISTS public.dp_preadmissao_efetivar(uuid, uuid);

REVOKE EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_preadmissao_bloquear_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text) TO authenticated, service_role;
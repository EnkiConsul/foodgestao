REVOKE ALL ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.dp_pessoa_apoio_vincular_origem(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_pessoa_apoio_vincular_origem(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.dp_convocacoes_remuneracao_atual(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacoes_remuneracao_atual(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_notificar_admins_empresa(_company_id uuid, _tipo text, _titulo text, _descricao text, _ref_table text, _ref_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _user_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
       EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = _company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.owner_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN_CROSS_COMPANY_NOTIFICATION' USING ERRCODE = '42501';
  END IF;
  FOR _user_id IN
    SELECT cm.user_id FROM public.company_members cm
     WHERE cm.company_id = _company_id AND cm.role IN ('admin','owner')
  LOOP
    INSERT INTO public.dp_notificacoes (company_id, user_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (_company_id, _user_id, _tipo, _titulo, _descricao, _ref_table, _ref_id, true);
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_notificar_admins_empresa(uuid, text, text, text, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_notificar_admins_empresa(uuid, text, text, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pluggy_reap_stale_sync_runs(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_reap_stale_sync_runs(integer) TO service_role;
REVOKE ALL ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_materializar_encerramentos(integer) TO service_role;
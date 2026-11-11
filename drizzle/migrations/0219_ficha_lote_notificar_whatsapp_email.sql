-- WhatsApp do responsável na lista de quem pode receber o lote (só equipe Aveto)
DROP FUNCTION IF EXISTS public.dp_ficha_lote_responsaveis(uuid);
CREATE FUNCTION public.dp_ficha_lote_responsaveis(p_importacao_id uuid)
 RETURNS TABLE(user_id uuid, nome text, email text, perfil text, whatsapp text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO: exclusivo da equipe Aveto.' USING ERRCODE = '42501';
  END IF;
  SELECT company_id INTO v_company FROM public.dp_ficha_importacoes WHERE id = p_importacao_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'LOTE_NAO_ENCONTRADO'; END IF;
  RETURN QUERY
    SELECT m.user_id,
           coalesce(nullif(btrim(p.full_name), ''), u.email::text),
           u.email::text,
           m.role::text,
           coalesce(
             nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), ''),
             (SELECT nullif(regexp_replace(coalesce(cp.gestor_whatsapp, ''), '\D', '', 'g'), '')
                FROM public.concierge_provisionamentos cp
               WHERE cp.company_id = v_company AND lower(cp.gestor_email) = lower(u.email::text)
               LIMIT 1)
           )
      FROM public.company_members m
      JOIN auth.users u ON u.id = m.user_id
      LEFT JOIN public.profiles p ON p.user_id = m.user_id
     WHERE m.company_id = v_company
       AND m.situacao = 'ativo'
       AND m.role::text IN ('owner', 'admin')
       AND NOT public.is_super_admin(m.user_id)
     ORDER BY (m.role::text = 'owner') DESC, 2;
END $function$;
REVOKE ALL ON FUNCTION public.dp_ficha_lote_responsaveis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_responsaveis(uuid) TO authenticated, service_role;

-- Envios do repasse do lote aparecem no histórico de WhatsApp
ALTER TABLE public.dp_whatsapp_envios DROP CONSTRAINT dp_whatsapp_envios_tipo_check;
ALTER TABLE public.dp_whatsapp_envios ADD CONSTRAINT dp_whatsapp_envios_tipo_check
  CHECK (tipo = ANY (ARRAY['acesso','senha','recibo','ata','lote_ficha']));

-- Registra os canais usados no repasse (só servidor)
CREATE OR REPLACE FUNCTION public.dp_ficha_lote_registrar_canais(
  p_importacao_id uuid, p_notificacao_id uuid, p_canais jsonb
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(p_canais) <> 'object' OR length(p_canais::text) > 2000 THEN
    RAISE EXCEPTION 'CANAIS_INVALIDOS';
  END IF;
  UPDATE public.dp_ficha_importacoes
     SET organizacao = jsonb_set(
           coalesce(organizacao, '{}'::jsonb),
           '{notificacao}',
           coalesce(organizacao->'notificacao', '{}'::jsonb)
             || jsonb_build_object('notificacao_id', p_notificacao_id, 'canais', p_canais))
   WHERE id = p_importacao_id;
END $function$;
REVOKE ALL ON FUNCTION public.dp_ficha_lote_registrar_canais(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ficha_lote_registrar_canais(uuid, uuid, jsonb) TO service_role;
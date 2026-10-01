CREATE OR REPLACE FUNCTION public.dp_recibo_assinar_externo(
  p_recibo_id uuid, p_hash text, p_ip text, p_user_agent text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_recibo public.dp_recibos;
  v_agora timestamptz := now();
BEGIN
  IF NOT private.dp_doc_service_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_recibo:' || p_recibo_id::text, 0));
  SELECT * INTO v_recibo FROM public.dp_recibos WHERE id = p_recibo_id FOR UPDATE;
  IF v_recibo.id IS NULL OR v_recibo.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'RECIBO_INDISPONIVEL'; END IF;
  IF v_recibo.canal_assinatura <> 'whatsapp' OR (v_recibo.colaborador_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.dp_colaboradores c WHERE c.id = v_recibo.colaborador_id AND c.ativo IS NOT FALSE)) THEN
    RAISE EXCEPTION 'RECIBO_CANAL_INVALIDO';
  END IF;
  IF v_recibo.assinado_em IS NOT NULL THEN RETURN v_recibo.assinado_em; END IF;
  IF p_hash IS NULL OR length(p_hash) <> 64 THEN RAISE EXCEPTION 'RECIBO_HASH_INVALIDO'; END IF;

  UPDATE public.dp_recibos
     SET assinado_em = v_agora,
         assinado_ip = nullif(trim(coalesce(p_ip, '')), ''),
         assinado_user_agent = nullif(left(coalesce(p_user_agent, ''), 400), ''),
         assinado_hash = p_hash,
         assinado_confirmacao = jsonb_build_object(
           'metodo', 'cpf', 'canal', 'whatsapp', 'declaracao', 'Li e concordo com o recibo'
         ),
         link_token_hash = NULL,
         updated_at = now()
   WHERE id = v_recibo.id;
  RETURN v_agora;
END $$;

REVOKE ALL ON FUNCTION public.dp_recibo_assinar_externo(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_recibo_assinar_externo(uuid, text, text, text) TO service_role;
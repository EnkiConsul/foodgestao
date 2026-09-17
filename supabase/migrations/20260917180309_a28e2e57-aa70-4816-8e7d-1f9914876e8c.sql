CREATE OR REPLACE FUNCTION public.dp_preadmissao_excluir(
  _preadmissao_id uuid,
  _ator uuid,
  _motivo text DEFAULT NULL,
  _versao integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pa public.dp_preadmissoes;
  motivo text := NULLIF(btrim(COALESCE(_motivo, '')), '');
BEGIN
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = _preadmissao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Ficha não encontrada.');
  END IF;

  IF pa.removido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_removida', true);
  END IF;

  IF _versao IS NOT NULL AND pa.versao IS NOT NULL AND pa.versao <> _versao THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'A ficha mudou enquanto você estava nela. Abra novamente e tente de novo.');
  END IF;

  IF pa.status = 'concluido' OR pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Esta admissão já virou cadastro de colaborador e não pode ser excluída.');
  END IF;

  UPDATE public.dp_preadmissoes
     SET removido_em = now(),
         removido_por = _ator,
         removido_motivo = motivo,
         updated_at = now()
   WHERE id = pa.id;

  UPDATE public.dp_preadmissao_convites
     SET revoked_at = now()
   WHERE preadmissao_id = pa.id
     AND revoked_at IS NULL;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (pa.id, pa.company_id, 'ficha_excluida',
          jsonb_build_object('motivo', motivo, 'status_anterior', pa.status), _ator);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_excluir(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_excluir(uuid, uuid, text, integer) TO service_role;

-- Rollback: recriar a versão anterior da função (nenhum dado é alterado por este passo).
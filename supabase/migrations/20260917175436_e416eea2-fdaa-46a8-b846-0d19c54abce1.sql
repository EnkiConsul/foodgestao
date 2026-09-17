ALTER TABLE public.dp_preadmissoes
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text;

CREATE INDEX IF NOT EXISTS dp_preadmissoes_ativas_idx
  ON public.dp_preadmissoes (company_id, created_at DESC)
  WHERE removido_em IS NULL;

-- Exclusão da ficha de admissão: transacional, idempotente e não destrutiva.
-- Guarda quem/quando/por quê, revoga os convites ativos e registra o evento.
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

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, ator)
  VALUES (pa.id, pa.company_id, 'ficha_excluida',
          jsonb_build_object('motivo', motivo, 'status_anterior', pa.status), _ator);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_excluir(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_excluir(uuid, uuid, text, integer) TO service_role;

-- Rollback (não destrutivo):
--   DROP FUNCTION IF EXISTS public.dp_preadmissao_excluir(uuid, uuid, text, integer);
--   DROP INDEX IF EXISTS public.dp_preadmissoes_ativas_idx;
--   -- as colunas removido_em/por/motivo podem permanecer sem uso (nenhum dado apagado)
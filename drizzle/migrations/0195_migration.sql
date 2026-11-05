ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS assinatura_dispensada_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_dispensa_motivo text;
ALTER TABLE public.dp_trocas
  ADD COLUMN IF NOT EXISTS assinatura_dispensada_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_dispensa_motivo text;

-- Encerra pendências de assinatura de quem saiu da empresa e já passou da janela
-- de 30 dias de acesso ao portal. Documentos rescisórios (assinatura física) não entram.
CREATE OR REPLACE FUNCTION private.dp_encerrar_pendencias_desligados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_docs int := 0; v_trocas_aprov int := 0; v_trocas_abertas int := 0;
  v_motivo text := 'Colaborador desligado: prazo de 30 dias de acesso ao portal encerrado sem assinatura.';
BEGIN
  WITH desl AS (
    SELECT id FROM dp_colaboradores
    WHERE ativo = false AND data_desligamento IS NOT NULL
      AND COALESCE(acesso_portal_ate, data_desligamento + 30) < current_date
  ), u AS (
    UPDATE dp_documentos d
       SET assinatura_dispensada_em = now(), assinatura_dispensa_motivo = v_motivo
      FROM desl
     WHERE d.colaborador_id = desl.id
       AND d.exige_aceite = true
       AND d.assinatura_dispensada_em IS NULL
       AND d.tipo::text NOT IN ('aviso_previo','desligamento','trct','demonstrativo_rescisorio','outros_desligamento','acerto_rescisorio','aso_demissional','disciplinar')
       AND NOT EXISTS (SELECT 1 FROM dp_documento_aceites a WHERE a.documento_id = d.id)
    RETURNING 1
  ) SELECT count(*) INTO v_docs FROM u;

  WITH desl AS (
    SELECT id FROM dp_colaboradores
    WHERE ativo = false AND data_desligamento IS NOT NULL
      AND COALESCE(acesso_portal_ate, data_desligamento + 30) < current_date
  ), u AS (
    UPDATE dp_trocas t
       SET assinatura_dispensada_em = now(), assinatura_dispensa_motivo = v_motivo
     WHERE t.status = 'aprovada'
       AND t.assinatura_dispensada_em IS NULL
       AND (t.solicitante_assinatura IS NULL OR t.destino_assinatura IS NULL)
       AND (t.solicitante_id IN (SELECT id FROM desl) OR t.destino_id IN (SELECT id FROM desl))
    RETURNING 1
  ) SELECT count(*) INTO v_trocas_aprov FROM u;

  -- Pedidos de troca ainda em aberto com quem saiu (qualquer prazo) perdem o objeto.
  WITH desl AS (
    SELECT id FROM dp_colaboradores WHERE ativo = false AND data_desligamento IS NOT NULL AND data_desligamento <= current_date
  ), u AS (
    UPDATE dp_trocas t
       SET status = 'expirada',
           gestor_resposta = COALESCE(t.gestor_resposta, 'Encerrada automaticamente: participante desligado.'),
           updated_at = now()
     WHERE t.status IN ('pendente_colega','pendente_gestor')
       AND (t.solicitante_id IN (SELECT id FROM desl) OR t.destino_id IN (SELECT id FROM desl))
    RETURNING 1
  ) SELECT count(*) INTO v_trocas_abertas FROM u;

  RETURN jsonb_build_object('documentos', v_docs, 'trocas_aprovadas', v_trocas_aprov, 'trocas_abertas', v_trocas_abertas);
END $$;

REVOKE ALL ON FUNCTION private.dp_encerrar_pendencias_desligados() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('dp-encerrar-pendencias-desligados');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('dp-encerrar-pendencias-desligados', '15 9 * * *', $$SELECT private.dp_encerrar_pendencias_desligados()$$);

SELECT private.dp_encerrar_pendencias_desligados();
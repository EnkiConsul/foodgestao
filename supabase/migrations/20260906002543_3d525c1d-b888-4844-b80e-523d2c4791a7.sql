-- Expira trocas sem resposta cuja data já terminou.
-- A troca continua aceitável durante o próprio dia; só expira na virada do dia (America/Sao_Paulo).
CREATE OR REPLACE FUNCTION public.dp_expirar_trocas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  WITH alvo AS (
    SELECT t.id, LEAST(t.data_original, t.data_proposta) AS limite
    FROM public.dp_trocas t
    WHERE t.status IN ('pendente_colega', 'pendente_gestor')
      AND LEAST(t.data_original, t.data_proposta) < v_hoje
    FOR UPDATE
  )
  UPDATE public.dp_trocas t
  SET status = 'expirada',
      gestor_resposta = COALESCE(
        t.gestor_resposta,
        'expirada: sem resposta até o fim do dia ' || to_char(a.limite, 'DD/MM/YYYY')
      ),
      gestor_respondido_em = COALESCE(t.gestor_respondido_em, now())
  FROM alvo a
  WHERE t.id = a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_expirar_trocas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_expirar_trocas() TO authenticated, service_role;

-- Título dedicado para a expiração nas notificações da troca.
CREATE OR REPLACE FUNCTION public.dp_notif_troca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solic uuid;
  v_dest uuid;
  v_titulo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'troca_nova', 'Nova solicitação de troca',
            'Data original: ' || NEW.data_original::text,
            'dp_trocas', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.colega_resposta IS DISTINCT FROM OLD.colega_resposta AND NEW.colega_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_colega',
                'Colega respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;

    IF NEW.gestor_resposta IS DISTINCT FROM OLD.gestor_resposta AND NEW.gestor_resposta IS NOT NULL THEN
      v_titulo := CASE
        WHEN NEW.status = 'expirada' THEN 'Solicitação de troca expirada'
        WHEN NEW.status = 'cancelada' THEN 'Gestor cancelou a troca'
        WHEN NEW.status = 'recusada' THEN 'Gestor recusou a troca'
        ELSE 'Gestor respondeu à troca'
      END;

      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      SELECT c.user_id INTO v_dest FROM public.dp_colaboradores c WHERE c.id = NEW.destino_id;

      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;

      IF v_dest IS NOT NULL AND v_dest IS DISTINCT FROM v_solic THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_dest, NEW.destino_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Uma execução diária, logo após a virada do dia em Brasília (03:10 UTC).
SELECT cron.unschedule('dp-expirar-trocas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dp-expirar-trocas');

SELECT cron.schedule(
  'dp-expirar-trocas',
  '10 3 * * *',
  $cron$ SELECT public.dp_expirar_trocas(); $cron$
);
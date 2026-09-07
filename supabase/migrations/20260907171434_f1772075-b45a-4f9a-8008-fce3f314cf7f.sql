-- Etapa 7 — Lembretes automáticos da janela de disponibilidade de convocáveis

-- 1. Tipo de notificação do resumo ao gestor no fechamento
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'disponibilidade_janela_encerrada';

-- 2. Rotina diária: avalia a janela de cada empresa/unidade e dispara os lembretes do dia
CREATE OR REPLACE FUNCTION public.dp_disponibilidade_lembretes_dia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company record;
  v_scope record;
  v_janela jsonb;
  v_hoje date;
  v_comp date;
  v_comp_ini date;
  v_comp_fim date;
  v_enviadas int := 0;
  v_n int := 0;
  v_informaram int := 0;
  v_label text;
  v_chave text;
BEGIN
  FOR v_company IN
    SELECT DISTINCT c.company_id FROM public.dp_colaboradores c
  LOOP
    -- Escopos: cada unidade com convocáveis + trabalhadores sem unidade (escopo empresa).
    -- dp_disponibilidade_janela resolve a config da unidade com retorno ao padrão da empresa,
    -- então cada trabalhador é avaliado exatamente uma vez, no seu próprio escopo.
    FOR v_scope IN
      SELECT c.unidade_id, array_agg(c.id) AS colab_ids
        FROM public.dp_colaboradores c
       WHERE c.company_id = v_company.company_id
         AND c.ativo = true
         AND c.deleted_at IS NULL
         AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       GROUP BY c.unidade_id
    LOOP
      -- A janela da competência do mês seguinte acontece dentro do mês corrente.
      v_janela := public.dp_disponibilidade_janela(
        v_company.company_id,
        v_scope.unidade_id,
        (date_trunc('month', now())::date + interval '1 month')::date
      );
      v_hoje := (v_janela->>'hoje')::date;
      v_comp := (v_janela->>'competencia')::date;
      v_comp_ini := v_comp;
      v_comp_fim := (v_comp + interval '1 month - 1 day')::date;
      v_label := to_char(v_comp, 'MM/YYYY');

      -- 2a. Abertura do período: avisa todos os convocáveis do escopo
      IF v_hoje = (v_janela->>'abre')::date THEN
        INSERT INTO public.dp_notificacoes(
          company_id, tipo, titulo, descricao, ref_table, ref_id,
          colaborador_id, para_admins, chave)
        SELECT v_company.company_id,
               'disponibilidade_janela_abriu',
               'Período de disponibilidade aberto',
               'Abriu o período para informar os dias em que você NÃO poderá trabalhar em '
                 || v_label || '. Marque até ' || to_char((v_janela->>'fecha')::date, 'DD/MM/YYYY') || '.',
               'companies', v_company.company_id,
               colab_id, false,
               'disp_abriu:' || v_company.company_id || ':' || v_comp || ':' || colab_id
          FROM unnest(v_scope.colab_ids) AS colab_id
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_enviadas := v_enviadas + v_n;
      END IF;

      -- 2b. Lembrete de fechamento: só quem ainda não informou nada na competência
      IF v_hoje = (v_janela->>'lembrete_em')::date
         AND (v_janela->>'estado') = 'aberta'
         AND COALESCE((v_janela->>'lembrete_dias')::int, 0) > 0 THEN
        INSERT INTO public.dp_notificacoes(
          company_id, tipo, titulo, descricao, ref_table, ref_id,
          colaborador_id, para_admins, chave)
        SELECT v_company.company_id,
               'disponibilidade_janela_fechando',
               'Período de disponibilidade fechando',
               'O período para informar indisponibilidade de ' || v_label || ' fecha em '
                 || to_char((v_janela->>'fecha')::date, 'DD/MM/YYYY')
                 || '. Você ainda não informou nada — se puder trabalhar o mês todo, não precisa fazer nada.',
               'companies', v_company.company_id,
               colab_id, false,
               'disp_fechando:' || v_company.company_id || ':' || v_comp || ':' || colab_id
          FROM unnest(v_scope.colab_ids) AS colab_id
         WHERE NOT EXISTS (
           SELECT 1 FROM public.dp_indisponibilidades i
            WHERE i.colaborador_id = colab_id
              AND i.cancelada_em IS NULL
              AND i.data BETWEEN v_comp_ini AND v_comp_fim)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_enviadas := v_enviadas + v_n;
      END IF;

      -- 2c. Fechamento: resumo ao gestor com o total informado no escopo
      IF v_hoje = (v_janela->>'fecha')::date THEN
        SELECT count(DISTINCT i.colaborador_id)::int INTO v_informaram
          FROM public.dp_indisponibilidades i
         WHERE i.colaborador_id = ANY (v_scope.colab_ids)
           AND i.cancelada_em IS NULL
           AND i.data BETWEEN v_comp_ini AND v_comp_fim;

        v_chave := 'disp_fechou:' || v_company.company_id || ':'
          || COALESCE(v_scope.unidade_id::text, 'empresa') || ':' || v_comp;

        IF NOT EXISTS (SELECT 1 FROM public.dp_notificacoes n WHERE n.chave = v_chave) THEN
          INSERT INTO public.dp_notificacoes(
            company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
          VALUES (
            v_company.company_id,
            'disponibilidade_janela_encerrada',
            'Período de disponibilidade encerrado',
            'Encerrou o período de planejamento de ' || v_label || ': '
              || v_informaram || ' de ' || array_length(v_scope.colab_ids, 1)
              || ' convocável(is) informaram indisponibilidade. Novas marcações entram como alteração tardia.',
            'companies', v_company.company_id, true, v_chave);
          v_enviadas := v_enviadas + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_enviadas;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_disponibilidade_lembretes_dia() FROM anon, PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_disponibilidade_lembretes_dia() TO service_role;

-- 3. Agendamento diário (10h UTC ≈ 7h em São Paulo); idempotente pelas chaves acima
SELECT cron.schedule(
  'dp-disponibilidade-lembretes-dia',
  '0 10 * * *',
  $$ SELECT public.dp_disponibilidade_lembretes_dia(); $$
);
-- Licenças curtas da CLT (art. 473) como tipos de solicitação; todas contam como afastamento
-- e travam troca de folga. Rollback: CREATE OR REPLACE das duas funções com a lista anterior
-- ('atestado','licenca_maternidade','licenca_paternidade','ferias'); valores de enum ficam (não removíveis sem recriar o tipo).
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'licenca_luto';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'licenca_casamento';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'doacao_sangue';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'alistamento_eleitoral';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'servico_militar';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'vestibular';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'comparecimento_judicial';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'acompanhamento_consulta';
ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'exame_preventivo';

CREATE OR REPLACE FUNCTION private.dp_tipo_afastamento(_tipo text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  SELECT _tipo IN ('atestado','licenca_maternidade','licenca_paternidade','ferias',
    'licenca_luto','licenca_casamento','doacao_sangue','alistamento_eleitoral','servico_militar',
    'vestibular','comparecimento_judicial','acompanhamento_consulta','exame_preventivo');
$fn$;

CREATE OR REPLACE FUNCTION private.dp_colab_afastado_em(_colaborador uuid, _data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
    WHERE s.colaborador_id = _colaborador AND s.removido_em IS NULL AND s.status = 'aprovada'
      AND private.dp_tipo_afastamento(s.tipo::text)
      AND s.data_alvo <= _data AND COALESCE(s.data_fim, s.data_alvo) >= _data
  ) OR EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador AND g.status IN ('aprovado','em_gozo')
      AND g.data_inicio <= _data AND g.data_fim >= _data
  ) OR EXISTS (
    SELECT 1 FROM public.dp_registros_disciplinares r
    WHERE r.colaborador_id = _colaborador AND r.tipo = 'suspensao' AND r.removido_em IS NULL
      AND r.data <= _data AND r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1 >= _data
  );
$fn$;

CREATE OR REPLACE FUNCTION public.dp_trocas_afastamentos(_de date, _ate date)
RETURNS TABLE(colaborador_id uuid, inicio date, fim date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH me AS (SELECT public.dp_colaborador_ativo_of(auth.uid()) AS id),
       ctx AS (SELECT c.company_id FROM public.dp_colaboradores c JOIN me ON c.id = me.id)
  SELECT s.colaborador_id, s.data_alvo, COALESCE(s.data_fim, s.data_alvo)
    FROM public.dp_solicitacoes s, ctx
   WHERE s.company_id = ctx.company_id AND s.removido_em IS NULL AND s.status = 'aprovada'
     AND private.dp_tipo_afastamento(s.tipo::text)
     AND s.data_alvo <= _ate AND COALESCE(s.data_fim, s.data_alvo) >= _de
  UNION ALL
  SELECT g.colaborador_id, g.data_inicio, g.data_fim
    FROM public.dp_ferias_gozos g, ctx
   WHERE g.company_id = ctx.company_id AND g.status IN ('aprovado','em_gozo')
     AND g.data_inicio <= _ate AND g.data_fim >= _de
  UNION ALL
  SELECT r.colaborador_id, r.data, r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1
    FROM public.dp_registros_disciplinares r, ctx
   WHERE r.company_id = ctx.company_id AND r.tipo = 'suspensao' AND r.removido_em IS NULL
     AND r.data <= _ate AND r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1 >= _de;
$fn$;

GRANT EXECUTE ON FUNCTION public.dp_trocas_afastamentos(date, date) TO authenticated;
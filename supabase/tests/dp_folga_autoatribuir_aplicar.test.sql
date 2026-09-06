-- Testes do plano + aplicação confirmada da distribuição automática de folgas
--
-- Verifica que:
--  1. Pedido de folga aprovado conta como folga marcada (não entra no plano).
--  2. O plano sugere um dia de descanso para quem está sem folga.
--  3. Aplicar apenas parte da lista cria só as folgas confirmadas.
--  4. Reaplicar o mesmo item não duplica (idempotente).
--  5. Membro comum (viewer) não pode ver o plano nem aplicar.
--  6. Intermitente, PJ, freelancer e quem não trabalha no domingo ficam fora do plano.
--  7. Folga de sábado conta quando a unidade negocia sábado e a empresa não.
--
-- Roda em transação com ROLLBACK: nada é persistido.

BEGIN;

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'dp-admin2@test.local',  'authenticated', 'authenticated', now(), now()),
  ('a2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'dp-viewer2@test.local', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.companies (id, user_id, name, timezone)
VALUES ('c1111111-1111-1111-1111-111111111111',
        'a1111111-1111-1111-1111-111111111111',
        'Empresa Folgas Plano', 'America/Sao_Paulo');

INSERT INTO public.company_members (company_id, user_id, role)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('c1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO public.dp_unidades (id, company_id, nome)
VALUES ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Unidade Plano');

-- A configuração padrão da empresa é criada por trigger; ajustamos os campos usados no teste
UPDATE public.dp_config_dp
   SET folga_janela_ativa = true, folga_janela_abre_dia = 10, folga_janela_fecha_dia = 20,
       folga_autoatribuir = true, folgas_fds_por_mes = 1
 WHERE company_id = 'c1111111-1111-1111-1111-111111111111' AND unidade_id IS NULL;

INSERT INTO public.dp_colaboradores (id, company_id, unidade_id, nome, ativo)
VALUES
  ('e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Um', true),
  ('e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Dois', true);

-- Pedido aprovado para o Colaborador Um no primeiro domingo do mês
INSERT INTO public.dp_solicitacoes (company_id, colaborador_id, tipo, status, data_alvo)
SELECT 'c1111111-1111-1111-1111-111111111111',
       'e1111111-1111-1111-1111-111111111111',
       'folga', 'aprovada', d::date
  FROM generate_series(date_trunc('month', now())::date,
                       (date_trunc('month', now()) + interval '1 month - 1 day')::date,
                       interval '1 day') AS d
 WHERE EXTRACT(DOW FROM d)::int = 0
 ORDER BY d
 LIMIT 1;

SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1 e 2) Plano ignora quem tem pedido aprovado e sugere dia para o restante
DO $$
DECLARE v jsonb; v_itens jsonb; v_data date;
BEGIN
  v := public.dp_folga_autoatribuicao_plano(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);
  v_itens := v->'itens';

  IF jsonb_array_length(v_itens) <> 1 THEN
    RAISE EXCEPTION 'FALHA 1: esperava 1 item no plano, obtive % — %', jsonb_array_length(v_itens), v;
  END IF;
  IF (v_itens->0->>'colaborador_id') <> 'e2222222-2222-2222-2222-222222222222' THEN
    RAISE EXCEPTION 'FALHA 1: item inesperado no plano — %', v_itens;
  END IF;

  v_data := (v_itens->0->>'data_sugerida')::date;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'FALHA 2: plano sem dia sugerido — %', v_itens;
  END IF;
  RAISE NOTICE 'OK 1/2: plano ignora pedido aprovado e sugere %', v_data;

  -- 3) Aplicar somente o item confirmado
  v := public.dp_folga_autoatribuir_aplicar(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date,
        jsonb_build_array(jsonb_build_object(
          'colaborador_id', 'e2222222-2222-2222-2222-222222222222', 'data', v_data)));

  IF COALESCE((v->>'geradas')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'FALHA 3: esperava 1 folga criada — %', v;
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_folgas
              WHERE colaborador_id = 'e1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'FALHA 3: criou folga para quem já tinha pedido aprovado';
  END IF;
  RAISE NOTICE 'OK 3: aplicou somente o item confirmado';

  -- 4) Reaplicar não duplica
  v := public.dp_folga_autoatribuir_aplicar(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date,
        jsonb_build_array(jsonb_build_object(
          'colaborador_id', 'e2222222-2222-2222-2222-222222222222', 'data', v_data)));
  IF COALESCE((v->>'geradas')::int, 0) <> 0 THEN
    RAISE EXCEPTION 'FALHA 4: reaplicação duplicou folgas — %', v;
  END IF;
  RAISE NOTICE 'OK 4: reaplicação idempotente';
END $$;

-- 6) Vínculos sem folga a cumprir e quem não trabalha no domingo ficam fora do plano
INSERT INTO public.dp_colaboradores (id, company_id, unidade_id, nome, ativo, regime)
VALUES
  ('e3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Intermitente', true, 'intermitente'),
  ('e4444444-4444-4444-4444-444444444444', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador PJ', true, 'pj'),
  ('e5555555-5555-5555-5555-555555555555', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Freelancer', true, 'freelancer'),
  ('e6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Sem Domingo', true, 'clt');

-- Quem não trabalha no domingo: configuração de trabalho vigente sem o domingo
INSERT INTO public.dp_colaborador_config_trabalho (id, company_id, colaborador_id, unidade_id, vigencia_inicio)
VALUES ('f6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111',
        'e6666666-6666-6666-6666-666666666666', 'd1111111-1111-1111-1111-111111111111',
        date_trunc('month', now())::date);

INSERT INTO public.dp_colaborador_config_dias (company_id, config_id, dow, trabalha)
SELECT 'c1111111-1111-1111-1111-111111111111',
       'f6666666-6666-6666-6666-666666666666', g, g <> 0
  FROM generate_series(0, 6) AS g;

DO $$
DECLARE v jsonb;
BEGIN
  v := public.dp_folga_autoatribuicao_plano(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'itens') i
     WHERE (i->>'colaborador_id') IN (
       'e3333333-3333-3333-3333-333333333333',
       'e4444444-4444-4444-4444-444444444444',
       'e5555555-5555-5555-5555-555555555555',
       'e6666666-6666-6666-6666-666666666666')
  ) THEN
    RAISE EXCEPTION 'FALHA 6: vínculo sem folga a cumprir entrou no plano — %', v;
  END IF;
  RAISE NOTICE 'OK 6: intermitente, PJ, freelancer e quem não trabalha domingo fora do plano';
END $$;

-- 7) Folga de sábado conta quando a unidade negocia sábado e a empresa não
INSERT INTO public.dp_config_dp (company_id, unidade_id, tipo_descanso_domingo,
                                 dias_descanso_negociados, folgas_fds_por_mes)
VALUES ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111',
        'acordo_coletivo', ARRAY[0, 6], 1)
ON CONFLICT (company_id, unidade_id) DO UPDATE
   SET tipo_descanso_domingo = 'acordo_coletivo',
       dias_descanso_negociados = ARRAY[0, 6],
       folgas_fds_por_mes = 1;

INSERT INTO public.dp_colaboradores (id, company_id, unidade_id, nome, ativo, regime)
VALUES ('e7777777-7777-7777-7777-777777777777', 'c1111111-1111-1111-1111-111111111111',
        'd1111111-1111-1111-1111-111111111111', 'Colaborador Sabado', true, 'clt');

INSERT INTO public.dp_folgas (company_id, colaborador_id, data, tipo, origem, status, extra)
SELECT 'c1111111-1111-1111-1111-111111111111',
       'e7777777-7777-7777-7777-777777777777', d::date, 'normal', 'gestor', 'agendada', false
  FROM generate_series(date_trunc('month', now())::date,
                       (date_trunc('month', now()) + interval '1 month - 1 day')::date,
                       interval '1 day') AS d
 WHERE EXTRACT(DOW FROM d)::int = 6
 ORDER BY d
 LIMIT 1;

DO $$
DECLARE v jsonb;
BEGIN
  v := public.dp_folga_autoatribuicao_plano(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'itens') i
     WHERE (i->>'colaborador_id') = 'e7777777-7777-7777-7777-777777777777'
  ) THEN
    RAISE EXCEPTION 'FALHA 7: folga de sábado da unidade não foi contada — %', v;
  END IF;
  RAISE NOTICE 'OK 7: folga de sábado conta pela regra da unidade';
END $$;



-- 5) Viewer bloqueado no plano e na aplicação
SELECT set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.dp_folga_autoatribuicao_plano(
      'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);
    RAISE EXCEPTION 'FALHA 5: viewer viu o plano';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 5a: plano bloqueado para viewer';
  END;

  BEGIN
    PERFORM public.dp_folga_autoatribuir_aplicar(
      'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date,
      '[]'::jsonb);
    RAISE EXCEPTION 'FALHA 5: viewer aplicou a distribuição';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 5b: aplicação bloqueada para viewer';
  END;
END $$;

ROLLBACK;

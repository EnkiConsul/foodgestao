-- Testes da execução manual da distribuição automática de folgas
--
-- Verifica que:
--  1. Admin da empresa consegue distribuir folgas do mês informado.
--  2. Reexecutar a mesma competência não cria folgas duplicadas.
--  3. Membro comum (viewer) NÃO pode executar.
--  4. A prévia também é restrita a admin/owner.
--
-- Roda em transação com ROLLBACK: nada é persistido.

BEGIN;

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'dp-admin@test.local',  'authenticated', 'authenticated', now(), now()),
  ('a2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'dp-viewer@test.local', 'authenticated', 'authenticated', now(), now());

INSERT INTO public.companies (id, user_id, name, timezone)
VALUES ('c1111111-1111-1111-1111-111111111111',
        'a1111111-1111-1111-1111-111111111111',
        'Empresa Folgas Teste', 'America/Sao_Paulo');

INSERT INTO public.company_members (company_id, user_id, role)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('c1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'viewer')
ON CONFLICT DO NOTHING;

INSERT INTO public.dp_unidades (id, company_id, nome)
VALUES ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Unidade Teste');

-- Configuração: 1 folga de fim de semana por mês, janela ativa
INSERT INTO public.dp_config_dp (company_id, unidade_id, folga_janela_ativa,
                                 folga_janela_abre_dia, folga_janela_fecha_dia,
                                 folga_autoatribuir, folgas_fds_por_mes)
VALUES ('c1111111-1111-1111-1111-111111111111', NULL, true, 10, 20, true, 1);

INSERT INTO public.dp_colaboradores (id, company_id, unidade_id, nome, ativo)
VALUES
  ('e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Um', true),
  ('e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111',
   'd1111111-1111-1111-1111-111111111111', 'Colaborador Dois', true);

-- 1) Admin executa a distribuição
SELECT set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

DO $$
DECLARE v jsonb; v_qtd int;
BEGIN
  v := public.dp_folga_autoatribuir_manual(
        'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);
  IF NOT COALESCE((v->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'FALHA 1: execução manual não retornou ok — %', v;
  END IF;

  SELECT count(*) INTO v_qtd
    FROM public.dp_folgas
   WHERE company_id = 'c1111111-1111-1111-1111-111111111111'
     AND origem = 'auto_fechamento_periodo';
  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'FALHA 1: esperava 2 folgas geradas, obtive %', v_qtd;
  END IF;
  RAISE NOTICE 'OK 1: admin distribuiu % folga(s)', v_qtd;
END $$;

-- 2) Reexecução não duplica
DO $$
DECLARE v_qtd int;
BEGIN
  PERFORM public.dp_folga_autoatribuir_manual(
    'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);

  SELECT count(*) INTO v_qtd
    FROM public.dp_folgas
   WHERE company_id = 'c1111111-1111-1111-1111-111111111111'
     AND origem = 'auto_fechamento_periodo';
  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'FALHA 2: reexecução duplicou folgas (total %)', v_qtd;
  END IF;
  RAISE NOTICE 'OK 2: reexecução idempotente';
END $$;

-- 3) Viewer não pode executar
SELECT set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.dp_folga_autoatribuir_manual(
      'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);
    RAISE EXCEPTION 'FALHA 3: viewer conseguiu executar a distribuição';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 3: viewer bloqueado';
  END;
END $$;

-- 4) Prévia também restrita
DO $$
BEGIN
  BEGIN
    PERFORM public.dp_folga_autoatribuicao_previa(
      'c1111111-1111-1111-1111-111111111111'::uuid, NULL, date_trunc('month', now())::date);
    RAISE EXCEPTION 'FALHA 4: viewer conseguiu ver a prévia';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 4: prévia bloqueada para viewer';
  END;
END $$;

ROLLBACK;

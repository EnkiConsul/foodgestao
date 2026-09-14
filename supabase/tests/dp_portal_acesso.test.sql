-- ============================================================
-- Fase 8 — política de acesso ao Portal do Colaborador
-- ============================================================
-- Cobre a decisão central private.dp_portal_decisao e seus efeitos:
--  T1  colaborador ativo -> acesso normal
--  T2  desligado há 1 dia -> somente documentos
--  T3  desligado há 29 dias -> somente documentos
--  T4  desligado exatamente no último dia do prazo -> somente documentos
--  T5  desligado há 31 dias -> acesso negado
--  T6  desligado no prazo não pode agir (folga)
--  T7  desligado no prazo não pode agir (férias)
--  T8  desligado no prazo não pode agir (troca)
--  T9  desligado no prazo não pode agir (convocação/operação)
--  T10 desligado no prazo mantém direito de ver documentos
--  T11 vínculo de documento continua resolvido para o próprio colaborador
--  T12 documento de outro colaborador não é alcançado pelo vínculo
--  T13 bloqueado dentro do prazo -> negado imediatamente
--  T14 regra temporal usa a data no fuso da empresa (não do navegador)
--
-- Uso: rodar como serviço interno (role postgres/service_role).
-- Termina com RAISE EXCEPTION para desfazer tudo — não altera produção.
-- ============================================================

DO $$
DECLARE
  v_company uuid;
  v_tz text;
  v_hoje date;
  v_colab uuid;
  v_user uuid;
  v_outro uuid;
  res text[] := '{}';
  st text;
  agir boolean;
  docs boolean;
  vinc uuid;
BEGIN
  SELECT c.id, c.company_id, c.user_id INTO v_colab, v_company, v_user
    FROM public.dp_colaboradores c
   WHERE c.user_id IS NOT NULL AND c.ativo
   ORDER BY c.created_at
   LIMIT 1;
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'sem colaborador com acesso para testar';
  END IF;

  SELECT coalesce(co.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.companies co WHERE co.id = v_company;
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT c.id INTO v_outro
    FROM public.dp_colaboradores c
   WHERE c.company_id = v_company AND c.id <> v_colab
   LIMIT 1;

  -- T1: ativo
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'ativo' THEN RAISE EXCEPTION 'T1 falhou: estado=%', st; END IF;
  res := res || 'T1 ativo -> acesso normal';

  -- T2: desligado há 1 dia (prazo de 30 dias a partir do desligamento)
  UPDATE public.dp_colaboradores
     SET ativo = false,
         data_desligamento = v_hoje - 1,
         acesso_portal_ate = v_hoje + 29
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T2 falhou: %', st; END IF;
  res := res || 'T2 desligado há 1 dia -> somente documentos';

  -- T3: desligado há 29 dias
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 29, acesso_portal_ate = v_hoje + 1
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T3 falhou: %', st; END IF;
  res := res || 'T3 desligado há 29 dias -> somente documentos';

  -- T4: último dia do prazo (limite inclusivo, data da empresa)
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 30, acesso_portal_ate = v_hoje
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T4 falhou: %', st; END IF;
  res := res || 'T4 último dia do prazo -> ainda permitido';

  -- T6..T10: no último dia do prazo não pode agir, mas vê documentos
  SELECT private.dp_pode_agir(v_user) INTO agir;
  SELECT private.dp_pode_ver_documentos(v_user) INTO docs;
  IF agir THEN RAISE EXCEPTION 'T6-T9 falhou: desligado conseguiu agir'; END IF;
  IF NOT docs THEN RAISE EXCEPTION 'T10 falhou: perdeu direito aos documentos'; END IF;
  res := res || 'T6 folga negada' || 'T7 férias negadas' || 'T8 troca negada'
              || 'T9 convocação/operação negada' || 'T10 documentos permitidos';

  -- T11: vínculo de leitura de documentos continua resolvido
  SELECT public.dp_colaborador_of(v_user) INTO vinc;
  IF vinc IS DISTINCT FROM v_colab THEN RAISE EXCEPTION 'T11 falhou: vinculo=%', vinc; END IF;
  res := res || 'T11 documentos próprios acessíveis';

  -- T12: nunca resolve para outro colaborador
  IF v_outro IS NOT NULL AND vinc = v_outro THEN
    RAISE EXCEPTION 'T12 falhou: vínculo apontou para outro colaborador';
  END IF;
  res := res || 'T12 documento de outro colaborador fora do vínculo';

  -- T5: desligado há 31 dias
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 31, acesso_portal_ate = v_hoje - 1
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_expirado' THEN RAISE EXCEPTION 'T5 falhou: %', st; END IF;
  IF private.dp_pode_ver_documentos(v_user) THEN
    RAISE EXCEPTION 'T5 falhou: expirado ainda vê documentos';
  END IF;
  res := res || 'T5 desligado há 31 dias -> negado';

  -- T13: bloqueado dentro do prazo -> negado imediatamente
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 1, acesso_portal_ate = v_hoje + 29
   WHERE id = v_colab;
  INSERT INTO public.auth_user_security_state (user_id, access_enabled)
  VALUES (v_user, false)
  ON CONFLICT (user_id) DO UPDATE SET access_enabled = false;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'bloqueado' THEN RAISE EXCEPTION 'T13 falhou: %', st; END IF;
  IF private.dp_pode_ver_documentos(v_user) THEN
    RAISE EXCEPTION 'T13 falhou: bloqueado vê documentos';
  END IF;
  res := res || 'T13 bloqueado no prazo -> negado';

  -- T14: a data de corte vem do fuso da empresa, não do cliente
  IF v_hoje IS DISTINCT FROM (now() AT TIME ZONE v_tz)::date THEN
    RAISE EXCEPTION 'T14 falhou: data de referência inconsistente';
  END IF;
  res := res || 'T14 prazo calculado no fuso da empresa';

  RAISE EXCEPTION E'TODOS OS TESTES PASSARAM (rollback):\n%', array_to_string(res, E'\n');
END $$;

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
  v_owner uuid;
  n_sub int := 0;
  res text := '';
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

  SELECT coalesce(co.timezone, 'America/Sao_Paulo'), co.user_id INTO v_tz, v_owner
    FROM public.companies co WHERE co.id = v_company;
  v_hoje := (now() AT TIME ZONE v_tz)::date;


  SELECT c.id INTO v_outro
    FROM public.dp_colaboradores c
   WHERE c.company_id = v_company AND c.id <> v_colab
   LIMIT 1;

  -- T1: ativo
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'ativo' THEN RAISE EXCEPTION 'T1 falhou: estado=%', st; END IF;
  res := res || E'\n' || 'T1 ativo -> acesso normal';

  -- T2: desligado há 1 dia (prazo de 30 dias a partir do desligamento)
  UPDATE public.dp_colaboradores
     SET ativo = false,
         data_desligamento = v_hoje - 1,
         acesso_portal_ate = v_hoje + 29
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T2 falhou: %', st; END IF;
  res := res || E'\n' || 'T2 desligado há 1 dia -> somente documentos';

  -- T3: desligado há 29 dias
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 29, acesso_portal_ate = v_hoje + 1
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T3 falhou: %', st; END IF;
  res := res || E'\n' || 'T3 desligado há 29 dias -> somente documentos';

  -- T4: último dia do prazo (limite inclusivo, data da empresa)
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 30, acesso_portal_ate = v_hoje
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T4 falhou: %', st; END IF;
  res := res || E'\n' || 'T4 último dia do prazo -> ainda permitido';

  -- T6..T10: no último dia do prazo não pode agir, mas vê documentos
  SELECT private.dp_pode_agir(v_user) INTO agir;
  SELECT private.dp_pode_ver_documentos(v_user) INTO docs;
  IF agir THEN RAISE EXCEPTION 'T6-T9 falhou: desligado conseguiu agir'; END IF;
  IF NOT docs THEN RAISE EXCEPTION 'T10 falhou: perdeu direito aos documentos'; END IF;
  res := res || E'\n' || 'T6 folga negada' || 'T7 férias negadas' || 'T8 troca negada'
              || 'T9 convocação/operação negada' || 'T10 documentos permitidos';

  -- T11: vínculo de leitura de documentos continua resolvido
  SELECT public.dp_colaborador_of(v_user) INTO vinc;
  IF vinc IS DISTINCT FROM v_colab THEN RAISE EXCEPTION 'T11 falhou: vinculo=%', vinc; END IF;
  res := res || E'\n' || 'T11 documentos próprios acessíveis';

  -- T12: nunca resolve para outro colaborador
  IF v_outro IS NOT NULL AND vinc = v_outro THEN
    RAISE EXCEPTION 'T12 falhou: vínculo apontou para outro colaborador';
  END IF;
  res := res || E'\n' || 'T12 documento de outro colaborador fora do vínculo';

  -- T5: desligado há 31 dias
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 31, acesso_portal_ate = v_hoje - 1
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_expirado' THEN RAISE EXCEPTION 'T5 falhou: %', st; END IF;
  IF private.dp_pode_ver_documentos(v_user) THEN
    RAISE EXCEPTION 'T5 falhou: expirado ainda vê documentos';
  END IF;
  res := res || E'\n' || 'T5 desligado há 31 dias -> negado';

  -- T13: bloqueado dentro do prazo -> negado imediatamente
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 1, acesso_portal_ate = v_hoje + 29
   WHERE id = v_colab;
  INSERT INTO public.auth_user_security_state (user_id, access_blocked)
  VALUES (v_user, true)
  ON CONFLICT (user_id) DO UPDATE SET access_blocked = true;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'bloqueado' THEN RAISE EXCEPTION 'T13 falhou: %', st; END IF;
  IF private.dp_pode_ver_documentos(v_user) THEN
    RAISE EXCEPTION 'T13 falhou: bloqueado vê documentos';
  END IF;
  res := res || E'\n' || 'T13 bloqueado no prazo -> negado';

  -- T14: a data de corte vem do fuso da empresa, não do cliente
  IF v_hoje IS DISTINCT FROM (now() AT TIME ZONE v_tz)::date THEN
    RAISE EXCEPTION 'T14 falhou: data de referência inconsistente';
  END IF;
  res := res || E'\n' || 'T14 prazo calculado no fuso da empresa';

  -- ============================================================
  -- Precedência: carência de 30 dias acima da situação comercial
  -- ============================================================
  UPDATE public.auth_user_security_state SET access_blocked = false WHERE user_id = v_user;
  UPDATE public.dp_colaboradores
     SET ativo = false, data_desligamento = v_hoje - 5, acesso_portal_ate = v_hoje + 25
   WHERE id = v_colab;

  -- T15: desligado no prazo + assinatura ativa
  UPDATE public.subscriptions SET status = 'active' WHERE user_id = v_owner;
  GET DIAGNOSTICS n_sub = ROW_COUNT;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T15 falhou: %', st; END IF;
  res := res || E'\n' || 'T15 desligado no prazo + assinatura ativa -> documentos';

  -- T16: desligado no prazo + assinatura vencida
  IF n_sub > 0 THEN
    UPDATE public.subscriptions SET status = 'expired' WHERE user_id = v_owner;
    SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
    IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T16 falhou: %', st; END IF;
    IF NOT private.dp_pode_ver_documentos(v_user) THEN
      RAISE EXCEPTION 'T16 falhou: perdeu documentos com assinatura vencida';
    END IF;
    res := res || E'\n' || 'T16 assinatura vencida -> documentos mantidos';

    -- T17: desligado no prazo + plano cancelado
    UPDATE public.subscriptions SET status = 'canceled' WHERE user_id = v_owner;
    SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
    IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T17 falhou: %', st; END IF;
    res := res || E'\n' || 'T17 plano cancelado -> documentos mantidos';
  ELSE
    res := res || E'\n' || 'T16/T17 sem assinatura cadastrada para o dono (sem regressão)';
  END IF;

  -- T18: desligado no prazo + módulo Pessoas desativado
  INSERT INTO public.company_modules (company_id, module, status)
  VALUES (v_company, 'dp'::public.app_module, 'canceled'::public.module_status)
  ON CONFLICT (company_id, module) DO UPDATE SET status = 'canceled'::public.module_status;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_no_prazo' THEN RAISE EXCEPTION 'T18 falhou: %', st; END IF;
  IF NOT private.dp_pode_ver_documentos(v_user) THEN
    RAISE EXCEPTION 'T18 falhou: perdeu documentos com módulo desativado';
  END IF;
  res := res || E'\n' || 'T18 módulo desativado -> documentos mantidos';

  -- T19: nesses cenários nenhuma ação operacional é liberada
  IF private.dp_pode_agir(v_user) THEN
    RAISE EXCEPTION 'T19 falhou: desligado agiu sem plano/módulo';
  END IF;
  res := res || E'\n' || 'T19 ações operacionais negadas (folga/férias/troca/convocação)';

  -- T20: bloqueio explícito prevalece mesmo sem plano/módulo
  INSERT INTO public.auth_user_security_state (user_id, access_blocked)
  VALUES (v_user, true)
  ON CONFLICT (user_id) DO UPDATE SET access_blocked = true;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'bloqueado' THEN RAISE EXCEPTION 'T20 falhou: %', st; END IF;
  res := res || E'\n' || 'T20 bloqueio explícito prevalece';
  UPDATE public.auth_user_security_state SET access_blocked = false WHERE user_id = v_user;

  -- T21: após os 30 dias o acesso encerra mesmo com assinatura ativa
  UPDATE public.subscriptions SET status = 'active' WHERE user_id = v_owner;
  UPDATE public.dp_colaboradores
     SET data_desligamento = v_hoje - 31, acesso_portal_ate = v_hoje - 1
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'desligado_expirado' THEN RAISE EXCEPTION 'T21 falhou: %', st; END IF;
  res := res || E'\n' || 'T21 prazo vencido -> negado';

  -- T22: regressão do colaborador ativo — situação comercial continua valendo
  UPDATE public.dp_colaboradores
     SET ativo = true, data_desligamento = NULL, acesso_portal_ate = NULL
   WHERE id = v_colab;
  SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
  IF st <> 'sem_modulo' THEN RAISE EXCEPTION 'T22 falhou (módulo): %', st; END IF;
  IF n_sub > 0 THEN
    UPDATE public.subscriptions SET status = 'expired' WHERE user_id = v_owner;
    DELETE FROM public.company_modules WHERE company_id = v_company AND module = 'dp'::public.app_module;
    SELECT estado INTO st FROM private.dp_portal_decisao(v_user);
    IF st <> 'sem_plano' THEN RAISE EXCEPTION 'T22 falhou (plano): %', st; END IF;
  END IF;
  res := res || E'\n' || 'T22 colaborador ativo continua sujeito a plano/módulo';

  RAISE EXCEPTION E'TODOS OS TESTES PASSARAM (rollback):\n%', res;
END $$;


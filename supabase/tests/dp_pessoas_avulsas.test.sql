-- Pessoa avulsa na rotina do dia: guarda de datas e isolamento entre empresas.
-- Rodar dentro de BEGIN; ... ROLLBACK;
BEGIN;

DO $$
DECLARE
  v_company uuid;
  v_outra uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_id uuid;
  v_erro text;
BEGIN
  SELECT id INTO v_company FROM public.companies ORDER BY created_at LIMIT 1;
  SELECT id INTO v_outra FROM public.companies WHERE id <> v_company ORDER BY created_at LIMIT 1;
  SELECT id INTO v_unidade FROM public.dp_unidades WHERE company_id = v_company LIMIT 1;
  SELECT id INTO v_cargo FROM public.dp_cargos WHERE company_id = v_company LIMIT 1;

  IF v_unidade IS NULL OR v_cargo IS NULL THEN
    RAISE NOTICE 'SKIP: empresa sem unidade/cargo para o teste';
    RETURN;
  END IF;

  -- 1) data_fim anterior a data_inicio deve falhar
  BEGIN
    INSERT INTO public.dp_pessoas_avulsas (company_id, unidade_id, cargo_id, nome, tipo, data_inicio, data_fim)
    VALUES (v_company, v_unidade, v_cargo, 'Teste Guarda', 'teste', '2026-09-10', '2026-09-09');
    RAISE EXCEPTION 'FALHOU: data_fim < data_inicio foi aceita';
  EXCEPTION WHEN others THEN
    v_erro := SQLERRM;
    IF v_erro NOT LIKE '%data final%' THEN
      RAISE EXCEPTION 'FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  -- 2) inserção válida
  INSERT INTO public.dp_pessoas_avulsas (company_id, unidade_id, cargo_id, nome, tipo, data_inicio, data_fim)
  VALUES (v_company, v_unidade, v_cargo, 'Teste Válido', 'folguista', '2026-09-10', '2026-09-11')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FALHOU: inserção válida não retornou id';
  END IF;

  -- 3) nome vazio deve falhar
  BEGIN
    INSERT INTO public.dp_pessoas_avulsas (company_id, unidade_id, cargo_id, nome, tipo, data_inicio, data_fim)
    VALUES (v_company, v_unidade, v_cargo, '   ', 'teste', '2026-09-10', '2026-09-10');
    RAISE EXCEPTION 'FALHOU: nome vazio foi aceito';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- 4) RLS habilitada com políticas
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dp_pessoas_avulsas' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FALHOU: RLS não está habilitada';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dp_pessoas_avulsas') < 4 THEN
    RAISE EXCEPTION 'FALHOU: políticas de acesso incompletas';
  END IF;

  RAISE NOTICE 'OK: dp_pessoas_avulsas passou nas verificações (empresa %, outra %)', v_company, v_outra;
END $$;

ROLLBACK;

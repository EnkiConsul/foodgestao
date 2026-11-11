-- 1) Feriados nacionais semeados ao criar a unidade nascem com a categoria correta.
CREATE OR REPLACE FUNCTION public.dp_unidade_seed_feriados_nacionais(_unidade_id uuid, _company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO public.dp_unidade_feriados (company_id, unidade_id, nome, tipo, categoria, dia, mes, ativo)
  SELECT _company_id, _unidade_id, v.nome, 'anual', 'nacional', v.dia, v.mes, true
  FROM (VALUES
    ('Confraternização Universal',1,1),('Tiradentes',21,4),('Dia do Trabalho',1,5),
    ('Independência do Brasil',7,9),('Nossa Senhora Aparecida',12,10),('Finados',2,11),
    ('Proclamação da República',15,11),('Consciência Negra',20,11),('Natal',25,12)
  ) AS v(nome, dia, mes)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dp_unidade_feriados f
    WHERE f.unidade_id = _unidade_id AND f.tipo = 'anual' AND f.dia = v.dia AND f.mes = v.mes
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- 2) Corrige só os nacionais criados pelo próprio sistema (sem autor) que ficaram como municipais.
UPDATE public.dp_unidade_feriados f
   SET categoria = 'nacional'
  FROM (VALUES
    ('Confraternização Universal',1,1),('Tiradentes',21,4),('Dia do Trabalho',1,5),
    ('Independência do Brasil',7,9),('Nossa Senhora Aparecida',12,10),('Finados',2,11),
    ('Proclamação da República',15,11),('Consciência Negra',20,11),('Natal',25,12)
  ) AS v(nome, dia, mes)
 WHERE f.tipo = 'anual' AND f.categoria = 'municipal' AND f.created_by IS NULL
   AND f.nome = v.nome AND f.dia = v.dia AND f.mes = v.mes;

-- 3) Setores do lote em uma palavra: renomeia os compostos ainda sem colaboradores.
UPDATE public.dp_setores s SET nome = x.novo, updated_at = now()
  FROM (VALUES ('SALÃO E ATENDIMENTO','ATENDIMENTO'),('LIMPEZA E HIGIENE','LIMPEZA'),('ADMINISTRAÇÃO E APOIO','ADMINISTRAÇÃO')) AS x(antigo, novo)
 WHERE s.nome = x.antigo
   AND NOT EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.setor_id = s.id)
   AND NOT EXISTS (
     SELECT 1 FROM public.dp_setores o
      WHERE o.unidade_id = s.unidade_id AND o.id <> s.id
        AND public.dp_nome_normalizado(o.nome) = public.dp_nome_normalizado(x.novo)
   );

-- 4) Lote do Rancho 330: cumins vão para o Salão (função específica de mesa).
DO $$
DECLARE
  v_lote uuid := 'c2a96d82-5678-41ab-a380-b90025d64f2a';
  v_unidade uuid := 'fd86c679-993f-4aeb-b610-7c6441c775e6';
  v_company uuid;
  v_salao uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = v_unidade;
  IF v_company IS NULL OR NOT EXISTS (SELECT 1 FROM public.dp_ficha_importacoes WHERE id = v_lote AND organizacao ? 'grupos') THEN
    RETURN;
  END IF;
  SELECT id INTO v_salao FROM public.dp_setores
   WHERE unidade_id = v_unidade AND public.dp_nome_normalizado(nome) = public.dp_nome_normalizado('SALÃO') LIMIT 1;
  IF v_salao IS NULL THEN
    INSERT INTO public.dp_setores (company_id, unidade_id, nome, ativo)
    VALUES (v_company, v_unidade, 'SALÃO', true) RETURNING id INTO v_salao;
  END IF;
  UPDATE public.dp_ficha_importacoes
     SET organizacao = jsonb_set(organizacao, '{grupos,CUMIM|513415,setor_id}', to_jsonb(v_salao::text))
   WHERE id = v_lote AND organizacao #> '{grupos,CUMIM|513415}' IS NOT NULL;
END $$;
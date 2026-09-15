-- Concorrência da aplicação de ficha — CHAMADA (executada em paralelo).
--
-- Recebe :idx (1..4). idx 1 e 2 aplicam o MESMO item (corrida no mesmo item);
-- idx 3 e 4 aplicam dois itens diferentes do MESMO lote (corrida nos
-- contadores). Nenhuma chamada pode falhar.
--
-- ⚠ Só em banco isolado/descartável (usa public.zz_ficha_conc_fix).

\set ON_ERROR_STOP on

SELECT set_config('request.jwt.claims',
         json_build_object('sub', admin_a, 'role', 'authenticated', 'aud', 'authenticated')::text, false),
       set_config('request.jwt.claim.sub', admin_a::text, false),
       set_config('request.jwt.claim.role', 'authenticated', false)
  FROM public.zz_ficha_conc_fix;

SET ROLE authenticated;

SELECT public.dp_ficha_aplicar(
         p_item_id => CASE WHEN :idx IN (1, 2) THEN f.it1 WHEN :idx = 3 THEN f.it2 ELSE f.it3 END,
         p_dados => jsonb_build_object(
           'nome', 'CONC ' || :idx,
           'cpf', CASE WHEN :idx IN (1, 2) THEN '11144477735'
                       WHEN :idx = 3 THEN '12345678909' ELSE '19131243055' END,
           'data_admissao', '2026-03-01'),
         p_cargo_id => f.cargo_a,
         p_unidade_id => f.unidade_a,
         p_regime => 'clt',
         p_forma_pagamento => 'mensalista',
         p_jornada => jsonb_build_object('dias', jsonb_build_array(
           jsonb_build_object('dow', 0, 'trabalha', false),
           jsonb_build_object('dow', 1, 'trabalha', true, 'entrada', '08:00', 'saida', '17:00', 'intervalo_minutos', 60)))
       ) AS resultado
  FROM public.zz_ficha_conc_fix f;

RESET ROLE;

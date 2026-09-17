-- Concorrência da conclusão da Pré-Admissão — CHAMADA (executada em paralelo).
--
-- Recebe :idx (1..N). TODAS as chamadas concluem a MESMA pré-admissão: exatamente
-- uma cria o cadastro e as demais devem retornar idempotência. Nenhuma pode
-- falhar (a serialização é do advisory lock + FOR UPDATE, não do cliente).
--
-- ⚠ Só em banco isolado/descartável (usa public.zz_preadm_conc_fix).

\set ON_ERROR_STOP on

SELECT set_config('request.jwt.claims',
         json_build_object('sub', admin_a, 'role', 'authenticated', 'aud', 'authenticated')::text, false),
       set_config('request.jwt.claim.sub', admin_a::text, false),
       set_config('request.jwt.claim.role', 'authenticated', false)
  FROM public.zz_preadm_conc_fix;

SET ROLE authenticated;

SELECT public.dp_preadmissao_efetivar_com_ficha(
         p_preadmissao_id => f.preadmissao_a,
         p_item_id => f.item_a,
         p_dados => jsonb_build_object(
           'nome', 'CANDIDATO CONCORRENCIA',
           'cpf', '11144477735',
           'data_nascimento', '1994-02-03',
           'data_admissao', '2026-03-02',
           'sexo', 'M'),
         p_cargo_id => f.cargo_a,
         p_unidade_id => f.unidade_a,
         p_regime => 'clt',
         p_forma_pagamento => 'mensalista',
         p_jornada => jsonb_build_object('dias', jsonb_build_array(
           jsonb_build_object('dow', 0, 'trabalha', false),
           jsonb_build_object('dow', 1, 'trabalha', true, 'entrada', '08:00', 'saida', '17:00',
                              'intervalo_minutos', 60)))
       ) AS resultado
  FROM public.zz_preadm_conc_fix f;

RESET ROLE;

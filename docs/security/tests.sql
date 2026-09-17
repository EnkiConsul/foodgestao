\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

INSERT INTO public.dp_preadmissoes (id, company_id, candidato_nome, whatsapp, status)
VALUES ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',
        'CANDIDATO A','5562999990000','em_preenchimento'),
       ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',
        'CANDIDATO B','5562999990001','em_preenchimento');

-- T1: salvar valido com "menor_guarda" (frontend usa sublinhado)
SELECT 'T1 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333',
  ARRAY['aguardando_preenchimento','em_preenchimento','correcao_solicitada','aguardando_nova_versao'],
  'em_preenchimento', '{"nome_completo":"CANDIDATO A"}'::jsonb, '{"cpf":"52998224725"}'::jsonb,
  '[{"nome":"filho um","parentesco":"menor_guarda","data_nascimento":"2020-03-01","finalidade_dependente":true}]'::jsonb
))::text;

-- T2: parentesco invalido
SELECT 'T2 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[{"nome":"x","parentesco":"amigo","finalidade_dependente":true}]'::jsonb))::text;

-- T3: CPF de familiar invalido
SELECT 'T3 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[{"nome":"x","parentesco":"filho","cpf":"11111111111","finalidade_dependente":true}]'::jsonb))::text;

-- T4: data futura
SELECT 'T4 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  ('[{"nome":"x","parentesco":"filho","data_nascimento":"' || to_char(now()+interval '2 day','YYYY-MM-DD') ||
   '","finalidade_dependente":true}]')::jsonb))::text;

-- T5: Sesc com parentesco fora da regra
SELECT 'T5 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[{"nome":"x","parentesco":"sogro","finalidade_sesc":true}]'::jsonb))::text;

-- T6: sem finalidade
SELECT 'T6 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[{"nome":"x","parentesco":"filho"}]'::jsonb))::text;

-- T7: pessoa de OUTRA ficha (id existente em outra empresa) deve ser recusada
INSERT INTO public.dp_preadmissao_pessoas (id, preadmissao_id, company_id, nome, parentesco, finalidade_dependente)
VALUES ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555','ESTRANHO','FILHO', true);
SELECT 'T7 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[{"id":"66666666-6666-4666-8666-666666666666","nome":"x","parentesco":"filho","finalidade_dependente":true}]'::jsonb))::text;

-- T8: versao divergente recusada
SELECT 'T8 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 'em_preenchimento', NULL, '{}'::jsonb,
  '[]'::jsonb, 999))::text;

-- T9: fora do estado editavel recusado
UPDATE public.dp_preadmissoes SET status='aguardando_revisao' WHERE id='33333333-3333-4333-8333-333333333333';
SELECT 'T9 ' || (public.dp_preadmissao_salvar_candidato(
  '33333333-3333-4333-8333-333333333333',
  ARRAY['aguardando_preenchimento','em_preenchimento','correcao_solicitada','aguardando_nova_versao'],
  'em_preenchimento', NULL, '{}'::jsonb, '[]'::jsonb))::text;

-- T10: enviar com versao correta e depois idempotencia/versao velha
UPDATE public.dp_preadmissoes SET status='em_preenchimento' WHERE id='33333333-3333-4333-8333-333333333333';
SELECT 'T10a versao=' || versao FROM public.dp_preadmissoes WHERE id='33333333-3333-4333-8333-333333333333';
SELECT 'T10b ' || (public.dp_preadmissao_enviar('33333333-3333-4333-8333-333333333333',
  ARRAY['aguardando_preenchimento','em_preenchimento','correcao_solicitada','aguardando_nova_versao'],
  (SELECT versao FROM public.dp_preadmissoes WHERE id='33333333-3333-4333-8333-333333333333')))::text;
SELECT 'T10c ' || (public.dp_preadmissao_enviar('33333333-3333-4333-8333-333333333333',
  ARRAY['aguardando_preenchimento','em_preenchimento','correcao_solicitada','aguardando_nova_versao'], 1))::text;

-- T11: familiar removido logicamente (nao apagado)
SELECT 'T11 ' || count(*) || ' ativos / ' || count(removido_em) || ' removidos'
  FROM public.dp_preadmissao_pessoas WHERE preadmissao_id='33333333-3333-4333-8333-333333333333';

-- Réplica mínima das tabelas envolvidas (banco local descartável)
CREATE TABLE public.dp_preadmissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  candidato_nome text NOT NULL,
  whatsapp text NOT NULL,
  cargo_previsto_id uuid,
  unidade_prevista_id uuid,
  trabalho_apos_22h boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'aguardando_preenchimento',
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  cpf text, email text, data_nascimento date, estado_civil text, correcao_motivo text,
  enviado_em timestamptz, revisado_em timestamptz, revisado_por uuid,
  contabilidade_enviado_em timestamptz, contabilidade_retorno_em timestamptz,
  colaborador_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  ficha_oficial_conferida_em timestamptz, ficha_oficial_conferida_por uuid,
  vinculo_admissao_em date, ficha_importacao_item_id uuid,
  versao integer NOT NULL DEFAULT 1,
  UNIQUE (id, company_id)
);

CREATE TABLE public.dp_preadmissao_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL,
  company_id uuid NOT NULL,
  nome text NOT NULL, parentesco text, data_nascimento date, cpf text, rg text,
  finalidade_dependente boolean NOT NULL DEFAULT false,
  finalidade_sesc boolean NOT NULL DEFAULT false,
  removido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, preadmissao_id, company_id),
  FOREIGN KEY (preadmissao_id, company_id) REFERENCES public.dp_preadmissoes(id, company_id) ON DELETE RESTRICT
);

CREATE TABLE public.dp_preadmissao_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL, company_id uuid NOT NULL, pessoa_id uuid,
  requisito_codigo text NOT NULL, file_path text NOT NULL, file_name text NOT NULL,
  mime_type text, file_size bigint, versao integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pendente', motivo_recusa text, substituido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (preadmissao_id, company_id) REFERENCES public.dp_preadmissoes(id, company_id) ON DELETE RESTRICT
);

CREATE TABLE public.dp_preadmissao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preadmissao_id uuid NOT NULL, company_id uuid NOT NULL,
  evento text NOT NULL, detalhe jsonb NOT NULL DEFAULT '{}'::jsonb, actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (preadmissao_id, company_id) REFERENCES public.dp_preadmissoes(id, company_id) ON DELETE RESTRICT
);
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
BEGIN;
SELECT public.dp_preadmissao_salvar_candidato('33333333-3333-4333-8333-333333333333',
  ARRAY['em_preenchimento'], 'em_preenchimento', '{"nome_completo":"CANDIDATO A"}'::jsonb, '{}'::jsonb,
  '[{"nome":"filho dois","parentesco":"filho","data_nascimento":"2019-01-02","finalidade_dependente":true}]'::jsonb, 10);
SELECT pg_sleep(4);
COMMIT;
SELECT 'B ' || (public.dp_preadmissao_enviar('33333333-3333-4333-8333-333333333333',
  ARRAY['em_preenchimento'], 10))::text;
BEGIN;
SELECT 'C ' || (public.dp_preadmissao_enviar('33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 20))::text;
SELECT pg_sleep(3);
COMMIT;
SELECT 'D ' || (public.dp_preadmissao_salvar_candidato('33333333-3333-4333-8333-333333333333',
  ARRAY['em_preenchimento'], 'em_preenchimento', '{"nome_completo":"ALTERADO DEPOIS"}'::jsonb, '{}'::jsonb,
  '[]'::jsonb))::text;

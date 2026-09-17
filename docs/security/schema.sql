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

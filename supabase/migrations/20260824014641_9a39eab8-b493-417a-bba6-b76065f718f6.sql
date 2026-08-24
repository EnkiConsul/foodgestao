-- M5 (Convocações 3A.1) — Colunas aditivas em dp_convocacoes (todas nullable). Legado intocado.
-- Rollback (sem uso do fluxo novo): ALTER TABLE ... DROP COLUMN <cada coluna>; DROP CONSTRAINT das novas.

ALTER TABLE public.dp_convocacoes
  ADD COLUMN IF NOT EXISTS ocorrencia_id uuid NULL,
  ADD COLUMN IF NOT EXISTS disponibilizada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS visualizada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS inicio_previsto timestamptz NULL,
  ADD COLUMN IF NOT EXISTS fim_previsto timestamptz NULL,
  ADD COLUMN IF NOT EXISTS encerramento_operacional timestamptz NULL,
  ADD COLUMN IF NOT EXISTS timezone_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS prazo_resposta_base timestamptz NULL,
  ADD COLUMN IF NOT EXISTS compatibilidade text NULL,
  ADD COLUMN IF NOT EXISTS regime_snapshot public.dp_regime_trabalho NULL,
  ADD COLUMN IF NOT EXISTS remuneracao_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS origem_oferta text NULL,
  ADD COLUMN IF NOT EXISTS substituida_por_id uuid NULL,
  ADD COLUMN IF NOT EXISTS substitui_convocacao_id uuid NULL,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS encerramento_motivo text NULL,
  ADD COLUMN IF NOT EXISTS comparecimento text NULL,
  ADD COLUMN IF NOT EXISTS comparecimento_origem text NULL,
  ADD COLUMN IF NOT EXISTS comparecimento_registrado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comparecimento_registrado_por uuid NULL;

COMMENT ON COLUMN public.dp_convocacoes.regime_snapshot IS 'Regime apresentado no momento da disponibilização da oferta. Fonte única para descumprimento (fail closed se ausente no fluxo novo). Nunca reconstruir a partir de dp_colaboradores.';
COMMENT ON COLUMN public.dp_convocacoes.remuneracao_snapshot IS 'Condições financeiras apresentadas na oferta. Não substitui regime_snapshot.';
COMMENT ON COLUMN public.dp_convocacoes.comparecimento IS 'Resultado da prestação: compareceu|ausente. NULL = não apurado. Nunca definido pelo relógio.';

ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT uq_dp_convocacoes_id_company UNIQUE (id, company_id);

ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT dp_convocacoes_compatibilidade_check
    CHECK (compatibilidade IS NULL OR compatibilidade IN ('integral','incompativel')),
  ADD CONSTRAINT dp_convocacoes_origem_oferta_check
    CHECK (origem_oferta IS NULL OR origem_oferta IN ('convocacao','substituicao')),
  ADD CONSTRAINT dp_convocacoes_comparecimento_check
    CHECK (comparecimento IS NULL OR comparecimento IN ('compareceu','ausente')),
  ADD CONSTRAINT dp_convocacoes_comparecimento_origem_check
    CHECK (comparecimento_origem IS NULL OR comparecimento_origem IN ('ponto','manual')),
  ADD CONSTRAINT dp_convocacoes_comparecimento_coerente_check
    CHECK (comparecimento IS NOT NULL OR comparecimento_origem IS NULL),
  -- evita furo de MATCH SIMPLE quando ocorrencia_id está preenchido
  ADD CONSTRAINT dp_convocacoes_contexto_ocorrencia_check
    CHECK (ocorrencia_id IS NULL OR (unidade_id IS NOT NULL AND data IS NOT NULL));

ALTER TABLE public.dp_convocacoes
  ADD CONSTRAINT fk_dp_convocacoes_ocorrencia_contexto
    FOREIGN KEY (ocorrencia_id, company_id, unidade_id, data)
    REFERENCES public.dp_convocacao_ocorrencias(id, company_id, unidade_id, data) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_dp_convocacoes_colaborador_company
    FOREIGN KEY (colaborador_id, company_id)
    REFERENCES public.dp_colaboradores(id, company_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_dp_convocacoes_substituida_por
    FOREIGN KEY (substituida_por_id) REFERENCES public.dp_convocacoes(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_dp_convocacoes_substitui
    FOREIGN KEY (substitui_convocacao_id) REFERENCES public.dp_convocacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dp_convocacoes_ocorrencia ON public.dp_convocacoes (ocorrencia_id);

-- Higiene: funções de trigger não devem ser executáveis por usuários (linter 0028/0029)
REVOKE ALL ON FUNCTION public.dp_valida_timezone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_conv_ocor_integridade() FROM PUBLIC, anon, authenticated;
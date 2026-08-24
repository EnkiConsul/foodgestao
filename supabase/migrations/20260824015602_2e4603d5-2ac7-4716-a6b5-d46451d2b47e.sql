-- M9 (Convocações 3A.1) — ÚNICA etapa irreversível: novos valores de enum.
-- Não há rollback: valores de enum não são removíveis. Nada passa a usá-los nesta fase.
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'sem_resposta';
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'encerrada_sem_vaga';
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'encerrada_inicio_ocorrencia';
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'desistida';
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'substituida';
ALTER TYPE public.dp_convocacao_status ADD VALUE IF NOT EXISTS 'encerrada_operacionalmente';
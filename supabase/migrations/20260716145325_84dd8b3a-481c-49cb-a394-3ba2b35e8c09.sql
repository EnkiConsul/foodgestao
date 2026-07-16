
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'atestado_novo';

ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS arquivo_path text;

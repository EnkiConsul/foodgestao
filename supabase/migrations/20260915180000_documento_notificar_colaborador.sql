-- Avisos no portal do colaborador: documento novo e comprovante de pagamento.
-- Idempotente: pode ser reaplicada sem duplicar avisos (chave única).
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'documento_novo';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'comprovante_pagamento';

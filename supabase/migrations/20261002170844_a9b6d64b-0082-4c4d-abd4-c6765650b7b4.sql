ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'acerto_rescisorio';

CREATE OR REPLACE FUNCTION public.dp_documento_aceita_comprovante(_tipo dp_documento_tipo)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT _tipo::text = ANY (ARRAY[
    'contracheque','contracheque_13','contracheque_ferias','recibo_ferias','aviso_ferias',
    'adiantamento','trct','demonstrativo_rescisorio','desligamento','acerto_rescisorio',
    'plr','pro_labore','outros_pagamentos','ferias'
  ])
$function$;
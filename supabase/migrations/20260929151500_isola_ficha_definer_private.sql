-- Isola a implementação privilegiada fora da API pública. A RPC pública fica
-- SECURITY INVOKER e apenas encaminha para a implementação privada, que repete
-- a autorização explícita antes de qualquer escrita.

ALTER FUNCTION public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  SET SCHEMA private;

REVOKE ALL ON FUNCTION private.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  TO authenticated, service_role;

CREATE FUNCTION public.dp_ficha_aplicar(
  p_item_id uuid,
  p_dados jsonb,
  p_dados_extraidos jsonb DEFAULT '{}'::jsonb,
  p_campos text[] DEFAULT NULL,
  p_atualizar_existente boolean DEFAULT false,
  p_cargo_id uuid DEFAULT NULL,
  p_unidade_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL,
  p_regime text DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_possui_folha_ponto boolean DEFAULT NULL,
  p_optante_adiantamento boolean DEFAULT NULL,
  p_jornada jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
VOLATILE
SET search_path = public, private
AS $fn$
  SELECT private.dp_ficha_aplicar(
    p_item_id, p_dados, p_dados_extraidos, p_campos, p_atualizar_existente,
    p_cargo_id, p_unidade_id, p_setor_id, p_turno_id, p_regime,
    p_forma_pagamento, p_possui_folha_ponto, p_optante_adiantamento, p_jornada
  );
$fn$;

COMMENT ON FUNCTION public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  IS 'RPC pública sem privilégio; encaminha à implementação privada que valida dp.colaboradores/inclusao.';

REVOKE ALL ON FUNCTION public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  TO authenticated, service_role;

-- 1. Exceção por sexo nas regras de admissão -------------------------------
CREATE TABLE IF NOT EXISTS public.dp_admissao_regra_sexos (
  regra_id uuid NOT NULL REFERENCES public.dp_admissao_regras(id) ON DELETE CASCADE,
  sexo text NOT NULL CHECK (sexo IN ('masculino','feminino')),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  PRIMARY KEY (regra_id, sexo)
);

GRANT SELECT ON public.dp_admissao_regra_sexos TO authenticated;
GRANT ALL ON public.dp_admissao_regra_sexos TO service_role;
ALTER TABLE public.dp_admissao_regra_sexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dp_admissao_regra_sexos_select" ON public.dp_admissao_regra_sexos;
CREATE POLICY "dp_admissao_regra_sexos_select" ON public.dp_admissao_regra_sexos
FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS dp_admissao_regra_sexos_guard ON public.dp_admissao_regra_sexos;
CREATE TRIGGER dp_admissao_regra_sexos_guard
BEFORE INSERT OR UPDATE ON public.dp_admissao_regra_sexos
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_regra_filha_guard();

-- 2. Gravação: sexos no mesmo lock da regra -------------------------------
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_salvar(p_regra jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := (p_regra->>'company_id')::uuid;
  v_id uuid := NULLIF(p_regra->>'id','')::uuid;
  v_tipo text := p_regra->>'tipo';
  v_chave text := btrim(coalesce(p_regra->>'chave',''));
  v_exig text := p_regra->>'exigencia';
  v_padrao boolean := coalesce((p_regra->>'padrao')::boolean, false);
  v_uid uuid := auth.uid();
  v_item uuid;
  v_reg text;
  v_sexo text;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'empresa_obrigatoria'; END IF;
  IF NOT (private.is_company_admin_or_owner(v_uid, v_company) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF v_tipo NOT IN ('campo','documento') THEN RAISE EXCEPTION 'tipo_invalido'; END IF;
  IF v_exig NOT IN ('obrigatorio','opcional','nao_pedir') THEN RAISE EXCEPTION 'exigencia_invalida'; END IF;
  IF length(v_chave) < 1 OR length(v_chave) > 80 THEN RAISE EXCEPTION 'chave_invalida'; END IF;

  IF v_id IS NULL AND v_padrao THEN
    SELECT id INTO v_id FROM public.dp_admissao_regras
    WHERE company_id = v_company AND tipo = v_tipo AND chave = v_chave AND padrao
    FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_admissao_regras (company_id, tipo, chave, exigencia, padrao)
    VALUES (v_company, v_tipo, v_chave, v_exig, v_padrao)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_admissao_regras
    SET exigencia = v_exig, chave = v_chave, tipo = v_tipo, padrao = v_padrao, updated_at = now()
    WHERE id = v_id AND company_id = v_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'regra_nao_encontrada'; END IF;
    DELETE FROM public.dp_admissao_regra_unidades WHERE regra_id = v_id;
    DELETE FROM public.dp_admissao_regra_cargos WHERE regra_id = v_id;
    DELETE FROM public.dp_admissao_regra_regimes WHERE regra_id = v_id;
    DELETE FROM public.dp_admissao_regra_sexos WHERE regra_id = v_id;
  END IF;

  IF NOT v_padrao THEN
    FOR v_item IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_regra->'unidades','[]'::jsonb))
    LOOP
      INSERT INTO public.dp_admissao_regra_unidades (regra_id, unidade_id, company_id)
      VALUES (v_id, v_item, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_item IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(coalesce(p_regra->'cargos','[]'::jsonb))
    LOOP
      INSERT INTO public.dp_admissao_regra_cargos (regra_id, cargo_id, company_id)
      VALUES (v_id, v_item, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_reg IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_regra->'regimes','[]'::jsonb))
    LOOP
      IF v_reg NOT IN ('clt','pj','estagio','temporario','mei','intermitente','freelancer') THEN
        RAISE EXCEPTION 'vinculo_invalido';
      END IF;
      INSERT INTO public.dp_admissao_regra_regimes (regra_id, regime, company_id)
      VALUES (v_id, v_reg::public.dp_regime_trabalho, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_sexo IN SELECT lower(btrim(value #>> '{}')) FROM jsonb_array_elements(coalesce(p_regra->'sexos','[]'::jsonb))
    LOOP
      IF v_sexo NOT IN ('masculino','feminino') THEN RAISE EXCEPTION 'sexo_invalido'; END IF;
      INSERT INTO public.dp_admissao_regra_sexos (regra_id, sexo, company_id)
      VALUES (v_id, v_sexo, v_company) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_admissao_regra_salvar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_salvar(jsonb) TO authenticated, service_role;

-- 3. Resolvedor com sexo (peso 1) -----------------------------------------
CREATE OR REPLACE FUNCTION public.dp_admissao_regras_resolver(
  p_company_id uuid,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_cargo_id uuid DEFAULT NULL::uuid,
  p_regime dp_regime_trabalho DEFAULT NULL::dp_regime_trabalho,
  p_sexo text DEFAULT NULL::text
)
 RETURNS TABLE(tipo text, chave text, exigencia text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (r.tipo, r.chave) r.tipo, r.chave, r.exigencia
  FROM public.dp_admissao_regras r
  WHERE r.company_id = p_company_id
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_unidades x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_unidades x
        WHERE x.regra_id = r.id AND x.unidade_id = p_unidade_id
      )
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_cargos x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_cargos x
        WHERE x.regra_id = r.id AND x.cargo_id = p_cargo_id
      )
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_regimes x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_regimes x
        WHERE x.regra_id = r.id AND x.regime = p_regime
      )
    )
    AND (
      NOT EXISTS (SELECT 1 FROM public.dp_admissao_regra_sexos x WHERE x.regra_id = r.id)
      OR EXISTS (
        SELECT 1 FROM public.dp_admissao_regra_sexos x
        WHERE x.regra_id = r.id
          AND x.sexo = CASE
            WHEN lower(coalesce(p_sexo,'')) LIKE 'm%' THEN 'masculino'
            WHEN lower(coalesce(p_sexo,'')) LIKE 'f%' THEN 'feminino'
            ELSE NULL
          END
      )
    )
  ORDER BY r.tipo, r.chave,
    (CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_cargos x WHERE x.regra_id = r.id) THEN 8 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_regimes x WHERE x.regra_id = r.id) THEN 4 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_unidades x WHERE x.regra_id = r.id) THEN 2 ELSE 0 END
     + CASE WHEN EXISTS (SELECT 1 FROM public.dp_admissao_regra_sexos x WHERE x.regra_id = r.id) THEN 1 ELSE 0 END) DESC,
    r.updated_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, dp_regime_trabalho, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regras_resolver(uuid, uuid, uuid, dp_regime_trabalho, text) TO authenticated, service_role;

-- 4. Documentos: responsável e grupo -------------------------------------
ALTER TABLE public.dp_documento_requisitos
  ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT 'identificacao';

ALTER TABLE public.dp_documento_requisitos
  DROP CONSTRAINT IF EXISTS dp_documento_requisitos_responsavel_chk;
ALTER TABLE public.dp_documento_requisitos
  ADD CONSTRAINT dp_documento_requisitos_responsavel_chk
  CHECK (responsavel IN ('colaborador','empresa'));

UPDATE public.dp_documento_requisitos SET responsavel = 'empresa'
WHERE codigo IN ('contrato_trabalho','ficha_registro','termo_epi','termo_jornada','termo_veiculo_empresa','aso_admissional');

UPDATE public.dp_documento_requisitos SET grupo = CASE
  WHEN codigo IN ('cnh_valida','cnh_sem_suspensao','crlv','seguro_veiculo','propriedade_veiculo','termo_veiculo_empresa','licenciamento_veiculo') THEN 'motorista'
  WHEN codigo LIKE 'dep_%' THEN 'dependentes'
  WHEN codigo IN ('comprovante_residencia','comprovante_endereco') THEN 'endereco'
  WHEN codigo IN ('dados_bancarios') THEN 'pagamento'
  WHEN codigo IN ('contrato_social_pj') THEN 'vinculo'
  WHEN codigo IN ('contrato_trabalho','ficha_registro','termo_epi','termo_jornada','aso_admissional') THEN 'empresa'
  ELSE 'identificacao'
END;

-- Comprovante de dados bancários sai da lista pedida (arquivos preservados).
UPDATE public.dp_documento_requisitos SET obrigatoriedade = 'desativado'
WHERE codigo = 'dados_bancarios';

-- 5. Equivalências do sistema (CNH atende identidade e CPF) --------------
CREATE TABLE IF NOT EXISTS public.dp_doc_equivalencias (
  grupo text NOT NULL,
  codigo text NOT NULL,
  atende text NOT NULL,
  observacao text,
  PRIMARY KEY (grupo, codigo, atende)
);

GRANT SELECT ON public.dp_doc_equivalencias TO authenticated;
GRANT ALL ON public.dp_doc_equivalencias TO service_role;
ALTER TABLE public.dp_doc_equivalencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dp_doc_equivalencias_select" ON public.dp_doc_equivalencias;
CREATE POLICY "dp_doc_equivalencias_select" ON public.dp_doc_equivalencias
FOR SELECT TO authenticated USING (true);

INSERT INTO public.dp_doc_equivalencias (grupo, codigo, atende, observacao) VALUES
  ('identidade','identidade','identidade', NULL),
  ('identidade','cnh_valida','identidade','CNH válida vale como identidade com foto.'),
  ('identidade','rg','identidade', NULL),
  ('cpf','cpf','cpf', NULL),
  ('cpf','cnh_valida','cpf','CNH traz o CPF impresso.'),
  ('cpf','identidade','cpf','RG com CPF impresso atende o CPF.')
ON CONFLICT DO NOTHING;

-- 6. Dados de pagamento do colaborador -----------------------------------
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS banco_codigo text,
  ADD COLUMN IF NOT EXISTS banco_nome text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS conta_digito text,
  ADD COLUMN IF NOT EXISTS conta_tipo text,
  ADD COLUMN IF NOT EXISTS titular_proprio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS titular_nome text,
  ADD COLUMN IF NOT EXISTS titular_cpf text,
  ADD COLUMN IF NOT EXISTS pix_tipo text,
  ADD COLUMN IF NOT EXISTS pix_chave text,
  ADD COLUMN IF NOT EXISTS recebe_em_especie boolean NOT NULL DEFAULT false;

ALTER TABLE public.dp_colaboradores DROP CONSTRAINT IF EXISTS dp_colaboradores_conta_tipo_chk;
ALTER TABLE public.dp_colaboradores ADD CONSTRAINT dp_colaboradores_conta_tipo_chk
  CHECK (conta_tipo IS NULL OR conta_tipo IN ('corrente','poupanca','pagamento','salario'));

ALTER TABLE public.dp_colaboradores DROP CONSTRAINT IF EXISTS dp_colaboradores_pix_tipo_chk;
ALTER TABLE public.dp_colaboradores ADD CONSTRAINT dp_colaboradores_pix_tipo_chk
  CHECK (pix_tipo IS NULL OR pix_tipo IN ('cpf','cnpj','email','telefone','aleatoria'));

-- Titular de terceiro precisa de nome e CPF (validação no banco, fail closed).
CREATE OR REPLACE FUNCTION public.dp_colaborador_pagamento_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.titular_proprio IS FALSE
     AND (coalesce(btrim(NEW.titular_nome),'') = '' OR coalesce(btrim(NEW.titular_cpf),'') = '')
     AND (coalesce(btrim(NEW.conta),'') <> '' OR coalesce(btrim(NEW.pix_chave),'') <> '') THEN
    RAISE EXCEPTION 'titular_incompleto';
  END IF;
  IF NEW.recebe_em_especie IS TRUE THEN
    NEW.titular_proprio := true;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_colaborador_pagamento_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS dp_colaborador_pagamento_guard_trg ON public.dp_colaboradores;
CREATE TRIGGER dp_colaborador_pagamento_guard_trg
BEFORE INSERT OR UPDATE ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colaborador_pagamento_guard();

-- ROLLBACK (não destrutivo, executar em ordem inversa):
--   DROP TRIGGER dp_colaborador_pagamento_guard_trg ON public.dp_colaboradores;
--   DROP FUNCTION public.dp_colaborador_pagamento_guard();
--   -- colunas de pagamento e as tabelas novas podem permanecer sem efeito;
--   -- para reverter o comportamento basta restaurar as versões anteriores de
--   -- dp_admissao_regra_salvar e dp_admissao_regras_resolver (sem p_sexo) e
--   -- UPDATE dp_documento_requisitos SET obrigatoriedade='opcional' WHERE codigo='dados_bancarios';
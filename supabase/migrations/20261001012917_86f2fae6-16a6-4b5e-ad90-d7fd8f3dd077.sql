-- 1) Catálogo de finalidades (convênios) por empresa.
CREATE TABLE public.dp_admissao_finalidades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9_]{2,40}$' AND codigo <> 'dependente_legal'),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 60),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, codigo)
);

GRANT SELECT ON public.dp_admissao_finalidades TO authenticated;
GRANT ALL ON public.dp_admissao_finalidades TO service_role;
ALTER TABLE public.dp_admissao_finalidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_admissao_finalidades_admin_read ON public.dp_admissao_finalidades
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR public.is_super_admin((SELECT auth.uid())));

CREATE POLICY dp_admissao_finalidades_colab_read ON public.dp_admissao_finalidades
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.company_id = dp_admissao_finalidades.company_id
      AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
  ));

CREATE TRIGGER dp_admissao_finalidades_touch
BEFORE UPDATE ON public.dp_admissao_finalidades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Parentescos passam a guardar a lista de finalidades permitidas.
ALTER TABLE public.dp_admissao_regra_parentescos
  ADD COLUMN finalidades text[] NOT NULL DEFAULT '{}';

UPDATE public.dp_admissao_regra_parentescos
SET finalidades = (
  CASE WHEN permite_dependente THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
  || CASE WHEN permite_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END
);

-- Mantém as marcações antigas em sincronia com a lista nova (compatibilidade).
CREATE OR REPLACE FUNCTION public.dp_admissao_parentescos_sync_finalidades()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(array_length(NEW.finalidades, 1), 0) = 0 THEN
      NEW.finalidades :=
        (CASE WHEN NEW.permite_dependente THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
         || CASE WHEN NEW.permite_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END);
    END IF;
  ELSIF NEW.finalidades IS DISTINCT FROM OLD.finalidades THEN
    NULL;
  ELSIF NEW.permite_dependente IS DISTINCT FROM OLD.permite_dependente
     OR NEW.permite_sesc IS DISTINCT FROM OLD.permite_sesc THEN
    NEW.finalidades :=
      (CASE WHEN NEW.permite_dependente THEN ARRAY['dependente_legal'] ELSE ARRAY[]::text[] END
       || CASE WHEN NEW.permite_sesc THEN ARRAY['sesc'] ELSE ARRAY[]::text[] END);
  END IF;
  NEW.permite_dependente := 'dependente_legal' = ANY (NEW.finalidades);
  NEW.permite_sesc := 'sesc' = ANY (NEW.finalidades);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER dp_admissao_parentescos_sync_finalidades_trg
BEFORE INSERT OR UPDATE ON public.dp_admissao_regra_parentescos
FOR EACH ROW EXECUTE FUNCTION public.dp_admissao_parentescos_sync_finalidades();

-- 3) Rotinas de manutenção do catálogo.
CREATE OR REPLACE FUNCTION public.dp_admissao_finalidade_salvar(
  p_company_id uuid, p_codigo text, p_nome text, p_ativo boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cod text := lower(btrim(coalesce(p_codigo, '')));
        v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  v_cod := regexp_replace(v_cod, '[^a-z0-9]+', '_', 'g');
  v_cod := btrim(v_cod, '_');
  IF v_cod = 'dependente_legal' OR v_cod !~ '^[a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'FINALIDADE_CODIGO_INVALIDO';
  END IF;
  IF length(v_nome) < 2 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'FINALIDADE_NOME_INVALIDO';
  END IF;
  PERFORM private.dp_regras_fila(format('finalidade|%s|%s', p_company_id, upper(v_cod)));
  INSERT INTO public.dp_admissao_finalidades (company_id, codigo, nome, ativo)
  VALUES (p_company_id, v_cod, v_nome, coalesce(p_ativo, true))
  ON CONFLICT (company_id, codigo) DO UPDATE
    SET nome = excluded.nome, ativo = excluded.ativo, updated_at = now();
  PERFORM private.dp_regras_hist(p_company_id, 'Finalidade de familiar — salva', NULL,
    jsonb_build_object('codigo', v_cod, 'nome', v_nome, 'ativo', coalesce(p_ativo, true)), NULL, NULL, false);
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_finalidade_salvar(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_finalidade_salvar(uuid,text,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_admissao_finalidade_remover(p_company_id uuid, p_codigo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cod text := lower(btrim(coalesce(p_codigo, '')));
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  PERFORM private.dp_regras_fila(format('finalidade|%s|%s', p_company_id, upper(v_cod)));
  DELETE FROM public.dp_admissao_finalidades WHERE company_id = p_company_id AND codigo = v_cod;
  UPDATE public.dp_admissao_regra_parentescos
    SET finalidades = array_remove(finalidades, v_cod)
    WHERE company_id = p_company_id AND v_cod = ANY (finalidades);
  PERFORM private.dp_regras_hist(p_company_id, 'Finalidade de familiar — removida', NULL,
    jsonb_build_object('codigo', v_cod), NULL, NULL, false);
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_finalidade_remover(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_finalidade_remover(uuid,text) TO authenticated, service_role;

-- 4) Definir as finalidades permitidas de um parentesco.
CREATE OR REPLACE FUNCTION public.dp_admissao_regra_parentesco_definir_v2(
  p_company_id uuid, p_parentesco text, p_finalidades text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p text := lower(btrim(coalesce(p_parentesco, '')));
        v_lista text[];
        v_cod text;
BEGIN
  PERFORM private.dp_regras_admin(p_company_id);
  IF v_p = '' OR length(v_p) > 40 OR v_p !~ '^[a-z0-9_ ]+$' THEN
    RAISE EXCEPTION 'REGRA_PARENTESCO_INVALIDO';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_lista
  FROM unnest(coalesce(p_finalidades, '{}')) AS t(x)
  WHERE btrim(coalesce(x, '')) <> '';
  FOREACH v_cod IN ARRAY v_lista LOOP
    IF v_cod <> 'dependente_legal' AND NOT EXISTS (
      SELECT 1 FROM public.dp_admissao_finalidades f
      WHERE f.company_id = p_company_id AND f.codigo = v_cod AND f.ativo
    ) THEN
      RAISE EXCEPTION 'FINALIDADE_DESCONHECIDA';
    END IF;
  END LOOP;
  IF coalesce(array_length(v_lista, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FINALIDADE_OBRIGATORIA';
  END IF;
  PERFORM private.dp_regras_fila(format('parentesco|%s|%s', p_company_id, upper(v_p)));
  INSERT INTO public.dp_admissao_regra_parentescos (company_id, parentesco, finalidades)
  VALUES (p_company_id, v_p, v_lista)
  ON CONFLICT (company_id, parentesco) DO UPDATE
    SET finalidades = excluded.finalidades, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.dp_admissao_regra_parentesco_definir_v2(uuid,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_definir_v2(uuid,text,text[]) TO authenticated, service_role;
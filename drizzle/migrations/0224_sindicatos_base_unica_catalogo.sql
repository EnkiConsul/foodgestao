-- Base única de sindicatos: catálogo compartilhado entre empresas, com
-- abrangência (municípios) acumulada a partir das unidades que vinculam cada sindicato.

CREATE TABLE public.dp_sindicatos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo public.dp_sindicato_tipo NOT NULL,
  cnpj text,
  uf text,
  municipios text[] NOT NULL DEFAULT '{}',
  contato_telefone text,
  contato_email text,
  data_base_mes smallint,
  origem text NOT NULL DEFAULT 'colaborativo',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_sindicatos_catalogo_cnpj_formato CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  CONSTRAINT dp_sindicatos_catalogo_uf_formato CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  CONSTRAINT dp_sindicatos_catalogo_mes CHECK (data_base_mes IS NULL OR data_base_mes BETWEEN 1 AND 12),
  CONSTRAINT dp_sindicatos_catalogo_origem CHECK (origem IN ('aveto', 'colaborativo'))
);

CREATE UNIQUE INDEX dp_sindicatos_catalogo_cnpj_uk
  ON public.dp_sindicatos_catalogo (cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX dp_sindicatos_catalogo_tipo_uf_idx
  ON public.dp_sindicatos_catalogo (tipo, uf) WHERE ativo;

GRANT SELECT ON public.dp_sindicatos_catalogo TO authenticated;
GRANT ALL ON public.dp_sindicatos_catalogo TO service_role;

ALTER TABLE public.dp_sindicatos_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_sindicatos_catalogo_leitura
  ON public.dp_sindicatos_catalogo
  FOR SELECT TO authenticated
  USING (ativo);

COMMENT ON TABLE public.dp_sindicatos_catalogo IS
  'Base única de sindicatos compartilhada entre empresas. Escrita só por gatilhos/RPCs SECURITY DEFINER; contato pessoal do cliente nunca é copiado.';

ALTER TABLE public.dp_sindicatos
  ADD COLUMN catalogo_id uuid REFERENCES public.dp_sindicatos_catalogo(id) ON DELETE SET NULL;
CREATE INDEX dp_sindicatos_catalogo_id_idx ON public.dp_sindicatos (company_id, catalogo_id);

-- CNPJ pelo algoritmo oficial dos dígitos verificadores.
CREATE OR REPLACE FUNCTION private.dp_cnpj_valido(p text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  c text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; d1 int; d2 int;
BEGIN
  IF length(c) <> 14 OR c ~ '^(.)\1{13}$' THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..12 LOOP s := s + substr(c, i, 1)::int * w1[i]; END LOOP;
  d1 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  s := 0;
  FOR i IN 1..12 LOOP s := s + substr(c, i, 1)::int * w2[i]; END LOOP;
  s := s + d1 * w2[13];
  d2 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  RETURN d1 = substr(c, 13, 1)::int AND d2 = substr(c, 14, 1)::int;
END $$;

-- Acrescenta um município à abrangência conhecida do sindicato, sem duplicar
-- (comparação sem acento) e só dentro da UF do sindicato.
CREATE OR REPLACE FUNCTION private.dp_sindicato_catalogo_acumular(p_catalogo_id uuid, p_cidade text, p_uf text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uf text := upper(nullif(btrim(coalesce(p_uf, '')), ''));
  v_cid text := upper(nullif(btrim(coalesce(p_cidade, '')), ''));
BEGIN
  IF p_catalogo_id IS NULL OR v_cid IS NULL OR v_uf IS NULL OR v_uf !~ '^[A-Z]{2}$' THEN
    RETURN;
  END IF;
  UPDATE public.dp_sindicatos_catalogo c
     SET uf = coalesce(c.uf, v_uf),
         municipios = c.municipios || v_cid,
         updated_at = now()
   WHERE c.id = p_catalogo_id
     AND (c.uf IS NULL OR c.uf = v_uf)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(c.municipios) m
        WHERE upper(extensions.unaccent(m)) = upper(extensions.unaccent(v_cid))
     );
END $$;

-- Recalcula a abrangência a partir de todos os vínculos do sindicato da empresa:
-- patronal pela unidade; laboral pelas unidades do cargo (ou todas as ativas da
-- empresa quando o cargo não está restrito a unidades).
CREATE OR REPLACE FUNCTION private.dp_sindicato_catalogo_sincronizar(p_sindicato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s record;
  r record;
BEGIN
  SELECT id, company_id, catalogo_id INTO s FROM public.dp_sindicatos WHERE id = p_sindicato_id;
  IF NOT FOUND OR s.catalogo_id IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT u.cidade, u.uf
      FROM public.dp_sindicato_unidades su
      JOIN public.dp_unidades u ON u.id = su.unidade_id
     WHERE su.sindicato_id = s.id
    UNION
    SELECT u.cidade, u.uf
      FROM public.dp_sindicato_cargos sc
      JOIN public.dp_unidade_cargos uc ON uc.cargo_id = sc.cargo_id
      JOIN public.dp_unidades u ON u.id = uc.unidade_id
     WHERE sc.sindicato_id = s.id
    UNION
    SELECT u.cidade, u.uf
      FROM public.dp_unidades u
     WHERE u.company_id = s.company_id
       AND u.ativo
       AND EXISTS (
         SELECT 1 FROM public.dp_sindicato_cargos sc
          WHERE sc.sindicato_id = s.id
            AND NOT EXISTS (SELECT 1 FROM public.dp_unidade_cargos uc WHERE uc.cargo_id = sc.cargo_id)
       )
  LOOP
    PERFORM private.dp_sindicato_catalogo_acumular(s.catalogo_id, r.cidade, r.uf);
  END LOOP;
END $$;

-- Liga o sindicato da empresa à base única pelo CNPJ; sindicato novo com CNPJ
-- válido passa a fazer parte da base para os próximos clientes.
CREATE OR REPLACE FUNCTION private.dp_sindicato_catalogo_vincular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cnpj text := regexp_replace(coalesce(NEW.cnpj, ''), '[^0-9]', '', 'g');
  v_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.catalogo_id IS NOT NULL AND NEW.cnpj IS NOT DISTINCT FROM OLD.cnpj THEN
    RETURN NEW;
  END IF;
  IF NOT private.dp_cnpj_valido(v_cnpj) THEN
    IF TG_OP = 'UPDATE' AND NEW.cnpj IS DISTINCT FROM OLD.cnpj THEN
      NEW.catalogo_id := NULL;
    END IF;
    RETURN NEW;
  END IF;
  SELECT id INTO v_id FROM public.dp_sindicatos_catalogo WHERE cnpj = v_cnpj;
  IF v_id IS NULL THEN
    INSERT INTO public.dp_sindicatos_catalogo (nome, tipo, cnpj, contato_telefone, data_base_mes, origem)
    VALUES (
      upper(btrim(NEW.nome)),
      NEW.tipo,
      v_cnpj,
      nullif(regexp_replace(coalesce(NEW.contato_telefone, ''), '[^0-9]', '', 'g'), ''),
      CASE WHEN NEW.data_base IS NOT NULL THEN extract(month FROM NEW.data_base)::smallint END,
      'colaborativo'
    )
    ON CONFLICT (cnpj) WHERE cnpj IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.dp_sindicatos_catalogo WHERE cnpj = v_cnpj;
    END IF;
  END IF;
  NEW.catalogo_id := v_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.dp_sindicato_catalogo_apos_sindicato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.dp_sindicato_catalogo_sincronizar(NEW.id);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.dp_sindicato_catalogo_apos_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.dp_sindicato_catalogo_sincronizar(NEW.sindicato_id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_dp_sindicato_catalogo_vincular
  BEFORE INSERT OR UPDATE ON public.dp_sindicatos
  FOR EACH ROW EXECUTE FUNCTION private.dp_sindicato_catalogo_vincular();

CREATE TRIGGER trg_dp_sindicato_catalogo_apos_insert
  AFTER INSERT ON public.dp_sindicatos
  FOR EACH ROW WHEN (NEW.catalogo_id IS NOT NULL)
  EXECUTE FUNCTION private.dp_sindicato_catalogo_apos_sindicato();

CREATE TRIGGER trg_dp_sindicato_catalogo_apos_update
  AFTER UPDATE ON public.dp_sindicatos
  FOR EACH ROW WHEN (NEW.catalogo_id IS NOT NULL AND NEW.catalogo_id IS DISTINCT FROM OLD.catalogo_id)
  EXECUTE FUNCTION private.dp_sindicato_catalogo_apos_sindicato();

CREATE TRIGGER trg_dp_sindicato_unidades_catalogo
  AFTER INSERT ON public.dp_sindicato_unidades
  FOR EACH ROW EXECUTE FUNCTION private.dp_sindicato_catalogo_apos_vinculo();

CREATE TRIGGER trg_dp_sindicato_cargos_catalogo
  AFTER INSERT ON public.dp_sindicato_cargos
  FOR EACH ROW EXECUTE FUNCTION private.dp_sindicato_catalogo_apos_vinculo();

-- Usar um sindicato da base na empresa: reaproveita o cadastro existente
-- (mesmo vínculo ou mesmo CNPJ) ou cria a cópia da empresa com os dados da base.
CREATE OR REPLACE FUNCTION public.dp_sindicato_adotar(p_company_id uuid, p_catalogo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c record;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL OR NOT (
       public.tem_permissao(p_company_id, 'dp.cadastros', 'inclusao')
       OR private.is_company_admin_or_owner(auth.uid(), p_company_id)
     ) THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar sindicatos nesta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.dp_sindicatos_catalogo WHERE id = p_catalogo_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sindicato não encontrado na base' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id INTO v_id
    FROM public.dp_sindicatos s
   WHERE s.company_id = p_company_id
     AND (s.catalogo_id = c.id
          OR (c.cnpj IS NOT NULL AND regexp_replace(coalesce(s.cnpj, ''), '[^0-9]', '', 'g') = c.cnpj))
   ORDER BY s.ativo DESC, s.created_at
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.dp_sindicatos
       SET catalogo_id = c.id, ativo = true
     WHERE id = v_id AND (catalogo_id IS DISTINCT FROM c.id OR NOT ativo);
    RETURN v_id;
  END IF;

  INSERT INTO public.dp_sindicatos (company_id, nome, cnpj, tipo, contato_telefone, contato_email, data_base, catalogo_id, ativo)
  VALUES (
    p_company_id, c.nome, c.cnpj, c.tipo, c.contato_telefone, c.contato_email,
    CASE WHEN c.data_base_mes IS NOT NULL THEN make_date(2000, c.data_base_mes, 1) END,
    c.id, true
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION private.dp_cnpj_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_sindicato_catalogo_acumular(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_sindicato_catalogo_sincronizar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_sindicato_catalogo_vincular() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_sindicato_catalogo_apos_sindicato() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_sindicato_catalogo_apos_vinculo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_sindicato_adotar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_sindicato_adotar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_sindicato_adotar(uuid, uuid) TO service_role;
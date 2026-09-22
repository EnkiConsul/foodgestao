-- Origem da admissão: de qual folguista / pessoa em teste ela nasceu.
ALTER TABLE public.dp_preadmissoes
  ADD COLUMN IF NOT EXISTS pessoa_apoio_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE SET NULL;

ALTER TABLE public.dp_ficha_importacao_itens
  ADD COLUMN IF NOT EXISTS pessoa_apoio_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dp_preadmissoes_pessoa_apoio_idx
  ON public.dp_preadmissoes (pessoa_apoio_id) WHERE pessoa_apoio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dp_ficha_itens_pessoa_apoio_idx
  ON public.dp_ficha_importacao_itens (pessoa_apoio_id) WHERE pessoa_apoio_id IS NOT NULL;

-- Fecha o vínculo da pessoa de apoio quando o cadastro é criado pela admissão.
CREATE OR REPLACE FUNCTION private.dp_apoio_promover(_pessoa_apoio_id uuid, _company_id uuid, _colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _pessoa_apoio_id IS NULL OR _colaborador_id IS NULL THEN RETURN; END IF;
  UPDATE public.dp_pessoas_apoio
     SET colaborador_id = _colaborador_id, updated_at = now()
   WHERE id = _pessoa_apoio_id
     AND company_id = _company_id
     AND colaborador_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_apoio_promover_por_admissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.colaborador_id IS NOT NULL
     AND NEW.pessoa_apoio_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.colaborador_id IS DISTINCT FROM NEW.colaborador_id
          OR OLD.pessoa_apoio_id IS DISTINCT FROM NEW.pessoa_apoio_id) THEN
    PERFORM private.dp_apoio_promover(NEW.pessoa_apoio_id, NEW.company_id, NEW.colaborador_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_preadmissoes_apoio_promover ON public.dp_preadmissoes;
CREATE TRIGGER dp_preadmissoes_apoio_promover
AFTER INSERT OR UPDATE OF colaborador_id, pessoa_apoio_id ON public.dp_preadmissoes
FOR EACH ROW EXECUTE FUNCTION public.dp_apoio_promover_por_admissao();

DROP TRIGGER IF EXISTS dp_ficha_itens_apoio_promover ON public.dp_ficha_importacao_itens;
CREATE TRIGGER dp_ficha_itens_apoio_promover
AFTER INSERT OR UPDATE OF colaborador_id, pessoa_apoio_id ON public.dp_ficha_importacao_itens
FOR EACH ROW EXECUTE FUNCTION public.dp_apoio_promover_por_admissao();

-- Rotina oficial: registra que a admissão em andamento veio de um folguista.
CREATE OR REPLACE FUNCTION public.dp_pessoa_apoio_vincular_origem(
  p_pessoa_apoio_id uuid,
  p_preadmissao_id uuid DEFAULT NULL,
  p_ficha_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apoio public.dp_pessoas_apoio;
  v_pre public.dp_preadmissoes;
  v_item public.dp_ficha_importacao_itens;
  v_colab uuid;
BEGIN
  IF p_pessoa_apoio_id IS NULL THEN
    RAISE EXCEPTION 'APOIO_OBRIGATORIO';
  END IF;
  IF (p_preadmissao_id IS NULL) = (p_ficha_item_id IS NULL) THEN
    RAISE EXCEPTION 'APOIO_ORIGEM_UNICA';
  END IF;

  SELECT * INTO v_apoio FROM public.dp_pessoas_apoio WHERE id = p_pessoa_apoio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APOIO_NAO_ENCONTRADO'; END IF;
  PERFORM private.dp_regras_admin(v_apoio.company_id);

  IF v_apoio.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_promovido', 'colaborador_id', v_apoio.colaborador_id);
  END IF;

  IF p_preadmissao_id IS NOT NULL THEN
    SELECT * INTO v_pre FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
    IF NOT FOUND OR v_pre.company_id <> v_apoio.company_id THEN
      RAISE EXCEPTION 'APOIO_ADMISSAO_INVALIDA';
    END IF;
    IF v_pre.pessoa_apoio_id IS NOT NULL AND v_pre.pessoa_apoio_id <> p_pessoa_apoio_id THEN
      RAISE EXCEPTION 'APOIO_ADMISSAO_DE_OUTRA_PESSOA';
    END IF;
    UPDATE public.dp_preadmissoes
       SET pessoa_apoio_id = p_pessoa_apoio_id, updated_at = now()
     WHERE id = p_preadmissao_id
       AND pessoa_apoio_id IS DISTINCT FROM p_pessoa_apoio_id;
    v_colab := v_pre.colaborador_id;
  ELSE
    SELECT * INTO v_item FROM public.dp_ficha_importacao_itens WHERE id = p_ficha_item_id FOR UPDATE;
    IF NOT FOUND OR v_item.company_id <> v_apoio.company_id THEN
      RAISE EXCEPTION 'APOIO_ADMISSAO_INVALIDA';
    END IF;
    IF v_item.pessoa_apoio_id IS NOT NULL AND v_item.pessoa_apoio_id <> p_pessoa_apoio_id THEN
      RAISE EXCEPTION 'APOIO_ADMISSAO_DE_OUTRA_PESSOA';
    END IF;
    UPDATE public.dp_ficha_importacao_itens
       SET pessoa_apoio_id = p_pessoa_apoio_id, updated_at = now()
     WHERE id = p_ficha_item_id
       AND pessoa_apoio_id IS DISTINCT FROM p_pessoa_apoio_id;
    v_colab := v_item.colaborador_id;
  END IF;

  IF v_colab IS NOT NULL THEN
    PERFORM private.dp_apoio_promover(p_pessoa_apoio_id, v_apoio.company_id, v_colab);
    RETURN jsonb_build_object('status', 'promovido', 'colaborador_id', v_colab);
  END IF;

  RETURN jsonb_build_object('status', 'vinculado');
END;
$$;

REVOKE ALL ON FUNCTION public.dp_pessoa_apoio_vincular_origem(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_pessoa_apoio_vincular_origem(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_pessoa_apoio_vincular_origem(uuid, uuid, uuid) TO service_role;
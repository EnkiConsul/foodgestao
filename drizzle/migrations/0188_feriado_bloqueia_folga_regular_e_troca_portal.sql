CREATE OR REPLACE FUNCTION public.dp_feriado_da_unidade_colab(_colab uuid, _data date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.nome FROM public.dp_colaboradores c
  CROSS JOIN LATERAL public.dp_feriados_resolver(c.unidade_id, _data, _data) f
  WHERE c.id = _colab AND c.unidade_id IS NOT NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.dp_feriado_da_unidade_colab(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_feriado_da_unidade_colab(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_folga_bloquear_feriado_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  IF NEW.tipo::text = 'normal' AND NEW.origem::text IN ('solicitacao','sorteio','auto_fechamento_periodo')
     AND (TG_OP = 'INSERT' OR NEW.data IS DISTINCT FROM OLD.data) THEN
    v_nome := public.dp_feriado_da_unidade_colab(NEW.colaborador_id, NEW.data);
    IF v_nome IS NOT NULL THEN
      RAISE EXCEPTION 'Data é feriado (%). Feriado com escala especial da unidade conforme ACT — indisponível para escolha de folga regular/dominical.', v_nome
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_folga_bloquear_feriado_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS dp_folga_bloquear_feriado ON public.dp_folgas;
CREATE TRIGGER dp_folga_bloquear_feriado BEFORE INSERT OR UPDATE OF data ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_folga_bloquear_feriado_trg();

CREATE OR REPLACE FUNCTION public.dp_troca_bloquear_feriado_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  IF COALESCE(NEW.origem_registro,'portal') <> 'gestor' THEN
    v_nome := COALESCE(
      public.dp_feriado_da_unidade_colab(NEW.solicitante_id, NEW.data_original),
      public.dp_feriado_da_unidade_colab(NEW.solicitante_id, NEW.data_proposta),
      public.dp_feriado_da_unidade_colab(NEW.destino_id, NEW.data_original),
      public.dp_feriado_da_unidade_colab(NEW.destino_id, NEW.data_proposta));
    IF v_nome IS NOT NULL THEN
      RAISE EXCEPTION 'Troca entre colegas não é permitida em feriado (%). Fale com o gestor da loja.', v_nome
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_troca_bloquear_feriado_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS dp_troca_bloquear_feriado ON public.dp_trocas;
CREATE TRIGGER dp_troca_bloquear_feriado BEFORE INSERT ON public.dp_trocas
  FOR EACH ROW EXECUTE FUNCTION public.dp_troca_bloquear_feriado_trg();
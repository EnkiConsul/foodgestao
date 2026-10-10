CREATE OR REPLACE FUNCTION public.dp_contatos_solicitar_confirmacao(_colaborador_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT company_id INTO _cid FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF _cid IS NULL OR NOT public.tem_permissao(_cid, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.dp_colaboradores SET contatos_solicitado_em = now() WHERE id = _colaborador_id;
END $$;

CREATE OR REPLACE FUNCTION public.dp_contatos_salvar(_colaborador_id uuid, _contatos jsonb, _confirmar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT company_id INTO _cid FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF _cid IS NULL OR NOT public.tem_permissao(_cid, 'dp.colaboradores', 'alteracao') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF NOT public._dp_contatos_emergencia_validos(_contatos) THEN
    RAISE EXCEPTION 'Informe ao menos 1 contato de emergência com nome, parentesco e WhatsApp (máximo 2)';
  END IF;
  UPDATE public.dp_colaboradores
     SET contatos_emergencia = _contatos,
         contatos_confirmados_em = CASE WHEN _confirmar THEN now() ELSE contatos_confirmados_em END,
         contatos_confirmados_por = CASE WHEN _confirmar THEN auth.uid() ELSE contatos_confirmados_por END,
         contatos_solicitado_em = CASE WHEN _confirmar THEN NULL ELSE contatos_solicitado_em END
   WHERE id = _colaborador_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_contatos_salvar(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_contatos_salvar(uuid, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_preadmissao_copiar_contatos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l jsonb := '[]'::jsonb; i int;
BEGIN
  IF NEW.colaborador_id IS NULL OR NEW.status <> 'concluido'
     OR (OLD.status = 'concluido' AND OLD.colaborador_id IS NOT DISTINCT FROM NEW.colaborador_id) THEN
    RETURN NEW;
  END IF;
  FOR i IN 1..2 LOOP
    IF length(trim(coalesce(NEW.dados->>('emerg'||i||'_nome'),''))) >= 3 THEN
      _l := _l || jsonb_build_array(jsonb_build_object(
        'nome', upper(trim(NEW.dados->>('emerg'||i||'_nome'))),
        'parentesco', coalesce(NEW.dados->>('emerg'||i||'_parentesco'),'outro_familiar'),
        'whatsapp', regexp_replace(coalesce(NEW.dados->>('emerg'||i||'_whatsapp'),''), '\D', '', 'g')));
    END IF;
  END LOOP;
  IF public._dp_contatos_emergencia_validos(_l) THEN
    UPDATE public.dp_colaboradores SET contatos_emergencia = _l, contatos_confirmados_em = now()
     WHERE id = NEW.colaborador_id AND jsonb_array_length(coalesce(contatos_emergencia,'[]'::jsonb)) = 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_copiar_contatos() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_dp_preadmissao_copiar_contatos ON public.dp_preadmissoes;
CREATE TRIGGER trg_dp_preadmissao_copiar_contatos AFTER UPDATE OF status, colaborador_id ON public.dp_preadmissoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_copiar_contatos();
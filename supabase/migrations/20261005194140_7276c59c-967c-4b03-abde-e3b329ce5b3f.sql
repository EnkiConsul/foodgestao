CREATE OR REPLACE FUNCTION public.dp_documento_avisar_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rotulo text;
  _nome text;
BEGIN
  IF NEW.tipo::text NOT IN ('contracheque','contracheque_13','contracheque_ferias','recibo_ferias','adiantamento','desligamento','trct','demonstrativo_rescisorio','acerto_rescisorio','plr','pro_labore','ferias') THEN
    RETURN NEW;
  END IF;
  IF NEW.comprovante_file_path IS NOT NULL THEN RETURN NEW; END IF;

  _rotulo := CASE
    WHEN NEW.tipo::text = 'adiantamento' THEN 'Adiantamento'
    WHEN NEW.tipo::text = 'contracheque_13' THEN '13º Salário'
    WHEN NEW.tipo::text IN ('contracheque_ferias','recibo_ferias','ferias') THEN 'Férias'
    WHEN NEW.tipo::text IN ('desligamento','trct','demonstrativo_rescisorio','acerto_rescisorio') THEN 'Rescisão'
    WHEN NEW.tipo::text = 'pro_labore' THEN 'Pró-Labore'
    WHEN NEW.tipo::text = 'plr' THEN 'PLR'
    ELSE 'Folha de Pagamento'
  END;

  SELECT nome INTO _nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  -- Um aviso por tipo, competência e empresa: evita dezenas de avisos por lote.
  INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
  VALUES (
    NEW.company_id,
    'comprovante_pagamento',
    _rotulo || ' Disponível Para Pagamento',
    'Documentos de ' || to_char(COALESCE(NEW.referencia_data, now()::date), 'MM/YYYY')
      || ' importados' || COALESCE(' (ex.: ' || _nome || ')', '')
      || '. Após pagar, anexe o comprovante em Documentos.',
    'dp_documentos',
    NEW.id,
    true,
    'pagto-' || NEW.company_id || '-' || _rotulo || '-' || to_char(COALESCE(NEW.referencia_data, now()::date), 'YYYY-MM')
  )
  ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- aviso nunca impede a importação do documento
END;
$$;

REVOKE ALL ON FUNCTION public.dp_documento_avisar_pagamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_documento_avisar_pagamento ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_avisar_pagamento
AFTER INSERT ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION public.dp_documento_avisar_pagamento();
ALTER TABLE public.dp_trocas
  ADD CONSTRAINT dp_trocas_datas_distintas CHECK (data_original <> data_proposta) NOT VALID;

ALTER TABLE public.dp_trocas
  ADD CONSTRAINT dp_trocas_pessoas_distintas CHECK (solicitante_id <> destino_id) NOT VALID;
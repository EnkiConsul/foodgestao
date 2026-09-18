-- The partial-offer workflow already writes this origin.
ALTER TABLE public.dp_convocacoes DROP CONSTRAINT dp_convocacoes_origem_oferta_check;
ALTER TABLE public.dp_convocacoes ADD CONSTRAINT dp_convocacoes_origem_oferta_check
 CHECK (origem_oferta IS NULL OR origem_oferta IN ('convocacao','substituicao','reoferta_parcial'));

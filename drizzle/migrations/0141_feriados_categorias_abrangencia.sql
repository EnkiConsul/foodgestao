ALTER TABLE public.dp_unidade_feriados ADD COLUMN categoria text NOT NULL DEFAULT 'municipal' CONSTRAINT dp_feriados_categoria_valida CHECK (categoria IN ('nacional','estadual','municipal','sindicato'));
UPDATE public.dp_unidade_feriados SET categoria = CASE WHEN tipo = 'anual' AND (dia, mes) IN ((1,1),(21,4),(1,5),(7,9),(12,10),(2,11),(15,11),(20,11),(25,12)) THEN 'nacional' ELSE 'municipal' END;
COMMENT ON COLUMN public.dp_unidade_feriados.categoria IS 'Abrangência independente do cálculo da data. Legado não federal inicialmente municipal; gestor pode revisar estadual ou CCT.';
CREATE OR REPLACE FUNCTION public.dp_feriados_resolver_v2(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text, categoria text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT r.data, r.nome, r.feriado_id, r.tipo, f.categoria FROM public.dp_feriados_resolver(_unidade_id, _inicio, _fim) r JOIN public.dp_unidade_feriados f ON f.id = r.feriado_id $$;
REVOKE ALL ON FUNCTION public.dp_feriados_resolver_v2(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_feriados_resolver_v2(uuid,date,date) TO authenticated, service_role;
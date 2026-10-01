CREATE TABLE IF NOT EXISTS public.dp_modelos_mensagem_padrao (
  id uuid primary key default gen_random_uuid(),
  titulo text not null unique,
  canal text not null,
  tipo text not null,
  assunto text,
  corpo text not null,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.dp_modelos_mensagem_padrao TO service_role;
ALTER TABLE public.dp_modelos_mensagem_padrao ENABLE ROW LEVEL SECURITY;

INSERT INTO public.dp_modelos_mensagem_padrao (titulo, canal, tipo, assunto, corpo)
SELECT titulo, canal, tipo, assunto, corpo FROM public.dp_modelos_mensagem
WHERE company_id='b0d450a7-0a70-4322-bcdb-c3abfea196ba' AND ativo
ON CONFLICT (titulo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dp_modelos_mensagem_seed(_company_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.dp_modelos_mensagem (company_id, titulo, canal, tipo, assunto, corpo, ativo)
  SELECT _company_id, p.titulo, p.canal::dp_mensagem_canal, p.tipo, p.assunto, p.corpo, true
  FROM public.dp_modelos_mensagem_padrao p
  WHERE NOT EXISTS (SELECT 1 FROM public.dp_modelos_mensagem m
    WHERE m.company_id=_company_id AND lower(m.titulo)=lower(p.titulo) AND m.canal::text=p.canal);
$$;
REVOKE ALL ON FUNCTION public.dp_modelos_mensagem_seed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_modelos_mensagem_seed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_modelos_mensagem_seed_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.dp_modelos_mensagem_seed(NEW.id); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.dp_modelos_mensagem_seed_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dp_modelos_mensagem_seed_trg ON public.companies;
CREATE TRIGGER dp_modelos_mensagem_seed_trg AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.dp_modelos_mensagem_seed_trg();

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT id FROM public.companies LOOP PERFORM public.dp_modelos_mensagem_seed(c.id); END LOOP;
END $$;
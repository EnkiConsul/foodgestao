CREATE TABLE public.recrutamento_candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  cpf text NOT NULL,
  cpf_hash text NOT NULL UNIQUE,
  nome text NOT NULL,
  data_nascimento date NOT NULL,
  whatsapp text NOT NULL,
  whatsapp_verificado_em timestamptz NOT NULL,
  conta_reutilizada boolean NOT NULL DEFAULT false,
  cidade text,
  bairro text,
  areas text[] NOT NULL DEFAULT '{}',
  turnos text[] NOT NULL DEFAULT '{}',
  fins_de_semana boolean,
  escolaridade text,
  experiencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  consentimento_em timestamptz NOT NULL,
  declaracao_veracidade_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recrutamento_candidatos_whatsapp_idx ON public.recrutamento_candidatos(whatsapp);

GRANT SELECT, UPDATE ON public.recrutamento_candidatos TO authenticated;
GRANT ALL ON public.recrutamento_candidatos TO service_role;
ALTER TABLE public.recrutamento_candidatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY rec_cand_select_proprio ON public.recrutamento_candidatos
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rec_cand_update_proprio ON public.recrutamento_candidatos
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.recrutamento_candidatos_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _a text; _t text;
BEGIN
  IF current_user <> 'service_role' AND TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.cpf IS DISTINCT FROM OLD.cpf
       OR NEW.cpf_hash IS DISTINCT FROM OLD.cpf_hash OR NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.data_nascimento IS DISTINCT FROM OLD.data_nascimento
       OR NEW.whatsapp IS DISTINCT FROM OLD.whatsapp
       OR NEW.whatsapp_verificado_em IS DISTINCT FROM OLD.whatsapp_verificado_em
       OR NEW.conta_reutilizada IS DISTINCT FROM OLD.conta_reutilizada
       OR NEW.consentimento_em IS DISTINCT FROM OLD.consentimento_em
       OR NEW.declaracao_veracidade_em IS DISTINCT FROM OLD.declaracao_veracidade_em
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Dados de identificação só mudam pelo atendimento.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF coalesce(array_length(NEW.areas,1),0) > 3 THEN
    RAISE EXCEPTION 'Escolha no máximo 3 áreas.' USING ERRCODE = '22023';
  END IF;
  FOREACH _a IN ARRAY NEW.areas LOOP
    IF _a NOT IN ('cozinha','salao','caixa','delivery','bar','limpeza','estoque','gestao') THEN
      RAISE EXCEPTION 'Área inválida.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH _t IN ARRAY NEW.turnos LOOP
    IF _t NOT IN ('manha','tarde','noite','madrugada') THEN
      RAISE EXCEPTION 'Turno inválido.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(NEW.experiencias) <> 'array' OR jsonb_array_length(NEW.experiencias) > 5 THEN
    RAISE EXCEPTION 'Informe até 5 experiências.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(NEW.cidade,'')) > 80 OR length(coalesce(NEW.bairro,'')) > 80
     OR length(coalesce(NEW.escolaridade,'')) > 60 OR length(NEW.experiencias::text) > 4000 THEN
    RAISE EXCEPTION 'Texto muito longo.' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER recrutamento_candidatos_guard BEFORE INSERT OR UPDATE ON public.recrutamento_candidatos
  FOR EACH ROW EXECUTE FUNCTION public.recrutamento_candidatos_guard();

CREATE TABLE public.recrutamento_auth_desafios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finalidade text NOT NULL CHECK (finalidade IN ('cadastro','vincular','recuperacao')),
  user_id uuid,
  cpf text,
  cpf_hash text,
  nome text,
  data_nascimento date,
  telefone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  usado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recrutamento_auth_desafios_cpf_idx ON public.recrutamento_auth_desafios(cpf_hash, created_at DESC);
GRANT ALL ON public.recrutamento_auth_desafios TO service_role;
ALTER TABLE public.recrutamento_auth_desafios ENABLE ROW LEVEL SECURITY;
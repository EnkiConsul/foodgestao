CREATE OR REPLACE FUNCTION public.dp_documento_requisitos_seed(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obrigatório';
  END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), _company_id)
          OR auth.uid() IS NULL
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  SELECT count(*) INTO v_before FROM public.dp_documento_requisitos WHERE company_id = _company_id;

  INSERT INTO public.dp_documento_requisitos
    (company_id, codigo, nome, descricao, categoria, obrigatoriedade, aplica_a, tipo_documento,
     periodicidade, meses_validade, dias_aviso, gerado_pelo_sistema, exige_aceite, satisfeito_por, sistema, ordem)
  VALUES
    (_company_id,'identidade','Documento de identidade com foto','RG ou CNH válida.','admissao','obrigatorio','todos','identidade','unica',NULL,30,false,false,NULL,true,10),
    (_company_id,'cpf','CPF','Quando não constar no documento de identidade.','admissao','obrigatorio','todos','identidade','unica',NULL,30,false,false,NULL,true,20),
    (_company_id,'contrato_trabalho','Contrato de trabalho / termo de vínculo','Gerado pelo sistema e aceito eletronicamente pelo colaborador.','admissao','obrigatorio','todos','contrato','unica',NULL,30,true,true,NULL,true,30),
    (_company_id,'ficha_registro','Ficha de registro de empregado','Gerada pelo sistema e aceita eletronicamente pelo colaborador.','admissao','obrigatorio','todos','ficha_registro','unica',NULL,30,true,true,NULL,true,40),
    (_company_id,'aso_admissional','Exame médico admissional (ASO)','Atendido pelo registro de exames do SESMT.','admissao','obrigatorio','todos','outros','unica',NULL,30,false,false,'aso_admissional',true,50),
    (_company_id,'comprovante_residencia','Comprovante de residência','O endereço cadastrado já atende ao registro; o comprovante é complementar.','admissao','opcional','todos','residencia','unica',NULL,30,false,false,NULL,true,60),
    (_company_id,'ctps_digital','Print da CTPS Digital','Conferência do PIS-NIT informado no cadastro.','admissao','opcional','todos','admissao','unica',NULL,30,false,false,NULL,true,70),
    (_company_id,'foto_cadastro','Foto 3x4 ou selfie de cadastro',NULL,'admissao','opcional','todos','admissao','unica',NULL,30,false,false,NULL,true,80),
    (_company_id,'dados_bancarios','Comprovante de dados bancários',NULL,'admissao','opcional','todos','bancario','unica',NULL,30,false,false,NULL,true,90),
    (_company_id,'titulo_eleitor','Título de eleitor',NULL,'admissao','opcional','todos','admissao','unica',NULL,30,false,false,NULL,true,100),
    (_company_id,'reservista','Certificado de reservista',NULL,'admissao','opcional','todos','admissao','unica',NULL,30,false,false,NULL,true,110),
    (_company_id,'escolaridade','Comprovante de escolaridade',NULL,'admissao','opcional','todos','admissao','unica',NULL,30,false,false,NULL,true,120),
    (_company_id,'certidao_casamento','Certidão de casamento/união estável','Exigido quando o estado civil é casado ou união estável.','situacao','obrigatorio','estado_civil_casado','admissao','unica',NULL,30,false,false,NULL,true,130),
    (_company_id,'termo_epi','Termo de responsabilidade de EPI','Cargos que exigem EPI.','situacao','obrigatorio','exige_epi','admissao','unica',NULL,30,false,false,NULL,true,140),
    (_company_id,'autorizacao_menor','Autorização judicial e comprovante escolar (menor)','Menores de 18 anos e aprendizes.','situacao','obrigatorio','menor','admissao','unica',NULL,30,false,false,NULL,true,150),
    (_company_id,'contrato_social_pj','Contrato social / CNPJ ativo','Regimes PJ e MEI.','regime','obrigatorio','regime_pj','admissao','anual',12,30,false,false,NULL,true,160),
    (_company_id,'termo_jornada','Termo de ciência de jornada e banco de horas','Regimes com controle de ponto.','regime','opcional','regime_clt','admissao','unica',NULL,30,false,false,NULL,true,170),
    (_company_id,'cnh_valida','CNH válida na categoria exigida','Cargos que dirigem veículos.','cargo_dirige','obrigatorio','cargo_dirige','cnh','vencimento',NULL,30,false,false,NULL,true,180),
    (_company_id,'cnh_sem_suspensao','Declaração de CNH sem suspensão',NULL,'cargo_dirige','opcional','cargo_dirige','cnh','anual',12,30,false,false,NULL,true,190),
    (_company_id,'crlv','CRLV / licenciamento do ano vigente','Veículo próprio do colaborador — renovação anual.','veiculo','obrigatorio','veiculo_proprio','crlv','anual',12,30,false,false,NULL,true,200),
    (_company_id,'seguro_veiculo','Apólice de seguro do veículo','Veículo próprio — renovação anual. Pode ser opcional conforme a política da empresa.','veiculo','opcional','veiculo_proprio','seguro_veiculo','anual',12,30,false,false,NULL,true,210),
    (_company_id,'propriedade_veiculo','Comprovante de propriedade ou autorização do proprietário',NULL,'veiculo','obrigatorio','veiculo_proprio','crlv','unica',NULL,30,false,false,NULL,true,220),
    (_company_id,'termo_veiculo_empresa','Termo de responsabilidade do veículo da empresa',NULL,'veiculo','opcional','veiculo_empresa','admissao','unica',NULL,30,false,false,NULL,true,230),
    (_company_id,'dep_certidao_nascimento','Certidão de nascimento do dependente',NULL,'dependente','obrigatorio','dependente','dependente','unica',NULL,30,false,false,NULL,true,240),
    (_company_id,'dep_cpf','CPF do dependente',NULL,'dependente','obrigatorio','dependente','dependente','unica',NULL,30,false,false,NULL,true,250),
    (_company_id,'dep_vacinacao','Caderneta de vacinação','Dependentes até 7 anos — comprovação anual.','dependente','obrigatorio','dependente_ate_7','dependente','anual',12,30,false,false,NULL,true,260),
    (_company_id,'dep_frequencia_escolar','Comprovante de frequência escolar','Dependentes a partir de 7 anos — comprovação semestral.','dependente','obrigatorio','dependente_acima_7','dependente','semestral',6,30,false,false,NULL,true,270),
    (_company_id,'dep_laudo_invalidez','Laudo médico de invalidez','Dependentes com deficiência/invalidez.','dependente','obrigatorio','dependente_invalido','dependente','vencimento',NULL,30,false,false,NULL,true,280),
    (_company_id,'dep_guarda','Termo de guarda/tutela/curatela',NULL,'dependente','opcional','dependente','dependente','unica',NULL,30,false,false,NULL,true,290)
  ON CONFLICT (company_id, codigo) DO NOTHING;

  SELECT count(*) INTO v_after FROM public.dp_documento_requisitos WHERE company_id = _company_id;
  RETURN v_after - v_before;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_documento_requisitos_seed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_requisitos_seed(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_documento_requisitos_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.dp_documento_requisitos_seed(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_documento_requisitos_seed_trg ON public.companies;
CREATE TRIGGER dp_documento_requisitos_seed_trg
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.dp_documento_requisitos_seed_on_company();
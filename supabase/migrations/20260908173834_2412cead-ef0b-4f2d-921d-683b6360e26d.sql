ALTER TABLE public.dp_pessoas_avulsas
  ADD COLUMN IF NOT EXISTS cobre_motivo text;

ALTER TABLE public.dp_pessoas_avulsas
  DROP CONSTRAINT IF EXISTS dp_pessoas_avulsas_cobre_motivo_check;
ALTER TABLE public.dp_pessoas_avulsas
  ADD CONSTRAINT dp_pessoas_avulsas_cobre_motivo_check
  CHECK (cobre_motivo IS NULL OR cobre_motivo IN ('folga', 'falta', 'atestado', 'outro'));

COMMENT ON COLUMN public.dp_pessoas_avulsas.cobre_motivo IS
  'Motivo operacional da cobertura (folga, falta, atestado, outro). Atestado aqui é só operacional e não cria documento médico.';

CREATE OR REPLACE FUNCTION public.dp_pessoa_avulsa_salvar(
  p_company uuid,
  p_id uuid DEFAULT NULL,
  p_unidade uuid DEFAULT NULL,
  p_cargo uuid DEFAULT NULL,
  p_tipo public.dp_pessoa_avulsa_tipo DEFAULT 'folguista',
  p_nome text DEFAULT NULL,
  p_colaborador uuid DEFAULT NULL,
  p_cobre uuid DEFAULT NULL,
  p_cobre_motivo text DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_entrada time DEFAULT NULL,
  p_saida time DEFAULT NULL,
  p_termina boolean DEFAULT false,
  p_observacao text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_apoio uuid DEFAULT NULL,
  p_setor uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_id uuid;
  v_data date;
  v_tipo_ocorrencia public.dp_ocorrencia_tipo;
  v_nome_cobertor text;
BEGIN
  IF NOT private.is_company_admin_or_owner(auth.uid(), p_company) THEN
    RAISE EXCEPTION 'AVULSA_SEM_PERMISSAO';
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'AVULSA_PERIODO_INVALIDO';
  END IF;

  IF p_cobre_motivo IS NOT NULL AND p_cobre_motivo NOT IN ('folga', 'falta', 'atestado', 'outro') THEN
    RAISE EXCEPTION 'AVULSA_MOTIVO_INVALIDO';
  END IF;

  -- Coerência: motivo só existe quando há alguém coberto.
  IF p_cobre IS NULL THEN
    p_cobre_motivo := NULL;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.dp_pessoas_avulsas (
      company_id, unidade_id, cargo_id, nome, colaborador_id, tipo,
      cobre_colaborador_id, cobre_motivo, data_inicio, data_fim,
      entrada, saida, termina_no_dia_seguinte, observacao, telefone,
      pessoa_apoio_id, setor_id, criado_por
    ) VALUES (
      p_company, p_unidade, p_cargo, p_nome, p_colaborador, p_tipo,
      p_cobre, p_cobre_motivo, p_data_inicio, p_data_fim,
      p_entrada, p_saida, COALESCE(p_termina, false), p_observacao, p_telefone,
      p_apoio, p_setor, auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dp_pessoas_avulsas SET
      unidade_id = p_unidade,
      cargo_id = p_cargo,
      nome = p_nome,
      colaborador_id = p_colaborador,
      tipo = p_tipo,
      cobre_colaborador_id = p_cobre,
      cobre_motivo = p_cobre_motivo,
      data_inicio = p_data_inicio,
      data_fim = p_data_fim,
      entrada = p_entrada,
      saida = p_saida,
      termina_no_dia_seguinte = COALESCE(p_termina, false),
      observacao = p_observacao,
      telefone = p_telefone,
      pessoa_apoio_id = p_apoio,
      setor_id = p_setor
    WHERE id = p_id AND company_id = p_company
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'AVULSA_NAO_ENCONTRADA';
    END IF;
  END IF;

  -- Cobertura por falta/atestado: na mesma transação, garante que a pessoa
  -- coberta tenha a ocorrência correspondente em cada dia do período. Se já
  -- existir (inclusive a previsão correspondente), a rotina existente sinaliza
  -- duplicidade e nós simplesmente reutilizamos o registro.
  IF p_cobre IS NOT NULL AND p_cobre_motivo IN ('falta', 'atestado') THEN
    v_tipo_ocorrencia := p_cobre_motivo::public.dp_ocorrencia_tipo;
    v_nome_cobertor := COALESCE(
      p_nome,
      (SELECT nome FROM public.dp_colaboradores WHERE id = p_colaborador),
      'Pessoa avulsa'
    );
    v_data := p_data_inicio;
    WHILE v_data <= p_data_fim LOOP
      BEGIN
        PERFORM public.dp_ocorrencia_registrar(
          p_cobre,
          v_data,
          v_tipo_ocorrencia,
          'Cobertura registrada na rotina: ' || v_nome_cobertor
        );
      EXCEPTION WHEN OTHERS THEN
        IF sqlerrm LIKE 'OCORRENCIA_DUPLICADA%' THEN
          NULL; -- já existe: reutiliza sem duplicar
        ELSE
          RAISE;
        END IF;
      END;
      v_data := v_data + 1;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_pessoa_avulsa_salvar(uuid, uuid, uuid, uuid, public.dp_pessoa_avulsa_tipo, text, uuid, uuid, text, date, date, time, time, boolean, text, text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dp_pessoa_avulsa_salvar(uuid, uuid, uuid, uuid, public.dp_pessoa_avulsa_tipo, text, uuid, uuid, text, date, date, time, time, boolean, text, text, uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.dp_notif_troca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_solic uuid;
  v_dest uuid;
  v_titulo text;
  v_nome text;
BEGIN
  IF NEW.origem_registro='gestor' THEN
    IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('aprovada','cancelada') AND (NEW.notificar_portal OR NEW.status::text='cancelada') THEN
      INSERT INTO public.dp_notificacoes(company_id,user_id,colaborador_id,tipo,titulo,descricao,ref_table,ref_id)
      SELECT NEW.company_id,c.user_id,c.id,'troca_resposta_gestor',CASE WHEN NEW.status::text='cancelada' THEN 'Troca cancelada pelo gestor' ELSE 'Troca registrada pelo gestor' END,NEW.gestor_resposta,'dp_trocas',NEW.id
      FROM public.dp_colaboradores c WHERE c.id IN (NEW.solicitante_id,NEW.destino_id) AND c.user_id IS NOT NULL AND coalesce(c.origem_cadastro,'')<>'preadmissao_rotina';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'troca_nova', 'Nova solicitação de troca',
            'Data original: ' || NEW.data_original::text,
            'dp_trocas', NEW.id, true);

    -- O colega convidado precisa saber que há uma proposta esperando a resposta dele.
    IF NEW.status::text = 'pendente_colega' THEN
      SELECT c.user_id INTO v_dest
        FROM public.dp_colaboradores c
       WHERE c.id = NEW.destino_id AND coalesce(c.origem_cadastro,'') <> 'preadmissao_rotina';
      SELECT coalesce(nullif(btrim(c.nome_social), ''), c.nome) INTO v_nome
        FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_dest IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_dest, NEW.destino_id, 'troca_nova', 'Proposta de troca de folga',
                initcap(split_part(coalesce(nullif(btrim(v_nome), ''), 'Um colega'), ' ', 1))
                  || ' propôs uma troca: você passa a folgar em ' || coalesce(to_char(NEW.data_original, 'DD/MM'), '-')
                  || ' e cede sua folga de ' || coalesce(to_char(NEW.data_proposta, 'DD/MM'), '-')
                  || '. Abra o calendário para aceitar ou recusar.',
                'dp_trocas', NEW.id);
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.colega_resposta IS DISTINCT FROM OLD.colega_resposta AND NEW.colega_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_colega',
                'Colega respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;

    IF NEW.gestor_resposta IS DISTINCT FROM OLD.gestor_resposta AND NEW.gestor_resposta IS NOT NULL THEN
      v_titulo := CASE
        WHEN NEW.status = 'expirada' THEN 'Solicitação de troca expirada'
        WHEN NEW.status = 'cancelada' THEN 'Gestor cancelou a troca'
        WHEN NEW.status = 'recusada' THEN 'Gestor recusou a troca'
        ELSE 'Gestor respondeu à troca'
      END;

      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      SELECT c.user_id INTO v_dest FROM public.dp_colaboradores c WHERE c.id = NEW.destino_id;

      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;

      IF v_dest IS NOT NULL AND v_dest IS DISTINCT FROM v_solic THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_dest, NEW.destino_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_notif_troca() FROM PUBLIC, anon, authenticated;
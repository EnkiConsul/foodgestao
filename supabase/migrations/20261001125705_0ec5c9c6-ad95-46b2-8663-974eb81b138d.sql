ALTER TABLE public.dp_registros_disciplinares
  ADD COLUMN IF NOT EXISTS elogio_visibilidade text NOT NULL DEFAULT 'privado',
  ADD COLUMN IF NOT EXISTS elogio_aviso_id uuid REFERENCES public.dp_avisos(id) ON DELETE SET NULL;
ALTER TABLE public.dp_registros_disciplinares
  ADD CONSTRAINT dp_disc_elogio_visibilidade_chk CHECK (elogio_visibilidade IN ('privado','individual','publico'));

-- Colaborador só é avisado quando há algo visível a ele: via assinada importada ou elogio divulgado.
CREATE OR REPLACE FUNCTION public.dp_notif_disciplinar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'disciplinar_novo', 'Novo Registro Disciplinar',
            'Tipo: ' || NEW.tipo::text, 'dp_registros_disciplinares', NEW.id, true);
    RETURN NEW;
  END IF;
  IF NEW.via_assinada_path IS NOT NULL AND OLD.via_assinada_path IS NULL
     AND NEW.tipo::text IN ('advertencia_escrita','suspensao') THEN
    SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave)
      VALUES (NEW.company_id, v_user, NEW.colaborador_id, 'documento_novo',
              'Novo Documento Disponível', 'A via assinada já está em Meus Documentos.',
              'dp_documentos', NEW.id, 'disc-via-' || NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_dp_notif_disciplinar ON public.dp_registros_disciplinares;
CREATE TRIGGER trg_dp_notif_disciplinar AFTER INSERT OR UPDATE OF via_assinada_path ON public.dp_registros_disciplinares
  FOR EACH ROW EXECUTE FUNCTION public.dp_notif_disciplinar();

-- Divulgação do elogio: atômica, idempotente, só gestor/DP.
CREATE OR REPLACE FUNCTION public.dp_elogio_divulgar(p_registro_id uuid, p_visibilidade text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_user uuid; v_unidade uuid; v_nome text; v_aviso uuid;
BEGIN
  IF p_visibilidade NOT IN ('privado','individual','publico') THEN RAISE EXCEPTION 'Visibilidade inválida'; END IF;
  SELECT * INTO r FROM public.dp_registros_disciplinares WHERE id = p_registro_id AND removido_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), r.company_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF r.tipo::text <> 'elogio' THEN RAISE EXCEPTION 'Somente elogios podem ser divulgados'; END IF;

  SELECT user_id, unidade_id, nome INTO v_user, v_unidade, v_nome FROM public.dp_colaboradores WHERE id = r.colaborador_id;

  UPDATE public.dp_registros_disciplinares SET elogio_visibilidade = p_visibilidade WHERE id = r.id;

  IF p_visibilidade IN ('individual','publico') AND v_user IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave)
    VALUES (r.company_id, v_user, r.colaborador_id, 'documento_novo', 'Você Recebeu Um Reconhecimento',
            left(coalesce(r.descricao, r.motivo), 180), 'dp_elogios', r.id, 'elogio-' || r.id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_visibilidade = 'publico' AND r.elogio_aviso_id IS NULL THEN
    INSERT INTO public.dp_avisos (company_id, titulo, conteudo, escopo, unidade_id, autor_id, permitir_reacoes, permitir_comentarios)
    VALUES (r.company_id, 'Reconhecimento: ' || initcap(lower(split_part(v_nome, ' ', 1))),
            coalesce(r.descricao, r.motivo),
            CASE WHEN v_unidade IS NULL THEN 'todos' ELSE 'unidade' END, v_unidade, auth.uid(), true, true)
    RETURNING id INTO v_aviso;
    UPDATE public.dp_registros_disciplinares SET elogio_aviso_id = v_aviso WHERE id = r.id;
  ELSIF p_visibilidade <> 'publico' AND r.elogio_aviso_id IS NOT NULL THEN
    DELETE FROM public.dp_avisos WHERE id = r.elogio_aviso_id;
    UPDATE public.dp_registros_disciplinares SET elogio_aviso_id = NULL WHERE id = r.id;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.dp_elogio_divulgar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_elogio_divulgar(uuid, text) TO authenticated, service_role;

-- Portal: vias assinadas + elogios divulgados (nunca verbais/observações/minutas).
DROP FUNCTION IF EXISTS public.dp_portal_meus_disciplinares();
CREATE FUNCTION public.dp_portal_meus_disciplinares()
 RETURNS TABLE(id uuid, tipo text, data date, suspensao_dias integer, via_assinada_path text, via_assinada_em timestamptz, mensagem text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.id, r.tipo::text, r.data, r.suspensao_dias, r.via_assinada_path, r.via_assinada_em,
         CASE WHEN r.tipo::text = 'elogio' THEN coalesce(r.descricao, r.motivo) END
    FROM public.dp_registros_disciplinares r
    JOIN public.dp_colaboradores c ON c.id = r.colaborador_id
   WHERE c.user_id = auth.uid() AND auth.uid() IS NOT NULL AND r.removido_em IS NULL
     AND ((r.via_assinada_path IS NOT NULL AND r.tipo::text IN ('advertencia_escrita','suspensao'))
          OR (r.tipo::text = 'elogio' AND r.elogio_visibilidade IN ('individual','publico')))
   ORDER BY r.data DESC
$function$;
REVOKE ALL ON FUNCTION public.dp_portal_meus_disciplinares() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_meus_disciplinares() TO authenticated, service_role;
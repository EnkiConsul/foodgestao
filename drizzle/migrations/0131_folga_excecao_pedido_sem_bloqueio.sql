DO $mig$
DECLARE d text; n text;
  PROCEDURE_DUMMY int;
BEGIN
  -- 1) Gatilho: pedido de exceção pendente não é barrado por datas bloqueadas/limite.
  d := pg_get_functiondef('public.dp_validar_solicitacao_folga()'::regprocedure);
  n := replace(d, $a$  IF NEW.data_alvo IS NULL THEN RETURN NEW; END IF;$a$,
    $a$  IF NEW.data_alvo IS NULL THEN RETURN NEW; END IF;
  -- Pedido de exceção (folga extra, compensação, troca) fica pendente até o gestor decidir.
  IF COALESCE(NEW.fora_da_janela, false) AND NEW.status = 'pendente' THEN RETURN NEW; END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'patch gatilho falhou'; END IF;
  EXECUTE n;

  -- 2) Pedido de exceção do colaborador: limite e incompatibilidade não barram o envio.
  d := pg_get_functiondef('public.dp_folga_solicitar(date,text,boolean)'::regprocedure);
  n := replace(d, $a$  IF COALESCE((v_res->>'excedido')::boolean, false) THEN$a$,
    $a$  IF COALESCE((v_res->>'excedido')::boolean, false) AND NOT COALESCE(p_fora_da_janela, false) THEN$a$);
  n := replace(n, $a$  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN$a$,
    $a$  IF COALESCE((v_conf->>'conflito')::boolean, false) AND NOT COALESCE(p_fora_da_janela, false) THEN$a$);
  n := replace(n, $a$'pendente', v_fora)$a$, $a$'pendente', v_fora OR COALESCE(p_fora_da_janela, false))$a$);
  IF n = d OR n NOT LIKE '%v_fora OR COALESCE(p_fora_da_janela%' THEN RAISE EXCEPTION 'patch solicitar falhou'; END IF;
  EXECUTE n;

  -- 3) Troca da folga semanal: é exceção; limite avaliado pelo gestor.
  d := pg_get_functiondef('public.dp_folga_troca_fds_solicitar(date,date,text)'::regprocedure);
  n := replace(d, $a$  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN$a$,
    $a$  IF false AND COALESCE((v_lim->>'excedido')::boolean, false) THEN$a$);
  n := replace(n, $a$data_alvo, data_fim, motivo, status)$a$, $a$data_alvo, data_fim, motivo, status, fora_da_janela)$a$);
  n := replace(n, $a$v_motivo, 'pendente')$a$, $a$v_motivo, 'pendente', true)$a$);
  IF n NOT LIKE '%''pendente'', true)%' OR n NOT LIKE '%IF false AND%' THEN RAISE EXCEPTION 'patch troca falhou'; END IF;
  EXECUTE n;

  -- 4) Aprovação do gestor é soberana para exceções: grava como extra, sem barrar por limite.
  d := pg_get_functiondef('public.dp_solicitacao_responder(uuid,dp_solicitacao_status,text)'::regprocedure);
  n := replace(d, $a$    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN$a$,
    $a$    IF COALESCE((v_lim->>'excedido')::boolean, false) AND NOT COALESCE(v_row.fora_da_janela, false) THEN$a$);
  n := replace(n, $a$company_id, colaborador_id, data, tipo, origem, status, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'troca'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, v_uid,$a$,
    $a$company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'troca'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, COALESCE(v_row.fora_da_janela, false), v_uid,$a$);
  n := replace(n, $a$THEN 'Folga extra (exceção) aprovada pelo DP'$a$,
    $a$THEN CASE WHEN COALESCE(v_row.motivo, '') ILIKE '%compensa%'
                       THEN 'Folga compensatória (exceção) aprovada pelo gestor'
                       ELSE 'Folga extra (exceção) aprovada pelo gestor' END$a$);
  IF n NOT LIKE '%NOT COALESCE(v_row.fora_da_janela%' OR n NOT LIKE '%Folga compensatória (exceção)%'
     OR n NOT LIKE '%COALESCE(v_row.fora_da_janela, false), v_uid,%' THEN
    RAISE EXCEPTION 'patch responder falhou';
  END IF;
  EXECUTE n;
END
$mig$;
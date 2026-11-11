CREATE OR REPLACE FUNCTION public.dp_ficha_reativar(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_item public.dp_ficha_importacao_itens;
  v_novo text;
  v_criados int; v_atualizados int; v_pendentes int; v_total int;
begin
  -- SECURITY INVOKER: a leitura e a gravação seguem as mesmas regras de acesso do "ignorar".
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dp_ficha_importacao:' || v_item.importacao_id::text, 0));
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id for update;

  if v_item.status in ('criado','atualizado') then
    raise exception 'Esta ficha já gerou cadastro.' using errcode = '22023';
  end if;

  v_novo := case when v_item.colaborador_existente_id is not null then 'duplicado' else 'pendente' end;

  if v_item.status = 'ignorado' then
    update public.dp_ficha_importacao_itens
       set status = v_novo, updated_at = now()
     where id = v_item.id and company_id = v_item.company_id;
    if not found then
      raise exception 'Sem permissão para reativar esta ficha.' using errcode = '42501';
    end if;
  else
    v_novo := v_item.status;
  end if;

  select count(*) filter (where status = 'criado'),
         count(*) filter (where status = 'atualizado'),
         count(*) filter (where status in ('pendente','revisar','duplicado')),
         count(*)
    into v_criados, v_atualizados, v_pendentes, v_total
    from public.dp_ficha_importacao_itens
   where importacao_id = v_item.importacao_id;

  -- Lote volta a ter fichas abertas: deixa de estar concluído.
  update public.dp_ficha_importacoes
     set criados = v_criados,
         atualizados = v_atualizados,
         status = case when status = 'concluida' and v_pendentes > 0 then 'ready' else status end,
         concluido_em = case when v_pendentes > 0 then null else concluido_em end,
         updated_at = now()
   where id = v_item.importacao_id;

  return jsonb_build_object('status', v_novo, 'criados', v_criados,
                            'atualizados', v_atualizados, 'pendentes', v_pendentes);
end
$function$;

REVOKE ALL ON FUNCTION public.dp_ficha_reativar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ficha_reativar(uuid) TO authenticated, service_role;
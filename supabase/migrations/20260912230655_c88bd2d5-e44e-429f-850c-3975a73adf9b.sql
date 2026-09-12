create or replace function public.dp_convocacao_excluir_grupo(
  p_grupo_id uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_grupo public.dp_convocacao_grupos;
  v_ocorrencias int;
begin
  if p_grupo_id is null then
    raise exception 'INVALID_INPUT: o identificador do grupo é obrigatório.' using errcode = '22023';
  end if;

  select * into v_grupo from public.dp_convocacao_grupos where id = p_grupo_id;
  if not found then
    raise exception 'NOT_FOUND: convocação não encontrada.' using errcode = '23503';
  end if;

  perform public.dp_convocacao_exige_admin(v_grupo.company_id);

  if v_grupo.status <> 'rascunho' then
    raise exception 'NOT_DRAFT: só é possível excluir convocações em rascunho.' using errcode = '22023';
  end if;

  if p_expected_updated_at is not null and v_grupo.updated_at <> p_expected_updated_at then
    raise exception 'STALE_VERSION: o rascunho foi alterado por outra pessoa. Recarregue a tela.' using errcode = '40001';
  end if;

  update public.dp_convocacao_ocorrencias
     set status = 'cancelada', updated_at = now()
   where grupo_id = v_grupo.id
     and status <> 'cancelada';
  get diagnostics v_ocorrencias = row_count;

  -- dp_convocacao_grupos_status_check aceita 'cancelado' (masculino)
  update public.dp_convocacao_grupos
     set status = 'cancelado', updated_at = now()
   where id = v_grupo.id;

  return jsonb_build_object(
    'grupo_id', v_grupo.id,
    'status', 'cancelado',
    'ocorrencias_canceladas', v_ocorrencias
  );
end;
$function$;

revoke execute on function public.dp_convocacao_excluir_grupo(uuid, timestamptz) from public, anon;
grant execute on function public.dp_convocacao_excluir_grupo(uuid, timestamptz) to authenticated, service_role;
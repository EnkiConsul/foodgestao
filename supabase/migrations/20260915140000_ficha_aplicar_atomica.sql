-- =====================================================================
-- Aplicação ATÔMICA da ficha de registro.
--
-- Antes: o cliente fazia 5+ requisições independentes (colaborador,
-- configuração de trabalho, dias, item e contadores). Falha no meio deixava
-- cadastro parcial e os contadores eram calculados no cliente, ignorando erros.
--
-- Agora: uma única transação no banco grava colaborador + configuração vigente
-- + dias + dados revisados/status do item + contadores (em SQL).
--
-- Segurança:
--  · SECURITY INVOKER: roda com o papel de quem chama, portanto TODAS as
--    políticas de RLS já existentes valem sem qualquer novo caminho de
--    privilégio (admin/dono da empresa ou super admin, conforme as policies
--    dp_ficha_itens_admin_all / dp_colab_admin_write / dp_cct_admin_write /
--    dp_ccd_admin_write). Não há SECURITY DEFINER, não há bypass.
--  · A empresa é SEMPRE derivada do item real lido no banco (nunca do payload),
--    e conferida contra o lote, o colaborador e as referências
--    cargo/unidade/setor/turno/configuração.
--  · Lista de campos permitidos no servidor: o payload não pode carregar
--    user_id, perfil_acesso, dp_permissions, company_id, deleted_at, ativo,
--    id ou email_portal — a chamada é recusada. Chaves desconhecidas são
--    ignoradas.
--  · search_path fixo em public; EXECUTE revogado de PUBLIC/anon e concedido
--    apenas a authenticated (e service_role para rotinas internas).
--
-- Concorrência: bloqueio consultivo por importação → linha do item → linha do
-- colaborador, sempre nessa ordem, evitando corrida e deadlock. O mesmo item
-- reaplicado devolve o mesmo colaborador sem regravar nada nem duplicar
-- jornada/contadores.
--
-- Idempotente: só cria/substitui funções e ajusta permissões. Não apaga nem
-- altera dados de clientes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- dp_ficha_aplicar: cria ou atualiza o cadastro a partir da ficha revisada.
-- ---------------------------------------------------------------------
create or replace function public.dp_ficha_aplicar(
  p_item_id uuid,
  p_dados jsonb,
  p_dados_extraidos jsonb default '{}'::jsonb,
  p_campos text[] default null,
  p_atualizar_existente boolean default false,
  p_cargo_id uuid default null,
  p_unidade_id uuid default null,
  p_setor_id uuid default null,
  p_turno_id uuid default null,
  p_regime text default null,
  p_forma_pagamento text default null,
  p_possui_folha_ponto boolean default false,
  p_optante_adiantamento boolean default false,
  p_jornada jsonb default null
) returns jsonb
language plpgsql
security invoker
volatile
set search_path = public
as $fn$
declare
  -- Colunas do cadastro que a ficha pode alimentar (allowlist do SERVIDOR).
  c_allow constant text[] := array[
    'nome','cpf','matricula','data_nascimento','data_admissao','sexo','telefone',
    'whatsapp','email_contato','estado_civil','endereco','cargo','salario_base',
    'rg_numero','rg_orgao','rg_uf','rg_emissao','ctps_numero','ctps_serie',
    'ctps_uf','ctps_expedicao','titulo_eleitor','titulo_zona','titulo_secao',
    'reservista','reservista_categoria','nome_pai','nome_mae','nacionalidade',
    'naturalidade','raca_cor','grau_instrucao','deficiencia'
  ];
  -- Nunca aceitos do payload (conta, perfil, permissões, empresa, exclusão…).
  c_proibidos constant text[] := array[
    'id','user_id','company_id','perfil_acesso','dp_permissions','permissions',
    'deleted_at','ativo','email_portal','origem_cadastro','ficha_importacao_item_id',
    'created_at','updated_at'
  ];
  v_item public.dp_ficha_importacao_itens;
  v_imp public.dp_ficha_importacoes;
  v_company uuid;
  v_nome text;
  v_cpf text;
  v_chave text;
  v_src jsonb := '{}'::jsonb;
  v_val jsonb;
  v_cols text;
  v_vals text;
  v_set text;
  v_colab uuid;
  v_config uuid;
  v_dia jsonb;
  v_dows int[] := array[]::int[];
  v_dow int;
  v_folga_fixa smallint := null;
  v_folga_variavel boolean := true;
  v_status text;
  v_criados int;
  v_atualizados int;
  v_pendentes int;
  v_total int;
begin
  if p_item_id is null then
    raise exception 'Informe a ficha a aplicar.' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da ficha inválidos.' using errcode = '22023';
  end if;

  -- Campos proibidos: recusa explícita (não silenciosa).
  foreach v_chave in array c_proibidos loop
    if p_dados ? v_chave then
      raise exception 'Campo % não pode ser enviado na aplicação da ficha.', v_chave
        using errcode = '42501';
    end if;
  end loop;

  -- 1) item real (RLS decide se quem chama pode vê-lo) — só para obter o lote.
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  -- 2) serialização: lote → item → colaborador, sempre nessa ordem.
  perform pg_advisory_xact_lock(hashtextextended('dp_ficha_importacao:' || v_item.importacao_id::text, 0));
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id for update;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  v_company := v_item.company_id;

  -- replay do mesmo item: devolve o mesmo colaborador, sem regravar nada.
  if v_item.status in ('criado','atualizado') and v_item.colaborador_id is not null then
    return jsonb_build_object(
      'colaborador_id', v_item.colaborador_id,
      'status', v_item.status,
      'ja_aplicado', true,
      'arquivo_path', v_item.arquivo_path,
      'pagina_inicio', v_item.pagina_inicio,
      'pagina_fim', v_item.pagina_fim
    );
  end if;

  -- 3) lote da mesma empresa (a empresa jamais vem do payload).
  select * into v_imp from public.dp_ficha_importacoes where id = v_item.importacao_id for update;
  if not found then
    raise exception 'Importação não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if v_imp.company_id <> v_company then
    raise exception 'A ficha não pertence à empresa da importação.' using errcode = '42501';
  end if;

  -- 4) referências: todas precisam ser da mesma empresa.
  if p_cargo_id is not null and not exists (
    select 1 from public.dp_cargos where id = p_cargo_id and company_id = v_company) then
    raise exception 'Cargo de outra empresa.' using errcode = '42501';
  end if;
  if p_unidade_id is not null and not exists (
    select 1 from public.dp_unidades where id = p_unidade_id and company_id = v_company) then
    raise exception 'Unidade de outra empresa.' using errcode = '42501';
  end if;
  if p_setor_id is not null and not exists (
    select 1 from public.dp_setores where id = p_setor_id and company_id = v_company) then
    raise exception 'Setor de outra empresa.' using errcode = '42501';
  end if;
  if p_turno_id is not null and not exists (
    select 1 from public.dp_turnos where id = p_turno_id and company_id = v_company) then
    raise exception 'Turno de outra empresa.' using errcode = '42501';
  end if;

  -- 5) validações do servidor (não afrouxam nada que já existia).
  v_nome := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_cpf := regexp_replace(coalesce(p_dados ->> 'cpf', ''), '\D', '', 'g');
  if v_nome is null then
    raise exception 'Informe o nome do colaborador.' using errcode = '22023';
  end if;
  if length(v_cpf) <> 11 then
    raise exception 'Informe um CPF com 11 dígitos.' using errcode = '22023';
  end if;

  -- 6) payload filtrado pela allowlist; vazio/nulo é AUSENTE (nunca apaga).
  foreach v_chave in array c_allow loop
    if not (p_dados ? v_chave) then continue; end if;
    v_val := p_dados -> v_chave;
    if v_val is null or jsonb_typeof(v_val) = 'null' then continue; end if;
    if jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '' then continue; end if;
    if jsonb_typeof(v_val) = 'object' and v_val = '{}'::jsonb then continue; end if;
    -- na atualização, respeita as colunas escolhidas na comparação
    if p_atualizar_existente and p_campos is not null and not (v_chave = any(p_campos)) then
      continue;
    end if;
    v_src := v_src || jsonb_build_object(v_chave, v_val);
  end loop;
  -- nome/CPF normalizados no servidor
  v_src := v_src || jsonb_build_object('nome', v_nome, 'cpf', v_cpf);
  -- campos de conferência: sempre gravados quando informados
  if p_cargo_id is not null then v_src := v_src || jsonb_build_object('cargo_id', p_cargo_id); end if;
  if p_unidade_id is not null then v_src := v_src || jsonb_build_object('unidade_id', p_unidade_id); end if;
  if p_setor_id is not null then v_src := v_src || jsonb_build_object('setor_id', p_setor_id); end if;
  if p_regime is not null then v_src := v_src || jsonb_build_object('regime', p_regime); end if;
  if p_forma_pagamento is not null then
    v_src := v_src || jsonb_build_object('forma_pagamento', p_forma_pagamento);
  end if;
  v_src := v_src || jsonb_build_object(
    'possui_folha_ponto', coalesce(p_possui_folha_ponto, false),
    'optante_adiantamento', coalesce(p_optante_adiantamento, false),
    'ficha_importacao_item_id', v_item.id
  );

  -- 7) colaborador: atualizar quem já existe ou criar.
  if p_atualizar_existente then
    if v_item.colaborador_existente_id is null then
      raise exception 'A ficha não aponta para um cadastro existente.' using errcode = '22023';
    end if;
    select id into v_colab
      from public.dp_colaboradores
     where id = v_item.colaborador_existente_id and company_id = v_company
     for update;
    if v_colab is null then
      raise exception 'Cadastro existente não encontrado nesta empresa.' using errcode = '42501';
    end if;

    select string_agg(
             format('%I = %s', a.attname,
               case when t.typname = 'jsonb' then format('($1 -> %L)', a.attname)
                    else format('(($1 ->> %L)::%s)', a.attname, format_type(a.atttypid, a.atttypmod)) end),
             ', ' order by a.attnum)
      into v_set
      from jsonb_object_keys(v_src) k(key)
      join pg_attribute a on a.attrelid = 'public.dp_colaboradores'::regclass and a.attname = k.key
      join pg_type t on t.oid = a.atttypid
     where a.attnum > 0 and not a.attisdropped;
    if v_set is null then
      raise exception 'Nada a atualizar nesta ficha.' using errcode = '22023';
    end if;

    begin
      execute format(
        'update public.dp_colaboradores set %s, updated_at = now() where id = $2 and company_id = $3',
        v_set)
        using v_src, v_colab, v_company;
    exception when unique_violation then
      raise exception 'Já existe um colaborador com este CPF nesta empresa.' using errcode = '23505';
    end;
    v_status := 'atualizado';
  else
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(
             case when t.typname = 'jsonb' then format('($1 -> %L)', a.attname)
                  else format('(($1 ->> %L)::%s)', a.attname, format_type(a.atttypid, a.atttypmod)) end,
             ', ' order by a.attnum)
      into v_cols, v_vals
      from jsonb_object_keys(v_src) k(key)
      join pg_attribute a on a.attrelid = 'public.dp_colaboradores'::regclass and a.attname = k.key
      join pg_type t on t.oid = a.atttypid
     where a.attnum > 0 and not a.attisdropped;

    begin
      execute format(
        'insert into public.dp_colaboradores (company_id, origem_cadastro, %s) '
        'values ($2, ''ficha_importacao'', %s) returning id',
        v_cols, v_vals)
        into v_colab
        using v_src, v_company;
    exception when unique_violation then
      raise exception 'Já existe um colaborador com este CPF nesta empresa.' using errcode = '23505';
    end;
    v_status := 'criado';
  end if;

  -- 8) jornada: configuração vigente + dias (substitui os dias da vigente).
  if p_jornada is not null and jsonb_typeof(p_jornada -> 'dias') = 'array'
     and jsonb_array_length(p_jornada -> 'dias') > 0 then
    for v_dia in select * from jsonb_array_elements(p_jornada -> 'dias') loop
      v_dow := (v_dia ->> 'dow')::int;
      if v_dow is null or v_dow < 0 or v_dow > 6 then
        raise exception 'Dia da semana inválido na jornada da ficha.' using errcode = '22023';
      end if;
      if v_dow = any(v_dows) then
        raise exception 'Dia da semana repetido na jornada da ficha.' using errcode = '22023';
      end if;
      v_dows := v_dows || v_dow;
      if coalesce((v_dia ->> 'trabalha')::boolean, true) = false then
        v_folga_variavel := false;
        v_folga_fixa := coalesce(v_folga_fixa, v_dow::smallint);
      end if;
    end loop;

    select id into v_config
      from public.dp_colaborador_config_trabalho
     where colaborador_id = v_colab and vigencia_fim is null
     for update;

    if v_config is null then
      insert into public.dp_colaborador_config_trabalho (
        company_id, colaborador_id, unidade_id, turno_padrao_id,
        folga_variavel, folga_fixa_dow, observacoes, vigencia_inicio)
      values (
        v_company, v_colab, p_unidade_id, p_turno_id,
        v_folga_variavel, v_folga_fixa, 'Importado da ficha de registro',
        coalesce((v_src ->> 'data_admissao')::date, current_date))
      returning id into v_config;
    else
      update public.dp_colaborador_config_trabalho
         set unidade_id = p_unidade_id,
             turno_padrao_id = p_turno_id,
             folga_variavel = v_folga_variavel,
             folga_fixa_dow = v_folga_fixa,
             observacoes = 'Importado da ficha de registro',
             updated_at = now()
       where id = v_config and company_id = v_company;
      -- a jornada da ficha substitui os dias da configuração vigente
      delete from public.dp_colaborador_config_dias where config_id = v_config;
    end if;

    insert into public.dp_colaborador_config_dias (
      company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id)
    select v_company, v_config, (d ->> 'dow')::smallint,
           coalesce((d ->> 'trabalha')::boolean, true),
           case when coalesce((d ->> 'trabalha')::boolean, true) then p_turno_id end,
           case when coalesce((d ->> 'trabalha')::boolean, true) then nullif(d ->> 'entrada','')::time end,
           case when coalesce((d ->> 'trabalha')::boolean, true) then nullif(d ->> 'saida','')::time end,
           case when coalesce((d ->> 'trabalha')::boolean, true)
                then coalesce((d ->> 'intervalo_minutos')::int, 0) end,
           null::uuid
      from jsonb_array_elements(p_jornada -> 'dias') d;
  end if;

  -- 9) item revisado
  update public.dp_ficha_importacao_itens
     set status = v_status,
         colaborador_id = v_colab,
         dados_extraidos = case
           when p_dados_extraidos is not null and jsonb_typeof(p_dados_extraidos) = 'object'
                and p_dados_extraidos <> '{}'::jsonb
             then p_dados_extraidos
           else dados_extraidos end,
         erro_mensagem = null,
         updated_at = now()
   where id = v_item.id and company_id = v_company;

  -- 10) contadores em SQL, na mesma transação
  select count(*) filter (where status = 'criado'),
         count(*) filter (where status = 'atualizado'),
         count(*) filter (where status in ('pendente','revisar','duplicado')),
         count(*)
    into v_criados, v_atualizados, v_pendentes, v_total
    from public.dp_ficha_importacao_itens
   where importacao_id = v_item.importacao_id;

  update public.dp_ficha_importacoes
     set criados = v_criados,
         atualizados = v_atualizados,
         -- lote ainda em leitura nunca é fechado aqui
         status = case when v_pendentes = 0 and v_total > 0 and status <> 'processing'
                       then 'concluida' else status end,
         concluido_em = case when v_pendentes = 0 and v_total > 0 and status <> 'processing'
                            then coalesce(concluido_em, now()) else concluido_em end,
         updated_at = now()
   where id = v_item.importacao_id;

  return jsonb_build_object(
    'colaborador_id', v_colab,
    'status', v_status,
    'ja_aplicado', false,
    'criados', v_criados,
    'atualizados', v_atualizados,
    'pendentes', v_pendentes,
    'arquivo_path', v_item.arquivo_path,
    'pagina_inicio', v_item.pagina_inicio,
    'pagina_fim', v_item.pagina_fim
  );
end
$fn$;

comment on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb)
  is 'Aplica a ficha de registro revisada em UMA transação (colaborador + configuração + dias + item + contadores). SECURITY INVOKER: usa as policies de RLS existentes.';

-- ---------------------------------------------------------------------
-- dp_ficha_ignorar: mesma disciplina de bloqueio/contagem do aplicar.
-- ---------------------------------------------------------------------
create or replace function public.dp_ficha_ignorar(p_item_id uuid)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = public
as $fn$
declare
  v_item public.dp_ficha_importacao_itens;
  v_criados int; v_atualizados int; v_pendentes int; v_total int;
begin
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('dp_ficha_importacao:' || v_item.importacao_id::text, 0));
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id for update;

  if v_item.status in ('criado','atualizado') then
    raise exception 'Esta ficha já gerou cadastro e não pode ser ignorada.' using errcode = '22023';
  end if;

  if v_item.status <> 'ignorado' then
    update public.dp_ficha_importacao_itens
       set status = 'ignorado', updated_at = now()
     where id = v_item.id and company_id = v_item.company_id;
  end if;

  select count(*) filter (where status = 'criado'),
         count(*) filter (where status = 'atualizado'),
         count(*) filter (where status in ('pendente','revisar','duplicado')),
         count(*)
    into v_criados, v_atualizados, v_pendentes, v_total
    from public.dp_ficha_importacao_itens
   where importacao_id = v_item.importacao_id;

  update public.dp_ficha_importacoes
     set criados = v_criados,
         atualizados = v_atualizados,
         status = case when v_pendentes = 0 and v_total > 0 and status <> 'processing'
                       then 'concluida' else status end,
         concluido_em = case when v_pendentes = 0 and v_total > 0 and status <> 'processing'
                            then coalesce(concluido_em, now()) else concluido_em end,
         updated_at = now()
   where id = v_item.importacao_id;

  return jsonb_build_object('status', 'ignorado', 'criados', v_criados,
                            'atualizados', v_atualizados, 'pendentes', v_pendentes);
end
$fn$;

comment on function public.dp_ficha_ignorar(uuid)
  is 'Marca a ficha como ignorada e recalcula os contadores do lote na mesma transação/bloqueio do aplicar.';

-- ---------------------------------------------------------------------
-- Permissões: nada para PUBLIC/anon; authenticated estrito.
-- ---------------------------------------------------------------------
revoke all on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) from public;
revoke all on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) from anon;
revoke all on function public.dp_ficha_ignorar(uuid) from public;
revoke all on function public.dp_ficha_ignorar(uuid) from anon;

grant execute on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) to authenticated, service_role;
grant execute on function public.dp_ficha_ignorar(uuid) to authenticated, service_role;

-- Fail closed: aborta se alguma das duas ficar aberta a visitante/PUBLIC.
do $$
declare v_aberta text;
begin
  select string_agg(p.proname, ', ') into v_aberta
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('dp_ficha_aplicar','dp_ficha_ignorar')
     and exists (
       select 1 from aclexplode(p.proacl) a
        where a.privilege_type = 'EXECUTE'
          and (a.grantee = 0 or a.grantee = 'anon'::regrole::oid));
  if v_aberta is not null then
    raise exception 'Rotinas de ficha abertas a anon/PUBLIC: %', v_aberta;
  end if;
end $$;

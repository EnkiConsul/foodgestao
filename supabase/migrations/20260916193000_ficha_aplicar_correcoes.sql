-- =====================================================================
-- Ficha de registro — CORREÇÕES da aplicação atômica (revisão técnica).
--
-- Aguardando revisão final: valida no clone descartável e SÓ depois é aplicado
-- ao banco do projeto (pela ferramenta de migração). Substitui
-- dp_ficha_aplicar / dp_ficha_ignorar corrigindo, sem mudar layout, produto ou
-- regra de negócio:
--
--  2) Seleção de campos: nome/CPF deixam de ser injetados incondicionalmente.
--     Na criação são obrigatórios e normalizados; na ATUALIZAÇÃO só são
--     gravados quando realmente autorizados em p_campos. Flags opcionais
--     (folha de ponto / adiantamento) aceitam NULL = "não informado" e
--     preservam o valor existente; na criação usam o padrão false. Vínculo
--     inválido é recusado no servidor (o cliente não degrada "atualizar").
--  3) Integridade de empresa e bloqueios: ordem lote → item → colaborador
--     IGUAL no aplicar e no ignorar; identidade do lote revalidada depois do
--     bloqueio; replay só responde após validar lote/colaborador; configuração
--     e dias sempre por company_id; duas configurações vigentes = erro
--     explícito; updates conferem linhas afetadas.
--  4) Jornada: payload não-nulo em formato inválido é RECUSADO (antes era
--     ignorado com resposta de sucesso). Dias, booleanos, horários e
--     intervalos validados. Unidade/turno existentes não são zerados por
--     parâmetro ausente e campos do dia que a ficha não envia (em especial o
--     SETOR) são preservados.
--  5) Conclusão do lote: só fecha com leitura 'ready' e todos os itens em
--     criado/atualizado/ignorado. Erro conta como pendência e lote
--     'processing'/'failed' nunca é fechado pelo aplicar/ignorar.
--
-- Continua SECURITY INVOKER (RLS de sempre), search_path fixo, EXECUTE só
-- para authenticated/service_role. Idempotente: só substitui funções.
-- =====================================================================

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
  p_possui_folha_ponto boolean default null,
  p_optante_adiantamento boolean default null,
  p_jornada jsonb default null
) returns jsonb
language plpgsql
security invoker
volatile
set search_path = public
as $fn$
declare
  c_allow constant text[] := array[
    'nome','cpf','matricula','data_nascimento','data_admissao','sexo','telefone',
    'whatsapp','email_contato','estado_civil','endereco','cargo','salario_base',
    'rg_numero','rg_orgao','rg_uf','rg_emissao','ctps_numero','ctps_serie',
    'ctps_uf','ctps_expedicao','titulo_eleitor','titulo_zona','titulo_secao',
    'reservista','reservista_categoria','nome_pai','nome_mae','nacionalidade',
    'naturalidade','raca_cor','grau_instrucao','deficiencia'
  ];
  c_proibidos constant text[] := array[
    'id','user_id','company_id','perfil_acesso','dp_permissions','permissions',
    'deleted_at','ativo','email_portal','origem_cadastro','ficha_importacao_item_id',
    'created_at','updated_at'
  ];
  v_item public.dp_ficha_importacao_itens;
  v_imp public.dp_ficha_importacoes;
  v_importacao_id uuid;
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
  v_configs int;
  v_dia jsonb;
  v_dows int[] := array[]::int[];
  v_dow int;
  v_trab boolean;
  v_entrada text;
  v_saida text;
  v_intervalo int;
  v_folga_fixa smallint := null;
  v_folga_variavel boolean := true;
  v_status text;
  v_afetadas int;
  v_criados int;
  v_atualizados int;
  v_pendentes int;
  v_total int;
  v_prontos int;
begin
  if p_item_id is null then
    raise exception 'Informe a ficha a aplicar.' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados da ficha inválidos.' using errcode = '22023';
  end if;

  foreach v_chave in array c_proibidos loop
    if p_dados ? v_chave then
      raise exception 'Campo % não pode ser enviado na aplicação da ficha.', v_chave
        using errcode = '42501';
    end if;
  end loop;

  -- (4) jornada: formato inválido é recusado, nunca ignorado em silêncio.
  if p_jornada is not null then
    if jsonb_typeof(p_jornada) <> 'object' or not (p_jornada ? 'dias')
       or jsonb_typeof(p_jornada -> 'dias') <> 'array'
       or jsonb_array_length(p_jornada -> 'dias') = 0 then
      raise exception 'Jornada da ficha em formato inválido.' using errcode = '22023';
    end if;
  end if;

  -- 1) leitura inicial só para descobrir o lote (RLS decide a visibilidade).
  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  v_importacao_id := v_item.importacao_id;

  -- 2) serialização: lote → item → colaborador, sempre nessa ordem.
  perform pg_advisory_xact_lock(hashtextextended('dp_ficha_importacao:' || v_importacao_id::text, 0));

  select * into v_imp from public.dp_ficha_importacoes where id = v_importacao_id for update;
  if not found then
    raise exception 'Importação não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id for update;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  -- (3) identidade do lote revalidada DEPOIS do bloqueio.
  if v_item.importacao_id <> v_importacao_id then
    raise exception 'A ficha mudou de importação durante a gravação.' using errcode = '40001';
  end if;
  v_company := v_item.company_id;
  if v_company is null or v_imp.company_id <> v_company then
    raise exception 'A ficha não pertence à empresa da importação.' using errcode = '42501';
  end if;

  -- (3) replay: só responde depois de validar lote e colaborador.
  if v_item.status in ('criado','atualizado') and v_item.colaborador_id is not null then
    if not exists (
      select 1 from public.dp_colaboradores
       where id = v_item.colaborador_id and company_id = v_company) then
      raise exception 'Cadastro da ficha não pertence a esta empresa.' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'colaborador_id', v_item.colaborador_id,
      'status', v_item.status,
      'ja_aplicado', true,
      'arquivo_path', v_item.arquivo_path,
      'pagina_inicio', v_item.pagina_inicio,
      'pagina_fim', v_item.pagina_fim
    );
  end if;

  -- 3) referências: todas da mesma empresa.
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

  -- 4) payload filtrado pela allowlist; vazio/nulo é AUSENTE (nunca apaga).
  foreach v_chave in array c_allow loop
    if not (p_dados ? v_chave) then continue; end if;
    v_val := p_dados -> v_chave;
    if v_val is null or jsonb_typeof(v_val) = 'null' then continue; end if;
    if jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '' then continue; end if;
    if jsonb_typeof(v_val) = 'object' and v_val = '{}'::jsonb then continue; end if;
    if p_atualizar_existente and p_campos is not null and not (v_chave = any(p_campos)) then
      continue;
    end if;
    v_src := v_src || jsonb_build_object(v_chave, v_val);
  end loop;

  -- (2) nome/CPF: obrigatórios na criação; na atualização só se autorizados.
  v_nome := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_cpf := nullif(regexp_replace(coalesce(p_dados ->> 'cpf', ''), '\D', '', 'g'), '');
  if p_atualizar_existente then
    if v_src ? 'nome' then
      if v_nome is null then
        raise exception 'Informe o nome do colaborador.' using errcode = '22023';
      end if;
      v_src := v_src || jsonb_build_object('nome', v_nome);
    end if;
    if v_src ? 'cpf' then
      if v_cpf is null or length(v_cpf) <> 11 then
        raise exception 'Informe um CPF com 11 dígitos.' using errcode = '22023';
      end if;
      v_src := v_src || jsonb_build_object('cpf', v_cpf);
    end if;
  else
    if v_nome is null then
      raise exception 'Informe o nome do colaborador.' using errcode = '22023';
    end if;
    if v_cpf is null or length(v_cpf) <> 11 then
      raise exception 'Informe um CPF com 11 dígitos.' using errcode = '22023';
    end if;
    v_src := v_src || jsonb_build_object('nome', v_nome, 'cpf', v_cpf);
  end if;

  -- campos de conferência: gravados apenas quando informados.
  if p_cargo_id is not null then v_src := v_src || jsonb_build_object('cargo_id', p_cargo_id); end if;
  if p_unidade_id is not null then v_src := v_src || jsonb_build_object('unidade_id', p_unidade_id); end if;
  if p_setor_id is not null then v_src := v_src || jsonb_build_object('setor_id', p_setor_id); end if;
  if p_regime is not null then v_src := v_src || jsonb_build_object('regime', p_regime); end if;
  if p_forma_pagamento is not null then
    v_src := v_src || jsonb_build_object('forma_pagamento', p_forma_pagamento);
  end if;
  -- (2) flags: NULL preserva o que existe; na criação valem os padrões.
  if p_possui_folha_ponto is not null then
    v_src := v_src || jsonb_build_object('possui_folha_ponto', p_possui_folha_ponto);
  elsif not p_atualizar_existente then
    v_src := v_src || jsonb_build_object('possui_folha_ponto', false);
  end if;
  if p_optante_adiantamento is not null then
    v_src := v_src || jsonb_build_object('optante_adiantamento', p_optante_adiantamento);
  elsif not p_atualizar_existente then
    v_src := v_src || jsonb_build_object('optante_adiantamento', false);
  end if;
  v_src := v_src || jsonb_build_object('ficha_importacao_item_id', v_item.id);

  -- 5) colaborador: atualizar quem já existe ou criar.
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
    get diagnostics v_afetadas = row_count;
    if v_afetadas <> 1 then
      raise exception 'O cadastro existente não pôde ser atualizado.' using errcode = '42501';
    end if;
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

  -- 6) jornada: configuração vigente + dias.
  if p_jornada is not null then
    for v_dia in select * from jsonb_array_elements(p_jornada -> 'dias') loop
      if jsonb_typeof(v_dia) <> 'object' then
        raise exception 'Dia da jornada em formato inválido.' using errcode = '22023';
      end if;
      if jsonb_typeof(v_dia -> 'dow') not in ('number','string') then
        raise exception 'Dia da semana inválido na jornada da ficha.' using errcode = '22023';
      end if;
      begin
        v_dow := (v_dia ->> 'dow')::int;
      exception when others then
        raise exception 'Dia da semana inválido na jornada da ficha.' using errcode = '22023';
      end;
      if v_dow is null or v_dow < 0 or v_dow > 6 then
        raise exception 'Dia da semana inválido na jornada da ficha.' using errcode = '22023';
      end if;
      if v_dow = any(v_dows) then
        raise exception 'Dia da semana repetido na jornada da ficha.' using errcode = '22023';
      end if;
      v_dows := v_dows || v_dow;

      if (v_dia ? 'trabalha') and jsonb_typeof(v_dia -> 'trabalha') not in ('boolean','null') then
        raise exception 'Indicação de trabalho inválida na jornada da ficha.' using errcode = '22023';
      end if;
      v_trab := coalesce((v_dia ->> 'trabalha')::boolean, true);

      v_entrada := nullif(btrim(coalesce(v_dia ->> 'entrada', '')), '');
      v_saida := nullif(btrim(coalesce(v_dia ->> 'saida', '')), '');
      if (v_entrada is null) <> (v_saida is null) then
        raise exception 'Informe entrada e saída do dia na jornada da ficha.' using errcode = '22023';
      end if;
      if v_entrada is not null then
        begin
          perform v_entrada::time, v_saida::time;
        exception when others then
          raise exception 'Horário inválido na jornada da ficha.' using errcode = '22023';
        end;
      end if;
      if (v_dia ? 'intervalo_minutos')
         and jsonb_typeof(v_dia -> 'intervalo_minutos') not in ('number','null') then
        raise exception 'Intervalo inválido na jornada da ficha.' using errcode = '22023';
      end if;
      v_intervalo := nullif(v_dia ->> 'intervalo_minutos', '')::int;
      if v_intervalo is not null and (v_intervalo < 0 or v_intervalo > 480) then
        raise exception 'Intervalo inválido na jornada da ficha.' using errcode = '22023';
      end if;

      if not v_trab then
        v_folga_variavel := false;
        v_folga_fixa := coalesce(v_folga_fixa, v_dow::smallint);
      end if;
    end loop;

    -- (3) configuração vigente SEMPRE por colaborador + empresa; duas abertas = erro.
    select count(*) into v_configs
      from public.dp_colaborador_config_trabalho
     where colaborador_id = v_colab and company_id = v_company and vigencia_fim is null;
    if v_configs > 1 then
      raise exception 'Há mais de uma configuração de trabalho vigente para este colaborador.'
        using errcode = '22023';
    end if;

    select id into v_config
      from public.dp_colaborador_config_trabalho
     where colaborador_id = v_colab and company_id = v_company and vigencia_fim is null
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
      -- (4) unidade/turno existentes não são zerados por parâmetro ausente.
      update public.dp_colaborador_config_trabalho
         set unidade_id = coalesce(p_unidade_id, unidade_id),
             turno_padrao_id = coalesce(p_turno_id, turno_padrao_id),
             folga_variavel = v_folga_variavel,
             folga_fixa_dow = v_folga_fixa,
             observacoes = 'Importado da ficha de registro',
             updated_at = now()
       where id = v_config and company_id = v_company;
      get diagnostics v_afetadas = row_count;
      if v_afetadas <> 1 then
        raise exception 'A configuração de trabalho não pôde ser atualizada.' using errcode = '42501';
      end if;
      -- a semana da ficha substitui a anterior: só os dias FORA da ficha saem.
      delete from public.dp_colaborador_config_dias
       where config_id = v_config and company_id = v_company
         and not (dow = any(v_dows::smallint[]));
    end if;

    -- (4) dias: campos que a ficha não envia são preservados (setor inclusive).
    insert into public.dp_colaborador_config_dias as d (
      company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos)
    select v_company, v_config, (x ->> 'dow')::smallint,
           coalesce((x ->> 'trabalha')::boolean, true),
           case when coalesce((x ->> 'trabalha')::boolean, true) then p_turno_id end,
           case when coalesce((x ->> 'trabalha')::boolean, true)
                then nullif(btrim(coalesce(x ->> 'entrada','')), '')::time end,
           case when coalesce((x ->> 'trabalha')::boolean, true)
                then nullif(btrim(coalesce(x ->> 'saida','')), '')::time end,
           case when coalesce((x ->> 'trabalha')::boolean, true)
                     and nullif(btrim(coalesce(x ->> 'entrada','')), '') is not null
                then coalesce(nullif(x ->> 'intervalo_minutos','')::int, 0) end
      from jsonb_array_elements(p_jornada -> 'dias') x
        on conflict (config_id, dow) do update
       set company_id = excluded.company_id,
           trabalha = excluded.trabalha,
           turno_id = coalesce(excluded.turno_id, d.turno_id),
           entrada = case when excluded.trabalha
                          then coalesce(excluded.entrada, d.entrada) end,
           saida = case when excluded.trabalha
                        then coalesce(excluded.saida, d.saida) end,
           intervalo_minutos = case
             when not excluded.trabalha then null
             when excluded.entrada is not null then excluded.intervalo_minutos
             when d.entrada is not null then d.intervalo_minutos
             else null end,
           updated_at = now();
  end if;

  -- 7) item revisado
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
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 1 then
    raise exception 'A ficha não pôde ser marcada como aplicada.' using errcode = '42501';
  end if;

  -- 8) contadores em SQL, na mesma transação.
  select count(*) filter (where status = 'criado'),
         count(*) filter (where status = 'atualizado'),
         -- (5) ERRO é pendência: item com erro nunca fecha o lote.
         count(*) filter (where status not in ('criado','atualizado','ignorado')),
         count(*),
         count(*) filter (where status in ('criado','atualizado','ignorado'))
    into v_criados, v_atualizados, v_pendentes, v_total, v_prontos
    from public.dp_ficha_importacao_itens
   where importacao_id = v_item.importacao_id;

  update public.dp_ficha_importacoes
     set criados = v_criados,
         atualizados = v_atualizados,
         -- (5) só a leitura 'ready' com tudo resolvido conclui o lote.
         status = case when status = 'ready' and v_total > 0 and v_prontos = v_total
                       then 'concluida' else status end,
         concluido_em = case when status = 'ready' and v_total > 0 and v_prontos = v_total
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
-- dp_ficha_ignorar: mesma ordem de bloqueio e as mesmas validações de empresa.
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
  v_imp public.dp_ficha_importacoes;
  v_importacao_id uuid;
  v_company uuid;
  v_afetadas int;
  v_criados int; v_atualizados int; v_pendentes int; v_total int; v_prontos int;
begin
  if p_item_id is null then
    raise exception 'Informe a ficha a ignorar.' using errcode = '22023';
  end if;

  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  v_importacao_id := v_item.importacao_id;

  -- mesma ordem do aplicar: lote → item.
  perform pg_advisory_xact_lock(hashtextextended('dp_ficha_importacao:' || v_importacao_id::text, 0));

  select * into v_imp from public.dp_ficha_importacoes where id = v_importacao_id for update;
  if not found then
    raise exception 'Importação não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  select * into v_item from public.dp_ficha_importacao_itens where id = p_item_id for update;
  if not found then
    raise exception 'Ficha não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if v_item.importacao_id <> v_importacao_id then
    raise exception 'A ficha mudou de importação durante a gravação.' using errcode = '40001';
  end if;
  v_company := v_item.company_id;
  if v_company is null or v_imp.company_id <> v_company then
    raise exception 'A ficha não pertence à empresa da importação.' using errcode = '42501';
  end if;

  if v_item.status in ('criado','atualizado') then
    raise exception 'Esta ficha já gerou cadastro e não pode ser ignorada.' using errcode = '22023';
  end if;

  if v_item.status <> 'ignorado' then
    update public.dp_ficha_importacao_itens
       set status = 'ignorado', updated_at = now()
     where id = v_item.id and company_id = v_company;
    get diagnostics v_afetadas = row_count;
    if v_afetadas <> 1 then
      raise exception 'A ficha não pôde ser ignorada.' using errcode = '42501';
    end if;
  end if;

  select count(*) filter (where status = 'criado'),
         count(*) filter (where status = 'atualizado'),
         count(*) filter (where status not in ('criado','atualizado','ignorado')),
         count(*),
         count(*) filter (where status in ('criado','atualizado','ignorado'))
    into v_criados, v_atualizados, v_pendentes, v_total, v_prontos
    from public.dp_ficha_importacao_itens
   where importacao_id = v_item.importacao_id;

  update public.dp_ficha_importacoes
     set criados = v_criados,
         atualizados = v_atualizados,
         status = case when status = 'ready' and v_total > 0 and v_prontos = v_total
                       then 'concluida' else status end,
         concluido_em = case when status = 'ready' and v_total > 0 and v_prontos = v_total
                            then coalesce(concluido_em, now()) else concluido_em end,
         updated_at = now()
   where id = v_item.importacao_id;

  return jsonb_build_object('status', 'ignorado', 'criados', v_criados,
                            'atualizados', v_atualizados, 'pendentes', v_pendentes);
end
$fn$;

comment on function public.dp_ficha_ignorar(uuid)
  is 'Marca a ficha como ignorada e recalcula os contadores do lote na mesma transação/bloqueio do aplicar.';

-- Permissões: nada para PUBLIC/anon; authenticated estrito.
revoke all on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) from public;
revoke all on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) from anon;
revoke all on function public.dp_ficha_ignorar(uuid) from public;
revoke all on function public.dp_ficha_ignorar(uuid) from anon;

grant execute on function public.dp_ficha_aplicar(uuid, jsonb, jsonb, text[], boolean, uuid, uuid, uuid, uuid, text, text, boolean, boolean, jsonb) to authenticated, service_role;
grant execute on function public.dp_ficha_ignorar(uuid) to authenticated, service_role;

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

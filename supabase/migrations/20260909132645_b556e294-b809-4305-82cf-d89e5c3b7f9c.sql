create or replace function public.dp_upper_nome()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if to_jsonb(new) ? 'nome' then
    new.nome := upper(btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g')));
    if new.nome = '' then new.nome := null; end if;
  end if;
  return new;
end;
$$;

create or replace function public.dp_upper_nomes_colaborador()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.nome := upper(btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g')));
  new.nome_mae := nullif(upper(btrim(regexp_replace(coalesce(new.nome_mae, ''), '\s+', ' ', 'g'))), '');
  new.nome_pai := nullif(upper(btrim(regexp_replace(coalesce(new.nome_pai, ''), '\s+', ' ', 'g'))), '');
  return new;
end;
$$;

drop trigger if exists trg_upper_nome on public.dp_cargos;
create trigger trg_upper_nome before insert or update on public.dp_cargos
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nome on public.dp_setores;
create trigger trg_upper_nome before insert or update on public.dp_setores
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nome on public.dp_unidades;
create trigger trg_upper_nome before insert or update on public.dp_unidades
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nome on public.dp_turnos;
create trigger trg_upper_nome before insert or update on public.dp_turnos
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nome on public.dp_jornadas;
create trigger trg_upper_nome before insert or update on public.dp_jornadas
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nome on public.dp_sindicatos;
create trigger trg_upper_nome before insert or update on public.dp_sindicatos
for each row execute function public.dp_upper_nome();

drop trigger if exists trg_upper_nomes on public.dp_colaboradores;
create trigger trg_upper_nomes before insert or update on public.dp_colaboradores
for each row execute function public.dp_upper_nomes_colaborador();
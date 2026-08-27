#!/usr/bin/env node
/**
 * Carga sintética em banco descartável.
 *
 * 1. Sobe um cluster Postgres local e temporário (nada toca o banco real).
 * 2. Copia SOMENTE a definição do esquema public (pg_dump --schema-only).
 * 3. Gera volume alvo: ~200 empresas e ~500 mil lançamentos em 24 meses.
 * 4. Devolve a URL do banco para o harness de carga (scripts/load-test-db.mjs).
 *
 * Uso:
 *   node scripts/load-synth-db.mjs up      [--companies=200] [--transactions=500000]
 *   node scripts/load-synth-db.mjs down
 *   node scripts/load-synth-db.mjs url
 *
 * Nenhum dado real é copiado e nenhum segredo é impresso.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";

const ARGS = new Map(
  process.argv.slice(3).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const CMD = process.argv[2] ?? "up";
const COMPANIES = Number(ARGS.get("companies") ?? 200);
const TX = Number(ARGS.get("transactions") ?? 500_000);

const DATA_DIR = "/tmp/loadpg";
const SOCK_DIR = "/tmp/loadpg_sock";
const PORT = Number(ARGS.get("port") ?? 55432);
const DB = "loadtest";
export const URL = `postgresql://postgres@127.0.0.1:${PORT}/${DB}?sslmode=disable`;

const env = {
  ...process.env,
  PGSSLMODE: "disable",
  PGHOST: "127.0.0.1",
  PGPORT: String(PORT),
  PGUSER: "postgres",
  PGDATABASE: DB,
  PGPASSWORD: "",
};

const UNPRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"];

function sh(cmd, argv, opts = {}) {
  const res = spawnSync(cmd, argv, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} falhou (${res.status}): ${res.stderr ?? ""}`.slice(0, 4000));
  }
  return res.stdout ?? "";
}

const psql = (sql, database = DB) =>
  sh("psql", ["-v", "ON_ERROR_STOP=1", "-At", "-d", database, "-c", sql], {
    env,
    maxBuffer: 64 * 1024 * 1024,
  });

/* ------------------------------ cluster --------------------------------- */

function isUp() {
  return spawnSync("psql", ["-At", "-d", "postgres", "-c", "select 1"], { env }).status === 0;
}

function stopCluster() {
  if (existsSync(DATA_DIR)) {
    spawnSync(...[UNPRIV[0], [...UNPRIV.slice(1), "pg_ctl", "-D", DATA_DIR, "-m", "immediate", "stop"]], {
      encoding: "utf8",
    });
  }
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(SOCK_DIR, { recursive: true, force: true });
}

function startCluster() {
  stopCluster();
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(SOCK_DIR, { recursive: true });
  sh("chown", ["-R", "1000:1000", DATA_DIR, SOCK_DIR]);
  sh(UNPRIV[0], [...UNPRIV.slice(1), "initdb", "-D", DATA_DIR, "-U", "postgres", "--auth=trust"]);
  const tuning = [
    `-p ${PORT}`,
    `-k ${SOCK_DIR}`,
    "-c fsync=off",
    "-c full_page_writes=off",
    "-c synchronous_commit=off",
    "-c max_connections=200",
    "-c shared_buffers=512MB",
    "-c work_mem=32MB",
    "-c maintenance_work_mem=256MB",
  ].join(" ");
  sh(UNPRIV[0], [
    ...UNPRIV.slice(1),
    "pg_ctl",
    "-D",
    DATA_DIR,
    "-o",
    tuning,
    "-l",
    `${DATA_DIR}/server.log`,
    "start",
  ]);
  for (let i = 0; i < 30 && !isUp(); i++) execFileSync("sleep", ["1"]);
  if (!isUp()) throw new Error("cluster não subiu");
  psql(`create database ${DB}`, "postgres");
}

/* ------------------------------- esquema -------------------------------- */

function loadSchema() {
  // Somente a definição do esquema — nenhum dado do banco real é copiado.
  sh("pg_dump", [
    "--schema-only",
    "--schema=public",
    "--no-owner",
    "--no-privileges",
    "-f",
    "/tmp/schema.sql",
  ]);

  psql(`
    create schema if not exists private;
    create schema if not exists auth;
    create schema if not exists extensions;
    create extension if not exists pgcrypto;
    create extension if not exists pg_trgm;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create table if not exists auth.users(
      id uuid primary key default gen_random_uuid(),
      email text, encrypted_password text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      email_confirmed_at timestamptz, last_sign_in_at timestamptz,
      phone text, banned_until timestamptz, deleted_at timestamptz);
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `);

  // Políticas/funções auxiliares do schema `private` não existem no dump public;
  // a carga roda como superusuário (RLS não é o objeto da medição), então
  // erros dessas dependências são esperados e ignorados.
  spawnSync("psql", ["-d", DB, "-f", "/tmp/schema.sql"], { env, encoding: "utf8" });

  const tables = Number(
    psql(
      "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
    ).trim()
  );
  if (tables < 150) throw new Error(`esquema incompleto (${tables} tabelas)`);
  return tables;
}

/* ------------------------------- dados ---------------------------------- */

function seed() {
  // Triggers de negócio desligados durante a carga (não é o que medimos) e
  // reativados antes do ANALYZE.
  const perCompanyTx = Math.ceil(TX / COMPANIES);

  psql(`
set session_replication_role = replica;

-- usuários e empresas -----------------------------------------------------
insert into auth.users(id, email)
select gen_random_uuid(), 'synth'||g||'@loadtest.local' from generate_series(1, ${COMPANIES}) g;

with u as (select id, row_number() over (order by email) rn from auth.users where email like 'synth%@loadtest.local')
insert into public.companies(id, user_id, name, cnpj)
select gen_random_uuid(), u.id, 'Empresa Sintética '||u.rn,
       lpad((10000000000000 + u.rn)::text, 14, '0')
from u;

insert into public.company_members(company_id, user_id, role)
select c.id, c.user_id, 'owner' from public.companies c where c.name like 'Empresa Sintética %';
`);

  psql(`
set session_replication_role = replica;
-- contas bancárias (4 por empresa) ---------------------------------------
insert into public.accounts(id, user_id, company_id, context, name, account_type, current_balance, is_active)
select gen_random_uuid(), c.user_id, c.id, 'pj', 'Conta '||n, 'corrente',
       round((random()*250000)::numeric, 2), true
from public.companies c, generate_series(1,4) n
where c.name like 'Empresa Sintética %';

-- categorias (40 por empresa: 8 sintéticas x 5 analíticas) ---------------
insert into public.categories(id, user_id, company_id, context, name, transaction_type, is_active, sort_order)
select gen_random_uuid(), c.user_id, c.id, 'pj', 'Categoria '||s||'.'||a,
       case when s <= 3 then 'entrada'::transaction_type else 'saida'::transaction_type end,
       true, s*10+a
from public.companies c, generate_series(1,8) s, generate_series(1,5) a
where c.name like 'Empresa Sintética %';

insert into public.category_companies(category_id, company_id)
select cat.id, cat.company_id from public.categories cat
where cat.name like 'Categoria %' and cat.company_id is not null;

-- contatos (60 por empresa; vínculo pela tabela associativa) --------------
insert into public.contacts(id, user_id, name, contact_type, document)
select md5(c.id::text||':contact:'||n)::uuid, c.user_id, 'Fornecedor '||n,
       case when n % 3 = 0 then 'cliente'::contact_type else 'fornecedor'::contact_type end,
       lpad(((random()*99999999999)::bigint)::text, 11, '0')
from public.companies c, generate_series(1,60) n
where c.name like 'Empresa Sintética %';

insert into public.contact_companies(contact_id, company_id)
select md5(c.id::text||':contact:'||n)::uuid, c.id
from public.companies c, generate_series(1,60) n
where c.name like 'Empresa Sintética %';
`);

  psql(`
set session_replication_role = replica;
-- cartões e faturas -------------------------------------------------------
insert into public.credit_cards(id, user_id, company_id, context, brand, last4, closing_day, due_day, credit_limit)
select md5(c.id::text||':card:'||n)::uuid, c.user_id, c.id, 'pj', 'Visa', lpad(n::text,4,'0'), 20, 28, 50000
from public.companies c, generate_series(1,2) n
where c.name like 'Empresa Sintética %';

insert into public.credit_card_invoices(
  id, credit_card_id, user_id, company_id, reference_month, period_start,
  closing_date, due_date, status, total_amount)
select gen_random_uuid(), cc.id, cc.user_id, cc.company_id,
       (date_trunc('month', now()) - (m || ' month')::interval)::date,
       (date_trunc('month', now()) - (m || ' month')::interval)::date,
       (date_trunc('month', now()) - (m || ' month')::interval + interval '19 day')::date,
       (date_trunc('month', now()) - (m || ' month')::interval + interval '27 day')::date,
       (case when m = 0 then 'aberta' else 'paga' end)::invoice_cycle_status,
       round((random()*20000)::numeric, 2)
from public.credit_cards cc, generate_series(0, 23) m
where cc.company_id in (select id from public.companies where name like 'Empresa Sintética %');
`);


  // Lançamentos em lotes por empresa para não estourar memória/WAL.
  psql(`
set session_replication_role = replica;
create temporary table _seed_ctx as
select c.id company_id, c.user_id,
       (select array_agg(a.id) from public.accounts a where a.company_id = c.id) accs,
       (select array_agg(cat.id) from public.categories cat where cat.company_id = c.id) cats,
       (select array_agg(cc.contact_id) from public.contact_companies cc where cc.company_id = c.id) cts
from public.companies c where c.name like 'Empresa Sintética %';


insert into public.transactions(
  id, user_id, company_id, context, description, transaction_type, amount, amount_paid,
  status, due_date, transaction_date, payment_date, account_id, category_id, contact_id)
select gen_random_uuid(), x.user_id, x.company_id, 'pj',
       'Lançamento sintético '||g,
       case when g % 4 = 0 then 'entrada'::transaction_type else 'saida'::transaction_type end,
       v.amount,
       case when st = 'confirmado' then v.amount when st = 'pendente' then 0 else 0 end,
       st::transaction_status,
       d, d,
       case when st = 'confirmado' then d else null end,
       x.accs[1 + (g % array_length(x.accs,1))],
       x.cats[1 + (g % array_length(x.cats,1))],
       x.cts[1 + (g % array_length(x.cts,1))]
from _seed_ctx x
cross join generate_series(1, ${perCompanyTx}) g
cross join lateral (
  select round((20 + random()*15000)::numeric, 2) amount,
         (current_date - ((g * 719) % 730))::date d,
         case when g % 25 = 0 then 'cancelado' when g % 5 = 0 then 'pendente' else 'confirmado' end st
) v;
`);

  psql(`
set session_replication_role = replica;
-- Pessoas: unidades, cargos, colaboradores e escala do mês ---------------
insert into public.dp_unidades(id, company_id, nome)
select gen_random_uuid(), c.id, 'Unidade '||n
from public.companies c, generate_series(1,2) n where c.name like 'Empresa Sintética %';

insert into public.dp_cargos(id, company_id, nome)
select gen_random_uuid(), c.id, 'Cargo '||n
from public.companies c, generate_series(1,5) n where c.name like 'Empresa Sintética %';

insert into public.dp_colaboradores(id, company_id, nome, ativo, unidade_id, cargo_id, regime)
select gen_random_uuid(), c.id, 'Colaborador '||c.id||' '||n, true,
       (select u.id from public.dp_unidades u where u.company_id = c.id limit 1),
       (select g.id from public.dp_cargos g where g.company_id = c.id limit 1),
       'clt'::dp_regime_trabalho
from public.companies c, generate_series(1,25) n where c.name like 'Empresa Sintética %';

insert into public.dp_escalas(id, company_id, competencia, unidade_id)
select gen_random_uuid(), c.id, to_char(now(), 'YYYY-MM'),
       (select u.id from public.dp_unidades u where u.company_id = c.id limit 1)
from public.companies c where c.name like 'Empresa Sintética %';

insert into public.dp_escala_itens(id, company_id, escala_id, colaborador_id, data)
select gen_random_uuid(), e.company_id, e.id, col.id,
       (date_trunc('month', now()) + ((d - 1) || ' day')::interval)::date
from public.dp_escalas e
join public.dp_colaboradores col on col.company_id = e.company_id
cross join generate_series(1, 28) d
where e.competencia = to_char(now(), 'YYYY-MM');

-- extrato bruto de Open Finance ------------------------------------------
insert into public.pluggy_v2_connections(id, company_id, pluggy_item_id)
select md5(c.id::text||':conn')::uuid, c.id, 'synth-item-'||c.id
from public.companies c where c.name like 'Empresa Sintética %';

insert into public.pluggy_v2_accounts(id, connection_id, company_id, pluggy_account_id, pluggy_item_id)
select md5(c.id::text||':ofacc')::uuid, md5(c.id::text||':conn')::uuid, c.id,
       'synth-acc-'||c.id, 'synth-item-'||c.id
from public.companies c where c.name like 'Empresa Sintética %';

insert into public.pluggy_v2_transactions_raw(
  id, account_id, connection_id, company_id, pluggy_account_id, pluggy_transaction_id,
  amount, type, date, description, raw, created_at)
select gen_random_uuid(), md5(c.id::text||':ofacc')::uuid, md5(c.id::text||':conn')::uuid, c.id,
       'synth-acc-'||c.id, 'synth-tx-'||c.id||'-'||n,
       round((random()*5000)::numeric, 2),
       case when n % 4 = 0 then 'CREDIT' else 'DEBIT' end,
       (current_date - (n % 720))::date,
       'RAW '||n,
       jsonb_build_object('description', 'RAW '||n),
       now() - ((n % 720) || ' day')::interval
from public.companies c, generate_series(1, 250) n where c.name like 'Empresa Sintética %';


set session_replication_role = default;
`);

  psql("vacuum analyze");
}

/* -------------------------------- main ---------------------------------- */

if (CMD === "down") {
  stopCluster();
  console.log("cluster descartável removido");
} else if (CMD === "url") {
  console.log(URL);
} else {
  const t0 = Date.now();
  console.log("▶ subindo cluster descartável…");
  startCluster();
  console.log("▶ carregando esquema (apenas definição)…");
  const tables = loadSchema();
  console.log(`  ${tables} tabelas`);
  console.log(`▶ gerando ${COMPANIES} empresas e ~${TX.toLocaleString("pt-BR")} lançamentos…`);
  seed();

  const counts = psql(`
    select 'companies='||(select count(*) from public.companies)
        ||' transactions='||(select count(*) from public.transactions)
        ||' categories='||(select count(*) from public.categories)
        ||' contacts='||(select count(*) from public.contacts)
        ||' invoices='||(select count(*) from public.credit_card_invoices)
        ||' colaboradores='||(select count(*) from public.dp_colaboradores)
        ||' escala_itens='||(select count(*) from public.dp_escala_itens)
        ||' pluggy_raw='||(select count(*) from public.pluggy_v2_transactions_raw)`).trim();
  console.log(`✔ pronto em ${Math.round((Date.now() - t0) / 1000)}s — ${counts}`);
  console.log(`Banco: ${URL}`);
}

#!/usr/bin/env node
/**
 * Teste de carga no banco (somente leitura) + caça a gargalos.
 *
 * 1. Executa consultas representativas com N conexões concorrentes e mede
 *    latência (p50/p95/p99) e throughput.
 * 2. Roda EXPLAIN (ANALYZE, BUFFERS) nas mesmas consultas e sinaliza
 *    Seq Scan em tabelas grandes.
 * 3. Lista chaves estrangeiras sem índice nas tabelas que crescem.
 *
 * Uso: node scripts/load-test-db.mjs [--conns=10] [--rounds=20] [--require]
 * Usa as variáveis PG* gerenciadas. Nenhum segredo é impresso.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const ARGS = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const REQUIRE = ARGS.has("require");
const CONNS = Math.max(1, Number(ARGS.get("conns") ?? 10));
const ROUNDS = Math.max(1, Number(ARGS.get("rounds") ?? 20));
const REPORT_PATH = ARGS.get("report") ?? "reports/load-test-db.json";
const P95_BUDGET_MS = Number(ARGS.get("p95") ?? 500);

/**
 * Alvo: `--db-url=` (banco descartável de carga sintética) tem prioridade;
 * caso contrário usa as variáveis PG* gerenciadas ou SUPABASE_DB_URL.
 */
const DB_URL = ARGS.get("db-url") ?? process.env.SUPABASE_DB_URL ?? null;
if (!DB_URL && !process.env.PGHOST) {
  console.error("✖ Sem acesso ao banco (--db-url/PGHOST/SUPABASE_DB_URL ausentes).");
  process.exit(REQUIRE ? 1 : 0);
}

/** Argumentos de conexão do psql para o alvo escolhido. */
const conn = (rest) => (DB_URL ? [DB_URL, ...rest] : rest);

async function psql(sql) {
  const { stdout } = await run("psql", conn(["-At", "-F", "\t", "-c", sql]), {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}


/** Uma empresa com volume para servir de parâmetro das consultas. */
const companyId = (
  await psql(
    "select company_id from public.transactions where company_id is not null group by 1 order by count(*) desc limit 1"
  )
).trim();

if (!companyId) {
  console.error("✖ Nenhuma empresa com lançamentos para medir.");
  process.exit(REQUIRE ? 1 : 0);
}

const QUERIES = [
  {
    name: "extrato_periodo",
    sql: `select id, amount, amount_paid, status, due_date, transaction_type
          from public.transactions
          where company_id = '${companyId}'
            and due_date between date_trunc('year', now())::date and (date_trunc('year', now()) + interval '1 year - 1 day')::date
          order by due_date limit 1000`,
  },
  {
    name: "saldo_por_conta",
    sql: `select account_id, sum(coalesce(amount_paid, 0)) as pago, count(*) as qtd
          from public.transactions
          where company_id = '${companyId}' and status = 'confirmado'
          group by account_id`,
  },
  {
    name: "totais_por_categoria_mes",
    sql: `select category_id, date_trunc('month', due_date) as mes, sum(amount) as total
          from public.transactions
          where company_id = '${companyId}'
          group by 1, 2 order by 2 desc limit 500`,
  },
  {
    name: "faturas_abertas",
    sql: `select i.id, i.status, i.due_date
          from public.credit_card_invoices i
          where i.company_id = '${companyId}' and i.status <> 'paga'
          order by i.due_date desc limit 100`,
  },
  {
    name: "extrato_bruto_pluggy",
    sql: `select r.id, r.connection_id, r.created_at
          from public.pluggy_v2_transactions_raw r
          order by r.created_at desc limit 500`,
  },
  {
    name: "escala_itens_mes",
    sql: `select i.id, i.escala_id, i.data
          from public.dp_escala_itens i
          where i.data between date_trunc('month', now())::date and (date_trunc('month', now()) + interval '1 month - 1 day')::date
          limit 1000`,
  },
];

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1));
};

/* --------------------------- carga concorrente --------------------------- */
/*
 * Cada "conexão" é uma sessão psql persistente que repete a consulta ROUNDS
 * vezes com \timing on. Assim a latência medida é a do servidor + rede, sem
 * incluir o custo de abrir processo/TLS a cada execução.
 */

/** Executa `sql` repetido `reps` vezes numa única sessão e devolve as durações. */
async function timedSession(sql, reps) {
  const statement = `${sql.trim().replace(/;$/, "")};`;
  const script = ["\\timing on", "\\o /dev/null", ...Array(reps).fill(statement)].join("\n");
  const args = process.env.PGHOST
    ? ["-At", "-q", "-f", "-"]
    : [process.env.SUPABASE_DB_URL, "-At", "-q", "-f", "-"];

  return new Promise((resolve) => {
    const child = execFile("psql", args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const times = [...`${stdout}${stderr}`.matchAll(/^Time:\s+([\d.]+)\s*ms/gm)].map((m) =>
        Number(m[1])
      );
      resolve({ times, failed: err ? reps - times.length : reps - times.length });
    });
    child.stdin.end(script);
  });
}

const results = [];
for (const q of QUERIES) {
  await timedSession(q.sql, 1); // warm-up (plano em cache)

  const started = Date.now();
  const sessions = await Promise.all(
    Array.from({ length: CONNS }, () => timedSession(q.sql, ROUNDS))
  );
  const elapsedS = (Date.now() - started) / 1000;

  const samples = sessions.flatMap((s) => s.times);
  const errors = sessions.reduce((a, s) => a + Math.max(0, s.failed), 0);
  const total = samples.length + errors;

  results.push({
    query: q.name,
    executions: total,
    concurrency: CONNS,
    errors,
    qps: Number((total / elapsedS).toFixed(2)),
    p50_ms: pct(samples, 50),
    p95_ms: pct(samples, 95),
    p99_ms: pct(samples, 99),
    max_ms: samples.length ? Number(Math.max(...samples).toFixed(1)) : null,
  });
  console.log(
    `• ${q.name}: ${total} exec com ${CONNS} conexões, ${Number((total / elapsedS).toFixed(2))} q/s, ` +
      `p50 ${pct(samples, 50)}ms p95 ${pct(samples, 95)}ms`
  );
}


/* ------------------------------- planos --------------------------------- */

const plans = [];
for (const q of QUERIES) {
  try {
    const out = await psql(`explain (analyze, buffers) ${q.sql}`);
    const seqScans = out
      .split("\n")
      .filter((l) => l.includes("Seq Scan"))
      .map((l) => l.trim());
    const timeLine = out.split("\n").find((l) => l.startsWith("Execution Time:"));
    plans.push({
      query: q.name,
      execution_time: timeLine ? timeLine.replace("Execution Time: ", "") : null,
      seq_scans: seqScans,
    });
  } catch (e) {
    plans.push({ query: q.name, error: String(e.message).slice(0, 200) });
  }
}

/* --------------------- FKs sem índice e tabelas grandes ------------------ */

const fkWithoutIndex = (
  await psql(`
  select c.conrelid::regclass::text || ' (' || a.attname || ')'
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and connamespace = 'public'::regnamespace
    and array_length(c.conkey, 1) = 1
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
    )
  order by 1`)
)
  .split("\n")
  .filter(Boolean);

const biggestTables = (
  await psql(`
  select relname || '\t' || n_live_tup || '\t' || pg_size_pretty(pg_total_relation_size(relid))
  from pg_stat_user_tables
  where schemaname = 'public'
  order by n_live_tup desc limit 15`)
)
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [table, rows, size] = l.split("\t");
    return { table, rows: Number(rows), size };
  });

const violations = results
  .filter((r) => r.p95_ms !== null && r.p95_ms > P95_BUDGET_MS)
  .map((r) => `${r.query}: p95 ${r.p95_ms}ms > ${P95_BUDGET_MS}ms`)
  .concat(results.filter((r) => r.errors > 0).map((r) => `${r.query}: ${r.errors} erro(s)`));

const report = {
  generated_at: new Date().toISOString(),
  config: { conns: CONNS, rounds: ROUNDS, p95_budget_ms: P95_BUDGET_MS },
  queries: results.sort((a, b) => (b.p95_ms ?? 0) - (a.p95_ms ?? 0)),
  plans,
  foreign_keys_without_index: fkWithoutIndex,
  biggest_tables: biggestTables,
  violations,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nRelatório: ${REPORT_PATH}`);

if (fkWithoutIndex.length > 0) {
  console.warn(`⚠ ${fkWithoutIndex.length} chave(s) estrangeira(s) sem índice.`);
}
if (violations.length > 0) {
  console.error("✖ Limites violados:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(REQUIRE ? 1 : 0);
}
console.log("✔ Consultas dentro do orçamento de latência.");

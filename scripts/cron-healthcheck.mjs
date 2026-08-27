#!/usr/bin/env node
/**
 * Healthcheck dos agendamentos (pg_cron).
 *
 * Usa a RPC public.cron_health (somente super admin) OU, quando disponível,
 * a URL direta do banco em CRON_HEALTH_DB_URL via psql.
 *
 * Nunca imprime segredos. Saída: reports/cron-health.json
 *
 *   node scripts/cron-healthcheck.mjs            # relatório
 *   node scripts/cron-healthcheck.mjs --require  # falha (exit 1) se houver job quebrado/atrasado
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REQUIRE = process.argv.includes('--require');
const OUT = resolve(process.cwd(), 'reports/cron-health.json');

const SQL = `
select coalesce(json_agg(t), '[]'::json)::text from (
  with runs as (
    select d.jobid,
           count(*) filter (where d.status = 'succeeded') as runs_ok,
           count(*) filter (where d.status <> 'succeeded') as runs_failed
    from cron.job_run_details d
    where d.start_time > now() - interval '24 hours'
    group by d.jobid
  ), ultimo as (
    select distinct on (d.jobid) d.jobid, d.end_time, d.status, d.return_message
    from cron.job_run_details d order by d.jobid, d.start_time desc
  )
  select j.jobname, j.schedule, j.active,
         u.end_time as last_run, u.status as last_status,
         case when u.status <> 'succeeded' then left(coalesce(u.return_message,''), 300) end as last_error,
         coalesce(r.runs_ok, 0) as runs_ok,
         coalesce(r.runs_failed, 0) as runs_failed
  from cron.job j
  left join runs r on r.jobid = j.jobid
  left join ultimo u on u.jobid = j.jobid
  order by coalesce(r.runs_failed, 0) desc, j.jobname
) t;`;

const dbUrl = process.env.CRON_HEALTH_DB_URL || process.env.SUPABASE_DB_URL || '';
if (!dbUrl) {
  console.error('cron-healthcheck: defina CRON_HEALTH_DB_URL (nunca commite a URL).');
  process.exit(REQUIRE ? 1 : 0);
}

let rows = [];
try {
  const out = execFileSync('psql', [dbUrl, '-At', '-c', SQL], { encoding: 'utf8' });
  rows = JSON.parse(out.trim() || '[]');
} catch (err) {
  console.error('cron-healthcheck: falha ao consultar o banco.', err?.status ?? '');
  process.exit(REQUIRE ? 1 : 1);
}

/**
 * Intervalo esperado (em minutos) a partir da expressão cron.
 * Cobre os formatos usados no projeto; formato desconhecido → diário.
 */
function intervaloEsperadoMin(schedule) {
  const s = String(schedule ?? '').trim();
  const m = s.split(/\s+/);
  if (m.length < 5) return 1440;
  const [min, hora] = m;
  if (min.startsWith('*/')) return Math.max(1, Number(min.slice(2)) || 1);
  if (min === '*') return 1;
  if (hora === '*') return 60;
  if (hora.startsWith('*/')) return Math.max(60, (Number(hora.slice(2)) || 1) * 60);
  if (hora.includes(',')) return Math.ceil(1440 / hora.split(',').length);
  return 1440;
}

/** Tolerância: 3 ciclos + 15 min de folga. */
function limiteAtrasoMin(schedule) {
  return intervaloEsperadoMin(schedule) * 3 + 15;
}

const agora = Date.now();
const enriquecidos = rows.map((r) => {
  const esperado = intervaloEsperadoMin(r.schedule);
  const limite = limiteAtrasoMin(r.schedule);
  const minutosDesde = r.last_run
    ? Math.round((agora - new Date(r.last_run).getTime()) / 60000)
    : null;
  return {
    ...r,
    intervalo_esperado_min: esperado,
    limite_atraso_min: limite,
    minutos_desde_ultima: minutosDesde,
    atrasado: Boolean(r.active && minutosDesde !== null && minutosDesde > limite),
  };
});

const quebrados = enriquecidos.filter((r) => Number(r.runs_failed) > 0);
const nuncaRodou = enriquecidos.filter((r) => r.active && !r.last_run);
const atrasados = enriquecidos.filter((r) => r.atrasado);
const inativos = enriquecidos.filter((r) => !r.active);

const relatorio = {
  generated_at: new Date().toISOString(),
  total: enriquecidos.length,
  com_falha_24h: quebrados.map((r) => ({ jobname: r.jobname, runs_failed: r.runs_failed, last_error: r.last_error })),
  nunca_executados: nuncaRodou.map((r) => r.jobname),
  atrasados: atrasados.map((r) => ({
    jobname: r.jobname,
    schedule: r.schedule,
    minutos_desde_ultima: r.minutos_desde_ultima,
    limite_atraso_min: r.limite_atraso_min,
  })),
  inativos: inativos.map((r) => r.jobname),
  jobs: enriquecidos,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(relatorio, null, 2));

console.log(
  `cron-healthcheck: ${enriquecidos.length} jobs | falhas 24h: ${quebrados.length} | nunca executados: ${nuncaRodou.length} | atrasados: ${atrasados.length} | inativos: ${inativos.length}`,
);
for (const r of quebrados) console.log(`  ✖ ${r.jobname}: ${r.runs_failed} falhas — ${r.last_error ?? 'sem mensagem'}`);
for (const n of relatorio.nunca_executados) console.log(`  ⚠ ${n}: nunca executou`);
for (const r of relatorio.atrasados) {
  console.log(`  ⚠ ${r.jobname}: última execução há ${r.minutos_desde_ultima} min (limite ${r.limite_atraso_min} min, agenda ${r.schedule})`);
}
console.log(`relatório: ${OUT}`);

if (REQUIRE && (quebrados.length > 0 || nuncaRodou.length > 0 || atrasados.length > 0)) process.exit(1);

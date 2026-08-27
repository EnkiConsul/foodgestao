# Rodada de carga sintética — 200 empresas / 500 mil lançamentos

Objetivo: medir p95, throughput e estabilidade dos planos de consulta com volume
de produção, sem tocar no banco real.

## Onde a carga vai rodar

O sandbox tem `initdb`/`postgres` locais, então subimos um **cluster Postgres
descartável dentro do sandbox** (`/tmp/loadpg`), carregamos apenas o **esquema**
do banco atual (sem dados, sem segredos) e geramos os dados sintéticos lá.
Nada é escrito no banco de produção.

Limite honesto: sem PostgREST local, essa rodada mede **banco** (planos,
latência de consulta, índices). O throughput ponta a ponta da API no volume alvo
só pode ser medido em um ambiente de staging com backend próprio — fica
registrado como pendência.

## Passos

1. **Cluster descartável**
   - `initdb` em `/tmp/loadpg`, subir na porta 55432, criar o banco `loadtest`.
   - Novo script `scripts/load-synth-db.mjs` cuida de subir/derrubar o cluster.

2. **Esquema**
   - `pg_dump --schema-only --schema=public` do banco atual → restaurar no
     cluster local. Roles ausentes (`authenticated`, `anon`, `service_role`) são
     criadas antes para os GRANTs não falharem.

3. **Geração sintética** (dentro do script, em SQL com `generate_series`)
   - 200 empresas, ~40 contas contábeis/categorias por empresa, contas
     bancárias, contatos, cartões e faturas.
   - **500.000 lançamentos** distribuídos em 24 meses, com mistura realista de
     status (confirmado/pendente/cancelado), `amount_paid` parcial, tipos
     entrada/saída e vínculo a categoria/conta/contato.
   - ~150 colaboradores e itens de escala para exercitar as consultas de Pessoas.
   - `ANALYZE` no final para os planos usarem estatísticas reais.

4. **Medição**
   - Reaproveitar `scripts/load-test-db.mjs` apontando para o cluster local
     (parâmetro novo `--db-url=`), com 10/25/50 conexões concorrentes.
   - Coletar p50/p95/p99, consultas/s, `EXPLAIN (ANALYZE, BUFFERS)`, Seq Scans
     em tabelas grandes e FKs sem índice.

5. **Diagnóstico e correção**
   - Para cada consulta acima de 500 ms no volume alvo: ler o plano, propor
     índice e validar no cluster local.
   - Índices que se provarem necessários entram como **migração no banco real**
     em uma etapa separada, com sua aprovação.

6. **Relatório**
   - `reports/load-test-synth.json` com as três faixas de concorrência.
   - Atualizar `docs/runbooks/teste-carga.md` com a comparação
     volume atual × volume alvo, gargalos achados e o que ficou pendente.

## Detalhes técnicos

- Novos arquivos: `scripts/load-synth-db.mjs` (cluster + seed) e `npm run
  load:synth`; ajuste em `scripts/load-test-db.mjs` para aceitar `--db-url`.
- Seed usa `INSERT ... SELECT generate_series` em lotes, com triggers de negócio
  desabilitados durante a carga (`session_replication_role = replica`) para não
  distorcer o tempo de geração; reativados antes do `ANALYZE`.
- Nenhum dado real é copiado: só a definição do esquema.
- O cluster é apagado no fim (`pg_ctl stop` + `rm -rf /tmp/loadpg`).

# Prontidão para 1.000 clientes — diagnóstico e plano

Análise conduzida sob quatro óticas: controladoria/CFO (confiabilidade do número financeiro), DAF (operação e custo), QA sênior (cobertura e regressão) e engenharia de escala (banco, realtime, funções).

## Veredito

O sistema **não está pronto hoje** para 1.000 clientes, mas está a poucas frentes de estar. A arquitetura é sólida (multitenancy com RLS em 138 tabelas, 370 políticas, motor de saldo protegido por trigger, DRE com testes unitários/integração/E2E/performance/property-based). Os bloqueios são de **escala e observabilidade**, não de modelo de dados.

## O que foi verificado (evidências)

Banco (medido agora):
- Memória em **77%**, disco em 35%, conexões 22/60, tamanho 2,25 GB, 0 restarts.
- **257.044 transações revertidas** desde o boot — volume alto de erros/rollbacks silenciosos.
- **256 de 370 políticas RLS usam `auth.uid()` sem subselect** — o planner reavalia por linha; é o principal gargalo de RLS sob volume.
- **40+ chaves estrangeiras sem índice** (`transactions`→categorias via `budgets`, `categories.company_id`, `dp_trocas.*`, `dp_folha_lancamentos.*`, `import_rules.*`, `subscriptions.plan_id` etc.).
- Volume atual é pequeno (347 transactions, 384 categories), então nada disso dói ainda — vai doer linearmente.
- `dp_colaboradores` com **18.284 seq_scans** contra 4.990 idx_scans: varredura completa dominante.

Frontend:
- Lazy loading correto (só Landing/Auth/Hub/Dashboard eager), `manualChunks` configurado, `exceljs` importado dinamicamente. Bom.
- Sem paginação real em telas de alto volume: `useDpEscalaMes`, `useDpPontoMes`, `useDpPonto`, listagem de `Lancamentos`.
- Realtime: 5 pontos abrindo canais próprios, sem multiplexador — nº de websockets escala com telas montadas, não com usuários.
- **Nenhum Error Boundary, nenhum monitoramento (Sentry/equivalente), nenhum logger estruturado, nenhum handler global de erro.** Com 1.000 clientes, falhas se tornam invisíveis.

Edge functions:
- `pluggy-cron-sync` faz loop **sequencial** por conexão, sem paralelismo, sem retry, sem timeout — estoura wall-clock à medida que conexões crescem. Maior risco operacional.
- `dp-doc-bulk-ingest` e `process-email-queue` estão maduros (background worker, DLQ, TTL, anti-duplicidade).

## Plano em 4 fases

### Fase 1 — Bloqueadores de escala no banco (P0)
1. Migração de índices: criar índice para todas as FKs sem cobertura, mais índices compostos por tenant nos caminhos quentes (`transactions(company_id, due_date)`, `transactions(user_id, context, due_date)`, `dp_pontos(colaborador_id, data)`, `dp_escala_itens(company_id, data)`, `dp_colaboradores(company_id, ativo)`).
2. Reescrever as 256 políticas com `auth.uid()` para `(select auth.uid())` e trocar chamadas repetidas de helper por versões `STABLE` — ganho típico de 10-100x em leitura sob volume.
3. Investigar a origem dos 257k rollbacks (logs + `pg_stat_database`) e eliminar a causa; hoje é ruído que esconde falhas reais.

### Fase 2 — Resiliência de integrações e jobs (P0)
1. Reescrever `pluggy-cron-sync` como despachante em lotes com paralelismo limitado (ex.: 5-8 simultâneos), retry com backoff, marcação de `last_attempt`/`next_retry_at` por conexão e fila de dead-letter — sem depender de uma única execução longa.
2. Adicionar lock/claim por batch em `dp-doc-bulk-ingest` para impedir processamento duplo em retry do cliente.
3. Verificar cadência do cron de e-mail contra o throughput sequencial atual (batch 10 + delay) e dimensionar para 1.000 tenants.

### Fase 3 — Observabilidade e confiabilidade percebida (P0/P1)
1. `ErrorBoundary` global + por rota, com fallback de marca e botão de recarregar.
2. Handlers globais `window.onerror` / `unhandledrejection`.
3. `src/lib/logger.ts` estruturado no client e `request_id` correlacionado nas edge functions.
4. Painel interno de saúde (`/admin/saude`): erros recentes, filas, drift de saldo, status Pluggy, últimas sincronizações falhadas.

### Fase 4 — Paginação, realtime e QA de carga (P1)
1. Paginação server-side (`.range` + `count: exact`) em Lançamentos, Ponto do mês, Escala do mês, Documentos DP; virtualização onde a lista é longa.
2. Hub único de realtime: um canal por tenant multiplexado, substituindo os 5 pontos independentes; auditar cleanup dos 3 hooks não verificados.
3. Teste de carga com seed sintético (100 empresas × 5.000 lançamentos × 50 colaboradores) e orçamentos de latência por tela, no mesmo padrão já usado no DRE.
4. Reconciliação contábil automatizada como controle de CFO: job diário comparando saldo do motor vs. soma de lançamentos, alertando divergência (já existe drift de saldos — estender para DRE e folha).

## Detalhes técnicos
- Índices e políticas RLS vão numa migração única com `CREATE INDEX` (o Cloud aplica sem `CONCURRENTLY` em migração; volume atual é pequeno, então o lock é irrelevante agora — motivo extra para fazer já).
- Memória a 77% com 2,25 GB de dados indica que o instance size atual tem folga curta; recomendo reavaliar o tamanho do "Database server" após a Fase 1, pois melhores índices reduzem pressão de memória e podem tornar o upgrade desnecessário.
- Nada nas Fases 1-3 altera comportamento funcional visível; a Fase 4 muda UI (paginação).

## Escopo desta análise
Não medi tamanho real de chunks (exige build) nem li `pluggy-sync-item`; ambos entram na Fase 2 como primeira tarefa de verificação.

# Certificação de Produção — Release Gate real + Plataforma

Objetivo: sair de "gate criado" para "gate verde e produção certificada", com relatório único de evidências.

## 1. Fechar o Release Gate (100% verde)

Rodar `npm run release:gate:strict` e tratar cada reprovação:

- TypeScript strict, ESLint e migrations: manter em 0 erros (tetos já em 0/0).
- Vitest (unit + RLS): rodar a suíte completa e corrigir o que estiver vermelho.
- Deno check: continuar reduzindo o baseline (14 funções herdadas). Nenhuma função nova entra na lista.
- E2E Playwright: rodar as specs contra `vite preview` e consertar as que quebrarem.
- Backup/restore drill: executar o drill em Postgres limpo e anexar o relatório.
- Security lint + policy sweep: triar `0028_anon_security_definer` (revogar `EXECUTE` de `anon` no que não é público) e `0029_authenticated_security_definer`; registrar exceções legítimas na memória de segurança.
- Smoke de checkout: depende de staging (item 2).

Saída: `reports/release-gate.json` verde + tabela de evidências no runbook.

## 2. Staging (secrets parciais → completos)

- Gerar um inventário do que falta: `STAGING_SUPABASE_DB_URL`, `TEST_*` (usuários A–D, empresas 1 e 2), `SMOKE_*`.
- Criar script `scripts/preflight-secrets.mjs` que lista presente/ausente e falha explicando o que cadastrar — sem nunca imprimir valores.
- Criar seed de staging (`scripts/seed-staging.mjs`) que provisiona os 4 usuários de teste e as 2 empresas do gate de tenancy, para o job parar de depender de dados manuais.
- Documentar em `docs/runbooks/staging.md` como levantar staging do zero.

## 3. Asaas sandbox e Pluggy sandbox (scripts + checklist)

- `scripts/smoke-asaas-sandbox.mjs`: valida chave sandbox, cria cliente + cobrança PIX de teste, dispara webhook assinado para o inbox, confere `asaas_webhook_events` processado e ausência de dead letter.
- `scripts/smoke-pluggy-sandbox.mjs`: cria item sandbox, roda `pluggy-sync-item`, confere staging → promoção, cartões `CREDIT` em pendência de autorização e `transactions/updated`/`deleted` sem apagar confirmados.
- Ambos exigem segredo por header (nunca query string) e abortam com mensagem clara se a chave sandbox não estiver setada.
- `docs/runbooks/sandbox-certificacao.md` com o checklist passo a passo para você executar com as chaves.

## 4. Backup e restore

- Rodar o drill do gate e registrar tempo de dump/restore, tamanho e objetos fora de `public`.
- Adicionar verificação pós-restore: contagem de tabelas, RLS habilitada em todas as tabelas de `public`, funções `SECURITY DEFINER` presentes.
- Documentar RTO/RPO alvo e o procedimento de restore em `docs/runbooks/backup-restore.md`.

## 5. Security Advisor e Performance Advisor

- Executar o linter do banco e a varredura de segurança; classificar cada achado em corrigir / aceitar com justificativa.
- Corrigir o que for real: `search_path` faltando, views/funções expostas, grants largos demais, políticas permissivas.
- Performance: revisar consultas lentas e criar índices faltantes nas FKs mais usadas (transactions, dp_escala_itens, pluggy_v2_transactions_raw), com medição antes/depois.
- Atualizar a memória de segurança com as exceções aceitas.

## 6. SMTP, MFA, PITR

- SMTP: verificar domínio de e-mail e remetente, garantir templates de auth (confirmação, reset, convite) e enviar e-mail de teste; conferir supressões e unsubscribe.
- MFA: habilitar TOTP no backend, validar enroll/challenge no app e revisar o fluxo de recuperação (já atômico) com um teste ponta a ponta.
- PITR: depende de plano/infra — vou verificar o estado atual e, se não estiver disponível, deixar documentado como pendência sua com o passo exato.

## 7. Cron e alertas

- Inventariar todos os jobs de cron (sync open finance 6h, workers de webhook 1min, fechamento de fatura, expire-trials) e conferir que todos usam segredo do Vault, não query string.
- Criar `scripts/cron-healthcheck.mjs`: última execução, taxa de erro e atraso por job; falha se algum job não rodou dentro da janela esperada.
- Alertas: tabela de heartbeat + tela admin com estado dos jobs, dead letters e drift de saldo, mais aviso quando qualquer um sair do verde.
- Runbook `docs/runbooks/producao-alertas.md` com o que fazer em cada alerta.

## 8. Entrega

- `docs/runbooks/certificacao-producao.md`: checklist único com status por item, evidência (arquivo de relatório) e pendências que exigem ação sua.
- Fechar com o Release Gate verde e um resumo do que ficou fora por depender de credencial externa.

## Notas técnicas

- O freeze está encerrado (`.lovable/release-freeze.json` com `frozen: false`), então as correções entram normalmente em main.
- Nenhum segredo aparece em log, relatório ou tela; os scripts só reportam presente/ausente.
- Tetos de qualidade em `scripts/quality-ceilings.json` só descem; baselines Deno e de migrations só encolhem.

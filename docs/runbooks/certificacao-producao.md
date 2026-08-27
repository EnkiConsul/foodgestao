# Certificação de produção — checklist

Status por item, com a evidência gerada automaticamente e o que ainda depende de credencial externa.

## Verde (automatizado e no release gate)

| Item | Evidência | Gate |
|------|-----------|------|
| TypeScript strict (0 erros) | `scripts/quality-ceilings.json` | `typescript` |
| ESLint (tetos) | `scripts/quality-ceilings.json` | `lint` |
| Testes unitários + RLS | saída do Vitest | `tests` |
| Deno check das edge functions | `scripts/deno-check.baseline.json` (só encolhe) | `deno` |
| Config das funções em sincronia | `reports/functions-config.json` | `functions-config` |
| Agendamentos sem falha/atraso | `reports/cron-health.json` | `cron` |
| Build de produção | saída do Vite | `build` |

O stage `functions-config` reprova quando `supabase/config.toml` ou o baseline do Deno citam
função inexistente. O stage `cron` reprova quando um job ativo falhou, nunca executou ou está
atrasado além de 3 ciclos + 15 minutos do próprio agendamento.

## Filas de webhook (Pluggy e Asaas)

- Estados: `pending`, `processing`, `retry`, `processed`, `dead_letter`, `discarded`.
- Evento de item que não pertence a nenhuma conexão do sistema (item de teste, conexão já
  removida, ambiente diferente) é concluído sem falha definitiva — não gera mais dead letter.
- Painel `/admin/pluggy-webhook` e o de Asaas permitem **Reprocessar**, **Descartar** e
  **Descartar todos deste motivo**, restrito a super administrador.
- Backlog histórico de 33 dead letters `pending_manual_link` foi descartado (itens órfãos).

## Pendente de credencial/ambiente externo

Cada item abaixo tem script pronto; só falta a chave/ambiente:

| Item | Como executar | Variáveis |
|------|----------------|-----------|
| Tenancy multiempresa | `npx vitest run src/test/tenancy` | `TEST_*`, `TEST_COMPANY_*` |
| Security lint / policy sweep | `node scripts/security-lint.mjs --ci --strict` | `SUPABASE_DB_URL` |
| Backup/restore drill | `node scripts/backup-restore-drill.mjs --require` | `RESTORE_DB_URL` |
| Smoke de checkout | `node scripts/smoke-checkout.mjs --require` | `SMOKE_*` |
| Asaas sandbox | `node scripts/smoke-asaas-sandbox.mjs` | chave sandbox Asaas |
| Pluggy sandbox | `node scripts/smoke-pluggy-sandbox.mjs` | credenciais sandbox Pluggy |
| Inventário de segredos | `node scripts/preflight-secrets.mjs` | — (só reporta presente/ausente) |

SMTP/e-mail gerenciado, MFA (TOTP) e PITR dependem de validação manual no ambiente e
permanecem como pendência declarada.

## Regras

- Nenhum script imprime segredo — apenas presente/ausente.
- Tetos de qualidade e baselines só diminuem.
- Sem `any`, `@ts-ignore` ou regra desabilitada para passar o gate.

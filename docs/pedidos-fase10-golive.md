# Módulo Pedidos — Fase 10: Go-live, observabilidade e rollback

## 1. Observabilidade

| Sinal | Onde consultar |
| --- | --- |
| Pedidos abertos / travados > 2h | `/pedidos/relatorios` → aba Saúde técnica (`ped_ops_health`) |
| Fila de entrada/saída, lag, dead letters | `/pedidos/integracoes` (`ped_integration_metrics`) |
| Falhas de impressão (7 dias) | Saúde técnica (`ped_print_jobs`) |
| Exportações realizadas | `audit_logs`, ação `orders_export` |
| Transições de estado | `ped_order_status_history` (imutável, com `source` e `idempotency_key`) |
| Erros de RPC / Edge Functions | Logs das funções (`orders-inbox-worker`, `orders-outbox-worker`, `orders-integration-receiver`) |

Correlação: cada evento externo carrega `external_event_id` + `idempotency_key`; o worker
propaga esses valores nos logs, permitindo rastrear o caminho webhook → inbox → pedido → outbox.

### Dados que nunca são registrados
Tokens, segredos, HMAC, dados de cartão, telefone completo, endereço completo e payloads
sensíveis. O helper `maskPii` em `supabase/functions/_shared/orders-integrations/core.ts`
sanitiza antes de qualquer `console.log` ou persistência de payload.

## 2. Exportações e mascaramento

`ped_export_dataset(company_id, dataset, from, to, unit_id, include_test, limit)` cobre
`orders`, `items`, `payments`, `cancellations` e `customers`.

- Exige `orders.reports`.
- Nome/telefone só saem completos com `orders.customer_data`; caso contrário são mascarados
  por `ped_mask_name` / `ped_mask_phone`.
- `customers` é bloqueado sem `orders.customer_data`.
- Toda exportação grava em `audit_logs` (`dataset`, volume, período, se houve mascaramento).

## 3. Desempenho

Índices dedicados: `ped_orders (company_id, placed_at)`, `(company_id, unit_id, placed_at)`,
`(company_id, status)`, `ped_order_items (company_id, product_id)` e
`ped_order_payments (company_id, order_id)`.

Os relatórios agregam em uma única RPC `STABLE SECURITY DEFINER`, usando uma tabela temporária
por chamada, o que evita repetir os filtros em cada agregação. Exportações são limitadas a
20.000 linhas por chamada.

Recomendações de medição em staging (registrar P50/P95/P99):
1. Carga de 10.000 pedidos distribuídos em 3 unidades e 90 dias.
2. `ped_reports_overview` para 30 e 90 dias, com e sem filtro de unidade.
3. `ped_export_dataset('orders')` no limite de 20.000 linhas.
4. Kanban da central com 200 pedidos abertos e Realtime ativo em 5 sessões simultâneas.

## 4. Roteiro E2E (navegador)

1. Criar empresa → 2. iniciar trial → 3. configurar unidade → 4. criar cardápio →
5. pedido de teste (`is_test = true`) → 6. abrir unidade → 7. criar pedido real →
8. aceitar → 9. preparar → 10. marcar pronto → 11. despachar → 12. concluir →
13. cancelar um segundo pedido → 14. expirar trial (`orders_block_company`) →
15. contratar (`contract_orders_module`) → 16. confirmar preservação dos dados.

Cenário multiempresa: repetir com Empresa A e Empresa B na mesma sessão, confirmando que
nenhum relatório, exportação ou pedido cruza `company_id`.

## 5. Plano de go-live

1. **Staging**: aplicar migrations em base limpa e em cópia da base atual.
2. **Massa de teste**: 3 unidades, 2 empresas, 50 produtos, 500 pedidos.
3. **Backup**: snapshot antes da migration de produção.
4. **Feature flag**: módulo continua gated por `company_modules` + `can_use_orders_module`.
5. **Piloto**: 3 clientes com trial ativo, monitorados por 7 dias.
6. **Monitoramento**: saúde técnica e filas revisadas diariamente no piloto.
7. **Ampliação**: liberar por lotes após 7 dias sem P0/P1.
8. **Comunicação**: aviso no hub + e-mail transacional para o grupo piloto.

## 6. Rollback

- **Aplicação**: republicar a versão anterior; as rotas `/pedidos/*` deixam de ser
  acessíveis sem perda de dados.
- **Entitlement**: `orders_block_company(company_id)` coloca a empresa em modo consulta
  imediatamente, sem apagar pedidos.
- **Banco**: as objetos da Fase 10 são aditivos (índices + funções). Rollback:
  `DROP FUNCTION ped_reports_overview / ped_export_dataset / ped_ops_health / ped_mask_name /
  ped_mask_phone` e `DROP INDEX` dos índices citados. Nenhuma tabela ou coluna foi alterada,
  portanto não há risco de perda de dados operacionais.

## 7. Limites conhecidos

- Relatórios são operacionais e não substituem o DRE (sem apuração fiscal ou rateio contábil).
- Exportações limitadas a 20.000 linhas por arquivo; períodos maiores exigem fatiamento.
- Workers de fila dependem de agendamento externo (pg_cron com o segredo do worker).
- Métricas de Realtime dependem dos painéis da plataforma; a aplicação só registra
  reconexões via `src/lib/realtimeHub.ts`.

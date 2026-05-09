# Plano de Escalabilidade — Gestor Plin

Meta: suportar 10k+ usuários, milhões de transações, sincronização instantânea entre membros de empresas, e crescimento sustentável sem degradação.

Execução em 4 fases independentes — cada fase entrega valor sozinha e pode ser pausada/aprovada entre etapas.

---

## Fase 1 — Fundação de performance (essencial)

Objetivo: queries rápidas mesmo com milhões de linhas.

### 1.1 Índices estratégicos
Criar índices nas colunas mais consultadas:

- `transactions`: `(user_id, transaction_date DESC)`, `(company_id, transaction_date DESC)`, `(category_id)`, `(account_id)`, `(contact_id)`, `(parent_transaction_id)`, `(due_date) WHERE bill_status IS NOT NULL`, `(payment_method_id)`, `(destination_account_id)`
- `accounts`: `(user_id, context, is_active)`, `(company_id, is_active)`
- `categories`: `(user_id, transaction_type, sort_order)`, `(parent_id)`
- `contacts`: `(user_id, is_active)`
- `budgets`: `(user_id, category_id, start_date, end_date)`
- `company_members`: `(user_id)`, `(company_id, user_id)`
- `transaction_attachments`: `(transaction_id)`, `(user_id)`
- `transaction_tags`: `(transaction_id)`, `(tag_id)`
- `audit_logs`: `(user_id, created_at DESC)`, `(entity_type, entity_id)`
- Junções (`category_companies`, `contact_companies`, `payment_method_companies`): índice composto nos dois FKs

### 1.2 Foreign Keys com integridade referencial
Adicionar FKs em todas as colunas que referenciam outras tabelas, com `ON DELETE` apropriado:
- `CASCADE` para tabelas-filho (anexos, tags de transação, junções, company_members)
- `SET NULL` para vínculos opcionais (category_id, contact_id, payment_method_id em transactions)
- `RESTRICT` em accounts (não deletar conta com transações)

Benefício extra: a edge function `admin-reset-data` fica muito mais simples (cascade resolve sozinho).

### 1.3 Otimização de RLS pesadas
- Reescrever a policy `Company members can view member profiles` (subquery dupla) usando função `SECURITY DEFINER` `get_user_company_ids(uid)` que retorna array — uma única passada.
- Adicionar `STABLE` onde aplicável e revisar `search_path`.

---

## Fase 2 — Otimização do frontend (essencial)

Objetivo: nunca carregar mais do que a tela precisa.

### 2.1 Paginação server-side em todas as listagens
- `Lancamentos.tsx`, `Categorias.tsx`, `Contatos.tsx`, `ContasBancarias.tsx`, `GestaoUsuarios.tsx`, `AdminAuditLogs.tsx`
- Usar `.range()` do Supabase com tamanho de página (50/100) e contador total via `count: 'exact', head: true` em query separada.

### 2.2 React Query com cache adequado
- Centralizar chaves de query (`queryKeys.ts`)
- `staleTime` por domínio: categorias/contas/contatos = 5min; transações = 30s; dashboard = 1min
- Invalidação cirúrgica após mutações (não invalidar tudo)

### 2.3 Eliminar N+1
- Auditar hooks de transações, dashboard e relatórios — usar `select` com joins relacionais do Supabase (`category:categories(name,color)`) em vez de queries separadas.

### 2.4 Selects mais magros
- Trocar `select('*')` por colunas explícitas em listagens (especialmente `transactions`, que tem 25+ colunas).

---

## Fase 3 — Realtime colaborativo (PJ)

Objetivo: membros de uma empresa veem alterações instantaneamente, sem derrubar o banco.

### 3.1 Habilitar realtime apenas em tabelas críticas
- `transactions`, `accounts`, `categories` (e talvez `contacts`)
- NÃO habilitar em `audit_logs` nem `transaction_attachments`

### 3.2 Subscriptions com filtro por `company_id`
- Hook `useRealtimeCompany(companyId)` que assina apenas eventos da empresa ativa
- Desinscreve ao trocar de contexto (PF/PJ ou outra empresa)
- Para PF, assina filtrando por `user_id`

### 3.3 Reconciliação com React Query
- Em vez de refetch global, atualizar o cache do React Query com o payload do evento (`setQueryData`) — atualização instantânea sem round-trip.

### 3.4 REPLICA IDENTITY FULL nas tabelas com realtime
- Necessário para receber `old_record` em UPDATE/DELETE.

---

## Fase 4 — Sustentabilidade de longo prazo

### 4.1 Retenção e particionamento de `audit_logs`
- Particionamento por mês (`PARTITION BY RANGE (created_at)`)
- Política de retenção: manter 12 meses online, arquivar antigos (ou deletar se não houver requisito legal)
- Job mensal via `pg_cron` para criar próxima partição e droppar a mais antiga

### 4.2 Materialização de saldos (opcional, avaliar após Fase 1)
- Hoje `current_balance` em `accounts` é mantido manualmente — risco de divergência com volume.
- Alternativa: trigger em `transactions` que recalcula incrementalmente, ou view materializada refrescada por job.
- Decidir após medir performance pós-índices.

### 4.3 Hardening da edge function `admin-reset-data`
- Após FKs com cascade, simplificar para deletar apenas as tabelas-raiz.
- Adicionar timeout interno e resposta progressiva (status 202 + job ID) para resets muito grandes.

### 4.4 Monitoramento
- Habilitar query stats no Lovable Cloud
- Documentar plano de upgrade de instância (atualmente em micro/small) — definir gatilhos: CPU > 70% sustentado, queries P95 > 500ms.

---

## Detalhes técnicos

```text
Ordem de execução recomendada:
  Fase 1 (1 migração SQL grande)  →  ganho imediato em produção
  Fase 2 (refator frontend, sem migração)
  Fase 3 (1 migração + hook novo + ajustes nas páginas)
  Fase 4 (1 migração + cron + ajuste edge function)
```

Cada fase é independente: se quiser pausar em qualquer ponto, o app continua funcional e melhor que antes.

## Validação por fase

- **Fase 1:** rodar `EXPLAIN ANALYZE` antes/depois nas 5 queries mais comuns (listagem de transações, dashboard, fluxo de caixa, relatórios, auditoria).
- **Fase 2:** medir tempo de carregamento das páginas com 1k+ transações; verificar no DevTools que listagens não puxam mais que ~50 itens.
- **Fase 3:** abrir duas abas com usuários da mesma empresa, criar transação em uma, verificar que aparece na outra em <1s.
- **Fase 4:** confirmar partições criadas, job cron ativo, reset de dados funcionando em <10s.

## O que NÃO está no plano (e por quê)

- Sharding / multi-region: prematuro, Postgres single-node aguenta milhões de linhas com índices bons.
- Migração para outro banco: desnecessário.
- Cache externo (Redis): React Query + índices resolvem o caso de uso atual.
- Filas (jobs assíncronos): só fariam sentido se houvesse processamento pesado — não é o caso hoje.

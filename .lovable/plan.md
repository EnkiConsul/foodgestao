# Plin IA — Acesso real ao banco de dados via ferramentas

## Diagnóstico

Verifiquei o log da conversa mais recente:

- Usuário: *"Qual foi o total de despesas no Nubank esse mês?"*
- Plin IA: *"O resumo de dados atual não especifica o total de despesas por conta bancária…"*

A IA está lendo dados, mas **apenas o resumo estático** montado em `plin-ia-context.ts` (totais do mês, top 5 categorias, próximos vencimentos, saldos das contas). Qualquer pergunta que sai desse recorte — "quanto gastei no Nubank?", "quanto pago para o fornecedor X?", "listar despesas de energia dos últimos 3 meses" — a IA responde honestamente que não tem esses dados, porque o prompt proíbe inventar.

Além disso o contexto é cacheado por 5 min, então mesmo dados recém-lançados demoram para aparecer.

## Objetivo

Trocar o modelo "contexto pré-montado" por **tool calling**: o Plin IA passa a consultar o banco sob demanda, com filtros arbitrários, respeitando `user_id`, `context` e `company_id` do usuário logado.

## O que mudar

### 1. Novas RPCs SQL (SECURITY DEFINER, escopo = auth.uid())

Criar migração com funções que a Edge Function chama com o cliente autenticado do usuário (não service-role), garantindo isolamento por RLS + validação de membership:

- `plin_ia_summary(_context, _company_id, _from, _to)` — receitas, despesas, saldo, pendentes, vencidos no período.
- `plin_ia_by_account(_context, _company_id, _from, _to, _type)` — total por conta bancária.
- `plin_ia_by_category(_context, _company_id, _from, _to, _type)` — total por categoria.
- `plin_ia_by_contact(_context, _company_id, _from, _to, _type)` — total por cliente/fornecedor.
- `plin_ia_upcoming(_context, _company_id, _days)` — vencimentos futuros (padrão 7d).
- `plin_ia_overdue(_context, _company_id)` — vencidos em aberto.
- `plin_ia_search_transactions(_context, _company_id, _from, _to, _type, _status, _account_id, _category_id, _contact_id, _min, _max, _query, _limit)` — busca livre, limite 50.
- `plin_ia_cashflow(_context, _company_id, _months)` — série mensal (padrão 6m).

Todas validam `private.is_company_member` quando `_context = 'pj'` e retornam vazio se `auth.uid()` não bate.

### 2. Reescrever `supabase/functions/ai-financial-agent/index.ts`

- Remover cache + `buildFinancialContext` estático. Manter apenas um "mini-briefing" curto (data atual, contexto ativo, nome da empresa quando PJ) no system prompt.
- Registrar ferramentas `ai` SDK (`tool({ description, inputSchema: zod, execute })`) — uma por RPC acima. Cada `execute` chama a RPC via cliente Supabase **autenticado com o JWT do usuário** (não service-role) e devolve JSON compacto.
- Ativar `stopWhen: stepCountIs(6)` para permitir múltiplas chamadas de ferramenta antes da resposta final.
- Atualizar o system prompt: instruir o agente a **sempre chamar ferramentas** para responder perguntas sobre valores/períodos/contas específicos, e só resumir depois.
- Manter feature-flag, quota diária, persistência em `ia_conversations` e `ia_usage_control`.

### 3. Frontend

- `PlinIAPanel.tsx`: continuar renderizando `message.parts`, mas incluir parts do tipo `tool-*` mostrando um indicador discreto ("Consultando lançamentos…") enquanto `state !== 'output-available'`. Não expor payloads brutos.
- Nenhuma mudança em `usePlinIAAgent.ts` (transport já envia `context` e `companyId`).

## Detalhes técnicos

- Cliente autenticado dentro de cada `execute`: reaproveitar `supabaseAuth` já criado no handler (fecha sobre o `authHeader`).
- Zod schemas com defaults sensatos (`_days=7`, `_months=6`, `_limit=20`, `_type` opcional `'receita'|'despesa'|'transferencia'`).
- Datas: aceitar `_from`/`_to` como ISO date; se omitidos, RPC assume mês atual.
- Segurança: nenhuma RPC aceita `user_id` como parâmetro — sempre `auth.uid()`.
- Custo: manter `google/gemini-2.5-pro`; contabilizar `usage.totalTokens` no `onFinish` como hoje.

## Fora de escopo

- Ações que escrevem no banco (criar lançamento, marcar como pago). Ficam para uma próxima iteração.
- Mudanças nos cards de insights do dashboard.

## Módulo: Contas Contábeis

Novo cadastro em **Gerenciar → Contas Contábeis** (`/contas-contabeis`) com plano de contas hierárquico ilimitado (Sintéticas ↔ Analíticas), ordenação por código de índice, vínculo com Perfis de Acesso (empresas) e suporte a códigos de imposto.

### Banco de dados

Nova tabela `public.chart_accounts`:
- `id`, `user_id`, `context` (pf/pj)
- `code` (text, ex.: `1.1.01`) — usado para ordenação natural
- `name` (nome da conta)
- `description` (descrição longa, opcional)
- `parent_id` (self-FK; NULL = raiz) — permite hierarquia sem limite
- `allow_transactions` (bool) — true = Analítica (aceita lançamentos), false = Sintética
- `is_active` (bool) — inativa preserva histórico, bloqueia novos lançamentos
- `short_code` (text, opcional) — "Conta Contábil Resumida"
- `is_tax` (bool) — se marcada, exibe campos de imposto
- `tax_code` (text) e `tax_description` (text) — só quando `is_tax = true`
- `created_at`, `updated_at`

Tabela auxiliar `public.chart_account_companies` (junction) para vincular a empresas quando `context = 'pj'`: `chart_account_id`, `company_id`.

Regras:
- RLS: dono (`user_id = auth.uid()`) OU membro da empresa vinculada (via junction, quando pj).
- GRANTs a `authenticated` e `service_role`.
- Trigger `updated_at` padrão.
- Validação: `allow_transactions = true` só permitido em folhas (sem filhos ativos) — verificada no client + trigger simples.
- Índice único parcial `(user_id, context, company_scope, code)` para evitar códigos duplicados no mesmo escopo.

### UI

**`src/pages/ContasContabeis.tsx`** — lista em árvore expandível ordenada por `code` (ordenação natural por segmentos numéricos). Cada linha mostra: código, nome, badge Sintética/Analítica, badge Ativa/Inativa, código resumido, ações Editar/Excluir/Adicionar Filha.

**`src/components/chart-accounts/ChartAccountFormDialog.tsx`** — formulário com todos os campos:
- Código (índice), Nome, Descrição
- Conta Pai (select das sintéticas existentes; vazio = raiz)
- Switch "Permitir Lançamentos" (Sim = Analítica / Não = Sintética) com ícone `HelpCircle` + Tooltip/Popover explicando: *"Analítica aceita lançamentos diretos. Sintética serve apenas para agrupar contas filhas e somar totais."*
- Situação Ativa/Inativa (Switch) — texto auxiliar: *"Inativa mantém lançamentos existentes, mas bloqueia novos."*
- Conta Resumida com `HelpCircle` + explicação: *"Código resumido usado em relatórios contábeis simplificados."*
- Checkbox "É conta de Imposto" → quando marcado revela Código do Imposto e Descrição do Imposto
- Bloco Visibilidade: Checkbox "Pessoal (PF)" + lista de empresas com checkboxes (padrão pattern de `CategoryFormDialog`)
- Todos os campos editáveis também na edição.

**Sidebar** — inserir `{ title: "Contas Contábeis", url: "/contas-contabeis", icon: BookOpen }` em `secondaryItems` (grupo Gerenciar), abaixo de Categorias.

**Rota** em `src/App.tsx` dentro do bloco protegido.

### Validação

Adicionar `chartAccountSchema` em `src/lib/validations.ts` (zod): `code` obrigatório (regex `^\d+(\.\d+)*$`), `name` 1–120, `short_code` opcional ≤30, `is_tax` requer `tax_code`+`tax_description` quando true.

### Fora do escopo (nesta entrega)

- Integração com o formulário de lançamentos (seleção de conta contábil) — pode ser feito depois; a tabela já fica pronta para relacionamento futuro via `chart_account_id` em `transactions`.

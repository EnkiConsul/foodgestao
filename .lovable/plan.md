
# Plano padrão de categorias 360°FOOD

## Decisões confirmadas
- **Escopo:** só PJ — cada empresa nova recebe as 69 categorias no cadastro.
- **Empresas existentes:** botão manual "Importar plano padrão 360°FOOD" na tela Categorias (idempotente por `template_code`).
- **Subtipo (Custo/Despesa/Imposto/Investimento/Receita/Saída):** metadado que alimenta filtros e agrupamentos nos relatórios contábeis (DRE, Fluxo de Caixa).
- **Liberdade total do usuário:** todas as 69 categorias padrão podem ser **renomeadas, editadas, movidas, reordenadas e excluídas**. O usuário pode **criar novas categorias sem qualquer limite**, em qualquer nível da árvore, misturadas às do template.
- **`template_code` (ex.: `CAT000023`) é imutável** — permanece na categoria mesmo após renomeação/move, para preservar o histórico de lançamentos vinculados ao plano original. Categorias criadas pelo usuário nascem com `template_code = NULL`.

---

## 1. Banco de dados

### 1.1. Nova migração em `public.categories`
Adicionar colunas (nullable, para não quebrar dados legados):
- `template_code TEXT` — imutável, único por (`user_id`, `company_id`, `template_code`).
- `category_subtype TEXT` — valores: `receita`, `saida`, `custo`, `despesa`, `imposto`, `investimento`.
- `ai_description TEXT` — descrição semântica para o agente IA.
- `previous_index TEXT` — rastreabilidade do índice anterior da planilha.
- `is_customizable BOOLEAN DEFAULT true` — flag apenas informativa (raízes vêm como `false`, mas UI não bloqueia nada).
- `is_active BOOLEAN DEFAULT true` — soft-status; exclusão real continua permitida.
- Índice único parcial: `(user_id, company_id, template_code) WHERE template_code IS NOT NULL` para garantir idempotência do import — não restringe a criação de categorias novas (que ficam com `template_code = NULL`).

### 1.2. Nova tabela `public.category_templates`
Catálogo mestre versionável das 69 categorias:
- `code TEXT PRIMARY KEY` (`CAT000001` …)
- `parent_code TEXT` (self-ref)
- `name`, `level`, `sort_order`, `subtype`, `ai_description`, `previous_index`, `is_customizable`, `transaction_type` (receita/despesa)
- Populada via seed SQL na mesma migração.
- `GRANT SELECT ... TO authenticated`; escrita restrita a `service_role`.

### 1.3. Função RPC `public.seed_default_categories(_company_id UUID)`
- `SECURITY DEFINER`, valida ownership da empresa.
- Percorre `category_templates` em ordem hierárquica (por `level` + `sort_order`).
- Para cada template ainda não presente em `(user_id, company_id, template_code)`, cria a linha em `categories` respeitando `parent_id` mapeado pelos códigos já inseridos.
- Não toca nas categorias criadas ou editadas pelo usuário.
- Retorna quantas foram criadas / puladas.

### 1.4. Trigger em `companies`
`AFTER INSERT` em `public.companies` chama `seed_default_categories(NEW.id)` automaticamente para cada empresa nova.

---

## 2. Frontend

### 2.1. `src/pages/Categorias.tsx`
- Novo botão **"Importar plano padrão 360°FOOD"** (contexto PJ) — chama a RPC e mostra toast com contadores.
- Botão existente **"Nova Categoria"** continua permitindo criação livre e ilimitada, em qualquer nível.
- Exibir badge **Índice** (calculado no cliente a partir da árvore: `2.3.2.4.`).
- Exibir badge do **Subtipo** com cor distinta por tipo.
- Ícone/tooltip discreto quando `template_code` estiver preenchido, indicando "vem do plano padrão" — sem travar edição/exclusão.

### 2.2. `src/components/categories/CategoryFormDialog.tsx`
- Campos novos:
  - **Subtipo** (`Select`: Receita, Saída, Custo, Despesa, Imposto, Investimento).
  - **Descrição para IA** (`Textarea`, opcional).
- Campos somente-leitura quando a categoria tiver `template_code`:
  - **ID Interno** (`template_code`).
  - **Índice anterior** (`previous_index`).
- Nome, pai, cor, subtipo, descrição IA, ordem: sempre editáveis. Exclusão sempre permitida.
- Novas categorias criadas pelo usuário: todos os campos livres, `template_code` fica em branco.

### 2.3. `src/components/onboarding/StepCategories.tsx`
- Substituir o checklist atual por um resumo: "Sua empresa receberá o plano 360°FOOD (69 categorias em 4 níveis) — você poderá editar, excluir ou criar novas categorias à vontade" + prévia colapsável.
- PF mantém o comportamento atual (categorias mínimas).

### 2.4. Relatórios contábeis
- `BalanceSheet.tsx`, `DreReport.tsx`, `AccountTreeTable.tsx`: filtro/agrupamento por `category_subtype` para separar Custos, Despesas, Impostos e Investimentos dentro de Saídas.

### 2.5. Agente IA
- `supabase/functions/_shared/plin-ia-context.ts` e `ai-financial-agent`: enviar `ai_description` das categorias no contexto para melhorar a classificação automática de lançamentos.

---

## 3. Compatibilidade e migração de dados

- Nenhum lançamento existente é alterado — o vínculo continua via `category_id` (UUID).
- Categorias legadas do usuário ficam com `template_code = NULL` e convivem com as importadas e com futuras criações livres.
- Validação Zod (`categorySchema`) em `src/lib/validations.ts` ganha os novos campos opcionais.
- Typegen do Supabase é atualizado automaticamente após a migração.

---

## Detalhes técnicos (para revisão)

- **Ordem da migração:** (1) ALTER TABLE `categories`; (2) CREATE TABLE `category_templates` + GRANTs + RLS; (3) INSERT dos 69 templates; (4) CREATE FUNCTION `seed_default_categories`; (5) CREATE TRIGGER em `companies`.
- **Idempotência:** índice único parcial + `ON CONFLICT DO NOTHING` no seed evitam duplicar categorias do template; categorias criadas pelo usuário (`template_code = NULL`) nunca colidem.
- **Sem limite de categorias:** não há CHECK/quota no banco nem validação no frontend limitando quantidade.
- **Mapeamento subtipo → transaction_type:** `receita` → `receita`; `saida`/`custo`/`despesa`/`imposto`/`investimento` → `despesa`.
- **Cores padrão por subtipo:** Receita verde, Custo vermelho, Despesa laranja, Imposto roxo, Investimento azul, Saída cinza.
- **Ordem de inserção no seed:** por `level` crescente e depois `sort_order`, garantindo que o `parent_id` já exista quando um filho é inserido.

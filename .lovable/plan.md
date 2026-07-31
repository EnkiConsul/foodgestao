## Objetivo

Criar a tela de cadastro de **Centros de Custo** no módulo Financeiro, com listagem, criação, edição e ativar/inativar, seguindo o mesmo padrão de visibilidade PF/PJ já usado em Formas de Pagamento e Categorias.

Escopo desta etapa: **apenas o cadastro**. O campo no formulário de lançamento e o filtro nos Relatórios Contábeis ficam para a etapa seguinte.

## Situação atual (verificada)

- A tabela `cost_centers` existe com `id, user_id, name, description, is_active, created_at`, sem vínculo com empresa e com uma única política de acesso baseada em `user_id`.
- Não existe página, rota nem item de menu para centros de custo.
- `transactions.cost_center_id` e `credit_cards.cost_center_id` já existem e continuam intocados.

## Banco de dados

1. Adicionar `updated_at` (com trigger de atualização) e `visible_pf boolean not null default true` em `cost_centers`.
2. Criar a tabela de vínculo `cost_center_companies (cost_center_id, company_id)` com chave primária composta, `GRANT` para `authenticated`/`service_role`, RLS habilitada e políticas espelhando `payment_method_companies` (acesso a membros da empresa; escrita para dono/admin).
3. Substituir a política única de `cost_centers` pelo padrão colaborativo: o dono vê e edita os seus; membros da empresa enxergam os centros vinculados àquela empresa.
4. Índice único por usuário para impedir nomes duplicados de centro de custo.

## Frontend

- **`src/pages/CentrosCusto.tsx`** — cabeçalho, busca por nome, botão "Novo Centro de Custo", lista em cards/linhas com nome, descrição, badges das empresas vinculadas (ou "Pessoal"), status Ativo/Inativo, ações Editar e Ativar/Inativar, além de estados vazio e de carregamento.
- **`src/components/cost-centers/CostCenterFormDialog.tsx`** — campos Nome, Descrição, switch Ativo, checkbox "Visível no Pessoal (PF)" e checkboxes das empresas; validação Zod (`costCenterSchema` em `src/lib/validations.ts`) via `validateWithToast`, exigindo ao menos um vínculo.
- **Ativar/Inativar** direto na lista, com confirmação ao inativar avisando que lançamentos existentes mantêm o centro, mas ele deixa de aparecer em novas seleções.

## Navegação

- Rota `/centros-custo` em `src/App.tsx` (lazy, dentro da área autenticada).
- Item "Centros de Custo" no grupo de cadastros em `src/components/layout/sidebar-menus/FinanceiroMenu.tsx` e em `src/config/mobileNav.tsx`, junto de Formas de Pagamento.

## Notas técnicas

- Consultas usam o contexto ativo PF/PJ (`useCompanyContext`) e o padrão de visibilidade híbrida (`visible_pf` + tabela de junção), sem `.eq('user_id')` em contexto PJ na leitura colaborativa.
- Tipos do backend são regenerados após a migração; o código da tela é escrito depois disso.
- Nenhuma alteração no motor financeiro, em saldos ou no formulário de lançamento nesta etapa.

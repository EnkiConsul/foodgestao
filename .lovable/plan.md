# Isolamento entre empresas — fechar as brechas restantes (P0)

## O que já está resolvido

A regra de leitura de **cartões de crédito** foi corrigida: hoje um cartão com empresa só é visível para membros daquela empresa (`company_id IS NOT NULL AND is_company_member(...)`). O mesmo vale para faturas de cartão, contas financeiras e lançamentos, que já exigem ser membro da empresa. Também existe um teste automático que reprova qualquer consulta de cartão/extrato escrita sem filtro de empresa.

## O que ainda está aberto (verificado agora no banco)

Outras áreas continuam com a **mesma regra antiga** que causou o incidente dos cartões — "o dono do registro vê o registro, independente da empresa":

| Área | Regra atual de leitura |
|---|---|
| Clientes/Fornecedores (contatos) | dono vê todos os seus contatos, de qualquer empresa |
| Categorias | dono vê todas as suas categorias, de qualquer empresa |
| Centros de custo | dono vê todos, de qualquer empresa |
| Formas de pagamento | dono vê todas, sem checagem de empresa |
| Etiquetas (tags) | dono vê todas, sem checagem de empresa |
| Regras de importação | dono vê todas, sem checagem de empresa |
| Faturas de cartão | além da empresa, ainda mantém o atalho "dono vê" |

Ou seja: qualquer tela ou consulta que esqueça o filtro de empresa nessas áreas devolve dados de outras empresas do mesmo dono. É o mesmo risco P0, só em outras tabelas.

Dado importante encontrado: **138 categorias de 12 usuários não estão vinculadas a nenhuma empresa**. Se a regra for endurecida sem tratar isso, essas categorias desaparecem das telas. Contatos, centros de custo e formas de pagamento estão 100% vinculados, sem esse problema.

## Plano

### 1. Regularizar as categorias sem empresa
Antes de mudar qualquer regra: vincular cada categoria órfã à(s) empresa(s) do seu dono (quando o dono tem uma única empresa, vínculo direto; com mais de uma, vincular a todas as empresas das quais ele é proprietário, preservando o uso atual). Relatório do antes/depois para conferência.

### 2. Endurecer as regras de acesso (mesmo padrão dos cartões)
Para contatos, categorias, centros de custo, formas de pagamento, etiquetas, regras de importação e faturas de cartão: o acesso passa a exigir **vínculo com a empresa** do registro. O atalho "sou o dono, logo vejo" é removido — como a plataforma é somente empresarial, ninguém legítimo perde acesso.

### 3. Rede de proteção no código
Ampliar a verificação automática que hoje cobre cartões/extrato para todas as telas que leem essas tabelas: qualquer leitura sem filtro de empresa reprova no CI. Corrigir as leituras que a verificação apontar.

### 4. Testes de isolamento reais
Acrescentar à suíte de isolamento (dois usuários, duas empresas) casos para contato, categoria, centro de custo, forma de pagamento, etiqueta e fatura: usuário da Empresa A não lê nem altera registro da Empresa B, mesmo tendo criado o registro.

### 5. Validação final
Conferir na tela, com uma empresa selecionada, que continuam aparecendo os contatos, categorias, centros de custo e formas de pagamento daquela empresa — e nenhum de outra. Rodar o gate completo (tipos, lint, testes, isolamento).

## Detalhes técnicos

- Backfill de `category_companies` para as 138 categorias órfãs via script de dados (não migração), com log do resultado.
- Migração ajustando as policies para o padrão já usado em `credit_cards`:
  - `contacts` / `categories`: substituir o ramo `auth.uid() = user_id` por exigência de vínculo nas funções `private.contact_visible_to_member` / `category_visible_to_member` (e equivalentes de escrita).
  - `cost_centers`: remover `cost_centers_owner_all`, manter apenas as policies por módulo/empresa e criar as de insert/delete equivalentes.
  - `payment_methods`, `tags`, `import_rules`: policies por `payment_method_companies` / `company_id` conforme o modelo de cada tabela, com GRANTs revisados.
  - `credit_card_invoices`: remover o ramo `user_id = auth.uid()` de select/update/delete.
- Estender `src/test/unit/companyScopeGuards.test.ts` (lista de arquivos e de tabelas) para Contatos, Categorias, Centros de Custo, Formas de Pagamento, Orçamento e Relatórios.
- Novos casos em `src/test/tenancy/multi_company.tenancy.test.ts` e um `src/test/rls/tenant_owner_bypass.rls.test.ts` garantindo que nenhuma policy de tabela multiempresa volte a ter ramo `user_id` sem `company_id`.
- Sem alteração em saldos, faturas fechadas ou lançamentos existentes.

## Fora deste bloco

- Módulo Pessoas (DP) — as regras `dp_*` de auto-leitura do colaborador são intencionais e serão avaliadas em bloco próprio.
- Avisos do linter de banco não relacionados a isolamento.

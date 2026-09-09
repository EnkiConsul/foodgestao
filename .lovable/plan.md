# Painel de Donos das Empresas (backoffice)

## Objetivo
Nova página no backoffice para ver e gerenciar quem é dono de cada empresa cadastrada, com a situação da assinatura de quem paga.

## O que o usuário verá
Novo item de menu **Donos das Empresas** (grupo Tenants), em `/admin/donos`.

Lista por empresa, com busca por empresa, CNPJ, nome ou e-mail do dono:
- Empresa (razão social / nome fantasia) e situação ativo/inativo
- Titular (quem paga): nome, e-mail, WhatsApp
- Situação da assinatura do titular: em teste, ativa, cancelada, isenta, com data de vencimento/fim do teste
- Demais donos da empresa (papel "Dono"), com nome e e-mail
- Alerta quando a empresa não tem nenhum dono ou o titular não é dono

Ações por empresa:
- **Adicionar dono**: busca um usuário já cadastrado por e-mail e o promove a dono
- **Remover dono**: retira o papel de dono; bloqueado quando sobraria nenhum dono e quando a pessoa é o titular
- **Transferir titularidade**: escolhe um dos donos da empresa como novo titular; confirmação explicando que a cobrança da assinatura passa a ser desse usuário

Toda ação pede confirmação e registra no histórico de auditoria.

## Regras
- Somente super admin acessa a página e as ações.
- Transferir titularidade só para quem já é dono (ou promove no mesmo passo).
- Sempre pelo menos um dono e um titular por empresa.
- A assinatura mostrada é sempre a do titular, coerente com a regra "quem paga é o dono".

## Detalhes técnicos
- Nova Edge Function `admin-company-owners` (service role, valida JWT e `is_super_admin`), com ações:
  - `list`: junta `companies` (titular = `companies.user_id`), `company_members` com `role='owner'`, `profiles` (nome, telefone), e-mail de `auth.users`, e `subscriptions` do titular.
  - `add_owner` / `remove_owner`: escreve em `company_members` aplicando as travas acima.
  - `transfer_owner`: atualiza `companies.user_id` e garante `company_members` do novo titular como `owner`.
  - Cada ação grava em `audit_logs`.
  - Validação de entrada com Zod; erros com CORS estrito, no padrão de `admin-list-users-auth`.
- Frontend: `src/pages/admin/DonosEmpresas.tsx` + `src/components/admin/AdminCompanyOwners.tsx` (tabela desktop / cartões mobile, seguindo `AdminUsers.tsx`), rota lazy em `src/App.tsx` e item em `AdminSidebar.tsx`.
- Sem migração de banco: as escritas passam pela Edge Function com service role, já que o super admin não tem policy de leitura/escrita em `company_members` de outras empresas.

## Verificação
- Typecheck (`bunx tsgo --noEmit`).
- Conferência no preview em `/admin/donos`: lista carregada, empresa com dois donos exibindo ambos, e as três ações com confirmação.

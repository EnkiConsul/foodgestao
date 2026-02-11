

# Modulo de Gestao de Contas Bancarias

## Objetivo
Criar uma nova pagina para gerenciar as contas bancarias do usuario (tabela `accounts`), permitindo listar, criar, editar e excluir contas, com visualizacao de saldos.

## O que ja existe
- A tabela `accounts` no banco de dados ja possui todos os campos necessarios: `name`, `account_type`, `current_balance`, `initial_balance`, `is_active`, `icon`, `color`, etc.
- RLS ja esta configurada corretamente.
- Nao sera necessaria nenhuma migracao de banco de dados.

## Funcionalidades da pagina

1. **Cards resumo** - Saldo total, quantidade de contas ativas
2. **Lista de contas** - Cards mostrando nome, tipo, saldo atual, com icone e cor
3. **Criar conta** - Dialog com formulario (nome, tipo, saldo inicial)
4. **Editar conta** - Mesmo dialog reutilizado para edicao
5. **Excluir conta** - Botao com confirmacao
6. **Ativar/Desativar** - Toggle de status

## Arquivos a criar/modificar

### Novos arquivos
1. **`src/pages/ContasBancarias.tsx`** - Pagina principal do modulo, seguindo o padrao das paginas existentes (Lancamentos, Contas)
2. **`src/components/accounts/AccountFormDialog.tsx`** - Dialog para criar/editar contas bancarias

### Arquivos a modificar
3. **`src/App.tsx`** - Adicionar rota `/contas-bancarias`
4. **`src/components/layout/AppSidebar.tsx`** - Adicionar item "Contas Bancarias" no menu (icone `Landmark` do lucide)
5. **`src/components/layout/BottomNav.tsx`** - Nao alterar (espaco limitado, acessivel via "Mais")

## Detalhes tecnicos

### Pagina ContasBancarias.tsx
- Busca dados de `accounts` filtrado por `user_id`
- Cards de resumo: saldo total e numero de contas ativas
- Lista em cards com nome, tipo (badge), saldo formatado, botoes de editar/excluir
- Filtro por busca (nome) e tipo de conta
- FAB mobile para criar nova conta
- Usa `usePrivacy` para mascarar valores

### AccountFormDialog.tsx
- Campos: nome, tipo (select com os tipos do enum `account_type`), saldo inicial (currency input)
- Modo criacao: insere na tabela `accounts` com `user_id`, `current_balance = initial_balance`
- Modo edicao: atualiza nome, tipo; nao permite alterar saldo inicial apos criacao
- Validacao: nome obrigatorio, saldo numerico

### Rota e navegacao
- Rota: `/contas-bancarias` dentro do layout protegido
- Sidebar: item adicionado ao grupo "Gerenciar" com icone `Landmark`


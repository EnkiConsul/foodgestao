# Separar menu Conta do menu Financeiro

## Problema
Nas rotas `/empresas`, `/gestao-usuarios`, `/planos`, `/faturas` e `/configuracoes`, a sidebar renderiza o **menu Financeiro 360°** (Dashboard, Lançamentos, Fluxo de Caixa, Orçamento, Relatórios, Cadastros) **junto** com o **menu Conta**. Isso ocorre porque `useActiveModule` trata essas rotas como módulo `financeiro` (fallback), e o `AppSidebar` sempre renderiza `FinanceiroMenu` + `AccountMenu` nesse caso.

## Objetivo
Ao acessar qualquer página do menu **Conta**, a sidebar deve mostrar apenas:
1. Link "Hub de Módulos" (mantido, conforme sua confirmação)
2. Seção **Conta** (Minhas Empresas, Usuários, Meu Plano, Minhas Faturas, Configurações, + Backoffice para super admin)

Sem o menu Financeiro. O menu Financeiro continua aparecendo normalmente nas rotas do módulo Financeiro.

## Alterações

### 1. `src/hooks/useActiveModule.tsx`
Adicionar um novo valor `"conta"` no tipo `ActiveModule` e detectar as rotas de conta antes do fallback:

```
if (pathname.startsWith("/empresas")) return "conta";
if (pathname.startsWith("/gestao-usuarios")) return "conta";
if (pathname.startsWith("/planos")) return "conta";
if (pathname.startsWith("/faturas")) return "conta";
if (pathname.startsWith("/configuracoes")) return "conta";
```

Adicionar rótulo em `MODULE_LABEL`: `conta: "Conta"`.

### 2. `src/components/layout/AppSidebar.tsx`
- No `switch` de `renderModuleMenu`, tratar `case "conta": return null;` para não renderizar o menu Financeiro.
- Manter o link "Hub de Módulos" visível (a condição atual já exclui apenas `portal_colaborador` e `admin`; `conta` continuará mostrando o Hub, ok).
- `showAccount` já é `true` para `conta` (só oculta em `admin`), então o `AccountMenu` continua aparecendo.

### 3. Verificar consumidores de `useActiveModule`
Rodar uma busca por `useActiveModule` / `ActiveModule` para garantir que nenhum outro lugar (breadcrumbs, header, guards) quebre com o novo valor `"conta"`. Onde houver `switch` exaustivo, adicionar o caso.

## Resultado esperado
- `/empresas`, `/gestao-usuarios`, `/planos`, `/faturas`, `/configuracoes` → sidebar mostra apenas Hub + seção Conta.
- Rotas do Financeiro (`/dashboard`, `/lancamentos`, etc.) → sidebar continua com Financeiro + Conta como hoje.
- Módulo DP, Portal, Admin e demais → inalterados.

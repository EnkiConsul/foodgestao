# Plano — Importação do Portal Colaborador (DP) + Hub de Módulos 360°

## 1. Fonte do código

Repositório informado: `https://github.com/pakere1996/portalcolaborador.git` (público).

Fluxo de importação — **eu executo em modo build**, você não precisa fazer nada manualmente:

1. `git clone` do repo em `/tmp/portalcolaborador` dentro do sandbox.
2. Inspecionar estrutura (`package.json`, stack, dependências, migrations SQL, assets).
3. Mapear cada arquivo para o destino no projeto 360°FOOD e portar (não é "colar" — precisa adaptar aliases, design tokens, contexto PJ, RLS).

> Observação: se o repo estiver em outra stack (Next.js, Vue, CSS Modules puros, etc.), farei o **porte** para React + Vite + Tailwind + shadcn. Se houver dependência incompatível, sinalizo antes de instalar.

## 2. Estrutura de Módulos 360°

Registro central dos 5 módulos previstos:

| Slug | Nome exibido | Status inicial | Ícone |
|---|---|---|---|
| `financeiro` | Financeiro 360° | Ativo (todo o app atual) | Wallet |
| `dp` | DP 360° | Em implantação (código do repo) | Users |
| `crm` | CRM 360° | Em breve | Handshake |
| `rh` | RH 360° | Em breve | UserCheck |
| `pedidos` | Pedidos 360° | Em breve | ShoppingCart |

Enum no banco: `app_module` com esses 5 valores. Cada card/menu do app lê dessa fonte única.

## 3. Hub de Módulos (nova landing PJ)

- Rota `/hub` — **tela padrão pós-login em contexto PJ**. Ajusto `RootGate` e o redirect pós-onboarding para `/hub` quando `contextType === "pj"`.
- Contexto PF continua indo direto para `/dashboard` (comportamento atual preservado).
- Layout: grid de 5 cards grandes com identidade 360°FOOD (laranja `#EB6119` + marinho `#0F1B3D`), cada card mostra:
  - Ícone + Nome do módulo
  - Descrição curta
  - Badge de status: **Ativo** / **Em breve** / **Não contratado** / **Trial até dd/mm**
  - Botão principal: "Entrar", "Contratar" (WhatsApp) ou "Em breve" (desabilitado)
- Header do Hub com seletor de empresa (reaproveita `ContextSelector`) e botão "Voltar ao Hub" fica disponível dentro de cada módulo.

## 4. Navegação por módulo

- Sidebar do `AppLayout` ganha um **seletor de módulo no topo** (abaixo do logo). Ao trocar de módulo, o menu inteiro do sidebar troca:
  - Financeiro → itens atuais (Dashboard, Lançamentos, Fluxo, Orçamento, Relatórios, Gerenciar…).
  - DP → itens que vierem do repo importado.
  - CRM/RH/Pedidos → placeholder ("Módulo em breve").
- Rotas do DP ficam sob `/dp/*` protegidas por `<ModuleGuard module="dp">`.
- Rotas do Financeiro permanecem exatamente como hoje (`/dashboard`, `/lancamentos`, etc.) — zero regressão.
- Item "Voltar ao Hub" no topo do sidebar.

## 5. Controle de contratação por módulo

Como cada módulo é contratação avulsa:

- Tabela `company_modules` (colunas de domínio: `company_id`, `module`, `status`, `starts_at`, `ends_at`, `notes`).
  - `status`: `active | trial | suspended | canceled | not_contracted`.
- Hook `useCompanyModules()` retorna o mapa `{ module → status }` para a empresa selecionada.
- `<ModuleGuard module="dp">` bloqueia rotas do módulo com tela "Módulo não contratado" + CTA WhatsApp (`+5562992365959` já existente).
- **Financeiro é sempre `active`** para todas as empresas (default via trigger) — mantém retrocompatibilidade.
- Nova página `pages/admin/Modulos.tsx` no Backoffice: super_admin ativa/suspende módulos por empresa manualmente. Integração automática com Asaas fica para fase 2.

## 6. Banco de dados (migration única)

- `CREATE TYPE app_module AS ENUM ('financeiro','dp','crm','rh','pedidos');`
- `CREATE TYPE module_status AS ENUM ('active','trial','suspended','canceled','not_contracted');`
- `CREATE TABLE public.company_modules (…)` + GRANTs + RLS + policies escopadas por `company_id` via `has_role`/membership.
- Trigger `AFTER INSERT ON companies` inserindo `('financeiro', 'active')` automaticamente.
- Backfill: inserir `financeiro/active` para todas as empresas existentes.
- Migrations SQL vindas do repo do DP → analisadas, adaptadas ao padrão 360°FOOD (RLS + GRANTs + `company_id`) e rodadas em migration separada após aprovação.

## 7. Etapas de execução (após você aprovar)

1. **Clone e inventário** do repo (relatório do que veio: rotas, componentes, tabelas, assets, deps).
2. **Migration 1**: enum + `company_modules` + trigger + backfill.
3. **Hub de Módulos** (`/hub`) + roteamento PJ pós-login + `<ModuleGuard>`.
4. **Sidebar dinâmica** com seletor de módulo.
5. **Migration 2**: tabelas do DP portadas com RLS/GRANTs corretos.
6. **Porte dos componentes/páginas do DP** para `src/pages/dp/*` e `src/components/dp/*` — tokens de cor, `validateWithToast`, `useCompanyContext`.
7. **Página admin** `/admin/modulos` para gerir contratações.
8. **Validação**: `tsgo --noEmit` + Playwright (login → hub → entrar em Financeiro → voltar → tentar DP sem contratação → ativar via admin → entrar em DP).

## 8. Confirmações necessárias

Se qualquer resposta abaixo mudar, me avise antes de aprovar; caso contrário, sigo com os defaults:

- **Ícones dos módulos**: proponho os da tabela (seção 2). OK trocar depois.
- **DP 360° em PF?** Default: **não** — módulos são só em PJ. PF continua vendo apenas Financeiro no /dashboard.
- **Empresas existentes ganham quais módulos ativos?** Default: apenas `financeiro/active`. DP/CRM/RH/Pedidos ficam `not_contracted` até ativação manual.
- **URL do Hub**: `/hub`. Alternativa: `/modulos`.

---

## Notas técnicas (referência)

- `App.tsx`: novo `<Route path="/hub">`, ajuste em `RootGate` para redirecionar PJ→`/hub` e PF→`/dashboard`, novas rotas `/dp/*` sob `<AppLayout><ModuleGuard module="dp">`.
- `AppSidebar.tsx`: refatorar `mainItems`/`secondaryItems` para receber conjunto por módulo via prop/hook `useActiveModule()`.
- `useCompanyContext`: adicionar `activeModule` + `setActiveModule` persistido em localStorage (chave `app-active-module`).
- Repo importado NÃO deve tocar: `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- Assets binários grandes vão para `public/dp/` (fora do bundle).

## Objetivo

Refatorar a página `/mais` (mobile) para espelhar exatamente a estrutura do menu lateral do desktop de cada módulo: mesmos títulos de seções, mesmos itens clicáveis e **mesmo comportamento de expandir/recolher submenus** (accordion), mantendo o visual iFood Gestor (chips coloridos + cards de botões) e a `BottomNav` fixa.

## Estrutura por módulo (fonte da verdade = sidebar desktop)

### Financeiro (`/mais`)
- **Financeiro 360°** (links diretos): Dashboard · Lançamentos · Fluxo de Caixa · Orçamento
  - **Relatórios** (grupo colapsável): Financeiros · Contábeis
- **Cadastros**: Contas Bancárias · Cartões de Crédito · Formas de Pagamento · Clientes/Fornecedores · Categorias · Contas Contábeis
- **Conta**: Minhas Empresas · Usuários · Meu Plano · Minhas Faturas · Configurações · (Backoffice se super admin)

### DP Admin (`/dp/mais`)
- **DP 360°** — Início (link direto)
  - **Cadastro** (colapsável, hub `/dp/cadastros`): Colaboradores · Cargos · Unidades · Sindicatos · Pendências
  - **Folgas** (colapsável, hub `/dp/folgas`): Calendário Geral · Solicitações · Aprovações · Trocas · Datas Bloqueadas
  - **Documentos** (colapsável, hub `/dp/documentos`): Contracheques · Adiantamentos · Folhas de Ponto · Atestados · Registros Disciplinares · ACT-CCT · Histórico Completo
  - **Comunicação** (colapsável, hub `/dp/comunicacao`): Mensagens · Quadro de Avisos
- **Conta**: mesma da Financeiro

### Portal Colaborador (`/dp/meu/mais`)
- **Portal** — Início · Meu Cadastro (links)
  - **Folgas** (grupo estático, sempre expandido): Calendário · Trocas · Histórico · Solicitações
  - **Documentos** (grupo estático): Meus Documentos · Atestados · Disciplinar · Sindicato
- **Conta**: Configurações

### Admin Backoffice (`/admin/mais`)
Reproduz `AdminSidebar` (Visão geral, Cobrança, Tenants) como seções planas.

### Hub (`/mais` quando módulo=hub)
Mostra apenas atalhos de conta + link para módulos (mantém comportamento atual simples).

## Mudanças técnicas

### 1. `src/config/mobileNav.tsx`
Estender o tipo `MoreGroup` com suporte a subgrupos colapsáveis:

```ts
export type MoreSubGroup = {
  kind: "collapsible" | "static";
  label: string;
  icon: LucideIcon;
  hubTo?: string;          // rota do "cabeçalho clicável" (colapsável)
  matchPrefixes?: string[]; // para auto-abrir quando rota bate
  items: NavLeaf[];
};

export type MoreGroup = {
  label: string;
  accent?: GroupAccent;
  items?: NavLeaf[];       // links planos da seção
  subgroups?: MoreSubGroup[]; // grupos colapsáveis/estáticos
};
```

Reescrever `moreGroups` de cada módulo para refletir as seções do desktop conforme mapeamento acima. Preservar `home`, `hubTo`, `moreTo`, `shortcutOptions` intactos.

### 2. `src/components/mobile/MoreGroupSection.tsx`
Adicionar renderização de `subgroups`:
- **Colapsável**: header clicável (título + ícone + chevron rotativo) que expande/recolhe os subitens; abre automaticamente se a rota atual bate em `matchPrefixes`; toque no cabeçalho navega para `hubTo` (mesma UX do desktop `DpGroup`) além de togglar. Apenas um grupo aberto por vez por seção.
- **Estático**: título fixo, subitens sempre visíveis.
- Subitens renderizados como cards menores (mesmos botões atuais em grid 2 col, sem `featured`).
- Manter chip de accent no header da seção.
- Manter long-press → favoritar em todos os subitens.

### 3. `src/pages/Mais.tsx`
- Achatar todos os `subgroups[].items` no `allItems` usados por busca/favoritos (para que busca continue encontrando "Cargos", "Atestados" etc.).
- Nenhuma outra mudança de fluxo.

### 4. Sem alterações em
- `MobileBottomNav.tsx`, `MoreHeader.tsx`, `App.tsx`, roteamento.
- Lógica de atalhos, favoritos, personalização.

## Detalhes de UX

- **Persistência do estado aberto/fechado**: não persistir entre navegações (estado local do componente). Grupo cuja rota atual pertence abre automaticamente ao entrar em `/mais`.
- **Toque no cabeçalho do grupo colapsável**: comportamento igual ao desktop — navega para `hubTo` E abre o accordion. No mobile, se o usuário quiser apenas expandir sem navegar, pode tocar no chevron (área separada); ou apenas expandir sem navegar (a decidir — proponho **expandir apenas ao tocar**, com um botão "Abrir seção" secundário dentro do accordion linkando ao hub, evitando navegação acidental).
- **Chip accent**: cada seção topo mantém quadrado colorido conforme já implementado; subgrupos herdam neutro.
- **BottomNav**: continua fixa, slot "Mais" ativo.

## Não escopo
- Mudanças no sidebar desktop.
- Mudanças em ícones/labels desktop.
- Mudanças de roteamento.

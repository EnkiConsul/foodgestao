# Plano — Página "Mais" full-screen estilo iFood Gestor

Referência: screenshot do iFood Gestor (header contextual no topo, cartão de destaque, grupos com ícone colorido de categoria, cards em 1‑col/2‑col, barra inferior fixa visível o tempo todo).

## O que muda

Hoje o slot **Mais** abre um `Sheet` (bottom sheet ~88vh). Vai virar uma **rota real full-screen** (`/mais`) renderizada **dentro do `AppLayout`**, então a `MobileBottomNav` continua fixa embaixo com o item "Mais" ativo. Ao tocar em qualquer card, navega para a rota do item e a barra permanece.

## Estrutura visual

```text
┌─────────────────────────────────────┐
│  360°FOOD · Financeiro       [🔔]   │  ← header contextual
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🏢  Acompanhar empresas       › │ │  ← cartão destaque
│ └─────────────────────────────────┘ │
│                                     │
│ ⬛ Operar                            │  ← chip 32x32 colorido + label
│ ┌─────────────────────────────────┐ │
│ │ 📄  Lançamentos                 │ │  ← item featured (linha inteira)
│ └─────────────────────────────────┘ │
│ ┌───────────────┐ ┌───────────────┐ │
│ │ 💳 Cartões    │ │ 🔁 Recorrênc. │ │  ← grid 2-col
│ └───────────────┘ └───────────────┘ │
│ ...                                 │
│ [ 🔍 Buscar funcionalidade ]        │
│ [ ⚙️  Personalizar barra ] [ 🚪 ]    │
├─────────────────────────────────────┤
│  Hub · A · Início · B · [Mais]      │  ← BottomNav FIXA (sempre visível)
└─────────────────────────────────────┘
```

Regras de layout:
- Ícone da categoria em quadrado 32x32 arredondado, cor semântica por grupo.
- Primeiro item de um grupo pode ser destacado (linha inteira, h≈64px); os demais em grid 2-col. Controlado via campo opcional `featured` no `MoreGroup`.
- Cards em `bg-muted/40` sobre `bg-background`, label `text-sm font-medium`, ícone 20px.
- Padding-bottom da página = altura da BottomNav + safe-area, para o último card não ficar coberto.

Cores dos grupos (mapa fixo em config, consistente entre módulos):
- Operar → primário (laranja 360°FOOD)
- Cadastros → marinho
- Relatórios → âmbar
- Backoffice / Configuração → slate
- Conta → primário suave
- Meu portal → marinho

## O que fica igual

- BottomNav (5 slots, Início central, atalhos A/B customizáveis) **sempre fixa**, inclusive na `/mais`.
- Config declarativa em `src/config/mobileNav.tsx` alimenta a página; adiciono só `accent?` por grupo e `featured?` por item.
- Favoritos + long-press + "Personalizar barra": preservados, portados para a nova página.

## Arquivos afetados

- Novo: `src/pages/Mais.tsx` — página full-screen contextual (lê `useActiveModule` + `MODULE_NAV`).
- Novo: `src/components/mobile/MoreGroupSection.tsx` — chip colorido + featured + grid 2-col.
- Novo: `src/components/mobile/MoreHeader.tsx` — cabeçalho contextual (empresa/módulo + sino).
- Atualiza: `src/config/mobileNav.tsx` — campos opcionais `accent` e `featured`.
- Atualiza: `src/components/mobile/MobileBottomNav.tsx` — slot `more` vira `NavLink to="/mais"` (fim do `Sheet`); estado ativo por rota.
- Atualiza: `src/App.tsx` — registra `/mais` **dentro do `AppLayout`** para manter a `MobileBottomNav` visível.
- `src/components/mobile/MobileMoreSheet.tsx` deixa de ser usado pela BottomNav; removido ao final da fase.

## Notas técnicas

- Página é apenas mobile: em `md+` redireciono para `/hub` (a barra já é `md:hidden`).
- Cabeçalho lê `useCompanyContext` para nome da empresa ativa (fallback: nome do módulo).
- Sem alterações de backend, RLS ou lógica financeira.

## Fora de escopo

- Não altero labels/conteúdo dos menus, só apresentação.
- Não mexo em desktop (sidebar continua idêntico).

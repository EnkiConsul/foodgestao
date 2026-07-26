## Ajustes na página /mais (mobile)

Aplicar 4 correções pontuais focadas no cabeçalho, na busca e na fonte dos favoritos.

### 1. Remover cabeçalho de grupo redundante do módulo (Anexo 1)

Hoje, o primeiro `MoreGroupSection` renderiza um botão com o rótulo do módulo (ex.: "DP 360°") e um chevron que colapsa todo o módulo. Como o nome do módulo já aparecerá fixo no header, esse cabeçalho é redundante e o colapso "de tudo" não deve existir.

- Em `src/components/mobile/MoreGroupSection.tsx`: introduzir uma prop `hideHeader?: boolean`. Quando `true`, não renderiza o botão de cabeçalho (nem o título nem o chevron do grupo), apenas os `items` e `subgroups` diretamente. Os subgrupos internos (Cadastro, Folgas, Documentos, Comunicação, etc.) continuam com seus próprios chevrons de ocultar/exibir — nada muda ali.
- Em `src/pages/Mais.tsx`: ao renderizar `config.moreGroups`, passar `hideHeader` para grupos "raiz" do módulo (aqueles cujo `label` seja igual ao nome do módulo, ex.: "DP 360°", "Financeiro"). Grupos secundários mantêm o cabeçalho normal.

### 2. Header fixo com nome do módulo + busca compacta (Anexo 2)

O `MoreHeader` já é `sticky top-0`, mas mora abaixo da topbar global (empresa + sino) e mostra o subtítulo "Menu completo". Vamos:

- `src/components/mobile/MoreHeader.tsx`: remover o subtítulo "Menu completo"; deixar apenas o nome do módulo em uma linha. Adicionar um slot direito na mesma linha para a busca.
- Transformar a busca em um ícone `Search` (lupa) posicionado no canto direito do header, na mesma linha do título do módulo. Ao tocar, expande inline para um `Input` com placeholder curto **"Buscar"** e um `X` para fechar. Sem texto "Buscar Funcionalidade".
- Mover o estado `query`/`setQuery` para `MoreHeader` (ou elevar via prop) e continuar entregando o valor à `Mais.tsx` para filtrar `searchResults`. A caixa de busca separada abaixo do cartão "Hub" é removida.
- Remover também o cartão destaque "Acompanhar módulos / Alternar entre Financeiro, DP e outros" que servia de atalho ao Hub — o botão Hub já existe fixo na `BottomNav`, portanto é redundante conforme o pedido.

### 3. Favoritos sincronizados com o desktop

Hoje `useFavoriteNavItems` (mobile) usa `localStorage` isolado. O desktop (DP) persiste favoritos por empresa em `dp_user_prefs.extras.favoritos_paginas` via `useDpUserPrefs`. Vamos unificar:

- `src/hooks/useFavoriteNavItems.ts`: substituir a origem `localStorage` por leitura/escrita de `useDpUserPrefs().favoritePages` / `toggleFavoritePage`. Manter a mesma API pública (`favorites`, `isFavorite`, `toggle`, `max`) para não impactar consumidores.
- Manter o limite `MAX = 6` no toggle (retornando `"limit"` quando atingido) — o desktop hoje não impõe teto, mas o mobile continua respeitando o slot da grade.
- Fallback: quando `useDpUserPrefs` não estiver disponível (usuário sem empresa selecionada ou fora do módulo DP), voltar para o `localStorage` atual como cache local, para não quebrar a página `/mais` em outros módulos.

### 4. Layout final do topo

```text
┌──────────────────────────────────────────┐
│ topbar global (empresa · sino)           │  ← já existe
├──────────────────────────────────────────┤
│ DP 360°                            🔍    │  ← MoreHeader (sticky)
├──────────────────────────────────────────┤
│ Favoritos                                │
│ [ícones …]                               │
│ Cadastro                          ⌄      │
│ Folgas                            ⌄      │
│ …                                        │
└──────────────────────────────────────────┘
```

### Arquivos alterados

- `src/components/mobile/MoreHeader.tsx` — remove subtítulo, adiciona lupa/busca inline; recebe props `query`/`onQueryChange`.
- `src/components/mobile/MoreGroupSection.tsx` — nova prop `hideHeader`.
- `src/pages/Mais.tsx` — remove cartão Hub e caixa de busca externa; passa `query` ao header; aplica `hideHeader` no grupo raiz do módulo.
- `src/hooks/useFavoriteNavItems.ts` — passa a persistir via `useDpUserPrefs` (com fallback para `localStorage`).

Nenhuma alteração em `BottomNav`, rotas, config `MODULE_NAV` ou em desktop.

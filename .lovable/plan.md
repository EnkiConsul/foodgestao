## Diagnóstico

A estrela **não aparece** porque ela **nunca foi implementada** neste projeto. O que existe hoje é apenas uma seção "Atalhos Favoritos" (`src/components/dp/home/AtalhosFavoritos.tsx`) que:

- Recebe uma **lista fixa** de atalhos via prop `items` diretamente do `DpHome` e `DpMeuHome`.
- Permite reordenar via drag-and-drop e persiste apenas a **ordem** em `dp_user_prefs.favoritos` (array de labels).
- **Não permite** o usuário adicionar/remover páginas — a lista é hardcoded no código.

Na referência (`portalcolaborador`), o padrão é o inverso: **cada página** tem um ícone de estrela no header que alterna se aquela rota está favoritada, e o grid do home é montado dinamicamente a partir desses favoritos escolhidos pelo usuário. A auditoria (item R5 / #29 do plano de correção) marcou isso como "parcial" porque implementamos só o grid, sem o botão de favoritar.

## O que fazer

Implementar o **botão-estrela por página** e conectar ao grid dinâmico existente.

### 1. Novo componente `FavoriteToggle`
Arquivo: `src/components/dp/FavoriteToggle.tsx`
- Botão-ícone com `Star` / `StarOff` (`lucide-react`).
- Props: `route` (path), `label` (nome curto), `icon` (LucideIcon opcional).
- Ao clicar, lê `dp_user_prefs.extras.favoritos_paginas` (novo campo, ver §4) e faz toggle.
- Tooltip: "Favoritar página" / "Remover dos favoritos".
- Feedback via `sonner` toast.

### 2. Registro central de páginas favoritáveis
Arquivo novo: `src/components/dp/favoritablePages.ts`
- Mapa `{ route → { label, icon } }` com todas as rotas DP relevantes (Colaboradores, Folgas, Trocas, Solicitações, Aprovações, Avisos, Mensagens, Disciplinar, Documentos, Folha, Cadastros e as rotas do portal). Isso garante que o grid saiba renderizar cada favorito escolhido.
- O `FavoriteToggle` usa esse mapa para pegar `label`/`icon` a partir da rota atual (`useLocation`).

### 3. Injetar `FavoriteToggle` no header
- Editar `src/components/dp/DpHeader.tsx` para incluir o `FavoriteToggle` antes do `DpNotificacoesBell`, visível apenas quando a rota atual está no mapa do §2.
- Assim aparece automaticamente em toda página DP (admin e portal).

### 4. Persistência
- Estender o hook `src/hooks/useDpUserPrefs.tsx`: adicionar helpers `toggleFavoritePage(route)` e `isFavoritePage(route)`.
- Armazenar as **rotas favoritadas pelo usuário** em `prefs.extras.favoritos_paginas: string[]` (o campo `extras: jsonb` já existe na tabela `dp_user_prefs` — sem migration necessária).
- Manter o campo `prefs.favoritos` (array de labels) apenas como cache de ordenação do grid.

### 5. Tornar `AtalhosFavoritos` dinâmico
Arquivo: `src/components/dp/home/AtalhosFavoritos.tsx`
- Deixar a prop `items` opcional; quando ausente, montar a partir de `prefs.extras.favoritos_paginas` cruzando com o registro do §2.
- Continuar suportando drag-and-drop e persistindo a ordem em `prefs.favoritos`.
- Estado vazio: mensagem "Clique na ⭐ do topo de qualquer página para adicioná-la aqui".

### 6. Simplificar as chamadas em `DpHome` e `DpMeuHome`
- Remover a prop `items` hardcoded — deixar o componente resolver sozinho a partir das preferências do usuário.

## Detalhes técnicos

```text
DpHeader ──► FavoriteToggle(route atual)
                │ (grava em)
                ▼
        dp_user_prefs.extras.favoritos_paginas: string[]
                │ (lê)
                ▼
        AtalhosFavoritos ──► resolve via favoritablePages.ts ──► grid
```

- Sem migrations (usa `extras jsonb` existente).
- Sem quebra visual do grid — quando não há favoritos, mostra o empty state; a lista fixa hoje passada por `DpMeuHome` desaparece (era só placeholder).
- `FavoriteToggle` fica oculto em rotas fora do registro (ex.: `/dp` raiz), evitando poluir a home com "favoritar a própria home".

## Fora de escopo
- Nenhuma alteração de banco (a coluna `extras jsonb` já cobre).
- Nenhuma mudança em outros módulos (Financeiro, Admin) — feature restrita ao DP.
- Não mexer no `AtestadosPendentesPopout` nem em outros componentes do home.

## Ajustes na página `/mais` (mobile)

### 1. Remover "Início" dos grupos
- `src/config/mobileNav.tsx`: tirar o item `Home → /dp` do grupo "DP 360°", `Dashboard → /dashboard` do grupo "Financeiro 360°" e `Início → /dp/meu` do grupo "Portal". O botão central da BottomNav já cobre isso.

### 2. Estado default dos grupos
- `src/components/mobile/MoreGroupSection.tsx`: tornar o cabeçalho do grupo (chip + título) clicável para abrir/fechar toda a seção.
- Grupos de módulo (accent `primary`, `navy`, `amber`) começam **abertos**.
- Grupo "Conta" (accent `muted`) começa **fechado**; expande ao tocar no cabeçalho ou na seta.
- Chevron ao lado do título indica o estado.

### 3. Subgrupos sempre abertos, sem chevron
- Remover a lógica de colapsar em `SubgroupBlock`. O cabeçalho do subgrupo (ex.: Cadastro, Folgas, Documentos, Comunicação) passa a ser apenas um rótulo, sem botão de expandir e sem contador.
- `MoreSubGroup.kind` deixa de controlar collapse; `matchPrefixes` fica só para destaque visual do item ativo.

### 4. Layout iFood dos itens
- Substituir a lista `<ul>/divide-y` dentro do subgrupo por um grid horizontal de "tiles" no estilo iFood Gestor: ícone circular acima, rótulo em duas linhas abaixo, `grid-cols-4` no mobile (`grid-cols-3` quando o rótulo for longo).
- Cada tile mantém long-press para favoritar, sem `ChevronRight`.
- O link "Ver visão geral de {seção}" vira um chip discreto no topo do subgrupo (opcional, mantido só quando `hubTo` existir).

### 5. Itens diretos do grupo (sem subgrupo)
- Os `items` no nível do grupo (ex.: Cadastros do Financeiro, Visão geral/Cobrança/Tenants do Admin, Conta) passam a usar o mesmo grid iFood de tiles, substituindo o `TileCard` de altura fixa por um bloco compacto ícone-em-cima / label-embaixo.

### 6. Sem impacto fora da página `/mais`
- BottomNav, `useModuleShortcut`, favoritos e busca continuam funcionando (a busca já achata `items + subgroups.items`).

### Detalhes técnicos
- `MoreGroupSection`: novo `useState(open)` inicializado a partir de um prop `defaultOpen` derivado de `accent !== "muted"`.
- Novo componente interno `IFoodTile` reutilizado por `items` diretos e por `subgroup.items`.
- Nenhum item featured/full-width permanece na página; se algum `featured: true` restar, é tratado como tile normal.
- Sem alterações em rotas, hooks de dados ou lógica de negócio.

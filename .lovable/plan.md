## Ajustes na página `/mais` (mobile)

### 1. Header (`MoreHeader.tsx`)
- Remover o sino duplicado. Manter apenas rótulo do módulo + nome da empresa fixos no topo.

### 2. Grupos de nível 1 (`MoreGroupSection.tsx`)
- Remover o chip "primeira letra" quando ele repete o nome do módulo. Cabeçalho fica: título + chevron de colapsar/expandir à direita.
- Cabeçalho togglável (Conta fechada por padrão; demais abertas).
- Clique no título/linha: se o grupo tiver `hubTo`, navega; senão alterna colapso. Chevron sempre alterna colapso (stopPropagation).

### 3. Subgrupos (`SubgroupBlock`)
- Remover o link "Ver tudo".
- Adicionar chevron de ocultar/reexibir os itens do subgrupo (default aberto), com `aria-expanded`.
- Cabeçalho do subgrupo (ícone + nome) clicável: navega para `subgroup.hubTo` (ex.: "Cadastro" → `/dp/cadastros`; "Folgas" → `/dp/folgas`; "Documentos" → `/dp/documentos`; "Comunicação" → `/dp/comunicacao`). Chevron alterna colapso via botão separado com stopPropagation.

### 4. Grid de tiles (`TileGrid`) — anti-sobreposição + balanceamento
- Corrigir sobreposição de rótulos (ex.: "Contracheques" colando em "Adiantamentos"):
  - Adicionar `gap-x-3 gap-y-4`, `px-2` no tile e `break-words hyphens-auto` no rótulo; garantir `min-w-0` e `w-full` no botão para permitir quebra.
  - `line-clamp-2` já existe, mas está estourando por falta de espaçamento horizontal — o gap maior e padding lateral resolvem.
- Distribuição balanceada por quantidade:
  - `n <= 3` → `grid-cols-3`
  - `n === 4` → `grid-cols-4`
  - `n === 5` ou `n === 6` → `grid-cols-3` (5 vira 3+2 centralizado; 6 vira 3+3)
  - `n >= 7` → `grid-cols-4`
  - Para linha incompleta com 2 itens em grid de 3, centralizar via `justify-items-center` no container ou wrapper que centraliza a última linha.

### 5. Título "Personalizar Barra"
- Corrigir capitalização no botão em `Mais.tsx` (linha ~159): `"Personalizar barra"` → `"Personalizar Barra"` (Title Case sem preposição — regra do projeto).

### 6. Rodapé com usuário (paridade com sidebar desktop)
- Adicionar bloco de identidade do usuário abaixo dos botões "Personalizar Barra" e "Sair", replicando o footer do sidebar desktop.
- Mostrar: avatar/iniciais, `full_name` (ou email), e o rótulo de acesso (ex.: "Administrador", "Colaborador", "Super Admin") baseado no perfil ativo.
- Reutilizar dados de `useAuth` + hook de roles existente (o mesmo consumido pelo sidebar desktop — localizar componente atual e reaproveitar a lógica de label).

### 7. Config (`src/config/mobileNav.tsx`)
- Garantir `hubTo` em cada `MoreSubGroup` (DP: Cadastro, Folgas, Documentos, Comunicação; Financeiro conforme sidebar).
- `hubTo` opcional em `MoreGroup` quando fizer sentido.

### Arquivos afetados
- `src/components/mobile/MoreHeader.tsx`
- `src/components/mobile/MoreGroupSection.tsx`
- `src/pages/Mais.tsx`
- `src/config/mobileNav.tsx`

Sem alterações em rotas, dados, favoritos ou busca. Long-press para favoritar permanece nos tiles.

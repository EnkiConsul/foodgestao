## Objetivo

Melhorar a legibilidade, a hierarquia e a navegação da página **Categorias** (módulo financeiro) no notebook e no celular, mantendo 100% das funcionalidades atuais (criar, editar, excluir, filhos, arrastar para ordenar, seleção em lote, visibilidade, importar plano padrão).

## Diagnóstico atual

Observado em `src/pages/Categorias.tsx` e `src/components/categorias/CategoryRow.tsx`:

1. **Sem contexto de topo** — o título "Categorias" aparece sozinho, sem subtítulo nem contadores (quantas receitas/despesas, quantos grupos). O usuário não sabe o tamanho do plano de contas que está vendo.
2. **Toolbar plana** — 6 controles (Adicionar, Importar plano, Colapsar, Tabs de tipo, Busca, Filtrar) na mesma linha, com pesos visuais iguais. A ação principal (Adicionar) não se destaca, e o botão **Filtrar** não tem comportamento associado (botão morto).
3. **Hierarquia fraca no desktop** — indentação de 16px por nível, sem guias visuais; pais e filhos competem. O nível 0 em CAIXA ALTA ajuda, mas não há separação de blocos Receitas/Despesas.
4. **Mobile perde informação** — as colunas Tipo e Visibilidade ficam `hidden md:table-cell`, então no celular só sobram nome + 3 ícones pequenos (28px) em uma tabela horizontal apertada; drag handle some e não há alternativa de reordenação visível.
5. **Estado vazio único** — só existe empty state quando não há nenhuma categoria; ao filtrar/buscar sem resultado, aparece uma linha de texto sem ação para limpar filtros.
6. **Seleção em lote** — a barra aparece empurrando o conteúdo; no mobile pode ficar fora de vista ao rolar.
7. **Acessibilidade** — botões de ícone sem `aria-label`, checkbox do cabeçalho sem rótulo, colspan do estado vazio com 5 em uma tabela de 6 colunas.

## O que será feito

### 1. Cabeçalho com contexto
- Título + subtítulo curto ("Organize seu plano de contas por grupos e subcategorias").
- Linha de resumo discreta: total de categorias, nº de receitas e nº de despesas (calculada no cliente com os dados já carregados).

### 2. Toolbar reorganizada
- **Ação primária** "Nova categoria" com botão `default` (destaque), demais em `ghost`/`outline`.
- Agrupar ações secundárias (Importar plano 360°FOOD, Expandir/Colapsar) em um menu "..." no mobile e mantê-las visíveis no desktop.
- Busca ganha largura total no mobile (linha própria) e botão de limpar (x).
- Remover o botão **Filtrar** sem função ou transformá-lo em um popover que apenas reúne os filtros já existentes (tipo + busca). Recomendo remover para não criar funcionalidade nova.
- Tabs Receitas/Despesas com contador ao lado do rótulo.

### 3. Hierarquia visual da lista (desktop)
- Guias verticais sutis de indentação (border-left em cada nível) usando tokens semânticos.
- Linhas de nível 0 com fundo levemente destacado (`bg-muted/30`) para funcionar como cabeçalho de grupo.
- Aumentar levemente o alvo de clique do chevron e tornar a linha inteira clicável para expandir/colapsar quando tem filhos.
- Zebra/hover consistente e `sticky` no cabeçalho da tabela ao rolar.

### 4. Mobile: lista em cards em vez de tabela
- Abaixo de `md`, renderizar a mesma árvore como uma lista de cards/linhas compactas com: bolinha de cor, nome (indentado por nível), badge de tipo, badges de visibilidade e um menu de ações (⋯) com Adicionar filho / Editar / Excluir — mesmas ações, alvos de toque ≥ 40px.
- Chevron de expandir/colapsar visível e com área de toque adequada.
- Barra de seleção em lote fixa na parte inferior (acima da BottomNav) quando houver seleção.
- FAB atual mantido.

### 5. Estados vazios e feedback
- Estado vazio de busca/filtro com mensagem específica e botão "Limpar filtros".
- Skeleton de carregamento enquanto a query roda (hoje a tabela aparece vazia).

### 6. Acessibilidade
- `aria-label` em todos os botões de ícone e no checkbox "selecionar tudo".
- Corrigir `colSpan` do estado vazio.
- Foco visível preservado nos controles.

## Detalhes técnicos

- Arquivos afetados: `src/pages/Categorias.tsx` (header, toolbar, estados, render condicional desktop/mobile), `src/components/categorias/CategoryRow.tsx` (guias de indentação, aria-labels, linha clicável), novo `src/components/categorias/CategoryMobileRow.tsx`, `src/components/categorias/BatchActionBar.tsx` (posicionamento fixo no mobile), `src/lib/categories/display.ts` (helper para guias/indentação).
- Nenhuma mudança em queries, RPCs, RLS, schema ou lógica de negócio; drag-and-drop permanece no desktop (comportamento atual, que já esconde o handle no mobile).
- Apenas tokens semânticos de cor (sem `text-white`/`bg-[#...]`).
- Os testes existentes de `display.ts` e `CategoryTypeBadge` continuam válidos; adiciono testes para o helper de guias, se ele for criado.

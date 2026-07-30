## Objetivo

Na Conciliação Open Finance, o seletor de categoria deve mostrar exatamente as mesmas categorias que aparecem em **Categorias** para a empresa ativa — mesma filtragem, mesma ordem e mesma apresentação visual (indentação + badge de tipo). Sem alterar dados cadastrados.

## Causa confirmada

- A Conciliação busca as categorias sem o filtro de contexto que a página Categorias usa (`context is null or context = 'pj'`). Por isso entra a raiz **RECEITAS** do perfil Pessoal vinculada à empresa, aparecendo duplicada ao lado da RECEITAS empresarial.
- As categorias **Comissão - RedFox** e **Comissão - SuitPay** estão vinculadas à empresa, mas a raiz "RECEITAS" delas não está. A Conciliação as promove a raiz (aparecem "soltas"), enquanto a página Categorias as omite por falta do pai — daí a sensação de "categorias que não estão cadastradas".

## Mudanças

Somente em `src/pages/ConciliacaoPluggy.tsx` (frontend/apresentação):

1. **Mesma consulta da página Categorias**: manter `category_companies!inner(company_id)` + `is_active`, e adicionar o filtro de contexto (`context.is.null,context.eq.pj`) e a mesma ordenação (`parent_id` com nulos primeiro, depois `sort_order`, depois `name`).
2. **Mesma montagem de árvore**: substituir a função local `buildCategoryOptions` pelo helper compartilhado `buildCategoryTree` (`src/lib/categories/tree.ts`), já usado em Categorias. Com isso, itens cujo pai não está vinculado não são promovidos a raiz — a lista fica idêntica à de Categorias.
3. **Mesmo visual dos itens**: manter o ponto de cor, o recuo por nível (`CATEGORY_INDENT_STEP` / `categoryGuideLevels`) e o `CategoryTypeBadge`, agora derivando `depth` do helper compartilhado, para o dropdown espelhar a hierarquia da tela de Categorias.
4. **Filtro por tipo** (receita para entradas, despesa para saídas) aplicado sobre a árvore já montada, preservando pais quando um filho relevante existir, para não quebrar a hierarquia exibida.

## Efeito para você

- A raiz "RECEITAS" duplicada (do perfil Pessoal) deixa de aparecer na Conciliação.
- "Comissão - RedFox/SuitPay" deixam de aparecer soltas — ficam consistentes com Categorias. Se você quiser vê-las nas duas telas, basta vincular a categoria-pai delas à empresa em **Categorias** (ou reapontá-las para a RECEITAS visível); posso fazer isso num passo separado se quiser.
- Nenhuma categoria é criada, apagada ou renomeada; nenhum lançamento já conciliado é afetado.

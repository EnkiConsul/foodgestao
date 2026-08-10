# Cardápio online: mostrar os produtos do cardápio

## O que os dados mostram hoje

- A loja publicada `figlia-pizzaria` está ligada à empresa "Figlia Pizzaria" e essa empresa tem **1 cardápio ("Figlia Pizzaria") com 0 categorias e 0 produtos**.
- O único produto existente na base ("X-Burger Clássico", categoria "Hambúrgueres") pertence a **outra empresa**, no cardápio "Cardápio Principal".

Ou seja, a página pública já sabe ler produtos (a função pública já devolve categorias, produtos, variações e adicionais), mas hoje ela não tem nada para mostrar: o cadastro de produtos foi feito em outra empresa e o cardápio da loja publicada está vazio. Além disso, o cardápio online não tem hoje nenhuma etapa que mostre o catálogo, nem aviso de "cardápio sem itens", então parece que "não puxa" os produtos.

## O que vou fazer

1. **Etapa de itens no onboarding do cardápio online**
   - Na etapa "Cardápio online", adicionar um bloco "Itens do cardápio" que lista as categorias e produtos que serão exibidos na página pública (nome, preço, disponível/pausado, imagem).
   - Quando estiver vazio: mensagem clara ("Nenhum item no cardápio desta empresa") + botão que leva direto para o cadastro do cardápio (/pedidos/cardapio).
   - Bloqueio suave: avisar antes de publicar que a loja ficará sem itens.

2. **Seleção correta do cardápio na loja pública**
   - Ajustar a função pública para preferir um cardápio ativo **que tenha produtos** (mantendo a prioridade atual: cardápio da unidade > padrão > ordem), evitando que um cardápio vazio "ganhe" de um cardápio com itens na mesma empresa.
   - Categorias sem nenhum produto disponível deixam de aparecer na página pública.

3. **Estado vazio e disponibilidade na página pública**
   - Na página `/c/:slug`, exibir estado vazio elegante quando não houver itens, em vez de apenas o cabeçalho da loja.
   - Garantir que produtos pausados/indisponíveis apareçam marcados como indisponíveis, sem permitir adicionar ao carrinho.

4. **Aviso de escopo de empresa**
   - Na etapa do cardápio online, mostrar de qual empresa/unidade o catálogo vem, para deixar claro que produtos cadastrados em outra empresa não aparecem naquela loja.

## Detalhes técnicos

- Frontend: `src/components/orders/onboarding/StepCardapioOnline.tsx` (bloco de itens, estado vazio, aviso de escopo), `src/pages/storefront/LojaOnline.tsx` (estado vazio, indisponíveis), reuso de `useOrdersCatalog.tsx` para a prévia interna.
- Backend: migração que substitui `storefront_public_get` para escolher o menu com produtos e filtrar categorias vazias; nenhuma mudança de schema, apenas a função (SECURITY DEFINER, grants para `anon`/`authenticated` mantidos).
- Testes: casos em `src/test/unit/storefront.test.ts` para catálogo vazio e produto indisponível.

Observação: para os itens aparecerem em `figlia-pizzaria` também será necessário cadastrar categorias/produtos nessa empresa em /pedidos/cardapio — as mudanças acima tornam isso visível e guiado, mas não criam produtos automaticamente.

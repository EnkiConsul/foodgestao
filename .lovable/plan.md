# Digitação lenta no cadastro de contato (Conciliação)

## O que está acontecendo

O formulário de cadastro/edição de fornecedor-cliente é aberto de dentro da tela de Conciliação, que hoje renderiza **todas as linhas do extrato de uma vez** (cards no mobile e tabela no desktop), sem memoização. Dois pontos verificados no código explicam o custo por tecla:

1. `src/pages/ConciliacaoPluggy.tsx` monta cada linha inline e chama `renderCategoryItems(...)` **por linha**, recriando toda a árvore de itens de categoria (duas vezes: receita e despesa) em cada render da página. Nada é `React.memo`.
2. `src/components/contacts/ContactFormDialog.tsx` faz a checagem de duplicidade buscando **até 2000 contatos** (`select(...).limit(2000)`) a cada pausa de 350 ms na digitação do CPF/CNPJ, e refaz a mesma busca no submit.

Observação: o diálogo simples da imagem (só campo "Nome") não existe mais no código — hoje abre o formulário oficial. A tela pode estar em cache; a otimização abaixo vale para o formulário atual.

## Correções propostas

### 1. Tornar a digitação independente da lista (principal)
- Extrair o corpo do formulário de contato para dentro de um componente memoizado e garantir que nenhuma tecla dispare render da página de conciliação.
- Envolver `StagingCard` (mobile) e a linha da tabela desktop em `React.memo`, com callbacks estáveis (`useCallback`) e valores por linha lidos de mapas já memoizados.
- Calcular `renderCategoryItems` uma única vez (dois `useMemo`: receita e despesa) e reutilizar em todas as linhas, em vez de por linha.

### 2. Checagem de duplicidade sem baixar 2000 contatos
- Trocar a busca ampla por consulta direcionada pelo documento normalizado (filtro no servidor), mantendo o debounce e a normalização atual de `src/lib/documento.ts`.
- Manter a verificação final no submit, agora também direcionada.

### 3. Render da lista longa
- Aplicar renderização condicional/paginada (ou virtualização leve) quando o extrato tiver muitas linhas pendentes, para reduzir o custo de qualquer atualização de estado da página.

## Detalhes técnicos

- Arquivos: `src/pages/ConciliacaoPluggy.tsx`, `src/components/conciliacao/StagingCard.tsx`, `src/components/contacts/ContactFormDialog.tsx`.
- Sem mudanças de schema; a consulta de duplicidade passa a usar filtro por documento no banco (comparando também a versão sem máscara).
- Nenhuma alteração nas regras de conciliação, vínculos ou validações existentes.

## Validação

- Medir latência de digitação no formulário com o extrato carregado (antes/depois).
- Conferir que aviso de duplicidade, bloqueio no submit, vínculo do contato à linha e edição de contato continuam funcionando.

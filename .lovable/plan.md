## Objetivo

Na Conciliação Open Finance, o seletor de categoria hoje mostra **só** categorias de entrada quando o valor é positivo e **só** categorias de saída quando é negativo. Isso impede casos legítimos: estorno/devolução (valor positivo lançado em categoria de saída) e crédito estornado (valor negativo em categoria de entrada).

## O que muda

Somente na página `/contas-bancarias/conciliacao` (`src/pages/ConciliacaoPluggy.tsx`), camada de apresentação:

1. O seletor passa a listar **todas** as categorias da empresa, agrupadas em duas seções:
   - **Sugeridas** — o tipo compatível com o sinal do valor (entrada para positivo, saída para negativo), já no topo.
   - **Outras categorias** — o tipo oposto, disponível para estornos.
2. A hierarquia continua exatamente igual à página `/categorias` (mesma árvore, indentação de 16px, badge de tipo, cor).
3. Categorias **bloqueadas** (`is_active = false`) continuam visíveis como estrutura, mas não selecionáveis, com o selo "Bloqueada" — sem mudança nessa regra.
4. Quando o usuário escolhe uma categoria do tipo oposto ao sinal do valor, aparece um aviso discreto na linha (texto/ícone "estorno") para deixar claro que é um caso invertido — sem bloquear a confirmação.

Nada muda no comportamento de confirmação: o tipo do lançamento (`entrada`/`saida`) continua sendo derivado do sinal do valor pela RPC de confirmação, e a categoria escolhida é apenas gravada em `category_id`.

## Detalhes técnicos

- `buildCategoryOptions(cats, type)` passa a ter uma variante que retorna a árvore completa mais um marcador de "sugerido" por nó, em vez de duas listas mutuamente exclusivas; as duas seções são renderizadas com `SelectGroup`/`SelectLabel`.
- Sem migração de banco, sem alteração em RPCs, triggers ou nas regras de saldo.

## Fora de escopo

- Regras de validação de sinal versus categoria no banco.
- Página de Lançamentos (formulário manual) — permanece como está, salvo pedido explícito.

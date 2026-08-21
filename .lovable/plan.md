# Benefícios: mostrar o que está cadastrado no colaborador e ajustar o mobile

## O que está acontecendo

A tela de Benefícios lê apenas o catálogo próprio da tela (benefícios criados em "Catálogo" e atribuições feitas em "Atribuir benefício"). Na base da Pakerê essas duas listas estão vazias — nenhum benefício de catálogo e nenhuma atribuição.

Ao mesmo tempo, o Vale-Alimentação configurado dentro da ficha do colaborador (aba Remuneração/Benefícios) fica gravado direto no cadastro do colaborador: 12 colaboradores ativos têm VA com valor definido. Como são dois lugares diferentes, a tela de Benefícios mostra zero e "Nenhum benefício atribuído".

## Correção proposta

1. **Unificar as duas fontes na visão "Por colaborador"**: a lista passa a mostrar, junto com as atribuições do catálogo, os benefícios vindos do cadastro do colaborador (VA e VT), marcados com um selo "Do cadastro" e um atalho para abrir a ficha do colaborador no ponto certo.
2. **KPIs corretos**: "Benefícios ativos", "Colaboradores atendidos", "Custo bruto mensal" e "Custo líquido" passam a somar VA/VT do cadastro + atribuições do catálogo (VA mensal = valor por dia × dias-base do colaborador; VT = valor por dia × dias-base; desconto do VA/VT abatido no custo líquido).
3. **Filtro por colaborador** continua funcionando para as duas origens.
4. **Estado vazio mais útil**: quando não houver nada, explicar que benefícios podem vir da ficha do colaborador ou do catálogo, com os dois atalhos.
5. **Ajustes de mobile** seguindo o padrão já usado no módulo:
   - KPIs com o componente padrão de cartão de indicador (valores grandes não quebram o texto e o rótulo não estoura o cartão);
   - abas com a barra rolável padrão (hoje "Calculadora de VT" fica cortada na borda);
   - filtros e o bloco "Gerar na folha" empilhados no celular, com o botão "Gerar" em largura total;
   - botão de ação principal em largura total no celular e acima da lista;
   - itens da lista em duas linhas com ações (editar/excluir) alinhadas sem espremer o nome;
   - respiro inferior para não ficar sob a barra de navegação do celular.

## Detalhes técnicos

- `src/hooks/useDpBeneficios.tsx`: nova query que lê de `dp_colaboradores` (ativos, `deleted_at is null`) os campos de VA (`vale_alimentacao`, `vale_alimentacao_valor`, `vale_alimentacao_dias_base`, `vale_alimentacao_desconto_tipo/valor`, `vale_alimentacao_dia_pagamento`) e VT (`vale_transporte`, `vale_transporte_valor_dia`, `vale_transporte_dia_pagamento`, descontos), normalizando em uma lista `beneficiosDoCadastro` com o mesmo formato de exibição das atribuições (`origem: "cadastro" | "catalogo"`). Reaproveitar os helpers de `src/lib/dp/va-calculo.ts` para valor mensal e dias-base.
- `src/pages/dp/DpBeneficios.tsx`: mesclar as duas listas em um único array ordenado por nome do colaborador; KPIs recalculados sobre a lista mesclada; itens de origem "cadastro" abrem a ficha do colaborador em vez do diálogo de atribuição (sem botão de excluir).
- Responsivo: usar `DpStatCard`, `DpTabsBar` e `DpFilters` (já existentes em `src/components/dp/`) na página, mantendo `DpPage`/`DpContentCard`.
- Sem mudanças de banco.

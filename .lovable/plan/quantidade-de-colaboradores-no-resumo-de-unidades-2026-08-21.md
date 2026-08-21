# Quantidade de colaboradores no resumo de Unidades

Exibir, no cadastro de unidades, a quantidade de colaboradores vinculados a cada unidade. A contagem deve aparecer no mesmo padrão já usado para cargos e sindicatos patronais.

## O que muda

1. **Hook `useDpCadastros.tsx`**
   - Adicionar `colaboradores_count` ao tipo `DpUnidadeWithCounts`.
   - Na query `useDpUnidades`, buscar os colaboradores da empresa (`dp_colaboradores`) agrupados por `unidade_id` e incluir a contagem no retorno.

2. **Tela `src/pages/dp/DpUnidades.tsx`**
   - **Tabela desktop**: nova coluna "Colaboradores" com badge `<Users /> {count}` entre Cargos e Sindicatos Patronais (ou ao lado, conforme ajuste de larguras `table-fixed`).
   - **Cards mobile**: incluir badge `<Users /> {count} colab.` junto aos badges de cargos e sindicatos.
   - **Ficha de visualização**: adicionar linha "Colaboradores vinculados" com o total.

## Detalhes técnicos

- A contagem respeita a empresa (`company_id`) e o vínculo `unidade_id` de `dp_colaboradores`, considerando apenas registros com `unidade_id` não nulo.
- Se a unidade tiver 0 colaboradores, o badge mostra "0" normalmente (sem estado especial).
- O `colSpan` da linha vazia e de carregamento deve ser atualizado para refletir a nova coluna.
- Ajustar as larguras das colunas `table-fixed` para acomodar a nova coluna sem quebrar o layout no desktop.

# Seleção múltipla para excluir contas contábeis

Hoje a tela de Contas Contábeis só permite excluir uma conta por vez (ícone de lixeira em cada linha). Não existe nenhum controle de seleção na página.

## O que será feito

1. **Caixas de seleção na árvore**
   - Cada linha da árvore ganha um checkbox à esquerda.
   - Marcar uma conta sintética (com filhas) marca também as filhas em cascata; desmarcar limpa a cascata.
   - Checkbox "Selecionar todas" no cabeçalho da lista, com estado indeterminado quando a seleção é parcial.

2. **Barra de ações da seleção**
   - Quando há itens marcados, aparece uma barra acima da lista: "N conta(s) selecionada(s)", botão "Excluir selecionadas" e "Limpar seleção".
   - Os botões de linha (adicionar filha, editar, excluir individual) continuam funcionando como hoje.

3. **Exclusão em lote com regras claras**
   - Confirmação em diálogo listando quantas contas serão excluídas.
   - Exclusão em ordem das folhas para as raízes, para respeitar a hierarquia.
   - Uma conta com filhas que **não** estejam na seleção é bloqueada e reportada (mesma regra atual).
   - Contas que não puderem ser excluídas por estarem em uso (vínculo com lançamentos/categorias) são reportadas individualmente.
   - Resultado final em um único aviso: "X excluída(s), Y não excluída(s)" com o motivo de cada bloqueio.

4. **Mobile**
   - Checkbox com área de toque adequada e barra de ações fixa na parte inferior quando há seleção.

## Detalhes técnicos

- Alterações concentradas em `src/pages/ContasContabeis.tsx`.
- Novo estado `selected: Set<string>`; helpers para coletar descendentes a partir da árvore já construída por `buildTree`.
- Exclusão via `supabase.from("chart_accounts").delete().in("id", lote)` por nível de profundidade (mais profundo primeiro), acumulando erros por lote e refazendo item a item quando um lote falha, para identificar a conta culpada.
- Ao final, `queryClient.invalidateQueries({ queryKey: ["chart-accounts"] })` e limpeza da seleção.
- Reuso do `Checkbox` do shadcn e do `AlertDialog` já presente no arquivo.

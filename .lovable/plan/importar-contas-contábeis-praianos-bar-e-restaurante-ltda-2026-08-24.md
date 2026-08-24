# Importar Contas Contábeis — PRAIANOS BAR E RESTAURANTE LTDA

Sim, dá para importar por aqui. A planilha tem 145 contas (coluna Numeração define a hierarquia, todas com situação ATIVO) e será importada exatamente como está, incluindo as contas de telecom.

## Situação atual verificada

- A empresa PRAIANOS já tem 209 contas contábeis vinculadas, porém criadas sob o usuário antigo proprietário. Como a tela filtra pelo dono do registro, elas não aparecem para cianovagestao@outlook.com.
- As 186 categorias já importadas estão todas sem conta contábil vinculada, então remover as contas antigas não desfaz nenhum vínculo de categoria.
- Nenhuma outra tabela referencia contas contábeis por chave estrangeira.

## O que será feito

1. **Limpeza**: remover as 209 contas antigas da PRAIANOS (e seus vínculos com a empresa), já que não estão visíveis e serão substituídas.
2. **Importação das 145 contas** sob o usuário cianovagestao@outlook.com, contexto PJ, vinculadas à PRAIANOS:
   - Código = a numeração da planilha, sem o ponto final (ex.: `1.2.1.1.3`).
   - Hierarquia montada pela numeração (pai = código sem o último nível).
   - Contas com filhos ficam como agrupadoras (não aceitam lançamento); só as folhas aceitam.
   - Todas ativas.
   - Contas dos grupos de impostos marcadas como conta de tributo.
3. **Conferência final**: contagem por grupo, verificação de que nenhuma conta ficou órfã e de que a árvore abre corretamente na tela Contas Contábeis.

## Numeração — ponto de atenção

A planilha usa 3 = Receitas, 4 = Despesas, 5 = Ajuste de Saldo Inicial, 6 = Custos. O sistema, por padrão, interpreta 3 = Patrimônio Líquido, 4 = Receitas, 5 = Custos, 6 = Despesas. Mantendo os códigos originais:

- A validação automática de vínculo entre categoria e conta contábil vai reclamar/errar nesses grupos.
- A DRE gerencial vai agrupar Receitas/Custos/Despesas nas linhas erradas.

Nada disso impede a importação nem o uso da árvore para consulta e classificação manual. Quando quiser usar DRE e vínculo automático de categorias, avise: nesse momento adapto as regras de grupo para esta empresa (ou renumeramos).

## Detalhes técnicos

- Escrita direta em `public.chart_accounts` (`user_id` = 0b385a24…, `context = 'pj'`) e `public.chart_account_companies` (`company_id` = bab7a4ac…), em uma transação, com `parent_id` resolvido em duas passadas (insere e depois liga pais pelos códigos).
- Campos preenchidos: `code`, `name`, `parent_id`, `allow_transactions` (false para nós com filhos), `is_active`, `is_tax` (grupo 4.3 e 4.5), `visible_pf = false`.
- Contas geradas apenas para os códigos existentes na planilha; se algum nível intermediário faltar, ele é criado com o nome do grupo correspondente para não deixar conta órfã.
- Nenhuma alteração de código do app nesta etapa.

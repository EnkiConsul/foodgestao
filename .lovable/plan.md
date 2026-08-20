# Turnos: saber quais estão em uso e limpar os que não estão

Hoje a tela de Turnos lista todos os horários cadastrados sem mostrar se algum colaborador, escala ou convocação usa aquele turno. A exclusão é "às cegas": só descobre o problema quando o banco recusa. O objetivo é dar visibilidade de uso e um caminho seguro de limpeza.

## O que muda na tela

**1. Selo de uso em cada card de turno**
- Cada card passa a mostrar um selo com o total de vínculos, por exemplo "Em uso: 12" ou "Sem uso".
- Ao passar o mouse / tocar no selo, abre o detalhe por origem:
  - Colaboradores com esse turno como padrão
  - Dias da configuração de trabalho do colaborador
  - Itens de escala (separando escalas publicadas de rascunho)
  - Convocações
  - Cobertura mínima
  - Grades semanais
- Turnos que são versão anterior de outro turno aparecem marcados como "versão histórica" — esses não devem ser excluídos, e sim mantidos inativos.

**2. Filtro de uso**
- Novo filtro ao lado da busca e do filtro de unidade: **Todos / Em uso / Sem uso**.
- Com "Sem uso" selecionado, o gestor vê exatamente a lista de candidatos a exclusão.

**3. Exclusão segura e limpeza em lote**
- No card, o botão excluir de um turno em uso fica desabilitado, com o motivo ("usado em 4 escalas publicadas"). Para esses, a ação oferecida é **Desativar** (deixa de aparecer na escala nova, preserva histórico).
- Com o filtro "Sem uso" ativo, aparece a ação **Excluir turnos sem uso**: seleção por caixas de marcação, resumo do que será apagado e confirmação única.
- A exclusão em lote revalida o uso no momento da confirmação, para não apagar um turno que acabou de ser usado por outro usuário.

**4. Recomendação visível**
- Um aviso curto no topo da aba explica a regra: turno com histórico deve ser **desativado**; excluir só faz sentido para turno criado por engano e nunca usado.

## Detalhes técnicos

- Nova função no banco (SECURITY DEFINER, filtrada por empresa) `dp_turnos_uso(p_company_id uuid)` que retorna, por `turno_id`, as contagens de: `dp_colaborador_config_trabalho.turno_padrao_id`, `dp_colaborador_config_dias.turno_id`, `dp_escala_itens.turno_id` (com quebra por status da escala), `dp_convocacoes.turno_id`, `dp_cobertura_minima.turno_id`, `dp_grade_dias.turno_id`, além de `versoes` (turnos que apontam para ele via `turno_origem_id`). Uma única chamada alimenta a tela inteira.
- Novo hook `useDpTurnosUso` (React Query, chave por empresa) consumido em `DpTurnos.tsx`; o mapa de uso é passado para `TurnoCard` como prop.
- `useDpTurnos.remover` passa a aceitar validação prévia: se o uso for maior que zero, rejeita com mensagem clara antes de chamar o banco; nova mutação `removerEmLote` para a limpeza.
- Testes unitários para o utilitário que agrega o retorno da função em rótulo/estado do card (em uso, sem uso, versão histórica) e para a regra de "pode excluir".
- Nenhuma alteração no cálculo de escala, horário previsto ou ponto.

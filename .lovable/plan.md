# Corrigir selo "Sem uso" na tela de Turnos

## O que está acontecendo

O selo de uso de cada turno vem de uma função do banco (`dp_turnos_uso`). Essa função ainda consulta a tabela das antigas **Grades Semanais**, que foi removida do sistema. Como a tabela não existe mais, a função falha ao ser executada e a tela não recebe nenhum dado de uso — então todos os turnos aparecem como "Sem uso", mesmo com colaboradores vinculados.

Confirmado no banco:
- a tabela `dp_grade_dias` não existe mais;
- existem 11 vínculos de colaboradores a turnos na configuração de trabalho da base.

## Correção

1. **Recriar a função de uso** sem a contagem de grades semanais, mantendo as demais origens: turno padrão do colaborador, dias específicos da configuração de trabalho, itens de escala (publicada e rascunho), convocações, cobertura mínima e versões derivadas.
2. **Contar apenas colaboradores válidos**: ignorar colaboradores desligados e os que estão na lixeira, para o número de pessoas vinculadas refletir a realidade.
3. **Limpar o front** do campo de grades semanais (tipo, totalizador e detalhamento de uso).
4. **Estado de erro explícito**: se a verificação de uso falhar, o card mostra "Uso indisponível" (e a exclusão fica bloqueada) em vez de mostrar "Sem uso" indevidamente — assim uma falha futura nunca sugere que o turno está livre.

## Detalhes técnicos

- Nova migração com `CREATE OR REPLACE FUNCTION public.dp_turnos_uso(uuid)`: remove o subselect de `dp_grade_dias`, remove a coluna `grade_dias` do retorno (com `DROP FUNCTION` antes, pois a assinatura de retorno muda) e mantém `SECURITY DEFINER`, `SET search_path = public`, o filtro `private.is_company_member(...)` e os GRANTs para `authenticated`/`service_role`.
- `colaboradores_padrao` e `config_dias` passam a fazer `JOIN` em `dp_colaboradores` filtrando `deleted_at IS NULL` e situação ativa.
- `src/lib/dp/turno-uso.ts`: remover `grade_dias` de `TurnoUsoRow`, `TURNO_USO_VAZIO`, `totalUsoTurno` e `detalhesUsoTurno`; adicionar estado `indisponivel` em `estadoUsoTurno` (quando a query retorna erro), com rótulo próprio em `rotuloUsoTurno`, `podeExcluirTurno = false` e mensagem em `motivoBloqueioExclusao`.
- `src/hooks/useDpTurnosUso.tsx`: expor o erro da query para a tela.
- `src/pages/dp/cadastros/DpTurnos.tsx`: passar `isError` ao cálculo de estado e manter o filtro "Sem uso" coerente.

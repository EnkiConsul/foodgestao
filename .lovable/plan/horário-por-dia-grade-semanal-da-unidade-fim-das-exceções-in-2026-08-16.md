# Horário por dia: grade semanal da unidade (fim das "exceções" indevidas)

## O que está errado hoje

Verifiquei o cadastro da Cristiane no banco: o horário base dela é 17:00–00:00 (intervalo 30) e sexta, sábado e domingo estão gravados como 16:30–00:30 — mas apenas como horário solto dentro do cadastro dela. Não existe nenhum horário da loja com 16:30–00:30, ou seja, o sistema hoje trata esse padrão da unidade como exceção pessoal.

Além disso, ao usar "Copiar de outro colaborador", o horário base copiado é sobrescrito de volta pelo horário do colaborador que está sendo editado: existe um efeito no painel que reaplica o turno padrão da vigência atual e ele roda a cada renderização (a lista de turnos é recriada em todo render). Resultado: a semana copiada fica com os dias do colega, mas com o horário base errado — exatamente o sintoma relatado.

## O que vamos entregar

1. Cópia entre colaboradores confiável
   - O horário base, os dias trabalhados, as folgas e os horários próprios de cada dia passam a vir exatamente como estão no colega escolhido.
   - O horário copiado deixa de ser sobrescrito pelo cadastro atual.

2. Horário diferente por dia deixa de ser exceção pessoal
   - Quando um dia tem horário diferente (ex.: sexta a domingo 16:30–00:30), o sistema cria/reaproveita um horário da loja com esse horário e vincula o dia a ele.
   - O rótulo na tela deixa de dizer "exceção deste colaborador" quando o horário é um horário da loja usado por outras pessoas; só continua marcado como exceção quando o horário realmente existe apenas para aquela pessoa.

3. Grade Semanal da unidade (novo)
   - Uma grade é um padrão de semana salvo por unidade: para cada dia, trabalha ou folga e qual horário da loja vale (ex.: Seg–Qui 17:00–00:00, Sex–Dom 16:30–00:30, folga variável).
   - Nova tela em Cadastros do DP para criar, editar e desativar grades.
   - No horário de trabalho do colaborador: botão "Usar grade da unidade" ao lado de "Copiar de outro colaborador", que preenche a semana inteira em um clique.
   - Ação "Salvar como grade da unidade" a partir de uma semana já montada, para transformar o padrão da Cristiane em grade reutilizável.
   - Aplicação em lote: na tela da grade, selecionar vários colaboradores da unidade e aplicar a grade a todos, gerando a configuração de trabalho vigente de cada um (com registro de histórico como já ocorre hoje).

4. Conversão dos dados existentes
   - Migração que varre os horários por dia já cadastrados, cria os horários da loja que faltam (ex.: 16:30–00:30 na unidade) e vincula cada dia ao horário correspondente, sem alterar horas de ninguém.

## Detalhes técnicos

- Novas tabelas: `dp_grades_semanais` (company_id, unidade_id, nome, folga_variavel, ativo, vigência) e `dp_grade_dias` (dow, trabalha, turno_id). Com GRANTs, RLS por empresa e políticas no mesmo padrão de `dp_turnos`.
- `ColaboradorJornadaPanel.tsx`: o efeito que sincroniza `horario` com `vigente.turno_padrao_id` passa a rodar apenas quando a vigência carregada muda (guard por ref), não em todo render; `onCopiarConfig` passa a definir unidade, base e dias em um único passo.
- `useDpTurnos.tsx`: memoizar a lista filtrada para parar de devolver novo array a cada render (causa raiz do efeito repetido).
- `persistir()` deixa de gravar `turno_id: null` para todos os dias: cada dia divergente é resolvido via `resolverTurnoDoHorario` (reaproveita ou cria o turno da unidade) e grava `turno_id` + snapshot de entrada/saída.
- `config-trabalho.ts`: `diaDivergeDoBase` deixa de ser a fonte do rótulo de exceção; passa a existir `diaEhHorarioDaLoja(dia, turnos)` para distinguir horário compartilhado de exceção real.
- Novos arquivos: `src/hooks/useDpGradesSemanais.tsx`, `src/components/dp/GradeSemanalFormDialog.tsx`, `src/components/dp/AplicarGradeColaboradoresDialog.tsx`, `src/pages/dp/DpGradesSemanais.tsx` (rota `/dp/cadastros/grades`, entrada no `dpNavigation.tsx`).
- Testes unitários para a resolução de turno por dia e para a aplicação da grade sobre a semana.

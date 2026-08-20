# Remover a tela de Grades Semanais

A tela é só um atalho de preenchimento da semana no cadastro do colaborador e não tem nenhum registro cadastrado (0 grades no banco), então a remoção não afeta nenhum colaborador, escala, ponto ou folha.

## O que sai

- Item "Grades semanais" no menu de Cadastros do DP.
- Rota `/dp/cadastros/grades` e a página em si.
- Botão "Grade da unidade" na aba **Horário de Trabalho** do cadastro do colaborador, junto com o diálogo de escolha da grade.
- Tabelas de grades no banco (estão vazias).

## O que continua funcionando

- Horário por dia da semana no cadastro do colaborador, atalhos 6x1 / 5x2, "copiar de um colega" e o horário base da unidade — nada disso depende das grades.

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: remover a entrada de Grades semanais.
- `src/App.tsx`: remover o `lazyWithRetry` e a `<Route path="cadastros/grades">`.
- Excluir `src/pages/dp/cadastros/DpGradesSemanais.tsx`, `src/components/dp/UsarGradeSemanalDialog.tsx`, `src/hooks/useDpGradesSemanais.tsx`.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: remover botão, estado `gradeOpen`, handler `onUsarGrade`, o render do diálogo e os imports de `semanaDaGrade`/`GradeSemanal`/`UsarGradeSemanalDialog` (ajustando o ícone `CalendarRange` se ficar sem uso).
- `src/lib/dp/config-trabalho.ts`: remover `semanaDaGrade` (sem outros consumidores).
- Migração: `drop table dp_grade_dias; drop table dp_grades_semanais;` (nessa ordem, ambas vazias).
- Rodar typecheck/testes ao final para garantir que não sobrou referência.

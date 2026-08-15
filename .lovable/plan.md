# Turno único + folga e horário por colaborador

Dois problemas reais no painel "Turno & Jornada" do colaborador:

1. **Folga semanal dessincronizada.** O campo "Folga semanal" guarda um dia separado (`folga_fixa_dow`) do que os switches dos dias da semana marcam. Ao desmarcar quarta, o dia virou folga na lista, mas o campo continuou mostrando domingo (valor salvo antes / atalho 6x1). São duas fontes de verdade para a mesma informação.

2. **Criação de turno para cada horário diferente.** Hoje, ao ligar "usar horário diferente neste dia", o sistema cria (ou reaproveita) um registro de turno na unidade ao salvar. Isso multiplica turnos no cadastro sem necessidade — cada colaborador com um horário particular gera um turno novo.

A intenção correta, e a que sustenta Ponto e Folha no futuro: **turno é um modelo de horário da unidade, válido para todos os dias**; no colaborador se marca apenas o dia de folga e, quando preciso, um horário diferente naquele dia — sem criar turno.

## O que muda

### 1. Folga passa a ser uma só informação
- Os switches dos dias da semana viram a única fonte de verdade: dia desmarcado = folga.
- O bloco "Folga semanal" deixa de ser um seletor de dia e passa a mostrar, em texto, a folga que resulta dos switches ("Folga: quarta-feira"), mais uma opção "Folga variável conforme escala" para quem não tem dia fixo.
- Alertas legais continuam: aviso quando não há folga marcada e quando o regime exige folga dominical.
- O que é gravado no banco continua compatível: quando existe exatamente um dia de folga, ele é gravado como folga fixa; com mais de um dia (ex.: 5x2), grava-se sem dia fixo e a folga é lida dos dias. Escala e Operação do Dia seguem lendo do mesmo jeito.

### 2. Horário diferente no dia deixa de criar turno
- O horário próprio de um dia passa a ser gravado no próprio dia da configuração do colaborador (entrada, saída e intervalo), como exceção ao turno.
- Nenhum turno novo é criado ao salvar o cadastro do colaborador. A tela "Turnos" volta a listar só os modelos que o gestor cadastrou de propósito.
- A geração de escala, a Operação do Dia e o horário previsto passam a usar o horário do dia quando existir, caindo no turno do dia / turno padrão quando não existir. A escala continua congelando entrada/saída no item, então Ponto e Folha leem o mesmo número de horas de hoje.
- Turnos que já foram criados automaticamente por essa rotina continuam existindo (não serão apagados) — indico apenas revisar e inativar os que não fizerem sentido.

### 3. Ajustes de leitura
- O resumo da configuração e o histórico de vigências passam a exibir "turno + exceções de horário" em vez de "N turnos diferentes".
- "Copiar de outro colaborador" copia também as exceções de horário.

## Detalhes técnicos

- Migração: adicionar `entrada`, `saida`, `intervalo_minutos` (nulos) em `dp_colaborador_config_dias`, com check de coerência (os três juntos ou nenhum).
- `src/lib/dp/config-trabalho.ts`: `DiaConfig` ganha os campos de horário; `turnoDoDia` retorna um horário resolvido que prioriza o override do dia; `folgaFixaDerivada(dias)` centraliza a derivação da folga; `validarConfigTrabalho` deixa de exigir `folga_fixa_dow` e passa a olhar `dias`.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: remover `VIRTUAL_PREFIX`, `resolverDias` e o seletor de dia de folga; overrides passam a viver dentro do estado `dias`; `definirFolgaFixa` sai em favor dos switches.
- `src/hooks/useDpColaboradorConfigTrabalho.tsx`: persistir os campos de horário por dia e derivar `folga_fixa_dow` no salvamento.
- `src/lib/dp/escala-mes.ts`, `src/lib/dp/horario-previsto.ts`, `src/hooks/useDpEscalaMes.tsx`: propagar o horário do dia na resolução do previsto.
- `src/components/dp/CopiarConfigColaboradorDialog.tsx`: incluir os campos de horário na consulta e na cópia.
- Testes: atualizar/estender `src/lib/dp/__tests__/config-trabalho.test.ts`, `escala-mes.test.ts` e `horario-previsto.test.ts` com casos de override de horário e de folga derivada.

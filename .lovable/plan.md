# Turno criado dentro do cadastro do colaborador

Você não precisa mais ir à tela "Turnos": o turno passa a nascer dentro da aba "Turno & Jornada" do colaborador. Mas com uma distinção importante — **um turno é um modelo de horário da unidade, não o horário de uma pessoa**.

## Por que não registrar o horário de cada colaborador como um turno

- **Explosão de cadastro**: 40 colaboradores com pequenas variações = 40 turnos. A lista de Turnos deixa de ser útil e ninguém sabe qual pode inativar.
- **Duplicidade silenciosa**: dois turnos "08:00–17:00" criados por telas/dias diferentes convivem, e relatórios que agrupam por turno passam a mostrar a mesma coisa em duas linhas.
- **Cobertura mínima quebra**: o mínimo por turno é cadastrado por turno. Se cada pessoa tem o seu, não existe mais um turno comum para exigir "2 pessoas no jantar".
- **Operação do Dia e Escala perdem leitura**: o painel diário agrupa por turno; com turnos individuais cada coluna tem uma pessoa.
- **Ponto e Folha (futuro)**: adicional noturno, tolerância e regras de intervalo tendem a ser definidos por turno. Turno por pessoa transforma regra em exceção e impede mudar a regra de todos de uma vez.
- **Manutenção**: mudar o jantar de 17h para 18h passaria a ser 40 edições em vez de uma.

## Como fica

### 1. Criar turno sem sair do colaborador
- No seletor "Turno padrão" da aba Turno & Jornada, o botão "Novo turno" abre o formulário de turno já com a unidade do colaborador preenchida; ao salvar, o turno é criado na unidade e selecionado.
- Estado vazio convida a criar o primeiro turno em vez de só dizer "nenhum turno cadastrado".
- Antes de criar, o sistema sugere turnos existentes com o mesmo horário na unidade ("Já existe 'Jantar' 17:00–23:00 — usar este?"), evitando duplicidade.
- A tela "Turnos" continua existindo para gestão (editar, inativar, cobertura mínima), mas não é obrigatória no caminho do cadastro.

### 2. Horário diferente de um dia não cria turno
- Ao ligar "usar horário diferente neste dia", entrada/saída/intervalo são gravados no próprio dia da configuração do colaborador, como exceção ao turno.
- Nenhum turno é criado automaticamente ao salvar o colaborador.
- Escala, Operação do Dia e horário previsto passam a usar o horário do dia quando existir, caindo no turno do dia / turno padrão quando não existir. A escala continua congelando entrada/saída no item, então Ponto e Folha leem as mesmas horas de hoje.
- Turnos já criados automaticamente pela rotina antiga não serão apagados — vale revisar e inativar os que não fizerem sentido.

### 3. Folga passa a ser uma só informação
- Os switches dos dias da semana viram a única fonte de verdade: dia desmarcado = folga.
- O bloco "Folga semanal" deixa de ser um seletor de dia e passa a mostrar em texto a folga resultante ("Folga: quarta-feira"), com a opção "Folga variável conforme escala".
- Alertas legais continuam (sem folga marcada, folga dominical conforme o regime).
- Gravação compatível: com exatamente um dia de folga, grava-se folga fixa; com mais de um (5x2), grava-se sem dia fixo e a folga é lida dos dias.

## Detalhes técnicos

- Migração: `entrada`, `saida`, `intervalo_minutos` (nulos) em `dp_colaborador_config_dias`, com check de coerência (os três juntos ou nenhum).
- `src/lib/dp/config-trabalho.ts`: `DiaConfig` ganha campos de horário; `turnoDoDia` retorna horário resolvido priorizando o override do dia; nova `folgaFixaDerivada(dias)`; `validarConfigTrabalho` passa a olhar `dias` em vez de `folga_fixa_dow`.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: remover `VIRTUAL_PREFIX`/`resolverDias` e o seletor de dia de folga; overrides no estado `dias`; botão "Novo turno" com detecção de turno equivalente na unidade via `useDpTurnos`.
- `src/hooks/useDpColaboradorConfigTrabalho.tsx`: persistir horários por dia e derivar `folga_fixa_dow` no salvamento.
- `src/lib/dp/escala-mes.ts`, `src/lib/dp/horario-previsto.ts`, `src/hooks/useDpEscalaMes.tsx`, `src/lib/dp/operacao-dia.ts`: propagar o horário do dia na resolução do previsto.
- `src/components/dp/CopiarConfigColaboradorDialog.tsx`: copiar também as exceções de horário.
- Testes: estender `config-trabalho.test.ts`, `escala-mes.test.ts`, `horario-previsto.test.ts` com override de horário e folga derivada.

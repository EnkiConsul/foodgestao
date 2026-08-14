# Turnos: intervalo, horário por dia e folga semanal

Três ajustes no cadastro de turno e na aba "Turno & Jornada" do colaborador.

## 1. Turno não salva quando o intervalo é diferente de 60 min

Hoje, quando o intervalo informado fica abaixo do mínimo do art. 71 da CLT (jornada acima de 6h exige 60 min; entre 4h e 6h exige 15 min), o botão "Salvar turno" não salva direto: ele abre um segundo modal de "ciência legal" por cima do modal do turno. Com 60 min esse alerta não aparece e o turno salva — o que casa exatamente com o sintoma relatado.

A causa provável é esse modal de ciência empilhado sobre o modal do turno (e, no cadastro do colaborador, sobre um terceiro modal), ficando invisível ou sem receber clique. A primeira etapa é confirmar isso no navegador; independente do resultado, a correção é a mesma:

- Substituir o modal empilhado por um bloco de ciência **dentro do próprio formulário do turno**: o alerta vermelho já existente passa a conter a caixa "Estou ciente…" e o campo de justificativa opcional.
- O botão "Salvar turno" fica desabilitado apenas enquanto a caixa de ciência não estiver marcada, com texto explicando o motivo. Nenhum salvamento silencioso.
- O registro em histórico de regras (autor, horário, justificativa, ciência) continua igual.
- Também exibir mensagem de erro (toast) quando o salvamento falhar no banco, hoje ausente no fluxo com ciência.

## 2. Horário diferente por dia da semana

Hoje o formulário só permite escolher um **turno** por dia; quem quer sexta, sábado e domingo com horários diferentes precisa cadastrar turnos separados antes, e por isso o horário da segunda parece "replicar" para todos os dias (é o turno padrão valendo para a semana inteira).

Mudança na lista "Dias da semana":

- Cada dia trabalhado ganha a opção "Usar horário diferente neste dia", que abre campos de entrada, saída e intervalo direto na linha.
- Ao salvar, o sistema reaproveita um turno existente com o mesmo horário na unidade ou cria um turno novo automaticamente e vincula ao dia — sem o usuário sair do cadastro.
- Sem a opção marcada, o dia continua seguindo o turno padrão.
- A carga semanal e os avisos legais passam a considerar o horário de cada dia.

## 3. Folga semanal (6x1) na mesma tela

O campo de folga fixa existe no banco (`folga_fixa_dow`), mas nunca é preenchido pela tela. Ele volta com a mesma lógica do projeto original — escolher o dia da folga no cadastro do colaborador — agora dentro da aba "Turno & Jornada":

- Seletor "Folga semanal" com as opções: um dia fixo da semana (dom a sáb), "variável conforme escala" ou "sem folga fixa".
- Atalhos de escala: 6x1 (marca seis dias e a folga escolhida) e 5x2, aplicados com um clique sobre os dias.
- Escolher a folga fixa desmarca automaticamente aquele dia na lista, e o valor passa a ser gravado e recarregado na edição.
- Os avisos de descanso semanal e de folga dominical continuam valendo, incluindo a ciência já existente para regras menos protetivas.

### Como o campo se comporta por tipo de vínculo

Nenhuma tela testa o regime direto: o comportamento sai de `contrato-policy.ts`, com um novo indicador de folga por contrato.

- **CLT, estágio, temporário**: folga semanal obrigatória (fixa ou variável). É o comportamento do projeto original, com validação de DSR.
- **Intermitente**: o campo de folga não aparece. O trabalho nasce de convocação, então a semana cadastrada é apenas disponibilidade habitual — sem folga a definir e sem validação de DSR.
- **PJ / MEI**: o campo aparece, mas como **referência operacional opcional**, rotulado "Dias sem previsão de trabalho". Não há DSR nem exigência legal; serve só para a escala e a operação do dia saberem quando não contar com a pessoa. Salvar sem folga é permitido, sem aviso.
- **Freelancer**: mesmo tratamento do PJ (opcional, apenas operacional), reforçando que não há jornada contratual — coerente com o vínculo que participa de escala e ponto, mas fica fora da folha.


## Detalhes técnicos

- `src/components/dp/TurnoForm.tsx`: ciência inline (remove `CienciaLegalDialog` aninhado), gate do botão salvar, toast de erro.
- `src/lib/dp/turno-utils.ts`: sem mudança de regra; apenas reuso de `intervaloAbaixoDoLegal`.
- Migração: adicionar `entrada_override`, `saida_override`, `intervalo_minutos_override` em `dp_colaborador_config_dias` **ou** manter o modelo atual criando/reaproveitando `dp_turnos` por horário. Preferência pela segunda opção (sem migração), para que escala, ponto e apuração continuem lendo o snapshot do turno sem alteração.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: campos por dia, seletor de folga semanal, atalhos 6x1/5x2, passar `folga_fixa_dow` real no salvamento.
- `src/lib/dp/config-trabalho.ts`: `normalizarDias` já aceita `folgaFixaDow`; ajustar resumo e validações para o novo campo.
- `src/lib/dp/contrato-policy.ts`: novo indicador `folgaSemanal: "obrigatoria" | "opcional" | "nao_se_aplica"` e rótulo próprio, derivando o comportamento de CLT, PJ/MEI, freelancer e intermitente.
- `src/hooks/useDpColaboradorConfigTrabalho.tsx`: persistir `folga_fixa_dow`.
- Verificação: teste Playwright salvando turno com intervalo 30 e 0, e conferindo horários distintos em sexta/sábado/domingo.

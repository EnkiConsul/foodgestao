# Horário diferente por dia, sem poluir a tela de Turnos

Entendi ao contrário na última rodada. O que você precisa:

- O colaborador **pode ter horário diferente em cada dia da semana** (realidade da Pakerê).
- Mas a tela **Turnos não deve ganhar um turno novo** para cada variação de horário de cada pessoa.

Hoje o sistema fazia o oposto: cada horário digitado num dia virava um registro em Turnos (foi assim que apareceram "Jantar 16:30–00:20", "16:30–00:35", "17:00–00:35"...). E, na última alteração, eu removi a edição por dia — é isso que vou desfazer.

## Como vai funcionar

- **Turnos** volta a ser só o catálogo da loja: horários que o gestor cadastra de propósito naquela tela (ou o turno principal do colaborador). Nada é criado em silêncio a partir de um dia específico.
- **Cadastro do colaborador** volta a ter, por dia da semana: trabalha/folga + entrada, saída e intervalo. O horário do dia é gravado no próprio colaborador, sem gerar turno.
- Um horário só entra em Turnos quando: (a) é o horário principal do colaborador, ou (b) o gestor cadastra na tela de Turnos, ou (c) ele mesmo pede "transformar em horário da loja" (botão opcional no dia, quando vários colegas usam o mesmo horário).
- Volta o atalho "Repetir" (copiar o horário de um dia nos outros dias) e a cópia do horário de um colega com a semana inteira.
- Escala, ponto e folha continuam lendo o horário previsto: o horário do dia vence o turno principal, como já era antes.

## Tela de Turnos

- Cada card continua mostrando **em uso / sem uso** e a lista de colaboradores vinculados, mas o vínculo por dia deixa de existir: cada colaborador aparece em **um único turno** (o principal).
- Ferramenta de limpeza: seleção em lote dos turnos "sem uso" para excluir de uma vez os que sobraram da criação automática.
- No detalhe do turno, além dos colaboradores, uma linha "X colaboradores têm horário diferente em algum dia" com atalho para a ficha, para o gestor enxergar as variações sem virar turno.

## Ponto de atenção (dado apagado)

Na alteração anterior eu limpei os horários por dia já cadastrados: 32 dias de colaboradores que tinham horário próprio ficaram com o horário principal. Isso **não é recuperável automaticamente** — o turno principal foi preservado, mas as exceções por dia precisarão ser digitadas de novo nas fichas afetadas. Depois de reativar a edição por dia, posso listar quais colaboradores/dias mudaram de carga para você revisar em uma tela só.

## Detalhes técnicos

- `src/components/dp/ColaboradorJornadaPanel.tsx`: restaurar campos de entrada/saída/intervalo por dia, badge de "horário próprio / horário da loja" e o popover "Repetir"; manter um único campo de horário principal.
- `src/lib/dp/config-trabalho.ts`: as funções `horarioEfetivoDia`, `diaDivergeDoBase`, `definirHorarioNoDia`, `copiarHorarioEntreDias` seguem sendo a fonte da lógica (não foram removidas).
- Salvamento: `turno_padrao_id` resolve para um turno (reaproveita ou cria **um**); os dias divergentes gravam `entrada/saida/intervalo_minutos` em `dp_colaborador_config_dias` com `turno_id = NULL` — fim da criação automática de turnos por dia.
- `src/lib/dp/horario-previsto.ts` e a geração de escala: usar o horário do dia quando houver, senão o turno principal.
- `src/lib/dp/turno-uso.ts` / `dp_turnos_uso`: contagem de vínculos passa a considerar só turno principal, dias e escalas/convocações; cards sem uso ficam elegíveis à exclusão em lote.
- Relatório de revisão (opcional, mesma tela do colaborador): comparar carga semanal atual com a anterior para apontar as fichas afetadas pela limpeza.

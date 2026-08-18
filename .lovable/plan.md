# Copiar a jornada do colega com os dias de horário diferente

## O problema

Ao copiar o horário de um colega, a semana dele vem incompleta:

1. Os botões com o nome do colega ("Copiar o horário de: Cristiane") só aplicam o horário base — os dias que têm entrada/saída diferentes (ex.: sexta e sábado de maior movimento) não são copiados.
2. Quando o dia diferente do colega está gravado como um horário da loja (turno próprio do dia), a busca dos modelos não traz a entrada/saída desse turno — só o id. Resultado: mesmo pelo diálogo "Copiar de outro colaborador", esses dias voltam sem horário e caem no horário base.
3. A tela chama todo dia divergente de "exceção", o que passa a ideia errada. Dias com horário diferente costumam ser o padrão da loja para dias de maior demanda.

## O que vai mudar

### 1. Trazer o horário real de cada dia (`src/hooks/useDpModelosHorario.tsx`)
Incluir no select o turno vinculado a cada dia (`dias:dp_colaborador_config_dias(..., turno:dp_turnos(entrada, saida, intervalo_minutos))`) e, ao montar `dias`, preencher entrada/saída/intervalo a partir desse turno quando o dia não tiver horário próprio digitado. Assim o modelo do colega carrega a semana completa, venha o horário do dia por campo próprio ou por turno da loja.

### 2. Botão de nome do colega copia a semana inteira (`src/components/dp/ColaboradorJornadaPanel.tsx`)
O clique no atalho passa a reaproveitar o mesmo caminho do diálogo de cópia (`onCopiarConfig`): aplica horário base + dias trabalhados + horários próprios de cada dia + folga variável, marcando o horário como aplicado para o efeito de sincronização não desfazer. Mensagem: "Horário de {Nome} copiado — revise e salve".

Nos atalhos, a deduplicação passa a considerar a semana (base + dias divergentes), não só a faixa base — hoje um colega com semana diferente é descartado por ter o mesmo horário base de outro.

O `title` do botão continua mostrando a faixa e passa a indicar quando o colega tem dias com horário diferente.

### 3. Linguagem: dia diferente não é exceção
Trocar o texto "Dias diferentes ficam como exceção logo abaixo" e rótulos equivalentes na grade semanal por linguagem de padrão da loja, por exemplo: "Dias com movimento diferente podem ter entrada e saída próprias — ajuste abaixo". Mantém o destaque visual de que o dia difere do horário base, sem chamar de exceção.

## Detalhes técnicos

- Nenhuma mudança de banco: `dp_colaborador_config_dias` já guarda `turno_id` e horários próprios por dia; o problema é só o select e o caminho de cópia.
- `normalizarDias`, `horarioEfetivoDia` e `copiarHorarioEntreDias` (`src/lib/dp/config-trabalho.ts`) seguem como estão.
- Teste unitário novo para o mapeamento dos modelos: um dia com `turno_id` de horário diferente deve sair com entrada/saída desse turno.
- O `CopiarConfigColaboradorDialog` se beneficia automaticamente da correção do hook.

# Turnos: um único turno por colaborador

## Regra que passa a valer

- Um colaborador tem **um turno só**. Nada de turno diferente por dia da semana.
- Só existe outro turno quando **entrada, saída ou tempo de lanche** for diferente.
- **Folga é folga, não turno.** Dias de folga (fixa, variável, domingo, folga extra) não geram turno nem vínculo novo — continuam marcados no dia como "não trabalha".

## Por que hoje aparecem 2 ou 3 turnos por pessoa (confirmado nos dados)

Na ficha do colaborador é possível informar horário próprio por dia, e isso grava um turno por dia, além do turno padrão. Ex.: HANNA tem padrão `Jantar 17:00–00:00` (que nenhum dia usa) e dias em `16:30–00:35` e `17:00–00:35`. Isso também inflou a lista de turnos e criou casos inválidos como `Jantar 17:00–17:00`.

## O que vou fazer

### 1. Ficha do colaborador: um horário único
- Na aba Turno & Jornada, o horário (entrada/saída/lanche) passa a ser **único para o colaborador**.
- A grade semanal mantém apenas a marcação **trabalha / folga** por dia, sem campo de horário por dia.
- O turno é resolvido a partir desse horário único: reaproveita turno existente com mesma entrada/saída/lanche na unidade, ou cria um novo (mantendo o comportamento atual de criação silenciosa).
- Bloqueio de horário inválido (entrada igual à saída).

### 2. Limpar os vínculos por dia já gravados
- Migração de dados: para cada colaborador com horários por dia, o turno **dominante** (o que aparece em mais dias trabalhados) passa a ser o turno padrão, e os horários por dia são zerados, preservando trabalha/folga.
- Quando os dias divergem, prevalece o dominante; os demais deixam de existir como vínculo.

### 3. Tela de Turnos: limpeza dos resíduos
- Painel "Revisar turnos" listando: turnos **sem uso** (já existe), turnos **idênticos** (mesma unidade, mesma entrada/saída/lanche) e turnos **inválidos** (entrada igual à saída, carga zero).
- Ação **Unificar** para turnos idênticos: escolhe o que fica, move os vínculos (turno padrão, escalas da competência corrente em diante, convocações, cobertura mínima) e inativa o duplicado, com log.
- Turnos com mesmo horário mas lanche diferente **não** são tratados como duplicados — pela regra, são turnos distintos.

### 4. Detalhe do turno
- O painel de colaboradores do turno passa a ter uma linha por pessoa, sem origens conflitantes, mostrando cargo, unidade e os dias trabalhados.

## Detalhes técnicos

- `dp_colaborador_config_dias`: `turno_id`, `entrada`, `saida`, `intervalo_minutos` deixam de ser gravados pela aplicação (colunas mantidas por compatibilidade, sempre nulas); `trabalha` segue como fonte da grade semanal.
- Migração de dados via ferramenta de insert/update: define `dp_colaborador_config_trabalho.turno_padrao_id` como turno dominante dos dias e zera os campos de horário em `dp_colaborador_config_dias`.
- `src/lib/dp/config-trabalho.ts`: remover a resolução de horário por dia (`temHorarioProprio`, `horarioEfetivoDia` e derivados) e passar a calcular carga semanal como turno único × dias trabalhados; testes em `__tests__/config-trabalho.test.ts` atualizados.
- `src/lib/dp/horario-previsto.ts`: hierarquia passa a ser convocação aceita > escala publicada > rascunho > turno padrão do colaborador (sem ramo de dia).
- `src/components/dp/ColaboradorJornadaPanel.tsx`: um bloco de horário no topo + grade só com trabalha/folga.
- `src/hooks/useDpColaboradorConfigTrabalho.tsx`: parar de enviar horário por dia no upsert.
- Novas funções `dp_turnos_duplicados(p_company_id)` e `dp_turnos_unificar(p_manter uuid, p_remover uuid[], p_justificativa text)` (SECURITY DEFINER, valida mesma empresa e mesmo horário, grava em `dp_regras_historico`).
- `dp_turno_colaboradores`: simplificada para turno padrão + escalas futuras, retornando os dias trabalhados.
- UI nova: `TurnosRevisaoDialog.tsx` acionado de `DpTurnos.tsx`; ajuste em `TurnoDetalheDialog.tsx`.

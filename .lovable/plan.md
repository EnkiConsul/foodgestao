# Turnos: entender e corrigir colaboradores em vários turnos

## Por que acontece hoje (confirmado nos dados da Pakerê)

1. Cada colaborador tem um **turno padrão** e pode ter **turnos por dia da semana**. Quando os dias são preenchidos com horários diferentes, o turno padrão continua gravado e o colaborador aparece em 2 ou 3 turnos. Ex.: HANNA — padrão `Jantar 17:00–00:00` (nenhum dia usa), dias em `16:30–00:35` e `17:00–00:35`.
2. O sistema **cria turno automaticamente** a partir do horário digitado na ficha do colaborador. Qualquer diferença de minutos gera um cadastro novo — por isso existem `16:00–23:50`, `16:30–00:20`, `16:30–00:30`, `16:30–00:35`, `17:00–00:35`.
3. Existem **duplicados**: dois `Jantar 19:00–00:35` na mesma unidade, diferentes apenas no intervalo (30 min e 15 min).
4. Existe **lixo de digitação**: `Jantar 17:00–17:00`.

## O que vou fazer

### 1. Deixar o vínculo transparente no detalhe do turno
- No painel do turno, cada colaborador passa a mostrar **como está vinculado**: "Turno padrão", "Dias: seg, ter, qua" ou "Escala".
- Selo de aviso "padrão não usado" quando o colaborador tem turnos por dia em todos os dias trabalhados e o padrão aponta para outro turno — é o caso que gera a contagem dupla.

### 2. Novo painel "Revisar duplicidades" na tela de Turnos
- Lista turnos com **mesmo horário na mesma unidade** (agrupando por entrada/saída, mesmo com intervalo diferente).
- Lista turnos **inválidos** (entrada igual à saída, carga zero).
- Ação **Unificar**: escolhe o turno que fica e move todos os vínculos (turno padrão, dias fixos, escalas futuras, convocações, cobertura mínima) para ele, depois inativa/exclui o duplicado. Confirmação mostrando quantos registros serão movidos.

### 3. Evitar novos duplicados na origem
- Ao salvar a ficha do colaborador, o reaproveitamento de turno passa a ignorar diferença apenas de intervalo: se já existe turno com mesma entrada/saída na unidade, reutiliza e não cria outro.
- Ao salvar a configuração de trabalho, quando **todos os dias trabalhados** têm turno próprio, o turno padrão é alinhado ao turno mais frequente desses dias — some o vínculo órfão.
- Bloquear salvamento de horário com entrada igual à saída.

### 4. Limpeza dos dados atuais
- Após a unificação estar disponível, uso o próprio painel para juntar os dois `Jantar 19:00–00:35` e remover `Jantar 17:00–17:00`.

## Detalhes técnicos

- `dp_turno_colaboradores`: retornar também `dows` (array de dias) e um flag `padrao_orfao`, mantendo uma linha por colaborador com todas as origens agregadas.
- Nova função `dp_turnos_duplicados(p_company_id)` agrupando por `unidade_id, entrada, saida` com contagem de vínculos por turno.
- Nova função `dp_turnos_unificar(p_manter uuid, p_remover uuid[], p_justificativa text)` — SECURITY DEFINER, valida mesma empresa/unidade/horário, faz `UPDATE` em `dp_colaborador_config_trabalho.turno_padrao_id`, `dp_colaborador_config_dias.turno_id`, `dp_escala_itens.turno_id` (competência corrente em diante), `dp_convocacoes.turno_id`, `dp_cobertura_minima.turno_id`, grava log em `dp_regras_historico` e inativa os removidos.
- `src/lib/dp/turno-resolver.ts`: `encontrarTurnoEquivalente` compara só entrada/saída (intervalo deixa de criar turno novo); testes unitários atualizados.
- `src/lib/dp/config-trabalho.ts` (ou equivalente do submit da ficha): alinhar `turno_padrao_id` ao turno dominante dos dias.
- UI: `TurnoDetalheDialog.tsx` (origens detalhadas), novo `TurnosDuplicadosDialog.tsx` e botão em `DpTurnos.tsx`.

# Corrigir o selo "Horário da loja" no horário de trabalho

## O problema (confirmado no código)

Hoje o selo do dia é decidido só pela pergunta "existe um turno cadastrado com esse horário?" (`diaEhHorarioDaLoja` em `src/lib/dp/config-trabalho.ts`). Como ao salvar o sistema cria automaticamente um turno para qualquer horário digitado, o horário exclusivo da Cristiane (saída 00:30 em sex/sáb/dom) passa a existir na lista de turnos e, na volta à tela, aparece como "Horário da loja" — mesmo sendo diferente do horário da maioria.

## O que muda

O selo passa a considerar **quantos colegas realmente usam aquele horário na unidade**, não a simples existência do turno:

- "Horário da loja" só quando o horário do dia é usado por outros colaboradores da unidade (pelo menos um colega além da pessoa em edição) naquele dia ou como horário habitual.
- Caso contrário: "Horário próprio" — é o caso da saída 00:30 da Cristiane.
- O texto de ajuda do dia passa a mostrar quantas pessoas usam o horário (ex.: "usado por 4 colegas"), para o usuário entender a classificação.

Nada muda no salvamento, na escala, no ponto ou na folha: o turno continua sendo criado/reaproveitado como hoje; só a rotulagem na tela fica correta.

## Detalhes técnicos

1. `src/lib/dp/config-trabalho.ts`: substituir `diaEhHorarioDaLoja` por uma versão que recebe a contagem de uso por horário (mapa `entrada|saida|intervalo` → nº de colaboradores) em vez da lista de turnos; manter assinatura antiga apenas se algum outro chamador depender dela (verificar com busca) e ajustar chamadas.
2. `src/components/dp/ColaboradorJornadaPanel.tsx`: montar a contagem a partir dos modelos de horário dos colegas da mesma unidade já carregados na tela (mesma fonte usada nos atalhos "Copiar o horário de"), contando também os overrides diários, e passar essa contagem ao cálculo do selo; excluir o próprio colaborador da contagem.
3. Reaproveitar/estender `contarHorariosBase` em `src/lib/dp/modeloHorarioRanking.ts` para incluir os horários por dia, evitando lógica duplicada.
4. Testes unitários em `src/lib/dp/__tests__` cobrindo: horário usado por vários colegas = loja; horário só do colaborador (mesmo com turno já criado) = próprio.

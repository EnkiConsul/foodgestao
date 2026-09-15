# Portal do colaborador: folgas, rotina, férias e justificativa

Quatro fases, uma por vez, com aprovação entre elas. Nada de redesenho: as telas continuam iguais, muda o comportamento.

## O que está errado hoje (confirmado no banco)

- A Karen tem os dias de sábado e domingo marcados como "não trabalha" na configuração de trabalho dela, mas o campo antigo de "folga fixa na semana" está vazio. A pendência só olha esse campo antigo, por isso pede folga do mês para quem já folga fim de semana.
- A Alessandra é intermitente e está com todos os dias marcados como "trabalha" na configuração. Quando o mês não tem escala publicada, a rotina da loja monta a equipe por essa configuração, então ela aparece no dia 15/09 sem nunca ter sido convocada.
- A rotina da loja hoje agrupa por setor ou função e filtra por sobreposição de horário, não por turno.
- No pedido de férias, o primeiro dia começa vazio (o celular oferece hoje) e os dias de descanso também começam vazios.

## Fase 1 — Folgas de quem folga fim de semana

1. A pendência "Escolher folga do mês" deixa de aparecer para quem tem dias fixos sem trabalho na configuração de trabalho (sábado e domingo, no caso da Karen), e não só para quem tem o campo antigo preenchido.
2. Nas solicitações do portal, quem folga fim de semana passa a ter duas opções, ambas com justificativa obrigatória e aprovação do gestor:
   - **Trocar a folga do fim de semana**: escolhe o dia de meio de semana que quer folgar e escolhe qual sábado ou domingo vai trabalhar no lugar.
   - **Folga exceção** (já existe): pedido de folga fora da regra, mantido como está.
3. O gestor vê o pedido de troca em Folgas → Solicitações, com os dois dias e a justificativa, e aprova ou recusa. Ao aprovar, o dia de meio de semana entra como folga e o dia do fim de semana escolhido passa a ser dia de trabalho.

## Fase 2 — Rotina da loja por turno

1. A equipe do dia passa a vir agrupada por turno (ex.: ABERTURA 08:30–18:30, JANTAR 17:00–00:20), com setor/função dentro de cada turno.
2. O colaborador vê por padrão apenas o turno dele; há um atalho para ver os outros turnos do dia quando quiser.
3. Quem é intermitente ou folguista só aparece na rotina se tiver convocação aceita ou item de escala publicada para aquele dia — a configuração de trabalho sozinha deixa de escalar essas pessoas. Isso resolve o caso da Alessandra.

## Fase 3 — Pedido de férias

1. O primeiro dia já vem preenchido com a primeira data possível: o maior valor entre o início permitido do gozo e hoje mais o prazo de aviso da empresa (30 dias, no caso).
2. Os dias de descanso vêm preenchidos com o saldo menos os dias vendidos e são recalculados quando os dias vendidos mudam. O colaborador pode reduzir, respeitando o fracionamento legal (até 3 períodos, nenhum abaixo de 5 dias, um deles com 14 dias ou mais), com aviso claro quando a divisão não é permitida.
3. O cartão de pedir férias passa a rolar só na vertical no celular.

## Fase 4 — Justificativa de pontualidade

1. Sete opções, na ordem: Atraso, Falta, Saída antecipada, Esquecimento de marcação, Problema no relógio de ponto, Atestado, Outro. Esquecimento e Problema no relógio só aparecem em unidade com relógio de ponto cadastrado; Outro exige justificativa.
2. Em Atraso, Falta e Saída antecipada, o colaborador escolhe entre "Já aconteceu" e "Ainda vai acontecer hoje", com textos mais claros em cada caso (por exemplo: "Vou chegar atrasado hoje" / "Cheguei atrasado").
3. Em Atraso, Esquecimento e Problema no relógio, o colaborador escolhe o momento — Entrada do expediente, Saída para o intervalo, Retorno do intervalo, Saída do expediente ou Outro (justificativa obrigatória) — informa o horário do fato e pode escrever uma justificativa opcional.
4. Atestado registra a ausência por atestado e, na mesma tela, permite anexar a foto ou o PDF do atestado.

## Detalhes técnicos

**Fase 1**
- `useDpPendenciasColaborador.tsx`: além de `folga_fixa_semana`, ler `dp_colaborador_config_trabalho` + `dp_colaborador_config_dias` vigentes e considerar folga fixa quando houver dias com `trabalha = false` recorrentes; regra pura em `src/lib/dp/folga-rules.ts` com teste unitário.
- Pedido de troca: novo fluxo em `DpMeuSolicitacoes.tsx` usando `dp_solicitacoes` (tipo `folga`) com `data_alvo` = dia de meio de semana e `data_fim` = dia do fim de semana cedido, motivo obrigatório. Migration ajusta a RPC de criação/aprovação para validar o par de datas no servidor (dia cedido precisa ser dia fixo de folga do colaborador; dia pedido precisa estar dentro dos dias permitidos e sem bloqueio), gerar a folga e a marcação de trabalho de forma atômica e idempotente, mantendo auditoria. Multiempresa por `auth.uid() → colaborador → empresa/unidade`, sem confiar em `company_id` do cliente.
- Tela do gestor em `DpSolicitacoes.tsx` mostra os dois dias.

**Fase 2**
- Migration substituindo `public.dp_portal_rotina_dia(date)` (mesma assinatura, colunas novas `turno_id`, `turno_nome`, `turno_categoria`), mantendo `SECURITY DEFINER`, `search_path = public`, `REVOKE` de `anon/PUBLIC` e `GRANT` para `authenticated, service_role`.
- No caminho habitual, excluir regimes convocáveis (`intermitente`, folguista) salvo convocação aceita em `dp_convocacoes/dp_convocacao_destinatarios` ou item em escala publicada.
- `DpMeuRotinaLoja.tsx`: agrupar por turno, filtro padrão no turno do próprio colaborador com alternância para ver os demais.

**Fase 3**
- `DpMeuFerias.tsx` + `src/lib/dp/ferias-pedido.ts`: `inicioSugeridoPedido(periodo, hoje, avisoDias)` e `diasSugeridos(saldo, abono)`; validação de fracionamento reaproveitando `avaliarFracionamento`; testes em `src/test/unit/feriasPedido.test.ts`.
- Rolagem: `DialogContent` com `overflow-x-hidden`, grade de dois campos vira uma coluna no celular.

**Fase 4**
- `MinhaJornadaAcoesCard.tsx` reorganizado em catálogo de opções (tipo + momento + exigências) em `src/lib/dp/ocorrencias-portal.ts`, com teste unitário do mapeamento.
- Sem novos valores de enum: momento usa `dp_ocorrencia_marcacao` (`entrada`, `intervalo_inicio`, `intervalo_retorno`, `saida`); "Outro" fica sem marcação e exige justificativa; retorno do intervalo com atraso usa `atraso_intervalo`; "Problema no relógio" e "Outro" usam `divergencia_jornada`.
- Atestado: registra ocorrência `atestado` e envia o arquivo pelo mesmo caminho já usado em Meus Documentos (documento tipo `atestado`, submetido pelo colaborador), reaproveitando as validações existentes.

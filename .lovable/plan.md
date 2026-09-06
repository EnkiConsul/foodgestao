# Convocação da Alessandra: virada de dia e erro ao publicar

## O que está acontecendo hoje (verificado nos dados)

A convocação criada ontem para a unidade Pakerê Garavelo, cargo ATENDENTE, das 16:30 às 00:35, com a Alessandra como única pessoa selecionada, ficou salva como rascunho com 7 dias (06, 12, 13, 19, 20, 26 e 27/09).

- A caixa "Termina no dia seguinte" aparece desmarcada na tela, mas o sistema gravou o dia virando corretamente. É só um problema visual: a tela não marca sozinha a caixa quando a saída é menor que a entrada.
- O erro ao publicar tem outra causa: o horário habitual cadastrado para a Alessandra vai das **16:30 às 00:20**, e a necessidade pedida vai até **00:35**. Como a convocação está no modo "horário de cada pessoa", o sistema procura o horário habitual dela e conclui que ele não cobre os 15 minutos finais — então nenhuma pessoa fica elegível e a publicação é recusada. A mensagem que aparece é genérica e não diz qual pessoa nem qual o motivo.

## O que vai mudar

1. **Virada de dia automática**: sempre que a saída for menor ou igual à entrada (16:30 → 00:35), a caixa "Termina no dia seguinte" fica marcada e travada, com a explicação "a saída é no dia seguinte". Vale para o horário padrão do topo, para cada linha da lista de datas e para os horários individuais por pessoa.

2. **Aviso antes de publicar, no lugar do erro depois**: na etapa "Revisar e publicar", cada dia mostra, pessoa por pessoa, se ela está apta. Quando não estiver, aparece o motivo em português — por exemplo "o horário habitual dela (16:30–00:20) não cobre o horário pedido (16:30–00:35)", "já convocada nesse dia", "já escalada nesse dia", "indisponível", "cargo diferente", "outra unidade", "valor por hora não cadastrado". O botão de publicar fica desabilitado enquanto houver dia sem ninguém apto, com o motivo à vista.

3. **Caminho de saída oferecido na própria tela**: quando o bloqueio é só o horário, a revisão sugere duas ações claras — usar o **horário informado para todos** (a convocação passa a valer 16:30–00:35 independentemente do horário habitual) ou **ajustar a necessidade** para caber no horário habitual da pessoa. Assim o gestor resolve sem sair da convocação.

4. **Mensagens de erro claras**: se a publicação ainda falhar, o aviso diz a data e o motivo traduzido, em vez de "não foi possível publicar".

## Detalhes técnicos

- `NovaConvocacaoPlanner.tsx`: derivar `vira` de `saida <= entrada` no `horarioGeral`, no `resolverSugestao` e ao aplicar horário aos dias; checkbox `disabled` quando derivado. Mesmo tratamento em `DiasSelecionadosLista.tsx` (`onPatch`) e nos overrides por pessoa.
- Nova RPC de leitura `dp_convocacao_pre_avaliar_grupo(p_grupo_id uuid, p_expected_updated_at timestamptz default null)` (migração a partir de M30), `SECURITY DEFINER`, `STABLE`, com `requireCompanyAccess` equivalente ao das RPCs existentes e `GRANT EXECUTE ... TO authenticated`: para cada ocorrência em rascunho do grupo, percorre os destinatários (ou os candidatos do cargo/unidade quando aberta) e devolve `data`, `cargo_id`, `colaborador_id`, `apto`, `motivo`, `entrada`, `saida`, `termina_no_dia_seguinte`, reusando `dp_convocacao_avaliar_candidato` + `dp_convocacao_horario_efetivo` (nada de duplicar regra).
- `RevisaoConvocacao.tsx`: consumir a nova RPC via hook tipado (sem `as any`), renderizar por dia/cargo com badges e o mapa de motivos → texto em `src/lib/dp/convocacoes-motivos.ts`.
- Ações de correção: "usar horário informado para todos" grava `horario_modo = 'horario_unico'` com entrada/saída da necessidade; "ajustar necessidade" reduz `necessidade_saida` para o fim do horário habitual da pessoa quando há uma só pessoa no cargo/dia.
- `publicarGrupo`: estender o mapa de mensagens com `PUBLICATION_TARGET_INELIGIBLE`, `COMPATIBILIDADE_INCOMPATIVEL`, `SEM_JORNADA_NA_DATA`, `JA_CONVOCADO_NA_DATA`, `ALOCADO_EM_ESCALA`, `OFFER_ALREADY_STARTED`, incluindo a data extraída da mensagem.
- Testes: unitários para a derivação de virada de dia e para o mapa de motivos em `src/lib/dp/__tests__`; teste de banco em `supabase/tests/` cobrindo a nova RPC (caso apto, caso incompatível por 15 minutos, caso sem destinatário) dentro de `BEGIN … ROLLBACK`.
- Verificação: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__` e reprodução no navegador da publicação da convocação da Alessandra.

## Fora do escopo

Desistência, substituição, no-show e mudanças em migrações antigas.

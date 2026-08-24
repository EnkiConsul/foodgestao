# Convocações — Correção do Bloco 2 e conclusão do Bloco 3

Objetivo: publicação correta, Portal com dados completos, visualização registrada, aceite/recusa autoritativos, controle atômico de vagas e escala gerada uma única vez pelo trigger existente.

Nada das migrations já aplicadas (M1–M18) é editado. Toda correção entra como migration nova.

## O que muda no backend

### M19 — Helpers e publicação
- Materialização de horários: primeiro resolver o horário real da oferta de cada candidato (entrada, saída, intervalo, virada de dia, carga prevista) e só depois calcular `inicio_previsto`, `fim_previsto` e `encerramento_operacional`, usando a data da ocorrência e o timezone autoritativo. `fim_previsto` passa a usar o horário ofertado, nunca a necessidade de saída. Necessidade e oferta permanecem conceitos separados, com virada de dia independente.
- Ocorrência já iniciada: na publicação valida-se tanto a janela da necessidade quanto o horário real da oferta do candidato; se qualquer um já começou, aquela operação não é publicada, com erro padronizado.
- Remuneração (helper autoritativo): Intermitente somente horista com valor/hora positivo (diarista rejeitado); Freelancer horista com valor/hora, diarista com valor de diária, mensalista inelegível. Sem conversão de salário mensal e sem uso de `dp_cargo_salarios.salario_base`. Snapshot grava forma de pagamento, unidade de remuneração, valor unitário, quantidade prevista (carga para horista, 1 para diarista), valor previsto e fonte.
- Unidade: exige `colaborador.unidade_id = ocorrencia.unidade_id` (sem coringa para unidade nula) em oferta individual, aberta, helper de elegibilidade e revalidação do aceite; `company_id` sempre validado.
- Oferta aberta: respeita `dp_convocacao_config.permite_oferta_aberta`; se desabilitada, não publica (`OPEN_CALL_NOT_ALLOWED`).
- Antecedência: exige confirmação explícita por ocorrência (`ocorrencia_id`, `confirmado: true`, `justificativa`). Justificativa obrigatória apenas quando `exige_justificativa_excecao = true`. Frontend não envia dias de antecedência, autor nem timestamps — tudo derivado no backend.
- Helper de elegibilidade ganha parâmetro interno para ignorar a própria oferta na revalidação, mantendo o bloqueio por outras ofertas e alocações.

### M20 — Resposta à oferta e visualização
- `dp_convocacao_responder_oferta` é reimplementada (mesmo nome, nova migration) como autoridade do novo fluxo (`ocorrencia_id IS NOT NULL`); com `ocorrencia_id IS NULL` o comportamento legado é preservado.
- Autorização antes de qualquer lock: `auth.uid()` obrigatório, colaborador resolvido pelo usuário, oferta precisa pertencer a ele; nada vindo do frontend é confiado; tentativa em oferta alheia falha fechada e sem revelar dados.
- Ordem de lock: autenticação → contexto → lock da ocorrência → lock lógico trabalhador/data (`pg_advisory_xact_lock` com chave company + colaborador + data) → lock da oferta → revalidação → resposta.
- Vagas: dentro da transação conta apenas ofertas `aceita`. Se houver vaga, aceita; se não, a própria oferta vai de `pendente` para `encerrada_sem_vaga` com `encerrada_em` e `encerramento_motivo = 'VAGA_PREENCHIDA'`, evento registrado, commit e retorno JSON — sem `RAISE` que desfaça a mutação. `motivo_recusa` não é usado nesse caso.
- Aceite que preenche a última vaga: na mesma transação a oferta vira `aceita`, a ocorrência vira `preenchida`, as demais pendentes da mesma ocorrência viram `encerrada_sem_vaga` (nunca recusada) com motivo e timestamp, e os eventos de auditoria são gravados.
- Recusa: remove a referência ao campo inexistente `exige_motivo_recusa`; motivo é opcional e, quando informado, salvo sanitizado; grava `respondida_em` e não altera outras ofertas.
- Revalidação no aceite: empresa, colaborador ativo, regime convocável, mesma unidade e cargo, indisponibilidade atual, jornada/compatibilidade, conflitos, escala atual, Option A, snapshot de remuneração válido, prazo, início da ocorrência e vagas.
- Estados bloqueantes pessoa/dia: `pendente`, `aceita`, `encerrada_operacionalmente` e histórico com comparecimento; consulta também `dp_escala_itens`; ignora somente o próprio ID.
- Indisponibilidade posterior à publicação impede o aceite e encerra a oferta com motivo operacional, sem convertê-la em recusa.
- Precedência temporal por timestamps persistidos: prazo antes do início → `sem_resposta`; início antes do prazo → `encerrada_inicio_ocorrencia`; empate resolve como `sem_resposta`. O estado é materializado na mesma transação, com `encerrada_em` e motivo, sem rollback.
- Idempotência: repetir a mesma resposta retorna sucesso idempotente sem novo evento, escala, timestamp ou resposta; `aceita → recusar` e `recusada → aceitar` retornam `INVALID_STATE`; `encerrada_sem_vaga` retorna o estado existente.
- Nova RPC idempotente de visualização (`authenticated`/`service_role`), restrita ao colaborador do `auth.uid()` e às suas próprias ofertas do novo fluxo, gravando `visualizada_em` somente quando nulo.
- Eventos mínimos: visualizada, aceita, recusada, encerrada sem vaga e ocorrência preenchida, com empresa, grupo quando disponível, ocorrência, convocação, ator e payload sanitizado, sem duplicar em retry.
- Escala: `dp_convocacao_sync_escala` continua sendo o único criador de item de escala; a RPC não insere em `dp_escala_itens` nem ganha helper paralelo. O trigger só é tocado (M21) se houver defeito concreto que impeça o aceite, com justificativa.
- Grants: RPCs de aplicação para `authenticated` e `service_role`; helpers internos sem `EXECUTE` para `authenticated`; nenhum `PUBLIC`/`anon`; `SECURITY DEFINER` com `search_path` seguro e erros sanitizados.

## O que muda no frontend

- Portal (Minhas Convocações): remuneração lida exclusivamente de `remuneracao_snapshot` (`valor_previsto`, `valor_unitario`, `unidade_remuneracao`, `quantidade_prevista`), exibindo por exemplo "R$ 100,00 — R$ 20,00/h × 5h" ou "R$ 150,00 — Diária: R$ 150,00". Nada é recalculado com o cadastro atual.
- Cada oferta nova mostra cargo, unidade, data, horário, virada de dia, carga prevista, modalidade (Individual/Aberta), remuneração, prazo e status, obtidos pelas relações convocação → ocorrência → grupo, sem duplicar dados. A exibição do legado é preservada.
- Ao abrir a tela, as ofertas exibidas registram visualização pela nova RPC.
- Rótulos ao trabalhador, sem códigos técnicos: Aguardando resposta, Confirmada, Recusada, Vaga preenchida, Prazo encerrado, e "Período de resposta encerrado porque o trabalho já iniciou".
- Gestor: Aguardando conta apenas pendentes, Confirmadas apenas aceitas; o detalhe da ocorrência mostra vagas, confirmados, aguardando, encerrados sem vaga e recusados, com vagas restantes calculadas como máximo entre vagas menos aceitas e zero (sem contador persistido).
- Escrita do novo fluxo somente via RPC; auditoria das chamadas diretas de insert/update/delete em `dp_convocacoes` para garantir que o fluxo novo não passa por elas, mantendo o legado como está.

## Testes e verificação

- Testes de publicação (materialização de horários, virada de dia independente, matriz de remuneração por regime/forma, unidade nula, oferta aberta desabilitada, antecedência com confirmação e justificativa, snapshot no Portal).
- Testes de aceite/recusa (dono x terceiro, retries, transições inválidas, indisponibilidade/inatividade/regime após publicação, conflito de escala, Option A, prazo e início, persistência dos estados temporais).
- Testes de vagas (1 vaga com 2 trabalhadores; 3 vagas com 5 ofertas; nunca mais aceitas que vagas) e de escala (exatamente 1 item no aceite, 0 nos demais desfechos, criado pelo trigger).
- Execução real de `npx vite build`, `npm test`, `npm run lint` e `npm run typecheck:strict`, com números medidos e separação entre falhas novas, pré-existentes e testes não executáveis.
- Concorrência real com duas sessões autenticadas não é homologável neste ambiente: será registrada como RELEASE BLOCKER, e `3B1_VALIDATION_ENVIRONMENT_UNAVAILABLE` permanece aberto.

## Fora do escopo

Indisponibilidade self-service, encerramentos por cron/job, substituição, desistência, troca, cancelamento pós-aceite, regra dos 50%, descumprimentos, comparecimento/no-show e os Blocos 4 e 5.

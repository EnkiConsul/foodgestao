# Nova Convocação — planejamento mensal em tela única

## O que o diagnóstico encontrou

Boa notícia: grande parte da base já existe e não precisa ser refeita.

Já pronto (não mexer):
- Tela única `NovaConvocacaoPlanner` (sem wizard, sem data inicial/final, sem seletor de modalidade, sem turno) — os passos Grupo/Cargos/Datas/Detalhes/Revisar já não existem.
- Tabela de destinatários com remoção lógica, índices parciais únicos e RLS; colunas de horário geral e o modo de público no grupo; regra de "só envia para quem foi escolhido" (falha fechada, sem cair para todos).
- Funções de gravar rascunho, definir destinatários, ajuste individual de horário, sugestão de horário a partir dos fixos, publicação atômica, encerramento sem vaga, antecedência e auditoria.

Lacunas reais desta tarefa (todas de experiência + 1 de dado):
1. O calendário mostra apenas o cargo ativo (abas de cargo). Não mostra os cargos selecionados juntos, nem cria a necessidade de todos os cargos com um clique.
2. "Confirmados" hoje conta só convocações aceitas; falta somar os fixos efetivamente programados do dia.
3. A lista de datas escolhidas é uma linha compacta, sem os cartões por cargo com confirmados / mínimo / faltam / vagas / elegíveis.
4. Não é possível ter dois horários diferentes no mesmo dia e cargo (o estado é indexado por dia+cargo).
5. O horário geral é gravado dentro de cada necessidade, não no grupo; as colunas de horário geral do grupo existem mas ficam vazias.
6. Ao desmarcar um cargo, o planejamento daquele cargo é apagado em silêncio.
7. Faltam: apresentação da jornada de cada pessoa na lista, aviso de horário ambíguo com escolha rápida, resumo fixo no rodapé, revisão antes de publicar em painel próprio, "Mais opções" recolhido e testes.

## O que vai mudar na tela

Topo: Unidade, Mês, Cargos (vários), Colaboradores a convocar (busca, mostrando "Regime · Cargo" e a jornada — "18:00 → 23:00", "Horário varia conforme o dia" ou "Sem horário cadastrado" em destaque de atenção) e Horário padrão opcional.

Calendário logo abaixo: cada dia lista os cargos escolhidos com "3/6 · faltam 3" e "+2 aguardando" em linha separada; com muitos cargos mostra os primeiros e "+2 cargos" com acesso ao detalhe. Um clique no dia cria a necessidade de todos os cargos selecionados, com vagas sugeridas (mínimo − confirmados, nunca negativo; sem mínimo começa em 1; cobertura atendida mostra "Cobertura atendida" e o botão "Convocar adicional").

Abaixo: "Datas selecionadas", uma por bloco, com um cartão por cargo mostrando confirmados, mínimo, faltam, contador de vagas grande, horário da necessidade com "Editar", "Adicionar outro horário" (segunda necessidade no mesmo dia/cargo) e a contagem clara de "8 selecionados · 6 elegíveis nesta data · 3 vagas", com o motivo de cada inelegível (indisponível, horário não cobre a necessidade, conflito).

Rodapé fixo: "3 dias · 2 cargos · 8 vagas · 6 pessoas" com "Salvar rascunho" e "Revisar e publicar". A revisão abre em painel, listando só as exceções que existirem (incompatibilidades, antecedência curta com justificativa, gente sem horário, remuneração).

Trocar unidade, cargos ou pessoas nunca apaga o que já foi planejado: os itens afetados ficam marcados com aviso e um botão para remover manualmente.

## Detalhes técnicos

Banco (migração nova, a partir de M26 — nada de editar migrações antigas):
- `dp_convocacao_criar_grupo` / `dp_convocacao_atualizar_grupo`: aceitar `p_horario_geral_entrada/saida/intervalo_minutos/termina_no_dia_seguinte`, gravando nas colunas já existentes do grupo, com os checks atuais.
- `dp_convocacao_horario_efetivo`: precedência override da ocorrência → horário geral do grupo → jornada autoritativa da data; sem horário resolvido, candidato inapto com motivo próprio (`HORARIO_NAO_DEFINIDO`), nunca horário inventado.
- Permissões e RLS inalteradas (escrita só via RPC, `authenticated` + `service_role`).

Frontend:
- Novo `ConvocacaoMonthPlannerCalendar.tsx` (multi-cargo por célula, responsivo); `MonthGridCalendar` segue intacto para Folgas.
- `NovaConvocacaoPlanner.tsx` reescrito: estado indexado por id de necessidade (permite várias janelas por dia/cargo), horário geral no grupo, aplicação do horário geral só onde não houver ajuste manual, "Mais opções" recolhido (título/observação), rodapé fixo e painel de revisão.
- `useDpConvocacaoPreview`: somar fixos programados de `dp_escala_itens` em confirmados (aguardando continua separado), carregando o mês em lote, sem consultas por dia.
- Lógica pura em `src/lib/dp/convocacoes-planejamento.ts` (sugestão de vagas, precedência de horário, filtro de destinatários por cargo, janela ambígua) com testes unitários; tipos regenerados após a migração, sem `as any`.

Validação: build, testes, lint e typecheck reais, com números reportados e separação entre regressão nova e dívida existente. Concorrência e evidências visuais no fim.

Fora do escopo: desistência, substituição, no-show, Bloco 5/6.

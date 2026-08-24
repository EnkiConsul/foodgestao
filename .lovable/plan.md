# Convocações — Nova Convocação em tela única

Reescrever a criação de convocação: sem wizard, sem modalidade, sem turno, sem data inicial/final. O gestor escolhe unidade, cargos e trabalhadores, vê o calendário com a necessidade real do mês e clica nos dias. M1–M25 não são reabertas; nenhuma migration antiga é editada.

Aprovar este plano libera a implementação completa na sequência (frontend + migrations novas), sem outro planejamento.

## Tela única

Topo: **Unidade** (obrigatória) · **Cargos** (multisseleção) · **Colaboradores a convocar** (multisseleção com busca) · **Horário padrão da convocação** opcional `[Entrada] [Saída]` com o texto "Opcional. Se não informar, usaremos o horário cadastrado de cada colaborador."

Logo abaixo, sem "Próximo": calendário mensal. A competência é o mês exibido (`< Julho · Agosto 2026 · Setembro >`); trocar de mês com alterações não salvas pede confirmação e nunca apaga o planejamento silenciosamente.

"Mais opções" (colapsado): título, observação.

Barra fixa no rodapé: `3 dias · 2 cargos · 8 vagas · 6 trabalhadores` + [Salvar rascunho] [Revisar e publicar].

## Colaboradores a convocar

Lista apenas ativos da empresa, da unidade e dos cargos selecionados, com regime convocável. Cada linha:

```text
João Silva
Freelancer · Garçom
18:00 → 23:00
```

Jornada que muda por dia da semana mostra "Horário varia conforme o dia"; sem configuração, "Sem horário cadastrado" com estado de atenção. Turno não aparece em nenhum filtro.

## Calendário

Cada dia mostra os cargos selecionados com a necessidade real:

```text
12
Garçom     3/6 · faltam 3 · +2 aguardando
Cozinheiro 2/4 · faltam 2
```

Confirmados = fixos programados + convocações aceitas. Pendentes aparecem sempre à parte ("+2 aguardando") e nunca somam. Mínimo vem só de `dp_cobertura_minima`; sem mínimo aplicável mostra apenas "3 confirmados".

Muitos cargos: mostra os primeiros e "+2 cargos" com acesso ao detalhe — nada é escondido em silêncio. No mobile, indicador resumido na célula e detalhamento do dia logo abaixo. Será criado `ConvocacaoMonthPlannerCalendar.tsx` (o `MonthGridCalendar` atual só suporta um selo curto e segue intacto para os outros usos).

Clicar num dia cria uma necessidade para **cada** cargo selecionado, com vagas sugeridas por `faltam = max(mínimo − confirmados, 0)`; cobertura atendida mostra "Cobertura atendida" + [+ Convocar adicional]; sem mínimo, sugere 1. Vagas = 0 não persiste nem publica.

## Datas selecionadas

Seção abaixo do calendário, ordenada por data, um accordion por dia e um card por cargo:

```text
12/08 — GARÇOM
Confirmados: 3   Mínimo: 6   Faltam: 3
Convocar: [-] 3 [+]
8 selecionados · 6 elegíveis nesta data · 3 vagas
Horário da necessidade: 18:00 → 23:00        [Editar]
```

Expandir lista a prévia por pessoa: `Elegível`, `Indisponível`, `Horário incompatível`. Cada ocorrência usa só os selecionados cujo cargo bate com ela. [+ Adicionar outro horário] cria outra necessidade para a mesma data e cargo.

Editar permite override de horário por trabalhador naquela necessidade, sem afetar os outros trabalhadores, outros dias ou o cadastro.

## Horário

Precedência por trabalhador + ocorrência: (1) override do trabalhador na ocorrência; (2) horário geral da convocação; (3) jornada cadastrada aplicável àquela data (`dp_colaborador_config_trabalho` + configuração de dias + turnos — fonte atual, nada de cadastro novo); (4) sem horário → aquela oferta não publica e a tela diz "João Silva — horário não definido para 12/08".

Alterar o horário geral depois reaplica só onde não houver override manual. O horário geral é snapshot da convocação: não altera cadastro, jornada, turno nem `dp_turnos`.

**Janela da necessidade**: com horário geral, usa esse horário. Sem ele, é sugerida a partir dos colaboradores fixos do mesmo cargo/unidade naquele dia (escala e configuração de trabalho), pela janela mais frequente. Empate ou mais de uma janela relevante mostra "Encontramos mais de um horário habitual para este cargo" com escolha rápida. Sem fonte, mostra "Horário da necessidade não definido" + [Definir horário]: o planejamento continua, só aquela ocorrência não publica.

**Compatibilidade segue bloqueante**: só recebe a oferta quem cobre integralmente a janela ("João — horário não cobre toda a necessidade"). Nada de parcial.

## Vagas, destinatários e modalidade

Selecionados, elegíveis e vagas são conceitos distintos e aparecem separados. 5 destinatários elegíveis com 3 vagas: os 5 recebem, os 3 primeiros aceites válidos ocupam, o resto encerra como `encerrada_sem_vaga` — a atomicidade atual é preservada. Um único destinatário mostra apenas "João Silva selecionado · 1 vaga"; modalidade nunca aparece na UI, permanece só como detalhe interno.

## Alterar filtros depois

Mudar unidade, cargos ou colaboradores não apaga datas, vagas, horários ou overrides. Itens que saíram do filtro ficam com aviso ("Este cargo não faz mais parte dos filtros atuais") e [Remover do planejamento] manual.

## Revisar e publicar

Drawer com resumo: datas, cargos, vagas, destinatários, horários e somente as exceções que existirem (incompatibilidades, antecedência curta, remuneração, trabalhadores sem horário). Antecedência curta não bloqueia: exige confirmação consciente e justificativa quando a regra da unidade determinar. O backend revalida tudo na publicação; o frontend é só seleção.

---

## Detalhes técnicos

**Migrations novas (nenhuma antiga alterada)**

- `dp_convocacao_destinatarios`: `id`, `company_id`, `grupo_id`, `ocorrencia_id` NULL, `colaborador_id`, `entrada`/`saida`/`intervalo_minutos`/`termina_no_dia_seguinte` NULL (override), `removido_em`, `removido_por`, `created_at`, `updated_at`, `created_by`. Modelo normalizado — nunca JSON nem lista de UUIDs em texto. GRANTs (`authenticated`, `service_role`) + RLS por empresa com a política de admin de DP já usada no módulo.
  - Índices parciais: UNIQUE `(grupo_id, colaborador_id) WHERE ocorrencia_id IS NULL AND removido_em IS NULL` e UNIQUE `(ocorrencia_id, colaborador_id) WHERE ocorrencia_id IS NOT NULL AND removido_em IS NULL`.
  - FKs tenant-safe compostas com `company_id` (grupo, ocorrência, colaborador) e garantia de que a ocorrência pertence ao grupo indicado; trigger só para o que a FK não cobre.
  - `ocorrencia_id IS NULL` = destinatário global do grupo; `NOT NULL` = override daquele destinatário naquela ocorrência. Condição efetiva = global + override.
  - Soft delete sempre (`removido_em`/`removido_por`); grupo publicado tem destinatários imutáveis.
- `dp_convocacao_grupos`: colunas incrementais opcionais `horario_geral_entrada`, `horario_geral_saida`, `horario_geral_intervalo_minutos`, `horario_geral_termina_no_dia_seguinte` (check: entrada e saída ambas nulas ou ambas preenchidas; intervalo >= 0) e `publico_modo` (`legacy_auto` para dados existentes, `selecionado` para grupos da nova tela; invisível na UI).
- `dp_convocacao_definir_destinatarios(p_grupo_id, p_colaboradores uuid[], p_expected_updated_at)`: auth obrigatório, company derivada do grupo, política de admin atual, grupo em rascunho, lock + concorrência otimista, validação de cada colaborador (company, ativo, unidade, regime convocável, cargo compatível), conjunto sem duplicatas, soft remove do que saiu, insere o novo, mantém iguais, idempotente, marca `publico_modo = 'selecionado'`, registra evento de auditoria e devolve o estado canônico + `updated_at`. Sem DELETE.
- `dp_convocacao_definir_override_destinatario(...)`: ocorrência + colaborador + horário, com as mesmas travas (rascunho, tenant, trabalhador no conjunto global ativo, ocorrência do grupo, horário válido, concorrência otimista, idempotência) e remoção lógica do override.
- `dp_convocacao_necessidade_sugerida(company_id, unidade_id, cargo_id, data)`: apura frequência das janelas realmente usadas pelos fixos (escala + configuração de trabalho + turnos) e devolve `{ sugerido: { entrada, saida, intervalo_minutos, termina_no_dia_seguinte, quantidade }, ambiguo, alternativas[] }`; sem horário → `sugerido = null`. Nada arbitrário.
- `dp_convocacao_publicar_grupo` (nova migration, função substituída por `CREATE OR REPLACE`): com `publico_modo = 'selecionado'`, o conjunto inicial de candidatos vem **exclusivamente** dos destinatários globais ativos, e depois passa por cargo, unidade, regime, disponibilidade, conflito, Option A, compatibilidade e remuneração como hoje. **Fail closed P0**: nenhum destinatário global ativo → `PUBLICATION_NO_RECIPIENTS`, nunca fallback para todos os elegíveis. `legacy_auto` mantém o comportamento atual. Zero elegíveis na ocorrência → `PUBLICATION_NO_ELIGIBLE`. Horário efetivo por candidato: override → horário geral do grupo → jornada autoritativa da data, materializado nos campos de snapshot já existentes (`inicio_previsto`, `fim_previsto`, timezone, intervalo, virada de dia, remuneração).

**Frontend**

- `NovaConvocacaoWizard.tsx` substituído por `NovaConvocacaoPlanner.tsx` (mesma rota/entrada em `DpConvocacoes.tsx`): tela única, sem passos, sem seletor de modalidade, sem período.
- Novo `ConvocacaoMonthPlannerCalendar.tsx` (multi-cargo, "+N cargos", responsivo) e nova seção "Datas selecionadas" com cards por cargo; `DiaDetalheSheet` evolui para os overrides por trabalhador.
- `convocacoes-planejamento.ts`: funções puras para precedência de horário, sugestão de vagas, agrupamento data×cargo, prévia por pessoa e detecção de itens fora dos filtros — cobertas por testes em `src/lib/dp/__tests__`.
- `useDpConvocacaoGrupos`: mutations para destinatários, overrides e horário geral, integradas ao rascunho e à publicação.
- `useDpConvocacaoPreview`: passa a expor jornada por trabalhador/data, confirmados (fixos programados + aceitas), pendentes e mínimo por data×cargo, além da janela sugerida.

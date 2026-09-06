# Convocação: dias selecionados com horário já preenchido e aprendizado do histórico

## O que muda para o gestor

Hoje, ao montar uma convocação, cada dia escolhido no calendário precisa ser aberto em um painel lateral para ver e ajustar o horário.

Passa a funcionar assim:

1. O gestor marca os dias no calendário (como hoje).
2. Logo abaixo do calendário, cada dia marcado aparece em uma linha já com **entrada e saída preenchidas** com o horário padrão daquele cargo, naquela unidade, naquele dia da semana (ex.: Atendente em 06/09 → 16:30–00:35, marcado como "termina no dia seguinte").
3. O gestor só edita o que quiser: entrada, saída, "+1 dia" e vagas ficam editáveis ali mesmo, sem abrir painel.
4. Cada linha mostra de onde veio o horário: "Usado nas convocações anteriores", "Horário mais usado pela equipe fixa", "Horário padrão da convocação" ou "Ajustado por você".
5. Um botão "Aplicar a todos os dias" copia o horário de uma linha para os outros dias do mesmo cargo.
6. O painel lateral continua existindo, agora só para o que é detalhe fino: horário individual por pessoa naquele dia.

## O sistema aprende com as convocações

O pré-preenchimento passa a olhar também o que já foi convocado antes:

- Prioridade 1: horário mais repetido nas convocações **publicadas** desse cargo/unidade, no mesmo dia da semana, nos últimos meses. É o que o gestor de fato costuma usar — inclusive quando ele ajustou o horário na mão.
- Prioridade 2: horário mais praticado pela equipe fixa no dia (comportamento atual).
- Prioridade 3: nada encontrado → a linha aparece como "sem horário de referência — informe" e o dia não é gravado até ser preenchido.

Ou seja, cada vez que o gestor publica uma convocação com um horário ajustado, a próxima convocação daquele cargo já nasce com aquele horário. Ajustes recentes pesam mais que os antigos.

## Detalhes técnicos

Banco (nova migration, a partir da numeração atual — nenhuma migration antiga é alterada):

- Atualizar `public.dp_convocacao_necessidade_sugerida` (mesma assinatura) para montar as janelas candidatas em duas fontes com precedência:
  1. `dp_convocacao_ocorrencias` com `status IN ('publicada','preenchida','encerrada_operacionalmente','apurada','revisada')`, mesmo `company_id`/`cargo_id`, `unidade_id` quando informado, `EXTRACT(DOW FROM data) = EXTRACT(DOW FROM _data)`, `data < _data` e dentro de uma janela recente (últimos 120 dias). Agrupar por `necessidade_entrada`, `necessidade_saida`, `COALESCE(intervalo_minutos,0)`, `necessidade_termina_no_dia_seguinte`, com peso decrescente por recência (mais recente pesa mais) e desempate pela `data` máxima.
  2. Se a fonte 1 não retornar nada, manter exatamente a lógica atual (escala do dia + configuração de trabalho dos fixos).
- Devolver no JSON, além de `sugerido`/`ambiguo`/`alternativas`, um campo `fonte` com `'historico_convocacoes'` ou `'equipe_fixa'`, para a tela mostrar a origem.
- Manter `SECURITY DEFINER`, checagem `private.is_company_admin_or_owner` e os grants existentes (`authenticated`); nada de acesso `anon`.

Frontend:

- `src/hooks/useDpConvocacaoGrupos.tsx`: tipar `fonte` no retorno de `buscarNecessidadeSugerida` (sem `as any`).
- `src/components/dp/convocacoes/NovaConvocacaoPlanner.tsx`: extrair a lista de dias selecionados para um componente novo `src/components/dp/convocacoes/DiasSelecionadosLista.tsx`, recebendo os dias do cargo ativo, `cobertura(data, cargoId)`, `onPatch`, `onRemover`, `onAbrirIndividuais`. Campos `type="time"` para entrada/saída, checkbox de "+1 dia" e input de vagas, reaproveitando `patchDia` (que já marca `origem: "manual"`).
- `DiaPlanejado.origem` passa a aceitar `"historico"` além de `"sugerida" | "geral" | "manual"`, alimentando o rótulo da linha; quando `ambiguo`, exibir "mais de um horário praticado" na própria linha em vez de depender só do toast.
- Cache local `Map<"cargo|data", sugestão>` no componente e resolução em paralelo quando vários dias são marcados, para a linha nascer preenchida sem reconsultar.
- Painel lateral (`Sheet`) reduzido aos horários individuais por pessoa; entrada/saída/vagas saem de lá para não haver dois lugares editando o mesmo dado.
- Persistência, validação (`diasCompletos`, `janelaMinutos`), antecedência, revisão e publicação seguem inalteradas.

Testes e verificação:

- Teste de banco em `supabase/tests/` dentro de `BEGIN; … ROLLBACK;`: histórico de convocação publicada vence a configuração dos fixos; sem histórico cai na equipe fixa; ocorrência cancelada não influencia; empate marca `ambiguo`.
- Teste unitário do rótulo/precedência de origem em `src/lib/dp/__tests__`.
- `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx eslint`, `bunx vitest run src/lib/dp/__tests__` e conferência no navegador em `/dp/convocacoes` → "Nova convocação" com Atendente em 06/09.

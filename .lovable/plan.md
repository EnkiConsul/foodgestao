# Turnos: categorias sob controle da empresa + Funcionamento na Unidade

## O que muda

### 1. Categorias de turno editáveis, excluíveis e criáveis
Hoje existem 7 categorias fixas ("Abertura", "Almoço", "Jantar", ...) e o diálogo mostra o nome fixo como título e, abaixo, um campo com o mesmo nome — daí a duplicidade confusa. Passa a ser uma lista única, por empresa:

- Uma linha por categoria: **um único campo de nome editável** + botão de excluir. Sem o título repetido.
- Botão **"Nova categoria"** para criar categorias próprias (ex.: "Rodízio", "Eventos").
- Reordenar por arrastar (define a ordem no seletor do turno).
- Excluir categoria **em uso**: o sistema mostra quantos turnos usam e pede para escolher a categoria de destino; ao confirmar, os turnos são migrados e a categoria é removida.
- Excluir categoria **sem uso**: confirmação simples.
- Botão "Restaurar padrão" volta às 7 sugeridas.
- O seletor de categoria no formulário de turno e os selos nos cartões passam a listar exatamente as categorias da empresa (nome e ordem definidos por ela).

### 2. Aba "Funcionamento" sai de Turnos
O horário de funcionamento é o horário da loja (quando abre/fecha), não jornada de trabalho — por isso fica melhor no cadastro da unidade.

- A aba desaparece da tela de Turnos; a tela fica só com a lista de turnos (sem barra de abas).
- O editor de horário de funcionamento passa a ser uma seção do cadastro de Unidades, sempre no contexto da unidade que está sendo editada (sem seletor de unidade solto).
- Vale também para a unidade criada a partir do cadastro de colaboradores: é o mesmo diálogo de unidade. Como o horário precisa da unidade já existente, a seção fica visível logo após salvar a unidade nova, dentro do mesmo diálogo, com o aviso "salve a unidade para definir o horário" antes disso.
- Nenhum dado é perdido: os horários já salvos continuam e aparecem na unidade correspondente.

### 3. Mais de um período de funcionamento por dia
Hoje cada dia da semana aceita **um único** intervalo abre/fecha (é uma linha por unidade+dia). O caso da Pakerê tem dois períodos no mesmo dia, com horários diferentes por faixa de dias:

```text
Período "Almoço"  — Seg a Sex: 08:30 → 18:30
Período "Jantar"  — Seg a Qui: 17:00 → 00:35 (+1)
                  — Sex a Dom: 16:30 → 00:35 (+1)
```

Como fica na tela: por dia da semana é possível **adicionar quantos períodos precisar** (botão "Adicionar período"), cada um com nome opcional (Almoço, Jantar), abre, fecha e virada de dia detectada automaticamente. Domingo fica só com o período Jantar; sábado idem; segunda a quinta ficam com Almoço + Jantar.

Para não repetir o preenchimento dia a dia:
- Cada período tem a ação **"Aplicar em outros dias"**, onde se marcam os dias que recebem aquele mesmo intervalo (ex.: criar o Jantar 17:00–00:35 e aplicar em Seg–Qui; criar 16:30–00:35 e aplicar em Sex–Dom).
- O resumo do dia mostra todos os períodos ("08:30–18:30 · 17:00–00:35 (+1)").

Períodos que se sobrepõem no mesmo dia são permitidos (é comum a cozinha do jantar abrir antes de o almoço fechar), apenas com um aviso visual — não bloqueia o salvamento.



## Detalhes técnicos

- `dp_config_dp.turno_categoria_labels` (JSON, linha da empresa com `unidade_id` nulo) passa a guardar a lista completa: `[{ codigo, nome, ordem }]`. Leitura retrocompatível com o formato atual `{ codigo: nome }`; categorias novas ganham código `custom_<slug>`. `dp_turnos.categoria` já é `text`, então não há migração de schema.
- `src/lib/dp/turno-utils.ts`: `categoriasTurno`/`categoriaLabel` passam a operar sobre a lista da empresa, com fallback nas 7 padrão; helpers puros para normalizar/serializar a lista + testes unitários.
- `src/hooks/useTurnoCategoriaLabels.tsx`: renomeado conceitualmente para gerir a lista (salvar lista, excluir, migrar). A migração usa um `update` em `dp_turnos` (`categoria` antiga → nova) no escopo da empresa, seguido do salvamento da lista.
- `src/components/dp/TurnoCategoriaLabelsDialog.tsx`: reescrito como gerenciador de lista (campo único por linha, excluir, adicionar, reordenar, diálogo de migração).
- `src/components/dp/TurnoForm.tsx` e `TurnoCard.tsx`: consomem a lista da empresa.
- `src/pages/dp/cadastros/DpTurnos.tsx`: remove `Tabs`, o estado `unidadeFuncionamento` e o import do editor de funcionamento.
- `src/components/dp/UnidadeFormDialog.tsx`: passa a incluir `HorarioFuncionamentoEditor` para a unidade em edição (apenas em unidade já salva; em nova unidade a seção aparece após salvar).
- `turnoForaDoFuncionamento` continua existindo como utilitário, sem mudança de comportamento nesta entrega.

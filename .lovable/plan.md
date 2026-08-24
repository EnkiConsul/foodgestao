# Nova Convocação — seleção direta de trabalhadores

Reescrever a criação de convocação: sem modalidade, sem turno, sem etapas de datas. O gestor escolhe unidade, cargos e os trabalhadores, vê o calendário na hora e clica nos dias.

## Tela única

Bloco de filtros no topo:

1. **Unidade** (obrigatória)
2. **Cargos** (um ou mais)
3. **Colaboradores a convocar** — multisseleção com busca
4. **Horário padrão da convocação** — opcional: `[Entrada] [Saída]` com o texto "Opcional. Se não informar, usaremos o horário cadastrado de cada colaborador."

Logo abaixo, sem passo intermediário: **calendário mensal** (competência = mês exibido). Nada de data inicial/final, nada de escolher modalidade (Individual/Aberta/Grupo/Turno desaparecem da tela).

## Colaboradores a convocar

- Lista somente ativos da empresa + unidade + cargos selecionados, com regime convocável (intermitente e freelancer, seguindo a regra do backend).
- Cada linha mostra: nome, `Regime · Cargo` e o horário cadastrado do dia típico, ex.:

```text
João Silva
Freelancer · Garçom
18:00 → 23:00
```

- Trabalhador sem horário cadastrado aparece marcado como "sem horário cadastrado".
- Trocar cargos/unidade filtra a lista, mas **não** apaga datas, vagas nem horários já ajustados.

## Calendário

Continua mostrando a necessidade real da operação por cargo (independente de quem foi selecionado):

```text
12
Garçom     3/6 confirmados · faltam 3 · +2 aguardando
Cozinheiro 2/4 confirmados · faltam 2
```

Clique no dia cria/remove a necessidade daquele dia para os cargos selecionados. As vagas já entram sugeridas pelo que falta (`faltam 3` → 3 vagas).

## Abaixo do calendário

Para cada dia escolhido, um cartão por cargo:

```text
12/08 — GARÇOM
Confirmados: 3   Mínimo: 6   Faltam: 3
Convocar: [-] 3 [+]
Colaboradores: João Silva, Maria Souza, Pedro Santos
Horários:  João 18:00 → 23:00 · Maria 17:00 → 23:00 · Pedro 19:00 → 00:00
[Editar]
```

Editar é opcional (override por dia/cargo, e por trabalhador quando necessário). Um único trabalhador selecionado não muda a linguagem da tela: mostra "João Silva selecionado · 1 vaga" — nenhuma modalidade técnica aparece.

## Horário: precedência

1. override do trabalhador naquela data;
2. horário geral informado nesta convocação;
3. jornada cadastrada do trabalhador (`dp_colaborador_config_trabalho` + configuração de dias — fonte autoritativa atual, nada de cadastro novo);
4. sem horário resolvido → aquela oferta não publica e a tela nomeia o trabalhador que precisa de horário.

O horário geral é apenas snapshot/override da convocação: não altera jornada, turno nem cadastro.

**Janela da necessidade** (usada nos selos e no registro), quando o gestor não informa horário geral: derivada do horário dos colaboradores fixos do mesmo cargo naquela unidade e dia da semana (horário mais frequente entre eles). Se não houver colaborador fixo com horário nesse dia, o cartão pede o horário geral antes de publicar.

**Compatibilidade permanece bloqueante** (decisão aprovada): quem não cobre integralmente a janela da necessidade não recebe a oferta e aparece na prévia com o motivo.

## Vagas x destinatários

Selecionados e vagas são conceitos distintos: 5 selecionados com 3 vagas → os 5 recebem a oferta, os 3 primeiros aceites válidos ocupam, os pendentes restantes encerram como `encerrada_sem_vaga`. A atomicidade atual do aceite é preservada.

## Publicação

O backend continua autoritativo e revalida por trabalhador/data: empresa, unidade, regime convocável, cargo, disponibilidade, conflitos, Option A, jornada, compatibilidade, remuneração e as demais regras já implementadas. O frontend é só experiência de seleção.

---

## Detalhes técnicos

**Banco**
- Nova tabela `dp_convocacao_destinatarios` (`grupo_id`, `ocorrencia_id` nulo = vale para todo o grupo, `colaborador_id`, `entrada`/`saida`/`intervalo_minutos`/`termina_no_dia_seguinte` opcionais como override, `company_id`, timestamps) com GRANTs, RLS por empresa/admin de DP e unicidade por (grupo, ocorrência, colaborador).
- `dp_convocacao_grupos`: colunas opcionais `horario_geral_entrada`, `horario_geral_saida`, `horario_geral_intervalo_minutos`, `horario_geral_termina_no_dia_seguinte`.
- RPC nova `dp_convocacao_definir_destinatarios(grupo_id, colaboradores[], expected_updated_at)` — substituição idempotente do conjunto, sem DELETE físico de ofertas já publicadas.
- `dp_convocacao_publicar_grupo`: no ramo não-individual, o loop de candidatos passa a ler `dp_convocacao_destinatarios` do grupo/ocorrência quando existirem linhas (fallback ao comportamento atual quando não houver), aplicando `dp_convocacao_avaliar_candidato` por trabalhador como hoje. Um único destinatário continua sendo tratado internamente como oferta de 1 vaga.
- Helper `dp_convocacao_necessidade_sugerida(company_id, unidade_id, cargo_id, data)` devolvendo o horário mais frequente dos colaboradores fixos do cargo/unidade naquele dia da semana.
- `modalidade` do grupo passa a ser derivada internamente (nunca perguntada na UI): 1 destinatário → `individual` com `colaborador_alvo_id`; vários → `aberta` restrita aos destinatários.

**Frontend**
- `NovaConvocacaoWizard.tsx` reescrito como formulário de página única (mantém o mesmo componente/rota e o fluxo de rascunho e publicação): remove os passos Grupo/Cargos/Datas/Detalhes/Revisar, remove o seletor de modalidade e o período início/fim.
- `MonthGridCalendar` reaproveitado sem mudança de contrato; selos por cargo somando confirmados/mínimo/aguardando via `useDpConvocacaoPreview`.
- `convocacoes-planejamento.ts`: funções puras novas para resolver o horário por trabalhador segundo a precedência, sugerir vagas pelo que falta e listar trabalhadores sem horário; cobertas por testes em `src/lib/dp/__tests__`.
- `useDpConvocacaoGrupos`: mutations para gravar destinatários e overrides junto do rascunho.
- `useDpConvocacaoPreview`: passa a expor a jornada típica por trabalhador para a lista de seleção.

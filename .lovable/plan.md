# Convocações — Fase 1: Diagnóstico (revisado e final)

Auditoria do que existe hoje no sistema, confirmada por leitura de banco e código. Nenhuma linha de código, migration, RLS ou tela foi alterada nesta fase.

## 1. Contexto e objetivo

Bares e restaurantes têm demanda variável. A equipe habitual (fixos CLT) cobre a base; picos, faltas e eventos são cobertos por **intermitentes** e **freelancers**. Hoje o gestor resolve isso por WhatsApp: não há registro do convite, do aceite, de quem ficou sem resposta, nem prova de antecedência.

Objetivo do módulo: transformar essa negociação informal em um fluxo registrado, auditável e operacionalmente conectado à escala, cobrindo:
- convocação **individual** (pessoa escolhida) e **aberta** (vaga oferecida a vários, primeiro que aceita ocupa);
- convocação **mensal** (várias datas em um mesmo envio, cada data com vida própria);
- **antecedência mínima** com alerta e registro de exceção, nunca bloqueio;
- **indisponibilidade** declarada pelo trabalhador antes de haver convite;
- **substituição** e **descumprimento** registrados, sem efeito financeiro automático;
- **cobertura mínima** como base para sugerir vagas e para avaliar folgas.

## 2. O que já existe e será reaproveitado

Confirmado no banco:

| Ativo | Situação |
|---|---|
| `dp_convocacoes` | Tabela existe, **0 linhas**. Campos de data, horário, carga, prazo de resposta, status, `escala_item_id`. |
| `dp_escala_itens` com `origem='convocacao'` | Enum já suporta, **0 linhas** com essa origem. |
| `dp_convocacao_guard` (trigger) | Valida regime e prazo de resposta. |
| `dp_convocacao_sync_escala` | Já cria/remove item de escala a partir da convocação. |
| `dp_cobertura_minima` | Tabela existe, **0 linhas** — mínimo nunca foi cadastrado. |
| `dp_trocas` + `useDpTrocas` | Matriz de permissão de troca por escopo, reutilizável para substituição. |
| `operacao-panorama.ts` | Motor de cobertura por dia/turno, base para "3/6 — faltam 3". |
| `dp_colaborador_config_trabalho` | 12 configurações vigentes, uma por colaborador (11 ativos). |
| `dp_folgas_validar_unificado` | Validação central de folgas, ponto de entrada para a regra de cobertura. |

## 3. Lacunas encontradas (o que falta)

1. **Sem entidade de vaga.** `dp_convocacoes` é uma oferta 1:1; não existe "vaga com N posições" nem agrupamento de um envio mensal. Sem isso, convocação aberta e mensal não são representáveis.
2. **Freelancer bloqueado.** `dp_convocacao_guard` levanta exceção para qualquer regime diferente de `intermitente` (comparação literal no código da função). Freelancer, que é caso de uso central, não pode ser convocado hoje.
3. **Sem antecedência.** Nenhum campo de antecedência, exceção, nem de quem confirmou o envio fora do prazo.
4. **Sem indisponibilidade.** Não existe forma do intermitente/freelancer dizer "não estarei disponível no dia 12" antes de receber convite.
5. **Sem encerramento por início da jornada.** Só há `prazo_resposta`; uma oferta cujo turno já começou continua "pendente".
6. **Sem controle de concorrência.** A resposta hoje é um UPDATE direto via policy `dp_convocacoes_respond_self` — em vaga aberta isso permite overbooking.
7. **Sem timeline.** Não há registro de quem publicou, quem confirmou exceção, quem substituiu, quem cancelou.
8. **Cobertura sem uso.** `dp_cobertura_minima` está vazia e não influencia folgas nem sugere vagas de convocação.
9. **Sem equipe habitual.** Não há como marcar que um intermitente/freelancer compõe a base de uma unidade — logo ele não entra na conta de disponíveis.
10. **Sem registro de descumprimento.** Desistência após aceite e ausência no dia não têm onde ser registradas nem classificadas.

## 4. Decisões conceituais fechadas

- **Confirmação ≠ capacidade.** Quem aceitou entra em "confirmados"; quem ainda não respondeu aparece em bloco separado e **nunca** é somado à cobertura.
- **Indisponibilidade é declaração prévia**, não pedido de folga: não passa por aprovação, não gera folga, e nunca é negada por déficit de cobertura.
- **Antecedência alerta, não bloqueia.** O gestor confirma consciente e o sistema registra a exceção com autor e horário.
- **Prazo de resposta nunca é encurtado pela urgência.** Se a jornada começa antes do prazo, a oferta encerra como "jornada iniciada", não como "sem resposta".
- **Descumprimento não movimenta dinheiro.** Para intermitente o sistema exibe a referência legal (50%) como informação; a decisão é humana e fica registrada. Freelancer registra sem multa.
- **Escala continua a fonte única da operação.** Aceite alimenta `dp_escala_itens`; Operação, Horário Previsto, Ponto e VA/VT não mudam de fonte.
- **Cobertura mínima passa a ter efeito na análise de folgas**, mas só onde estiver cadastrada; sem cadastro, o comportamento atual permanece idêntico.

## 5. Arquitetura proposta (visão de alto nível)

```text
Grupo (um envio: unidade + mês)
  └── Ocorrência (uma data + cargo + turno + N vagas)
        └── Oferta (uma pessoa) ──> aceite ──> item de escala

Apoio: indisponibilidade · configuração de regras · descumprimento · timeline de eventos
```

Estados, em resumo: a **oferta** vai de pendente para aceita, recusada, sem resposta, encerrada por vaga cheia, encerrada por início da jornada, cancelada ou substituída; **somente "aceita" ocupa vaga**. A ocorrência fecha quando os aceites atingem as vagas.

## 6. Riscos já mapeados

- **P0**: overbooking em vaga aberta se o aceite não for serializado no banco; freelancer bloqueado pelo guard atual; escrita direta por policy convivendo com a futura RPC.
- **P1**: `dp_escala_itens` tem UNIQUE (escala, colaborador, data) — duas ofertas aceitas no mesmo dia (almoço e jantar) não caberiam em dois itens; precisa de decisão explícita na Fase 2.
- **P1**: acrescentar cobertura à validação de folgas pode passar a bloquear folga que hoje é aceita.
- **P2**: custo do calendário mensal com muitos cargos; duas telas de configuração (Folgas e Convocações).

## 7. Faseamento

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Diagnóstico e decisões conceituais | **este documento** |
| 2 | Arquitetura alvo detalhada: tabelas, estados, RPCs, RLS, cobertura, UX desktop e mobile | próxima |
| 3 | Implementação de banco e backend (tabelas, funções, RPCs, RLS, job, testes) | depois |
| 4 | Telas do gestor e do portal | depois |
| 5 | Testes de ponta a ponta e regressão (Operação, Ponto, VA/VT, Folgas) | depois |

PARADO ao final da Fase 1. Aprovando este diagnóstico, avanço para a Fase 2 (arquitetura alvo), ainda sem implementar nada.

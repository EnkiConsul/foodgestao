# Disponibilidade de convocáveis — Etapas 6 e 7

Só restam estas duas etapas da disponibilidade de convocáveis, na ordem aprovada.

## Etapa 6 — Aba Planejamento em Convocações

Hoje o gestor tem as abas de convocações e o painel de disponibilidade, mas não uma visão consolidada do mês.

- Nova aba **Planejamento** em Convocações, com a visão por competência:
  - Calendário do mês por unidade: em cada dia, quantos convocáveis disponíveis, quantos já convocados (aceitos/aguardando), quantos avisaram indisponibilidade e quantos estão em conflito (aviso de ausência após convocação confirmada).
  - Lista por trabalhador: dias marcados como indisponível no mês, convocações em aberto e confirmadas, e avisos de possível ausência.
  - Alerta de dia descoberto: quando a quantidade de convocados + disponíveis ficar abaixo da cobertura mínima da unidade, o dia é destacado.
- Clicar no dia abre o planejador de convocação já filtrado para aquele dia.

## Etapa 7 — Lembretes automáticos

Quando o período de disponibilidade abre ou está prestes a fechar, hoje ninguém é avisado.

- Notificação aos convocáveis no dia em que o período abre: "Período aberto para informar indisponibilidade de <competência>".
- Notificação aos convocáveis que ainda não informaram nada pouco antes do fechamento, respeitando a antecedência configurada nas Regras.
- Notificação ao gestor no fechamento: "Período de disponibilidade de <competência> encerrado — X convocáveis informaram indisponibilidade".
- Execução: um agendamento diário no banco (uma checagem por dia) que avalia as regras de cada empresa/unidade e dispara só o que couber naquele dia — sem notificação duplicada.

## Detalhes técnicos

- Etapa 6: nova aba em `src/pages/dp/DpConvocacoes.tsx`; componente novo `src/components/dp/convocacoes/PlanejamentoPainel.tsx` consumindo `dp_indisponibilidades`, `dp_convocacoes` e `dp_colaboradores` por competência, reaproveitando `dp_disponibilidade_janela` e a cobertura mínima já existente.
- Etapa 7: função SQL `dp_disponibilidade_lembretes_dia()` (SECURITY DEFINER, `REVOKE ... FROM anon, PUBLIC`, grant para service_role) que avalia a janela resolvida por empresa/unidade e insere notificações idempotentes (chave por empresa+competência+tipo) em `dp_notificacoes`; agendamento diário via `pg_cron`. Novos valores no enum `dp_notificacao_tipo` somente se necessário (há tipos genéricos reutilizáveis).
- Sem novas tabelas; validação com build, lint e typecheck; nenhuma suíte de testes pesada.

Rollback: remover a aba e o agendamento; nenhum dado existente é apagado.

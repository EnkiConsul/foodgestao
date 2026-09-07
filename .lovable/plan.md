# Fase 5 — Conflito de disponibilidade com convocação já confirmada

Hoje, quando o trabalhador convocável tenta informar que não poderá trabalhar em um dia que já tem convocação confirmada, o sistema simplesmente recusa a marcação ("convocação confirmada neste dia"). Ofertas ainda pendentes são encerradas em silêncio, sem que a operação receba um aviso claro de risco.

A Fase 5 troca esse bloqueio por um caminho consciente: o trabalhador confirma que quer avisar, o registro nasce como conflito, e a operação vê o risco de ausência com antecedência.

## O que muda para quem usa

Portal do trabalhador:
- Ao marcar indisponibilidade num dia com convocação confirmada, aparece um aviso explicando que já existe compromisso naquele dia e que o aviso será enviado ao gestor como possível ausência. É preciso marcar a confirmação e escrever o motivo para prosseguir.
- Se o vínculo for intermitente, o aviso traz também a consequência legal: quem aceita a convocação e não comparece está sujeito a multa de 50% da remuneração que seria devida naquele dia, compensável em até 30 dias (CLT, art. 452-A, §4º). O trabalhador precisa marcar a ciência dessa condição; a ciência fica registrada com data e hora.
- Para freelancer (não intermitente) o texto não menciona multa.
- Sem essa confirmação, nada é gravado (comportamento atual preservado).

- O dia passa a mostrar o selo "Aviso enviado ao gestor" no calendário do portal.

Gestor:
- Nova notificação: "Trabalhador avisou que não poderá comparecer" com nome, dia e motivo.
- Na Rotina do dia, esse dia passa a exibir previsão de ausência para a pessoa, junto dos selos já existentes, com o botão "Cobrir" já disponível.
- A convocação confirmada não é cancelada automaticamente: continua válida até o gestor decidir (cobrir, cancelar ou manter). Assim o histórico e a apuração não são alterados sem decisão humana.

Ofertas ainda pendentes seguem sendo encerradas como já acontece hoje, sem mudança.

## Detalhes técnicos

Banco (uma migração aditiva):
- `dp_indisponibilidades`: novas colunas `conflito boolean not null default false`, `conflito_convocacao_id uuid references dp_convocacoes(id)`, `conflito_resolvido_em timestamptz`, `conflito_resolvido_por uuid`, `ciencia_multa_em timestamptz`.
- `dp_indisponibilidade_marcar(p_data, p_motivo, p_confirmar_conflito boolean default false, p_ciencia_multa boolean default false)`: nova sobrecarga/parâmetro. Quando existe convocação em `aceita`/`encerrada_operacionalmente`/com comparecimento:
  - `p_confirmar_conflito = false` → mantém a exceção atual `ACCEPTED_CALL_REQUIRES_REPLACEMENT`;
  - `true` e motivo informado → grava a indisponibilidade com `conflito = true` e `conflito_convocacao_id`, registra evento em `dp_convocacao_log_evento_trabalhador` (`indisponibilidade_conflito`), e insere notificação `para_admins` do novo tipo de enum `disponibilidade_conflito_convocacao`;
  - regime `intermitente` exige `p_ciencia_multa = true`, senão erro `CIENCIA_MULTA_OBRIGATORIA`; quando aceito, grava `ciencia_multa_em = now()` e inclui a ciência no evento de auditoria;
  - `true` sem motivo → erro `INVALID_INPUT`.

  - A convocação não muda de status.
- Reserva de folga (Fase 4) ignora registros com `conflito = true` para não reservar vaga em dia que já tem convocação confirmada.
- `REVOKE EXECUTE ... FROM anon, PUBLIC` e `GRANT EXECUTE ... TO authenticated, service_role`; RLS das novas colunas herdada da tabela.

Frontend:
- `src/hooks/useDpIndisponibilidades.tsx`: `marcar` aceita `confirmarConflito` e devolve `conflito` na resposta; novo estado `conflito` no mapa de dias.
- `src/components/dp/MinhaDisponibilidadeCard.tsx`: diálogo de confirmação com motivo obrigatório e selo do dia em conflito.
- `src/lib/dp/operacao-panorama.ts`: incluir previsão de ausência derivada de indisponibilidade em conflito (usa o mapeamento `previsao_falta` já existente).
- `src/pages/dp/DpOperacaoPanorama.tsx`: exibir o selo e o motivo informado.
- `src/hooks/useDpConvocacaoPreview.tsx`: sinalizar o dia em conflito ao planejar convocações.

Verificação: `npx vite build`, `npm run lint`, `npm run typecheck:strict`. Nenhuma suíte de teste nova ou execução de testes pesados.

Rollback: remover as colunas novas, restaurar a assinatura anterior da RPC; nenhum dado é apagado.

# Sócio não entra no controle legal de férias

## Situação atual

O sistema gerou períodos de férias para 2 sócios (4 períodos com saldo), do mesmo jeito que faz para quem é CLT. Por isso eles aparecem com saldo, prazo, selo de vencida e risco de pagamento em dobro — cobranças que não se aplicam a sócio, que não tem férias por lei.

## O que muda

- Sócio deixa de ter período de férias com saldo, prazo, selo de vencida/"a conceder" e alerta de risco de dobra.
- Sócio continua podendo registrar um período de descanso, que aparece na Rotina e no calendário como ausência do sócio (igual à folga de sócio de hoje).
- Sócio sai das contagens e dos indicadores de férias: saldo, a programar, vencendo em 30 dias, vencidos, solicitações pendentes e distribuição por unidade/cargo.
- Nas listas de férias, o registro de sócio aparece identificado como descanso de sócio, sem números de direito/saldo.
- Os 4 períodos já gerados para sócios ficam marcados como fora do controle legal (não são apagados; deixam de gerar saldo e alerta).

## Detalhes técnicos

- Geração de períodos (`dp_ferias_gerar_periodos` e o corte efetivo) passa a ignorar colaboradores cujo `vinculo_label` é sócio, usando a mesma regra de `isSocio` já existente em `contrato-policy.ts` (versão SQL equivalente).
- Ajuste de dados via `run_sql`: nos períodos de sócios existentes, zerar saldo/limite de cobrança e marcá-los como fora do controle (`controle_externo`), sem excluir histórico.
- `src/hooks/useDpFerias.tsx` e `src/hooks/dp/analytics/useAnalyticsFerias.tsx` filtram sócios dos KPIs e das distribuições; gozos de sócio continuam visíveis apenas como ausência.
- `src/lib/dp/ferias-direito.ts`: `nivelVencimentoPeriodo` e `riscoAcumulo*` recebem o flag de sócio e retornam `normal` / sem risco.
- `FeriasDashboard.tsx`, `DpFerias.tsx` e `FeriasGozosPanel.tsx` exibem a tag "Descanso de sócio" e omitem prazo/saldo nesses registros.
- Testes novos em `src/lib/dp/__tests__/ferias-direito.test.ts` (sócio nunca vencido, nunca em risco) e um teste de KPI ignorando sócio.
- Rollback: reverter a migração da geração e restaurar `controle_externo` dos períodos ajustados (lista de ids registrada antes da alteração).

## Fora de escopo

Folgas, jornada, escala, permissões, RLS e isolamento entre empresas seguem inalterados.

# Férias: novo selo "A conceder" para ciclos já encerrados

## O que foi verificado

Erildson Sousa Silva Júnior: admissão 01/10/2024. Existem dois períodos gravados:

- 01/10/2024 a 30/09/2025 — saldo 30 dias, prazo até 30/09/2026, situação "disponível"
- 01/10/2025 a 30/09/2026 — em aquisição

Hoje é 08/09/2026, então o primeiro ciclo aparece como "Atenção · 22d". Pela CLT ele só vence em 30/09/2026, por isso não recebe o selo "Vencido". Não há erro de cálculo — falta apenas uma sinalização para ciclos que já fecharam e ainda não foram gozados.

## O que será feito

1. Criar o selo **"A conceder"** na tela de Férias e no painel de férias, aplicado a todo período cujo ciclo de aquisição já terminou, que ainda tem saldo e que não está vencido nem em atenção. Esse selo fica visualmente destacado (âmbar suave), abaixo de "Atenção" e "Vencido" na ordem de urgência.
2. Tornar a sinalização **configurável por empresa**, nas configurações de Pessoas: opção "Sinalizar férias de ciclos já encerrados" com três alternativas:
   - Somente prazo legal (comportamento atual)
   - Selo "A conceder" (padrão para as empresas, já que foi o pedido)
   - Tratar como Vencido assim que o ciclo encerra
3. Aplicar a mesma regra nos contadores/indicadores de férias, para que o número de pendências acompanhe o selo escolhido.
4. Nada muda no cálculo de dias de direito, nas datas de corte, nos períodos já gravados nem nas regras de aprovação de férias.

## Detalhes técnicos

- `src/lib/dp/ferias-direito.ts`: novo nível `a_conceder` em `NivelVencimento`, função pura `nivelVencimentoPeriodo({ fimAquisitivo, limiteConcessivo, diasSaldo, hoje, politica })` que decide entre `vencido | atencao | a_conceder | planejamento | normal` conforme a política da empresa. `nivelVencimento(diasRestantes)` permanece para compatibilidade.
- Migração: nova coluna em `public.dp_config_dp` — `ferias_sinalizacao_ciclo_encerrado text not null default 'a_conceder'` com trigger de validação aceitando `legal | a_conceder | vencido` (sem CHECK dependente de dados). Mantém RLS e grants existentes.
- Consumo da config via o hook de configuração de DP já existente (`dp_config_dp` / `dp_config_resolvida`), com fallback `a_conceder` quando ausente.
- Telas afetadas: `src/pages/dp/DpFerias.tsx` (badge e filtros de situação), `src/components/dp/ferias/FeriasDashboard.tsx` (cards e texto do prazo) e a tela de configurações de Pessoas onde ficam as regras de férias.
- Testes: casos em `src/lib/dp/__tests__/ferias-direito.test.ts` cobrindo as três políticas, ciclo encerrado com e sem saldo, ciclo em aquisição, prazo vencido e o cenário real do Erildson (fim 30/09/2025, limite 30/09/2026, hoje 08/09/2026 → "A conceder" na política padrão).
- Verificação: typecheck, suíte DP e conferência visual da tela de Férias em celular e computador.

## Rollback

Reverter os arquivos citados e definir a configuração da empresa como "Somente prazo legal" restaura o comportamento atual sem perda de dados.

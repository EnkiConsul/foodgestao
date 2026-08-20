# Vale-alimentação: dia de pagamento, data de corte e calculadora mensal

## 1. Como o cálculo vai funcionar

Hoje o VA é só valor por dia × dias-base fixos (padrão 22), sem dia de pagamento e sem acerto do mês anterior.

Passa a ser um cálculo em três partes, para cada colaborador:

```text
A) Dias previstos do próximo período   (dias de trabalho na escala/jornada)
B) Dias pagos e não trabalhados no período anterior  (falta, folga extra, atestado, férias — conforme o que a empresa marcar como descontável)
Valor a depositar = (A - B) x valor do dia
```

Período de apuração (data de corte): o VA pago no dia 25 cobre o mês seguinte. O corte é o dia anterior ao dia de pagamento; ou seja, com pagamento no dia 25:
- período coberto pelo depósito: 25/mês atual a 24/mês seguinte;
- período conferido para descontos: 25/mês anterior a 24/mês atual.

O sistema mostra as duas datas na tela para o gestor confirmar, e permite ajustar manualmente a quantidade de dias com justificativa.

Fontes dos dias:
- previstos: escala do mês publicada quando existir; senão a configuração de trabalho (dias marcados como trabalhados na semana);
- descontos: faltas apuradas no ponto, folgas do tipo extra, licenças/atestados e férias — cada um só entra se estiver marcado como descontável na regra do benefício.

## 2. Atalho na tela do colaborador

No bloco Vale-alimentação da aba Remuneração:
- campo **Dia do pagamento** (1 a 31) com aviso do período coberto ("pago dia 25 → cobre 25/08 a 24/09");
- switches **Desconta em**: falta, folga extra, atestado/licença, férias (com opção "todos");
- os valores começam herdados do padrão da empresa; quando o colaborador diverge do padrão aparece o banner âmbar já usado nos outros campos;
- atalho "Definir padrão da empresa" abrindo a configuração do benefício, no mesmo estilo do atalho do teto do salário-família.

## 3. Calculadora na tela de Benefícios

Nova aba **Calculadora de VA** em `/dp/beneficios`:
- seleção de mês de pagamento e unidade;
- tabela por colaborador: dias previstos, dias descontados (com detalhe por motivo ao expandir), valor do dia, bruto, desconto do colaborador, **valor a depositar**;
- totais no topo (colaboradores, dias, total a depositar) e exportação CSV para envio à operadora do cartão;
- edição pontual dos dias por colaborador com observação, sem alterar o cadastro;
- botão para gerar os lançamentos do VA na folha do período, reaproveitando a geração de benefícios já existente.

## Detalhes técnicos

Banco:
- `dp_beneficios`: `dia_pagamento` (int 1–31), `desconta_falta`, `desconta_folga_extra`, `desconta_atestado`, `desconta_ferias` (bool).
- `dp_colaboradores`: `vale_alimentacao_dia_pagamento` e os mesmos quatro booleanos, como override por colaborador (nulos = herda o padrão).
- `dp_config_dp`: `va_dia_pagamento` e flags de desconto como padrão da empresa.
- Nova tabela `dp_va_apuracoes` (company_id, colaborador_id, competência, dias_previstos, dias_descontados, detalhe jsonb, valor_dia, valor_depositar, observacao) com GRANTs e RLS por empresa, para guardar o fechamento mensal e permitir ajuste manual auditável.

Frontend:
- `src/lib/dp/va-calculo.ts`: funções puras `periodoVaDe(diaPagamento, competencia)`, `contarDiasPrevistos`, `contarDiasDescontaveis`, `calcularVaDeposito` + testes unitários.
- `src/lib/dp/beneficios-regras.ts`: passa a expor a regra de desconto por evento usada pela calculadora.
- `src/components/dp/RemuneracaoFields.tsx`: dia de pagamento, switches de desconto, prévia do período e comparação com o padrão.
- Novo `src/components/dp/beneficios/VaCalculadora.tsx` + hook `useDpVaCalculadora.tsx` (escala do mês, ponto do mês, folgas, férias) integrados em `src/pages/dp/DpBeneficios.tsx`.
- `ColaboradorFichaDialog.tsx`: mostra dia de pagamento e regras de desconto do VA.

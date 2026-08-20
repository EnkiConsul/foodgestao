# Vale-alimentação estruturado + ajustes no cadastro do colaborador

## Parte A — Cadastro do colaborador: acesso e desligamento dentro de Dados

1. **Acesso ao portal deixa de ser aba** — o painel de acesso (situação do login, CPF de acesso, gerar acesso, redefinir senha, senha temporária e carência após desligamento) passa a ser um bloco no fim da aba **Dados**, logo abaixo do perfil de acesso.
2. **Desligamento deixa de ser aba** — o bloco de desligamento (data da demissão, motivo, elegibilidade para recontratação, observações, prévia do impacto e os botões Registrar/Editar desligamento e Reintegrar) também vai para a aba **Dados**, como último bloco, com destaque visual de área sensível.
3. **Cabeçalho do cadastro** — sai o menu de três pontos; fica apenas o botão de **lixeira** (excluir cadastro) com a confirmação atual.

As abas passam a ser: Dados · Horário de Trabalho · Remuneração · Dependentes · Documentos.

Os atalhos da lista de colaboradores ("Acesso ao portal", "Desligar", "Reintegrar") continuam funcionando: abrem o cadastro na aba Dados e rolam até o bloco correspondente.

## Parte B — Vale-alimentação: dia de pagamento, data de corte e cálculo

Hoje o VA é só valor por dia × dias-base fixos (padrão 22), sem dia de pagamento e sem acerto do mês anterior.

Passa a ser um cálculo em três partes, por colaborador:

```text
A) Dias previstos do próximo período   (dias de trabalho na escala/jornada)
B) Dias pagos e não trabalhados no período anterior  (falta, folga extra, atestado, férias — conforme o que a empresa marcar como descontável)
Valor a depositar = (A - B) x valor do dia
```

Data de corte: a apuração fecha **alguns dias antes do pagamento** (padrão 5 dias, configurável), para a empresa se organizar financeiramente. Com pagamento no dia 25 e corte de 5 dias:
- corte (fechamento do cálculo): dia 20;
- período conferido para descontos: 21/mês anterior a 20/mês atual;
- período coberto pelo depósito: 21/mês atual a 20/mês seguinte.

O sistema mostra as três datas para o gestor confirmar, avisa quando o corte está próximo e permite ajustar manualmente a quantidade de dias com justificativa.

Fontes dos dias:
- previstos: escala do mês publicada quando existir; senão a configuração de trabalho (dias marcados como trabalhados na semana). Já saem da conta as **folgas dominicais e folgas extras marcadas pelo colaborador no calendário de folgas** (aprovadas ou pendentes, sinalizando as pendentes) — não se paga VA em dia que já se sabe que não haverá trabalho;
- descontos do período anterior: faltas apuradas no ponto, folgas extras concedidas após o pagamento, licenças/atestados e férias — cada um só entra se estiver marcado como descontável na regra do benefício.


## Parte C — Atalho na aba Remuneração do colaborador

No bloco Vale-alimentação:
- campos **Dia do pagamento** (1 a 31) e **Dias de antecedência do corte** (padrão 5), com aviso do período ("pago dia 25, corte dia 20 → cobre 21/08 a 20/09");
- switches **Desconta em**: falta, folga extra, atestado/licença, férias (com opção "todos");
- valores herdados do padrão da empresa; quando o colaborador diverge do padrão aparece o banner âmbar já usado nos outros campos;
- atalho "Definir padrão da empresa" abrindo a configuração do benefício, no mesmo estilo do atalho do teto do salário-família.

## Parte D — Calculadora de VA na tela de Benefícios

Nova aba **Calculadora de VA** em `/dp/beneficios`:
- seleção de mês de pagamento e unidade;
- tabela por colaborador: dias previstos, dias descontados (detalhe por motivo ao expandir), valor do dia, bruto, desconto do colaborador, **valor a depositar**;
- totais no topo (colaboradores, dias, total a depositar) e exportação CSV para a operadora do cartão;
- edição pontual dos dias por colaborador com observação, sem alterar o cadastro;
- botão para gerar os lançamentos do VA na folha do período, reaproveitando a geração de benefícios existente.

## Detalhes técnicos

Banco:
- `dp_beneficios`: `dia_pagamento` (int 1–31), `dias_antecedencia_corte` (int, default 5), `desconta_falta`, `desconta_folga_extra`, `desconta_atestado`, `desconta_ferias` (bool).
- `dp_colaboradores`: `vale_alimentacao_dia_pagamento`, `vale_alimentacao_dias_corte` e os mesmos quatro booleanos como override por colaborador (nulos = herda o padrão).
- `dp_config_dp`: `va_dia_pagamento`, `va_dias_corte` e flags de desconto como padrão da empresa.
- Nova tabela `dp_va_apuracoes` (company_id, colaborador_id, competência, dias_previstos, dias_descontados, detalhe jsonb, valor_dia, valor_depositar, observacao) com GRANTs e RLS por empresa, para guardar o fechamento mensal e permitir ajuste manual auditável.

Frontend:
- `ColaboradorFormDialog.tsx`: remover os `TabsTrigger`/`TabsContent` de `acesso` e `desligamento`; renderizar `ColaboradorAcessoPanel` e `ColaboradorDesligamentoPanel` dentro do `TabsContent value="dados"`; trocar o `DropdownMenu` do cabeçalho por um único `Button` com ícone `Trash2` (aria-label "Excluir cadastro"). `initialTab` aceita `"acesso"`/`"desligamento"` mapeando para a aba `dados` + `scrollIntoView` nas âncoras `#acesso-portal` e `#desligamento`; o indicador de pendência de desligamento migra para o `TabsTrigger` de Dados.
- `src/lib/dp/va-calculo.ts`: funções puras `periodoVaDe(diaPagamento, competencia)`, `contarDiasPrevistos`, `contarDiasDescontaveis`, `calcularVaDeposito` + testes unitários.
- `src/lib/dp/beneficios-regras.ts`: expõe a regra de desconto por evento usada pela calculadora.
- `src/components/dp/RemuneracaoFields.tsx`: dia de pagamento, switches de desconto, prévia do período e comparação com o padrão.
- Novo `src/components/dp/beneficios/VaCalculadora.tsx` + hook `useDpVaCalculadora.tsx` (escala do mês, ponto do mês, folgas, férias) integrados em `src/pages/dp/DpBeneficios.tsx`.
- `ColaboradorFichaDialog.tsx`: mostra dia de pagamento e regras de desconto do VA.

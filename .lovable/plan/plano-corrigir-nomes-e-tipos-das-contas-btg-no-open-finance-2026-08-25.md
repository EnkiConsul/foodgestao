# Plano: corrigir nomes e tipos das contas BTG no Open Finance

## Diagnóstico confirmado

As duas contas locais do BTG estão aparecendo com o mesmo nome porque o sistema salva e exibe o nome recebido do conector de Open Finance como título principal da conta.

Nos dados atuais da empresa, as duas contas locais estão assim:

- Conta `00228339-4`, agência `0001`, saldo `R$ 44,79`, nome salvo: `BTG Investimentos`, tipo salvo: `corrente`.
- Conta `00454363-9`, agência `0001`, saldo `R$ 0,00`, nome salvo: `BTG Investimentos`, tipo salvo: `corrente`.

Também existe um registro de Open Finance mais recente para a conta `00228339-4` com nome original `BTG Banking`, mas ele foi vinculado à conta local que já estava salva como `BTG Investimentos`. Como a rotina atual não sobrescreve o nome local nem diferencia completamente por agência, o nome antigo continuou aparecendo.

Além disso, o provedor retornou essas contas bancárias como `BANK / CHECKING_ACCOUNT`. Por isso o sistema classificou automaticamente como `corrente`, mesmo quando o nome comercial recebido contém `BTG Investimentos`.

## O que será corrigido

1. **Melhorar a identificação visual na listagem de Contas Bancárias**
   - Exibir o nome principal de forma mais clara, diferenciando `BTG Banking` e `BTG Investimentos` quando essa informação existir no Open Finance.
   - Manter agência, número e tipo visíveis para evitar confusão entre contas com nomes comerciais iguais.

2. **Ajustar a sincronização do Open Finance**
   - Ao sincronizar contas BTG, usar o nome mais específico recebido no registro mais recente.
   - Não deixar uma conta corrente continuar com nome antigo de investimento quando o conector já informou `BTG Banking`.
   - Considerar agência + número da conta na deduplicação, não apenas o número, para evitar vínculo incorreto quando houver contas parecidas.

3. **Corrigir a classificação de tipo**
   - Usar o subtipo técnico quando ele for confiável.
   - Para BTG, aplicar uma regra complementar: nomes como `BTG Investimentos` podem ser classificados como `Investimento`; nomes como `BTG Banking` permanecem como `Corrente`.
   - Essa regra será limitada para não afetar outros bancos indevidamente.

4. **Atualizar os registros atuais do BTG**
   - Corrigir os nomes e tipos já salvos para as duas contas existentes.
   - Preservar saldos, lançamentos, vínculos e histórico.

## Validação

Depois da correção, vou verificar que a tela de Contas Bancárias mostra as duas contas BTG distinguíveis por:

- Nome correto.
- Tipo correto: corrente/investimento.
- Agência.
- Número da conta.
- Saldo preservado.

## Detalhes técnicos

- Ajustar a função de sincronização de Open Finance que materializa contas bancárias locais.
- Revisar o helper de rótulos de contas para priorizar nome + agência + número quando houver nomes repetidos.
- Fazer uma atualização pontual dos dois registros BTG já existentes no banco, sem apagar ou recriar contas.

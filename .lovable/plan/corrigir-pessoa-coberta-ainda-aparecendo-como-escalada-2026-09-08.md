# Corrigir pessoa coberta ainda aparecendo como escalada

## Diagnóstico confirmado

- Em **08/09/2026**, Stefane Martins está registrada como folguista cobrindo Hanna Olinda Carvalho Silva.
- O vínculo da cobertura foi salvo corretamente, porém o motivo ficou vazio e não existe ocorrência de ausência para Hanna nesse dia.
- Hoje, a tela só retira a pessoa coberta de “Fixos Escalados” quando também encontra uma falta ou atestado. Assim, a cobertura isolada não altera a posição de Hanna.
- O formulário aparenta selecionar “Outro” quando o motivo está vazio, mas esse valor visual não é gravado se o usuário não interagir com o campo.

## Alteração proposta

1. **Usar a própria cobertura como fonte operacional**
   - Ao existir um folguista cobrindo um colaborador naquela data, retirar o colaborador coberto de “Fixos Escalados”, independentemente de haver falta, atestado ou motivo preenchido.
   - Manter o folguista contando normalmente na equipe do dia.
   - Preservar folgas, férias, atestados e demais registros reais já existentes, sem criar duplicidade nem alterar regras trabalhistas.

2. **Exibir claramente a situação da pessoa coberta**
   - Mover Hanna para “Fora da Operação” no dia, identificando que está coberta por Stefane.
   - Não classificar automaticamente como falta ou atestado quando o motivo não informar isso.

3. **Corrigir o formulário para novos registros**
   - Ao selecionar “Cobrindo quem”, preencher de fato o motivo padrão mostrado no campo, evitando novos registros com valor visual divergente do valor salvo.
   - Manter a escolha explícita entre Folga, Falta, Atestado e Outro.

4. **Cobrir regressões**
   - Testar cobertura sem motivo, com motivo “Outro”, por folga, falta e atestado.
   - Confirmar que a pessoa coberta não conta como trabalhando e que o folguista conta uma única vez.
   - Confirmar que registros antigos, como o da Stefane/Hanna, passam a ser interpretados corretamente sem edição manual.

## Limites

- Sem alterar escala publicada, jornada contratual ou histórico da colaboradora.
- Sem criar falta ou atestado quando isso não foi informado.
- Sem mudanças fora da tela Rotina e do cadastro de Mão de Obra Extra.

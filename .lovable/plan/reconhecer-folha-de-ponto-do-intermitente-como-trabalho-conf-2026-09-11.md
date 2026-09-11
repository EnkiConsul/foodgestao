# Reconhecer folha de ponto do intermitente como trabalho confirmado

## Objetivo
Não perguntar se o intermitente trabalhou em uma competência quando já existe uma folha de ponto importada para ele naquele mês.

## Alterações
- Considerar como evidência de trabalho qualquer folha de ponto importada e vinculada ao intermitente na mesma competência.
- Unificar essa evidência com as fontes já aceitas: marcações de ponto e confirmação manual do gestor.
- Remover automaticamente o alerta “Confirmar trabalho de intermitente” dessas competências.
- Usar a mesma regra na apuração diária das 03:00 e nas atualizações acionadas pelo gestor, evitando que o alerta reapareça depois.
- Preservar a pergunta quando não existir folha de ponto, marcação nem confirmação manual.
- Manter a resposta “Não trabalhou” como decisão explícita do gestor quando realmente não houver documento ou registro.

## Comportamento esperado
- Folha de ponto importada na competência: considera que trabalhou, não pede confirmação e aplica normalmente as demais pendências cabíveis.
- Marcação de ponto existente: continua considerando que trabalhou.
- Sem qualquer evidência: continua exibindo o alerta para o gestor confirmar.

## Validação
- Testar intermitente com folha importada e sem marcações individuais: nenhum alerta de confirmação.
- Testar intermitente sem folha e sem marcações: alerta permanece.
- Testar competências diferentes para garantir que uma folha só confirme o respectivo mês.
- Recalcular as pendências já existentes para retirar os alertas incorretos.
- Executar os testes direcionados e a verificação geral do sistema.

## Detalhes técnicos
Hoje a tela e a rotina materializada consultam apenas `dp_pontos` e a confirmação manual para determinar trabalho. A correção incluirá documentos do tipo `ponto`, vinculados por colaborador e competência, no mesmo critério de evidência, com atualização da rotina do banco e dos testes.

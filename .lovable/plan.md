# Corrigir a visualização mobile da Rotina

## Objetivo
Deixar a lista de pessoas da Rotina legível e fácil de usar no celular, sem alterar dados, regras da operação ou a apresentação no computador.

## Problema confirmado
Na lista por turno e setor, cada pessoa é renderizada em uma única linha horizontal. O bloco da direita — setor, ação “Alterar setor” e situação — não pode encolher; por isso ele espreme o nome e o horário, força quebras de uma palavra por linha e provoca sobreposição, como no registro de folguista com cobertura.

## Alterações
- No celular, transformar cada pessoa em um cartão/linha vertical:
  - nome em destaque, ocupando a largura disponível;
  - horário completo em uma linha própria, sem quebra palavra por palavra;
  - setor e situação em uma faixa inferior que permita quebra organizada;
  - ação “Alterar setor” claramente separada, com área confortável para toque.
- Permitir que situações longas, como “Folguista · Cobrindo …”, quebrem dentro do próprio cartão sem invadir os demais elementos.
- Aplicar o mesmo padrão à seção “Mão de Obra Extra” e às listas auxiliares abertas pelos indicadores, para que o defeito não reapareça em outra parte da Rotina.
- Reduzir somente no celular os espaços internos que hoje consomem largura útil; preservar divisões por turno/setor e toda a hierarquia existente.
- Manter o layout horizontal atual a partir do tablet/computador.

## Validação
- Conferir a Rotina em 360, 390 e 407 px com pessoas fixas, folguistas extras, cobertura com nome longo, horários atravessando meia-noite e setor alterável.
- Confirmar que nomes, horários, setor, situação e ações não se sobrepõem nem criam rolagem lateral.
- Confirmar que “Alterar setor”, editar e remover continuam acessíveis por toque.
- Conferir a mesma tela no computador para garantir que o layout atual não mudou.
- Executar as verificações de código e os testes da área da Rotina.

## Detalhes técnicos
- Ajustar as linhas de pessoas em `DetalheDiaOperacao`, dentro de `src/pages/dp/DpOperacaoPanorama.tsx`, usando empilhamento no mobile e `sm:flex-row` no desktop.
- Remover a combinação mobile problemática de conteúdo principal comprimível com bloco de ações `shrink-0`; usar `min-w-0`, `flex-wrap`, largura disponível e quebra segura nos badges longos.
- Repetir o tratamento responsivo nas listas de mão de obra extra e nos diálogos de categoria/avulsos que compartilham a mesma estrutura horizontal.
- Nenhuma alteração em banco de dados, cálculos, permissões, categorias ou regras operacionais.

Vou ajustar a importação de extrato para tratar duplicatas de forma explícita e confiável.

Plano:
1. Adicionar um estado de decisão para duplicatas: ainda não perguntado, não importar, ou importar duplicadas.
2. Após ler o extrato, se houver lançamentos já importados, abrir um diálogo perguntando claramente:
   - Não importar duplicados
   - Importar duplicados também
3. Se escolher “Não importar duplicados”, manter duplicatas desmarcadas.
4. Se escolher “Importar duplicados também”, marcar duplicatas para importação e gerar um novo identificador de importação para elas, evitando bloqueio por duplicidade no banco.
5. Ajustar o botão/aviso na revisão para refletir a decisão atual e permitir mudar a escolha antes de importar.
6. Garantir que o payload de importação diferencie duplicatas reimportadas de lançamentos originais, mantendo rastreabilidade sem cair na restrição única de `import_hash`.

Detalhe técnico:
- O problema atual é que existe apenas um link pequeno “Importar mesmo assim”, não um diálogo de confirmação, e o `import_hash` está sendo enviado como `null` para duplicatas incluídas. Se a coluna tiver regra/validação ou se a UI não marcar as duplicatas no momento esperado, elas continuam sem entrar. Vou trocar isso por uma decisão explícita e por hashes novos para duplicatas reimportadas.
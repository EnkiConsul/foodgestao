## Diagnóstico

Consultei o banco e o PDF que você acabou de enviar:

- **PDF `NU_55213653_01JUN2026_30JUN2026.pdf`** cobre **01/06 a 30/06/2026** e contém movimentações desde **05/06** (Pix recebido PAGFACIL R$ 500, HS DO BRASIL R$ 723, etc.).
- **No banco** existem apenas **19 lançamentos** em junho, todos entre **21/06 e 30/06**. Tudo que veio antes de 21/06 (aprox. **15 dias de movimentações**) ficou de fora.

Ou seja: os lançamentos não estão "sumindo" da tela — eles **nunca foram importados**. O parser do extrato Nubank (`src/lib/statement-import/nubankPdf.ts`) está perdendo as primeiras semanas do PDF.

Causa provável: o parser depende do agrupamento de itens do `pdfjs-dist` por coordenada Y para reconstruir cada linha. Nas primeiras páginas do extrato o layout tem quebras de linha extras (descrição da contraparte em 2–3 linhas, cabeçalho "Total de entradas/saídas" por dia), o que faz com que o cabeçalho de data (`05 JUN 2026`) não seja detectado corretamente ou fique órfão sem `currentDate`, e as linhas de valor acabam descartadas.

## Correção proposta

### 1. Reforçar o parser (`src/lib/statement-import/nubankPdf.ts`)

- Trocar a extração baseada em Y-agrupamento por uma leitura **página → texto plano via `pdftotext`-like** (mantendo `pdfjs-dist` mas concatenando itens com heurística de "novo item quando x cai para a esquerda"), ou alternativamente processar cada item individualmente e reconstruir blocos por proximidade vertical.
- Adicionar detecção de cabeçalho de data mais robusta: aceitar a data mesmo quando estiver na mesma linha do total do dia, ou aparecer isolada, ou seguida de quebra.
- Ao detectar um bloco "Total de entradas / Total de saídas", usar isso apenas como delimitador de sinal (crédito/débito) — sem descartar o `currentDate`.
- Ignorar corretamente: rodapé ("Extrato gerado dia..."), cabeçalho ("Rafael de Paula Castro", "CPF ..."), "Saldo inicial", "Saldo final", "Rendimento líquido", "Total de entradas/saídas" quando aparecem no resumo do topo.
- Concatenar linhas de continuação da contraparte (que começam recuadas e não têm valor no final) na descrição da última entrada, para melhorar o nome do fornecedor/cliente.
- Determinar tipo (receita/despesa) pelo **bloco pai** (`Total de entradas` vs `Total de saídas` do dia), não só por regex no título — assim capturamos corretamente "Compra no débito", "Pagamento de boleto", "Tarifa", etc.

### 2. Validar contra o PDF anexado

- Após a correção, testar localmente com o próprio arquivo `NU_55213653_01JUN2026_30JUN2026.pdf` e confirmar que a contagem bate com o resumo do extrato: **Total de entradas R$ 15.687,01 / Total de saídas R$ 15.585,56 / Saldo final R$ 101,45**.
- Somar receitas − despesas dos lançamentos extraídos deve dar exatamente **R$ 101,45**.

### 3. Reimportação segura

O importador já grava um `import_hash` único por lançamento — reimportar o mesmo PDF **não gera duplicatas**: as 19 entradas de 21–30/06 serão marcadas como "Já importado" no diálogo de revisão e apenas os dias 05–20/06 (faltantes) serão inseridos.

## Passos para você depois do fix

1. Abrir **Lançamentos → Importar Extrato**.
2. Selecionar a mesma conta bancária Nubank.
3. Anexar o PDF de junho novamente.
4. Confirmar no resumo que a soma bate com o saldo final do extrato (R$ 101,45) antes de importar.

## Observações técnicas

- Sem alterações de schema; muda apenas `src/lib/statement-import/nubankPdf.ts` e possivelmente `suggest.ts` (nada em RLS/edge functions).
- O erro "Cannot create property '_t' on number '1'" que aparece nos logs é ruído do overlay de dev (não relacionado); posso investigar em separado se persistir depois do fix.

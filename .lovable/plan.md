# Corrigir descrição e estabelecimento do cartão Neon

## Diagnóstico confirmado

- O Neon está enviando corretamente a descrição do extrato em `raw.descriptionRaw`, incluindo exemplos do anexo: `PONTO DA CARNE GOIANIA BR`, `ModernMarket GOIANIA BR`, `CONCEBRA GOIANIA BR`, `DISTRIBUIDORA 365 VALPARAISO DEBR` e `SORVETERIA MEGA GELATT Valparaiso deBR`.
- Nessas linhas, o provedor não preenche `merchant` nem `paymentData`. Por isso `counterparty_name` foi gravado vazio: o sistema procurava o estabelecimento principalmente nos campos estruturados, não no texto do extrato do cartão.
- As 15 linhas pendentes consultadas do Neon possuem `descriptionRaw`, mas as 15 estão sem `counterparty_name` persistido.
- A rota aberta no preview está selecionando o cartão BMG (Mastercard final 2691), não a conta de cartão Neon mostrada no anexo. São fontes diferentes: no BMG o provedor frequentemente envia apenas `CREDITO_A_VISTA`; no Neon ele envia o nome do estabelecimento no texto.

## Correção

1. **Usar o texto correto do Neon**
   - Para cartão, priorizar `raw.descriptionRaw` e usar `raw.description`/`description` como fallback.
   - Preservar o conteúdo do banco, fazendo somente a normalização dos espaços de alinhamento.
   - Não substituir o texto por categoria, MCC, final do cartão ou rótulos inferidos.

2. **Extrair o estabelecimento da descrição do cartão**
   - Quando `merchant` e `paymentData` estiverem vazios, separar o nome do estabelecimento da cidade e do país presentes em `descriptionRaw`.
   - Exemplos: `PONTO DA CARNE GOIANIA BR` → fornecedor sugerido `Ponto da Carne`; `CONCEBRA GOIANIA BR` → `Concebra`.
   - Não criar fornecedor para pagamentos de fatura nem para códigos genéricos como `CREDITO_A_VISTA`.
   - Como o Neon não envia CNPJ nessas linhas, sugerir o fornecedor pelo nome, sem inventar documento e sem conciliação automática.

3. **Aplicar na sincronização e na tela**
   - Gravar `counterparty_name` extraído nas próximas sincronizações de cartão.
   - Na conciliação, usar imediatamente a mesma extração sobre o dado bruto, inclusive antes de uma nova sincronização.
   - Manter a descrição original em primeiro plano e o fornecedor/cliente em sua coluna própria.

4. **Restaurar somente pendências**
   - Reprocessar as linhas pendentes do cartão Neon a partir de `raw.descriptionRaw`.
   - Não alterar lançamentos confirmados, descrições editadas manualmente ou vínculos de fornecedor já escolhidos pelo usuário.

5. **Validar**
   - Cobrir os exemplos reais do anexo, cidades compostas, país colado (`deBR`), pagamentos de fatura e códigos genéricos.
   - Verificar a tela selecionando explicitamente o cartão Neon e confirmar descrição e sugestão de fornecedor.

## Restrição de release

O release freeze permanece ativo. A implementação e os testes podem ser preparados, mas publicação da função e reprocessamento dos pendentes exigem autorização explícita de hotfix.

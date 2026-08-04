# Nome e CNPJ/CPF da contraparte na conciliação

Sim, é possível. A Pluggy já envia esses dados e eles estão gravados no campo bruto de cada lançamento importado.

Consulta feita nos lançamentos reais em staging: cada PIX traz `paymentData.payer` e `paymentData.receiver` com `name` e `documentNumber` (`{type: "CNPJ"|"CPF", value: "58.241.366/0001-32"}`). Exemplos encontrados: "PAGAR.ME S.A." / 18.727.053/0001-74 e "Rafael De Paula Castro" / 023.559.691-40. Também existe `merchant.name` / `merchant.businessName` / `merchant.cnpj` em compras de cartão. Hoje o sistema só usa esses dados para montar a descrição — o documento não é exibido nem aproveitado para identificar o fornecedor/cliente.

Observação: o preenchimento depende do banco e do tipo de lançamento. PIX e boleto normalmente vêm completos; débitos internos, tarifas e alguns TEDs podem vir sem nome ou sem documento.

## O que será feito

1. Extrair a contraparte de cada lançamento
   - Novo utilitário que lê o dado bruto e devolve nome, documento (CNPJ/CPF) e tipo, escolhendo o lado correto: em entradas usa o pagador, em saídas usa o recebedor (com `merchant` como alternativa).
   - Ignora a própria empresa quando o documento da contraparte é igual ao da conta conectada.
   - Débitos internos (tarifas, IOF, juros, anuidade, rendimento, estorno interno — sem pagador/recebedor externo): a contraparte passa a ser o próprio banco da conexão, usando o nome e o CNPJ do banco cadastrado, e o lançamento é marcado como "débito interno".

2. Guardar o documento no lançamento importado
   - Novas colunas `counterparty_document` e `counterparty_document_type` na tabela de lançamentos em staging, preenchidas na sincronização (e no reprocessamento dos já existentes, quando o dado bruto estiver disponível).

3. Mostrar na tela de Conciliação
   - Em cada linha (desktop) e em cada card (mobile): nome da contraparte e documento formatado, com o rótulo "identificado pelo extrato".

4. Sugerir o Fornecedor/Cliente automaticamente
   - Se já existir contato cadastrado com o mesmo documento, ele é pré-selecionado no campo Fornecedor/Cliente.
   - Se não existir, aparece um botão "Cadastrar contato" que cria o contato com nome e documento já preenchidos (tipo cliente para entradas, fornecedor para saídas), vinculado à empresa ativa, e o seleciona no lançamento.
   - Escolhas manuais e rascunhos salvos continuam prevalecendo sobre a sugestão.

## Detalhes técnicos

- `src/lib/conciliacao/counterparty.ts` + testes unitários (PIX entrada/saída, boleto, cartão com merchant, lançamento sem dados).
- Migração: `ALTER TABLE public.pluggy_staging_transactions ADD COLUMN counterparty_document text, ADD COLUMN counterparty_document_type text;` (sem novas políticas — RLS existente cobre).
- `supabase/functions/pluggy-sync-item` e `_shared/pluggy-v2-materialize.ts`: gravar os novos campos junto de `counterparty_name`.
- Match de contato por documento normalizado (só dígitos) contra `contacts.document`, restrito à empresa ativa via `contact_companies`.
- UI: `src/pages/ConciliacaoPluggy.tsx` e `StagingCard.tsx`.

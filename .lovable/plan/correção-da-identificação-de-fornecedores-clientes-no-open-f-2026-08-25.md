# Correção da identificação de fornecedores/clientes no Open Finance

## Diagnóstico confirmado

A importação grava a contraparte em dois campos separados da fila de conciliação:

- `counterparty_name`: nome do fornecedor/cliente identificado no extrato.
- `counterparty_document`: CPF/CNPJ identificado no extrato.

Nos dados pendentes atuais há 1.141 lançamentos. A leitura confirmou inconsistências reais no que ficou gravado:

- 141 lançamentos estão sem nome de contraparte.
- 229 lançamentos estão sem CPF/CNPJ gravado.
- Existem lançamentos onde o JSON bruto contém CNPJ/CPF em `paymentData.receiver`, `paymentData.payer` ou `merchant.cnpj`, mas `counterparty_document` ficou vazio.
- Em alguns casos o nome está correto, mas o CNPJ não foi persistido; isso impede o cadastro automático correto e o casamento por documento.
- Em outros casos o provedor não entrega CNPJ/CPF da contraparte; nesses casos o sistema só pode sugerir por nome ou pedir confirmação manual.

## Objetivo

Corrigir a separação entre Nome e CPF/CNPJ da contraparte para que a conciliação consiga:

1. Identificar corretamente fornecedor/cliente por documento quando o extrato traz CPF/CNPJ.
2. Preencher o cadastro com nome e documento nos campos certos.
3. Evitar usar CPF/CNPJ do titular da conta como se fosse fornecedor/cliente.
4. Explicar claramente quando o CNPJ não veio no extrato.

## Plano de implementação

### 1. Unificar a extração de contraparte

Criar uma regra única para a importação e para a tela de conciliação:

- Saída/pagamento: fornecedor = `paymentData.receiver`.
- Entrada/recebimento: cliente = `paymentData.payer`.
- Compra no cartão/débito: usar `merchant.businessName/name` e `merchant.cnpj` quando disponíveis.
- Descartar sempre documentos e nomes do próprio titular/empresa.
- Usar descrição/pipe apenas como fallback de nome, nunca como CNPJ inventado.

### 2. Corrigir a importação do Open Finance

Atualizar a função de sincronização para gravar sempre juntos:

- nome extraído;
- documento extraído;
- tipo do documento (`CPF` ou `CNPJ`);
- origem da extração quando possível: pagador, recebedor, estabelecimento ou descrição.

Também corrigir o reenriquecimento de linhas pendentes antigas: hoje algumas linhas só são atualizadas se a descrição mudou; elas devem ser atualizadas quando nome/documento/tipo também mudarem.

### 3. Reprocessar lançamentos pendentes já importados

Adicionar um reprocessamento para os lançamentos pendentes de Open Finance:

- reler o JSON bruto salvo em cada lançamento;
- recalcular nome e CPF/CNPJ com a regra nova;
- preencher `counterparty_name`, `counterparty_document` e `counterparty_document_type` quando o dado existir;
- não alterar lançamentos já conciliados;
- não criar CNPJ quando o provedor não enviou esse dado.

### 4. Melhorar o cadastro direto pela conciliação

Ao clicar para cadastrar fornecedor/cliente a partir da conciliação:

- preencher nome e CPF/CNPJ em campos separados;
- sugerir tipo automaticamente: fornecedor para saída, cliente para entrada;
- se houver documento, checar duplicidade por CPF/CNPJ antes de criar;
- se não houver documento, checar duplicidade por nome igual ou parecido;
- mostrar confirmação quando houver cadastro parecido para evitar duplicidade.

### 5. Cadastro em massa com revisão

Adicionar uma ação “Cadastrar contrapartes identificadas”:

- agrupar lançamentos pendentes por CPF/CNPJ quando houver documento;
- agrupar por nome quando não houver documento;
- exibir tela de revisão com nome, CPF/CNPJ, tipo sugerido e quantidade de lançamentos;
- permitir desmarcar itens antes de confirmar;
- criar apenas contatos que não existirem;
- vincular automaticamente os lançamentos ao contato criado/reaproveitado.

### 6. Transparência na linha da conciliação

Quando uma linha não tiver fornecedor/cliente sugerido, exibir o motivo:

- “CPF/CNPJ do extrato ainda não cadastrado”.
- “Extrato trouxe nome, mas não trouxe CPF/CNPJ”.
- “Contraparte não informada pelo banco”.
- “Lançamento interno do banco”.

## Detalhes técnicos

- Ajustar `supabase/functions/_shared/tx-description.ts` e `supabase/functions/_shared/counterparty-doc.ts` para usar a mesma ordem de prioridade.
- Atualizar `supabase/functions/pluggy-sync-item/index.ts` para regravar nome/documento/tipo quando qualquer um deles mudar.
- Ajustar `src/lib/conciliacao/counterparty.ts` para espelhar a regra do backend.
- Atualizar `src/pages/ConciliacaoPluggy.tsx` para usar a contraparte recalculada como fonte principal na UI e no cadastro.
- Criar helper de agrupamento/deduplicação para o cadastro em massa.
- Incluir testes unitários para:
  - saída usa recebedor;
  - entrada usa pagador;
  - compra usa merchant;
  - documento do titular é descartado;
  - nome por descrição não gera CNPJ falso;
  - duplicidade por documento e por nome parecido.

## Resultado esperado

Depois da correção, os lançamentos pendentes que possuem CPF/CNPJ no extrato passarão a mostrar e cadastrar corretamente o fornecedor/cliente. Quando o banco não enviar CPF/CNPJ, a tela deixará isso explícito e permitirá cadastrar por nome com confirmação de duplicidade.

# Conciliação: por que a forma de pagamento e o Fornecedor/Cliente saem errados

## O que os dados mostram

Consultei os lançamentos importados da conexão do Nubank e confirmei duas causas distintas.

### 1. Fornecedor/Cliente vem sempre "Rafael Castro" (o próprio titular)

Nas compras no débito o banco envia apenas o lado `payer`, e esse lado é o **próprio titular** (CPF 023.559.691-40), sem `receiver` e sem `merchant`:

```text
description: "Compra no débito|POSTO MADRI"
paymentData.payer.documentNumber: CPF 023.559.691-40   <- é o titular
paymentData.receiver: null
merchant: null
```

Hoje o descarte do "documento próprio" usa apenas o CNPJ da empresa. Como o CPF do titular não está nessa lista, o motor cai no lado secundário (o próprio pagador) e sugere o contato cadastrado com aquele CPF — por isso **todas** as linhas apontam para Rafael Castro. Nas entradas por Pix o lado externo existe e a sugestão sai correta (ex.: a linha do CNPJ 59.980.948), o que reforça o diagnóstico.

### 2. Forma de pagamento "Não informada"

Nessas mesmas linhas o banco manda `paymentMethod: "OTHER"` e a descrição é `Compra no débito|...`. O reconhecimento por texto só cobre "compra com cartão", "cartão de débito" e "débito automático" — "compra no débito" não casa com nada, então nenhuma forma é sugerida. Nas linhas Pix o campo do banco vem preenchido e a sugestão funciona.

## Correções

### Contraparte

- Montar a lista de documentos próprios com: CNPJ da empresa, CPF/CNPJ do titular vindo da conta conectada (`taxNumber`/`owner.taxNumber`) e o documento das contas da própria conexão — em vez de só o CNPJ.
- Nunca usar o lado secundário (o lado do titular) como contraparte: se só existe o lado próprio, a contraparte é desconhecida por documento.
- Nesse caso, extrair o nome da contraparte do trecho após `|` na descrição ("Compra no débito|POSTO MADRI" → POSTO MADRI) e sugerir apenas contatos com **nome** compatível; sem documento, não sugerir contato automaticamente — oferecer o atalho "Cadastrar POSTO MADRI".
- Casamento por documento só quando o documento for de terceiro comprovadamente (fora da lista de documentos próprios).

### Forma de pagamento

- Reconhecer os textos que o Nubank e outros bancos usam: "compra no débito", "compra débito", "débito em conta", "compra no crédito", "compra parcelada", "saque".
- Quando o banco manda `OTHER` mas o lançamento é uma compra (tipo DEBIT, sem pagador/recebedor externo e categoria de comércio), sugerir **débito** como forma inferida, mantendo o rótulo "sugerido pelo extrato" para o usuário poder trocar.
- Manter a regra de não sugerir nada quando não há sinal — melhor vazio do que errado.

## Detalhes técnicos

- `src/lib/conciliacao/counterparty.ts`: remover o fallback para o lado secundário, adicionar extração de nome pelo separador `|`, expor os documentos próprios ampliados.
- `src/pages/ConciliacaoPluggy.tsx`: carregar os documentos próprios (empresa + titular das contas Pluggy da conexão) e passar em `ownDocuments`; sugerir contato por nome normalizado quando não houver documento de terceiro.
- `src/lib/conciliacao/paymentMethodInference.ts`: novos padrões de texto e heurística de compra no débito quando o banco devolve `OTHER`.
- Testes em `src/lib/conciliacao/__tests__` cobrindo: compra no débito (contraparte = nome da descrição, forma = débito), Pix recebido (contraparte = pagador externo), tarifa interna (contraparte = banco).

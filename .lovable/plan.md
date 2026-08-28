# Padronizar lançamentos de cartão de crédito de todos os bancos

## O que os bancos mandam hoje (verificado nos dados)

Cada banco escreve a linha do cartão de um jeito diferente:

```text
Neon        ModernMarket             GOIANIA      BR      (nome + cidade + país em colunas)
Neon        SORVETERIA MEGA GELATT   Valparaiso deBR      (país colado no conector)
Neon        MP *VOXALIMENTOS         GOIANIA      BR      (prefixo de adquirente)
Neon        Pagamento Fatura / IOF - GARMIN
BMG         CREDITO_A_VISTA                               (código genérico, só MCC)
Nubank      Cgtrader / Ipremium Store 2/3                 (nome limpo, com parcela)
Nubank      Juros de atraso / Multa de atraso / IOF de atraso / Saldo em atraso /
            Crédito de atraso / Encerramento de dívida / Pagamento recebido
```

Hoje só o padrão em colunas (Neon) e o código genérico (BMG) são tratados. O resultado:

- Encargos do Nubank ("Juros de atraso", "Multa de atraso", "IOF de compra internacional") e do Neon ("IOF - GARMIN") são interpretados como **estabelecimento** e viram sugestão de fornecedor.
- "Encerramento de dívida" e "Crédito de atraso" não são reconhecidos como movimento da própria fatura.
- Parcela ("Ipremium Store 2/3") entra no nome do fornecedor, criando fornecedores diferentes para a mesma loja.
- Prefixos de adquirente ("MP \*", "DL\*", "TRADIO \*") ficam no nome do fornecedor.
- A cidade é reconhecida por uma lista fixa de cidades; qualquer cidade fora da lista fica dentro do nome do fornecedor.

## Padronização proposta

Criar uma classificação única da linha de cartão, usada por conciliação, extrato e sincronização, com quatro tipos:

1. **Compra** — tem estabelecimento; gera sugestão de fornecedor.
2. **Pagamento/crédito da fatura** — pagamento recebido, pagamento fatura, encerramento de dívida, crédito de atraso, estorno. Sem fornecedor, sem sugestão de categoria de despesa.
3. **Encargo do cartão** — juros, multa, IOF, tarifa, anuidade, saldo em atraso, parcelamento de fatura. Sem fornecedor; sugestão de categoria de despesa financeira.
4. **Sem identificação** — código genérico (`CREDITO_A_VISTA`) ou texto vazio: mantém o texto do banco e o aviso curto de que o banco não informou o estabelecimento.

Regras de extração do estabelecimento (aplicadas a todos os bancos, na ordem):

- `merchant` estruturado quando existir.
- Texto em colunas (2+ espaços): primeira coluna = nome, segunda = cidade, terceira = país.
- Texto sem colunas: remover país/cidade só quando reconhecíveis por posição e formato, sem depender de lista fixa de cidades.
- Remover prefixo de adquirente (`MP *`, `DL*`, `TRADIO *`, `PAG*`, `PICPAY*` etc.).
- Extrair sufixo de parcela (`2/3`, `PARC 02/06`) para exibição, mantendo o nome do fornecedor igual em todas as parcelas.
- Nunca sugerir fornecedor para pagamento de fatura, encargo ou linha sem identificação; nunca inventar CNPJ.

Exibição (sem mudar a descrição do banco):

- Descrição = texto original do banco, só com espaços colapsados.
- Linha auxiliar padronizada: tipo da linha (Compra / Pagamento da fatura / Encargo), parcela quando houver, cidade, ramo (MCC) e final do cartão.

Dados existentes:

- Reprocessar apenas linhas **pendentes** dos cartões, recalculando fornecedor/tipo. Lançamentos confirmados, descrições editadas e vínculos escolhidos pelo usuário não são alterados.

## Detalhes técnicos

- Novo `src/lib/conciliacao/cardLine.ts`: `classifyCardLine()` (tipo + encargo + parcela) e `parseCardMerchant()` unificado; `cardMerchant.ts` passa a delegar e a lista fixa `CITY_TOKENS` é substituída por heurística de posição/país.
- `cardDescription.ts`: `cardHintLabel` monta a linha auxiliar padronizada (tipo, parcela, cidade, MCC, final).
- `counterparty.ts`: só sugere contato quando `classifyCardLine` devolve compra.
- `cardRouting.ts`: encargo e saldo em atraso como saída; pagamento/crédito de fatura como entrada — validado por teste.
- `supabase/functions/_shared/tx-description.ts` + `pluggy-sync-item`: mesma classificação ao gravar `counterparty_name`.
- Telas: `ConciliacaoPluggy.tsx` e `ExtratoConciliacao.tsx` usam a linha auxiliar padronizada.
- Testes: casos reais dos três bancos (colunas, país colado, adquirente, parcela, encargos em português, `CREDITO_A_VISTA`, pagamento de fatura) em `cardMerchant.test.ts`, `cardDescription.test.ts`, `cardRouting.test.ts` e no teste Deno correspondente.
- Backfill pontual em SQL somente nas linhas pendentes de contas de cartão.

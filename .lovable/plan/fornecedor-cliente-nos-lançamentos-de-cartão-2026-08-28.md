# Fornecedor/cliente nos lançamentos de cartão

## O que está acontecendo

Confirmado nos dados atuais do cartão: **nenhuma** linha de fatura traz `merchant` ou `paymentData` — os dois vêm nulos, e por isso `counterparty_name`/`counterparty_document` estão nulos em todas elas. O resolvedor de contraparte (`src/lib/conciliacao/counterparty.ts`) depende justamente de `paymentData.payer/receiver` ou `merchant`, então na fila do cartão ele não tem de onde extrair nada e a coluna Fornecedor/Cliente fica vazia.

O que existe de fato nessas linhas é o **estabelecimento dentro da descrição**, no formato do extrato de cartão (nome + cidade + país):

- `PONTO DA CARNE GOIANIA BR`
- `CONCEBRA GOIANIA BR`
- `JERIVA COMERCIO DE ALI ABADIANIA BR` (nome cortado pelo banco)
- `SORVETERIA MEGA GELATT Valparaiso deBR`
- `WWW.DAZN.COM Sao Paulo BR`
- `TRIX ACADEMIA APARECIDA DE BR`

E há linhas onde nem isso existe: `CREDITO_A_VISTA` e `Pagamento Fatura` / `Pagamento recebido` (essas últimas não são compra de fornecedor, são pagamento da própria fatura).

Ou seja: dá para identificar o fornecedor na maioria das compras, mas por **nome** — o banco não manda CNPJ nessas linhas.

## Ajuste proposto

1. Extrair o estabelecimento da descrição do cartão: remover o país no final (`BR`, `GB`, `US`, inclusive colado como `deBR`) e a cidade final quando reconhecível, mantendo o nome (`PONTO DA CARNE GOIANIA BR` → `PONTO DA CARNE`, cidade `GOIANIA` guardada só como dica na tela).
2. Usar esse nome como contraparte da linha (sem documento), alimentando a sugestão de Fornecedor/Cliente já existente: casamento por nome normalizado e aproximado contra os contatos da empresa, tolerando o nome cortado pelo banco (`JERIVA COMERCIO DE ALI` casa com `JERIVA COMERCIO DE ALIMENTOS LTDA`).
3. Quando não houver contato equivalente, oferecer o cadastro na hora com o nome já preenchido (o diálogo de novo fornecedor da conciliação e a importação em massa continuam funcionando), com o CNPJ em branco para o usuário completar.
4. Linhas sem estabelecimento (`CREDITO_A_VISTA`) continuam sem sugestão, mantendo o aviso "banco não informou o estabelecimento".
5. Linhas de pagamento de fatura (`Pagamento Fatura`, `Pagamento recebido`, categoria `Credit card payment`) são tratadas como internas: nenhum fornecedor é sugerido, para não criar contato de banco.
6. Aprender do histórico: quando o mesmo estabelecimento já foi conciliado antes com um contato, a sugestão passa a vir por histórico (mesmo caminho já usado nas contas bancárias), o que resolve automaticamente os recorrentes (`CONCEBRA`, `WWW.DAZN.COM`).

Nada é conciliado automaticamente: a sugestão continua aparecendo com o selo de origem e o usuário confirma.

## Detalhes técnicos

- Novo `src/lib/conciliacao/cardMerchant.ts` (puro): `merchantFromCardDescription(description)` devolvendo `{ name, city }`, com remoção de sufixo de país/cidade, tratamento de cidades compostas (`Valparaiso de`, `Aparecida de`) e detecção de código de operação (reaproveitando `isCardOperationCode` de `cardDescription.ts`).
- `src/lib/conciliacao/counterparty.ts`: quando a linha é de conta de cartão e não há `merchant`/`paymentData`, usar `merchantFromCardDescription` como candidato (nome sem documento); manter `isInternalBankCharge` e adicionar pagamento de fatura como interno.
- `src/pages/ConciliacaoPluggy.tsx`: passar o indicador de linha de cartão ao resolvedor (já existe `isCardRow`) e persistir `counterparty_name` como hoje, para o casamento de contato e o histórico funcionarem sem mudanças na tela.
- Casamento de contato: reutilizar o comparador atual e permitir match por prefixo/normalização quando o nome do banco é mais curto que o cadastrado.
- Testes: `src/lib/conciliacao/__tests__/cardMerchant.test.ts` (cidade+país, cidade composta, nome cortado, código de operação, pagamento de fatura) e casos de cartão em `conciliacaoContactMatch.test.ts`.
- Sem migração de banco. Não altera valor, data, direção, roteamento para fatura, nem lançamentos confirmados.
- Release freeze ativo: entra como correção de conciliação, sujeito à sua confirmação.

## Verificação

- Abrir a fila do cartão e conferir sugestão de fornecedor em `PONTO DA CARNE`, `CONCEBRA`, `JERIVA…`, `WWW.DAZN.COM`.
- Conferir que `CREDITO_A_VISTA` segue sem sugestão e que `Pagamento Fatura` não sugere fornecedor.

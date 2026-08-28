# Cartão: pagamento de 146,68 duplicado e com sinal negativo

## O que os dados mostram

Existem duas linhas pendentes no cartão BMG, mesma data e mesmo valor, mas com **ids diferentes do provedor** — por isso nada foi barrado como duplicado:

```text
2026-07-30  CREDITO_A_VISTA      -146,68  CREDIT  criada 25/08  providerId 13011928626
2026-07-30  Pagamento recebido   -146,68  CREDIT  criada 27/08  providerId 76ad7cb8...
```

Nos dados brutos, as duas apontam para a **mesma fatura** (`creditCardMetadata.billId = ccf94919-…`) e a segunda tem categoria "Credit card payment". Ou seja: é o **mesmo pagamento de fatura**, que o banco reenviou depois com outra descrição/id. A sincronização deduplica só por id do provedor, então gravou as duas.

Sobre o sinal: o valor exibido é o valor bruto do provedor. No cartão, o pagamento da fatura vem **negativo** (`-146,68`) enquanto a compra vem **positiva** (`34,90`). Depois da última correção o rótulo já está certo (Entrada/Saída), mas o número continua com o sinal cru do banco — daí "Entrada" com `-R$ 146,68` e "Saída" com `R$ 34,90`, que parece invertido.

## Correção proposta

1. **Exibir o valor conforme a direção** (não conforme o sinal do provedor): em conta de cartão, mostrar compra como `- R$ 34,90` (vermelho, Saída) e pagamento/estorno como `R$ 146,68` (verde, Entrada). Vale para a conciliação e para o Extrato de Conciliação; contas bancárias não mudam.
2. **Detectar duplicidade de linhas do cartão**: quando duas linhas pendentes da mesma conta de cartão tiverem mesma data, mesmo valor absoluto e mesma fatura (`billId`), marcar a mais antiga com um selo "Possível duplicado" e um atalho para marcá-la como duplicada, deixando pendente apenas a versão mais recente do banco. Sem apagar nada automaticamente e sem tocar em linhas já confirmadas.
3. **Ajuste pontual nos dados atuais**: marcar a linha `CREDITO_A_VISTA -146,68` de 30/07 como `duplicate`, mantendo apenas `Pagamento recebido`, para o cliente não conciliar o mesmo pagamento duas vezes.

## Observações

- O worker de sincronização não muda: a convenção da Pluggy segue preservada no staging; a interpretação é feita na leitura.
- Se você preferir que o sistema oculte automaticamente o duplicado em vez de só sinalizar, digo que dá para fazer — mas prefiro sinalizar, porque em cartão pode existir pagamento parcial repetido de valor igual.
- Há **release freeze ativo**: isso entra como hotfix aprovado ou depois da certificação.

## Detalhes técnicos

- `src/lib/conciliacao/cardRouting.ts`: função de valor assinado por direção (`signedRowAmount`) + detector de duplicidade por `(date, abs(amount), billId)`.
- `src/pages/ConciliacaoPluggy.tsx`: usar o valor assinado na coluna de valor e renderizar o selo/ação de duplicado.
- `src/lib/conciliacao/extrato.ts` já normaliza o sinal; ajustar apenas a exibição em `ExtratoConciliacao.tsx` se necessário.
- `billId` vem de `raw->creditCardMetadata->>billId`; o hook do extrato/conciliação passa a selecionar esse campo.
- Testes unitários: valor assinado (cartão x banco) e detecção de duplicado (mesma fatura x valores iguais em faturas diferentes).

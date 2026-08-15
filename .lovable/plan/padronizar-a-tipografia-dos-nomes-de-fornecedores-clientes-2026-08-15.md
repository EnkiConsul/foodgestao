# Padronizar a tipografia dos nomes de fornecedores/clientes

## O que está acontecendo

Não é uma diferença de fonte ou de CSS: a lista usa a mesma tipografia em todas as linhas. O que muda é **como o nome foi gravado no banco**.

Consulta feita na base confirma os dois padrões convivendo:

- Nomes vindos do banco/Open Finance chegam em CAIXA ALTA, como no extrato bancário: `NAGASUBIAS CORPORATE LTDA`, `SANEAMENTO DE GOIAS S/A`, `EMPORIO ELDORADO MILAO LTDA`.
- Nomes digitados manualmente na plataforma vêm em caixa mista: `Michelle De Souza Alves`, `Santander`, `Frouhlic - Aluguel Sala`.

Como o texto em maiúsculas ocupa mais espaço vertical nas letras, ele parece "maior e mais forte" ao lado dos nomes em caixa mista — daí a impressão de tipografias diferentes.

## Correção proposta

Normalizar a exibição, sem alterar o dado original de auditoria do extrato:

1. Criar um formatador de nomes próprios/razão social (pt-BR) que:
   - aplique caixa mista ("Nagasubias Corporate Ltda" → "Nagasubias Corporate LTDA");
   - mantenha em maiúsculas os sufixos e siglas empresariais: LTDA, ME, EPP, MEI, S/A, SA, EIRELI, S/S, CIA;
   - mantenha preposições em minúsculas ("de", "da", "dos");
   - preserve siglas curtas reais (até 3 letras, ex.: `GR`, `JBS`) e marcas já conhecidas.
2. Aplicar esse formatador na **exibição** dos nomes de contatos: lista de Fornecedores/Clientes, seletor de contraparte da Conciliação, Extrato de Conciliação e lançamentos.
3. Normalizar também no momento de gravar contatos criados automaticamente pela integração Open Finance, para que novos registros já entrem padronizados.
4. Ação opcional (só se você quiser): uma normalização única dos contatos já existentes em CAIXA ALTA, para o histórico ficar uniforme.

## Detalhes técnicos

- Novo utilitário `src/lib/text/properName.ts` (`toProperName`), separado do `toTitleCase` atual — o `toTitleCase` trata qualquer palavra toda em maiúscula como sigla e por isso deixaria `CARREFOUR` intacto.
- Pontos de exibição a atualizar: `src/pages/Contatos.tsx`, `src/components/conciliacao/ContactSelectContent.tsx`, `src/components/conciliacao/StagingCard.tsx`, `src/pages/ExtratoConciliacao.tsx` e o resolvedor `src/lib/conciliacao/counterparty.ts`.
- Gravação: aplicar `toProperName` ao criar contatos na conciliação/sincronização Pluggy; o JSON bruto em `pluggy_v2_transactions_raw` e o snapshot em `transactions.pluggy_raw_snapshot` continuam intactos.
- Testes unitários para o formatador (razão social com LTDA/S/A, nome de pessoa, sigla curta, texto já em caixa mista).

# Por que a conciliação quase não sugere fornecedor/cliente

Verifiquei os dados reais dessa conta (Nu Pagamentos, empresa ativa) e o código de sugestão.

Dos lançamentos pendentes dessa conta, apenas **6** têm documento de contraparte que casa com um contato vinculado à empresa. Os demais caem em quatro buracos:

1. **A maioria das compras não tem CPF/CNPJ da contraparte.** Em compras no débito o Nubank só manda o CPF do próprio titular como pagador (descartado, corretamente) e não manda `receiver` nem `merchant`. O nome do estabelecimento existe, mas só dentro do dado bruto, em `descriptionRaw`: `"Compra no débito|DELLA ELDORADO"`, `"Compra no débito|Rp3*FIT PROD NATURAIS"`, `"Transferência enviada|RAPTOR SYSTEM LTDA"`.

2. **O extrator de nome lê o campo errado.** A regra do "pipe" (`nameFromPipe`) é aplicada em `description`, que na fila já vem com o texto limpo/renomeado (`"Panificadora - Della"`, `"Compras Diversas"`, `"Combustivel"`) e nunca contém `|`. Resultado: o nome do estabelecimento que está no bruto nunca é aproveitado — a linha fica sem contraparte e sem sugestão.

3. **O casamento por nome exige igualdade exata.** A sugestão por nome só acontece quando o texto normalizado é idêntico ao do cadastro. `"DELLA ELDORADO"` não casa com `"Padaria Della"`, `"UBER DO BRASIL TECNOLOGIA LTDA."` não casa com `"Uber"`.

4. **Contatos fora da empresa ativa são invisíveis.** O usuário tem 89 contatos, mas só 41 estão vinculados a essa empresa. Se o fornecedor está cadastrado apenas no perfil Pessoal, a conciliação não o encontra nem avisa que ele existe.

Também não há aprendizado: mesmo depois de conciliar 10 vezes "Comissão - RedFox" para o mesmo fornecedor, o próximo lançamento igual volta em branco.

## O que será feito

1. **Ler a contraparte do dado bruto, não do texto já limpo**
   Passar a considerar `raw.descriptionRaw` (e `raw.description`) na extração, com prioridade sobre a descrição exibida. Com isso as compras no débito passam a trazer o nome do estabelecimento (`DELLA ELDORADO`, `TRIX ACADEMIA`, `RAPTOR SYSTEM LTDA`).

2. **Casamento por nome tolerante, em vez de igualdade exata**
   - Remoção de ruído de adquirente/marketplace (prefixos tipo `Rp3*`, `PAG*`, `MP*`, `IFD*`) e de sufixos societários (LTDA, S.A., ME, EIRELI).
   - Casamento por token/contido-em com pontuação mínima: o candidato só é sugerido se a semelhança for alta e se não houver empate entre dois contatos diferentes (empate = nenhuma sugestão, para não errar).
   - Sugestão por nome continua marcada como "sugerido pelo extrato" na tela, para o usuário revisar.

3. **Aprender das conciliações anteriores (memória de conciliação)**
   Antes de tentar nome/documento, procurar lançamentos já conciliados com a mesma contraparte (mesmo documento ou mesmo texto bruto normalizado) e reutilizar o fornecedor/cliente escolhido na época. É a regra de maior precisão e resolve os casos recorrentes ("Comissão - RedFox", "Compras Diversas" do mesmo PIX).

4. **Contatos do usuário fora da empresa**
   Quando o documento/nome casar com um contato do usuário que não está vinculado à empresa ativa, sugerir esse contato marcado como "cadastrado no Pessoal" e vincular à empresa automaticamente no momento em que a linha for confirmada.

5. **Transparência do motivo**
   No campo Fornecedor/Cliente, um selo curto indicando a origem da sugestão (documento, histórico, nome) e, quando não houver sugestão, o motivo ("extrato sem CNPJ/CPF e nome não cadastrado"), com o atalho de cadastro já preenchido com o nome do bruto.

## Detalhes técnicos

- `src/lib/conciliacao/counterparty.ts`: nova função `descriptionSources(row)` devolvendo `[raw.descriptionRaw, raw.description, row.description]`; `nameFromPipe`/`nameFromDescription` aplicadas nessa ordem. Testes novos para os padrões reais do Nubank (`Compra no débito|X`, `Transferência enviada|X`, `Pix enviado|X`).
- Novo `src/lib/conciliacao/contactMatch.ts`: `stripAcquirerNoise`, `contactMatchScore`, `bestContactMatch(candidates)` com limiar e regra de desempate; testes unitários.
- `src/lib/conciliacao/contacts.ts`: passar a carregar também os contatos do usuário sem vínculo com a empresa (marcados com `linkedToCompany: false`), reaproveitando a paginação atual.
- `src/pages/ConciliacaoPluggy.tsx`: `suggestedContact` passa a ser calculado em cascata (histórico → documento → nome fuzzy), guardando a origem em `suggestionSource[rowId]`; ao confirmar uma linha com contato não vinculado, chamar `ensureContactCompanyLink`.
- Memória de conciliação: consulta em `transactions` (contatos já usados) cruzada com `pluggy_staging_transactions` já confirmados da empresa, agregando `counterparty_document` normalizado e texto bruto normalizado → `contact_id` mais frequente. Sem novas tabelas nem migração.

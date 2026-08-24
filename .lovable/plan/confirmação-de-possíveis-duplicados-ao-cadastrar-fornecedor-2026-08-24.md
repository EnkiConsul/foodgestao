# Confirmação de possíveis duplicados ao cadastrar fornecedor/cliente na conciliação

Hoje, ao clicar em "Cadastrar", o sistema decide sozinho: se acha um contato com o mesmo documento ou o mesmo nome normalizado, vincula direto (toast "Contato já cadastrado"); se não acha nada idêntico, abre o formulário em branco. Nomes parecidos (ex.: "DELLA ELDORADO" vs. "Padaria Della") não são detectados, e o usuário não tem chance de revisar o que o sistema escolheu.

## O que muda

Ao clicar em "Cadastrar fornecedor/cliente" (na tabela, no cartão mobile e no atalho "+ Cadastrar novo"):

1. O sistema procura cadastros iguais **ou parecidos** — por CPF/CNPJ, por nome idêntico e por nome semelhante (mesma comparação tolerante já usada nas sugestões, com limite mais permissivo para não deixar passar candidatos).

2. Se encontrar candidatos, abre uma **tela de confirmação** antes de qualquer cadastro, listando até 5 possíveis correspondências com:
   - Nome, tipo (Cliente/Fornecedor/Ambos) e CPF/CNPJ do cadastro existente
   - O motivo do alerta: "mesmo CPF/CNPJ", "mesmo nome" ou "nome parecido"
   - Aviso destacado quando o documento é igual (nesse caso não é permitido criar outro cadastro; o banco já bloqueia)
   - O que o extrato trouxe (nome e documento), para comparação lado a lado

   Ações disponíveis:
   - **Usar este cadastro** — vincula o contato ao lançamento (e à empresa, se ele só existia no perfil Pessoal)
   - **Abrir cadastro** — abre o formulário do contato existente para completar/corrigir dados, já vinculando à linha
   - **Cadastrar novo mesmo assim** — segue para o formulário de novo contato pré-preenchido (desabilitado quando o documento é idêntico)
   - **Cancelar**

3. Se não houver nenhum candidato, o comportamento continua igual: abre direto o formulário de novo contato pré-preenchido.

## Detalhes técnicos

- `src/lib/conciliacao/contacts.ts`: nova função `findSimilarContacts({ userId, name, document })` que retorna uma lista ordenada de `{ contact, reason: "documento" | "nome" | "parecido", score }`, reaproveitando `normalizeDoc`/`normalizeName` e `contactMatchScore` de `contactMatch.ts` (limite de similaridade menor que o usado na sugestão automática, para revisão humana). `findExistingContact` permanece para os fluxos que ainda dependem dela.
- `src/components/conciliacao/ContactDuplicateDialog.tsx` (novo): diálogo de confirmação com a lista de candidatos e as quatro ações; sem lógica de banco, apenas callbacks.
- `src/pages/ConciliacaoPluggy.tsx`: em `createContactFromStatement`, trocar o auto-vínculo silencioso por `findSimilarContacts` → se vazio, abre `contactForm`; se não, guarda estado `duplicateCheck { rowId, name, document, type, candidates }` e abre o novo diálogo. Handlers: usar existente (`ensureContactCompanyLink` + `setRowContact` + recarregar lista), abrir cadastro (reusa `openEditContact` com o id escolhido), e criar novo (abre `contactForm` como hoje). Mesmo fluxo para o atalho "+ Cadastrar novo".
- Sem migração de banco; o índice único canônico de CPF/CNPJ continua sendo a trava final.

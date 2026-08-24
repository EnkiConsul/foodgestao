# Agente de IA para identificar Fornecedor/Cliente na Conciliação

## Situação atual

Hoje a identificação do fornecedor/cliente na conciliação **não usa IA**. Ela é feita por um motor de regras próprio:

- `counterparty.ts` extrai o nome/CPF/CNPJ da contraparte do texto do extrato;
- `contactMatch.ts` normaliza o texto (remove ruído tipo `PAG*`, `IFD*`, `LTDA`) e pontua a semelhança por tokens;
- `history.ts` aprende com conciliações anteriores do mesmo padrão de descrição.

Existe IA na plataforma, mas hoje só para **categorias** (função `of-ai-suggest`) e para os agentes financeiros. Não há agente de IA para contatos.

## O que será construído

Um agente de IA que lê as linhas do extrato, entende quem é a contraparte, compara com o cadastro de fornecedores/clientes (nome, CPF e CNPJ) e responde uma das três coisas:

1. **Já cadastrado** — indica o contato exato, com grau de confiança e o motivo (ex.: "mesmo CNPJ", "nome equivalente com prefixo de adquirente").
2. **Provavelmente cadastrado (parecido)** — indica candidatos para o usuário confirmar antes de vincular.
3. **Não cadastrado** — sugere nome limpo, tipo (fornecedor/cliente conforme entrada ou saída) e CPF/CNPJ quando o extrato traz, para abrir o cadastro já preenchido.

O motor de regras atual continua sendo a primeira camada (rápido e sem custo); a IA entra para as linhas que ficaram sem sugestão ou com sugestão de baixa confiança.

## Experiência de uso

- Na tela de conciliação, botão **"Identificar com IA"** no cabeçalho: processa as linhas visíveis sem fornecedor definido, em lotes, com indicador de progresso.
- Cada linha resolvida ganha um selo **IA** com a confiança e o motivo em tooltip; nada é gravado automaticamente sem o usuário aplicar.
- Linhas com candidatos parecidos abrem o diálogo de confirmação já existente (`ContactDuplicateDialog`) com as opções vincular / editar / ignorar.
- Linhas sem cadastro mostram ação **"Cadastrar"**, abrindo o formulário oficial pré-preenchido com nome, tipo e documento sugeridos, mantendo a validação de duplicidade por CPF/CNPJ.
- Botão **"Aplicar sugestões da IA"** para vincular em lote apenas as de alta confiança.

## Detalhes técnicos

- Nova edge function `of-ai-contact-suggest`:
  - valida JWT e o corpo com Zod (`company_id`, até 40 linhas: id, descrição, descrição bruta, valor, tipo, documento extraído);
  - monta os candidatos por linha no servidor usando as funções de normalização já existentes (top ~8 por linha), evitando enviar todo o cadastro ao modelo;
  - chama o Lovable AI Gateway (`google/gemini-3.6-flash`) com saída JSON estruturada: `{ suggestions: [{ id, match: "existing"|"similar"|"new", contact_id, candidate_ids, name, document, contact_type, confidence, reason }] }`;
  - valida no retorno que `contact_id`/`candidate_ids` pertencem à empresa e ao conjunto enviado; descarta o que não pertencer;
  - trata os status do gateway conforme o contrato (só 429/5xx com backoff limitado; 402/403 param o lote e exibem a mensagem do gateway).
- Frontend: hook `useAiContactSuggest` (lotes, cancelamento, cache por linha na sessão) e integração em `ConciliacaoPluggy.tsx` reaproveitando `findSimilarContacts`, `ContactDuplicateDialog` e `ContactFormDialog`.
- Prioridade de decisão mantida: documento (CPF/CNPJ) > histórico de conciliação > regra de tokens > IA. A IA nunca sobrescreve um fornecedor já escolhido pelo usuário.
- Guardas de custo: só linhas sem fornecedor e sem sugestão confiável, deduplicadas por descrição normalizada, com limite por lote.

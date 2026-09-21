# Categoria criada não aparece na empresa — diagnóstico

Análise somente leitura (produção) + reprodução local com simulação. **Nada foi criado,
excluído ou alterado em produção; nenhuma migração aplicada; nada publicado.**

## Como a lista funciona (schema efetivo)

- `src/pages/Categorias.tsx:263-290` — em PJ a lista lê
  `categories` com `select("*, category_companies!inner(company_id)")` e
  `.eq("category_companies.company_id", selectedCompanyId)`. **Junção obrigatória**: sem
  linha em `category_companies` para a empresa ativa, a categoria não aparece.
- Função do banco `get_accessible_categories` (SECURITY DEFINER): em `pj` também parte de
  `JOIN category_companies cc ON cc.category_id = c.id WHERE cc.company_id = _company_id`
  (só traz categorias-pai por recursão a partir de um filho vinculado).
- `categories.company_id` existe mas **não é usada** para visibilidade (0 linhas com valor
  preenchido; a fonte de verdade é a tabela de vínculo).
- Permissão de gravar vínculo: policy `category_companies_insert_policy` exige
  `can_edit_company_module(uid, company_id, 'categories')` **e** que a categoria tenha
  `user_id = auth.uid()`.

## Causa comprovada (dois defeitos, ambos reproduzidos)

Arquivo: `src/components/categories/CategoryFormDialog.tsx`

1. **Lista de empresas do diálogo só traz empresas das quais o usuário é DONO**
   (linhas 151-162: `.from("companies").eq("user_id", user.id)`). Quem opera uma empresa
   como membro não vê nenhuma caixa marcada; o vínculo não é gravado.
2. **Corrida no preenchimento automático**: o efeito que marca todas as empresas
   (linha 248, `setSelectedCompanies(new Set(companies.map(c => c.id)))`) tem dependências
   `[editCategory, open, defaultParentId, defaultType, defaultName]` — **sem `companies`**.
   Ele roda no instante da abertura, quando a consulta de empresas (habilitada só com
   `open`) ainda não respondeu, e **não reexecuta** quando os dados chegam. Resultado:
   conjunto vazio na primeira abertura após carregar a página.

Em ambos os casos o salvamento segue assim:

- linha 412: `if (newCat && selectedCompanies.size > 0)` — conjunto vazio ⇒ **nenhum
  vínculo é inserido e nenhum erro aparece**;
- linha 427: `toast.success("Categoria criada!")` — **sucesso mesmo sem vínculo**
  (e mesmo quando o vínculo falha: o aviso da linha 415 é apenas informativo e o sucesso
  é exibido em seguida).

Isso corresponde exatamente ao sintoma relatado: aviso de sucesso, categoria ausente da
lista da empresa.

### Reprodução (local, com simulação, sem banco real)

`src/test/unit/categoriaVinculoEmpresa.test.tsx` — 3 testes, todos passando:

1. membro (sem empresa própria) cria categoria → **zero** inserções em
   `category_companies` + aviso "Categoria criada!";
2. dono da empresa ativa, empresas carregando depois da abertura → **zero** vínculos
   (a corrida do efeito) + aviso de sucesso;
3. controle: marcando a empresa manualmente, o vínculo é gravado com
   `{ category_id, company_id: <empresa ativa> }` — prova que só falta a marcação.

### Medições em produção (agregadas, sem expor registros)

- 1.200 categorias; 56 ativas **sem** vínculo em `category_companies` (6 usuários),
  todas raízes com `template_code` (sementes) — invisíveis na tela de Categorias, embora
  a função do banco as alcance por recursão quando existe filho vinculado.
- 2 dessas sem vínculo foram criadas nos últimos 7 dias.
- 0 casos de `categories.company_id` divergente do vínculo.
- 23 empresas ativas, 25 vínculos de membro, **2 membros que não são donos** e
  **2 usuários que participam de empresa sem ter empresa própria** — exatamente o perfil
  atingido pelo defeito 1. 3 usuários têm 2+ empresas próprias (atingidos pelo defeito 2
  e, ao operar empresa de terceiro, pelo 1).

### Descartado com evidência

- Cache/invalidações: a tela chama `refetchAll()` (`src/pages/Categorias.tsx:317-321`)
  após salvar e refaz as duas consultas; não há divergência de chave que explique o
  sintoma. A chave de leitura inclui `selectedCompanyId`, então trocar de empresa refaz a
  busca.
- Filtro de tipo/paginação: a consulta não pagina e o filtro de tipo é aplicado sobre o
  resultado já vindo do banco.
- Hierarquia: 0 filhos apontando para pai inexistente.
- RLS de gravação: a policy permite o insert de quem tem edição no módulo; nos casos
  reproduzidos **o insert nem é tentado**.

## Correção mínima proposta (não aplicada)

1. Usar as empresas **acessíveis** do contexto (`useCompanyContext().companies`, que já
   inclui participação como membro) em vez da consulta por dono, no diálogo.
2. Incluir sempre a **empresa ativa** (`selectedCompanyId`) na seleção inicial em PJ e
   reexecutar o preenchimento quando a lista de empresas chegar (adicionar `companies` às
   dependências, sem sobrescrever escolha manual do usuário).
3. Falhar fechado: em PJ, se nenhuma empresa estiver marcada, bloquear o salvamento com
   mensagem clara; e não exibir "Categoria criada!" quando a gravação do vínculo falhar.
4. Opcional (dados existentes): revisar as 56 raízes de semente sem vínculo — apenas após
   você indicar empresa e nome, e com autorização explícita.

Nenhuma dessas mudanças foi aplicada nesta análise.

## Complemento (segunda passagem de leitura, mesma conclusão)

- `buildCategoryTree` (`src/lib/categories/tree.ts:12-39`) percorre somente a partir das
  raízes: se o pai não vier na consulta (por não estar vinculado à empresa), o filho
  vinculado **também deixa de ser exibido**, mesmo existindo. Isso amplia o efeito do
  defeito principal — basta a raiz ficar sem vínculo para o ramo inteiro desaparecer da
  tela, e há 56 raízes de semente sem vínculo hoje.
- A tela atualiza com `refetch()` direto, não com invalidação por prefixo, então outras
  telas que leem categorias com chaves próprias (`categories-for-parent`,
  `categories-simple`, `fc-matriz-categories`) não são atualizadas ao criar a categoria.
  É um incômodo secundário, não a causa do sintoma relatado.
- Ainda não verificado (fora do escopo desta leitura): se as funções de semente
  (`apply_default_categories` / `seed_default_categories`, acionadas em
  `src/pages/Categorias.tsx:106,123`) gravam os vínculos das raízes que criam. É a
  suspeita natural para as 56 raízes sem vínculo.

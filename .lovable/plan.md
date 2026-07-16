## Objetivo

Permitir vincular cada **Unidade** do módulo DP a uma **Empresa** já cadastrada em *Minhas Empresas*, exibindo a informação nos dois lados. Cobrança do plano permanece **por empresa** (não muda regra de quota).

## Modelo de dados

Nada a criar — a tabela `dp_unidades` já possui `company_id uuid NOT NULL REFERENCES companies(id)`. O vínculo é **N unidades : 1 empresa**. A alteração é apenas de UX/UI e de leitura.

## Mudanças

### 1. `src/hooks/useDpCadastros.tsx`
- `useDpUnidades` deixa de filtrar por `selectedCompanyId` e passa a listar todas as unidades das empresas do usuário (`in("company_id", companies.map(c => c.id))` usando `useCompanyContext().companies`). Adiciona `company_id` no retorno (já vem).
- `useUpsertDpUnidade` passa a receber `company_id` no payload (obrigatório). Deixa de usar `selectedCompanyId` automaticamente.

### 2. `src/pages/dp/DpUnidades.tsx`
- Dialog de criar/editar: novo campo obrigatório **"Empresa (Minhas Empresas)"** no topo — `Select` populado com `useCompanyContext().companies` (nome + trade_name). Bloqueia salvar se vazio. Ao editar, vem preenchido com a empresa atual e permanece editável.
- Se o usuário não tem empresas cadastradas: mostrar aviso no dialog com link para `/empresas` ("Cadastre uma empresa em Minhas Empresas primeiro").
- Tabela: nova coluna **EMPRESA** (após UNIDADE) mostrando o `name` da empresa vinculada. Coluna já disponível no dataset via join simples (`select("*, companies(id,name,trade_name)")`).
- Dialog de visualização: incluir linha "Empresa vinculada".

### 3. `src/pages/Empresas.tsx`
- No card de cada empresa (ou dialog de detalhe existente), adicionar seção **"Unidades DP"** listando as unidades daquela `company_id` (nome + cidade), com botão "Gerenciar unidades" que navega para `/dp/cadastros/unidades` e pré-seleciona a empresa no contexto (opcional: query string `?company=<id>`).
- Contagem simples: badge com número de unidades ao lado do nome da empresa no card.
- Query nova: hook `useUnidadesByCompany(companyIds)` fazendo `select("company_id, id, nome, cidade").in("company_id", ids)` para popular badges e lista.

### 4. Cobrança / quota
- **Sem alteração**. A cobrança continua atrelada a `companies` (via `useCompanyQuota`). Múltiplas unidades DP por empresa não impactam a cota.
- Documentar isso na descrição do campo empresa no dialog: "A cobrança do plano é por empresa. Uma empresa pode ter várias unidades sem custo adicional."

## Fora de escopo
- Não criar tabela nova, não mudar RLS, não mexer em billing/quota.
- Não permitir criar empresa direto do DP (o usuário optou por só selecionar existentes).
- Não alterar Sindicatos, Cargos, Colaboradores.

## Validação
- Typecheck.
- Preview `/dp/cadastros/unidades`: Select de Empresa no dialog, coluna Empresa na tabela.
- Preview `/empresas`: badge/contagem de unidades e lista das unidades vinculadas.

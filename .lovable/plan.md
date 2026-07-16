## Objetivo

Reestruturar `src/pages/dp/DpUnidades.tsx` para seguir o padrão visual e estrutural da documentação `pakere1996/portalcolaborador` (`src/pages/admin/Unidades.tsx`) e da imagem em anexo, sem alterar cores nem tokens do 360°FOOD.

## Referência (doc GitHub + print)

- Layout centralizado `max-w-6xl mx-auto`.
- Cabeçalho: ícone `Building2` + h1 "Unidades" + subtítulo "Cadastre e gerencie as unidades, seus cargos e sindicatos patronais." — à direita `FavoriteToggle` + botão pill vermelho **"+ Nova Unidade"**.
- Card arredondado (`rounded-2xl`, borda + `shadow-sm`) com tabela nativa de 6 colunas:
  - **UNIDADE** (nome em negrito + endereço em `text-xs text-muted-foreground` embaixo)
  - **CNPJ** (mono, oculta em mobile)
  - **CARGOS** (badge redondo azul: `bg-blue-100 text-blue-800` com ícone `ListChecks` + contagem)
  - **SIND. PATRONAIS** (badge redondo roxo: `bg-purple-100 text-purple-800` com ícone `Users` + contagem)
  - **STATUS** (toggle `Switch` para ativar/inativar direto)
  - **AÇÕES** (ícones ghost Pencil / Trash2)
- Linha inteira clicável → abre dialog de visualização com detalhes da unidade (nome, CNPJ, endereço, cidade, telefone, status, relógio de ponto, adiantamento).
- Empty state "Nenhuma unidade cadastrada." em `p-12 text-center`.
- Header uppercase `text-[10px] tracking-wider`.

## Mudanças

### 1. `src/hooks/useDpCadastros.tsx` — enriquecer `useDpUnidades`

- Retornar contagens por unidade em uma única query (join agregado usando `select("*, dp_unidade_cargos(count), dp_sindicato_unidades!inner(sindicato_id, dp_sindicatos!inner(tipo))")` ou 3 queries separadas + merge no lado do cliente).
- Solução escolhida: manter query principal simples e adicionar duas queries auxiliares por company (`dp_unidade_cargos` agrupado por `unidade_id`; `dp_sindicato_unidades` join com `dp_sindicatos` filtrado por `tipo = 'patronal'` agrupado por `unidade_id`). Fazer o merge no hook, expondo `cargos_count` e `sindicatos_patronais_count` no tipo retornado (`DpUnidadeWithCounts`).
- Adicionar `useToggleDpUnidadeAtivo({ id, ativo })` que faz `update({ ativo }).eq("id", id)` e invalida `dp_unidades`.

### 2. `src/pages/dp/DpUnidades.tsx` — reescrever

Estrutura:

```text
DpPage (max-w-6xl)
├── Helmet
├── DpPageHeader (Building2, "Unidades", subtítulo)
│   └── actions: FavoriteToggle + Button pill "+ Nova Unidade"
├── Card rounded-2xl border shadow-sm
│   └── <table>
│       ├── thead uppercase text-[10px]: UNIDADE | CNPJ | CARGOS | SIND. PATRONAIS | STATUS | AÇÕES
│       └── tbody
│           └── <tr onClick=view> hover:bg-muted/20 cursor-pointer
│               ├── UNIDADE: nome bold + endereço abaixo
│               ├── CNPJ formatado (mono, hidden md:table-cell)
│               ├── Badge CARGOS (azul)
│               ├── Badge SIND. PATRONAIS (roxo)
│               ├── Switch STATUS (stopPropagation → toggle mutation)
│               └── Ícones Editar/Excluir (stopPropagation)
├── Dialog Criar/Editar (mantém campos atuais: nome, CNPJ, endereço, cidade, UF, telefone, relógio de ponto, adiantamento, ativo)
├── Dialog Visualização (grid 2 col: Nome, CNPJ, Endereço, Cidade, Telefone, Status, Relógio de Ponto, Adiantamento)
└── AlertDialog Excluir
```

Formatação CNPJ: helper local `formatCNPJ` (14 dígitos → `00.000.000/0000-00`).

### 3. Sem alterações em banco

Toda a informação já existe (`dp_unidades`, `dp_unidade_cargos`, `dp_sindicato_unidades`, `dp_sindicatos.tipo`). Nenhuma migration.

## Fora de escopo

- Não alterar paleta, tokens de cor semânticos ou tipografia base (uso pontual de `bg-blue-100 / bg-purple-100` para badges de contagem para bater com o print — cores neutras Tailwind, não tokens de marca).
- Não editar Cargos, Colaboradores, Sindicatos ou hub Cadastros.
- Não mexer em rotas ou sidebar.
- Não adicionar edição inline de sindicatos/cargos vinculados à unidade (o repo de referência tem, mas está fora do padrão desta iteração — mantemos apenas exibição de contagens).

## Validação

- Typecheck `tsgo`.
- Preview `/dp/cadastros/unidades`: cabeçalho + botão pill vermelho, tabela com 6 colunas, badges de cargos/sindicatos, toggle status funcional, linha clicável abre visualização.

## Objetivo

Reestruturar `src/pages/dp/DpCargos.tsx` para seguir exatamente o padrão da documentação do repositório `pakere1996/portalcolaborador` (arquivo `src/pages/admin/Cargos.tsx`) e da imagem em anexo, mantendo cores e tokens de design do 360°FOOD.

## Referência (documentação GitHub)

- Layout centralizado (`max-w-4xl mx-auto`), sem hero pesado.
- Cabeçalho: ícone `Briefcase` + título "Cargos" + subtítulo "Gerencie os cargos disponíveis na empresa.", com `FavoriteToggle` + botão pill **"+ Novo Cargo"** à direita.
- Tabela em card arredondado (`rounded-2xl`, `overflow-hidden`, borda + shadow-sm) com apenas 3 colunas: **NOME** (uppercase, negrito), **DESCRIÇÃO** (oculta em mobile), **AÇÕES** (Editar / Excluir como ícones ghost).
- Nome do cargo exibido em **UPPERCASE** e negrito na linha.
- Linha inteira clicável → abre Dialog de visualização com detalhes (nome, descrição, datas).
- Formulário (criar/editar): apenas **Nome do Cargo** (obrigatório) + **Descrição** (textarea opcional). Sem CBO, salário base e status.
- Diálogo de exclusão com AlertDialog e mensagem específica para FK (colaborador vinculado).

## Mudanças

### 1. Backend — adicionar coluna `descricao`

Migration em `dp_cargos` (a doc usa apenas nome + descricao; a nossa tabela ainda não tem `descricao`):

```sql
ALTER TABLE public.dp_cargos ADD COLUMN IF NOT EXISTS descricao text;
```

Sem alterações em RLS, grants ou índices — já existentes cobrem a nova coluna.

Campos `cbo`, `salario_base`, `ativo` permanecem na tabela (não removidos) para não quebrar dados existentes / relações, apenas deixam de ser expostos nesta tela.

### 2. Hook `useDpCadastros.tsx`

- Adicionar `descricao?: string | null` ao payload aceito por `useUpsertDpCargo` (o tipo já sai automaticamente do regenerador Supabase após a migration).

### 3. `src/pages/dp/DpCargos.tsx` — reescrever no padrão da referência

Estrutura:

```text
DpPage (max-w-4xl)
├── Helmet
├── Header
│   ├── Briefcase + h1 "Cargos" + subtítulo
│   └── [FavoriteToggle] [Button pill "+ Novo Cargo"]
├── Card arredondado (bg-card, border, rounded-2xl, shadow-sm)
│   └── <table> — colunas: NOME | DESCRIÇÃO (md+) | AÇÕES
│       ├── Cabeçalho uppercase text-[10px] tracking-wider
│       ├── Linhas: hover:bg-muted/20 + cursor-pointer
│       │   ├── Nome: font-bold uppercase
│       │   ├── Descrição: text-muted-foreground ou "—"
│       │   └── Ações: ícones Pencil / Trash2 (ghost, size-8)
│       └── Empty state: "Nenhum cargo cadastrado."
├── Dialog Criar/Editar (nome + descrição)
├── Dialog Visualização (nome, descrição, criado em, atualizado em)
└── AlertDialog Excluir (com mensagem FK 23503)
```

Notas:
- Usar componentes existentes `DpPage`, `DpPageHeader`, `FavoriteToggle`.
- Botão "Novo Cargo" com classe `rounded-full px-6` para bater com a pill vermelha do print.
- Sem mudanças em `src/index.css` — reaproveita tokens semânticos (`bg-card`, `border-border`, `text-muted-foreground`, `text-primary`, `text-destructive`).

### 4. Consumidores da tabela em outras páginas

Nenhuma alteração — `DpColaboradores` e demais lugares continuam usando `useDpCargos()` retornando `nome`, então continuam funcionando.

## Fora de escopo

- Não alterar paleta, tokens de cor, gradientes ou tipografia.
- Não mexer em Colaboradores, Unidades, Sindicatos ou hub Cadastros.
- Não remover colunas do banco (`cbo`, `salario_base`, `ativo` ficam preservadas).
- Não alterar rotas nem sidebar.

## Validação

- `tsgo` typecheck.
- Abrir `/dp/cadastros/cargos` no preview e conferir com o print anexado: header, botão pill, tabela com nome em uppercase, linha clicável abrindo visualização, dialog de criação com apenas nome + descrição.

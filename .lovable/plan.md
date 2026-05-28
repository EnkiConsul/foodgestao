## Objetivo

Hoje o super admin já edita parte das informações dos planos em `/admin/planos` (nome, descrição, preço, trial, limites e alguns recursos booleanos). Porém, a landing page mostra alguns elementos que **não são editáveis** pelo admin:

1. **Selo "Mais popular"** — está fixo no código para o plano com `slug === "pro"`.
2. **Tipo de suporte** ("Suporte por comunidade / e-mail / prioritário / dedicado") — vem de `features.support`, mas o editor de plano não tem esse campo.
3. **Ordem em que o plano aparece** — já existe `sort_order`, mas vamos garantir que está claro no editor.

O plano abaixo cobre essas lacunas para que o super admin controle 100% do que aparece nos cards de planos da LP.

## O que será feito

### 1. Banco de dados (migration)
- Adicionar coluna `is_featured boolean not null default false` na tabela `plans`. Esse será o controle do selo "Mais popular".
- Adicionar coluna opcional `featured_label text` (default `'Mais popular'`) caso o admin queira customizar o texto do selo.

### 2. Editor de plano (`PlanEditorDialog.tsx`)
Adicionar novos controles:
- **Switch "Destaque (Mais popular)"** → grava em `is_featured`.
- **Input "Texto do selo de destaque"** → grava em `featured_label` (só aparece quando destaque está ligado).
- **Select "Tipo de suporte"** com opções: Comunidade, E-mail, Prioritário, Dedicado, Nenhum → grava em `features.support`.
- Pequeno texto de ajuda nos campos `sort_order`, `is_active`, `is_public` para deixar claro o efeito na LP.

### 3. Listagem admin (`AdminPlans.tsx`)
- Mostrar badge "Destaque" no card quando `is_featured = true`.
- Exibir o tipo de suporte resumido junto dos demais limites.

### 4. Landing page (`src/pages/Landing.tsx`)
- Buscar também `is_featured` e `featured_label` na query de `plans`.
- Trocar `const featured = p.slug === "pro"` por `const featured = p.is_featured`.
- Usar `p.featured_label ?? "Mais popular"` no `<Badge>`.
- Nenhuma outra mudança visual — nome, descrição, preço, trial e lista de recursos já vêm da tabela.

### 5. Página pública `/planos` (`src/pages/Planos.tsx`)
- Mesma adaptação: usar `is_featured` para destacar visualmente o plano (borda/realce) e mostrar o selo, mantendo consistência com a LP.

## Observações técnicas
- Os tipos do Supabase (`src/integrations/supabase/types.ts`) são regenerados automaticamente após a migration.
- Não muda RLS: `plans` já tem políticas para leitura pública e escrita restrita a super admin.
- Não há mudança de business logic — apenas exibição/edição.

## Fora do escopo
- Reordenar features arrastando, criar novos tipos de feature dinamicamente, ou editar textos genéricos da seção (título "Comece grátis. Evolua quando precisar.", FAQ etc.). Se quiser, posso planejar isso em uma etapa separada.
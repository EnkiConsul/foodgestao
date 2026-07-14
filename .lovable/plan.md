## Objetivo

Uniformizar todas as categorias (padrão 360°FOOD, legadas e novas) no mesmo modelo estrutural: **ID Interno**, **Subtipo**, **Descrição para IA**, além dos campos já existentes. Backfill automático para categorias existentes e reforço de obrigatoriedade nos formulários.

---

## 1. Banco de dados (migração)

**Backfill do `template_code` para categorias legadas**
- Gerar `USR-0001`, `USR-0002`... por usuário (ordenado por `created_at`) para toda categoria com `template_code IS NULL`.
- Formato: `USR-####` sequencial por `user_id`, zero-padded em 4 dígitos.
- Após o backfill, `template_code` continua único por `(user_id, company_id, template_code)`.

**Regra de imutabilidade**
- Trigger `BEFORE UPDATE` em `categories`: se `OLD.template_code IS NOT NULL`, bloqueia mudança. Se `OLD.template_code IS NULL`, permite definir uma única vez.

**Auto-geração no INSERT**
- Trigger `BEFORE INSERT` em `categories`: se `template_code` vier NULL, gera automaticamente `USR-####` continuando a sequência do usuário. Categorias vindas do seed 360°FOOD (com código tipo `1.1.01`) mantêm o código original.

**Subtipo obrigatório**
- Trigger de validação (não CHECK, para permitir migração gradual): `BEFORE INSERT OR UPDATE` — se `category_subtype IS NULL` a partir de agora, rejeita com mensagem clara.
- Backfill: categorias legadas sem subtipo recebem valor derivado do `transaction_type`:
  - `receita` → `receita`
  - `despesa` → `despesa` (padrão neutro; usuário pode reclassificar depois em Custo/Imposto/Investimento)

**Ordem da migração**
1. Backfill `template_code` (USR-####) em categorias existentes.
2. Backfill `category_subtype` derivado de `transaction_type`.
3. Criar trigger de auto-geração de `template_code`.
4. Criar trigger de imutabilidade de `template_code`.
5. Criar trigger de obrigatoriedade de `category_subtype`.

---

## 2. Formulário `CategoryFormDialog.tsx`

**Campo ID Interno (novo bloco visível sempre)**
- Nova categoria: input desabilitado com placeholder "Será gerado automaticamente (USR-####)".
- Edição de categoria legada com `template_code` já preenchido: input read-only mostrando o valor + tooltip "Imutável — preserva histórico dos lançamentos".
- Edição de categoria com `template_code` do plano padrão (ex: `1.1.01`): read-only + badge "Plano 360°FOOD".

**Campo Subtipo — passa a ser obrigatório**
- Remover a opção "Nenhum" do Select.
- Adicionar asterisco no Label e validação Zod: `category_subtype: z.enum([...6 valores])`.
- Toast de erro claro se o usuário tentar salvar sem escolher.

**Campo Descrição para IA — mantém opcional**
- Já existe. Sem mudanças além de reforçar o texto de ajuda.

**Bloco "Rastreabilidade" (existente)**
- Passa a aparecer sempre que houver `template_code` (todas as categorias após o backfill) — não só as do plano padrão.
- Mostra `template_code` e, se houver, `previous_index`.

---

## 3. Listagem `Categorias.tsx`

- Nova coluna/badge visível: **ID Interno** (`template_code`) em todas as linhas — hoje só aparece nas do plano padrão.
- Badge de **Subtipo** já existente continua igual.
- Sem mudanças no botão "Importar plano 360°FOOD".

---

## 4. Validações `src/lib/validations.ts`

Atualizar `categorySchema`:

```ts
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  transaction_type: z.enum(["receita", "despesa"]),
  color: z.string().max(20).optional().nullable(),
  category_subtype: z.enum(["receita","saida","custo","despesa","imposto","investimento"], {
    required_error: "Subtipo é obrigatório",
  }),
});
```

---

## 5. Impactos colaterais verificados

- **Onboarding `StepCategories.tsx`**: se cria categorias avulsas (PF), passar subtipo automático derivado do tipo.
- **Import de plano padrão**: já grava subtipo — sem mudanças.
- **Relatórios contábeis** (`BalanceSheet`, `DreReport`, `AccountTreeTable`): passam a ter 100% de cobertura de subtipo — melhora agrupamentos, não quebra nada.
- **Agente IA (`plin-ia-context.ts`)**: sem mudanças; continua lendo `ai_description` quando existir.
- **Lançamentos existentes**: nenhum é tocado — vínculo permanece por `category_id` (UUID).

---

## Detalhes técnicos

**SQL do backfill de template_code (resumo)**
```sql
WITH numbered AS (
  SELECT id, user_id,
    'USR-' || LPAD(ROW_NUMBER() OVER (
      PARTITION BY user_id ORDER BY created_at, id
    )::text, 4, '0') AS new_code
  FROM public.categories
  WHERE template_code IS NULL
)
UPDATE public.categories c
SET template_code = n.new_code
FROM numbered n
WHERE c.id = n.id;
```

**Trigger auto-gen no INSERT**
- Usa `MAX(substring(template_code FROM 'USR-(\d+)'))::int + 1` por `user_id`.

**Trigger imutabilidade**
- `RAISE EXCEPTION 'ID Interno não pode ser alterado após definido'` quando `OLD.template_code IS NOT NULL AND NEW.template_code IS DISTINCT FROM OLD.template_code`.

---

## Arquivos a alterar

- **Migração nova** (schema + backfill + triggers)
- `src/lib/validations.ts` — subtipo obrigatório
- `src/components/categories/CategoryFormDialog.tsx` — bloco ID Interno sempre visível, Subtipo obrigatório
- `src/pages/Categorias.tsx` — badge ID Interno em todas as linhas
- `src/components/onboarding/StepCategories.tsx` — passar subtipo default nas categorias avulsas (se houver criação direta)

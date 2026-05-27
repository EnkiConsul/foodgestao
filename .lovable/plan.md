## Problema

No formulário "Novo Lançamento", os selects de **Conta**, **Categoria**, **Cliente/Fornecedor** e **Forma de pagamento** abrem com o contador correto (ex.: "17") mas a lista renderiza em branco. Além disso, ao criar um item em outro módulo, o select só atualiza após fechar e reabrir o modal — e os itens aparecem só como texto, sem cor/ícone/badge do módulo de origem.

## Causa raiz

1. **Bug de render**: `SearchableSelect` usa `@tanstack/react-virtual` dentro do `Popover` do Radix. Quando o popover monta dentro do Dialog, o `parentRef` mede `clientHeight = 0` antes do popover ser posicionado; o virtualizador calcula `getVirtualItems() = []` e nunca remede, resultando em lista vazia mesmo com `filtered.length = 17`.
2. **Sem realtime**: o form carrega lookups com `useState` + `reloadLookups()` em `useEffect([open])`. Itens criados em outras telas (ou em outra aba) não chegam até reabrir.
3. **Visual genérico**: as opções renderizam apenas `label` string; perdem cor da conta/categoria, badge do contato, etc.

## O que será feito

### 1. Corrigir renderização do `SearchableSelect`
Substituir a virtualização por lista simples com `max-height: 320px` + `overflow-auto`. Listas no app têm dezenas (não milhares) de itens, então virtualizar é overhead e está quebrando dentro do Popover. Manter busca debounced, navegação por teclado, indentação por `depth` e contador.

### 2. Suporte a conteúdo rico em `SearchableSelectOption`
Estender o tipo para aceitar elementos visuais opcionais:

```ts
interface SearchableSelectOption {
  value: string;
  label: string;
  depth?: number;
  keywords?: string;
  leading?: ReactNode;   // ícone/cor/avatar à esquerda
  trailing?: ReactNode;  // badge à direita
  description?: ReactNode; // linha secundária pequena
}
```

O trigger (botão fechado) também passa a renderizar `leading` da opção selecionada.

### 3. Espelhar visual de cada módulo nos selects

- **Conta** (`ContasBancarias`): bolinha colorida `account.color` + ícone `account.icon` (Lucide) + nome.
- **Categoria** (`Categorias`): bolinha colorida `category.color` + nome, com indentação hierárquica já existente via `depth`.
- **Cliente/Fornecedor** (`Contatos`): avatar circular com iniciais sobre `bg-primary/10` + nome + badge de tipo (`cliente`/`fornecedor`/`ambos`) com as mesmas cores do módulo.
- **Forma de pagamento** (`FormasPagamento`): nome + badge "Pessoal"/empresa quando aplicável (mesmo padrão de visibilidade).

### 4. Sincronização em tempo real

- Migrar os 4 lookups do form (`accounts`, `categories`, `contacts`, `payment_methods` + as junctions `category_companies` e `contact_companies`) para `useQuery` com `queryKey` estável por usuário.
- Estender `useRealtimeSync` para aceitar `"contacts" | "payment_methods"` além das tabelas atuais.
- No `TransactionFormDialog`, subscrever as 4 tabelas via `useRealtimeSync` e invalidar os queryKeys correspondentes (`["form-accounts", userId]`, etc.). Resultado: criar uma categoria na aba Categorias atualiza o select aberto no modal sem fechar.
- Migration: garantir que `categories`, `accounts`, `contacts`, `payment_methods`, `category_companies`, `contact_companies` estão em `supabase_realtime` (`ALTER PUBLICATION ... ADD TABLE`, idempotente via DO block).

### 5. Manter dialogs inline funcionando
Os botões `+` ao lado de cada select já abrem o dialog do módulo. Após salvar, em vez de chamar `reloadLookups()`, basta invalidar a query — o efeito é o mesmo do realtime, garantindo update imediato mesmo se o realtime falhar.

## Arquivos afetados

- `src/components/ui/searchable-select.tsx` — remover virtualizer, adicionar `leading`/`trailing`/`description`.
- `src/components/transactions/TransactionFormDialog.tsx` — converter lookups para React Query, mapear opções com visual rico, subscrever realtime, invalidar nas callbacks dos `+`.
- `src/hooks/useRealtimeSync.tsx` — adicionar `"contacts"` e `"payment_methods"` ao union `RealtimeTable`.
- Nova migration: `ALTER PUBLICATION supabase_realtime ADD TABLE` para as tabelas que faltarem (idempotente).
- Memória atualizada: `mem://features/transaction-form` para refletir realtime + visual rico nos selects.

## Fora de escopo

- Não alterar o esquema do banco nem regras de RLS/visibilidade.
- Não tocar nos demais formulários (Orçamento, etc.) — embora o fix do `SearchableSelect` beneficie qualquer lugar que o use.

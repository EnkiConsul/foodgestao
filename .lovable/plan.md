## Bloco 2 — Modal de método de cadastro de conta

Interpor um passo de escolha entre **Open Finance** e **Manual** antes do formulário atual. Sem alterar o `AccountFormDialog` existente e sem tocar em RPCs, RLS ou edge functions (isso é dos blocos seguintes).

### Escopo

- Novo componente `AccountCreationMethodDialog`.
- Refator do trigger em `src/pages/ContasBancarias.tsx` para abrir o novo modal em vez do formulário direto (apenas no caminho "criar"; "editar" continua indo direto ao `AccountFormDialog`).
- Nenhuma migração, RPC, policy, hook ou edge function neste bloco.

### Fora do escopo (blocos 3–8)

- Refino do fluxo manual (Bloco 3).
- `OpenFinanceAccountWizard` e integração Pluggy no front (Bloco 4).
- Criação/vínculo, cards/estados, conciliação, segurança/testes (5–8).

### Arquivos

**Novo**
- `src/components/accounts/AccountCreationMethodDialog.tsx`
  - Props: `open`, `onOpenChange`, `onSelectManual()`, `onSelectOpenFinance()`.
  - Layout: `Dialog` shadcn, título "Adicionar conta financeira", dois cards lado a lado (empilhados no mobile via `grid gap-3 md:grid-cols-2`).
  - Card Open Finance: badge `Recomendado` (variant secondary laranja `bg-primary/10 text-primary`), ícone `Link2`/`Zap`, título "Conectar por Open Finance", descrição curta ("Sincronize saldos e extratos automaticamente com seu banco"), bullets de benefícios (automação, atualização diária, menos digitação), botão primário "Conectar com Open Finance".
  - Card Manual: ícone `Pencil`, título "Cadastrar manualmente", descrição ("Informe os dados da conta e lance/importe extratos por conta própria"), bullets (controle total, importação de extrato, sem conexão bancária), botão outline "Cadastrar manualmente".
  - Sem cores/textos/logos de terceiros; usa tokens de `index.css` (`primary`, `muted`, `card`). Cards clicáveis inteiros (`role="button"`, `aria-label`, foco visível).
  - Acessibilidade: `DialogTitle`, `DialogDescription`, botão de fechar padrão.

**Alterado**
- `src/pages/ContasBancarias.tsx`
  - Novo estado `methodOpen`.
  - Trocar cada handler de "criar nova" (header desktop L166–167, empty-state L245, FAB mobile L339) para `setEditAccount(null); setMethodOpen(true)`.
  - Manter os handlers de "editar" (L315) apontando direto ao `AccountFormDialog`.
  - Callbacks do novo modal:
    - `onSelectManual`: fecha o método, abre `AccountFormDialog` (`setDialogOpen(true)`).
    - `onSelectOpenFinance`: fecha o método e chama `toast({ title: "Em breve", description: "A conexão via Open Finance será liberada no próximo bloco." })` — placeholder até o Bloco 4. Não navega, não cria conexão.
  - Renderizar `<AccountCreationMethodDialog />` ao lado do `AccountFormDialog` existente.

### Notas de UX

- Mobile: cards em coluna única, botões `h-11`, hierarquia primária/outline mantida.
- Identidade 360°FOOD: laranja `#EB6119` no badge/primary, marinho no texto forte; sem gradientes/copywriting de concorrentes.
- Nenhuma alteração em cards de listagem (Bloco 6).

### Entregáveis do bloco

- Arquivos criados: `AccountCreationMethodDialog.tsx`.
- Arquivos alterados: `ContasBancarias.tsx`.
- Migrations/RPCs/Policies/Testes: nenhum.
- Resultado esperado: clicar em "Nova Conta" (desktop, FAB mobile, empty-state) abre o modal de escolha; "Manual" segue para o formulário atual; "Open Finance" mostra toast placeholder.
- Pendências: Blocos 3–8 conforme prompt.

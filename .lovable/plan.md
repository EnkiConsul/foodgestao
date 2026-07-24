
## Contexto

A página Open Finance já está implementada e roteada em `/open-finance` (registrada em `src/App.tsx` linha 319), mas **não existe link para ela em nenhum menu** — nem na sidebar principal, nem em Configurações, nem em Contas Bancárias. Único acesso hoje é digitando a URL manualmente.

## Objetivo

Tornar Open Finance descobrível adicionando o link no menu lateral, próximo aos módulos financeiros.

## Onde adicionar

Sidebar principal (`src/components/AppSidebar*` — a ser confirmado durante a implementação), seção **FINANCEIRO 360°**, logo após "Fluxo de Caixa" e antes de "Orçamento":

```text
FINANCEIRO 360°
  Dashboard
  Lançamentos
  Fluxo de Caixa
  Open Finance      ← novo
  Orçamento
  Relatórios
```

Ícone: `Landmark` ou `Building2` do lucide-react (coerente com o ícone de banco já usado no empty state da página).

## Visibilidade

- Exibir apenas para contexto **PJ** (empresa ativa) — Open Finance opera sobre `open_finance_connections` escopadas a `company_id`. No contexto PF, o item fica oculto.
- Não requer papel especial: qualquer usuário membro da empresa que já vê "Lançamentos" verá "Open Finance".

## Alternativa complementar (opcional)

Adicionar também um botão/CTA "Conectar via Open Finance" na página **Contas Bancárias**, já que é ali que o usuário pensa primeiro em vincular um banco. Ficaria como botão secundário ao lado de "Nova conta bancária", navegando para `/open-finance`.

## Detalhes técnicos

1. Ler o componente de sidebar em uso (`src/components/AppSidebar.tsx` ou equivalente) para identificar o padrão exato de item (label, ícone, `to`, permissões).
2. Inserir a nova entrada respeitando o padrão de `translate-x-1` + transição 200ms já memorizado.
3. Envolver a entrada em condicional de contexto PJ (padrão já usado por outros itens exclusivos PJ na sidebar — confirmar durante a implementação).
4. Opcional: adicionar `<Button variant="outline">` em `src/pages/ContasBancarias.tsx` que faz `navigate('/open-finance')`.

## Fora do escopo

- Nenhuma mudança em rotas, RPCs, edge functions ou lógica da página `/open-finance`.
- Nenhuma mudança visual dentro da própria página Open Finance.



## Melhorar Visualizacao da Pagina Contas Bancarias

### Problemas Identificados
- Cards de resumo (Saldo Total, Contas Ativas) muito simples, sem cor ou destaque
- Cards de conta bancaria com aparencia de "lista" sem hierarquia visual
- Icones e badges sem contraste com a identidade visual da plataforma (azul escuro #1B3A5C)
- Falta de uso das cores da plataforma (verde para valores positivos, vermelho para negativos)

### Melhorias Planejadas

**1. Cards de Resumo (Saldo Total / Contas Ativas)**
- Adicionar fundo com gradiente sutil usando a cor primaria (azul escuro)
- Icones decorativos nos cards de resumo
- Texto com melhor hierarquia visual

**2. Cards de Conta Bancaria**
- Icone da conta com fundo mais visivel usando a cor da conta ou primaria
- Saldo positivo em verde (#27AE60), negativo em vermelho (#E74C3C)
- Badge de tipo com cores mais visiveis
- Borda lateral colorida para destaque visual
- Espacamento e padding melhorados

**3. Contraste Geral**
- Botoes de acao (editar/excluir) com hover mais evidente
- Switch com cores mais contrastantes
- Melhor separacao visual entre elementos

### Detalhes Tecnicos

Arquivo a ser modificado: `src/pages/ContasBancarias.tsx`

Alteracoes principais:
- Cards de resumo: adicionar classes de fundo `bg-primary text-primary-foreground` no card de saldo e `bg-muted` no card de contas ativas, com icones `Wallet` e `Landmark`
- Cards de conta: adicionar `border-l-4` com cor dinamica da conta, aumentar o icone container para `h-10 w-10`, aplicar `text-success` para saldos positivos
- Badge de tipo: usar `bg-primary/10 text-primary` em vez do `variant="secondary"` padrao
- Botoes de acao: cores mais explicitas no hover

Nenhuma alteracao de banco de dados ou dependencias novas necessaria.

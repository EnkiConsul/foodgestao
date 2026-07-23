## Adicionar botão "Voltar" para a Landing Page em `/auth`

**Escopo:** apenas UI da página `src/pages/Auth.tsx`.

### Mudança
- Inserir um botão discreto no topo do card (ou acima dele) com ícone `ArrowLeft` + texto "Voltar ao site", usando `<Link to="/">` do `react-router-dom`.
- Estilo: `variant="ghost"` do shadcn, alinhado à esquerda, cor `text-muted-foreground` com hover `text-primary` — coerente com o restante do design 360°FOOD (sem hardcode de cor).
- Também aplicar o mesmo botão em `/primeiro-acesso` e `/esqueci-senha` para consistência de navegação nas telas públicas de auth.

### Detalhes técnicos
- Nenhuma mudança de lógica, rotas, hooks, backend ou validação.
- Import: `ArrowLeft` de `lucide-react`, `Link` de `react-router-dom` (já usados no projeto).
- Sem alteração de layout responsivo — botão fica acima do `<Card>` centralizado.

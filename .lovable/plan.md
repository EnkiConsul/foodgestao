## Substituir a tag do Google Analytics

Trocar o ID antigo `G-3B98VTL39B` pelo novo `G-Z52R86F1JE`, mantendo apenas uma tag do Google por página conforme recomendação.

### Alterações
- `index.html`: atualizar o `<script src="...?id=...">` e a chamada `gtag('config', ...)` para `G-Z52R86F1JE`.
- `src/hooks/usePageviewTracking.ts`: atualizar a constante `GA_ID` para `G-Z52R86F1JE` para que os pageviews em SPA sejam enviados ao novo container.

Nenhuma outra referência ao ID antigo precisa mudar.

## Alterar mensagem de erro de senha fraca no cadastro

### Problema
Ao criar conta com senha comprometida/fraca, o Supabase Auth retorna a mensagem em inglês:
> "Password is known to be weak and easy to guess, please choose a different one."

### Solução
Interceptar a mensagem de erro no frontend (`src/pages/Auth.tsx`) e exibir em português com orientações claras.

### Alteração
1. Criar mapeamento/tradução para mensagens de erro do Supabase Auth no submit de cadastro.
2. Substituir a mensagem de senha fraca por:
   > "Senha comprometida ou muito fraca. Escolha uma senha diferente com no mínimo 6 caracteres, misturando letras, números e símbolos."
3. Manter fallback para mensagens não mapeadas (exibe o texto original).
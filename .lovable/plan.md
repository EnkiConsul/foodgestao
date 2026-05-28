## Finalização da Conformidade LGPD

Concluir os 3 pontos pendentes da implementação anterior.

### 1. Checkbox de aceite de termos no cadastro (`src/pages/Auth.tsx`)
- Adicionar `<Checkbox>` obrigatório no formulário de signup com label: "Li e aceito os [Termos de Uso](/termos) e a [Política de Privacidade](/privacidade)".
- O schema Zod já exige `acceptTerms: z.literal(true)` — conectar o estado do checkbox ao schema.
- Após `supabase.auth.signUp` bem-sucedido, inserir 2 registros em `legal_acceptances` (um para `terms`, outro para `privacy`) com `document_version: "1.0"`, `user_agent: navigator.userAgent` e `ip_address: null` (IP real fica a cargo do edge se necessário no futuro).
- Bloquear submit visualmente quando não marcado (já validado por Zod).

### 2. Posicionar cards em Configurações (`src/pages/Configuracoes.tsx`)
- Criar/usar uma seção "Privacidade e Dados (LGPD)" no final da página.
- Renderizar `<ExportMyDataCard />` e `<DeleteMyAccountCard />` lado a lado em desktop, empilhados em mobile (`grid gap-4 md:grid-cols-2`).

### 3. Sincronizar tipos do Supabase
- Tipos são auto-gerados; após o usuário aprovar a aplicação, o sistema regenera `src/integrations/supabase/types.ts` automaticamente. Não há ação manual aqui — apenas confirmar que `legal_acceptances` aparece nos tipos antes de continuar.

### Fora de escopo
- Sem alteração de schema (tabela `legal_acceptances` já existe).
- Sem novas edge functions.
- Sem mudanças em conteúdo legal ou rotas públicas (já implementadas).

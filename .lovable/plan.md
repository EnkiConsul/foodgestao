# Usar o banco do 360°FOOD dentro do Codex

Objetivo: trabalhar no código do projeto pelo Codex (via GitHub) conseguindo consultar o banco e preparar alterações de banco, com escrita controlada e revisada.

## O que é possível hoje

O banco deste projeto é gerenciado pelo Lovable Cloud. Isso muda o que o Codex consegue fazer:

- Consultar dados: sim, usando a chave pública do projeto, respeitando as mesmas regras de acesso do app (cada usuário só vê o que tem direito).
- Alterar dados e estrutura: as senhas administrativas do banco não são disponibilizadas fora do Lovable. Então o Codex prepara os arquivos de alteração, e a aplicação no banco continua acontecendo aqui, com sua aprovação — o que já é a regra de trabalho definida no projeto.

Isso mantém o combinado de "leitura e escrita controlada": leitura livre, escrita sempre revisada.

## Passos

1. Preparar o ambiente local
   - Clonar o repositório do GitHub e instalar as dependências.
   - Criar o arquivo de variáveis locais com o endereço do projeto e a chave pública (os mesmos valores que o app já usa). Nada disso é segredo.
   - Rodar o app localmente apontando para o banco do projeto, com login normal de usuário.

2. Consultas no Codex
   - Adicionar um script de leitura no repositório (`scripts/db/consulta.ts`), que aceita uma consulta e imprime o resultado, autenticando como um usuário real do projeto.
   - Regras: somente leitura; nada de dados sensíveis em log; usar sempre o escopo de empresa, como no app.

3. Alterações de banco pelo Codex
   - Criar a pasta e o padrão de nomes já usados no projeto para arquivos de alteração, com nota de rollback obrigatória em cada um.
   - Fluxo: Codex escreve o arquivo → abre pull request → revisão → aplicação aqui, mediante aprovação, e depois validação em cópia antes da origem, como já vem sendo feito.

4. Documentação curta
   - `docs/dev/codex-banco.md` com: o que o Codex pode e não pode fazer, como rodar as consultas, e o passo a passo de uma alteração de banco até a aprovação.

## Detalhes técnicos

- Variáveis locais: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — copiar do `.env` do projeto; são valores públicos protegidos por RLS.
- Script de consulta: `@supabase/supabase-js` com `signInWithPassword` de um usuário de teste; sem chave de serviço, sem conexão direta ao Postgres.
- Migrações: SQL idempotente, com bloco de rollback comentado; aplicação continua exclusivamente pela ferramenta de migração do Lovable, respeitando o freeze ativo (`.lovable/release-freeze.json`) — apenas hotfix bloqueante enquanto ele estiver em vigor.
- `.gitignore` já cobre `.env`; nenhum segredo entra no repositório.

## Fora do escopo

- Expor chave de serviço ou senha do banco (não disponíveis no Lovable Cloud).
- Qualquer mudança de layout, produto ou reescrita de módulos.
- Publicar frontend ou aplicar DDL na origem sem autorização.

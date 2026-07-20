# Plano: Dar ao Claude acesso à documentação e código do 360°FOOD

Para o Claude "conhecer" o projeto, o caminho correto **não é alterar o app** — é dar a ele acesso ao repositório GitHub do projeto. O Claude (Desktop, Code ou via API) lê arquivos do repositório e passa a ter contexto completo do código, migrations, edge functions e documentação.

Nenhuma alteração de código no Lovable é necessária. O passo dentro do Lovable é apenas garantir o sync com GitHub.

## Etapas

1. **Conectar o projeto Lovable ao GitHub** (se ainda não estiver)
   - No editor Lovable: menu **+** (canto inferior esquerdo do chat) → **GitHub** → **Connect project**
   - Autorizar o Lovable GitHub App
   - Escolher a conta/organização e criar o repositório
   - A partir daí o código sincroniza automaticamente nos dois sentidos

2. **Escolher como o Claude vai ler o repositório** (opções — você escolhe a que preferir)

   a) **Claude Code (CLI)** — recomendado para desenvolvimento
      - Clonar o repo localmente: `git clone <url-do-repo>`
      - Rodar `claude` dentro da pasta; ele indexa e responde com base no código real
      - Melhor opção para "me ajude a desenvolver essa feature"

   b) **Claude Desktop com MCP do GitHub**
      - Instalar o [GitHub MCP server](https://github.com/github/github-mcp-server) no Claude Desktop
      - Autenticar com um Personal Access Token (repo scope)
      - Claude passa a ler issues, PRs e arquivos do repo sob demanda

   c) **Anexar arquivos manualmente no chat do Claude**
      - Baixar o código (Code Editor → Download codebase, ou `git clone`)
      - Arrastar arquivos/pastas específicos na conversa
      - Bom para consultas pontuais, ruim para contexto contínuo

3. **Manter uma pasta `docs/` no repo** (opcional, mas recomendado)
   - Consolidar em `docs/` os arquivos de auditoria já existentes em `.lovable/auditoria/`, decisões de arquitetura, regras de negócio (PF/PJ, folha, DP) e o schema resumido
   - Assim o Claude encontra a documentação no mesmo lugar que o código
   - Isso pode ser feito depois, em build mode, se você quiser que eu monte a estrutura

## O que **não** vamos fazer

- Criar servidor MCP no app (isso seria expor dados do 360°FOOD a assistentes — outro caso de uso, e você já cancelou)
- Gastar créditos do Lovable AI ou mexer em edge functions
- Compartilhar chaves do Supabase/Cloud — o Claude só precisa do código-fonte

## Próximo passo sugerido

Confirmar se o projeto já está sincronizado com GitHub. Se estiver, você já pode conectar o Claude pelo caminho (a), (b) ou (c) acima — nada mais precisa ser feito dentro do Lovable. Se quiser, na sequência eu monto a pasta `docs/` consolidando auditorias e regras do projeto para o Claude ter contexto pronto.

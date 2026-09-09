# Mensagem de WhatsApp para acesso ao portal e nova senha

## Objetivo

Quando o gestor gerar o acesso ao portal ou redefinir a senha de um colaborador, o sistema deve oferecer, na mesma tela, o envio da mensagem pronta no WhatsApp, com link do portal, CPF de login e senha temporária.

## O que muda na prática

1. Dois modelos de mensagem passam a existir por padrão em cada empresa (editáveis em Pessoas 360° > Modelos de Mensagem):
   - **Acesso ao Portal do Colaborador** (novo acesso)
   - **Nova Senha do Portal** (redefinição)
2. Depois de gerar acesso ou redefinir/definir senha, o painel de acesso da ficha mostra o botão **Enviar no WhatsApp**, já com o modelo correspondente selecionado e os dados preenchidos.
3. Se o colaborador não tiver WhatsApp/telefone no cadastro, o botão fica desabilitado com o aviso do motivo.
4. As variáveis suportadas na mensagem passam a aceitar tanto `{{nome}}` quanto o formato com nome amigável usado hoje nos modelos (`{Nome do Colaborador}`, `{Nome da Empresa}`, `{Link do Portal}`, `{Usuário}`, `{Senha}`), sem quebrar os modelos já cadastrados.
5. A senha só aparece na mensagem no momento da geração/redefinição — recarregar a tela não recupera a senha.

### Texto padrão — novo acesso

```text
Oii {Nome do Colaborador}! 👋

Seu acesso ao Portal do Colaborador da {Nome da Empresa} está liberado.

🔗 Link: {Link do Portal}
👤 Usuário (CPF): {Usuário}
🔑 Senha temporária: {Senha}

Por segurança, troque a senha no primeiro acesso.
```

### Texto padrão — nova senha

```text
Olá {Nome do Colaborador}!

A senha do seu acesso ao Portal do Colaborador da {Nome da Empresa} foi redefinida.

🔗 Link: {Link do Portal}
👤 Usuário (CPF): {Usuário}
🔑 Nova senha: {Senha}

Recomendamos trocar a senha assim que entrar.
```

## Detalhes técnicos

- `dp_modelos_mensagem`: migração que insere os dois modelos (`tipo` = `acesso_portal` e `reset_senha`, canal `whatsapp`) para todas as empresas que ainda não os têm, com `ON CONFLICT`/guard por título+tipo. Nada é sobrescrito quando a empresa já editou o texto.
- `applyModeloVars` em `src/hooks/useDpModelosMensagem.tsx`: aceitar `{{chave}}` e `{Rótulo Amigável}`, com um mapa de sinônimos (`nome`, `empresa`, `link`, `usuario`, `senha`) e normalização sem acento/caixa. Chaves desconhecidas ficam intactas em vez de virarem vazio.
- `src/components/dp/WhatsappComposerDialog.tsx`: aceitar props `tipoPreferido` e `modeloIdInicial` para pré-selecionar o modelo, e usar o contexto recebido na primeira renderização.
- `src/components/dp/ColaboradorAcessoPanel.tsx`: no bloco de resultado, adicionar o botão que abre o composer com contexto `{ nome, empresa, link, usuario: cpf, senha }`; `link` = `${window.location.origin}/dp/meu` (rota do portal). Tipo escolhido conforme `resultado.kind`.
- Nome da empresa vem de `useCompanyContext` / lista de empresas já usada nas telas de DP.
- Testes: unitários de `applyModeloVars` (formato duplo, sinônimos, acento, chave desconhecida) e de montagem do texto final a partir do modelo padrão.
- Verificação: gerar acesso e redefinir senha no preview, conferindo o link `wa.me` gerado (sem enviar).

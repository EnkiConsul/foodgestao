# WhatsApp do acesso ao portal + senha provisória

## Objetivo

Ao gerar o acesso ao portal ou redefinir a senha de um colaborador, o gestor consegue enviar a mensagem no WhatsApp usando o modelo já cadastrado em Modelos de Mensagem, e a senha entregue vale como provisória: no primeiro login o colaborador é obrigado a criar a própria senha.

## O que muda na prática

1. Depois de gerar acesso, redefinir a senha ou definir uma senha específica, aparece o botão **Enviar no WhatsApp** na aba de acesso da ficha.
2. O texto vem do modelo cadastrado pela empresa (canal WhatsApp). Nada de texto fixo no sistema: para mudar a mensagem, basta editar o modelo.
   - Novo acesso: usa o modelo "Texto padrão — novo acesso Portal Colaborador".
   - Reset/nova senha: usa o modelo "Texto padrão — nova senha Portal Colaborador"; se ele não existir, cai no modelo de novo acesso.
   - Sem nenhum dos dois, o gestor escolhe qualquer modelo da lista; sem modelo algum, um aviso leva para Modelos de Mensagem.
3. As variáveis do modelo aceitam o formato que você já usa com nome amigável, além do formato técnico atual:
   `{Nome do Colaborador}`, `{Nome da Empresa}`, `{Link do Portal}`, `{Usuário}`, `{Senha}`, `{{nome}}`, `{{senha}}` etc. Variável que o sistema não conhece continua no texto, em vez de virar espaço vazio.
4. O modelo pode ser revisado no próprio diálogo antes de abrir o WhatsApp; se o colaborador não tiver WhatsApp/telefone no cadastro, o botão fica desabilitado explicando o motivo.
5. Senha provisória: tanto a senha do primeiro acesso quanto a do reset passam a exigir troca no primeiro login. Ao entrar, o colaborador é levado direto para a tela de criação de senha e só usa o portal depois de definir a nova senha. Quando o gestor define uma senha específica, existe a opção "exigir troca no primeiro acesso", marcada por padrão.

## Detalhes técnicos

- `applyModeloVars` (`src/hooks/useDpModelosMensagem.tsx`): passa a resolver `{{chave}}` e `{Rótulo}`, normalizando caixa/acentos e aceitando sinônimos (`nome`/`nome do colaborador`, `empresa`/`nome da empresa`, `link`/`link do portal`, `usuario`/`cpf`, `senha`). Chave desconhecida é mantida literal.
- `WhatsappComposerDialog`: novas props `tituloPreferido?: string[]` e `contexto` aplicado na abertura; pré-seleciona o primeiro modelo cujo título casa (comparação sem acento/caixa) e mantém o seletor livre. Vazio → aviso com link para `/dp/modelos-mensagem`.
- `ColaboradorAcessoPanel`: no bloco de resultado, botão que abre o composer com `{ nome, empresa, link, usuario, senha }`; `link` = `${PUBLIC_SITE_ORIGIN}/dp/meu` (`src/lib/siteOrigin.ts`) e empresa vinda de `useCompanyContext`. Checkbox "Exigir troca no primeiro acesso" no bloco de senha específica.
- Senha provisória (infra já existe: `auth_user_security_state.must_change_password`, `/primeiro-acesso`, e `unifiedSignIn` já devolve `passwordChangeRequired`):
  - `dp-criar-acesso-colaborador`: após criar o usuário, upsert em `auth_user_security_state` com `must_change_password = true`.
  - `dp-reset-password`: mesmo upsert após atualizar a senha.
  - `dp-alterar-senha-colaborador`: aceita `exigir_troca?: boolean` (default `true`) e grava o flag conforme.
  - As três funções são reimplantadas depois da alteração.
- Testes: unitários de `applyModeloVars` (formatos duplos, sinônimos, acento, chave desconhecida) e da escolha de modelo por título; verificação no preview gerando acesso e reset, conferindo o link `wa.me` e o desvio para a tela de nova senha.

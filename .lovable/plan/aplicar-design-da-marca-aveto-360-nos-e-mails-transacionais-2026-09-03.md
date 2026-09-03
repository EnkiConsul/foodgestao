# Aplicar design da marca Aveto 360 nos e-mails transacionais

## Contexto atual
Os templates de e-mail já herdam o nome "Aveto 360" e alguns botões já usam o verde `#02AB3D`, mas o design ainda não é da marca: não há logo/header, as cores não estão 100% alinhadas, os e-mails de autenticação estão em inglês e a URL de preview do convite ainda aponta para `360food.com`.

## Objetivo
Padronizar todos os e-mails transacionais (autenticação + sistema) com o visual da Aveto 360: logo, cores oficiais, linguagem em português e links corretos.

## Escopo

### 1. Componente base de layout de e-mail
Criar `supabase/functions/_shared/email-templates/EmailLayout.tsx` com:
- Header fixo com logo `aveto360-assinatura.png` (asset CDN) centralizado, largura máxima ~200 px.
- Fundo branco `#FFFFFF`, corpo do e-mail em card com borda suave `#E5E7EB`.
- Tipografia: títulos em `#0B0F0D`, texto em `#4B5563`, botão primário `#02AB3D` com branco.
- Footer padrão: "Aveto 360 — Gestão financeira e de equipe para food service", link para `https://www.aveto360.com`, texto de descadastro/segurança quando aplicável.
- Responsivo (largura máxima 600 px, padding mobile).

### 2. Templates de autenticação (6 arquivos)
Atualizar `signup.tsx`, `recovery.tsx`, `invite.tsx`, `magic-link.tsx`, `email-change.tsx`, `reauthentication.tsx`:
- Usar o componente `EmailLayout`.
- Traduzir todos os textos para pt-BR.
- Ajustar `Preview` e assuntos para pt-BR.
- Manter props dinâmicas (`siteName`, `confirmationUrl`, etc.).

### 3. Templates transacionais do sistema (2 arquivos)
Atualizar `company-invite.tsx` e `contact-lead.tsx`:
- Usar o componente `EmailLayout`.
- Substituir verde-água `#22C9A0` pelo verde da marca `#02AB3D`.
- Substituir azulados (`#0f172a`, `#334155`, etc.) pelos tons da marca (`#0B0F0D`, `#4B5563`, `#9CA3AF`).
- Corrigir `previewData.inviteUrl` de `https://360food.com/convite/abc123` para `https://www.aveto360.com/convite/abc123`.

### 4. Configuração de remetente
Verificar se `auth-email-hook/index.ts` e `send-email.ts` já estão com:
- `SITE_NAME = "Aveto 360"`
- `FROM_DOMAIN = "aveto360.com"`
- `SENDER_DOMAIN = "notify.aveto360.com"`
- Links apontando para `https://www.aveto360.com`

### 5. Validação
- Typecheck do projeto.
- Renderização local dos templates via endpoint de preview (se disponível) ou script Deno simples.
- Teste de envio real para confirmar remetente **Aveto 360 <noreply@aveto360.com>** e aparência visual.

## Fora de escopo
- Não alterar a infraestrutura de e-mail (domínio, DNS, webhook) — isso já está configurado.
- Não alterar o fluxo de convite do colaborador no DP (`dp-invite-colaborador/index.ts`) — ele usa o invite nativo do auth; se necessário, tratamos em outro plano.

## Resultado esperado
Todos os e-mails enviados pelo sistema (autenticação, convite de empresa, lead do site) terão aparência única da Aveto 360, com logo, cores corretas e texto em português.
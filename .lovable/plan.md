## Objetivo

Forçar todos os usuários a configurar a autenticação em 2 fatores (Google Authenticator / TOTP). Quem ainda não tem 2FA será obrigado a cadastrar logo após o login antes de acessar o app. Quem já tem precisará informar o código a cada novo login (já implementado).

## Fluxo final

```
Login (email + senha)
        │
        ▼
Tem fator TOTP verificado?
   │                  │
   │ Não              │ Sim
   ▼                  ▼
Tela "Configurar      Tela "Verificação
2FA obrigatório"      em 2 etapas"
(QR + código)         (código de 6 díg.)
   │                  │
   └────────┬─────────┘
            ▼
       App liberado
```

## Mudanças

1. **Novo componente `MfaEnrollRequired`** (`src/components/auth/MfaEnrollRequired.tsx`)
   - Reaproveita a lógica do `TwoFactorCard`: enroll TOTP, mostra QR code + chave manual, campo de código de 6 dígitos, botão "Ativar e continuar".
   - Sem opção de pular. Botão secundário "Sair" desconecta a sessão.
   - Após verificação bem‑sucedida, chama `onSuccess()`.

2. **Atualizar `src/pages/Auth.tsx`**
   - Após login bem‑sucedido, em `checkMfaAndRedirect`, listar fatores via `supabase.auth.mfa.listFactors()`:
     - Se houver fator `verified` → mostrar `MfaChallenge` (já existe).
     - Se **não** houver fator verificado → mostrar `MfaEnrollRequired`.
   - Adicionar estado `mfaEnrollRequired` ao lado de `mfaRequired`.
   - O `useEffect` que detecta sessão pendente também deve verificar ausência de fator e disparar a tela de enrollment.

3. **Reforçar guarda em `src/App.tsx` (`ProtectedRoute`)**
   - Além de checar AAL2 pendente, verificar se o usuário possui fator TOTP `verified`.
   - Se não tiver, redirecionar para `/auth` (a página decide se mostra enrollment ou challenge).
   - Isso impede burlar a obrigatoriedade recarregando uma rota interna.

4. **Settings (`TwoFactorCard`)**
   - Remover o botão "Desativar 2FA" e o `AlertDialog` correspondente, já que 2FA passa a ser obrigatório. Texto da seção atualizado para "Sua conta está protegida. A autenticação em 2 fatores é obrigatória e não pode ser desativada."
   - Manter a opção de trocar o autenticador (desenrolar e cadastrar novamente em sequência), porém isso fica fora do escopo desta entrega — apenas a desativação simples é removida.

5. **Sem mudanças de banco**
   - Toda a lógica usa a API nativa de MFA do Supabase Auth. Nenhuma migração necessária.

## Detalhes técnicos

- `supabase.auth.mfa.listFactors()` retorna `data.totp[]`. Considerar 2FA configurado quando existir ao menos um fator com `status === "verified"`.
- Fatores em estado `unverified` que tenham ficado de tentativas anteriores são limpos antes de iniciar novo enrollment (já é o padrão do `TwoFactorCard`).
- A guarda em `ProtectedRoute` faz uma chamada extra no boot. Resultado é cacheado em estado local; revalidado quando `user` muda.
- Após `verify` do enrollment, a sessão automaticamente sobe para AAL2, então não é preciso challenge adicional na sequência — basta redirecionar para o destino original (`searchParams.redirect` ou `/`).

## Observações

- Usuários existentes sem 2FA serão pegos pela guarda no próximo acesso e obrigados a configurar.
- Convites (`/convite/:token`) e reset de senha (`/reset-password`) continuam públicos e não exigem 2FA.
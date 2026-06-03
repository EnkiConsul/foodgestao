## Problema

No card "Autenticação em 2 fatores" (Configurações → Segurança), quando o 2FA está ativado, a única forma de desativar é o Switch no canto superior do card — pouco visível e o texto auxiliar diz "use o botão acima", o que confunde.

## Mudança proposta

Editar `src/components/settings/TwoFactorCard.tsx` para tornar a desativação óbvia quando o 2FA está ativo:

1. Quando existe fator verificado, exibir no corpo do card um botão destacado **"Desativar 2FA"** (variant `destructive` outline, com ícone `ShieldOff`) logo abaixo da mensagem "Sua conta está protegida".
2. O botão abre o mesmo `AlertDialog` de confirmação que já existe (`setConfirmDisable(true)`), que chama `disableMfa()` — remove todos os fatores TOTP via `supabase.auth.mfa.unenroll`.
3. Manter o Switch no header como atalho redundante (não remover, para quem prefere toggle).
4. Atualizar o texto auxiliar para: "Sua conta está protegida. Você pode desativar a qualquer momento."

## Sem mudanças

- Fluxo de ativação (QR + verificação) permanece igual.
- Lógica de persistência (fatores MFA do Lovable Cloud) permanece igual.
- Login continua exigindo o código apenas quando há fator verificado.

## Validação

Após implementar: abrir Configurações → Segurança com 2FA ativo → ver botão "Desativar 2FA" visível → clicar → confirmar → badge muda para "Desativada" → próximo login não pede código.

# Hotfix P0 de segurança: expire-trials e recuperação de senha atômica

Dois hotfixes bloqueantes, elegíveis ao freeze da main (marcador `hotfix-approved`, conforme o runbook de release freeze). Sem features novas, sem refactor amplo.

## P0-1 — expire-trials aceita token não verificado

Hoje a função de expiração de trials autoriza o chamador de duas formas: o segredo do cron ou um "Bearer" cujo conteúdo é apenas decodificado e lido. Como a assinatura do token nunca é validada, qualquer pessoa pode montar um token dizendo que é o serviço interno e disparar a rotina, marcando assinaturas como expiradas ou removendo isenções.

Correções:
- Remover a leitura do conteúdo do token como prova de identidade; aceitar apenas igualdade exata com a chave de serviço, comparada de forma constante (sem vazar tempo).
- Manter o segredo do cron como caminho alternativo, também com comparação constante, e recusar quando o segredo não estiver configurado.
- Tornar a rotina atômica: uma única função no banco (SECURITY DEFINER) executa, na mesma transação, a expiração de trials vencidos e a expiração de isenções com prazo terminado, devolvendo as contagens. A função passa a apenas chamar essa rotina, evitando o estado intermediário atual em que a primeira atualização é aplicada e a segunda falha.
- Não devolver o texto cru do erro na resposta; registrar em log e responder mensagem genérica.

## P0-2 — Recuperação de senha não é atômica (token reutilizável)

O último passo da recuperação lê o registro, compara o token e só depois troca a senha e marca o registro como concluído. Entre a leitura e a conclusão há uma janela em que o mesmo token vale de novo: duas chamadas simultâneas com o mesmo token podem trocar a senha duas vezes, e se a marcação de conclusão falhar o token continua válido até expirar.

Correções:
- Criar uma função no banco que "consome" o desafio em uma única instrução condicional: só reivindica o registro se ele estiver verificado, não expirado e com o hash do token correspondente; nesse caso muda o status para consumido e devolve o usuário. Chamadas concorrentes recebem nada.
- A troca de senha passa a ocorrer somente depois do consumo bem-sucedido. Se a troca falhar, o desafio é marcado como falho/expirado (nunca volta a ser utilizável) e o usuário é orientado a solicitar novo código.
- No passo de verificação do código, a contagem de tentativas passa a ser incrementada de forma atômica no banco (uma instrução), fechando a corrida que hoje permite exceder o limite de tentativas com requisições paralelas; e o token de reset só é emitido se o desafio ainda não tiver um token válido em uso, evitando emissão múltipla.
- Limpar a flag de troca obrigatória de senha na mesma rotina do banco, para não deixar estado inconsistente quando essa atualização falha isoladamente.

## Detalhes técnicos

- Migração nova com: `public.expire_trials_and_exemptions()` (retorna contagens) e `public.consume_recovery_reset(p_challenge_id uuid, p_reset_token_hash text)` / `public.increment_recovery_attempt(p_challenge_id uuid)` — todas `SECURITY DEFINER`, `search_path = public`, `REVOKE EXECUTE FROM anon, authenticated`, `GRANT EXECUTE TO service_role`.
- `supabase/functions/expire-trials/index.ts`: remover `parseJwtRole`, usar comparação de tempo constante (reaproveitar `timingSafeEqualHex`/helper equivalente em `_shared`), chamar a RPC única.
- `supabase/functions/auth-recovery-reset/index.ts`: substituir select+update pelo `consume_recovery_reset`; ordem passa a ser consumir → atualizar senha → (em erro) marcar `failed`.
- `supabase/functions/auth-recovery-verify/index.ts`: usar `increment_recovery_attempt` e emitir reset token só quando não houver token vigente.
- Testes: casos unitários/integração cobrindo token forjado rejeitado no expire-trials, reuso concorrente do reset token, e estouro de tentativas paralelas.
- Deploy das três funções após a migração; nenhuma mudança de UI.

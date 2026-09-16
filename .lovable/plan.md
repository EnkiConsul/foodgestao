# Resolver os erros da tela de Erros

## Situação de cada erro

1. **"Falha ao carregar a tela" (Histórico de documentos e /dp)** — acontece no celular depois de uma atualização do app: o telefone guardou a versão antiga e pede um arquivo que já não existe. Ainda ativo (último em 15/09).
2. **Verificação de acesso demorou demais (/hub, "cadastro")** — a checagem de cadastro fica sem resposta e, após 10 segundos, o usuário vê tela de falha. Sem limite de espera nem nova tentativa hoje. Ativo em 14/09.
3. **"relation public.dp_pontos does not exist"** — verifiquei o banco: nenhuma rotina cita mais essa tabela. Já corrigido; sobrou só o registro antigo (15/09).
4. **"duplicate key ... uq_dp_conv_ocor_necessidade_vigente"** — verifiquei: esse índice já não existe no banco (removido em 14/09). Já corrigido; registro antigo de 12/09.

## O que será feito

1. **Recuperação de versão antiga (erros 1)**
   - Ao falhar o carregamento de uma tela, tentar novamente o mesmo arquivo uma vez; se falhar de novo, limpar o cache do app e o service worker antes de recarregar (hoje só recarrega, mantendo o cache velho que causou a falha).
   - Usar um único controle de "já recarreguei nesta sessão" para não entrar em recarga em laço.
   - Se ainda assim falhar, a tela de erro passa a oferecer "Atualizar o app" que limpa o cache e recarrega.

2. **Espera da verificação de acesso (erro 2)**
   - Dar limite de tempo à consulta de cadastro e tentar de novo automaticamente uma vez antes de desistir; falha de rede deixa de travar a entrada.
   - Registrar o erro só quando as tentativas terminarem, para não gerar alerta por lentidão momentânea. Mensagem e botões da tela permanecem como estão.

3. **Erros já resolvidos (3 e 4)** — nenhuma mudança de código. Marco os dois como resolvidos na tela de Erros, se você quiser; a lista fica limpa.

## Detalhes técnicos

- `src/lib/lazyWithRetry.ts`: nova tentativa do `import()` com parâmetro de cache-bust; ao falhar, chamar `recoverFromStaleBundle()` de `src/lib/staleBundle.ts` (limpa `caches` + service worker) em vez de `window.location.reload()` direto; unificar a flag de sessão com a de `staleBundle` para evitar recarga dupla.
- `src/components/ErrorBoundary.tsx`: quando `isStaleBundleError(error)`, exibir ação que chama `recoverFromStaleBundle(true)`.
- `src/lib/onboardingStatus.ts`: envolver `resolveOnboardingStatus` em espera limitada (~6 s) com 1 nova tentativa; propagar falha definitiva.
- `src/routes/onboardingGuards.tsx`: `GuardWaiting` só reporta após as tentativas do guard falharem (sinalizado por estado do guard), mantendo `GUARD_TIMEOUT_MS` como rede de segurança visual.
- Testes: novos casos para lazyWithRetry (sucesso na 2ª tentativa, recuperação no 2º erro, sem laço) e para o tempo limite/retentativa de `resolveOnboardingStatus`.
- Sem mudanças de banco, sem alterar layout, sem publicar.

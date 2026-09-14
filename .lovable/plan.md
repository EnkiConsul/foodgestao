# Fase 5 — Operações críticas do Pessoas 360° (Trocas, Férias, Convocações, Escala)

## Diagnóstico (verificado no código e no banco)

**Trocas** — o portal grava direto na tabela de trocas: propor, responder ao colega e cancelar. As regras de acesso da tabela só permitem escrita para dono/administrador da empresa, e hoje **nenhum dos 7 colaboradores com acesso é membro da conta da empresa**. Ou seja: propor, aceitar, recusar e cancelar troca pelo portal está bloqueado pelo banco — a função existe na tela, mas não conclui. A decisão do gestor grava a aprovação na tabela e só depois chama a rotina que efetiva as folgas: se a segunda etapa falhar, a troca fica "aprovada" sem folga trocada. Não há trava de concorrência entre dois aceites, nem checagem de duplicidade no servidor. Cancelar troca aprovada já é rotina segura no servidor.

**Férias** — solicitar, aprovar, recusar, programar e cancelar já são rotinas do servidor com validação (bom). Duas brechas: a edição de umas férias já programadas (datas, abono, aviso) é gravada direto na tabela pela tela do gestor, pulando as validações da programação; e cerca de 19 rotinas de férias estão executáveis por visitante (sem sessão).

**Convocações** — responder oferta já é rotina do servidor, mas executável por visitante. Criar, cancelar e excluir convocação "legada" são gravações diretas da tela, com a empresa vinda do seletor do navegador (o banco ainda barra empresa alheia, mas não há trava de concorrência nem estado único garantido). As regras de acesso permitem o colaborador mudar sozinho o status da própria convocação direto na tabela.

**Escala** — publicar é um update direto na tabela: cria a escala se não existir, marca publicada e grava quem/quando com o usuário informado pelo navegador. Sem trava: dois cliques ou dois gestores publicam duas vezes e sobrescrevem a data de publicação; a criação da escala e a publicação não são uma operação única; não há checagem de que existe conteúdo para publicar. Reabrir tem o mesmo padrão. Definir setor do dia é rotina do servidor, mas executável por visitante.

## Classificação

**P0**
1. Trocas do portal quebradas e sem autoridade no servidor (propor/aceitar/recusar/cancelar).
2. Aprovação de troca em duas etapas: pode ficar aprovada sem efetivar as folgas.
3. 31 rotinas destes 4 domínios executáveis por visitante — inclui responder convocação, decidir convocação parcial, cancelar troca, definir setor do dia e as rotinas de férias.
4. Publicação de escala sem trava nem atomicidade (publicação duplicada, autor/hora sobrescritos).

**P1**
5. Edição de férias programadas gravada direto na tabela, sem as validações da programação.
6. Criar/cancelar/excluir convocação direto da tela, com empresa do navegador e sem trava.
7. Colaborador consegue alterar o status da própria convocação direto na tabela, fora da rotina.
8. Sem checagem de duplicidade/concorrência em troca (dois aceites, aceite + cancelamento).

**P2**
9. Exclusão definitiva de convocação sem histórico (preferir cancelamento).
10. Mensagens de erro técnicas em algumas telas do gestor.

## O que será feito

**Trocas** — novas rotinas do servidor: propor troca, responder como colega, responder como gestor, cancelar. Cada uma deriva quem é o ator pela sessão, confere a empresa, confere que o ator é o solicitante ou o colega envolvido (ou administrador, no caso do gestor), o status atual, as folgas envolvidas ainda válidas, conflito de horário/dia e duplicidade; toma trava por troca e por dia para que dois aceites simultâneos não passem juntos. A efetivação das folgas passa a acontecer dentro da mesma operação da aprovação — ou tudo, ou nada. O modo "troca direta" continua valendo como hoje.

**Férias** — a edição de férias programadas passa a usar a rotina de programação já existente (que revalida saldo, conflitos, simultâneos e aviso), em vez de gravar direto. Nenhuma regra trabalhista nova. Isolamento entre empresas revalidado no servidor.

**Convocações** — criar, cancelar e alterar convocação passam por rotinas do servidor que conferem empresa, papel, colaborador, status, prazo e concorrência. Responder continua na rotina existente, agora fechada para visitante e com trava contra duas respostas simultâneas. A permissão que deixava o colaborador mudar o status direto na tabela é removida (a resposta passa a ser só pela rotina). Exclusão definitiva vira cancelamento com registro.

**Escala** — nova rotina de publicar/reabrir: confere empresa e papel no servidor, cria-ou-reaproveita a escala do mês numa única operação, toma trava por empresa+unidade+competência, recusa publicar escala vazia, é idempotente (segundo clique não republica nem sobrescreve autor/hora) e registra quem publicou e quando. O editor de escala não é redesenhado.

**Permissões** — revogar execução de visitante nas 31 rotinas destes 4 domínios; manter elevação de privilégio só onde é necessária, com caminho de esquema fixo e permissão mínima (quem está logado e o servidor).

**Auditoria** — as tabelas de trocas, férias, convocações e escalas já têm registro automático de alteração (ator, empresa, antes/depois). As novas rotinas preservam esse registro e gravam o autor real da sessão, não o informado pela tela.

## Testes

Para cada domínio: operação válida, usuário sem permissão, empresa errada, conta bloqueada, visitante, status inválido, clique/retry duplicado e concorrência. Explicitamente: colaborador A não age como colaborador B (propor, responder, cancelar). Concorrência verificada em dois aceites de troca, aprovação + cancelamento simultâneos, duas respostas à mesma convocação e publicação duplicada de escala. Testes automatizados de visitante negado nas rotinas novas, mais bateria no banco com sessão simulada e transação desfeita (mesmo método da Fase 4).

## Detalhes técnicos

- Novas RPCs `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para `authenticated` e `service_role`: `dp_troca_propor`, `dp_troca_responder_colega`, `dp_troca_responder_gestor`, `dp_troca_cancelar_self`, `dp_ferias_gozo_editar`, `dp_convocacao_criar`, `dp_convocacao_cancelar`, `dp_escala_publicar`, `dp_escala_reabrir`.
- Identidade sempre `auth.uid()` → `dp_colaborador_ativo_of` / `private.is_company_admin_or_owner(uid, company_id)` → recurso. Nenhum parâmetro de empresa, usuário ou colaborador vindo do navegador serve como autoridade.
- Concorrência com `pg_advisory_xact_lock` (troca, convocação, escala do mês) e `SELECT ... FOR UPDATE` na linha alvo; transições de status verificadas depois do lock.
- `dp_processar_troca` / `dp_processar_troca_direta` passam a ser chamadas dentro das novas rotinas (mesma transação) e deixam de ser chamadas pelo frontend.
- `REVOKE EXECUTE ... FROM anon` nas 31 rotinas dos 4 domínios; policy `dp_convocacoes_respond_self` (UPDATE) removida.
- Frontend: `useDpTrocas.tsx`, `DpMeuTrocas.tsx`, `DpMeuCalendario.tsx` (só o trecho de troca), `useDpFerias.tsx` (`saveGozo`), `useDpConvocacoes.tsx`, `useDpEscalaMes.tsx` (`publicar`/`reabrir`) — trocam gravação direta por RPC, com mensagens em português; sem `as any` nem `@ts-ignore`.
- Novos testes em `src/test/rls/` (trocas, férias, convocações, escala).
- Validações: tipos, lint, suíte completa, build, verificação de migrações, isolamento multiempresa e security-lint (baseline 101 críticos; reportar antes/depois/corrigidos/restantes). Nenhuma função de servidor (Edge Function) alterada.
- Reversão: cada migração é reversível restaurando as rotinas anteriores e a policy removida; reverter só o frontend mantém o servidor seguro.

Fora do escopo: acesso/senha, documentos, folgas, reconhecimento de documentos e UX geral. Ao final da fase, paro e não inicio a Fase 6.

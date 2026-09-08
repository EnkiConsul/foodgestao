# Fase 4 — Notificações (destinatário correto, leitura individual e linguagem amigável)

## Diagnóstico confirmado

- A tabela de notificações (`dp_notificacoes`) já distingue notificações pessoais (`user_id` preenchido) de notificações para gestores (`para_admins = true`).
- Problema 1 (o caso relatado): a regra de acesso atual permite que **qualquer gestor da empresa leia e marque como lida TODAS as notificações**, inclusive as pessoais de um colaborador. É por isso que a mensagem "Você ainda não informou sua indisponibilidade" aparece na Central do Gestor — não é erro de texto, é erro de audiência.
- Problema 2: o estado de leitura (`lida_em`) fica na própria notificação. Quando a mesma notificação vale para vários gestores, um gestor que a abre marca como lida para todos os outros.
- Problema 3: a Central pode exibir nomes técnicos (origem do registro) em vez de linguagem de negócio.

## O que será feito

1. **Auditoria completa das origens** — mapear todos os pontos que criam notificações (rotinas do banco e funções do backend), confirmando para cada tipo quem é o destinatário correto: colaborador específico, gestor ou empresa toda.
2. **Audiência correta no banco (não só na tela)** — corrigir as regras de acesso para que:
   - notificação pessoal de um colaborador seja visível **somente para ele** (o gestor deixa de ver e de poder marcar como lida);
   - notificação destinada a gestores continue visível para todos os gestores autorizados da empresa;
   - isolamento entre empresas permaneça garantido.
3. **Leitura individual por destinatário** — para notificações compartilhadas entre gestores, criar registro de leitura por pessoa: cada gestor tem seu próprio "lido/não lido", e "Marcar todas como lidas" afeta apenas as notificações do usuário atual.
4. **Linguagem amigável** — traduzir origens técnicas para nomes de negócio (Solicitações, Documentos, Atestados, Férias, Folgas, Convocações etc.) e garantir mensagens de erro amigáveis, sem termos técnicos.
5. **Links das notificações** — ao clicar, validar permissão antes de abrir o destino; se não houver tela específica, abrir os detalhes da notificação.
6. **Relevância** — verificar se notificações temporais antigas (prazo já encerrado) continuam aparecendo; se houver regra de expiração existente, respeitá-la; não criar regra nova sem diagnóstico.

## Fora de escopo

Pendências (Fase 5), menu, KPIs, Home, Analytics e qualquer regra de geração de pendências. Nenhuma notificação existente será apagada.

## Detalhes técnicos

- Migration: revisar policies de `dp_notificacoes` (SELECT/UPDATE) para `user_id = auth.uid()` OU (`para_admins` AND admin); nova tabela `dp_notificacoes_leituras` (notificação + usuário + lida_em) com GRANTs, RLS e unique por destinatário; RPC `dp_notificacao_marcar_lida` / `dp_notificacoes_marcar_todas` com escopo do usuário; manter `chave`/deduplicação.
- Frontend: `useDpNotificacoes.tsx`, `DpNotificacoes.tsx`, `DpNotificacoesBell.tsx` — contagem de não lidas e marcação passam a usar o estado individual; mapa de `ref_table` → rótulo amigável; toasts de erro amigáveis.
- Testes: unitários do estado de leitura; validação SQL de RLS (Colaborador A × B, gestor × notificação pessoal, empresa A × B); typecheck; suíte DP; conferência visual desktop/mobile se a sessão de teste estiver disponível.
- Rollback: migration reversível (restaurar policies anteriores e remover tabela de leituras); código compatível com o formato anterior durante a transição.

## Critérios de aceite (itens 88 do plano mestre)

Audiência correta; comunicação pessoal não aparece para gestor; A não vê B; empresas isoladas; leitura individual; "marcar todas" sem afetar terceiros; origens em linguagem amigável; links respeitando autorização; desktop e mobile validados. **Parar ao final da Fase 4.**

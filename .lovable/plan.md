# Pacote de correções de folgas (Pakerê / Nordman)

## O que muda para o gestor
1. **Alerta antes de remarcar para data bloqueada ou lotada** — em "Gerenciar folga" e no calendário administrativo, se o novo dia tiver bloqueio (ex.: Pizza Day 99Food) ou já estiver no limite de pessoas, aparece o aviso com o motivo e a pergunta "Deseja realmente continuar a troca mesmo com esta restrição?" ([Cancelar troca] / [Sim, continuar e remarcar]). Se confirmar, a folga fica registrada como exceção autorizada pela gestão.
2. **Ciência de mais de 6 dias seguidos** — ao aprovar pedido ou remarcar folga que deixe o colaborador trabalhando 7+ dias sem descanso, o gestor precisa marcar "Ciente do trabalho por mais de 6 dias consecutivos autorizado pela gestão". Fica no histórico.
3. **Aviso de trocas diretas com risco** — quando dois colegas trocam folga direto e alguém fica 7+ dias sem descanso, o gestor recebe notificação e a troca aparece com a etiqueta "Alerta de DSR" nas solicitações.

## O que muda para o colaborador
4. **Remover folga só com a janela aberta** — durante o período de escolha (dias 10 a 20 na Pakerê) pode remover; depois disso, folga escolhida ou gerada pelo sistema só pode ser **trocada/remarcada**, nunca excluída.
5. **Troca direta da folga de fim de semana** — mudar a folga de sábado/domingo para outro sábado/domingo livre, sem bloqueio e sem colega de folga, acontece na hora, sem gestor. A própria folga que está sendo movida não conta mais como "teto do mês atingido".
6. **Teto correto** — o calendário passa a mostrar "até 1 folga neste mês" seguindo a regra da unidade (hoje mostra 2 por erro).
7. **Calendário completo** — passa a mostrar a folga fixa semanal (quarta do Nordman), as datas bloqueadas e a folga de fim de semana.
8. **Ciência de mais de 6 dias seguidos** — em qualquer troca ou remarcação que gere 7+ dias sem descanso, aparece o alerta e o envio só segue com "Estou ciente…". Na troca entre colegas, **quem propõe e quem aceita** dão ciência; a troca não depende do gestor.
9. **Trocar a folga fixa por outro dia** — o colaborador escolhe qual folga fixa vai trabalhar e qual dia quer folgar no lugar, em **qualquer dia do mês atual ou do mês seguinte**. Vai como pedido ao gestor; só acontece se ele aprovar.

## Natureza da folga (rastreio do direito)
10. Folga de fim de semana movida para dia de semana continua contando como **o direito de fim de semana do mês** (não gera nova cobrança).
11. Folga fixa movida para sábado/domingo continua sendo **folga fixa** e **não conta** como folga de fim de semana — o colaborador mantém o seu direito do mês.

## Ajuste de dados
12. Mover a folga do Nordman de 30/10 (sexta, Pizza Day) para o domingo 25/10 e encerrar o pedido pendente dele como atendido.

---

## Detalhes técnicos
- **Permissões (migração):** `GRANT EXECUTE` a `authenticated` em `dp_config_resolvida` e `dp_dias_fixos_folga`; novas policies de leitura em `dp_datas_bloqueadas`, `dp_bloqueio_regras`, `dp_bloqueio_regra_unidades` e `dp_dia_config` para o colaborador do portal da mesma empresa/unidade (via vínculo `dp_colaboradores.user_id = auth.uid()`).
- **Coluna `direito_origem`** em `dp_folgas` (`fds`, `fixa`, `dominical_deslocada`, `folga_fixa_deslocada`, `excecao_gestor`), preenchida pelas RPCs de remarcação/troca/aprovação; `minhasFolgas`/`tetoFolgas` (`folga-rules.ts`) passam a contar só `fds`/`dominical_deslocada`.
- **Teto:** `tetoFolgasMes` (`dsr-rules.ts`) respeita `folgas_fds_por_mes` no acordo coletivo e `domingos_por_mes` no modo por mês.
- **Remarcação:** `calculateDateStatus` ignora a folga de origem ao calcular o teto; `dp_folga_remarcar` idem no servidor.
- **Exclusão:** remover a policy `dp_folgas_self_delete` ampla; deixar só `dp_folga_remover` (já recusa com janela fechada); botão escondido fora da janela em `DpMeuCalendario.tsx`.
- **Gestor:** checagem de `blockedByDate`/`limiteByDay` antes de chamar `dp_folga_admin_remarcar` em `DpFolgas.tsx`, `DpAdminCalendario.tsx` e `AtribuirFolgaTriagemDialog.tsx`; RPC ganha parâmetro `_confirmar_restricao` e grava a exceção na auditoria.
- **6+ dias:** reaproveitar `avaliarRiscoDsrTroca` em remarcação, pedido de troca de folga fixa, troca entre colegas e aprovação; ciências gravadas via `registrarCienciaRegra`/coluna na solicitação/troca; notificação ao gestor em `dp_notificacoes` quando a troca direta concluir com risco.
- **Folga fixa por dia futuro:** seletor de destino limitado ao mês atual + seguinte; aprovação grava `dp_dia_trabalho_excepcional` no dia fixo e nova folga `folga_fixa_deslocada`.
- **Dado do Nordman:** `UPDATE` pontual na folga `91f58897…` e na solicitação `4854a599…`.
- Testes unitários: teto, remarcação ignorando origem, contagem por `direito_origem`, risco DSR.

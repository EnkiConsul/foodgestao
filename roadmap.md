# Roadmap — Pessoas 360° (plano aprovado 09/2026)

## Tela de acesso — refinamento visual (09/2026)
- [x] Aplicar as novas artes 1 e 2 sem recortar pessoa, celular ou notebook
- [x] Posicionar o formulário compacto e translúcido nas áreas livres das artes
- [x] Manter o formulário sem logo e preservar todas as funções atuais
- [x] Validar celular, tablet, computador e os testes do acesso

## Condições de trabalho — ajustes (10/2026)
- [x] Jornada: horário sugerido do turno e "Copiar horário de" (colega), sem sócio como fonte
- [x] Benefícios: listar também o padrão da empresa (VA/VT/assiduidade) + opção "manter os benefícios atuais"
- [x] Vínculo: rótulos "CLT efetivo" vs "CLT intermitente" claros; padrão do cargo não mexe no vínculo
- [x] Desligamento: data começa em branco, sem sugerir o dia de hoje

## Mão de obra extra na rotina (09/2026) — concluído
- [x] Lista sem desligados (só válidos no dia; desligado só em dias até a saída) — `operacao-extra.ts` + diálogo
- [x] Data inicial/final vem do dia clicado, sem voltar para hoje
- [x] Dia futuro liberado; intermitente/freelancer com botão "Abrir convocação preenchida" → `/dp/escalas/convocacoes` (state.nova)
- [x] Horário conflitante com escala/convocação: aviso + bloqueio do salvar + botão de horário livre
- [x] Aviso de risco legal para jornada extra de contrato fixo (CLT); sócio isento
- [x] Planner de convocação sem desligados (por menor data planejada) e pré-seleção de pessoa

## Feito
- [x] Migração: `dp_intermitente_competencia_confirmacoes`, `dp_adiantamento_solicitacoes`, `dp_pendencias_decisoes` (RLS, triggers, backfill de optantes)
- [x] `src/lib/dp/adiantamento-opcao.ts` — efeito por competência, última solicitação válida, regra dos 5 dias no portal
- [x] `src/hooks/useDpAdiantamentoSolicitacoes.tsx` — listar/registrar (gestor e portal) + notificação ao gestor
- [x] `useDpPendenciasDecisoes.tsx` — ignorar (justificativa) / adiar compartilhados
- [x] `pendencias-documentos.ts` — `optanteNaCompetencia`, `intermitenteSemRegistros`/`intermitenteTrabalho`
- [x] `useDpPendencias.tsx` — adiantamento por histórico; alerta "Confirmar trabalho de intermitente"; férias adquiridas/a vencer/vencidas (exceto sócio e desligado)
- [x] Alerta do intermitente respondido na UI ("Trabalhou"/"Não trabalhou") via `PendenciaAcoes` + `useDpIntermitenteConfirmacoes`
- [x] Ignorar/adiar ligados em `PendenciasCard` e `DpCadastroPendenciasLista`
- [x] `DocConsistenciaPanel.tsx` — sem bloco de férias; adiantamento por histórico; intermitente sem ponto não gera cobrança
- [x] `ColaboradorFormDialog.tsx` — histórico de solicitações datadas (gestor pode retroativo)
- [x] Portal: solicitação de ativar/cancelar adiantamento em `DpMeuSolicitacoes` (hoje/futuro, 5 dias de antecedência)
- [x] Testes de `adiantamento-opcao` + typecheck e suíte DP

## Condições de trabalho (10/2026)
- [x] Migração: histórico com turno, carga semanal, folga, sindicato, equipe habitual, dias e benefícios; RPC `dp_colaborador_aplicar_condicao` ampliada (versão antiga removida)
- [x] `src/lib/dp/jornadaParcial.ts` + testes — salário proporcional às horas e base mensal sugerida
- [x] `useDpColaboradorCondicoes.tsx` — novos campos e invalidações de jornada/benefícios/escala
- [x] `ColaboradorCondicoesDialog.tsx` — abas Contrato, Jornada, Pagamento, Benefícios e Histórico

## Ainda em aberto (fila desta revisão)
- [ ] Documentos de rescisão agrupados (vários arquivos num único conjunto do colaborador)
- [ ] Fonte única de pendências entre Início, Pendências e Importar + botão Atualizar com data/hora e rotina automática (6h e a cada 8h)
- [x] Convocação: recolher visualmente os dias sem erro e abrir o dia com problema (publicação segue atômica)
- [ ] Horário do Herick divergente na rotina do dia
- [x] Erro ao confirmar se o Erildson trabalhou em 05/2026 (coluna errada na gravação)
- [x] Link do portal na mensagem padrão de acesso
- [x] Portal da Karen: rotina da loja, folgas fixas no calendário e atalho para as pendências pessoais

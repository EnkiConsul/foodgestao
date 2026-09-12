# Roadmap — Pessoas 360° (plano aprovado 09/2026)

## Sindicatos no celular e renovação anual (11/09/2026)
- [x] Organizar as abas, cartões e ações da unidade em telas pequenas
- [x] Ajustar o formulário de negociação para caber no celular sem cortes
- [x] Pré-preencher sindicatos, mês-base e ano seguinte a partir da negociação mais recente
- [x] Validar os cenários com e sem negociação anterior e conferir a tela no celular

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
- [x] Documentos de rescisão identificados como um conjunto no histórico do colaborador
- [x] Fonte única de pendências (Início, Pendências e Importar), botão Atualizar com data/hora e recálculo por ações do gestor
- [x] Convocação: recolher visualmente os dias sem erro e abrir o dia com problema (publicação segue atômica)
- [x] Horário do Herick divergente na rotina do dia (horário próprio do dia vence o turno)
- [x] Erro ao confirmar se o Erildson trabalhou em 05/2026 (coluna errada na gravação)
- [x] Link do portal na mensagem padrão de acesso
- [x] Portal da Karen: rotina da loja, folgas fixas no calendário e atalho para as pendências pessoais

## Fechamento do pente-fino (11/09/2026)
- [x] Convocação fora do prazo com justificativa individual por dia e opção de repetir
- [x] Documentos de uma mesma rescisão vinculados por conjunto, mantendo arquivos individuais
- [x] Importação da ficha exige confirmação de vínculo, pagamento, ponto e adiantamento
- [x] Auditoria de erros disponível no backoffice e erro intermitente traduzido
- [x] Nome social aplicado na rotina, escalas, convocações, avisos e mensagens
- [x] Recontratação preserva a pessoa e o histórico do vínculo encerrado
- [x] Materializar pendências documentais e atualizar uma vez ao dia, às 3h, além de recalcular após ações e pelo botão Atualizar

## Chamados ligados a erros (11/09/2026)
- [x] Mostrar aviso chamativo em falhas reais e permitir relato detalhado
- [x] Gerar protocolo e vincular cada chamado ao erro técnico original
- [x] Exibir relatos, situação e histórico na auditoria e no backoffice
- [x] Validar permissões, celular e fluxos de erro globais

## Início mobile — refinamentos (12/09/2026)
- [x] Seletor de formato dos atalhos: um botão "5x1" com menu para trocar (4x1/3x1)
- [x] Distribuição equilibrada e centralizada dos ícones no Início e na tela "Mais"
- [x] Texto genérico "módulo" no card de Atalhos Favoritos
- [x] Gesto de arrastar na tela Início troca entre os menus principais

## Gestos de navegação no celular (12/09/2026)
- [x] Arrastar para cima abre o próximo menu; para baixo volta ao anterior (do primeiro volta ao Início)
- [x] Início deixa de abrir Cadastro no arrasto lateral; gestos de borda (Hub/Mais) mantidos
- [x] Atualizar arrastando para baixo só no Início e nas telas de uso
- [x] Arrastar da esquerda para a direita fecha a janela aberta (com confirmação de alterações não salvas)

## Rotação e visual tablet no celular deitado (12/09/2026)
- [ ] Liberar orientação horizontal no aplicativo instalado
- [ ] Usar integralmente o visual tablet no celular deitado
- [ ] Manter o visual mobile e os gestos atuais no celular em pé
- [ ] Validar celular em pé, celular deitado e tablet

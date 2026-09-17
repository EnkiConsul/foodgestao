/**
 * Textos de ajuda contextual (PT-BR), centralizados e tipados.
 *
 * Regras de escrita:
 * - 1 a 2 frases curtas, em Primeira Maiúscula, explicando finalidade e efeito;
 * - nunca repetir apenas o rótulo da tela ou do campo;
 * - descrever o comportamento real do sistema (sem prometer regra inexistente).
 */
export interface HelpEntry {
  /** Nome da funcionalidade (usado no nome acessível e no título da dica). */
  titulo: string;
  texto: string;
}

export const HELP_CONTENT = {
  // ───────────────────────────── Hub e visão geral ─────────────────────────────
  "hub.modulos": {
    titulo: "Hub de Módulos",
    texto: "Ponto de entrada dos módulos liberados para a sua empresa. Módulos não contratados aparecem apenas como apresentação.",
  },
  "dashboard.visao": {
    titulo: "Dashboard",
    texto: "Resumo financeiro da empresa selecionada: saldos, evolução do período e principais categorias. Não altera nenhum lançamento.",
  },
  "dashboard.privacidade": {
    titulo: "Modo privacidade",
    texto: "Oculta os valores na tela, trocando-os por R$ ••••. A preferência fica salva e não afeta relatórios exportados.",
  },
  "contexto.empresa": {
    titulo: "Empresa Selecionada",
    texto: "Define de qual empresa vêm contas, lançamentos e relatórios. Cada empresa tem contas e saldos independentes.",
  },

  // ───────────────────────────── Financeiro ─────────────────────────────
  "financeiro.lancamentos": {
    titulo: "Lançamentos",
    texto: "Lista única de contas a pagar e a receber, com filtros por período, status e conta. Alterar o status aqui reflete nos saldos.",
  },
  "financeiro.lancamento.tipo": {
    titulo: "Tipo de Lançamento",
    texto: "Entrada aumenta o saldo, saída reduz e transferência move valor entre duas contas da mesma empresa. Parcelado gera as parcelas vinculadas.",
  },
  "financeiro.lancamento.competencia": {
    titulo: "Data de Competência",
    texto: "Data do fato (compra, venda ou serviço), usada nos relatórios por competência. Não é a data em que o dinheiro sai ou entra.",
  },
  "financeiro.lancamento.vencimento": {
    titulo: "Data de Vencimento",
    texto: "Prazo combinado para pagar ou receber. Define se o lançamento aparece como a vencer ou atrasado.",
  },
  "financeiro.lancamento.pagamento": {
    titulo: "Data de Pagamento",
    texto: "Data em que o valor foi efetivamente movimentado. Ao informar, o lançamento passa a contar no saldo da conta.",
  },
  "financeiro.lancamento.recorrente": {
    titulo: "Lançamento Recorrente",
    texto: "Cria de uma vez os lançamentos futuros na frequência escolhida, ligados ao lançamento original. Editar depois permite escolher se vale só para este ou para os seguintes.",
  },
  "financeiro.lancamento.parcelado": {
    titulo: "Lançamento Parcelado",
    texto: "Divide um valor total em parcelas com vencimentos próprios, mantendo o vínculo com o lançamento principal.",
  },
  "financeiro.lancamento.anexos": {
    titulo: "Anexos do Lançamento",
    texto: "Guarde até 5 comprovantes por lançamento (nota, boleto, recibo). Os arquivos ficam privados à empresa.",
  },
  "financeiro.lancamento.contato": {
    titulo: "Cliente ou Fornecedor",
    texto: "Vincula o lançamento a um contato cadastrado, o que facilita filtros e relatórios por parceiro.",
  },
  "financeiro.contas": {
    titulo: "Contas Financeiras",
    texto: "Cadastro de bancos, caixa, máquinas de cartão e demais contas. Cada empresa tem suas próprias contas e saldos.",
  },
  "financeiro.conta.tipo": {
    titulo: "Tipo de Conta",
    texto: "Classifica a origem do dinheiro (banco, caixa, máquina de cartão, empréstimo etc.) e organiza os relatórios por tipo.",
  },
  "financeiro.conta.saldoInicial": {
    titulo: "Saldo Inicial",
    texto: "Ponto de partida da conta no sistema. O saldo atual é esse valor somado aos lançamentos já efetivados.",
  },
  "financeiro.conta.ajusteSaldo": {
    titulo: "Ajuste de Saldo",
    texto: "Use quando o saldo do sistema divergir do extrato real. O ajuste é registrado e não apaga os lançamentos existentes.",
  },
  "financeiro.cartoes": {
    titulo: "Cartões de Crédito",
    texto: "Cartões com limite, fechamento e vencimento da fatura. As compras entram na fatura do mês de referência, não no saldo do banco.",
  },
  "financeiro.conciliacao": {
    titulo: "Conciliação",
    texto: "Compara o extrato importado do banco com os lançamentos do sistema e permite confirmar, vincular ou ignorar cada item.",
  },
  "financeiro.conexoes": {
    titulo: "Conexões Bancárias",
    texto: "Conexões automáticas que trazem extratos e faturas. Contas de crédito ficam pendentes até você autorizar ou vincular a um cartão.",
  },
  "financeiro.sincronizacao": {
    titulo: "Sincronização",
    texto: "Busca novas movimentações na conexão do banco. Nada é confirmado automaticamente: os itens vão para a conciliação.",
  },
  "financeiro.categorias": {
    titulo: "Categorias",
    texto: "Estrutura de receitas e despesas usada em lançamentos e relatórios. Categorias podem ter subcategorias e ser ocultadas sem perder o histórico.",
  },
  "financeiro.centrosCusto": {
    titulo: "Centros de Custo",
    texto: "Separa resultados por loja, área ou projeto sem mudar a categoria do lançamento.",
  },
  "financeiro.contasContabeis": {
    titulo: "Contas Contábeis",
    texto: "Plano de contas usado nos relatórios contábeis e no envio à contabilidade. Contas com histórico não podem ser excluídas.",
  },
  "financeiro.formasPagamento": {
    titulo: "Formas de Pagamento",
    texto: "Meios usados para pagar e receber (PIX, boleto, cartão, dinheiro). Servem para filtrar e analisar os lançamentos.",
  },
  "financeiro.contatos": {
    titulo: "Contatos",
    texto: "Clientes, fornecedores e parceiros ligados aos lançamentos. O cadastro é por empresa.",
  },
  "financeiro.relatorioFluxoCaixa": {
    titulo: "Relatório de Fluxo de Caixa",
    texto: "Matriz de categorias por mês, com escolha entre base pagamento ou vencimento. É leitura: não altera lançamentos.",
  },
  "financeiro.relatoriosContabeis": {
    titulo: "Relatórios Contábeis",
    texto: "Visões por conta contábil e período para conferência e envio à contabilidade.",
  },
  "financeiro.filtroPeriodo": {
    titulo: "Período",
    texto: "Limita os dados exibidos ao intervalo escolhido. Vale para os totais e para a exportação da tela.",
  },
  "financeiro.exportar": {
    titulo: "Exportar",
    texto: "Gera um arquivo com exatamente o que está filtrado na tela, no formato aceito pelo Excel.",
  },

  // ───────────────────────────── Empresas, acesso e conta ─────────────────────────────
  "empresas.cadastro": {
    titulo: "Empresas",
    texto: "Cadastro das empresas do grupo, com dados fiscais e unidades. Os dados financeiros de cada empresa ficam isolados entre si.",
  },
  "empresas.usuarios": {
    titulo: "Gestão de Usuários",
    texto: "Convida pessoas e define o que cada uma acessa. O convite vale por link e só libera acesso após o aceite.",
  },
  "empresas.papelContabilidade": {
    titulo: "Papel Contabilidade",
    texto: "Acesso somente leitura para o contador: consulta e exporta, sem criar ou alterar lançamentos.",
  },
  "conta.configuracoes": {
    titulo: "Configurações",
    texto: "Preferências da conta e da empresa, como dados de exibição e opções do sistema.",
  },
  "conta.faturas": {
    titulo: "Faturas",
    texto: "Histórico de cobranças da assinatura, com situação e link de pagamento quando houver.",
  },
  "conta.planos": {
    titulo: "Planos e Módulos",
    texto: "Mostra o que já está contratado e o que pode ser adicionado. Módulos não contratados ficam apenas visíveis.",
  },

  // ───────────────────────────── Pessoas 360° (DP) ─────────────────────────────
  "dp.inicio": {
    titulo: "Pessoas 360°",
    texto: "Painel do módulo de pessoas: pendências, avisos e atalhos das rotinas do dia.",
  },
  "dp.colaboradores": {
    titulo: "Colaboradores",
    texto: "Cadastro das pessoas da empresa, com cargo, unidade, jornada e documentos. É a base de escalas, folgas e benefícios.",
  },
  "dp.colaborador.cadastroIncompleto": {
    titulo: "Cadastro Incompleto",
    texto: "Selo que aparece quando falta algum dado obrigatório da ficha. O salário conta como preenchido se vier do cargo.",
  },
  "dp.preadmissoes": {
    titulo: "Pré-Admissões",
    texto: "Link enviado ao candidato para ele mesmo preencher a ficha e anexar documentos. Só vira cadastro após a conferência da ficha oficial.",
  },
  "dp.importarFicha": {
    titulo: "Importar Ficha",
    texto: "Lê a ficha de registro enviada pela contabilidade e compara com os dados já informados, deixando você escolher o que vale.",
  },
  "dp.lixeira": {
    titulo: "Lixeira de Colaboradores",
    texto: "Cadastros removidos ficam guardados aqui para consulta ou recuperação, preservando o histórico.",
  },
  "dp.apoioUnidades": {
    titulo: "Atuação em Outras Unidades",
    texto: "Libera a pessoa para trabalhar em outra unidade sem duplicar o cadastro, mantendo cargo e setor próprios.",
  },
  "dp.folgas": {
    titulo: "Folgas",
    texto: "Solicitações, calendário e regras de folga. Há uma janela mensal de escolha e tratamento para exceções fora do prazo.",
  },
  "dp.ferias": {
    titulo: "Férias",
    texto: "Controle de períodos, saldo e prazos. Dois períodos em aberto ficam sinalizados como risco de pagamento em dobro.",
  },
  "dp.escalas": {
    titulo: "Escalas",
    texto: "Montagem da escala por unidade a partir da configuração de trabalho, com turno registrado dia a dia e publicação para o time.",
  },
  "dp.operacaoPanorama": {
    titulo: "Painel da Operação",
    texto: "Visão do mês por dia e turno, com alertas de cobertura abaixo do mínimo cadastrado.",
  },
  "dp.convocacoes": {
    titulo: "Convocações",
    texto: "Chamada de intermitentes para um dia e turno, com prazo de resposta. O aceite gera o item na escala.",
  },
  "dp.ocorrencias": {
    titulo: "Ocorrências",
    texto: "Registro de fatos do dia a dia da equipe (ausências, atrasos, observações) para consulta no histórico.",
  },
  "dp.atestados": {
    titulo: "Atestados",
    texto: "Atestados enviados pelo colaborador ou lançados pelo gestor, com efeito nas ausências e nos vales do período.",
  },
  "dp.disciplinar": {
    titulo: "Medidas Disciplinares",
    texto: "Advertências e orientações registradas na ficha da pessoa, com histórico e documento para ciência.",
  },
  "dp.documentos": {
    titulo: "Documentos",
    texto: "Envio e distribuição de documentos ao time (contracheque, recibos, comunicados), com histórico de acesso.",
  },
  "dp.documentosHistorico": {
    titulo: "Histórico de Documentos",
    texto: "Consulta de tudo que já foi enviado, por tipo, período e colaborador.",
  },
  "dp.avisos": {
    titulo: "Avisos",
    texto: "Comunicados publicados no mural do Portal do Colaborador, com controle de leitura.",
  },
  "dp.mensagens": {
    titulo: "Mensagens",
    texto: "Envio direto para colaboradores, com modelos reutilizáveis para os textos mais comuns.",
  },
  "dp.modelosMensagem": {
    titulo: "Modelos de Mensagem",
    texto: "Textos prontos com campos automáticos, usados ao enviar mensagens ao time.",
  },
  "dp.notificacoes": {
    titulo: "Notificações",
    texto: "Avisos internos do módulo, como fichas enviadas por candidatos e pedidos aguardando resposta.",
  },
  "dp.rotina": {
    titulo: "Rotina da Loja",
    texto: "Tarefas recorrentes da operação por unidade, acompanhadas por dia.",
  },
  "dp.analytics": {
    titulo: "Indicadores de Pessoas",
    texto: "Números do time (quadro, ausências, movimentações) apenas para leitura.",
  },
  "dp.cadastros": {
    titulo: "Cadastros do Módulo",
    texto: "Base que alimenta o restante do módulo: unidades, cargos, turnos, benefícios e documentos exigidos.",
  },
  "dp.unidades": {
    titulo: "Unidades",
    texto: "Locais de trabalho com funcionamento por dia, sindicato e pisos aplicáveis. Cada unidade pode ter salário de cargo próprio.",
  },
  "dp.cargos": {
    titulo: "Cargos",
    texto: "Cargo com piso salarial, turnos, documentos exigidos e complementos. Serve de padrão para os cadastros de pessoas.",
  },
  "dp.cargoSalarioUnidade": {
    titulo: "Salário do Cargo por Unidade",
    texto: "Piso pode variar por unidade conforme o sindicato patronal; o cadastro da pessoa usa o valor da unidade dela.",
  },
  "dp.beneficios": {
    titulo: "Benefícios",
    texto: "Padrões por cargo, unidade ou empresa para vales e demais benefícios, com aviso quando há diferença entre pessoas equivalentes.",
  },
  "dp.valesCorte": {
    titulo: "Vales por Dia",
    texto: "Vale alimentação e transporte calculados por dia útil, com dia de pagamento e data de corte. Faltas, folgas, atestado e férias reduzem o valor.",
  },
  "dp.documentosExigidos": {
    titulo: "Documentos Exigidos",
    texto: "Lista o que cada cargo ou unidade precisa entregar na admissão. Alimenta o checklist da ficha e as pendências.",
  },
  "dp.pendencias": {
    titulo: "Pendências",
    texto: "Tudo que falta resolver nos cadastros e documentos, com prazo configurável por tipo.",
  },
  "dp.turnos": {
    titulo: "Turnos",
    texto: "Horários padrão usados nas escalas e no cálculo da jornada, organizados em categorias editáveis por empresa.",
  },
  "dp.regrasJornada": {
    titulo: "Regras de Jornada",
    texto: "Define descanso semanal, folga em domingo e tratamento de sábado e feriado, com alertas para menores de idade.",
  },
  "dp.vinculo": {
    titulo: "Vínculo",
    texto: "Define as formas de pagamento permitidas e as regras aplicáveis. Freelancer e PJ ficam fora da folha e têm alertas próprios.",
  },
  "dp.menuPersonalizavel": {
    titulo: "Ordem do Menu",
    texto: "Arraste para definir a ordem dos itens do módulo e do Portal. É possível salvar como padrão da empresa.",
  },
  "dp.configuracoes": {
    titulo: "Configurações do Módulo",
    texto: "Ajustes gerais de Pessoas 360°, como prazos, ordem de menu e opções de operação.",
  },
  "dp.erros": {
    titulo: "Erros do Módulo",
    texto: "Registro técnico de falhas para apoio ao suporte. Não altera dados do time.",
  },
  "dp.calendario": {
    titulo: "Calendário",
    texto: "Visão de folgas, férias, ausências e feriados no mês, por unidade.",
  },


  // ── Seções (abas) de Pessoas 360° ──
  "dp.complementosSalariais": {
    titulo: "Complementos Salariais",
    texto: "Adicionais por tempo de serviço, salário-família e prêmios ligados ao cargo. Entram no cálculo da remuneração da pessoa.",
  },
  "dp.sindicatosLaborais": {
    titulo: "Sindicatos Laborais",
    texto: "Sindicato dos trabalhadores por unidade, com documentos da convenção que embasam pisos e regras.",
  },
  "dp.folgasSolicitacoes": {
    titulo: "Solicitações de Folga",
    texto: "Pedidos do time aguardando decisão, com prazo e histórico de cada análise.",
  },
  "dp.folgasRegras": {
    titulo: "Regras de Folga",
    texto: "Limites por dia, datas bloqueadas e janela de escolha usados na atribuição das folgas.",
  },
  "dp.trocasGestor": {
    titulo: "Trocas de Turno",
    texto: "Trocas propostas entre colegas. Só valem após o aceite dos dois e a aprovação do gestor.",
  },
  "dp.conformidadeDsr": {
    titulo: "Conformidade",
    texto: "Aponta descanso semanal e folga em domingo fora da regra, para correção antes de publicar a escala.",
  },
  "dp.beneficiosCalculo": {
    titulo: "Cálculo Mensal de Benefícios",
    texto: "Apura vales do mês por dia útil, aplicando corte, faltas, folgas, atestados e férias.",
  },
  "dp.beneficiosCatalogo": {
    titulo: "Cadastro de Benefícios",
    texto: "Benefícios disponíveis e seus padrões por cargo, unidade ou empresa.",
  },
  "dp.beneficiosHistorico": {
    titulo: "Histórico de Benefícios",
    texto: "Apurações já fechadas, para conferência e reemissão de relatórios.",
  },
  "dp.colaboradoresIncompletos": {
    titulo: "Cadastros Incompletos",
    texto: "Pessoas com dados obrigatórios faltando. Complete a ficha para liberar escalas, benefícios e documentos.",
  },
  "dp.rotinaDia": {
    titulo: "Rotina do Dia",
    texto: "Situação de hoje por turno, com quem está escalado e onde falta cobertura.",
  },
  "dp.rotinaMes": {
    titulo: "Rotina do Mês",
    texto: "Visão mensal por dia, com padrão histórico do dia da semana e alertas dispensáveis.",
  },
  "dp.feriasStatus": {
    titulo: "Status de Férias",
    texto: "Saldo, período aquisitivo e prazo de cada pessoa, com sinalização de risco de dobra.",
  },
  "dp.feriasContabilidade": {
    titulo: "Férias para a Contabilidade",
    texto: "Consolida os períodos concedidos para envio ao escritório, sem calcular folha no sistema.",
  },

  // ───────────────────────────── Portal do Colaborador ─────────────────────────────
  "portal.inicio": {
    titulo: "Portal do Colaborador",
    texto: "Área da pessoa para ver escala, documentos e pedidos. Cada um vê somente os próprios dados.",
  },
  "portal.mural": {
    titulo: "Mural",
    texto: "Avisos publicados pela empresa. A leitura fica registrada.",
  },
  "portal.perfil": {
    titulo: "Meu Cadastro",
    texto: "Seus dados pessoais e de contato. Alterações passam pela conferência do time de pessoas.",
  },
  "portal.documentos": {
    titulo: "Meus Documentos",
    texto: "Documentos enviados pela empresa e comprovantes que você anexou, disponíveis para consulta.",
  },
  "portal.solicitacoes": {
    titulo: "Minhas Solicitações",
    texto: "Pedidos como folga, ausência e ajustes, com o andamento de cada um.",
  },
  "portal.trocas": {
    titulo: "Trocas",
    texto: "Proposta de troca de dia ou turno com um colega. Vale somente após o aceite do colega e do gestor.",
  },
  "portal.ferias": {
    titulo: "Minhas Férias",
    texto: "Períodos já concedidos e pedidos em análise, com o saldo disponível.",
  },
  "portal.escala": {
    titulo: "Minha Escala",
    texto: "Seus dias e horários da escala já publicada. Rascunhos não aparecem aqui.",
  },
  "portal.convocacoes": {
    titulo: "Minhas Convocações",
    texto: "Chamadas para trabalhar em um dia e turno específicos, com prazo para aceitar ou recusar.",
  },
  "portal.sindicato": {
    titulo: "Sindicato",
    texto: "Informações do sindicato e documentos da convenção aplicáveis à sua unidade.",
  },
  "portal.historico": {
    titulo: "Meu Histórico",
    texto: "Registros de sua trajetória na empresa, como movimentações e ausências.",
  },

  // ───────────────────────────── Pré-admissão (candidato) ─────────────────────────────
  "preadmissao.formulario": {
    titulo: "Ficha do Candidato",
    texto: "Preencha seus dados e anexe os documentos pedidos. Você pode guardar e voltar depois pelo mesmo link.",
  },
  "preadmissao.familiares": {
    titulo: "Dependentes e Sesc",
    texto: "Inclua filhos e familiares conforme a finalidade. Os documentos pedidos mudam com a idade e o parentesco.",
  },
  "preadmissao.revisao": {
    titulo: "Revisão Final",
    texto: "Confira tudo antes de enviar. Depois do envio, novas alterações só com pedido de correção da empresa.",
  },
  "preadmissao.fichaOficial": {
    titulo: "Ficha Oficial",
    texto: "Documento enviado pela contabilidade. Receber o arquivo e registrar a conferência são ações separadas.",
  },

  // ───────────────────────────── Administração ─────────────────────────────
  "admin.estatisticas": {
    titulo: "Estatísticas",
    texto: "Números gerais da plataforma para a equipe interna, apenas leitura.",
  },
  "admin.clientes": {
    titulo: "Clientes",
    texto: "Contas cadastradas na plataforma, com situação de acesso e assinatura.",
  },
  "admin.cadastrosPadrao": {
    titulo: "Cadastros Padrão",
    texto: "Listas iniciais copiadas para novas empresas (categorias, contas contábeis, formas de pagamento).",
  },
  "admin.planos": {
    titulo: "Planos",
    texto: "Planos e módulos oferecidos, com preços e limites usados na contratação.",
  },
  "admin.assinaturas": {
    titulo: "Assinaturas",
    texto: "Situação da assinatura de cada cliente, incluindo período de teste e vencimentos.",
  },
  "admin.faturamento": {
    titulo: "Faturamento",
    texto: "Cobranças geradas e recebidas na plataforma de pagamentos.",
  },
  "admin.cupons": {
    titulo: "Cupons",
    texto: "Descontos aplicáveis na contratação, com validade e limite de uso.",
  },
  "admin.webhooks": {
    titulo: "Webhooks",
    texto: "Registro dos avisos recebidos de serviços externos, para conferência e diagnóstico.",
  },
  "admin.pluggyStatus": {
    titulo: "Status das Conexões",
    texto: "Situação técnica das integrações bancárias, útil para diagnosticar falhas de sincronização.",
  },
  "admin.perfisAcesso": {
    titulo: "Perfis de Acesso",
    texto: "Conjuntos de permissões aplicados aos usuários das empresas.",
  },
  "admin.auditoria": {
    titulo: "Auditoria",
    texto: "Trilha de ações relevantes com busca e filtros, usada para investigar mudanças.",
  },
  "admin.erros": {
    titulo: "Erros",
    texto: "Falhas capturadas na plataforma, com detalhes técnicos para o suporte.",
  },
  "admin.acessos": {
    titulo: "Acessos",
    texto: "Histórico de entradas na plataforma, útil para segurança e suporte.",
  },
  "admin.driftSaldos": {
    titulo: "Auditoria de Saldos",
    texto: "Aponta contas em que o saldo calculado difere do esperado, sem corrigir nada automaticamente.",
  },
  "admin.saudeSistema": {
    titulo: "Saúde do Sistema",
    texto: "Indicadores técnicos de funcionamento dos serviços da plataforma.",
  },
  "admin.modulos": {
    titulo: "Módulos",
    texto: "Controla quais módulos cada empresa pode usar.",
  },
  "admin.seo": {
    titulo: "Indexação",
    texto: "Acompanha a presença do site nos buscadores e solicita nova indexação.",
  },
  "admin.resetarDados": {
    titulo: "Resetar Dados",
    texto: "Ferramenta interna sensível: limpa dados de uma conta de teste. Use apenas com confirmação explícita.",
  },
  "admin.categorizacaoIa": {
    titulo: "Categorização por IA",
    texto: "Sugestões automáticas de categoria para lançamentos importados. As sugestões precisam de confirmação.",
  },
  "admin.bancos": {
    titulo: "Bancos",
    texto: "Lista de instituições usada nos cadastros de contas financeiras.",
  },
  "admin.documentosLegais": {
    titulo: "Documentos Legais",
    texto: "Versões de termos e políticas publicadas para os usuários.",
  },
  "admin.telasDesenvolvimento": {
    titulo: "Telas em Desenvolvimento",
    texto: "Controle interno de telas ainda não liberadas para os clientes.",
  },
  "admin.conectados": {
    titulo: "Conectados",
    texto: "Usuários com sessão ativa no momento da consulta.",
  },
  "admin.donos": {
    titulo: "Donos de Empresas",
    texto: "Responsáveis por cada empresa cadastrada na plataforma.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP_CONTENT;

export function getHelpEntry(key: HelpKey): HelpEntry {
  return HELP_CONTENT[key];
}

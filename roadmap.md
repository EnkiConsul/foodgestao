# Melhorias da admissão
## Calendário minimalista no Início
- [ ] Revisar Mês: contagens identificáveis, colunas de pico e alertas destacados; conferir abertura do dia e recuperação de carregamento.
- [x] Aproximar o Início do calendário oficial: nomes por turno, ausências e mesmas ações em janela adaptada ao celular.
- [x] Conferir detalhes e navegação com dados reais no celular e computador: 70 testes passaram; janela oficial e formulário de ausência abriram sem sair do Início. Nenhuma gravação ou publicação realizada.
- [x] Manter Hoje/Mês com navegação por setas e preservar o dia ao trocar o mês.
- [x] Conferir navegação com dados existentes e testar viradas de mês/ano, sem publicar (6 testes; computador/celular sem erros de execução).

## Refinamentos da janela de documentos
- [x] Sincronizar pendências após conclusão e fechar revisão completa somente com lote salvo (aprovação parcial mantém revisão aberta).
- [x] Mover auditoria para filtros no celular e permitir alternar envio/histórico sem sair da janela, preservando preenchimento.
- [x] Validar testes e navegação no celular/computador, sem publicar (21 testes, sem erros de execução; gravação real segue aguardando PDF autorizado).

## Importação em janela — Gerir Documentos
- [x] Abrir envio e histórico em janela sem deslocar a lista (celular e computador conferidos).
- [x] Fechamento após lotes salvos e atualização da lista; 4 testes de conclusão passaram.
- [ ] Conferir importação real até salvar — aguarda PDF autorizado para evitar documentos fictícios na empresa.

- [x] Separar documentos do menor, retirar declaração de CNH e preservar anexos.
- [x] Simplificar configuração de documentos e permitir inclusão/retirada pelo gestor.
- [x] Configurar parentescos/finalidades por empresa em toda a ficha.
- [x] Organizar blocos recolhíveis, alinhamento e uso no celular.
- [x] Validar regras no servidor e testar sem publicar.

# Melhorias observadas (Pessoas)
- [x] Parentesco: remoção pela rotina auditada (já sem chamada inexistente).
- [x] Cópia no aparelho do que o candidato digitou na pré-admissão.
- [x] Conferência da foto (girar/trocar) antes do envio.
- [x] Revisão do gestor mais confortável no celular.
- [x] Aviso de folgas aprovadas em datas bloqueadas.
- [x] Selo "Cadastro incompleto" mostra o que falta e abre a aba certa.

# Comprovação de pagamento (quitação)
- [x] Guardar modalidade da quitação (bancário, espécie ou misto) e os valores.
- [x] Exigir a data do pagamento ao anexar o comprovante.
- [x] Leitura automática da data e do valor em PDF, fotos e prints.
- [x] Recibo de pagamento em espécie timbrado: assinatura digital no portal.
- [x] Recibo de pagamento em espécie: opção de baixar para assinar à mão.
- [x] Mostrar data e forma de pagamento no certificado de validação e nos detalhes.

## Recibos avulsos (Emitir Recibo)
- [x] Tela Documentos → Emitir Recibo (colaborador ou pessoa sem cadastro, natureza, valor sugerido, forma de pagamento)
- [x] Assinatura pelo portal, link no WhatsApp (confirmação de CPF) ou à mão (PDF timbrado)
- [x] Freelancer mensalista gera pendência de recibo mensal e adiantamento, com atalho para a emissão
- [x] Sincronizar assinatura por WhatsApp e portal entre recibo, documento e certificado.
- [x] Registrar data, modalidade e valores da quitação no documento vinculado.
- [x] Cancelar recibo e arquivar o documento vinculado de forma atômica, reabrindo a pendência.
- [x] Criar histórico clicável com ficha completa do recibo e ações disponíveis.
- [x] Melhorar o retorno ao resolver pendência e identificar recibos no portal.

# Reunião Samanta (Praianos) — pendências
- [x] Sinalizar colaboradores sem cargo como cadastro incompleto (Samanta cadastra os cargos).
- [x] Dados bancários na ficha — já existem Banco, Agência, Conta, Dígito e Chave Pix; nenhuma mudança necessária.
- [x] Não cobrar documentos de meses antes da admissão — já funciona, nenhum ajuste.
- [x] Domingos de folga: cadastro centralizado em Folgas > Regras > Exceções por Colaborador (seletor por pessoa, com busca e filtro por unidade).
- [x] Ficha do colaborador só informa (segue a regra geral / tem exceção) e traz o atalho "Abrir regras de folgas".
- [x] Atalho abre a tela de regras já filtrada pela unidade e pelo nome da pessoa; avisa quando há alterações não salvas.
- [ ] Aplicar a exceção de 2 domingos/mês às 3 colaboradoras do Praianos (Art. 386 da CLT) — na tela nova.
- [ ] `private.dp_remuneracao_admin` ainda exige dono/administrador geral em vez da permissão de cadastros com salários.
- [ ] Testar no celular o fluxo disciplinar (via física assinada).
- [ ] Nada publicado: versão continua congelada, aguardando pedido explícito.

## Calendário de folgas (03/10)
- [x] Restrições do dia (colaborador/cargo/setor) no modal de /dp/folgas
- [x] "Todas as lojas": bloqueio por unidade mostra a loja
- [x] Detalhe do dia mostra limites por cargo/setor da unidade
- [x] Atalho do bloqueio/limite do dia para a tela de Regras

## Atalhos padrão (04/10)
- [x] Barra inferior: gestor e colaborador com Documentos e Folgas por padrão, para todos os usuários
- [x] Calendário do intermitente/freelancer diarista-horista segue o vínculo (rótulo "Calendário")
- [x] Documentos do gestor com abas Importar, Histórico e Recibos

## Histórico de Documentos (06/10)
- [x] Documentos cadastrais (identidade/CNH/residência/bancário/CRLV/seguro/dependente) fora do Histórico — ficam só na aba Documentos da ficha
- [x] Documento arquivado/excluído some da listagem na hora, sem recarregar
- [x] Filtro de tipos cadastrais enviado entre parênteses (sem eles a consulta abortava e a tela ficava vazia) + descarte em memória

## Visualizador de PDF e Histórico (06/10)
- [x] Preview de documento assinado não trava mais no "Carregando validação digital" (loading resetado ao chegar o certificado; espera síncrona na abertura)
- [x] Botão largo "Baixar Comprovante" removido dos cards — comprovante acessível pelo botão "Comprovante" e na visualização interna
- [x] PDF em branco por falta de Map#getOrInsertComputed/Math.sumPrecise (ES2025) — polyfills em src/lib/polyfills.ts; pdfjs atualizado para 6.4.299
- [x] Cancelamento de renderização de PDF tratado (troca de documento/zoom)

# Disparo pelo WhatsApp da Aveto
- [x] Convite de acesso ao portal (lote e ficha) enviado direto pela API.
- [x] Link de nova senha enviado direto pela API.
- [x] Link de assinatura de recibos (emitir, reenviar e comprovante) enviado direto pela API.

## Fase 3 — último bloco (09/10, checkout 'legado', acesso 'sombra', sem publicar)
- [x] Fechar teste o) com espera de 3 min (caso isolado em duas etapas)
- [x] Taxas do cartão editáveis pelo super admin (Backoffice → Assinaturas), com data da última alteração
- [x] Taxas do cartão validadas também no servidor
- [x] Checkout novo (só com checkout_v2 = 'v2') + teste t
- [x] Página "Minha assinatura" (/assinatura), só com checkout_v2 = 'v2'
- [x] Pró-rata pequena sem mensalidade em aberto: somar quando o Asaas gerar a próxima cobrança
- [x] Colaboradores excedentes no fechamento do ciclo
- [x] NFS-e pelo Asaas com parâmetro emitir_nfse (padrão desligado)
- [x] Conciliação diária com o Asaas (só aponta)
- [x] Testes u e y
- [x] Testes v, w, x, inventário do Sandbox e limpeza [TESTE]
- [x] Opção Grupo no checkout com 2+ empresas (teste z1)
- [x] Alterar dados do pagador em Minha assinatura (teste z2)
- [ ] NFS-e: cadastrar informações fiscais/municipais no Asaas (validação com o contador) antes de ligar

# Pré-admissão e contatos de emergência
- [x] Contatos de emergência (1 obrigatório, até 2) na ficha do candidato, revisão, PDF e ficha do colaborador.
- [x] Confirmação semestral no portal (WhatsApp + contatos), pedido antecipado pelo DP.
- [x] Retirar "enviar à contabilidade"; PDF só baixa; etapas Preenchimento › Revisão › Registro › Efetivado.
- [x] PDF completo e lendo o que está na tela.
- [x] Atalhos por situação com contadores e filtro de vínculo na lista.

# Efetivação de freelancer/PJ/MEI para CLT
- [x] Quadro de pendências do registro (PIS, CTPS, título, RG, endereço, reservista) na alteração de vínculo, com lembretes de quitação, ASO e contrato.
- [x] Botão "Solicitar complemento pelo portal": cria pedido tipo documento + aviso ao colaborador (RPC dp_solicitar_complemento_clt, sem duplicar pedido pendente igual).
- [x] Portal mostra "Envio de documentos" com atalho para enviar; gestor vê o rótulo na tela de solicitações.
- [x] Aviso de diárias/recibos pendentes de quitação até a véspera da vigência (recibos emitidos sem assinatura, com total em R$).
- [x] Conferido no navegador: quadro de efetivação CLT com pendências, botão de complemento e aviso de recibos (ficha da Cristiane).
- [x] Conferido no navegador: ficha da Nathanaelly abre com nome/CPF/WhatsApp e contatos de emergência; PDF de 16 páginas com dados, dependentes e anexos; seção administrativa passou a usar os dados previstos da vaga quando o gestor ainda não preencheu; subtítulo da tela sem menção à contabilidade.

# Cadastro, módulos e navegação (12/10)
- [x] Textos das etapas do onboarding legíveis (tokens movidos para :root/.dark e mapeados no tailwind.config.ts)
- [x] Botão "Criar conta" e aviso "7 dias grátis" na página inicial
- [x] Período de teste padronizado em 7 dias (tela de módulos e provisão no banco)
- [x] Módulos não contratados barrados: Hub com selo "Bloqueado" e aviso por endereço direto
- [x] Saídas na tela de acesso bloqueado: "Voltar ao Hub" no topo, "Trocar de Empresa" e "Sair da Conta" no rodapé — conferido no navegador
- [ ] Nada publicado: aguardando pedido explícito para atualizar aveto360.com
- [ ] Assinatura cancelada do Financeiro da AVETO 360 pode travar o aceite do termo do colaborador (revisão separada, a pedido)

# Histórico de Atestados — visualização
- [x] Período e retorno no visualizador, com Detalhes no rodapé.
- [x] Ficha completa e confortável no celular.
- [x] Conferir Ver → Detalhes com atestado existente no celular e computador, sem publicar.

# Ações do Dia — carregamento
- [x] Reduzir espera com consultas independentes em paralelo e último retrato disponível.
- [x] Limitar a espera, mostrar falhas e permitir tentar novamente.
- [x] Testar carregamento e recuperação no celular, sem publicar (56 ações preservadas; 15 testes passaram).

# Pré-Admissões — mobile first e envio
- [x] Substituir filtros laterais por resumo e seleção sem rolagem horizontal.
- [x] Organizar cartões, prazos e ações rápidas; convite e revisão confortáveis no celular.
- [x] Oferecer WhatsApp, Business e compartilhamento com alternativas seguras (abertura dos aplicativos depende do aparelho).
- [x] Testar filtros e revisão com dados reais, sem publicar (3 fichas; celular e computador; 2 testes de links).

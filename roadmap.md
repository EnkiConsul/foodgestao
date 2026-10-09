# Melhorias da admissão
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
- [ ] Checkout novo (só com checkout_v2 = 'v2')
- [x] Página "Minha assinatura" (/assinatura), só com checkout_v2 = 'v2'
- [ ] Pró-rata pequena sem mensalidade em aberto: somar quando o Asaas gerar a próxima cobrança
- [ ] Colaboradores excedentes no fechamento do ciclo
- [ ] NFS-e pelo Asaas com parâmetro emitir_nfse (padrão desligado)
- [ ] Conciliação diária com o Asaas (só aponta)
- [x] Testes u e y
- [ ] Testes t, v, w, x, inventário do Sandbox e limpeza [TESTE]

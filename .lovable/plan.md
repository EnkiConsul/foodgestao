# Admissão simples: salvar, concluir e acompanhar os próximos passos

## Objetivo
Simplificar a revisão no Pessoas 360° para que cada avanço salve o trabalho, o formulário tenha espaço útil no celular e a conferência possa terminar mesmo quando o ASO ainda não estiver disponível. Conferir a ficha, enviar à contabilidade e efetivar o vínculo são decisões separadas.

## 1. Revisão da ficha
- Rodapé em uma linha: **PDF** compacto + **Salvar e Avançar**. Na última aba, a ação será **Salvar e Finalizar**. Remover os botões separados de salvar, avançar e aprovar.
- Salvar e Avançar aguarda a confirmação de gravação antes de abrir a próxima aba. Se houver falha, manter os dados digitados e a aba atual, informar o problema e permitir tentar novamente.
- Salvar e Finalizar grava os últimos ajustes e conclui a conferência, preservando as verificações atuais de campos, documentos obrigatórios, abas visitadas e divergências pendentes. Não efetiva o colaborador nem marca envio à contabilidade.
- Abas do topo continuam clicáveis e mantêm o preenchimento em memória. Trocar diretamente de aba não será apresentado como salvamento; ao sair com alterações não salvas, oferecer salvar ou descartar com confirmação.
- Bloquear toques repetidos enquanto uma ação estiver em andamento e mostrar confirmação somente após o sucesso real.
- PDF disponível a qualquer momento: prévia identificada antes da liberação; versão apropriada ao vínculo depois. Baixar não significa enviar à contabilidade.

## 2. Depois de finalizar: CLT e intermitente
```text
Ficha conferida e salva
        ↓
ASO pendente → anexar agora ou retomar depois
        ↓
ASO Apto anexado ou dispensa formal válida
        ↓
Baixar ficha + ASO/documentação da dispensa
        ↓
Gestor confirma envio à contabilidade
        ↓
Retorno da contabilidade conferido
        ↓
Efetivar colaborador
        ↓
Oferecer anexar documentos de admissão para assinatura
```
- Ao finalizar, abrir orientação com **Anexar ASO** e **Fazer depois**. Fechar esse aviso não desfaz a conferência: a ficha fica salva e a pendência pode ser retomada na lista e na revisão.
- Reutilizar o formulário oficial do ASO: arquivo e resultado Apto; dispensa apenas por dono/admin, com fundamento legal, justificativa de pelo menos 15 caracteres e ciência expressa. Não sugerir dispensa automática por porte ou grau de risco.
- Sem ASO válido ou dispensa formal, não liberar a marcação de envio à contabilidade nem a efetivação. Isso não bloqueia salvar a ficha ou baixar uma prévia.
- Após resolver o ASO, orientar a baixar a ficha e o exame (ou registro da dispensa) e enviá-los à contabilidade. Usar downloads existentes; não criar uma integração de envio nem afirmar que o sistema registrou no eSocial.
- **Confirmar envio** é uma ação explícita do gestor; baixar arquivos nunca muda esse status sozinho.
- Manter o retorno contábil conferido como requisito da efetivação formal, conforme o fluxo atual.
- ASO é requisito ocupacional do fluxo adotado; não apresentar a sequência como afirmação de que o eSocial é tecnicamente incapaz de receber registro sem ele.

## 3. Freelancer, PJ e MEI
- Após Salvar e Finalizar, perguntar: **“Ficha concluída! Deseja efetivar o colaborador agora?”**
- Oferecer efetivar agora ou depois. Não exigir ASO ou a etapa de registro contábil de admissão aplicada ao emprego formal.
- Não efetivar automaticamente, não gerar contratos ou termos e não tratar a escolha do vínculo como garantia de inexistência de obrigações legais.
- Preservar orientações e validações próprias desses vínculos. Estágio, temporário e demais vínculos mantêm suas regras atuais, sem enquadramento automático no fluxo de freelancer.

## 4. Documentos após a efetivação
- Efetivar com confirmação explícita e, após o sucesso, abrir a área de documentos do colaborador correto.
- Oferecer anexar **ficha de registro, contrato, aditivos e outros documentos**, respeitando o catálogo da empresa e o vínculo. Permitir vários arquivos quando o requisito admitir.
- Reutilizar os caminhos oficiais de **enviar para assinatura eletrônica pelo portal**, **registrar via física assinada** ou **apenas arquivar**, conforme as opções já suportadas e as permissões.
- Se alguma opção não estiver disponível no caminho atual, adaptar a rotina oficial preservando autorização, auditoria e integridade; não criar baixa de assinatura só no navegador.
- Anexos podem ser incluídos naquele momento ou depois: fechar o painel não desfaz a efetivação. Assinaturas solicitadas continuam pendentes até a conclusão real; documentos já assinados não voltam a ser pendentes.
- Preservar arquivos originais, histórico e evidências de aceite; usar somente nome civil em documentos e assinaturas. Não gerar contrato, termo de banco de horas ou termo de folga compensatória.

## 5. CPF e datas da jornada
- A checagem de CPF ignora somente o colaborador comprovadamente vinculado à própria pré-admissão. Outro cadastro com o mesmo CPF continua sendo tratado pelas regras oficiais, sem ocultar duplicidades reais.
- Na configuração inicial, usar a data de início na loja como padrão da vigência. Se ainda não houver início na loja, usar a data de admissão quando disponível; evitar assumir hoje silenciosamente.
- Ao informar o início na loja, alinhar a vigência ainda automática. Se o gestor já escolheu uma vigência ou existe jornada registrada, mostrar a diferença e pedir confirmação antes de substituir.
- Não regravar retroativamente jornadas reais pela simples abertura da ficha. Preservar as regras de ciência, vigência e justificativa para mudanças em cadastro existente.
- Ativação provisória na rotina continua exclusivamente em **Horário de Trabalho**, separada da efetivação formal; nunca inserir ativação na aba Documentos.

## 6. Celular e retomada
- Priorizar 407 × 748 e verificar também 320px e computador: duas ações no rodapé, áreas de toque confortáveis, rótulos completos e conteúdo sem rolagem lateral.
- Cabeçalho e avisos não devem consumir a área dos campos; resumo de etapa compacto, rolagem central independente e rodapé protegido da área segura do aparelho.
- Não prometer ganho fixo de pixels: confirmar o espaço útil real com teclado aberto, avisos, carregamento e mensagens de validação.
- Reabrir uma ficha deve recuperar a conferência salva e apresentar o próximo passo real (ASO, envio, retorno ou efetivação), sem reapresentar ações já concluídas.

## Detalhes técnicos
- Reutilizar `PreadmissaoRevisaoDialog`, `ColaboradorFormDialog`, o painel de jornada, hooks de pré-admissão e o fluxo oficial de documentos, sem criar ficha paralela.
- Conectar a ação do rodapé ao submit real do formulário e aguardar todas as gravações necessárias antes de navegar ou finalizar. Tratar salvamento parcialmente bem-sucedido sem mostrar sucesso global nem perder o estado da edição.
- Preservar `salvar_ficha`, `salvar_admin`, `salvar_aso`, `aso_arquivo`, marcação de status e efetivação como portas oficiais. A aprovação existente passa a representar conclusão da conferência, sem pular os requisitos posteriores.
- A lista e a revisão derivam o próximo passo dos dados persistidos e do regime; não inventar status apenas locais que desapareçam ao recarregar.
- Confirmar o vínculo do cadastro provisório no servidor ao corrigir a leitura de CPF. Manter efetivação idempotente e conversão do mesmo cadastro provisório, sem duplicar identidade ou histórico.
- Mudanças de estrutura, caso indispensáveis, devem ser aditivas/reversíveis, com isolamento por empresa, permissões e auditoria. Não enfraquecer as travas atuais para simplificar a tela.
- Escopo comercial: Pessoas 360°; preservar as exigências do módulo Escala nos caminhos operacionais existentes.

## Verificação e limites
- Testar gravação e leitura de volta antes de avançar; falha em cada gravação, toque duplo, fechamento e retomada.
- Testar finalizar sem ASO, retomar depois, barrar envio sem ASO, dispensa com permissões e justificativa, confirmação de envio e retorno antes da efetivação.
- Testar freelancer/PJ/MEI sem etapas indevidas, efetivação idempotente e abertura dos documentos no colaborador correto.
- Testar CPF do próprio provisório versus outro cadastro e datas inicial, manual e já registrada.
- Testar anexos/aceite, via física, assinatura pendente e já concluída por meio das rotinas oficiais.
- Validar navegação autenticada no celular e computador sem alterar dados reais. Gravações de teste devem usar simulação ou transações desfeitas, sem criar um ambiente empresarial separado.
- Não testar salvamentos, aprovações ou efetivação na ficha real da Verônica. A conferência visual dela será somente leitura; confirmar leitura após gravação em testes controlados.
- Não alterar cobrança, flags comerciais, recrutamento ou dados reais de colaboradores. Não publicar a interface nem aplicar mudanças compartilhadas do banco/serviços sem autorização explícita para essa execução.

## Ordem de entrega
1. Unificar salvamento e navegação e compactar a ficha.
2. Separar conferência concluída dos passos posteriores, com ASO retomável e fluxo por vínculo.
3. Conectar efetivação à área oficial de documentos.
4. Corrigir CPF e padrão de vigência, preservando dados existentes.
5. Executar testes focados e conferência visual; informar o que foi verificado antes de qualquer publicação.
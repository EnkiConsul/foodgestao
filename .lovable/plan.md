## Objetivo
Corrigir todas as telas do módulo DP para seguirem a estrutura visual e de navegação da documentação anexada do GitHub, mantendo as cores atuais do projeto.

## Escopo
Serão alinhadas as páginas administrativas e do portal do colaborador dentro de `/dp` e `/dp/meu`, sem alterar regras de negócio, banco de dados, permissões ou paleta global.

## Direção visual a aplicar
- Manter o layout com sidebar DP, fundo claro/padronizado e conteúdo central com largura consistente, como nos anexos.
- Usar cabeçalhos padronizados: ícone + título, subtítulo abaixo, ação principal à direita e favorito/notificação quando aplicável.
- Usar cards e tabelas com a mesma hierarquia da documentação: borda sutil, cantos moderados, filtros em faixa/card antes da listagem e ações por ícones.
- Manter as cores já existentes do app/DP; a correção será de estrutura, espaçamento, componentes, hierarquia e organização.

## Implementação proposta
1. **Criar base reutilizável de layout DP**
   - Componentes comuns para `DpPage`, `DpPageHeader`, `DpFilterBar`, `DpSectionCard`, `DpMetricCard` e estados vazios/loading.
   - Isso evita corrigir tela por tela com estilos divergentes.

2. **Padronizar páginas administrativas principais**
   - `DpHome`: alinhar com o painel administrativo da documentação, com pendências, aniversariantes e atalhos favoritos no mesmo padrão.
   - `DpColaboradores`: manter a estrutura da documentação e corrigir inconsistências visuais restantes, incluindo filtros, tabela, badges, switches e ações.
   - `DpSolicitacoes`, `DpFolgas`, `DpAprovacoes`, `DpAtestados`, `DpTrocas`, `DpBloqueios`: aplicar cabeçalho, filtros/tabs e listas/calendário no mesmo padrão.
   - `DpDocumentosHub`, `DpDocumentos`, `DpHistoricoCompleto`, `DpDocImportBulk`, `DpDisciplinar`: unificar estrutura de documentos, cards de categoria, histórico, importação e registros.
   - `DpCadastrosHub`, `DpUnidades`, `DpCargos`, `DpSindicatos`, `DpSindicatoNegociacoes`: alinhar cadastros ao padrão de listagem/formulário da documentação.
   - `DpComunicacaoHub`, `DpAvisos`, `DpMensagens`, `DpModelosMensagem`: alinhar comunicação ao padrão de cards/listas e ações.
   - `DpFolhaHub`, `DpFolhaAprovacoes`, `DpFolhaPeriodo`: aplicar a mesma estrutura visual para folha e aprovações.

3. **Padronizar portal do colaborador**
   - Ajustar `DpMeuHome`, `DpMeuPerfil`, `DpMeuDocumentos`, `DpMeuSolicitacoes`, `DpMeuTrocas`, `DpMeuCalendario`, `DpMeuAtestados`, `DpMeuDisciplinar`, `DpMeuSindicato` e `DpMeuHistorico` para seguirem a mesma linguagem visual da documentação, com foco em experiência simplificada para colaborador.

4. **Ajustar navegação e consistência**
   - Garantir sidebar com grupos, estados ativos e espaçamentos compatíveis com os anexos.
   - Garantir que hubs, atalhos e rotas internas tenham o mesmo padrão de cards e botões.

5. **Validação**
   - Conferir visualmente as telas principais em desktop.
   - Rodar typecheck/teste aplicável.
   - Não alterar cores globais nem adicionar migrations/backend.

## Fora do escopo
- Alterar paleta, marca ou tokens de cor.
- Criar novas funcionalidades de backend.
- Reestruturar permissões, tabelas ou regras de negócio.
- Publicar/deployar automaticamente.
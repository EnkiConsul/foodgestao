# Aviso de assinatura de documentos no portal do colaborador

## O que muda para o colaborador

Sempre que a empresa enviar um documento que precisa da assinatura dele (contracheque, aviso de férias, contrato, ficha etc.), ao entrar no aplicativo aparece um aviso em destaque, por cima de qualquer tela, com a lista dos documentos parados esperando assinatura.

Como funciona:

- O aviso mostra um documento por vez, começando pelo mais antigo, com título, tipo e competência.
- O colaborador precisa abrir o documento antes de assinar. O botão "Assinar documento" só libera depois que ele visualiza o arquivo.
- Ao assinar, registramos data, hora e dispositivo (igual ao aceite que já existe hoje) e o aviso passa para o documento seguinte.
- Se ele fechar sem assinar, o aviso volta sozinho depois de 10 minutos, em qualquer tela do aplicativo, e continua voltando até assinar tudo.
- Quando não sobra nenhum documento pendente, o aviso não aparece mais.
- O contador de pendências e a tela "Meus documentos" continuam funcionando como hoje e ficam sincronizados com o que foi assinado no aviso.

## Detalhes técnicos

Novo hook `src/hooks/portal/useDocumentosAguardandoAssinatura.tsx`:
- consulta `dp_documentos` do colaborador com `exige_aceite = true`, `submetido_por_colaborador = false`, `aprovacao_status = 'aprovado'`, sem registro correspondente em `dp_documento_aceites`;
- ordena por `created_at` ascendente (mais antigo primeiro);
- reaproveita `dp_colaborador_of` para resolver o colaborador, como em `useMeusDocumentos`.

Novo componente `src/components/dp/portal/DocumentoAssinaturaGate.tsx`:
- `Dialog` (shadcn) com `onOpenChange` que só fecha via botão "Ver depois"; sem fechamento por clique fora nem ESC;
- estado `visualizou` por documento: signed URL do bucket `dp-documentos` aberta em nova aba / preview embutido; assinatura desabilitada até `visualizou === true`;
- mutation de aceite idêntica à de `DpMeuDocumentos.tsx` (insert em `dp_documento_aceites` com `company_id`, `colaborador_id`, `documento_id`, `modelo`, `modelo_versao`, `conteudo_hash`, `aceito_por`, `user_agent`);
- ao concluir, invalida `dp_meus_documentos_unified`, o hook novo e as chaves de pendências do colaborador (`useDpPendenciasColaborador`);
- reabertura: `setTimeout` de 10 minutos após "Ver depois" (timer no componente, que fica montado no shell, portanto persiste na navegação entre telas); ao trocar de sessão/refresh o aviso aparece imediatamente.

Montagem em `src/components/dp/ColaboradorShell.tsx`, ao lado de `CarenciaPortalBanner`, para valer em todas as telas do portal.

Extrair o texto/lógica de aceite compartilhado para evitar duplicação com `DpMeuDocumentos.tsx` (usa `DOCUMENTO_CONFIRMACAO_TEXTO` já existente).

Sem alteração de banco de dados: as tabelas e políticas atuais já suportam o fluxo.

Testes: teste unitário da seleção/ordenação dos documentos pendentes e validação no celular (393×830) com um documento pendente.

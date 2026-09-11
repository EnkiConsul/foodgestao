# Aviso de férias, ciência e recibo no card das férias

## O que muda

### 1. Aviso de férias sai junto com a marcação
- Ao programar/aprovar férias, o colaborador recebe um aviso no portal ("Aviso de férias — dê sua ciência"), com as datas, os dias e o prazo legal.
- O aviso registra a data de envio e quantos dias faltam para o início.
- Enquanto não houver ciência, o card mostra o selo **"Aviso enviado — aguardando ciência"**.

### 2. Aviso com atraso exige justificativa
- Se o aviso sair com menos de 30 dias de antecedência do início, o sistema marca o aviso como **fora do prazo** e o gestor precisa escrever a justificativa antes de enviar.
- O texto do aviso ao colaborador deixa claro que a comunicação está fora do prazo legal de 30 dias e mostra a justificativa da empresa.
- Na ciência, o colaborador vê essa informação e o registro guarda que ele deu ciência a um aviso fora do prazo.
- O card do gestor mostra o selo **"Aviso fora do prazo"** com a justificativa.

### 2b. Aviso retroativo (comunicação feita fora do sistema)
- O gestor pode informar uma **data de aviso retroativa** (anterior a hoje), inclusive para férias já iniciadas ou concluídas, apenas para reconstruir o histórico.
- Ao escolher data retroativa, ele marca uma declaração de ciência: "confirmo que a comunicação foi feita formalmente por outro meio na data informada".
- Nesse caso o **anexo do aviso passa a ser obrigatório** (comprovante da comunicação); sem o arquivo o registro não é salvo.
- Se a data informada respeitar os 30 dias, o aviso conta como dentro do prazo; se não, continua exigindo justificativa e recebe o selo "Aviso fora do prazo".
- O card mostra **"Aviso registrado retroativamente"** com a data declarada, quem declarou e o comprovante anexado.

### 3. Anexos no mesmo card das férias
No card de cada férias (Programadas / Em férias / Histórico e também em Minhas Férias):
- **Aviso de férias** — anexo opcional (o documento assinado, quando houver).
- **Recibo de férias** — anexo obrigatório, cobrado depois que a contabilidade emite. Enquanto faltar, o card mostra **"Recibo de férias pendente"** e a mesma pendência aparece na lista de pendências do DP.
- Cada anexo mostra nome do arquivo, data e ações abrir/substituir/excluir.

### 4. Histórico de documentos
- Os dois anexos são gravados como documentos do colaborador nos tipos "Aviso de Férias" e "Recibo de Férias", com a data de início das férias como referência.
- Aparecem no histórico de documentos do DP e no portal do colaborador ("Meus documentos"), filtráveis por esses tipos.
- Excluir o anexo pelo card remove o documento do histórico (com registro em auditoria).

## Fora do escopo
- Não haverá envio automático por WhatsApp/e-mail do aviso: a comunicação é a notificação do portal (como já ocorre hoje).
- O recibo continua sendo emitido fora do sistema pela contabilidade; aqui só é anexado.

## Detalhes técnicos

**Banco**
- `dp_ferias_gozos`: usar `aviso_em` como data de envio do aviso; novas colunas `aviso_enviado_em timestamptz`, `aviso_fora_prazo boolean default false`, `ciente_fora_prazo boolean default false`, `aviso_retroativo boolean default false`, `aviso_retroativo_declarado_por uuid`, `aviso_retroativo_declarado_em timestamptz`; `aviso_justificativa` passa a guardar a justificativa do atraso.
- RPC `dp_ferias_registrar_aviso(_gozo_id, _aviso_em, _retroativo, _justificativa, _documento_id)`: quando `_aviso_em < current_date`, exige `_retroativo = true` e `_documento_id` de um `dp_documentos` do tipo `aviso_ferias` ligado ao gozo; `aviso_fora_prazo` calculado sobre `_aviso_em`.
- `dp_documentos`: nova coluna `ferias_gozo_id uuid references public.dp_ferias_gozos(id) on delete set null` + índice, para amarrar aviso/recibo ao gozo (tipos `aviso_ferias` e `recibo_ferias` já existem no enum).
- `dp_ferias_programar` / `dp_ferias_aprovar`: calcular `aviso_fora_prazo = (data_inicio - current_date) < 30`; exigir justificativa quando fora do prazo; criar notificação `ferias_aviso` (chave `ferias_aviso:<gozo_id>`) com texto de prazo/atraso, além da notificação atual.
- `dp_ferias_registrar_ciencia`: gravar `ciente_em`, `ciente_por` e `ciente_fora_prazo` a partir do gozo.
- `dp_ferias_minhas`: devolver `aviso_enviado_em`, `aviso_fora_prazo`, `aviso_justificativa` e os anexos (aviso/recibo) do gozo.
- RPC nova `dp_ferias_documentos(_company_id)` ou select em `dp_documentos` por `ferias_gozo_id` para o painel do gestor (RLS por empresa, colaborador vê só os próprios).

**Front**
- `src/hooks/useDpFerias.tsx`: expor `avisoFeriasDocs`, mutations `anexarDocumentoFerias` / `excluirDocumentoFerias` (upload no bucket `dp-documentos` + insert em `dp_documentos` com `ferias_gozo_id`).
- Novo `src/components/dp/ferias/FeriasDocumentosCard.tsx` (linha de anexos reutilizável) usado em `FeriasGozosPanel.tsx` e em `src/pages/dp/portal/DpMeuFerias.tsx`; usar `DpFilePicker`.
- `FeriasGozoDialog.tsx`: campo de justificativa obrigatório quando o aviso fica fora dos 30 dias, com aviso visual.
- `DpMeuFerias.tsx`: diálogo de ciência mostrando prazo/atraso e a justificativa da empresa.
- Pendência de recibo: incluir em `src/lib/dp/pendencias-documentos.ts` e no refresh server-side de pendências.
- Testes: cálculo de fora do prazo em `src/lib/dp/__tests__/`, e pendência de recibo.

# Prazo de 5 dias e certificado de validação de documento

## 1. Atraso grave passa de 3 para 5 dias

- O documento enviado pela empresa que espera aprovação do colaborador passa a ter 5 dias corridos de prazo.
- Depois dos 5 dias, a pendência continua sendo marcada como "Atraso grave" (vermelho, no topo da lista).
- O mesmo prazo de 5 dias vale para o alerta que o RH vê sobre documentos aguardando aprovação, para os dois lados ficarem iguais.

## 2. Sim, existe registro de cada aprovação

Hoje, quando o colaborador aprova um documento, o sistema já guarda:

- quem aprovou e a data/hora exata;
- o endereço de internet (IP) e o aparelho/navegador usado;
- uma impressão digital do conteúdo aprovado (para provar que o arquivo não mudou depois);
- o modelo e a versão do texto de aprovação.

Isso já aparece na tela de detalhes do documento (data do aceite e quem aceitou), mas hoje não é possível imprimir.

## 3. Certificado de validação imprimível (novo)

- Na tela de detalhes do documento (visão do RH) e na área do colaborador, os documentos aprovados ganham o botão "Certificado de validação".
- O certificado abre pronto para imprimir ou salvar em PDF, com: empresa, colaborador (nome social/nome), documento e competência, data e hora da aprovação, quem aprovou, IP, aparelho usado, impressão digital do arquivo e código do registro para conferência.
- O botão aparece só quando o documento foi realmente aprovado; documentos pendentes ou dispensados não geram certificado.

## Detalhes técnicos

- `src/lib/dp/documento-aprovacao.ts`: `PRAZO_APROVACAO_DIAS` de 3 → 5; atualizar `src/lib/dp/__tests__/documento-aprovacao.test.ts` (datas esperadas) e qualquer texto que cite "3 dias".
- Verificar o alerta do RH sobre documentos aguardando aprovação para reutilizar a mesma constante em vez de um número solto.
- Novo `src/lib/dp/documento-certificado.ts`: monta o HTML imprimível a partir da linha de `dp_documento_aceites` + `dp_documentos` + colaborador/empresa, no mesmo padrão de `src/lib/dp/holerite.ts` (abre em nova janela e chama `print()`).
- `src/components/dp/documentos/DocDetalhesDialog.tsx`: botão no bloco de aceite, usando os dados já carregados (`aceite`, `doc`, nomes).
- `src/pages/dp/portal/DpMeuDocumentos.tsx` / `src/hooks/portal/useMeusDocumentos.tsx`: incluir `ip`, `user_agent`, `conteudo_hash`, `id` do aceite na consulta e expor o mesmo botão para o próprio colaborador.
- Sem mudança de banco: `dp_documento_aceites` já tem tudo o que o certificado precisa.
- Teste novo para o gerador do certificado (campos obrigatórios presentes) além dos testes de prazo ajustados.

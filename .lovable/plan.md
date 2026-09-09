# Correções e melhorias — Portal, Cadastro e Importação de Documentos

Lista longa, organizada em 6 frentes. Tudo confirmado na leitura do sistema antes de propor.

## 1. Acesso ao portal do colaborador

- A senha gerada passa a ser **provisória**: no primeiro acesso o portal bloqueia tudo até o colaborador definir uma senha nova e confirmar telefone e e-mail. Hoje o acesso é criado sem essa marca, por isso o Nordman entrou direto.
- Depois de gerar o acesso, aparece a opção **"Enviar pelo WhatsApp"**, com o texto do modelo de mensagem cadastrado (quando existir) + link do portal + usuário + senha provisória. Se não houver modelo, usa um texto padrão do sistema.
- Reenvio disponível junto de "Resetar senha".

## 2. Nome social

- Novo campo **Nome social** na ficha do colaborador (opcional; ex.: Nordman e Erildson → "Júnior").
- Onde é usado: rotina do dia, escalas, listas, avisos e portal.
- Onde **não** é usado: documentos, ficha de registro, rescisão e qualquer peça legal — ali continua o nome completo.

## 3. Falsa falta de documentos (o problema mais grave)

Causa confirmada: na conferência do lote o sistema só considera "quem já tem o documento" as páginas **daquele lote**. Documentos salvos em importações anteriores são ignorados — por isso subir só a Karine ou só a Cristiane acusa falta de todos os outros.

- A conferência passa a somar o que já está salvo no sistema para aquela unidade e competência, além do lote atual.
- Também confirmado: depois de salvar, as listas de pendências não são recarregadas. Serão atualizadas na hora (caso da folha de ponto 07/2026 da Garavelo, que continuou pendente para 10 pessoas).
- Rótulo corrigido: "lote completo da unidade" só quando falta de **todos** os elegíveis. Faltando parte, mostra a quantidade; faltando uma pessoa, mostra o nome (caso da rescisão da Karine).
- Documento fora dos tipos coletivos (ex.: "outros") **nunca** gera falta para os demais colaboradores.

## 4. Adiantamento salarial

- Só é cobrado de quem tem adiantamento marcado no cadastro. Sócio e intermitente ficam fora sempre.
- **Histórico da opção**: ao ligar o botão, informa-se a data de início (sugere a data do dia, pode ser retroativa); ao desligar, a data de fim. Regra de virada: data anterior ao pagamento do adiantamento vale já naquela competência; data igual ou posterior vale da competência seguinte.
- O sistema só cobra adiantamento nas competências dentro de um período ativo. Caso Rosângela: nada de pendência nos meses sem opção, e os documentos já enviados continuam visíveis no portal dela.
- Admissão depois do pagamento não gera pendência (Karen, 29/07) e desligamento antes do pagamento também não (Karine, 02/07).

## 5. Folha de ponto, rescisão e importação

- Folha de ponto passa a ser reconhecida automaticamente pelo conteúdo (hoje caiu em "outros"). Se o tipo continuar incerto, o sistema pede a confirmação em vez de assumir "outros".
- **Validação digital ligada por padrão** em todo documento enviado ao colaborador, inclusive "outros".
- Intermitente sem nenhum dia trabalhado na competência não gera pendência de folha de ponto (Wanderson, desligado 01/08).
- **Vários arquivos por importação**: dá para anexar mais de um PDF de uma vez; eles são processados juntos no mesmo lote.
- Para rescisão, um agrupamento **"Documentos de rescisão"**: TRCT + os demais papéis que a contabilidade manda ficam juntos no mesmo conjunto do colaborador (Karine e Wanderson).
- As pendências de **férias não agendadas** saem da tela de importar documentos; continuam na tela de Férias.

## 6. Cadastro por ficha e readmissão

- A importação de ficha passa a pedir, antes de concluir, os campos que geram inconsistência depois: ponto ativo, adiantamento salarial, vínculo e forma de pagamento.
- Unidade com relógio de ponto já sugere **ponto ativo** marcado (caso Thais).
- **Readmissão / mudança de vínculo (Cristiane)**: o cadastro fica sempre amarrado ao CPF. Registra-se a saída como CLT (27/09) e o novo vínculo freelancer com sua data de início; o portal e os documentos antigos continuam acessíveis e as pendências passam a respeitar cada período de vínculo, sem cobrar CLT depois da saída.

## 7. Rotina do dia no celular

- No celular, aparecem só os cartões com valor diferente de zero. Os zerados ficam recolhidos em um bloco "Sem ocorrências (N)", que o usuário abre pelo ícone de olho. No computador nada muda.

---

## Detalhes técnicos

- Portal: `dp-criar-acesso-colaborador` grava senha provisória em `dp_colaboradores`/estado de segurança; `auth-login` já devolve `password_change_required` — o portal passa a respeitar e a rotear para troca de senha + confirmação de contato. Envio WhatsApp via função existente de mensagens (`zapi`) usando `dp_modelos_mensagem`.
- Falsa falta: `computeCoverage` em `src/lib/dp/bulk-coverage.ts` recebe também os `dp_documentos` já salvos (unidade + competência + tipo); `BulkReviewInline` passa a invalidar `dp_pendencias` e `dp_doc_consistencia_janela` ao concluir.
- Rótulos: `useDpPendencias.tsx` e `DocConsistenciaPanel.tsx` — "lote completo" só quando `faltantes === elegiveis`; senão contagem/nome.
- Adiantamento: nova tabela de períodos de opção (`dp_adiantamento_opcoes`: colaborador, início, fim) com RLS e GRANTs; `elegivelDocumento` em `pendencias-documentos.ts` consulta o período vigente contra o dia de pagamento da unidade.
- Detecção de tipo: reforço de palavras-chave de ponto em `supabase/functions/_shared/doc-tipos.ts`; `exige_aceite` default `true` em `dp-doc-bulk-ingest`; tipos não coletivos excluídos da conferência de faltantes.
- Multiarquivo: input `multiple` em `BulkImportPanel` com um lote por envio agregando os arquivos; grupo lógico "rescisão" reunindo `trct`, `demonstrativo_rescisorio` e anexos.
- Nome social: coluna `nome_social` em `dp_colaboradores` + helper de exibição; caixa alta segue `toUpperCadastro`.
- Vínculos: histórico de vínculo por CPF usando `dp_colaborador_historico_condicoes`; pendências filtradas pelo vínculo vigente na competência.
- Rotina mobile: filtro de cartões em `DpOperacaoPanorama.tsx` apenas sob `sm:` (sem mudança no desktop).
- Testes: elegibilidade de adiantamento por período, intermitente sem dias, cobertura com documentos pré-existentes, rótulo de faltantes.

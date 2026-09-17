# Regras de Admissão: exceções por sexo, grupos e dados bancários

## 1. Exceção por sexo

Cada exceção passa a ter uma quarta seleção, ao lado de Unidades, Vínculos e Cargos: **Sexo** (Masculino, Feminino; nada marcado = todos). Assim o Certificado de Reservista fica "Não pedir" no padrão e "Obrigatório" só para Masculino.

O simulador "Conferir Uma Combinação" ganha o campo Sexo, e a regra mais específica continua vencendo (cargo, depois vínculo, depois unidade, depois sexo).

## 2. Mobile: toque no card abre as exceções

No celular cada item vira um card inteiro tocável: o toque abre direto a lista de exceções com o botão "Adicionar Exceção", e o editor abre como painel deslizante de baixo para cima, com os blocos de seleção empilhados e alvo de toque confortável.

## 3. Documentos equivalentes (CNH no lugar de identidade e CPF)

O sistema passa a trazer grupos de equivalência prontos (não editáveis por empresa):

- **Identidade com foto**: RG, CNH ou carteira de conselho profissional — enviar um satisfaz o item.
- **CPF**: satisfeito pelo próprio CPF, ou por CNH ou RG que já tragam o CPF impresso.

Na ficha, o candidato vê "Identidade com foto — envie RG, CNH ou carteira profissional" e, ao enviar a CNH, os itens equivalentes aparecem como atendidos, sem cobrança duplicada. Na conferência o gestor vê de onde veio o atendimento.

## 4. Separar o que é do empregado e o que é da empresa

Cada documento passa a ter um responsável: **Empregado** ou **Empresa**. Contrato de trabalho, ficha de registro, termo de EPI, termo de jornada e termo de veículo da empresa entram como Empresa.

Na aba Regras aparecem duas seções separadas: "Documentos que o candidato envia" e "Documentos que a empresa emite". Só os do empregado entram na ficha do candidato; os da empresa continuam no acervo e nas pendências internas.

## 5. Dados bancários e Pix no cadastro

Novo bloco **Dados de Pagamento** no cadastro do colaborador e na ficha de admissão: banco, agência, conta, tipo de conta, titular (o próprio ou terceiro, com nome e CPF) e chave Pix (tipo e chave).

Regra: por padrão é obrigatório informar **os dados para depósito ou a chave Pix**. O gestor pode marcar um colaborador como recebimento em espécie, e aí nada disso é exigido.

O documento "Comprovante de dados bancários" sai da lista de documentos (arquivos já enviados permanecem guardados e visíveis).

Para quem já está cadastrado sem essas informações: pendência para o colaborador preencher no portal e lista para o gestor de quem ainda falta, com conferência da empresa antes de valer.

## 6. Agrupamento das fichas

Dados e documentos passam a aparecer sempre nos mesmos grupos, na ficha, nas Regras e na conferência:

```text
Identificação        nome, nome social, CPF, RG, nascimento, sexo, raça/cor...
Endereço             CEP, rua, número, bairro, cidade, estado
Contato              telefone, WhatsApp, e-mail
Registros            PIS, CTPS, título de eleitor, reservista
Dados de Pagamento   banco, agência, conta, titular, Pix
Dependentes          certidão, CPF, vacinação, frequência escolar, guarda, laudo
Motorista e Veículo  CNH, declaração sem suspensão, CRLV, seguro, propriedade
Conforme o vínculo   PJ/MEI: CNPJ e contrato social · Estágio: termo · Menor: autorização
```

Cada grupo mostra um selo quando só vale em certos casos ("Só para PJ e MEI", "Só para quem dirige"), e grupos que não se aplicam à combinação ficam recolhidos.

## 7. Erro ao tornar a CNH obrigatória para o cargo Motoqueiro

Antes de mexer, reproduzo o caminho na tela e capturo a mensagem exata do servidor; corrijo a causa e deixo o aviso em português claro em vez do código técnico. O banco e a rotina de gravação já foram conferidos e estão consistentes, então a suspeita está na tela ou no envio da exceção.

## Detalhes técnicos

- Nova tabela `dp_admissao_regra_sexos` (regra_id, sexo, company_id) no mesmo padrão das filhas atuais: PK composta, FK por empresa, guard `dp_admissao_regra_filha_guard`, RLS por empresa, GRANTs explícitos, DML do cliente apenas via RPC.
- `dp_admissao_regra_salvar` passa a gravar a lista de sexos no mesmo lock (allowlist `masculino`/`feminino`); `dp_admissao_regras_resolver` ganha o parâmetro `p_sexo` com peso 1 na especificidade (cargo 8 · vínculo 4 · unidade 2 · sexo 1) e mantém a assinatura antiga por default para não quebrar chamadas.
- `dp_documento_requisitos` ganha `responsavel text` (`empregado`|`empresa`, default `empregado`) e `grupo text`; seed atualiza os códigos existentes. `dp_doc_equivalencias` (tabela de sistema, sem escrita pelo cliente) define os grupos CNH/RG/CPF; `montarChecklist` e `pendenciasDocumentais` em `_shared/preadmissao-checklist.ts` passam a considerar equivalência ao decidir o que falta.
- `dp_colaboradores` ganha `banco_codigo`, `banco_nome`, `agencia`, `conta`, `conta_digito`, `conta_tipo`, `titular_proprio`, `titular_nome`, `titular_cpf`, `pix_tipo`, `pix_chave` e `recebe_em_especie boolean default false`. Os mesmos campos entram na allowlist de `CAMPOS_CANDIDATO`, na comparação com a ficha oficial e na efetivação.
- Validação de "depósito ou Pix" em trigger no banco e na Edge Function (fail closed), nunca só no formulário; `dp_pendencias_config`/`dp_pendencias_materializadas` recebem o tipo `dados_bancarios` para o portal e para a lista do gestor.
- `AdmissaoRegrasPanel.tsx` reescrito com grupos, seções por responsável, cards tocáveis no mobile e sheet de edição; `PreAdmissao.tsx` e `ColaboradorFormDialog.tsx` recebem o bloco de pagamento; `ColaboradorDocumentosPanel.tsx` e `PreadmissaoRevisaoDialog.tsx` seguem o novo agrupamento.
- Migrations aditivas com rollback documentado e não destrutivo; nenhum arquivo ou registro apagado.
- Verificação enxuta: typecheck, lint dos arquivos alterados, os testes já existentes da fase e uma passagem pontual no navegador por bloco. Nada publicado.

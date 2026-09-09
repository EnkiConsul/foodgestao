# Cadastrar pessoa direto da importação de documentos

Na conferência da folha do Garavelo 07/2026, duas páginas ficaram sem colaborador (são sócios). O atalho "+" para cadastrar ali falhou ao salvar e, além disso, pede tudo do zero mesmo já tendo lido nome e CPF na página.

## 1. Descobrir e corrigir o erro ao salvar

O motivo exato do erro ainda não está confirmado — o cadastro rápido hoje mostra apenas uma mensagem genérica. Primeiro passo: reproduzir o cadastro pela conferência e capturar a mensagem real do banco, e passar a exibi-la ao usuário em vez de um texto genérico.

Já foram identificados dois problemas certos no mesmo formulário, que serão corrigidos junto:

- O CPF é gravado exatamente como digitado (com pontos e traço), mas no sistema o CPF é guardado só com números. Isso cria cadastro duplicado invisível e impede o reconhecimento automático da pessoa nas próximas importações. Passa a gravar apenas números.
- Se a empresa não estiver definida no momento, o salvamento vai ao banco sem empresa e falha. Passa a bloquear com aviso claro.

Também: se já existir alguém com aquele CPF na empresa (inclusive inativo), em vez de erro aparece "Já existe cadastro com este CPF" e a opção de vincular a página a essa pessoa.

## 2. Aproveitar o que foi lido da página

O cadastro rápido abre já preenchido com o que a página do PDF trouxe: nome e CPF. A unidade vem da unidade detectada no documento quando houver, e o nome é gravado no padrão "Primeira Letra Maiúscula".

Ganha também o campo de vínculo (CLT, Intermitente, Sócio, PJ...) e, quando for Sócio, a forma de remuneração (pró-labore ou somente lucros). Isso resolve o caso do Garavelo: cadastrando os dois como sócios com pró-labore, o recibo passa a ser classificado como pró-labore automaticamente, como já acontece com a Tamires.

## 3. Escolher entre cadastro manual e importar ficha

Antes de abrir o formulário, o atalho passa a perguntar o que fazer, no mesmo estilo da tela de Colaboradores:

- **Cadastro rápido** — o formulário curto, já preenchido com o que foi lido da página (recomendado para não perder a conferência em andamento).
- **Importar ficha de registro** — leva à leitura do PDF da ficha, avisando antes que a conferência atual continua salva e pode ser retomada pelo histórico de importações.

A opção de folguista / em teste não aparece aqui: quem tem contracheque ou pró-labore é colaborador.

## Detalhes técnicos

- `src/components/dp/documentos/NovoColaboradorInlineDialog.tsx`: normalizar CPF (só dígitos) antes do insert, guard de `selectedCompanyId`, checagem prévia em `dp_colaboradores` por `(company_id, cpf)` com opção de vincular, superfície do `error.message`/`code` real (tratando `23505` do índice `dp_colaboradores_company_id_cpf_key`), campos `vinculo_label` e `socio_remuneracao` (constraint aceita `pro_labore` | `somente_lucros`; a trigger `dp_socio_remuneracao_guard` já normaliza), `properName` no nome.
- `src/components/dp/documentos/BulkReviewInline.tsx` e `BulkReviewDialog.tsx`: passar `defaultNome={current.matched_nome ?? extraído do OCR}` e `defaultUnidadeId={current.detected_unidade_id}`; trocar o botão "+" por um seletor de método (componente novo `NovoPessoaDocMetodoDialog.tsx`, espelhando `NovoCadastroMetodoDialog.tsx`, com apenas duas opções); rota de importar ficha continua `/dp/colaboradores/importar-ficha`.
- Sem migração de banco, sem mudança de RLS, permissões, isolamento por empresa ou regras de classificação de documento.
- Validar com typecheck, testes de `src/lib/dp` e reprodução autenticada da conferência (Playwright) para confirmar o salvamento.

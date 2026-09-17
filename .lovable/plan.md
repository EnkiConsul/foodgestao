# Faltou sim — quatro pontos em aberto

O que já está pronto: ficha do candidato com nome/CPF travados, CPF e data formatados, nome social, naturalidade e raça/cor, bloco de endereço novo (ficha do candidato e perfil do colaborador), aba Regras (dados, documentos e familiares por empresa/unidade/vínculo/cargo), frente e verso na ficha de pré-admissão e link sempre no domínio publicado.

Falta terminar:

## 1. Endereço padronizado nas telas restantes
O bloco novo (CEP primeiro, busca automática, estado em lista, "Sem número") ainda não entrou em:
- Cadastro do colaborador (hoje o endereço está vazio, só com um "-")
- Cadastro de unidades (CEP e estado soltos, estado digitado à mão)
- Cadastro de empresas e onboarding da empresa (mantendo a busca por CNPJ que já existe)

## 2. Frente e verso nos documentos do colaborador já cadastrado
Hoje só a ficha de pré-admissão aceita várias fotos por documento. Falta o mesmo nos documentos pendentes do colaborador (portal do colaborador e tela do DP): adicionar frente, verso e fotos extras, ver e substituir cada foto.

## 3. Revisão do gestor mostrando todas as fotos
Na revisão da ficha, cada documento deve listar frente, verso e extras (hoje mostra uma por documento), com aprovação/recusa por documento como já é hoje.

## 4. Obrigatoriedade das Regras dentro da ficha do candidato
O servidor já cobra o que a empresa marcou como obrigatório e já recusa parentesco não permitido. Falta a ficha refletir isso na tela: marcar os campos obrigatórios conforme as Regras, esconder os marcados como "não pedir", avisar antes de enviar em vez de só receber o erro, e listar apenas os graus de parentesco liberados.

## Detalhes técnicos
- Reutilizar `src/components/shared/EnderecoFields.tsx` + `src/lib/endereco.ts` em `ColaboradorFormDialog.tsx`, `UnidadeFormDialog.tsx`, `CompanyFormDialog.tsx` e `onboarding/food/StepEmpresa.tsx`, mapeando os nomes de coluna existentes (`cep`, `logradouro`/`endereco`, `numero`, `complemento`, `bairro`, `cidade`, `uf`) sem migration.
- Documentos do colaborador: `dp_colaborador_documentos` recebe `parte` (1–10) e `parte_rotulo` como já feito em `dp_preadmissao_documentos`, com índice de vigente por parte e a RPC de registro substituindo só a mesma parte; registros atuais assumem parte 1, nada é apagado. Rollback documentado e não destrutivo.
- `PreadmissaoRevisaoDialog.tsx` passa a agrupar documentos por `codigo:pessoa_id` e renderizar todas as partes.
- `PreAdmissao.tsx` consome `regras_campos` e `parentescos_permitidos` (já retornados pelo endpoint público) para exigência, exibição e lista de parentescos; a validação de servidor permanece a fonte final (fail closed).
- Verificação mínima: typecheck, lint dos arquivos alterados, testes existentes e uma passagem pontual no navegador por bloco. Nada publicado.

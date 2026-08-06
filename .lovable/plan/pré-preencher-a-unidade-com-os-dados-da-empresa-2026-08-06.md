# Pré-preencher a unidade com os dados da empresa

## Por que não veio automático hoje

Verifiquei o fluxo atual:

- Na etapa 1 do onboarding (`StepOperacao`), o único campo pré-preenchido é **Nome da unidade**, usando o nome da empresa. Telefone, endereço, cidade, UF e fuso ficam vazios de propósito no código atual.
- O seletor global de empresa carrega apenas `id`, `name` e `trade_name`. Ou seja, mesmo que a empresa tenha telefone, CEP, logradouro, cidade e UF cadastrados, esses dados **nunca chegam** à tela de ativar unidade.
- A unidade também não é criada sozinha: ela só nasce quando você clica em "Salvar e continuar". Por isso a tela abre "vazia" na etapa 1.

## O que vou fazer

1. **Buscar os dados completos da empresa selecionada** na etapa 1 (telefone/WhatsApp, CEP, logradouro, número, complemento, bairro, cidade, UF).
2. **Pré-preencher os campos da unidade** com esses dados:
   - Nome: nome fantasia (ou razão social) da empresa
   - Telefone: telefone da empresa, com WhatsApp como alternativa
   - Endereço: logradouro + número + complemento + bairro (ou o campo de endereço livre, quando for o único preenchido)
   - Cidade e UF: os da empresa
   - Fuso horário: sugerido pela UF da empresa (padrão São Paulo quando não houver correspondência)
3. **Mostrar de onde vieram os dados**: um aviso curto ("preenchemos com os dados da sua empresa — confira e ajuste") e um botão "Usar dados da empresa" para repreencher depois de editar.
4. **Não sobrescrever nada já salvo**: se a unidade já existe, os dados dela continuam prevalecendo.
5. **Reduzir cliques na abertura**: quando todos os campos obrigatórios já vierem prontos da empresa, o botão da etapa 1 passa a "Salvar e ir para configuração", mantendo o salvamento explícito (para você conferir antes) e avançando direto para a etapa 2.

## Observação

Continua sendo necessário definir na etapa 2 as informações que a empresa não possui: formas de atendimento, canais, tempo de preparo e horários de funcionamento. Esses dados não existem no cadastro da empresa, então não há como pré-preenchê-los.

## Detalhes técnicos

- Nova consulta pontual em `companies` (colunas de contato e endereço) dentro de `src/components/orders/onboarding/StepOperacao.tsx`, via React Query com chave por `selectedCompanyId`.
- Helper novo em `src/lib/orders/units.ts`: montagem do endereço a partir das partes e mapa UF → fuso horário.
- Sem mudanças de banco, RLS ou RPC: `ped_upsert_unit` continua recebendo os mesmos parâmetros.

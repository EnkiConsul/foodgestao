## Ocultar dados pessoais no onboarding para perfis empresariais

### Problema
Na etapa 2 (Seus dados), os campos **Nome completo**, **CPF** e **Telefone** aparecem mesmo quando o usuário selecionou **MEI** ou **Microempresa**, que são perfis exclusivamente empresariais.

### Comportamento esperado
- **Pessoa Física** → mostra apenas dados pessoais (nome, CPF opcional, telefone).
- **MEI / Microempresa** → mostra **apenas** dados da empresa (Nome da Empresa, CNPJ). O nome completo do responsável continua sendo capturado, mas reaproveitado do cadastro inicial — não aparece nesta etapa.
- **Híbrido** → mostra **ambos** (pessoais + empresariais), como hoje.

### Alterações

**1. `src/components/onboarding/StepProfileData.tsx`**
- Adicionar flag `isPureCompany = ["mei", "microempresa"].includes(profileType)`.
- Quando `isPureCompany`: ocultar bloco de Nome completo, CPF e Telefone; renderizar apenas os campos da empresa.
- Quando `hibrido`: manter layout atual (pessoais + empresa).
- Quando `pf`: manter layout atual (somente pessoais).
- Ajustar texto introdutório conforme o caso ("Preencha os dados da sua empresa:" para empresarial puro).

**2. `src/pages/Onboarding.tsx` — `validateStep("data")`**
- Para `mei`/`microempresa`: exigir apenas `companyName`. Não exigir `fullName` (será preenchido automaticamente com o valor já vindo do cadastro/profile).
- Para `hibrido`: exigir `fullName` **e** `companyName`.
- Para `pf`: exigir `fullName`.

Nenhuma mudança no schema do banco — apenas UI/validação.
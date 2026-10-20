# Arquitetura e dependências com o AVETO 360

- Autenticação compartilhada (mesmo serviço de login); candidatos usam e-mail técnico interno (domínio legado `portal.360food.local`, a renomear no novo projeto).
- `companies` e `company_members`: empresa e papel do gestor.
- `dp_unidades`: unidade associada à vaga.
- `dp_colaboradores`: usado para identificar colaborador que também é candidato (sem expor candidaturas ao empregador).
- Infra de WhatsApp (envio de OTP) e antiabuso (Turnstile) compartilhadas.
- Layouts, Hub e menu do AVETO (card do Recrutamento, `PortalCarreirasCard`).
- Nenhuma coluna de recrutamento foi adicionada às tabelas compartilhadas.
- Financeiro 360 e Pessoas 360 não chamam nenhuma rotina do recrutamento.

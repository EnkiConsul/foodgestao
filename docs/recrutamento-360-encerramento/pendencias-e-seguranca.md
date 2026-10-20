# Pendências, riscos e problemas conhecidos

## P1
- **OTP: consumo concorrente não atômico.** Dois pedidos simultâneos podem usar o mesmo desafio. Corrigir (UPDATE ... WHERE usado_em IS NULL RETURNING, ou lock) **antes de reutilizar a autenticação** no novo projeto.
- Dependência da autenticação compartilhada: contas de candidato vivem no mesmo serviço de login do AVETO.
- Vínculo com `dp_colaboradores` cruza domínio do Pessoas.
- Retenção de dados pessoais e consentimentos (LGPD) precisa de decisão antes de qualquer exclusão.

## P2
- Nomenclatura técnica antiga ("360food").
- C1.2 (gestor vê talentos), candidatura efetiva e inscritos não implementados.
- Isolamento com segunda conta real de candidato não testado em navegador.
- Upload de logo do portal pendente.

## Fora do repositório
Dados do banco não estão versionados. Backup do banco é responsabilidade separada.

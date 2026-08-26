# Corrigir erro ao concluir o onboarding

## O que está acontecendo

Ao finalizar o onboarding, a chamada de cadastro da empresa retorna o erro `sem permissão` (verificado nas requisições e no banco).

Causa confirmada: ao criar a empresa, vários gatilhos automáticos são executados. O gatilho que cria os documentos padrão de Pessoas 360° exige que o usuário já seja administrador/proprietário da empresa, mas o vínculo de proprietário é criado por outro gatilho que roda **depois** dele (a ordem é alfabética pelo nome do gatilho). Resultado: no momento da checagem o usuário ainda não é membro da empresa e o cadastro é abortado inteiro.

## Correção

1. Criar o vínculo de proprietário antes dos gatilhos de seed, renomeando o gatilho de vínculo para que rode primeiro (nome com prefixo `a_`), mantendo a mesma função.
2. Tornar o seed de documentos tolerante quando chamado por gatilho: aceitar também o caso em que o usuário é o dono do registro da empresa (`companies.user_id`), além de administrador/membro — sem afrouxar o uso manual da função pela aplicação.
3. Revisar os demais gatilhos de criação de empresa (configuração de DP, categorias, plano de contas, contatos, formas de pagamento, módulos) para confirmar que nenhum outro faz a mesma checagem de permissão prematura; ajustar da mesma forma se houver.
4. Melhorar a mensagem no onboarding: em vez de "Tente novamente em instantes", exibir o motivo real quando o backend retornar um código conhecido, e manter o texto genérico apenas para falhas inesperadas.

## Validação

- Criar uma empresa de teste pelo fluxo do onboarding com um usuário novo e confirmar: empresa criada, usuário como proprietário, módulos em teste, categorias/plano de contas/documentos padrão gerados.
- Confirmar que o usuário atual (`clicsorte777@gmail.com`) consegue concluir o cadastro do CNPJ 27.120.847/0001-66.

## Detalhes técnicos

- Migração: `DROP TRIGGER trigger_auto_add_company_owner` e recriar como `a_auto_add_company_owner` (AFTER INSERT em `public.companies`) para garantir precedência sobre `dp_documento_requisitos_seed_trg`.
- Atualizar `public.dp_documento_requisitos_seed(_company_id)` para permitir a execução quando `EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = auth.uid())`.
- Frontend: tratamento de erro no passo final do onboarding (`src/pages/Onboarding.tsx` / step de conclusão), mapeando `empresa_ja_cadastrada`, `cnpj_invalido`, `nenhum_modulo_selecionado` e `usuario_nao_autenticado` para mensagens específicas.

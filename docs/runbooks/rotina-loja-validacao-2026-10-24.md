# Rotina da Loja — validação em 24/10/2026

- Migração 0136 aplicada e definição das funções conferida no banco: folga aprovada não removida exclui trabalho, ausência operacional confirmada exclui trabalho, troca permite trabalhar no dia de folga habitual, freelancer mensalista participa da rotina habitual.
- Funções auxiliares: execução negada a anon e authenticated; funções do portal permitidas a authenticated, negadas a anon. Empresa/unidade seguem derivadas do vínculo da sessão.
- 69 testes focados passaram, incluindo 7 regressões de presença/cache. Lint dos arquivos novos passou; compilação automática OK.
- 933 testes da rodada ampla passaram; falharam authEmailConfirmation.test.tsx (envio de cadastro não chamou signUp) e calendario-rotina-p1.test.ts (expectativa de limite 3 vs retorno 1). Nenhum arquivo destes fluxos foi alterado nesta correção. Publicação retida conforme checklist obrigatório.
- Conferência visual autenticada na conta solicitante: solicitação de compensação da Karen permanece pendente; rotina de 23/10 mantém trabalho habitual, coerente com esse estado. Sem erros de execução. Nenhum pedido real foi aprovado, alterado ou cancelado para teste.
- Fluxo real de aprovação e sessão de colaborador não exercitados: não realizar alterações em dados reais para testar.
- Versão publicada anterior: build_id 5a28c26c-8e21-4f28-bbcb-84d3c98df983; built_at 2026-10-24T00:11:40.066Z. SHA servido não disponível no arquivo público; HEAD local observado ba9a6b8b15123629995b628e4821cc3dd3473412, sem alegar equivalência.
- Sem alteração de arquivos, assinatura ou anexos no armazenamento; rollback de frontend não reverte a migração.
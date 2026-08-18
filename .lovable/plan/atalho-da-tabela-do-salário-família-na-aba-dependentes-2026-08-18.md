# Atalho da tabela do salário-família na aba Dependentes

Hoje o resumo do salário-família na ficha do colaborador só informa a situação da tabela (cota, teto, vigência) e, quando ela está vencida ou nunca foi preenchida, o usuário precisa sair do cadastro e ir até Cadastros > Adicionais e salário-família. A proposta é resolver isso ali mesmo.

## O que muda

No cartão "Salário-família", dentro da aba Dependentes:

- Um botão **Atualizar tabela** ao lado do resumo, sempre disponível.
- Quando a tabela está vencida ou não configurada, o aviso âmbar ganha o mesmo botão em destaque (ex.: "Configurar agora"), porque nesse estado o cálculo não roda.
- O botão abre um diálogo compacto com três campos — ano de vigência, cota por dependente e teto de baixa renda — os mesmos da tela de cadastros, já pré-preenchidos com os valores atuais.
- Ao salvar, os valores são confirmados para o ano informado, o resumo e a cota do colaborador recalculam na hora e a pendência anual do quadro de pendências é baixada.
- Rodapé do diálogo com um link discreto para a tela completa (Adicionais e salário-família), para quem também precisa mexer nas regras de tempo de serviço.

Permissão: o atalho aparece apenas para quem já pode alterar configurações da empresa (admin/owner). Para os demais, o resumo continua só informativo, com a orientação de procurar o gestor.

## Detalhes técnicos

- `src/components/dp/DependentesPanel.tsx`: adiciona estado do diálogo e os botões no cartão de resumo e no aviso de tabela vencida.
- Novo `src/components/dp/SalarioFamiliaTabelaDialog.tsx`: formulário reutilizável (ano, cota, teto) que consome `useDpSalarioFamiliaConfig` (`config` + `salvar({ cota, teto, vigencia, confirmar: true })`). A tela `DpAdicionaisTempoServico.tsx` passa a reutilizar esse mesmo componente para não duplicar validação.
- Validação: cota e teto maiores que zero e ano com 4 dígitos, com `toast.error` nas mesmas mensagens já usadas hoje.
- Sem mudanças de banco de dados: os campos `salario_familia_cota`, `_teto`, `_vigencia` e `_confirmado_em` em `dp_config_dp` já existem, e o hook já invalida as queries de configuração e pendências.

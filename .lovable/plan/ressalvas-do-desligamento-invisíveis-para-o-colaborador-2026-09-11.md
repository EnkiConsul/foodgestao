# Ressalvas do desligamento invisíveis para o colaborador

## O que encontrei

As ressalvas do desligamento hoje ficam guardadas na própria ficha do colaborador, em dois campos: a observação escrita no desligamento e a marcação de "pode ser recontratado / não / com ressalvas".

A tela do colaborador ("Meu Cadastro", no portal) busca a ficha dele inteira, com todos os campos. As regras de acesso do banco também permitem que ele leia a sua própria ficha completa. Ou seja: hoje a tela não mostra as ressalvas, mas o dado chega ao aparelho dele e alguém com conhecimento técnico conseguiria ver. É isso que precisa mudar para haver garantia real.

## Como resolver

1. Guardar as ressalvas em um local separado, acessível apenas para donos, administradores e RH da empresa — o colaborador não tem permissão nenhuma ali, nem de leitura.
2. Transferir as ressalvas já cadastradas para esse novo local e remover os campos da ficha do colaborador.
3. Ajustar as telas do RH (desligamento, cadastro e ficha completa) para gravar e mostrar as ressalvas do novo local, sem mudança visual para quem usa.
4. Fazer a tela "Meu Cadastro" do portal buscar apenas os campos que o colaborador realmente precisa ver, em vez de a ficha inteira.
5. Testar entrando como colaborador para confirmar que as ressalvas não voltam em nenhuma resposta do sistema.

Observação: motivo e data do desligamento continuam como estão hoje. Se você também quiser esconder o motivo do colaborador, me diga e eu incluo no mesmo pacote.

## Detalhes técnicos

- Nova tabela `dp_colaborador_desligamento_restrito` (`colaborador_id`, `company_id`, `observacao`, `elegibilidade_recontratacao`, timestamps), com GRANT apenas para `authenticated`/`service_role` e políticas restritas a `private.is_company_admin_or_owner` / dono da empresa / super admin. Sem política de self read.
- Migração copia `observacao_desligamento` e `elegibilidade_recontratacao` de `dp_colaboradores` e depois remove essas colunas (etapa destrutiva, com aprovação).
- Atualizar `ColaboradorDesligamentoPanel.tsx`, `ColaboradorFormDialog.tsx` e `ColaboradorFichaDialog.tsx` para ler/gravar via a nova tabela (novo hook dedicado).
- `DpMeuPerfil.tsx`: trocar `select("*")` por lista explícita de colunas.
- Verificação: Playwright autenticado como colaborador em `/dp/ln/perfil`, inspecionando a resposta de rede da consulta da ficha.

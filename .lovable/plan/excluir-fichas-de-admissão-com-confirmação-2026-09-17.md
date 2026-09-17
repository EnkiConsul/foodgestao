# Excluir Fichas De Admissão (Com Confirmação)

O gestor passa a poder excluir uma ficha de pré-admissão direto da lista. A ficha sai da tela, mas nada é apagado: fica guardado quem excluiu, quando e o motivo, junto com os arquivos enviados pelo candidato.

## O que o gestor vê

- Novo botão de excluir (lixeira) em cada linha da lista de fichas, ao lado de "Gerar novo link", "Revisar" e "Cancelar link" — e também dentro da tela de revisão da ficha.
- Ao clicar, abre uma confirmação em janela própria (não o aviso do navegador) com:
  - o nome do candidato em destaque e o texto "Excluir a ficha de FULANO? Ela sai da lista e o link deixa de valer.";
  - campo opcional "Por que está excluindo?";
  - botões "Cancelar" e "Excluir Ficha" (em vermelho).
- Depois de excluir: aviso "Ficha excluída" e a lista já atualizada sem ela.
- Regras: fichas com a admissão concluída (que já geraram o cadastro do colaborador) não podem ser excluídas — o botão fica desabilitado com a explicação "Esta admissão já virou cadastro de colaborador". Qualquer outra situação pode ser excluída, inclusive canceladas e expiradas.
- Quem pode: dono e administradores da empresa (mesma permissão que hoje revisa e cancela).

## Efeitos colaterais desejados

- O link do candidato é revogado no mesmo passo: quem tiver o endereço aberto perde o acesso na hora.
- A pendência do DP referente àquela ficha deixa de aparecer.
- A ficha excluída não conta em nenhuma lista, contagem ou busca.

## Detalhes técnicos

Banco (migration aditiva, com rollback documentado e não destrutivo):

- `dp_preadmissoes` ganha `removido_em timestamptz`, `removido_por uuid`, `removido_motivo text`.
- Índice parcial em `(company_id)` `WHERE removido_em IS NULL` para as listagens.
- Sem `DELETE`: nenhuma linha, arquivo de Storage, familiar, documento ou evento é apagado.

Servidor (`supabase/functions/dp-preadmissao-gestor/index.ts`):

- Nova ação `excluir`, com `preadmissao_id`, `versao` esperada e `motivo` opcional:
  1. relê a ficha sob `FOR UPDATE` (RPC transacional, mesmo padrão de `transicionarComVersao`);
  2. recusa quando `status = 'concluido'` ou `colaborador_id IS NOT NULL` (mensagem PT-BR);
  3. recusa quando já está removida (idempotente: responde ok sem duplicar evento);
  4. grava `removido_em/por/motivo`, revoga os convites ativos (`dp_preadmissao_convites.revoked_at`) e registra o evento `ficha_excluida` em `dp_preadmissao_eventos` com o motivo sanitizado;
  5. tudo na mesma transação — falha em qualquer passo não deixa estado parcial.
- Autorização: `requireCompanyAccess` + `canAdminister`, como nas demais ações; empresa lida no banco, nunca do corpo do pedido.
- As ações `listar`, `ler` e as demais passam a filtrar `removido_em IS NULL` (uma ficha removida responde `not_found`).
- A rotina pública do candidato (`dp-preadmissao-publica`) também recusa fichas removidas, além do convite revogado — fail closed nos dois pontos.

Frontend:

- `useDpPreadmissoes.ts`: mutation `excluir` (chama a ação nova, envia `versao`, invalida `dp_preadmissoes`, `dp_preadmissao` e `dp_pendencias`).
- `PreadmissoesPanel.tsx`: botão de lixeira na tabela, item de exclusão no card do celular (toque longo não; um botão visível dentro da ficha aberta), diálogo de confirmação com o campo de motivo, estado desabilitado para fichas concluídas.
- `PreadmissaoRevisaoDialog.tsx`: mesma ação disponível no rodapé da revisão.
- Pendências: `useDpPendencias.tsx` filtra as fichas removidas na consulta de pré-admissões.

Verificação enxuta (sem bateria completa): typecheck, lint dos arquivos alterados, testes já existentes da fase e uma passagem no navegador excluindo uma ficha sintética e conferindo que ela sai da lista, o link deixa de funcionar e a ficha concluída continua protegida. Nada publicado.

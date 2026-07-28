## Objetivo

Impedir que o widget da Pluggy Connect seja fechado ao clicar em "Continuar" — o Radix `Dialog` que envolve o widget captura cliques como "outside" e destrói a instância.

## Causa

`PluggyConnectDialog.tsx` renderiza o widget dentro de um `<Dialog>` do Radix. O widget da Pluggy é injetado no `document.body` (fora do portal do Radix), então cliques dentro dele são interpretados como "interact outside" → o Radix dispara `onOpenChange(false)` → `useEffect` de cleanup chama `instance.destroy()` e o modal da Pluggy some.

## Solução (apenas frontend, arquivo único)

Refatorar `src/components/accounts/PluggyConnectDialog.tsx`:

1. **Remover o wrapper `<Dialog>` do Radix.** O widget da Pluggy já é fullscreen e gerencia o próprio modal/foco.
2. **Substituir por um overlay leve próprio** (`fixed inset-0 z-50` com backdrop) exibido apenas enquanto `loading` ou `error` — nunca sobreposto ao widget da Pluggy. Assim que `pc.init()` resolve e o widget aparece, o overlay some (basta condicionar a `loading && !instanceRef.current`).
3. **Fechamento controlado só pelos callbacks do SDK**:
   - `onSuccess` → chama sync, notifica e `onOpenChange(false)`.
   - `onClose` → `onOpenChange(false)` (usuário fechou o widget).
   - `onError` → mantém overlay com mensagem; usuário pode fechar via botão "Fechar" do overlay.
4. **Sem `onInteractOutside`, sem `DialogContent`, sem trap de foco competindo** com o widget.
5. **Cleanup**: manter `instanceRef.current?.destroy?.()` no unmount / quando `open` vira `false`, exatamente como hoje.
6. **Estados visuais**: caixa central com spinner "Preparando conexão segura…" (loading) ou mensagem de erro + botão "Fechar" (error). Nenhum título/descrição obstruindo o widget.

## Detalhes técnicos

- Arquivo alterado: `src/components/accounts/PluggyConnectDialog.tsx`.
- Nenhuma mudança de API do componente — assinatura de `Props` preservada; todos os consumidores continuam funcionando.
- Nenhuma alteração de backend, Edge Functions, RLS, secrets ou rotas.
- Sem impacto em `/admin/pluggy-status`, `/admin/pluggy-webhook`, `/contas-bancarias/conexoes` ou `/contas-bancarias/conciliacao`.

## Validação

1. Abrir "Conectar via Open Finance" em `/contas-bancarias`.
2. Clicar em "Continuar" no modal da Pluggy → deve avançar para a seleção do banco, sem fechar.
3. Concluir o consent com uma instituição sandbox/produção → callback `onSuccess` dispara, sync roda, toast de sucesso.
4. Cancelar no widget → `onClose` fecha limpo, sem estados órfãos.
5. Forçar erro (token inválido) → overlay mostra mensagem e botão "Fechar".

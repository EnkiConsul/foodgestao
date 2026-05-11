## Exibir QR Code do Pix na tela de pagamento

### Causa
A edge function `asaas-create-checkout` busca o QR Code (`encodedImage` em base64) do Asaas, mas o valor é descartado — não há coluna para guardá-lo. A tela `/checkout/pagamento/:invoiceId` só renderiza o copia-e-cola e um botão externo, sem `<img>` do QR.

### Mudanças

1. **Migração SQL** — adicionar coluna `pix_qrcode_image text` em `public.invoices` para armazenar o base64 da imagem PNG.

2. **`supabase/functions/asaas-create-checkout/index.ts`** — no `insert` da invoice, gravar também `pix_qrcode_image: pixQrCode` (já temos a variável `pixQrCode` com `qr.encodedImage`).

3. **Nova edge function `asaas-refresh-pix`** (fallback) — recebe `invoiceId`, valida JWT do usuário dono, busca `external_invoice_id`, chama `/payments/{id}/pixQrCode` no Asaas e atualiza `pix_qrcode` e `pix_qrcode_image` na invoice. Necessária para invoices já criadas antes da correção (como a atual `0782e249…`) e para regenerar QR expirado.

4. **`src/pages/CheckoutPagamento.tsx`**:
   - Renderizar `<img src={`data:image/png;base64,${invoice.pix_qrcode_image}`} />` quando disponível.
   - Se método for `pix` e `pix_qrcode_image` estiver vazio, chamar `asaas-refresh-pix` automaticamente no mount e re-fetch da invoice.
   - Manter o "copia e cola" e o botão "Abrir no Asaas" como fallback.

### Observações
- Não altera o fluxo de webhook nem confirmação de pagamento.
- A invoice atual em aberto recebe o QR via `asaas-refresh-pix` na primeira abertura da página.
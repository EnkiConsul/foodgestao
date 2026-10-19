# Pré-Admissões
- Keep the list mobile-first with non-scrolling stage filters; reuse existing server mutations and the official review form to preserve admission validation.
- Invite tokens are shown only on creation; never infer an existing invite URL. Regenerating a link requires explicit confirmation because it invalidates the previous link.
- WhatsApp dispatch uses explicit Android package intents with HTTPS fallback; elsewhere offer system sharing without claiming app selection is guaranteed.- Pre-admission OCR (`ler_documento` in `dp-preadmissao-arquivo`, fields in `_shared/preadmissao-ocr.ts`) only suggests values for empty fields; never writes, never overrides name/CPF — server validation on save stays the source of truth.

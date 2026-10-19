# Pré-Admissões
- Keep the list mobile-first with non-scrolling stage filters; reuse existing server mutations and the official review form to preserve admission validation.
- Invite tokens are shown only on creation; never infer an existing invite URL. Regenerating a link requires explicit confirmation because it invalidates the previous link.
- WhatsApp dispatch uses explicit Android package intents with HTTPS fallback; elsewhere offer system sharing without claiming app selection is guaranteed.- Pre-admission OCR (`ler_documento` in `dp-preadmissao-arquivo`, fields in `_shared/preadmissao-ocr.ts`) only suggests values for empty fields; never writes, never overrides name/CPF — server validation on save stays the source of truth.
- The candidate's 3x4 photo/selfie is always mandatory (checklist ignores company rules for it) and, on completion, is linked to the company's `foto_cadastro` requirement so it becomes the employee profile photo.
- OCR divergences (name/CPF/birth date) are logged as `ocr_divergencia` events and only warn; they never block the candidate.

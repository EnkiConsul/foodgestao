/** Upload/OCR is not completion; every PDF in this session must be saved. */
export function importSessionComplete(
  ids: readonly string[],
  batches: readonly { id: string; status: string }[],
) {
  return ids.length > 0 && ids.every((id) =>
    batches.some((batch) => batch.id === id && batch.status === "imported"),
  );
}

/** A partial or missing approval result must not dismiss the review. */
export function approvalFullySaved(expectedCount: number, results: readonly { ok: boolean }[]) {
  return expectedCount > 0 && results.length === expectedCount && results.every((result) => result.ok);
}
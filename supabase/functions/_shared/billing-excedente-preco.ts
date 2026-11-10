// Preço unitário do colaborador excedente na apuração mensal (Pessoas).
// Plano cobrado por colaborador ativo (Enterprise) usa o próprio valor por colaborador
// (features.price_per_collaborator_cents); os demais usam o adicional "Colaborador extra".
export function precoExcedenteColaborador(planFeatures: unknown, adicionalCents: number | null | undefined): number {
  const f = (planFeatures && typeof planFeatures === "object") ? planFeatures as Record<string, unknown> : {};
  const porColab = Number(f.price_per_collaborator_cents);
  if (Number.isFinite(porColab) && porColab > 0) return Math.round(porColab);
  const ad = Number(adicionalCents ?? 0);
  return Number.isFinite(ad) && ad > 0 ? Math.round(ad) : 0;
}

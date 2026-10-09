import { lazy, Suspense } from "react";
import { useCheckoutV2Mode } from "@/hooks/useCheckoutV2Mode";
import { PageSpinner } from "@/components/PageSpinner";

const Legado = lazy(() => import("./Planos"));
const V2 = lazy(() => import("./CheckoutV2"));

/** /planos: com checkout_v2 em 'v2' abre o checkout novo; senão, a tela atual sem mudança. */
export default function PlanosGate() {
  const { data: modo, isLoading } = useCheckoutV2Mode();
  if (isLoading) return <PageSpinner />;
  return <Suspense fallback={<PageSpinner />}>{modo === "v2" ? <V2 /> : <Legado />}</Suspense>;
}

import { lazy, Suspense } from "react";
import { useCheckoutV2Mode } from "@/hooks/useCheckoutV2Mode";
import { PageSpinner } from "@/components/PageSpinner";

const Legado = lazy(() => import("./Assinatura"));
const V2 = lazy(() => import("./MinhaAssinaturaV2"));

/** /assinatura: com checkout_v2 em 'v2' abre "Minha Assinatura" nova; senão, a tela atual sem mudança. */
export default function AssinaturaGate() {
  const { data: modo, isLoading } = useCheckoutV2Mode();
  if (isLoading) return <PageSpinner />;
  return <Suspense fallback={<PageSpinner />}>{modo === "v2" ? <V2 /> : <Legado />}</Suspense>;
}

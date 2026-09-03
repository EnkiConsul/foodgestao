import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLegalSection } from "@/hooks/useLegalContent";
import { Button } from "@/components/ui/button";

function openCookieSettings() {
  window.dispatchEvent(new CustomEvent("plin:cookie-settings-open"));
}

export default function Cookies() {
  const c = useLegalSection("legal_cookies");
  return (
    <>
      <LegalDocumentView
        title={c.title}
        lastUpdated={c.last_updated}
        body={c.body}
        canonicalPath="/cookies"
        metaDescription="Como o Aveto 360 usa cookies e como você pode gerenciar suas preferências."
      />
      <div className="fixed bottom-4 right-4 z-50">
        <Button size="sm" onClick={openCookieSettings}>Gerenciar cookies</Button>
      </div>
    </>
  );
}

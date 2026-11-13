import { describe, expect, it } from "vitest";
import {
  appMarcadoComoInstalado,
  comMarcaInstalar,
  detectarAparelho,
  deveOferecerInstalacao,
  escolherEstrategia,
  marcarAppInstalado,
  urlAbrirNoChromeAndroid,
  urlAbrirNoChromeIos,
} from "@/lib/pwa/instalacao";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneWhatsapp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/25.10.72",
  iphoneWebviewSemMarca:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  androidWhatsapp:
    "Mozilla/5.0 (Linux; Android 14; SM-A145M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 WhatsApp/2.24",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 13; moto g54; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
};

const fora = { standalone: false, temPromptNativo: false };

describe("estratégia de instalação por aparelho", () => {
  it("iPhone dentro do WhatsApp orienta sair para o Safari", () => {
    const ap = detectarAparelho(UA.iphoneWhatsapp);
    expect(ap.dentroDeApp).toBe(true);
    expect(ap.appHospedeiro).toBe("WhatsApp");
    expect(escolherEstrategia(ap, fora)).toBe("ios_sair_app");
  });

  it("janela interna do iPhone sem marca também conta como dentro de app", () => {
    expect(escolherEstrategia(detectarAparelho(UA.iphoneWebviewSemMarca), fora)).toBe("ios_sair_app");
  });

  it("iPhone no Instagram orienta sair para o Safari", () => {
    expect(escolherEstrategia(detectarAparelho(UA.iphoneInstagram), fora)).toBe("ios_sair_app");
  });

  it("iPhone no Safari mostra o passo a passo do Safari", () => {
    expect(escolherEstrategia(detectarAparelho(UA.iphoneSafari), fora)).toBe("ios_safari");
  });

  it("iPhone no Chrome mostra o Compartilhar do próprio Chrome", () => {
    expect(escolherEstrategia(detectarAparelho(UA.iphoneChrome), fora)).toBe("ios_outro_navegador");
  });

  it("iPad que se apresenta como Mac é tratado como iPhone/iPad", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
    expect(detectarAparelho(ua, { platform: "MacIntel", maxTouchPoints: 5 }).sistema).toBe("ios");
  });

  it("Android dentro do WhatsApp usa o botão que abre o Chrome", () => {
    const ap = detectarAparelho(UA.androidWhatsapp);
    expect(ap.dentroDeApp).toBe(true);
    expect(escolherEstrategia(ap, { standalone: false, temPromptNativo: true })).toBe("android_sair_app");
  });

  it("Android em janela interna sem marca também sai para o Chrome", () => {
    expect(escolherEstrategia(detectarAparelho(UA.androidWebview), fora)).toBe("android_sair_app");
  });

  it("Android no Chrome com instalador liberado instala com um toque", () => {
    expect(escolherEstrategia(detectarAparelho(UA.androidChrome), { standalone: false, temPromptNativo: true })).toBe(
      "android_instalar",
    );
  });

  it("Android no Chrome sem instalador liberado orienta pelo menu", () => {
    expect(escolherEstrategia(detectarAparelho(UA.androidChrome), fora)).toBe("android_menu");
  });

  it("Samsung Internet é navegador comum, não janela interna", () => {
    const ap = detectarAparelho(UA.androidSamsung);
    expect(ap.navegador).toBe("samsung");
    expect(ap.dentroDeApp).toBe(false);
  });

  it("app já aberto pelo ícone nunca mostra convite", () => {
    const e = escolherEstrategia(detectarAparelho(UA.iphoneSafari), { standalone: true, temPromptNativo: false });
    expect(e).toBe("instalado");
    expect(deveOferecerInstalacao(e, false)).toBe(false);
  });

  it("computador não mostra convite", () => {
    const e = escolherEstrategia(detectarAparelho(UA.desktop), fora);
    expect(deveOferecerInstalacao(e, false)).toBe(false);
  });

  it("Android já marcado como instalado esconde o convite; iPhone não depende da marca", () => {
    expect(deveOferecerInstalacao("android_menu", true)).toBe(false);
    expect(deveOferecerInstalacao("ios_sair_app", true)).toBe(true);
  });
});

describe("endereços de saída", () => {
  it("Android abre o mesmo endereço no Chrome com volta segura", () => {
    const url = urlAbrirNoChromeAndroid("https://aveto360.com/login?cpf=123&instalar=1");
    expect(url).toBe(
      "intent://aveto360.com/login?cpf=123&instalar=1#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=https%3A%2F%2Faveto360.com%2Flogin%3Fcpf%3D123%26instalar%3D1;end",
    );
  });

  it("iPhone abre no Chrome pelo esquema próprio", () => {
    expect(urlAbrirNoChromeIos("https://aveto360.com/login?instalar=1")).toBe("googlechromes://aveto360.com/login?instalar=1");
  });

  it("marca instalar=1 sem perder o CPF", () => {
    expect(comMarcaInstalar("https://aveto360.com/login?cpf=123")).toBe("https://aveto360.com/login?cpf=123&instalar=1");
  });

  it("marca de instalado fica guardada no aparelho", () => {
    const mem = new Map<string, string>();
    const arm = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(appMarcadoComoInstalado(arm)).toBe(false);
    marcarAppInstalado(arm);
    expect(appMarcadoComoInstalado(arm)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { detectPlatform, isStandalone, wasRecentlyDismissed, InstallPrompt } from "./InstallPrompt";

// Real user agents observed in the wild
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  ipadOsSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
};

function setNavigator({
  ua,
  platform = "",
  maxTouchPoints = 0,
  standalone = false,
}: { ua: string; platform?: string; maxTouchPoints?: number; standalone?: boolean }) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
  Object.defineProperty(window.navigator, "standalone", { value: standalone, configurable: true });
}

function setMatchMedia(matches: Record<string, boolean>) {
  window.matchMedia = ((q: string) => ({
    matches: matches[q] ?? false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  setMatchMedia({});
  Object.defineProperty(document, "referrer", { value: "", configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("detectPlatform", () => {
  it("identifies iPhone Safari", () => {
    setNavigator({ ua: UA.iphoneSafari, platform: "iPhone" });
    const p = detectPlatform();
    expect(p.isIos).toBe(true);
    expect(p.isSafari).toBe(true);
    expect(p.isInAppBrowser).toBe(false);
  });

  it("identifies iPhone Chrome as iOS but NOT Safari", () => {
    setNavigator({ ua: UA.iphoneChrome, platform: "iPhone" });
    const p = detectPlatform();
    expect(p.isIos).toBe(true);
    expect(p.isSafari).toBe(false);
  });

  it("identifies iPhone Firefox as iOS but NOT Safari", () => {
    setNavigator({ ua: UA.iphoneFirefox, platform: "iPhone" });
    const p = detectPlatform();
    expect(p.isIos).toBe(true);
    expect(p.isSafari).toBe(false);
  });

  it("flags Instagram in-app browser", () => {
    setNavigator({ ua: UA.iphoneInstagram, platform: "iPhone" });
    const p = detectPlatform();
    expect(p.isIos).toBe(true);
    expect(p.isInAppBrowser).toBe(true);
  });

  it("flags Facebook in-app browser", () => {
    setNavigator({ ua: UA.iphoneFacebook, platform: "iPhone" });
    const p = detectPlatform();
    expect(p.isInAppBrowser).toBe(true);
  });

  it("identifies iPadOS 13+ as iOS", () => {
    setNavigator({ ua: UA.ipadOsSafari, platform: "MacIntel", maxTouchPoints: 5 });
    const p = detectPlatform();
    expect(p.isIos).toBe(true);
    expect(p.isIpadOs).toBe(true);
    expect(p.isSafari).toBe(true);
  });

  it("does NOT flag Android as iOS", () => {
    setNavigator({ ua: UA.androidChrome, platform: "Linux armv8l" });
    const p = detectPlatform();
    expect(p.isIos).toBe(false);
    expect(p.isSafari).toBe(false);
  });

  it("does NOT flag desktop as iOS", () => {
    setNavigator({ ua: UA.desktopChrome, platform: "MacIntel", maxTouchPoints: 0 });
    const p = detectPlatform();
    expect(p.isIos).toBe(false);
  });
});

describe("isStandalone", () => {
  it("returns false in regular browser", () => {
    setNavigator({ ua: UA.iphoneSafari });
    expect(isStandalone()).toBe(false);
  });

  it("returns true when iOS navigator.standalone = true", () => {
    setNavigator({ ua: UA.iphoneSafari, standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it("returns true when display-mode: standalone matches", () => {
    setNavigator({ ua: UA.androidChrome });
    setMatchMedia({ "(display-mode: standalone)": true });
    expect(isStandalone()).toBe(true);
  });

  it("returns true for android-app:// referrer (TWA)", () => {
    setNavigator({ ua: UA.androidChrome });
    Object.defineProperty(document, "referrer", { value: "android-app://com.example", configurable: true });
    expect(isStandalone()).toBe(true);
  });
});

describe("wasRecentlyDismissed", () => {
  it("false when no record", () => {
    expect(wasRecentlyDismissed()).toBe(false);
  });
  it("true when dismissed today", () => {
    localStorage.setItem("pwa-install-dismissed-at", String(Date.now()));
    expect(wasRecentlyDismissed()).toBe(true);
  });
  it("false when dismissed > 14 days ago", () => {
    localStorage.setItem("pwa-install-dismissed-at", String(Date.now() - 15 * 24 * 60 * 60 * 1000));
    expect(wasRecentlyDismissed()).toBe(false);
  });
});

describe("InstallPrompt rendering", () => {
  it("shows iOS instructions on iPhone Safari, not installed, not dismissed", () => {
    setNavigator({ ua: UA.iphoneSafari, platform: "iPhone" });
    render(<InstallPrompt />);
    expect(screen.getByText(/Instalar Aveto 360/i)).toBeInTheDocument();
    expect(screen.getByText(/Adicionar à Tela de Início/i)).toBeInTheDocument();
  });

  it("hides on iPhone Chrome (non-Safari)", () => {
    setNavigator({ ua: UA.iphoneChrome, platform: "iPhone" });
    render(<InstallPrompt />);
    expect(screen.queryByText(/Instalar Aveto 360/i)).not.toBeInTheDocument();
  });

  it("hides inside Instagram in-app browser", () => {
    setNavigator({ ua: UA.iphoneInstagram, platform: "iPhone" });
    render(<InstallPrompt />);
    expect(screen.queryByText(/Instalar Aveto 360/i)).not.toBeInTheDocument();
  });

  it("hides when running as installed PWA (standalone)", () => {
    setNavigator({ ua: UA.iphoneSafari, platform: "iPhone", standalone: true });
    render(<InstallPrompt />);
    expect(screen.queryByText(/Instalar Aveto 360/i)).not.toBeInTheDocument();
  });

  it("hides when recently dismissed", () => {
    setNavigator({ ua: UA.iphoneSafari, platform: "iPhone" });
    localStorage.setItem("pwa-install-dismissed-at", String(Date.now()));
    render(<InstallPrompt />);
    expect(screen.queryByText(/Instalar Aveto 360/i)).not.toBeInTheDocument();
  });

  it("hides on desktop", () => {
    setNavigator({ ua: UA.desktopChrome, platform: "MacIntel" });
    render(<InstallPrompt />);
    expect(screen.queryByText(/Instalar Aveto 360/i)).not.toBeInTheDocument();
  });
});

import { useCallback, useEffect, useRef, useState } from "react";

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Detect standalone (already installed)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;
    setIsStandalone(standalone);

    if (standalone) {
      setCanInstall(false);
      return;
    }

    // iOS can always show the guided modal
    if (ios) {
      setCanInstall(true);
      return;
    }

    // Android/desktop: listen for native install prompt
    function handlePrompt(e) {
      e.preventDefault();
      promptRef.current = e;
      setCanInstall(true);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);

    // Listen for successful install
    function handleInstalled() {
      setIsStandalone(true);
      setCanInstall(false);
      promptRef.current = null;
    }

    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isStandalone) return;

    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (promptRef.current) {
      await promptRef.current.prompt();
      const result = await promptRef.current.userChoice;
      if (result.outcome === "accepted") {
        setCanInstall(false);
      }
      promptRef.current = null;
    }
  }, [isIOS, isStandalone]);

  return { canInstall, isIOS, isStandalone, triggerInstall, showIOSModal, setShowIOSModal };
}

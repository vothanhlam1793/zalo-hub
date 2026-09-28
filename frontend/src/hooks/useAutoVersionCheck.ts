import { useEffect, useRef } from 'react';

declare const __APP_BUILD_TIME__: string;

const CURRENT_BUILD = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';

export function useAutoVersionCheck() {
  const isCheckingRef = useRef(false);

  useEffect(() => {
    if (!CURRENT_BUILD) return;

    // Check version by fetching index.html header or content gently
    const checkVersion = async () => {
      if (isCheckingRef.current || document.hidden) return;
      isCheckingRef.current = true;
      try {
        const res = await fetch(`/?_v=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store' }
        });
        if (!res.ok) return;
        const html = await res.text();
        
        // Extract script src hash to see if the build bundle changed
        const currentScriptMatch = document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src');
        const newScriptMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1] || html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
        
        if (currentScriptMatch && newScriptMatch && currentScriptMatch !== newScriptMatch) {
          console.info('🚀 Phát hiện phiên bản ZaloHub mới, đang tự động làm mới ứng dụng...');
          // Reload clean without user having to press any shortcut
          window.location.reload();
        }
      } catch {
        // Network offline or error - ignore silently
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Check when user returns to tab (focus) and periodically every 5 minutes
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    const onVisibilityChange = () => {
      if (!document.hidden) void checkVersion();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkVersion);
    };
  }, []);
}

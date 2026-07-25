/**
 * Message bridge to the parent app (Porteghal WebView).
 * Uses the same pattern as daberna-game's messageBridge.ts.
 */

export function sendToParent(type: string, payload?: Record<string, any>): void {
  const message = JSON.stringify({ type, ...payload });

  // React Native WebView
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(message);
  }
  // iframe (web fallback)
  else if (window.parent !== window) {
    window.parent.postMessage(message, '*');
  }
  // Standalone (no parent)
  else {
    console.log('[Bridge]', message);
  }
}

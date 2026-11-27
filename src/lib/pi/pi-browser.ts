// Is this page running inside Pi Browser?
//
// PiNet (developers.minepi.com/docs/build-first-app/PiNet) opens the app at <sub>.pinet.com in an ORDINARY
// browser, where «once the application invokes Pi.authenticate the user's experience will end». So the
// sign-in that runs by itself on load (PiWarmup) must run only here, in Pi Browser; anywhere else the
// visitor looks around first and signs in with a tap.
//
// The Hub's rule (tec-app hub/page.tsx looksLikePiBrowser): Pi Browser names itself, or is an Android
// webview. Plus the React Native bridge Pi Browser's webview injects, which some builds carry without
// naming themselves. A false "no" only means sign-in waits for a tap — never a lock-out.
export function looksLikePiBrowser(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  win: { ReactNativeWebView?: unknown } | undefined = typeof window === 'undefined' ? undefined : (window as unknown as { ReactNativeWebView?: unknown }),
): boolean {
  if (win?.ReactNativeWebView) return true;
  return /PiBrowser|Pi Network|MinePI/i.test(ua) || (/Android/i.test(ua) && /;\s*wv\)/.test(ua));
}

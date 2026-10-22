/**
 * Mobile Device Detection, Fullscreen & Orientation Utilities for FC 26
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

export function isPhoneScreen(): boolean {
  if (typeof window === 'undefined') return false;
  const isTouch = isMobileDevice();
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  // Phones typically have a shortest dimension <= 500px, tablets/iPads are >= 768px
  return isTouch && minDim <= 540;
}

export function isPortraitOrientation(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
}

export async function requestFullscreenLandscape(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      mozRequestFullScreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    };

    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    }

    // Attempt to lock screen orientation to landscape on supporting devices (Android, etc.)
    const screenOrientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;

    if (screenOrientation && typeof screenOrientation.lock === 'function') {
      await screenOrientation.lock('landscape').catch(() => {});
    }

    return true;
  } catch {
    return false;
  }
}

export function exitFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      mozCancelFullScreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
    };

    if (document.fullscreenElement) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen().catch(() => {});
      }
    }
  } catch {}
}

export function triggerHaptic(duration: number | number[] = 15): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  } catch {}
}

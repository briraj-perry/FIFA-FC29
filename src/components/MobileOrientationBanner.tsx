import React, { useEffect, useState } from 'react';
import {
  isPhoneScreen,
  isPortraitOrientation,
  requestFullscreenLandscape,
  triggerHaptic,
} from '../utils/mobileDetection';
import { soundEngine } from '../audio/soundEngine';

export const MobileOrientationBanner: React.FC = () => {
  const [isPhone, setIsPhone] = useState<boolean>(() => isPhoneScreen());
  const [isPortrait, setIsPortrait] = useState<boolean>(() => isPortraitOrientation());
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const handleOrientationChange = () => {
      setIsPhone(isPhoneScreen());
      setIsPortrait(isPortraitOrientation());
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Only show if on phone and in portrait
  if (!isPhone || !isPortrait || dismissed) {
    return null;
  }

  const handleEnterLandscape = async () => {
    soundEngine.playUIClick();
    triggerHaptic(20);
    await requestFullscreenLandscape();
  };

  return (
    <div
      className="fixed top-2.5 inset-x-3 z-50 pointer-events-auto flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl bg-[#090D16]/95 border border-[#CCFF00]/60 text-white shadow-2xl backdrop-blur-xl animate-pulse"
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">📱</span>
        <div className="min-w-0">
          <div className="text-[10px] font-mono-tabular uppercase font-bold text-[#CCFF00] tracking-wider leading-none">
            PHONE DISPLAY DETECTED
          </div>
          <div className="text-xs font-bold truncate text-slate-100 mt-0.5">
            Rotate phone to Landscape for best pitch view & controls!
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleEnterLandscape}
          className="px-2.5 py-1 rounded-xl bg-[#CCFF00] text-slate-950 font-display font-black text-xs uppercase tracking-wide shadow-md active:scale-95 transition-transform cursor-pointer"
        >
          ⛶ Fullscreen
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playUIClick();
            setDismissed(true);
          }}
          className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

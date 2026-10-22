import React, { useState } from 'react';
import { ProgressionService } from '../services/progressionService';
import { soundEngine } from '../audio/soundEngine';

interface GoogleAuthScreenProps {
  onLoginSuccess: () => void;
  defaultEmail?: string;
  defaultName?: string;
}

export const GoogleAuthScreen: React.FC<GoogleAuthScreenProps> = ({
  onLoginSuccess,
  defaultEmail = 'sinny777@gmail.com',
  defaultName = 'Sinny',
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [displayName, setDisplayName] = useState(defaultName);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSignInGoogle = () => {
    soundEngine.playUIClick();
    setIsAuthenticating(true);

    setTimeout(() => {
      ProgressionService.loginGoogle(email, displayName);
      setIsAuthenticating(false);
      onLoginSuccess();
    }, 600);
  };

  const handleGuestSignIn = () => {
    soundEngine.playUIClick();
    ProgressionService.loginGoogle('guest.fc26@football.pro', 'Guest Striker');
    onLoginSuccess();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#05080F]/90 backdrop-blur-xl select-none overflow-y-auto">
      {/* Background ambient lighting glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[340px] bg-gradient-to-r from-emerald-500/15 via-cyan-500/15 to-blue-500/15 blur-3xl rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#090D16]/95 border border-white/15 rounded-3xl p-5 sm:p-8 shadow-2xl flex flex-col items-center text-center my-auto max-h-[96vh] overflow-y-auto">
        {/* FC 26 Brand Crest */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 p-0.5 shadow-xl shadow-emerald-500/20 mb-4">
          <div className="w-full h-full bg-[#090D16] rounded-2xl flex items-center justify-center">
            <span className="font-display font-black text-2xl tracking-tighter text-[#CCFF00]">
              FC26
            </span>
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold">
          EA SPORTS FC 26 · CLUB CLOUD SYNC
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-wide text-white mt-1">
          Sign In to Your Club
        </h1>
        <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
          Sign in with Google to synchronize your team OVR, Level progression (Beginner I ➔ Beginner II), and custom tactical formations.
        </p>

        {/* Google User Profile Card */}
        <div className="w-full mt-6 p-4 rounded-2xl bg-[#111827]/90 border border-white/10 flex flex-col gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
              {/* Google G Logo SVG */}
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white truncate">{displayName}</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-1.5 py-0.2 rounded-full">
                  VERIFIED
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono-tabular truncate">{email}</div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditingAccount(!isEditingAccount)}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline shrink-0 cursor-pointer"
            >
              {isEditingAccount ? 'Done' : 'Change'}
            </button>
          </div>

          {/* Account Edit input if user wants to customize */}
          {isEditingAccount && (
            <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                  Manager / Player Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-white/20 rounded-lg text-white font-semibold focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                  Google Account Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-white/20 rounded-lg text-white font-semibold focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Primary Sign In Button */}
        <button
          type="button"
          onClick={handleSignInGoogle}
          disabled={isAuthenticating}
          className="w-full mt-5 py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-sm tracking-wide shadow-xl shadow-white/10 flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          {/* Google G Logo SVG */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isAuthenticating ? 'Connecting to FC 26...' : `Continue with Google (${email})`}</span>
        </button>

        {/* Secondary Guest Option */}
        <button
          type="button"
          onClick={handleGuestSignIn}
          className="w-full mt-2.5 py-2.5 px-4 rounded-xl bg-transparent hover:bg-white/5 text-slate-400 hover:text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Skip & Play as Guest (Local Only)
        </button>

        {/* Security / FC 26 Cloud Telemetry Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 w-full flex items-center justify-between text-[10px] text-slate-500 font-mono-tabular">
          <span>🔒 Google OAuth 2.0 Secure</span>
          <span>Rank: Beginner I ➔ Beginner II</span>
        </div>
      </div>
    </div>
  );
};

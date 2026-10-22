import React from 'react';
import { CareerRankTier, UserCareerProfile } from '../types/progression';
import { soundEngine } from '../audio/soundEngine';

interface PostMatchProgressionModalProps {
  homeScore: number;
  awayScore: number;
  progressionResult: {
    profile: UserCareerProfile;
    xpGained: number;
    ovrGained: number;
    coinsGained?: number;
    previousOvr: string;
    newOvr: string;
    leveledUp: boolean;
    previousRank: CareerRankTier;
    newRank: CareerRankTier;
  } | null;
  onPlayAgain: () => void;
  onOpenTeamManagement: () => void;
  onOpenPlayerDraft?: () => void;
  onReturnToMenu: () => void;
}

export const PostMatchProgressionModal: React.FC<PostMatchProgressionModalProps> = ({
  homeScore,
  awayScore,
  progressionResult,
  onPlayAgain,
  onOpenTeamManagement,
  onOpenPlayerDraft,
  onReturnToMenu,
}) => {
  const isWin = homeScore > awayScore;
  const isDraw = homeScore === awayScore;
  const coinsEarned =
    progressionResult?.coinsGained ?? (isWin ? 10000 : isDraw ? 2500 : 1000);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-[#05080F]/90 backdrop-blur-xl select-none overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#090D16] border border-white/15 rounded-3xl p-4 sm:p-8 shadow-2xl flex flex-col items-center text-center my-auto max-h-[96vh] overflow-y-auto">
        {/* Top Trophy / Match Result Crest */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl mb-4 border ${
            isWin
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/20'
              : isDraw
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
          }`}
        >
          {isWin ? '🏆' : isDraw ? '🤝' : '⚽'}
        </div>

        <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold">
          MATCH FULL TIME · 90:00
        </div>

        <h2 className="font-display text-3xl font-black uppercase tracking-wide text-white mt-0.5">
          {isWin ? 'VICTORY! (+10,000 COINS)' : isDraw ? 'DRAW' : 'FULL TIME'}
        </h2>

        {/* Scorecard Display */}
        <div className="mt-3 flex items-center justify-center gap-6 px-6 py-2.5 rounded-2xl bg-black/50 border border-white/10 font-display">
          <div className="text-right">
            <span className="text-xs text-slate-400 font-bold block uppercase">REAL MADRID</span>
            <span className="text-3xl font-black text-white">{homeScore}</span>
          </div>
          <span className="text-slate-600 text-xl font-bold">-</span>
          <div className="text-left">
            <span className="text-xs text-slate-400 font-bold block uppercase">MANCHESTER CITY</span>
            <span className="text-3xl font-black text-white">{awayScore}</span>
          </div>
        </div>

        {/* Progression Ceremony Card */}
        {progressionResult && (
          <div className="w-full mt-5 p-4 rounded-2xl bg-[#111827]/90 border border-white/10 flex flex-col gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Match Coins, Career & OVR Rewards
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Coins Reward Card */}
              <div className="p-3 rounded-xl bg-gradient-to-b from-amber-500/20 to-slate-900 border-2 border-amber-400/60 flex flex-col items-center">
                <span className="text-[10px] font-black text-amber-300 uppercase">COINS EARNED</span>
                <div className="font-display text-2xl font-black text-white mt-1">
                  +{coinsEarned.toLocaleString()}
                </div>
                <span className="text-[10px] text-amber-300 font-mono-tabular font-bold mt-0.5">
                  🪙 Total: {(progressionResult.profile.coins || 0).toLocaleString()}
                </span>
              </div>

              {/* OVR Increment Card */}
              <div className="p-3 rounded-xl bg-slate-900 border border-amber-400/30 flex flex-col items-center">
                <span className="text-[10px] font-bold text-amber-400 uppercase">TEAM OVR</span>
                <div className="flex items-center gap-1 mt-1 font-display">
                  <span className="text-base text-slate-400 font-bold">{progressionResult.previousOvr}</span>
                  <span className="text-amber-400 font-bold">➔</span>
                  <span className="text-2xl font-black text-amber-300">{progressionResult.newOvr}</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono-tabular font-bold mt-0.5">
                  +{progressionResult.ovrGained.toFixed(2)} OVR
                </span>
              </div>

              {/* XP & Level Card */}
              <div className="p-3 rounded-xl bg-slate-900 border border-cyan-400/30 flex flex-col items-center">
                <span className="text-[10px] font-bold text-cyan-400 uppercase">CAREER LEVEL</span>
                <div className="text-sm font-black text-white mt-1.5">
                  {progressionResult.newRank.title}
                </div>
                <span className="text-[10px] text-cyan-400 font-mono-tabular font-bold mt-0.5">
                  +{progressionResult.xpGained} XP
                </span>
              </div>
            </div>

            {/* Rank Promotion Banner */}
            {progressionResult.leveledUp && (
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border border-emerald-400/50 flex items-center justify-center gap-2 animate-bounce">
                <span className="text-lg">🎉</span>
                <span className="text-xs font-black text-emerald-300 uppercase tracking-wide">
                  PROMOTED: Welcome to {progressionResult.newRank.title}!
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full mt-6 flex flex-wrap items-center gap-2.5">
          {onOpenPlayerDraft && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playUIClick();
                onOpenPlayerDraft();
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 cursor-pointer"
            >
              🪙 Draft Players / 10x Pack Draw ({(progressionResult?.profile.coins || 0).toLocaleString()} Coins)
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playUIClick();
              onPlayAgain();
            }}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
          >
            Play Next Match ▶
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUIClick();
              onOpenTeamManagement();
            }}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            📋 Team Management
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUIClick();
              onReturnToMenu();
            }}
            className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/10 font-bold text-xs transition-colors cursor-pointer"
          >
            🏠 Menu Hub
          </button>
        </div>
      </div>
    </div>
  );
};

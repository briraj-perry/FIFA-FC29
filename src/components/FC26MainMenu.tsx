import React from 'react';
import { ProgressionService } from '../services/progressionService';
import { CAREER_RANKS, UserCareerProfile } from '../types/progression';
import { soundEngine } from '../audio/soundEngine';

interface FC26MainMenuProps {
  profile: UserCareerProfile;
  onStartMatch: () => void;
  onOpenTeamManagement: () => void;
  onOpenPlayerDraft: () => void;
  onOpenCustomizer: () => void;
  onOpenOnlineLobby: () => void;
  onPracticeCornerKick: () => void;
  onLogout: () => void;
  onProfileUpdate?: (profile: UserCareerProfile) => void;
}

export const FC26MainMenu: React.FC<FC26MainMenuProps> = ({
  profile,
  onStartMatch,
  onOpenTeamManagement,
  onOpenPlayerDraft,
  onOpenCustomizer,
  onOpenOnlineLobby,
  onPracticeCornerKick,
  onLogout,
  onProfileUpdate,
}) => {
  const teamOvrData = ProgressionService.calculateTeamOVR(profile);
  const currentRank = ProgressionService.getRankForXp(profile.xp);
  const nextRank = CAREER_RANKS.find((r) => r.level === currentRank.level + 1) || currentRank;

  const xpInCurrentTier = profile.xp - currentRank.minXp;
  const tierXpSpan = Math.max(1, currentRank.maxXp - currentRank.minXp);
  const xpProgressPercent = Math.min(100, Math.max(0, (xpInCurrentTier / tierXpSpan) * 100));

  const starters = profile.starterPlayerIds
    .map((id) => ProgressionService.getPlayerById(id))
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#05080F] text-white select-none overflow-y-auto">
      {/* Top FC 26 Broadcast Header */}
      <header className="w-full bg-[#090D16]/95 border-b border-white/10 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md">
        {/* Left: Brand & Club Crest */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#090D16] rounded-xl flex items-center justify-center">
              <span className="font-display font-black text-sm tracking-tighter text-[#CCFF00]">
                FC26
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base font-extrabold uppercase tracking-wide text-white">
                {profile.clubName}
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-black bg-white/10 text-slate-300">
                PRO SQUAD
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              Formation: <span className="text-cyan-400 font-bold">{profile.activeFormation}</span>
            </div>
          </div>
        </div>

        {/* Center: Club Coins, Live OVR Shield Badge & Career Rank Level Badge */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Club Coins Pill (Click to Open Player Draft) */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playUIClick();
              onOpenPlayerDraft();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-yellow-500/25 via-amber-500/15 to-transparent border border-yellow-400/50 hover:border-yellow-300 shadow-lg shadow-yellow-500/10 cursor-pointer transition-all"
            title="Open FC 26 Player Draft & Pack Draw"
          >
            <span className="text-base">🪙</span>
            <div className="text-left">
              <div className="font-mono-tabular text-base font-black text-yellow-300 leading-none">
                {(profile.coins || 0).toLocaleString()}
              </div>
              <span className="text-[8px] font-black uppercase text-amber-200 tracking-widest block">
                COINS · DRAFT
              </span>
            </div>
          </button>

          {/* OVR Shield */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-400/40 shadow-lg shadow-amber-500/10">
            <div className="font-display text-2xl font-black text-amber-300 tracking-tighter leading-none">
              {teamOvrData.formatted}
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-amber-400 tracking-widest leading-none">
                SQUAD OVR
              </span>
              <span className="text-[9px] text-slate-400 font-mono-tabular">
                +{profile.ovrBonus.toFixed(1)} Win Boost
              </span>
            </div>
          </div>

          {/* Level / Rank Badge (Beginner I, Beginner II, etc.) */}
          <div className="flex flex-col min-w-[140px] sm:min-w-[180px] px-3 py-1.5 rounded-xl bg-[#111827] border border-white/10">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1 font-bold" style={{ color: currentRank.color }}>
                <span>{currentRank.badge}</span>
                <span>{currentRank.title}</span>
                <span className="text-slate-500 text-[10px]">Lv.{currentRank.level}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono-tabular">
                {profile.xp} XP
              </span>
            </div>
            {/* XP Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${xpProgressPercent}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-400 font-mono-tabular mt-0.5 text-right">
              {currentRank.level < 12 ? `Next: ${nextRank.title} (${Math.max(0, currentRank.maxXp - profile.xp)} XP)` : 'Max Rank'}
            </div>
          </div>
        </div>

        {/* Right: Google User Profile & Logout */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111827] border border-white/10">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-white">
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-white truncate max-w-[100px]">
                {profile.displayName}
              </div>
              <div className="text-[10px] text-slate-400 font-mono-tabular truncate max-w-[100px]">
                {profile.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUIClick();
              onLogout();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
            title="Sign out / Switch Google Account"
          >
            ↪
          </button>
        </div>
      </header>

      {/* Main Hub Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col gap-6">
        {/* Welcome Callout Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#111827]/90 via-[#0B132B]/80 to-[#111827]/90 border border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00]">
              CAREER SQUAD LADDER · FC 26
            </div>
            <div className="text-lg font-extrabold uppercase tracking-wide text-white mt-0.5">
              Welcome back, Manager {profile.displayName}!
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Win matches to steadily raise your overall rating (<span className="text-amber-400 font-bold">+{profile.ovrBonus.toFixed(1)} OVR earned</span>) and advance through the ranks from <span className="text-cyan-400 font-bold">Beginner I</span> to <span className="text-emerald-400 font-bold">Beginner II</span> and beyond.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-tabular">
            <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-slate-400 text-[10px]">RECORD</span>
              <span className="font-bold text-white">
                {profile.matchesWon}W - {profile.matchesDrawn}D - {profile.matchesLost}L
              </span>
            </div>
            <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-slate-400 text-[10px]">GOALS</span>
              <span className="font-bold text-emerald-400">{profile.goalsScored}</span>
            </div>
          </div>
        </div>

        {/* FC 26 Mosaic Navigation Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* HERO TILE: PLAY MATCH (Spans 2 columns) */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onStartMatch();
            }}
            className="md:col-span-2 group relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-black border-2 border-emerald-500/40 hover:border-emerald-400 p-6 sm:p-8 flex flex-col justify-between shadow-2xl hover:shadow-emerald-500/20 transition-all cursor-pointer min-h-[260px]"
          >
            {/* Ambient Background Graphic & Stadium Lighting */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-emerald-500/20 via-cyan-500/10 to-transparent blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />
            <div className="absolute -bottom-8 -right-8 font-display font-black text-9xl text-white/[0.03] select-none pointer-events-none">
              FC26
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono-tabular font-black text-[10px] tracking-wider uppercase">
                  RECOMMENDED
                </span>
                <span className="text-xs text-slate-400 font-mono-tabular">MATCHDAY 1</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-wide text-white mt-2 group-hover:text-emerald-300 transition-colors">
                KICK OFF MATCH
              </h2>
              <p className="text-xs text-slate-300 mt-2 max-w-sm leading-relaxed">
                Compete against Manchester City with adaptive AI difficulty. Win to level up from {currentRank.title} and boost your team OVR!
              </p>
            </div>

            <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-slate-900 flex items-center justify-center font-bold text-[10px]">
                    #9
                  </div>
                  <div className="w-8 h-8 rounded-full bg-amber-500 border-2 border-slate-900 flex items-center justify-center font-bold text-[10px]">
                    #7
                  </div>
                  <div className="w-8 h-8 rounded-full bg-indigo-600 border-2 border-slate-900 flex items-center justify-center font-bold text-[10px]">
                    #5
                  </div>
                </div>
                <span className="text-xs text-slate-300 font-bold">Mbappé · Vini Jr · Jude</span>
              </div>

              <button
                type="button"
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/30 group-hover:scale-105 transition-transform flex items-center gap-2"
              >
                <span>PLAY MATCH ▶</span>
              </button>
            </div>
          </div>

          {/* TILE 2: PLAYER DRAFT & 10X PACK DRAW (NEW FEATURED TILE) */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onOpenPlayerDraft();
            }}
            className="group relative rounded-3xl overflow-hidden bg-gradient-to-br from-amber-950/70 via-[#121626] to-[#0A101D] border-2 border-amber-400/60 hover:border-amber-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-amber-500/20 transition-all cursor-pointer min-h-[260px]"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-400/15 blur-2xl pointer-events-none group-hover:scale-110 transition-transform" />

            <div>
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-mono-tabular font-black uppercase tracking-wider">
                  👑 120 OVR ICONS & 10X DRAW
                </span>
                <span className="text-xs font-mono-tabular font-black text-amber-300">
                  🪙 {(profile.coins || 0).toLocaleString()}
                </span>
              </div>
              <h3 className="font-display text-2xl font-black uppercase tracking-wide text-white mt-2 group-hover:text-amber-300 transition-colors">
                Player Draft & Packs
              </h3>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Spend match win Coins! Draft lesser OVR players for <strong className="text-cyan-300">5,000 🪙</strong>, <strong className="text-amber-300">120 OVR Icons</strong>, or <strong className="text-[#CCFF00]">10x Multi-Draft (1+ Good Player Guaranteed!)</strong>.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300">Win Match = +10,000 🪙</span>
              <span className="text-xs font-black text-[#CCFF00] group-hover:translate-x-1 transition-transform">
                Draft Players ➔
              </span>
            </div>
          </div>

          {/* TILE 3: ONLINE MULTIPLAYER 1V1 & FRIENDS */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onOpenOnlineLobby();
            }}
            className="group relative rounded-3xl overflow-hidden bg-[#0A101D] border border-white/15 hover:border-indigo-400 p-6 flex flex-col justify-between shadow-xl hover:shadow-indigo-500/20 transition-all cursor-pointer min-h-[260px]"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 blur-2xl pointer-events-none group-hover:scale-110 transition-transform" />

            <div>
              <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-indigo-400 font-bold">
                FRIEND SEARCH & ONLINE 1V1
              </div>
              <h3 className="font-display text-2xl font-black uppercase tracking-wide text-white mt-1 group-hover:text-indigo-300 transition-colors">
                Online & Friends
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Search players by name, send Friend Requests with live screen notifications, and play 1v1 with accepted friends!
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Friends List & Invites</span>
              <span className="text-xs font-black text-indigo-400 group-hover:translate-x-1 transition-transform">
                Search & Play ➔
              </span>
            </div>
          </div>

          {/* TILE 4: TEAM MANAGEMENT & FORMATION BOARD */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onOpenTeamManagement();
            }}
            className="group relative rounded-3xl overflow-hidden bg-[#0A101D] border border-white/15 hover:border-cyan-400 p-6 flex flex-col justify-between shadow-xl hover:shadow-cyan-500/20 transition-all cursor-pointer min-h-[240px]"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-2xl pointer-events-none group-hover:scale-110 transition-transform" />

            <div>
              <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-cyan-400 font-bold">
                TACTICAL BOARD
              </div>
              <h3 className="font-display text-xl font-black uppercase tracking-wide text-white mt-1 group-hover:text-cyan-300 transition-colors">
                Team Management
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Change formations ({profile.activeFormation}) and equip your drafted 120 OVR Icons into your Starting 7!
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">7 Starting Players</span>
              <span className="text-xs font-black text-cyan-400 group-hover:translate-x-1 transition-transform">
                Edit Lineup ➔
              </span>
            </div>
          </div>

          {/* TILE 5: 1ST-PERSON CORNER KICK PRACTICE */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onPracticeCornerKick();
            }}
            className="group relative rounded-3xl overflow-hidden bg-[#0A101D] border border-white/15 hover:border-amber-400 p-6 flex flex-col justify-between shadow-xl hover:shadow-amber-500/20 transition-all cursor-pointer min-h-[240px]"
          >
            <div>
              <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-amber-400 font-bold">
                SPECIAL SET-PIECE
              </div>
              <h3 className="font-display text-xl font-black uppercase tracking-wide text-white mt-1 group-hover:text-amber-300 transition-colors">
                1st-Person Corner
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Stand at the corner flag in first-person view, draw ball paths with your finger or mouse, and curve it into the box!
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Gesture Drawing</span>
              <span className="text-xs font-black text-amber-400 group-hover:translate-x-1 transition-transform">
                Practice ➔
              </span>
            </div>
          </div>

          {/* TILE 6: LOCKER ROOM & CUSTOMIZER */}
          <div
            onClick={() => {
              soundEngine.playUIClick();
              onOpenCustomizer();
            }}
            className="group relative rounded-3xl overflow-hidden bg-[#0A101D] border border-white/15 hover:border-rose-400 p-6 flex flex-col justify-between shadow-xl hover:shadow-rose-500/20 transition-all cursor-pointer min-h-[240px]"
          >
            <div>
              <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-rose-400 font-bold">
                EQUIPMENT
              </div>
              <h3 className="font-display text-xl font-black uppercase tracking-wide text-white mt-1 group-hover:text-rose-300 transition-colors">
                Locker Room
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Customize pro boots (Mercurial, Predator), wrist tape, kit styles, and match balls.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Visual Customizer</span>
              <span className="text-xs font-black text-rose-400 group-hover:translate-x-1 transition-transform">
                Inspect Gear ➔
              </span>
            </div>
          </div>

          {/* TILE 7: OVR & RANK PROGRESSION REVIEWS */}
          <div className="rounded-3xl bg-[#090D16]/90 border border-white/15 p-6 flex flex-col justify-between shadow-xl min-h-[240px]">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold">
                  CLUB ATTRIBUTES
                </div>
                <span className="text-xs text-slate-400 font-mono-tabular font-bold">
                  Lv.{currentRank.level}
                </span>
              </div>

              {/* Three Sector Ratings */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="p-2.5 rounded-2xl bg-slate-900 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-rose-400 uppercase block">ATK</span>
                  <span className="font-display text-xl font-black text-white">{teamOvrData.attackOvr}</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-900 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-emerald-400 uppercase block">MID</span>
                  <span className="font-display text-xl font-black text-white">{teamOvrData.midfieldOvr}</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-900 border border-white/10 text-center">
                  <span className="text-[9px] font-bold text-cyan-400 uppercase block">DEF</span>
                  <span className="font-display text-xl font-black text-white">{teamOvrData.defenseOvr}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-slate-400 leading-relaxed">
              Every match victory grants <span className="text-amber-300 font-bold">+10,000 Coins</span>, <span className="text-emerald-400 font-bold">+100 XP</span> & <span className="text-amber-400 font-bold">+0.20 OVR</span>.
            </div>
          </div>
        </div>

        {/* 7-PLAYER STARTING LINEUP & ROLE PLACEMENT SHOWCASE */}
        <section className="mt-4 rounded-3xl bg-[#090D16]/95 border border-white/10 p-5 sm:p-7 shadow-2xl flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold">
                MY ACTIVE SQUAD · {profile.activeFormation.toUpperCase()}
              </div>
              <h3 className="font-display text-xl font-black uppercase tracking-wide text-white mt-0.5">
                Starting 7 Players (OVR Speed & Shot Scaling Active)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUIClick();
                  onOpenPlayerDraft();
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>🪙 Draft Players & 10x Packs ({(profile.coins || 0).toLocaleString()} Coins)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUIClick();
                  onOpenTeamManagement();
                }}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-cyan-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>⚙ Change Formation & Players</span>
              </button>
            </div>
          </div>

          {/* 7 Starters Grid Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {starters.map((player, idx) => {
              if (!player) return null;
              const individualBoostedOvr = (player.baseOvr + profile.ovrBonus).toFixed(1);
              const roleColors: Record<string, { bg: string; text: string; border: string }> = {
                GK: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-400/30' },
                DEF: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-400/30' },
                MID: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-400/30' },
                FWD: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-400/30' },
              };
              const roleStyle = roleColors[player.primaryRole] || roleColors.MID;

              return (
                <div
                  key={player.id}
                  onClick={() => {
                    soundEngine.playUIClick();
                    onOpenTeamManagement();
                  }}
                  className="p-3 rounded-2xl bg-[#0D1322] border border-white/10 hover:border-cyan-400 transition-all flex flex-col items-center text-center cursor-pointer group shadow-lg"
                >
                  {/* Position Badge & Number */}
                  <div className="flex items-center justify-between w-full text-[10px] font-mono-tabular font-bold">
                    <span className={`px-1.5 py-0.5 rounded ${roleStyle.bg} ${roleStyle.text} border ${roleStyle.border}`}>
                      {player.primaryRole}
                    </span>
                    <span className="text-slate-400">#{player.number}</span>
                  </div>

                  {/* Player Avatar Circle */}
                  <div
                    className="w-12 h-12 rounded-full my-2 flex items-center justify-center font-display font-black text-sm text-white shadow-md group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: player.avatarColor }}
                  >
                    {player.shortName.charAt(0)}
                  </div>

                  {/* Name */}
                  <div className="font-extrabold text-xs text-white truncate max-w-full group-hover:text-cyan-300">
                    {player.shortName}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-full">
                    {player.nationality}
                  </div>

                  {/* OVR & Speed/Shot Pill */}
                  <div className="mt-2 w-full pt-1.5 border-t border-white/10 flex flex-col gap-0.5 font-mono-tabular text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">OVR</span>
                      <span className="font-bold text-amber-300">{individualBoostedOvr}</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-400">
                      <span>⚡{player.pace}</span>
                      <span>💥{player.shooting}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Simulation & Testing Tools Bar for User Convenience */}
          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400 font-mono-tabular">
              <span>Quick Progression Test:</span>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playWhistle('goal');
                  const res = ProgressionService.recordMatchResult(3, 1);
                  if (onProfileUpdate) onProfileUpdate(res.profile);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold transition-colors cursor-pointer"
              >
                + Win Match (+10,000 🪙 · +130 XP · +0.20 OVR)
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUIClick();
                  const fresh = ProgressionService.resetCareer();
                  if (onProfileUpdate) onProfileUpdate(fresh);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer text-[11px]"
              >
                ↺ Reset Career to Beginner I
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono-tabular">
              Current Rank: <strong className="text-white">{currentRank.title} (Level {currentRank.level})</strong> · Squad OVR: <strong className="text-amber-300">{teamOvrData.formatted}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

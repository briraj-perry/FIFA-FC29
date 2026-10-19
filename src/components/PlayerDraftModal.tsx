import React, { useState } from 'react';
import {
  PlayerRole,
  SquadPlayer,
  UserCareerProfile,
} from '../types/progression';
import {
  ProgressionService,
  TenPackDrawResultItem,
} from '../services/progressionService';
import { soundEngine } from '../audio/soundEngine';

interface PlayerDraftModalProps {
  profile: UserCareerProfile;
  onUpdateProfile: (profile: UserCareerProfile) => void;
  onOpenTeamManagement: () => void;
  onClose: () => void;
}

type FilterCategory = 'ALL' | 'MYTHIC_120' | 'SUPERSTAR_90' | 'VALUE_5K' | 'LOW_OVR' | PlayerRole;

export const PlayerDraftModal: React.FC<PlayerDraftModalProps> = ({
  profile,
  onUpdateProfile,
  onOpenTeamManagement,
  onClose,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [isOpeningPack, setIsOpeningPack] = useState(false);
  const [packRevealPlayer, setPackRevealPlayer] = useState<SquadPlayer | null>(null);
  const [packIsNewUnlock, setPackIsNewUnlock] = useState<boolean>(true);
  const [tenPackResults, setTenPackResults] = useState<TenPackDrawResultItem[] | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const allPlayers = ProgressionService.getAllSquadPlayers().sort(
    (a, b) => b.baseOvr - a.baseOvr
  );
  const teamOvr = ProgressionService.calculateTeamOVR(profile);

  const filteredPlayers = allPlayers.filter((p) => {
    const price = ProgressionService.getPlayerPrice(p);
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'MYTHIC_120') return p.baseOvr >= 118;
    if (activeFilter === 'SUPERSTAR_90') return p.baseOvr >= 90 && p.baseOvr < 118;
    if (activeFilter === 'VALUE_5K') return price <= 5000;
    if (activeFilter === 'LOW_OVR') return p.baseOvr <= 82;
    return p.primaryRole === activeFilter || p.secondaryRoles.includes(activeFilter);
  });

  const handleOpenPack = (
    packTier: 'STANDARD_5K' | 'WORLD_CLASS_15K' | 'MYTHIC_120_35K'
  ) => {
    soundEngine.playUIClick();
    setStatusBanner(null);

    const costMap = {
      STANDARD_5K: 5000,
      WORLD_CLASS_15K: 15000,
      MYTHIC_120_35K: 35000,
    };
    if (profile.coins < costMap[packTier]) {
      setStatusBanner({
        text: `Not enough Coins! You need ${costMap[packTier].toLocaleString()} Coins (Current: ${profile.coins.toLocaleString()}). Win a match (+10,000 Coins) to afford this pack!`,
        type: 'error',
      });
      return;
    }

    setIsOpeningPack(true);
    setPackRevealPlayer(null);
    setTenPackResults(null);

    setTimeout(() => {
      const res = ProgressionService.drawPackPlayer(packTier);
      setIsOpeningPack(false);
      if (!res.success || !res.drawnPlayer) {
        setStatusBanner({
          text: res.error || 'Could not open pack.',
          type: 'error',
        });
        return;
      }
      soundEngine.playWhistle('goal');
      onUpdateProfile(res.profile);
      setPackRevealPlayer(res.drawnPlayer);
      setPackIsNewUnlock(Boolean(res.isNewUnlock));
    }, 550);
  };

  const handleOpenTenPack = (packTier: 'PRO_10X_10K' | 'MYTHIC_10X_45K') => {
    soundEngine.playUIClick();
    setStatusBanner(null);

    const cost = packTier === 'MYTHIC_10X_45K' ? 45000 : 10000;
    if (profile.coins < cost) {
      setStatusBanner({
        text: `Not enough Coins for 10x Multi-Draft! Need ${cost.toLocaleString()} Coins (Current: ${profile.coins.toLocaleString()}). Win a match (+10,000 Coins)!`,
        type: 'error',
      });
      return;
    }

    setIsOpeningPack(true);
    setPackRevealPlayer(null);
    setTenPackResults(null);

    setTimeout(() => {
      const res = ProgressionService.drawTenPackPlayers(packTier);
      setIsOpeningPack(false);
      if (!res.success || !res.drawnItems) {
        setStatusBanner({
          text: res.error || 'Could not open 10x Multi-Draft.',
          type: 'error',
        });
        return;
      }
      soundEngine.playWhistle('goal');
      onUpdateProfile(res.profile);
      setTenPackResults(res.drawnItems);
      const bestPlayer = [...res.drawnItems].sort(
        (a, b) => b.player.baseOvr - a.player.baseOvr
      )[0];
      setStatusBanner({
        text: `🔥 10x MULTI-DRAFT COMPLETE! Headlined by ${bestPlayer.player.name} (${bestPlayer.player.baseOvr} OVR)! Guaranteed Elite Player unlocked!`,
        type: 'success',
      });
    }, 650);
  };

  const handleDraftDirectPlayer = (player: SquadPlayer) => {
    soundEngine.playUIClick();
    setStatusBanner(null);
    const res = ProgressionService.draftPlayerWithCoins(player.id);
    if (!res.success) {
      setStatusBanner({
        text: res.error || 'Not enough Coins to draft this player.',
        type: 'error',
      });
      return;
    }
    soundEngine.playWhistle('goal');
    onUpdateProfile(res.profile);
    setPackRevealPlayer(player);
    setTenPackResults(null);
    setPackIsNewUnlock(true);
    setStatusBanner({
      text: `Drafted ${player.name} (${player.baseOvr} OVR · PAC ${player.pace} · SHO ${player.shooting}) into your Club Squad!`,
      type: 'success',
    });
  };

  const handleSlotIntoStarting7 = (player: SquadPlayer) => {
    soundEngine.playUIClick();
    const updated = ProgressionService.slotPlayerIntoStarters(player.id);
    onUpdateProfile(updated);
    setStatusBanner({
      text: `⚡ ${player.name} (${player.baseOvr} OVR · Speed ${player.pace} · Shot ${player.shooting}) is now in your Starting 7 Lineup!`,
      type: 'success',
    });
  };

  const handleAutoEquipBestFromTenPack = () => {
    if (!tenPackResults) return;
    soundEngine.playWhistle('goal');
    const sortedGood = [...tenPackResults]
      .sort((a, b) => b.player.baseOvr - a.player.baseOvr)
      .slice(0, 3);
    let latestProfile = profile;
    for (const item of sortedGood) {
      latestProfile = ProgressionService.slotPlayerIntoStarters(item.player.id);
    }
    onUpdateProfile(latestProfile);
    setStatusBanner({
      text: `⚡ Equipped top drawn stars (${sortedGood.map((i) => `${i.player.shortName} ${i.player.baseOvr}`).join(', ')}) into your Starting 7!`,
      type: 'success',
    });
  };

  const getSpeedAndShotLabel = (player: SquadPlayer) => {
    if (player.baseOvr >= 115) {
      return {
        label: '⚡ HYPER SPEED · 💥 ROCKET SHOT',
        cls: 'bg-amber-400/20 text-amber-300 border-amber-400/50',
      };
    }
    if (player.baseOvr >= 90) {
      return {
        label: '⚡ FAST PACE · 🎯 POWER SHOT',
        cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      };
    }
    if (player.baseOvr >= 83) {
      return {
        label: 'BALANCED SPEED & SHOT',
        cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
      };
    }
    return {
      label: '🐢 VERY SLOW · WEAK SHOT',
      cls: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
    };
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-5 bg-[#05080F]/95 backdrop-blur-xl select-none overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[94vh] bg-[#090D16] border border-white/15 rounded-3xl p-4 sm:p-7 shadow-2xl flex flex-col gap-5 overflow-y-auto">
        {/* Top Header: Title, Coin Balance, Team OVR & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/40 text-[10px] font-mono-tabular font-black uppercase tracking-widest">
                FC 26 ULTIMATE DRAFT & 10X PACK DRAW
              </span>
              <span className="text-xs text-slate-300 font-mono-tabular">
                Match Victory = <strong className="text-amber-300">+10,000 Coins 🪙</strong> · Lesser OVR = <strong className="text-cyan-300">5,000 🪙</strong> · 120 OVR Icons = <strong className="text-amber-300">35k–50k 🪙</strong>
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-wide text-white mt-1">
              Player Draft, 10x Multi-Draw & Direct Transfer Scout
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Coins Balance Pill */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500/25 via-yellow-500/15 to-amber-500/10 border-2 border-amber-400/60 shadow-lg shadow-amber-500/10">
              <span className="text-lg">🪙</span>
              <div>
                <div className="text-[9px] font-mono-tabular uppercase tracking-widest text-amber-300 font-bold leading-none">
                  CLUB COINS
                </div>
                <div className="font-mono-tabular text-lg font-black text-white leading-tight">
                  {(profile.coins || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Live Squad OVR */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#111827] border border-cyan-400/40">
              <div className="font-display text-2xl font-black text-cyan-300 leading-none">
                {teamOvr.formatted}
              </div>
              <div className="text-[9px] font-mono-tabular uppercase text-slate-300 leading-tight">
                SQUAD
                <br />
                OVR
              </div>
            </div>

            {/* Quick Earn +10,000 Coins Match Win Simulator */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playWhistle('goal');
                const res = ProgressionService.recordMatchResult(3, 0);
                onUpdateProfile(res.profile);
                setStatusBanner({
                  text: '🏆 Match Win Reward Claimed: +10,000 Coins, +130 XP & +0.20 Squad OVR!',
                  type: 'success',
                });
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 font-mono-tabular font-bold text-xs transition-all cursor-pointer"
            >
              + Win Match (+10,000 🪙)
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUIClick();
                onOpenTeamManagement();
              }}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer"
            >
              📋 Lineup ({profile.activeFormation})
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUIClick();
                onClose();
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
            >
              ✕ Back to Menu
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusBanner && (
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-300'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* SECTION 1: 10x MULTI-DRAFT (GUARANTEED AT LEAST 1 GOOD PLAYER!) */}
        <div className="rounded-3xl bg-gradient-to-r from-[#131B2E] via-[#19132B] to-[#1A140B] border-2 border-[#CCFF00]/60 p-4 sm:p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#CCFF00] text-slate-950 text-[10px] font-mono-tabular font-black uppercase tracking-wider">
                🔥 10x MULTI-DRAFT PITY GUARANTEE
              </span>
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                Draft 10 Players At Once — Guaranteed At Least 1 Good / Elite Player (90–120 OVR)!
              </span>
            </div>
            <span className="text-[11px] font-mono-tabular text-amber-300 font-bold">
              High OVR = Fast Sprint & Rocket Shot · Low OVR = Very Slow & Weak Shot
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 10x Pro Multi-Draft (10,000 Coins = 1 Match Win!) */}
            <div className="rounded-2xl bg-[#0B1220]/95 border border-[#CCFF00]/50 p-4 flex flex-col justify-between gap-3 shadow-lg">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-[#CCFF00]/20 text-[#CCFF00] text-[10px] font-mono-tabular font-black uppercase">
                    10 PLAYERS AT ONCE · GUARANTEED 90+ STAR
                  </span>
                  <span className="text-sm font-mono-tabular font-black text-amber-300">
                    🪙 10,000 COINS
                  </span>
                </div>
                <h3 className="font-display text-2xl font-black uppercase text-white mt-1.5">
                  10x Pro Multi-Draft Bundle
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Costs just <strong className="text-amber-300">1 Match Win (10,000 Coins)</strong>! Draws <strong>10 Players at once</strong> and guarantees <strong className="text-[#CCFF00]">at least 1 Elite Good Player (90–120 OVR)</strong> with blazing speed & powerful shooting!
                </p>
              </div>
              <button
                type="button"
                disabled={isOpeningPack}
                onClick={() => handleOpenTenPack('PRO_10X_10K')}
                className="w-full py-3 rounded-xl bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 font-display font-black text-sm uppercase tracking-wider shadow-lg shadow-[#CCFF00]/20 cursor-pointer disabled:opacity-50"
              >
                {isOpeningPack ? 'Drafting 10 Players...' : '⚡ Draft 10 Players at Once · 10,000 🪙'}
              </button>
            </div>

            {/* 10x Mythic Icon Multi-Draft (45,000 Coins) */}
            <div className="rounded-2xl bg-gradient-to-br from-amber-950/70 via-[#15100B] to-slate-950 border-2 border-amber-400/80 p-4 flex flex-col justify-between gap-3 shadow-xl">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-mono-tabular font-black uppercase">
                    👑 10 PLAYERS · GUARANTEED 120 OVR ICON
                  </span>
                  <span className="text-sm font-mono-tabular font-black text-amber-300">
                    🪙 45,000 COINS
                  </span>
                </div>
                <h3 className="font-display text-2xl font-black uppercase text-amber-300 mt-1.5">
                  10x Mythic 120 OVR Icon Draft
                </h3>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  Draws <strong>10 Players at once</strong> with <strong className="text-amber-300">at least 1 Guaranteed 120 OVR Mythic Icon</strong> (Messi 120, CR7 120, R9 120, Pelé 120) + 2 Guaranteed 90+ OVR Superstars!
                </p>
              </div>
              <button
                type="button"
                disabled={isOpeningPack}
                onClick={() => handleOpenTenPack('MYTHIC_10X_45K')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-display font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 cursor-pointer disabled:opacity-50"
              >
                {isOpeningPack ? 'Summoning 10 Icons...' : '👑 Draft 10x Mythic Pack · 45,000 🪙'}
              </button>
            </div>
          </div>
        </div>

        {/* 10-PLAYER WALKOUT REVEAL MODAL GRID */}
        {tenPackResults && (
          <div className="p-5 rounded-3xl bg-gradient-to-b from-amber-500/15 via-[#0E1526] to-[#090D16] border-2 border-amber-400 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-black">
                  🎉 10x MULTI-DRAFT WALKOUT REVEAL · GUARANTEED GOOD PLAYER INCLUDED
                </div>
                <h3 className="font-display text-2xl font-black uppercase text-white">
                  Your 10 Drawn Players
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoEquipBestFromTenPack}
                  className="px-4 py-2 rounded-xl bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                >
                  ⚡ Auto-Put Best Drawn Stars in Starting 7
                </button>
                <button
                  type="button"
                  onClick={() => setTenPackResults(null)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {tenPackResults.map((item, idx) => {
                const p = item.player;
                const isMythic = p.baseOvr >= 118;
                const isGood = p.baseOvr >= 90;
                const isStarter = profile.starterPlayerIds.includes(p.id);
                return (
                  <div
                    key={`${p.id}-${idx}`}
                    className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 ${
                      isMythic
                        ? 'bg-gradient-to-b from-amber-500/30 via-[#1B1408] to-slate-950 border-2 border-amber-300 shadow-lg shadow-amber-500/20'
                        : isGood
                        ? 'bg-gradient-to-b from-emerald-500/20 via-[#0E1B24] to-slate-950 border-2 border-emerald-400'
                        : 'bg-[#0C1220] border-white/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-black uppercase ${
                            isMythic
                              ? 'bg-amber-300 text-slate-950'
                              : isGood
                              ? 'bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.isGuaranteedHighlight
                            ? '★ GUARANTEED HIT'
                            : isMythic
                            ? '👑 120 ICON'
                            : isGood
                            ? '🔥 ELITE STAR'
                            : 'CLUB PLAYER'}
                        </span>
                        <span className="text-[10px] font-mono-tabular text-slate-400">
                          {p.primaryRole}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-lg text-white shrink-0 border border-white/20"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.baseOvr}
                        </div>
                        <div className="min-w-0">
                          <div className="font-display font-black text-sm text-white truncate uppercase">
                            {p.shortName}
                          </div>
                          <div className="text-[10px] font-mono-tabular text-slate-300">
                            PAC {p.pace} · SHO {p.shooting}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSlotIntoStarting7(p)}
                      className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                        isStarter
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                          : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                      }`}
                    >
                      {isStarter ? '✓ In Starting 7' : '⚡ Put in Starting 7'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 2: SINGLE PACK DRAW CARDS */}
        <div>
          <div className="text-xs font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold mb-2.5">
            2. SINGLE PACK DRAW — 5,000 COINS VALUE PACKS UP TO 120 OVR ICONS
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pack 1: 5,000 Coins Standard Scout Pack */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-[#0E1729] to-slate-950 border border-cyan-400/40 p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono-tabular font-bold uppercase">
                    LESSER OVR SCOUT PACK
                  </span>
                  <span className="text-xs font-mono-tabular font-black text-amber-300">
                    🪙 5,000 COINS
                  </span>
                </div>
                <h3 className="font-display text-xl font-black uppercase text-white mt-2">
                  1x Value Player Draw (5,000 🪙)
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Low-cost 5,000 Coin draw! Primarily draws 72–89 OVR squad players with a 12% lucky chance at a 90+ OVR Superstar!
                </p>
              </div>

              <button
                type="button"
                disabled={isOpeningPack}
                onClick={() => handleOpenPack('STANDARD_5K')}
                className="mt-3 w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isOpeningPack ? 'Drawing Player...' : 'Draw 1x Pack · 5,000 🪙'}
              </button>
            </div>

            {/* Pack 2: 15,000 Coins World Class Pack */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-950/90 via-[#0F172A] to-slate-950 border border-indigo-400/50 p-4 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono-tabular font-bold uppercase">
                    WORLD CLASS PACK
                  </span>
                  <span className="text-xs font-mono-tabular font-black text-amber-300">
                    🪙 15,000 COINS
                  </span>
                </div>
                <h3 className="font-display text-xl font-black uppercase text-white mt-2">
                  90–95 OVR + Icon Chance
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Draws fast, powerful World Class stars (Haaland 95, Yamal 94, De Bruyne 94) with a 25% chance at a 120 OVR Mythic Icon!
                </p>
              </div>

              <button
                type="button"
                disabled={isOpeningPack}
                onClick={() => handleOpenPack('WORLD_CLASS_15K')}
                className="mt-3 w-full py-2.5 rounded-xl bg-indigo-400 hover:bg-indigo-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isOpeningPack ? 'Drawing Player...' : 'Draw 1x Pack · 15,000 🪙'}
              </button>
            </div>

            {/* Pack 3: 35,000 Coins Guaranteed 120 OVR Mythic Icon Pack */}
            <div className="rounded-2xl bg-gradient-to-br from-amber-950/80 via-[#18120B] to-slate-950 border-2 border-amber-400/80 p-4 flex flex-col justify-between shadow-2xl shadow-amber-500/10">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-mono-tabular font-black uppercase">
                    👑 GUARANTEED 120 OVR ICON
                  </span>
                  <span className="text-xs font-mono-tabular font-black text-amber-300">
                    🪙 35,000 COINS
                  </span>
                </div>
                <h3 className="font-display text-xl font-black uppercase text-amber-300 mt-2">
                  120 OVR Mythic Icon Pack
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Guaranteed 120 OVR Legend with 120 Speed & 120 Shot Power! Draw Prime Messi, CR7, Ronaldo R9, Pelé, Zidane, or Ronaldinho!
                </p>
              </div>

              <button
                type="button"
                disabled={isOpeningPack}
                onClick={() => handleOpenPack('MYTHIC_120_35K')}
                className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 cursor-pointer disabled:opacity-50"
              >
                {isOpeningPack ? 'Summoning Icon...' : 'Draw 120 Icon · 35,000 🪙'}
              </button>
            </div>
          </div>
        </div>

        {/* WALKOUT REVEAL BANNER WHEN A SINGLE PLAYER IS DRAWN */}
        {packRevealPlayer && (
          <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/20 via-[#111827] to-cyan-500/20 border-2 border-amber-400 shadow-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-display font-black text-white border-2 border-amber-300 shadow-xl"
                style={{ backgroundColor: packRevealPlayer.avatarColor }}
              >
                <span className="text-2xl leading-none">{packRevealPlayer.baseOvr}</span>
                <span className="text-[10px] uppercase">{packRevealPlayer.primaryRole}</span>
              </div>
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-amber-300 font-bold">
                  {packIsNewUnlock
                    ? '🎉 NEW PLAYER DRAFTED TO YOUR CLUB!'
                    : '⚡ DUPLICATE TRAINING BOOST (+40 XP & +0.10 OVR)!'}
                </div>
                <div className="font-display text-2xl sm:text-3xl font-black text-white uppercase">
                  {packRevealPlayer.name} #{packRevealPlayer.number}
                </div>
                <div className="text-xs font-mono-tabular text-slate-300 mt-0.5">
                  SPEED (PAC) <strong className="text-[#CCFF00]">{packRevealPlayer.pace}</strong> · SHOT POWER (SHO){' '}
                  <strong className="text-amber-300">{packRevealPlayer.shooting}</strong> · PAS{' '}
                  {packRevealPlayer.passing} · DRI {packRevealPlayer.dribbling}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSlotIntoStarting7(packRevealPlayer)}
                className="px-4 py-2.5 rounded-xl bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg"
              >
                ⚡ Put in Starting 7 Now
              </button>
              <button
                type="button"
                onClick={() => setPackRevealPlayer(null)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
              >
                Keep in Club
              </button>
            </div>
          </div>
        )}

        {/* SECTION 3: DIRECT PLAYER SCOUT & DRAFT CATALOG */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono-tabular uppercase tracking-widest text-cyan-400 font-bold">
              3. DIRECT PLAYER DRAFT — BUY ANY SPECIFIC PLAYER WITH COINS
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Players' },
                  { id: 'MYTHIC_120', label: '👑 120 OVR Icons (35k–50k 🪙)' },
                  { id: 'SUPERSTAR_90', label: '⭐ 90–95 Superstars (15k 🪙)' },
                  { id: 'VALUE_5K', label: '🪙 5,000 Coins Value Players' },
                  { id: 'LOW_OVR', label: '🐢 72–82 OVR Starter Tier (5k 🪙)' },
                  { id: 'FWD', label: 'Forwards (FWD)' },
                  { id: 'MID', label: 'Midfielders (MID)' },
                  { id: 'DEF', label: 'Defenders (DEF)' },
                  { id: 'GK', label: 'Goalkeepers (GK)' },
                ] as Array<{ id: FilterCategory; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUIClick();
                    setActiveFilter(tab.id);
                  }}
                  className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-[#CCFF00] text-slate-950 font-black'
                      : 'bg-slate-800/90 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Player Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPlayers.map((player) => {
              const isUnlocked = ProgressionService.isPlayerUnlocked(player.id, profile);
              const isStarter = profile.starterPlayerIds.includes(player.id);
              const price = ProgressionService.getPlayerPrice(player);
              const isMythic = player.baseOvr >= 118;
              const canAfford = (profile.coins || 0) >= price;
              const perfBadge = getSpeedAndShotLabel(player);

              return (
                <div
                  key={player.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all ${
                    isMythic
                      ? 'bg-gradient-to-br from-amber-950/45 via-[#0E1525] to-slate-950 border-amber-400/60 shadow-lg shadow-amber-500/5'
                      : isStarter
                      ? 'bg-[#0E192D] border-emerald-400/50'
                      : 'bg-[#0D1322] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* OVR & Role Shield */}
                      <div
                        className={`w-13 h-14 rounded-2xl flex flex-col items-center justify-center font-display border shrink-0 shadow-md ${
                          isMythic
                            ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-white'
                            : player.baseOvr <= 82
                            ? 'bg-slate-800 text-slate-300 border-white/10'
                            : 'bg-slate-900 text-amber-300 border-white/15'
                        }`}
                      >
                        <span className="text-xl font-black leading-none">{player.baseOvr}</span>
                        <span className="text-[9px] font-black uppercase mt-0.5">
                          {player.primaryRole}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-black text-base text-white uppercase">
                            {player.name}
                          </span>
                          <span className="text-xs font-mono-tabular text-slate-400">
                            #{player.number}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span>{player.nationality}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[9px] font-mono-tabular font-bold ${perfBadge.cls}`}
                          >
                            {perfBadge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Price or Owned Badge */}
                    {isStarter ? (
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-mono-tabular font-black">
                        STARTING 7
                      </span>
                    ) : isUnlocked ? (
                      <span className="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-mono-tabular font-black">
                        OWNED
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-400/15 text-amber-300 border border-amber-400/40 text-xs font-mono-tabular font-black">
                        🪙 {price.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* 6-Attribute Mini Readout with highlighted Speed & Shot */}
                  <div className="grid grid-cols-6 gap-1 text-center font-mono-tabular bg-black/35 rounded-xl p-2 border border-white/5">
                    <div className="rounded bg-white/5 py-0.5">
                      <div className="text-[9px] text-[#CCFF00] font-bold">PAC</div>
                      <div className="text-xs font-black text-white">{player.pace}</div>
                    </div>
                    <div className="rounded bg-white/5 py-0.5">
                      <div className="text-[9px] text-amber-300 font-bold">SHO</div>
                      <div className="text-xs font-black text-white">{player.shooting}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">PAS</div>
                      <div className="text-xs font-bold text-white">{player.passing}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">DRI</div>
                      <div className="text-xs font-bold text-white">{player.dribbling}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">DEF</div>
                      <div className="text-xs font-bold text-white">{player.defending}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">PHY</div>
                      <div className="text-xs font-bold text-white">{player.physical}</div>
                    </div>
                  </div>

                  {/* Action CTA */}
                  {isStarter ? (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUIClick();
                        onOpenTeamManagement();
                      }}
                      className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      ✓ In Starting Lineup · Manage Roles
                    </button>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => handleSlotIntoStarting7(player)}
                      className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer shadow-md"
                    >
                      ⚡ Put in Starting 7 Lineup
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDraftDirectPlayer(player)}
                      className={`w-full py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                        canAfford
                          ? isMythic
                            ? 'bg-gradient-to-r from-amber-300 to-amber-500 hover:brightness-110 text-slate-950 shadow-lg'
                            : 'bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 shadow-md'
                          : 'bg-slate-800 text-slate-400 border border-white/10'
                      }`}
                    >
                      {canAfford
                        ? `Draft Player · ${price.toLocaleString()} 🪙`
                        : `Need ${price.toLocaleString()} 🪙 (Win Matches)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

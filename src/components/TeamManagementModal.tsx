import React, { useState } from 'react';
import { FormationId } from '../types/game';
import {
  INITIAL_SQUAD_DATABASE,
  PitchPositionSlot,
  PlayerRole,
  SquadPlayer,
  UserCareerProfile,
} from '../types/progression';
import { ProgressionService } from '../services/progressionService';
import { soundEngine } from '../audio/soundEngine';

interface TeamManagementModalProps {
  profile: UserCareerProfile;
  onSaveLineup: (starterIds: string[], formation: FormationId) => void;
  onOpenPlayerDraft?: () => void;
  onClose: () => void;
}

// Tactical 7-player positions for each formation on a 100x100 pitch board
const FORMATION_SLOT_LAYOUTS: Record<FormationId, PitchPositionSlot[]> = {
  '4-3-3 Attack': [
    { slotIndex: 0, role: 'GK', label: 'Goalkeeper (GK)', defaultPlayerId: 'courtois', gridX: 12, gridY: 50 },
    { slotIndex: 1, role: 'DEF', label: 'Left Back (LB)', defaultPlayerId: 'carvajal', gridX: 32, gridY: 24 },
    { slotIndex: 2, role: 'DEF', label: 'Center Back (CB)', defaultPlayerId: 'rudiger', gridX: 32, gridY: 76 },
    { slotIndex: 3, role: 'MID', label: 'Center Mid (CM)', defaultPlayerId: 'valverde', gridX: 54, gridY: 50 },
    { slotIndex: 4, role: 'MID', label: 'Attacking Mid (CAM)', defaultPlayerId: 'bellingham', gridX: 68, gridY: 30 },
    { slotIndex: 5, role: 'FWD', label: 'Left Winger (LW)', defaultPlayerId: 'vinicius', gridX: 84, gridY: 18 },
    { slotIndex: 6, role: 'FWD', label: 'Striker (ST)', defaultPlayerId: 'mbappe', gridX: 88, gridY: 66 },
  ],
  '4-2-3-1 Control': [
    { slotIndex: 0, role: 'GK', label: 'Goalkeeper (GK)', defaultPlayerId: 'courtois', gridX: 12, gridY: 50 },
    { slotIndex: 1, role: 'DEF', label: 'Full Back (LB)', defaultPlayerId: 'carvajal', gridX: 30, gridY: 28 },
    { slotIndex: 2, role: 'DEF', label: 'Center Back (CB)', defaultPlayerId: 'rudiger', gridX: 30, gridY: 72 },
    { slotIndex: 3, role: 'MID', label: 'Defensive Mid (CDM)', defaultPlayerId: 'valverde', gridX: 50, gridY: 50 },
    { slotIndex: 4, role: 'MID', label: 'Playmaker (CAM)', defaultPlayerId: 'bellingham', gridX: 68, gridY: 50 },
    { slotIndex: 5, role: 'FWD', label: 'Wide Forward (LW)', defaultPlayerId: 'vinicius', gridX: 74, gridY: 20 },
    { slotIndex: 6, role: 'FWD', label: 'Target Striker (ST)', defaultPlayerId: 'mbappe', gridX: 88, gridY: 50 },
  ],
  '4-4-2 Classic': [
    { slotIndex: 0, role: 'GK', label: 'Goalkeeper (GK)', defaultPlayerId: 'courtois', gridX: 12, gridY: 50 },
    { slotIndex: 1, role: 'DEF', label: 'Left Defender (LB)', defaultPlayerId: 'carvajal', gridX: 30, gridY: 26 },
    { slotIndex: 2, role: 'DEF', label: 'Right Defender (RB)', defaultPlayerId: 'rudiger', gridX: 30, gridY: 74 },
    { slotIndex: 3, role: 'MID', label: 'Left Mid (LM)', defaultPlayerId: 'valverde', gridX: 55, gridY: 26 },
    { slotIndex: 4, role: 'MID', label: 'Right Mid (RM)', defaultPlayerId: 'bellingham', gridX: 55, gridY: 74 },
    { slotIndex: 5, role: 'FWD', label: 'Second Striker (CF)', defaultPlayerId: 'vinicius', gridX: 84, gridY: 34 },
    { slotIndex: 6, role: 'FWD', label: 'Number 9 Striker (ST)', defaultPlayerId: 'mbappe', gridX: 84, gridY: 66 },
  ],
  '3-5-2 Wingplay': [
    { slotIndex: 0, role: 'GK', label: 'Goalkeeper (GK)', defaultPlayerId: 'courtois', gridX: 12, gridY: 50 },
    { slotIndex: 1, role: 'DEF', label: 'Central Sweeper (CB)', defaultPlayerId: 'rudiger', gridX: 30, gridY: 50 },
    { slotIndex: 2, role: 'DEF', label: 'Right Stopper (CB)', defaultPlayerId: 'carvajal', gridX: 30, gridY: 80 },
    { slotIndex: 3, role: 'MID', label: 'Holding Mid (CDM)', defaultPlayerId: 'valverde', gridX: 50, gridY: 50 },
    { slotIndex: 4, role: 'MID', label: 'Central Creator (CAM)', defaultPlayerId: 'bellingham', gridX: 68, gridY: 50 },
    { slotIndex: 5, role: 'FWD', label: 'Wing Striker (LW)', defaultPlayerId: 'vinicius', gridX: 82, gridY: 28 },
    { slotIndex: 6, role: 'FWD', label: 'Clinical Striker (ST)', defaultPlayerId: 'mbappe', gridX: 84, gridY: 72 },
  ],
  '5-3-2 Counter': [
    { slotIndex: 0, role: 'GK', label: 'Goalkeeper (GK)', defaultPlayerId: 'courtois', gridX: 12, gridY: 50 },
    { slotIndex: 1, role: 'DEF', label: 'Wingback (LWB)', defaultPlayerId: 'carvajal', gridX: 28, gridY: 18 },
    { slotIndex: 2, role: 'DEF', label: 'Solid Anchor (CB)', defaultPlayerId: 'rudiger', gridX: 28, gridY: 50 },
    { slotIndex: 3, role: 'MID', label: 'Box-to-Box (CM)', defaultPlayerId: 'valverde', gridX: 52, gridY: 38 },
    { slotIndex: 4, role: 'MID', label: 'Counter Engine (CM)', defaultPlayerId: 'bellingham', gridX: 52, gridY: 62 },
    { slotIndex: 5, role: 'FWD', label: 'Breakaway Winger (CF)', defaultPlayerId: 'vinicius', gridX: 82, gridY: 34 },
    { slotIndex: 6, role: 'FWD', label: 'Lead Marksman (ST)', defaultPlayerId: 'mbappe', gridX: 84, gridY: 66 },
  ],
};

const FORMATIONS: FormationId[] = [
  '4-3-3 Attack',
  '4-2-3-1 Control',
  '4-4-2 Classic',
  '3-5-2 Wingplay',
  '5-3-2 Counter',
];

export const TeamManagementModal: React.FC<TeamManagementModalProps> = ({
  profile,
  onSaveLineup,
  onOpenPlayerDraft,
  onClose,
}) => {
  const [selectedFormation, setSelectedFormation] = useState<FormationId>(profile.activeFormation);
  const [starterIds, setStarterIds] = useState<string[]>([...profile.starterPlayerIds]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<'ALL' | PlayerRole>('ALL');

  const currentLayout = FORMATION_SLOT_LAYOUTS[selectedFormation] || FORMATION_SLOT_LAYOUTS['4-3-3 Attack'];

  // Calculate live team OVR with current changes
  const activeStarters = starterIds
    .map((id) => ProgressionService.getPlayerById(id))
    .filter((p): p is SquadPlayer => Boolean(p));

  const avgBase = activeStarters.length > 0
    ? activeStarters.reduce((acc, p) => acc + p.baseOvr, 0) / activeStarters.length
    : 85.0;

  const liveTeamOvr = (avgBase + profile.ovrBonus).toFixed(1);

  // Check role compatibility for a player in a given slot
  const getRoleMatchStatus = (player: SquadPlayer, targetRole: PlayerRole) => {
    if (player.primaryRole === targetRole) {
      return { match: 'PERFECT', label: '100% Role Match', color: '#22C55E' };
    }
    if (player.secondaryRoles.includes(targetRole)) {
      return { match: 'COMPATIBLE', label: 'Secondary Role', color: '#FACC15' };
    }
    return { match: 'OUT_OF_POSITION', label: 'Out of Position', color: '#EF4444' };
  };

  const handleSelectSlot = (idx: number) => {
    soundEngine.playUIClick();
    setSelectedSlotIndex(idx);
    const slot = currentLayout.find((s) => s.slotIndex === idx);
    if (slot) {
      setRoleFilter(slot.role);
    }
  };

  const handleAssignPlayerToSlot = (playerId: string) => {
    const isUnlocked = ProgressionService.isPlayerUnlocked(playerId, profile);
    if (!isUnlocked) {
      if (onOpenPlayerDraft) {
        soundEngine.playUIClick();
        onSaveLineup(starterIds, selectedFormation);
        onOpenPlayerDraft();
      }
      return;
    }
    const targetSlot = selectedSlotIndex !== null ? selectedSlotIndex : 6;
    soundEngine.playUIClick();

    setStarterIds((prev) => {
      const next = [...prev];
      const existingSlotIdx = next.indexOf(playerId);
      if (existingSlotIdx !== -1) {
        next[existingSlotIdx] = next[targetSlot];
      }
      next[targetSlot] = playerId;
      return next;
    });

    setSelectedSlotIndex(null);
  };

  const handleSaveAndApply = () => {
    soundEngine.playUIClick();
    onSaveLineup(starterIds, selectedFormation);
    onClose();
  };

  const selectedSlot = selectedSlotIndex !== null
    ? currentLayout.find((s) => s.slotIndex === selectedSlotIndex)
    : null;

  const allPlayers = ProgressionService.getAllSquadPlayers().sort((a, b) => {
    const aUnl = ProgressionService.isPlayerUnlocked(a.id, profile) ? 1 : 0;
    const bUnl = ProgressionService.isPlayerUnlocked(b.id, profile) ? 1 : 0;
    if (aUnl !== bUnl) return bUnl - aUnl;
    return b.baseOvr - a.baseOvr;
  });
  const filteredPlayers = allPlayers.filter((p) => {
    if (roleFilter === 'ALL') return true;
    return p.primaryRole === roleFilter || p.secondaryRoles.includes(roleFilter);
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-[#05080F]/90 backdrop-blur-xl select-none overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-[#090D16] border border-white/15 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col gap-4 overflow-hidden">
        {/* Top Header: Title, Level, Live OVR & Save Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-bold">
                FC 26 TACTICAL WORKSHOP
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                {profile.rankTitle} · Lv.{profile.level}
              </span>
            </div>
            <h2 className="font-display text-2xl font-black uppercase tracking-wide text-white mt-0.5">
              Team Management & Roles
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenPlayerDraft && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUIClick();
                  onSaveLineup(starterIds, selectedFormation);
                  onOpenPlayerDraft();
                }}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md cursor-pointer"
              >
                🪙 Draft Players ({(profile.coins || 0).toLocaleString()} Coins)
              </button>
            )}

            {/* Live Squad OVR Display */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-400/10 border border-amber-400/30">
              <span className="text-[10px] font-bold text-amber-400 uppercase">SQUAD OVR:</span>
              <span className="font-display text-2xl font-black text-amber-300">{liveTeamOvr}</span>
              <span className="text-[9px] text-slate-400 font-mono-tabular">
                (+{profile.ovrBonus.toFixed(1)} Win Boost)
              </span>
            </div>

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              Save Lineup ✔
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Formation Switcher Bar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-400 uppercase mr-1">Formation:</span>
          {FORMATIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                soundEngine.playUIClick();
                setSelectedFormation(f);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedFormation === f
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 scale-105'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-white/10'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Main Body: Interactive 2D Pitch on Left, Squad Roster Drawer on Right */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
          {/* LEFT: 2D Interactive Pitch (7 cols) */}
          <div className="lg:col-span-7 relative rounded-2xl bg-gradient-to-b from-[#0F3818] via-[#0D2F14] to-[#0A2610] border-2 border-emerald-500/40 p-4 shadow-inner flex flex-col justify-between overflow-hidden min-h-[380px]">
            {/* Pitch Markings (Center circle, penalty box, stripes) */}
            <div className="absolute inset-0 opacity-15 pointer-events-none flex">
              <div className="w-1/4 h-full border-r border-white/30" />
              <div className="w-1/4 h-full border-r border-white/30" />
              <div className="w-1/4 h-full border-r border-white/30" />
              <div className="w-1/4 h-full" />
            </div>
            {/* Center Circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-white/20 pointer-events-none" />
            {/* Penalty Box on Right */}
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-28 h-56 border-l border-t border-b border-white/25 pointer-events-none" />
            {/* Goal Area on Left */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-16 h-40 border-r border-t border-b border-white/25 pointer-events-none" />

            {/* Top Pitch Guidance */}
            <div className="relative z-10 flex items-center justify-between text-[11px] text-emerald-300 font-mono-tabular">
              <span>DEFENSE ➔</span>
              <span>ATTACKING GOAL ⚽</span>
            </div>

            {/* Position Slots on the Pitch */}
            <div className="relative w-full h-[320px] sm:h-[360px]">
              {currentLayout.map((slot) => {
                const assignedPlayerId = starterIds[slot.slotIndex];
                const player = ProgressionService.getPlayerById(assignedPlayerId);
                const isSelected = selectedSlotIndex === slot.slotIndex;
                const roleMatch = player ? getRoleMatchStatus(player, slot.role) : null;

                return (
                  <div
                    key={slot.slotIndex}
                    onClick={() => handleSelectSlot(slot.slotIndex)}
                    style={{
                      left: `${slot.gridX}%`,
                      top: `${slot.gridY}%`,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-transform duration-200 ${
                      isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                    }`}
                  >
                    {/* Position Role Badge above card */}
                    <div
                      className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider mb-1 shadow-md border"
                      style={{
                        backgroundColor: isSelected ? '#38BDF8' : '#0F172A',
                        color: isSelected ? '#020617' : '#E2E8F0',
                        borderColor: isSelected ? '#38BDF8' : 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {slot.role}
                    </div>

                    {/* Compact Player Card */}
                    <div
                      className={`w-20 sm:w-24 p-1.5 rounded-xl flex flex-col items-center text-center shadow-xl transition-all border ${
                        isSelected
                          ? 'bg-slate-900 border-cyan-400 ring-2 ring-cyan-400/50'
                          : 'bg-slate-900/90 border-white/20 hover:border-white/50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full px-1">
                        <span className="text-[10px] font-bold text-amber-400 font-mono-tabular">
                          {player ? player.baseOvr : '--'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold">
                          #{player ? player.number : slot.slotIndex + 1}
                        </span>
                      </div>

                      {/* Player Avatar Circle */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white my-0.5 shadow-inner"
                        style={{ backgroundColor: player?.avatarColor || '#334155' }}
                      >
                        {player?.shortName.charAt(0) || '?'}
                      </div>

                      <div className="text-[10px] font-black text-white truncate max-w-full">
                        {player?.shortName || 'Empty'}
                      </div>

                      {/* Chemistry / Role indicator dot */}
                      {roleMatch && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: roleMatch.color }}
                          />
                          <span
                            className="text-[8px] font-bold truncate"
                            style={{ color: roleMatch.color }}
                          >
                            {roleMatch.match === 'PERFECT' ? '100%' : 'Role fit'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Pitch Status */}
            <div className="relative z-10 text-[10px] text-emerald-400/80 font-mono-tabular">
              Tap any slot above to swap players based on their roles.
            </div>
          </div>

          {/* RIGHT: Squad Players List & Swap Drawer (5 cols) */}
          <div className="lg:col-span-5 bg-[#0B111E] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Drawer Header & Role Filter Tabs */}
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-white tracking-wide">
                  {selectedSlot ? `Assign to ${selectedSlot.label}` : 'Club Squad Roster'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono-tabular">
                  {filteredPlayers.length} Players
                </span>
              </div>

              {/* Role Filter Chips */}
              <div className="flex items-center gap-1 mt-2">
                {(['ALL', 'FWD', 'MID', 'DEF', 'GK'] as Array<'ALL' | PlayerRole>).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      soundEngine.playUIClick();
                      setRoleFilter(role);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors cursor-pointer ${
                      roleFilter === role
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Player Card List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredPlayers.map((p) => {
                const isStarter = starterIds.includes(p.id);
                const isUnlocked = ProgressionService.isPlayerUnlocked(p.id, profile);
                const price = ProgressionService.getPlayerPrice(p);
                const roleFit = selectedSlot ? getRoleMatchStatus(p, selectedSlot.role) : null;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleAssignPlayerToSlot(p.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isStarter
                        ? 'bg-slate-900/80 border-emerald-500/40 hover:border-emerald-400'
                        : isUnlocked
                        ? 'bg-[#111827] border-white/10 hover:border-cyan-400 hover:bg-slate-800'
                        : 'bg-[#0C101B] border-amber-500/20 hover:border-amber-400/60 opacity-85'
                    }`}
                  >
                    {/* Left: OVR Rating & Avatar */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 flex flex-col items-center justify-center font-mono-tabular shrink-0">
                        <span className="font-display font-black text-sm text-amber-300 leading-none">
                          {p.baseOvr}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-0.5">
                          {p.primaryRole}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-bold">#{p.number}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{p.nationality}</span>
                          {roleFit && (
                            <span
                              className="font-bold text-[9px] px-1 rounded"
                              style={{
                                color: roleFit.color,
                                backgroundColor: `${roleFit.color}15`,
                              }}
                            >
                              {roleFit.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Stat Chips & Starter Badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5 text-[9px] font-mono-tabular text-slate-300">
                        <span className="text-[#CCFF00]">⚡{p.pace}</span>
                        <span className="text-amber-300">💥{p.shooting}</span>
                      </div>

                      {isStarter ? (
                        <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30">
                          STARTING
                        </span>
                      ) : isUnlocked ? (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-black uppercase"
                        >
                          {selectedSlot ? 'SWAP IN' : 'EQUIP'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 text-[10px] font-mono-tabular font-black uppercase"
                        >
                          🪙 {price.toLocaleString()}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

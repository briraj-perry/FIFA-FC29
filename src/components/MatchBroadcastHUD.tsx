import React, { useEffect, useState } from 'react';
import {
  AICoachInsight,
  AITacticalConfig,
  BOOT_CATALOG,
  BootModelId,
  CameraAngleId,
  FormationId,
  GameMode,
  GraphicsSettings,
  MatchStats,
  MentalityId,
  OnlineSessionState,
  PlayerEquipmentLoadout,
  resolveAwayKitPalette,
  SKILL_MOVES_CATALOG,
  SkillMoveId,
  STADIUM_CATALOG,
  StadiumId,
  TouchControllerInput,
  WeatherLightingId,
} from '../types/game';
import { TacticalOverrideCommand } from '../three/FootballCanvas';
import { IPadTouchController } from './IPadTouchController';
import { CornerKickDrawOverlay } from './CornerKickDrawOverlay';
import { soundEngine } from '../audio/soundEngine';

interface MatchBroadcastHUDProps {
  stats: MatchStats;
  gameMode: GameMode;
  onToggleGameMode: (mode: GameMode) => void;
  equipment: PlayerEquipmentLoadout;
  onChangeEquipment: (next: PlayerEquipmentLoadout) => void;
  graphics: GraphicsSettings;
  onChangeGraphics: (next: GraphicsSettings) => void;
  aiTactics: AITacticalConfig;
  onChangeAiTactics: (next: AITacticalConfig) => void;
  onTriggerTacticalCommand: (cmd: TacticalOverrideCommand) => void;
  onOpenCustomizer: () => void;
  onOpenOnlineLobby: () => void;
  onOpenPauseModal: () => void;
  goalBanner: { scorerName: string; team: 'HOME' | 'AWAY' } | null;
  onSkipReplay: () => void;
  onPracticeCornerKick?: () => void;
  muted: boolean;
  onToggleMute: () => void;
  touchInputRef: React.MutableRefObject<TouchControllerInput>;
  onlineState: OnlineSessionState;
}

type DockTab = 'AI_DIRECTOR' | 'SKILL_MOVES' | 'STADIUM_GRAPHICS' | 'QUICK_GEAR';

export const MatchBroadcastHUD: React.FC<MatchBroadcastHUDProps> = ({
  stats,
  gameMode,
  onToggleGameMode,
  equipment,
  onChangeEquipment,
  graphics,
  onChangeGraphics,
  aiTactics,
  onChangeAiTactics,
  onTriggerTacticalCommand,
  onOpenCustomizer,
  onOpenOnlineLobby,
  onOpenPauseModal,
  goalBanner,
  onSkipReplay,
  onPracticeCornerKick,
  muted,
  onToggleMute,
  touchInputRef,
  onlineState,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(graphics.ipadControls);
  const [activeTab, setActiveTab] = useState<DockTab>('AI_DIRECTOR');
  const [aiInsight, setAiInsight] = useState<AICoachInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (graphics.ipadControls) {
      setDockCollapsed(true);
    }
  }, [graphics.ipadControls]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && document.activeElement?.tagName !== 'INPUT') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalPoss = Math.max(1, stats.homePossessionFrames + stats.awayPossessionFrames);
  const homePossPct = Math.round((stats.homePossessionFrames / totalPoss) * 100);
  const minutes = Math.floor(stats.matchClockSeconds);
  const seconds = Math.floor((stats.matchClockSeconds - minutes) * 60);
  const clockFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const currentStadiumSpec = STADIUM_CATALOG[graphics.stadium];

  const requestGeminiTacticalAnalysis = async () => {
    soundEngine.playUIClick();
    setIsLoadingInsight(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai-tactics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeScore: stats.homeScore,
          awayScore: stats.awayScore,
          matchTime: minutes,
          homePossession: homePossPct,
          homeShots: stats.homeShots,
          awayShots: stats.awayShots,
          currentFormation: aiTactics.formation,
          currentMentality: aiTactics.mentality,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to reach AI Tactical Engine');
      }
      setAiInsight(data as AICoachInsight);
      onChangeAiTactics({
        ...aiTactics,
        formation: (data.recommendedFormation as FormationId) || aiTactics.formation,
        mentality: (data.recommendedMentality as MentalityId) || aiTactics.mentality,
        pressingIntensity: data.pressingIntensity ?? aiTactics.pressingIntensity,
        attackingPace: data.attackingPace ?? aiTactics.attackingPace,
      });
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Tactical analysis unavailable');
    } finally {
      setIsLoadingInsight(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 max-h-[100dvh] overflow-hidden">
      {/* Top Perimeter Row: FC 26 Broadcast Scorebug (Left) & Quick Actions (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-2 w-full">
        {/* Top-Left Broadcast Scoreboard + Live xG & Active Player Tag */}
        <div className="pointer-events-auto flex flex-col gap-1">
          <div className="flex items-center bg-[#090D16]/95 border border-white/15 rounded-lg overflow-hidden shadow-xl">
            <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-[#CCFF00] text-[#070A10] font-display font-extrabold text-sm sm:text-base tracking-wider uppercase">
              FC 26
            </div>

            {/* Home Team */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5">
              <span
                className="w-2.5 h-3.5 sm:w-3 sm:h-4 rounded-xs border border-white/20 shrink-0"
                style={{ backgroundColor: equipment.kitPrimaryColor }}
              />
              <span className="font-display font-bold text-base sm:text-lg tracking-wide text-white">
                RMA
              </span>
              <span className="font-mono-tabular font-bold text-lg sm:text-xl text-[#CCFF00] px-0.5">
                {stats.homeScore}
              </span>
            </div>

            <div className="h-5 w-px bg-white/15" />

            {/* Away Team */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5">
              <span className="font-mono-tabular font-bold text-lg sm:text-xl text-white px-0.5">
                {stats.awayScore}
              </span>
              <span className="font-display font-bold text-base sm:text-lg tracking-wide text-slate-200">
                MCI
              </span>
              <span
                className="w-2.5 h-3.5 sm:w-3 sm:h-4 rounded-xs border border-white/20 shrink-0"
                style={{ backgroundColor: resolveAwayKitPalette(equipment).primary }}
              />
            </div>

            {/* Match Clock & Half */}
            <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-[#111827] border-l border-white/10 font-mono-tabular text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#CCFF00]">
                {stats.currentHalf === 2 ? '2H' : '1H'}
              </span>
              <span>{clockFormatted}</span>
            </div>

            {/* Live Match Telemetry (Possession, xG & Corners) */}
            <div className="hidden xl:flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 border-l border-white/10 font-mono-tabular">
              <span className="font-semibold text-[#CCFF00]">
                {gameMode === 'ONLINE_MULTIPLAYER'
                  ? `ONLINE #${onlineState.roomId || 'LIVE'} (${onlineState.role})`
                  : gameMode === 'AI_VS_AI'
                  ? 'AI MODE'
                  : 'USER VS AI'}
              </span>
              <span aria-hidden="true">·</span>
              <span>POSS {homePossPct}%</span>
              <span aria-hidden="true">·</span>
              <span>
                xG {stats.homeXG.toFixed(2)} - {stats.awayXG.toFixed(2)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                CORNERS {stats.homeCorners}-{stats.awayCorners}
              </span>
            </div>
          </div>

          {/* Sub-Ticker: Active Player + OVR/Speed/Shot + Sprint & Shot Power Indicator */}
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-1 bg-[#090D16]/90 border border-white/10 rounded text-[11px] text-slate-300 font-mono-tabular">
            <span className="text-[#CCFF00] font-bold">
              #{stats.activePlayerNumber} {stats.activePlayerName}
            </span>
            {stats.activePlayerOvr && (
              <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black">
                OVR {stats.activePlayerOvr}
              </span>
            )}
            {stats.activePlayerPace && stats.activePlayerShooting && (
              <span className="text-[10px] text-slate-300">
                ⚡PAC {stats.activePlayerPace} · 💥SHO {stats.activePlayerShooting}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">STA {stats.activePlayerStamina}%</span>
            {stats.isSprinting && (
              <span className="px-1.5 py-0.2 rounded bg-[#CCFF00] text-slate-950 text-[10px] font-black uppercase animate-pulse">
                ⚡ SPRINTING
              </span>
            )}
            {stats.shotPowerCharge > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#EF4444] font-bold">
                  POWER {stats.shotPowerCharge}%
                </span>
              </>
            )}
            <span aria-hidden="true" className="hidden md:inline">·</span>
            <span className="hidden md:inline text-slate-200 truncate max-w-[280px]">
              {stats.aiCurrentAction}
            </span>
          </div>
        </div>

        {/* Top-Right Quick Action Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-[#090D16]/95 border border-white/15 p-1 rounded-lg shadow-xl">
          {/* iPad / Touch Controls Toggle */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onChangeGraphics({
                ...graphics,
                ipadControls: !graphics.ipadControls,
              });
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              graphics.ipadControls
                ? 'bg-[#CCFF00] text-[#070A10]'
                : 'bg-[#111827] text-slate-200 hover:text-white'
            }`}
          >
            {graphics.ipadControls ? 'iPad Controls: ON' : 'iPad Controls'}
          </button>

          {/* Online Multiplayer Room Button */}
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onOpenOnlineLobby();
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gameMode === 'ONLINE_MULTIPLAYER'
                ? 'bg-emerald-400 text-[#070A10]'
                : 'bg-[#111827] text-[#38BDF8] hover:text-white border border-[#38BDF8]/30'
            }`}
          >
            {onlineState.roomId
              ? `Online Room #${onlineState.roomId}`
              : 'Play Online'}
          </button>

          <button
            onClick={() => {
              soundEngine.playUIClick();
              onToggleGameMode(
                gameMode === 'AI_VS_AI' ? 'PLAYER_VS_AI' : 'AI_VS_AI'
              );
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gameMode === 'AI_VS_AI'
                ? 'bg-[#38BDF8] text-[#070A10]'
                : 'bg-[#111827] text-slate-200 hover:text-white'
            }`}
          >
            {gameMode === 'AI_VS_AI' ? 'AI Mode: ON' : 'AI Mode'}
          </button>

          <button
            onClick={() => {
              soundEngine.playUIClick();
              onOpenCustomizer();
            }}
            className="px-3 py-1.5 text-xs font-bold bg-[#CCFF00] text-[#070A10] hover:bg-[#d9ff33] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gear
          </button>

          <button
            onClick={onToggleMute}
            className="px-2.5 py-1.5 text-xs font-semibold bg-[#111827] text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Toggle Crowd & Match Audio"
          >
            {muted ? 'Muted' : 'Audio'}
          </button>

          <button
            onClick={() => {
              soundEngine.playUIClick();
              onOpenPauseModal();
            }}
            className="px-2.5 py-1.5 text-xs font-semibold bg-[#111827] text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Pause
          </button>
        </div>
      </div>

      {/* Goal Scored + Live 3D Slow-Motion Action Replay Overlay (Tap Anywhere on Screen to Skip!) */}
      {(goalBanner || stats.isGoalReplay) && (
        <div
          onClick={() => {
            onSkipReplay();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            onSkipReplay();
          }}
          className="fixed inset-0 z-30 pointer-events-auto cursor-pointer flex flex-col items-center justify-between py-14 px-4 bg-gradient-to-b from-[#05080F]/55 via-transparent to-[#05080F]/65"
        >
          {/* Top Broadcast Replay Ribbon */}
          <div className="flex items-center gap-3 bg-[#090D16]/95 border border-[#CCFF00]/60 px-5 py-2 rounded-full shadow-2xl">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="font-mono-tabular text-xs font-extrabold uppercase tracking-widest text-white">
              {(stats.goalReplayProgress ?? 0) > 0
                ? 'LIVE 3D ACTION GOAL REPLAY · 0.65x SLOW-MO'
                : `${currentStadiumSpec.name.toUpperCase()} · GOAL CELEBRATION`}
            </span>
            {(stats.goalReplayProgress ?? 0) > 0 && (
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#CCFF00] transition-all duration-75"
                  style={{ width: `${stats.goalReplayProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Center-Bottom Broadcast Goal Banner + Tap Anywhere to Skip Prompt */}
          <div className="bg-[#090D16]/92 border-2 border-[#CCFF00] px-8 py-4 rounded-2xl text-center shadow-2xl max-w-lg w-full">
            <div className="text-[11px] font-mono-tabular font-bold tracking-widest uppercase text-[#38BDF8]">
              {(goalBanner?.team || stats.lastScorerTeam) === 'HOME'
                ? 'REAL MADRID (HOME)'
                : 'MANCHESTER CITY (AWAY)'}{' '}
              · SCORE {stats.homeScore} - {stats.awayScore}
            </div>
            <div className="font-display text-4xl sm:text-5xl font-extrabold italic tracking-tight text-[#CCFF00] uppercase mt-0.5">
              GOAL! {goalBanner?.scorerName || stats.lastScorerName || 'STRIKER'}
            </div>
            <div className="mt-2.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#CCFF00] text-[#070A10] font-display font-extrabold text-xs uppercase tracking-wider shadow">
              <span>Tap Anywhere on Screen to Skip Replay ⏭</span>
            </div>
          </div>
        </div>
      )}

      {/* 1st Person Corner Kick Interactive Trajectory Drawing Overlay */}
      {stats.isUserCornerKick && (
        <CornerKickDrawOverlay
          takerName={stats.cornerTakerName || 'VINICIUS JR'}
          teamLabel={stats.cornerKickTeam === 'HOME' ? 'REAL MADRID' : 'MANCHESTER CITY'}
          touchInputRef={touchInputRef}
          cornerZSign={stats.cornerZSign ?? 1}
        />
      )}

      {/* Official Set-Piece Banner (Goal Kick / 2nd Half Kick-Off / AI Corner Kick) */}
      {!goalBanner && !stats.isGoalReplay && !stats.isUserCornerKick && stats.setPieceBanner && (
        <div className="my-auto mx-auto bg-[#090D16]/95 border-2 border-[#38BDF8] px-8 py-4 rounded-xl text-center shadow-2xl">
          <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-[#CCFF00]">
            OFFICIAL MATCH SET PIECE · PRESS PASS (K) OR CROSS (L)
          </div>
          <div className="font-display text-4xl font-extrabold italic tracking-wide text-white uppercase mt-0.5">
            {stats.setPieceBanner}
          </div>
        </div>
      )}

      {/* iPad & Touch On-Screen Virtual Controller Overlay (Hidden during Corner Kick to give full drawing freedom) */}
      {graphics.ipadControls && !stats.isUserCornerKick && (
        <IPadTouchController
          touchInputRef={touchInputRef}
          activeSkillName={stats.activeSkillMoveName}
          userHasBall={stats.userHasBall}
        />
      )}

      {/* Bottom Area: Perimeter Player Telemetry Bar + Unified Collapsible Control Dock */}
      <div className="w-full flex flex-col items-center gap-2 mt-auto">
        {/* Compact Active Player & AI Engine Status Bar */}
        {!graphics.ipadControls && (
          <div className="w-full max-w-[960px] flex items-center justify-between gap-4 px-1">
            {/* Left: Active Controlled / AI Carrier Player Card */}
            <div className="pointer-events-auto flex items-center gap-3 bg-[#090D16]/95 border border-white/15 px-3.5 py-2 rounded-lg">
              <div className="font-display font-extrabold text-xl text-[#CCFF00] font-mono-tabular">
                #{stats.activePlayerNumber}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white tracking-wide uppercase">
                    {stats.activePlayerName}
                  </span>
                  {stats.activeSkillMoveName && (
                    <span className="text-[10px] font-mono-tabular font-bold px-1.5 py-0.5 rounded bg-[#CCFF00] text-[#070A10]">
                      {stats.activeSkillMoveName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#CCFF00] transition-all duration-150"
                      style={{ width: `${stats.activePlayerStamina}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    STA {stats.activePlayerStamina}%
                  </span>
                </div>
              </div>

              {stats.shotPowerCharge > 0 && (
                <div className="pl-3 border-l border-white/15">
                  <div className="text-[10px] font-bold text-[#EF4444] uppercase">
                    SHOT POWER {stats.shotPowerCharge}%
                  </div>
                  <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-[#CCFF00] via-[#F59E0B] to-[#EF4444]"
                      style={{ width: `${stats.shotPowerCharge}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right: Live AI Decision & Skill Move Hint Telemetry */}
            <div className="pointer-events-auto hidden md:flex items-center gap-2.5 bg-[#090D16]/95 border border-white/15 px-3.5 py-2 rounded-lg text-xs text-slate-300 font-mono-tabular">
              <span className="font-bold text-[#38BDF8]">ACTION:</span>
              <span className="text-white font-sans font-medium">{stats.aiCurrentAction}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">
                SKILLS: <strong className="text-[#CCFF00]">1 Elastico · 2 Roulette · 3 Stepover · 4 Rainbow · C Dribble</strong>
              </span>
            </div>
          </div>
        )}

        {/* Unified Collapsible Bottom Dock */}
        <div className="pointer-events-none w-full max-w-[960px] flex flex-col items-center">
          <button
            onClick={() => {
              soundEngine.playUIClick();
              setDockCollapsed((prev) => !prev);
            }}
            className="pointer-events-auto px-4 py-1 text-xs font-semibold tracking-wide text-slate-300 hover:text-white bg-[#090D16]/95 border border-b-0 border-white/15 rounded-t-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            {dockCollapsed
              ? '▴ Show AI Tactics, Skill Moves & Stadium Dock (H)'
              : '▾ Hide Controls · Cinema Pitch View (H)'}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-full bg-[#090D16]/95 border border-white/15 rounded-xl p-3.5 shadow-2xl">
              {/* Dock Header Tabs + Control Hint */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                <div className="flex flex-wrap items-center gap-1 bg-[#111827] p-1 rounded-lg">
                  {(
                    [
                      { id: 'AI_DIRECTOR', label: '1. AI Engine & Auto-Switch' },
                      { id: 'SKILL_MOVES', label: '2. Dribbling & Skill Moves' },
                      { id: 'STADIUM_GRAPHICS', label: '3. Stadiums & Lighting' },
                      { id: 'QUICK_GEAR', label: '4. Equipment Swap' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        soundEngine.playUIClick();
                        setActiveTab(t.id);
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === t.id
                          ? 'bg-[#CCFF00] text-[#070A10]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-slate-400 font-mono-tabular hidden xl:block">
                  WASD Move · C Close Dribble · 1-4 Skill Moves · K Pass · L Through · Space Shoot
                </div>
              </div>

              {/* Tab 1: Advanced AI Match Engine & Auto Closest-Player Switch */}
              {activeTab === 'AI_DIRECTOR' && (
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    {/* Mode, Auto-Switch Closest Player & Dynamic Adaptation Toggles */}
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onChangeAiTactics({
                              ...aiTactics,
                              autoSwitchPlayer: !aiTactics.autoSwitchPlayer,
                            });
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                            aiTactics.autoSwitchPlayer
                              ? 'bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {aiTactics.autoSwitchPlayer
                            ? 'Auto-Switch Closest: ON'
                            : 'Auto-Switch Closest: OFF'}
                        </button>

                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onChangeAiTactics({
                              ...aiTactics,
                              dynamicAdaptation: !aiTactics.dynamicAdaptation,
                            });
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                            aiTactics.dynamicAdaptation
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {aiTactics.dynamicAdaptation ? 'AI Auto-Adapt: ON' : 'AI Auto-Adapt: OFF'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1 bg-[#111827] p-1 rounded-lg">
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onToggleGameMode('PLAYER_VS_AI');
                          }}
                          className={`px-2 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            gameMode === 'PLAYER_VS_AI'
                              ? 'bg-[#CCFF00] text-[#070A10]'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Player vs AI
                        </button>
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onToggleGameMode('AI_VS_AI');
                          }}
                          className={`px-2 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            gameMode === 'AI_VS_AI'
                              ? 'bg-[#38BDF8] text-[#070A10]'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Autonomous AI
                        </button>
                      </div>
                    </div>

                    {/* Formation & Mentality Selectors */}
                    <div className="md:col-span-4 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Home Formation
                        </span>
                        <select
                          value={aiTactics.formation}
                          onChange={(e) => {
                            soundEngine.playUIClick();
                            onChangeAiTactics({
                              ...aiTactics,
                              formation: e.target.value as FormationId,
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold bg-[#111827] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                        >
                          <option value="4-3-3 Attack">4-3-3 Attack</option>
                          <option value="4-4-2 Classic">4-4-2 Classic</option>
                          <option value="3-5-2 Wingplay">3-5-2 Wingplay</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Tactical Strategy
                        </span>
                        <select
                          value={aiTactics.mentality}
                          onChange={(e) => {
                            soundEngine.playUIClick();
                            onChangeAiTactics({
                              ...aiTactics,
                              mentality: e.target.value as MentalityId,
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold bg-[#111827] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                        >
                          <option value="Gegenpress">Gegenpress High Line</option>
                          <option value="Tiki-Taka">Tiki-Taka Possession</option>
                          <option value="Counter-Attack">Low Block Counter</option>
                          <option value="Ultra Attack">All-Out Overload</option>
                        </select>
                      </div>
                    </div>

                    {/* Instant Touchline Override Commands + Gemini AI Coach CTA */}
                    <div className="md:col-span-4 flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Live AI Touchline Directives
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onTriggerTacticalCommand('TRIGGER_THROUGH_BALL');
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-[#111827] hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Through-Ball
                        </button>
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            onTriggerTacticalCommand('INSTRUCT_SHOOT_NOW');
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-[#111827] hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Shoot Now
                        </button>
                        <button
                          onClick={() => {
                            soundEngine.playUIClick();
                            if (onPracticeCornerKick) onPracticeCornerKick();
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 rounded-lg whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
                        >
                          📐 1st Person Corner
                        </button>
                        <button
                          onClick={requestGeminiTacticalAnalysis}
                          disabled={isLoadingInsight}
                          className="flex-1 px-3 py-1.5 text-xs font-bold bg-[#38BDF8] hover:bg-[#7dd3fc] text-[#070A10] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {isLoadingInsight ? 'Analyzing...' : 'Gemini AI Coach'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Gemini AI Coach Live Tactical Insight Strip */}
                  {(aiInsight || aiError) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111827] border border-white/10 px-3 py-2 rounded-lg text-xs">
                      {aiError ? (
                        <span className="text-rose-400">{aiError}</span>
                      ) : (
                        aiInsight && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#38BDF8] uppercase">
                                {aiInsight.coachHeadline}:
                              </span>
                              <span className="text-slate-200">{aiInsight.tacticalAnalysis}</span>
                            </div>
                            <div className="text-[11px] font-mono-tabular text-[#CCFF00]">
                              APPLIED: {aiInsight.recommendedFormation} · {aiInsight.recommendedMentality} · PRESS{' '}
                              {aiInsight.pressingIntensity}%
                            </div>
                          </>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Dribbling & 4 Signature Skill Moves */}
              {activeTab === 'SKILL_MOVES' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(SKILL_MOVES_CATALOG) as SkillMoveId[]).map((skillId) => {
                    const spec = SKILL_MOVES_CATALOG[skillId];
                    return (
                      <button
                        key={skillId}
                        onClick={() => {
                          touchInputRef.current.pendingSkillMove = skillId;
                        }}
                        className="bg-[#111827] hover:bg-white/10 active:bg-[#CCFF00] active:text-[#070A10] border border-white/15 rounded-xl p-2.5 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                          <span className="text-[#CCFF00] font-bold">KEY: {spec.keyHint}</span>
                          <span className="text-slate-400">-{spec.staminaCost} STA</span>
                        </div>
                        <div className="font-display font-extrabold text-sm uppercase text-white mt-0.5">
                          {spec.name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {spec.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: Iconic 3D Stadiums, Dimmer Brightness Control & Broadcast Camera */}
              {activeTab === 'STADIUM_GRAPHICS' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-5">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      World Football Stadium Arena (3D Architecture & Turf)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'santiago_bernabeu', short: 'Bernabéu' },
                          { id: 'wembley_arch', short: 'Wembley' },
                          { id: 'allianz_arena', short: 'Allianz' },
                          { id: 'san_siro', short: 'San Siro' },
                        ] as Array<{ id: StadiumId; short: string }>
                      ).map((st) => (
                        <button
                          key={st.id}
                          onClick={() => {
                            soundEngine.playUIClick();
                            onChangeGraphics({ ...graphics, stadium: st.id });
                          }}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            graphics.stadium === st.id
                              ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00] font-bold'
                              : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                          }`}
                        >
                          {st.short}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-4 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Broadcast Camera
                      </span>
                      <select
                        value={graphics.cameraAngle}
                        onChange={(e) => {
                          soundEngine.playUIClick();
                          onChangeGraphics({
                            ...graphics,
                            cameraAngle: e.target.value as CameraAngleId,
                          });
                        }}
                        className="w-full px-2 py-1.5 text-xs font-semibold bg-[#111827] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                      >
                        <option value="broadcast_tele">Broadcast Tele</option>
                        <option value="pro_end_to_end">Pro End-to-End</option>
                        <option value="tactical_overhead">Tactical Overhead</option>
                        <option value="sideline_cinematic">Sideline Low</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Lighting Atmosphere
                      </span>
                      <select
                        value={graphics.weatherLighting}
                        onChange={(e) => {
                          soundEngine.playUIClick();
                          onChangeGraphics({
                            ...graphics,
                            weatherLighting: e.target.value as WeatherLightingId,
                          });
                        }}
                        className="w-full px-2 py-1.5 text-xs font-semibold bg-[#111827] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                      >
                        <option value="champions_night">Champions Night</option>
                        <option value="golden_hour">Golden Hour</option>
                        <option value="crisp_daylight">Crisp Daylight</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-3 bg-[#111827] px-3 py-2 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                      <span>Light Brightness</span>
                      <span className="font-mono-tabular text-[#CCFF00]">
                        {Math.round(graphics.exposure * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.7}
                      max={1.8}
                      step={0.02}
                      value={graphics.exposure}
                      onChange={(e) =>
                        onChangeGraphics({
                          ...graphics,
                          exposure: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#CCFF00] cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Tab 4: Quick On-Pitch Equipment Swap */}
              {activeTab === 'QUICK_GEAR' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Equipped Pro Boots
                    </span>
                    <div className="flex items-center gap-1">
                      {(Object.keys(BOOT_CATALOG) as BootModelId[]).map((bootId) => {
                        const spec = BOOT_CATALOG[bootId];
                        return (
                          <button
                            key={bootId}
                            onClick={() => {
                              soundEngine.playUIClick();
                              onChangeEquipment({ ...equipment, bootModel: bootId });
                            }}
                            title={spec.name}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              equipment.bootModel === bootId
                                ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00] font-bold'
                                : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                            }`}
                          >
                            {spec.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Team Kit Pairing (Yellow vs Blue Auto-Contrast)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({
                            ...equipment,
                            kitPrimaryColor: '#FACC15',
                            kitSecondaryColor: '#1E3A8A',
                          });
                        }}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.kitPrimaryColor.toUpperCase() === '#FACC15'
                            ? 'bg-[#FACC15] text-[#070A10] border-[#FACC15]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        Home Yellow / Away Blue
                      </button>
                      <button
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({
                            ...equipment,
                            kitPrimaryColor: '#2563EB',
                            kitSecondaryColor: '#FACC15',
                          });
                        }}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.kitPrimaryColor.toUpperCase() === '#2563EB'
                            ? 'bg-[#2563EB] text-white border-[#FACC15]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        Home Blue / Away Yellow
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        onOpenCustomizer();
                      }}
                      className="w-full py-2 px-4 text-xs font-bold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d8ff33] text-[#070A10] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open 3D Pro Locker Room →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

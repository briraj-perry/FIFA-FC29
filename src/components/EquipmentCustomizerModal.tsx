import React, { useState } from 'react';
import {
  ArmgearId,
  BallStyleId,
  BOOT_CATALOG,
  BootModelId,
  HeadgearId,
  KitPatternId,
  PlayerEquipmentLoadout,
  resolveAwayKitPalette,
  SockStyleId,
  StudFinishId,
} from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface EquipmentCustomizerProps {
  equipment: PlayerEquipmentLoadout;
  onChangeEquipment: (next: PlayerEquipmentLoadout) => void;
  zoomTarget: 'FULL_BODY' | 'BOOTS' | 'UPPER_KIT' | 'HEADGEAR' | 'BALL';
  onChangeZoomTarget: (target: 'FULL_BODY' | 'BOOTS' | 'UPPER_KIT' | 'HEADGEAR' | 'BALL') => void;
  onCloseAndReturnToMatch: () => void;
  onBackToTitle: () => void;
}

type CustomizerTab = 'BOOTS' | 'KIT' | 'ACCESSORIES' | 'BALL_IDENTITY';

const KIT_COLOR_SWATCHES = [
  { label: 'Championship Yellow', hex: '#FACC15' },
  { label: 'Royal Blue', hex: '#2563EB' },
  { label: 'Royal White', hex: '#F8FAFC' },
  { label: 'Acid Volt', hex: '#CCFF00' },
  { label: 'Madrid Gold', hex: '#D4AF37' },
  { label: 'Cyber Cyan', hex: '#00F0FF' },
  { label: 'Crimson Strike', hex: '#EF4444' },
  { label: 'Obsidian Pitch', hex: '#0F172A' },
  { label: 'Emerald Turf', hex: '#10B981' },
];

export const EquipmentCustomizerModal: React.FC<EquipmentCustomizerProps> = ({
  equipment,
  onChangeEquipment,
  zoomTarget,
  onChangeZoomTarget,
  onCloseAndReturnToMatch,
  onBackToTitle,
}) => {
  const [activeTab, setActiveTab] = useState<CustomizerTab>('BOOTS');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const selectTab = (tab: CustomizerTab) => {
    soundEngine.playUIClick();
    setActiveTab(tab);
    if (tab === 'BOOTS') onChangeZoomTarget('BOOTS');
    else if (tab === 'KIT') onChangeZoomTarget('UPPER_KIT');
    else if (tab === 'ACCESSORIES') onChangeZoomTarget('HEADGEAR');
    else if (tab === 'BALL_IDENTITY') onChangeZoomTarget('BALL');
  };

  const currentBootSpec = BOOT_CATALOG[equipment.bootModel];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2.5 sm:p-5 overflow-hidden">
      {/* Top Bar: Minimal Locker Room Spec Header & Camera Zoom Selector */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 bg-[#090D16]/95 border border-white/15 px-3.5 py-2.5 sm:px-5 sm:py-3 rounded-xl max-w-[1140px] w-full mx-auto shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              soundEngine.playUIClick();
              onBackToTitle();
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            ← Menu
          </button>
          <div>
            <h2 className="font-display text-lg sm:text-2xl font-extrabold tracking-wide uppercase text-white leading-none">
              Pro Locker Room · 3D Lab
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 hidden sm:block">
              Drag anywhere to rotate 360° · Real-time PBR Clearcoat & Stud Preview
            </p>
          </div>
        </div>

        {/* Camera Inspection Focus Selector */}
        <div className="flex items-center gap-1 bg-[#111827] p-1 rounded-lg border border-white/10 overflow-x-auto max-w-full">
          {(
            [
              { id: 'FULL_BODY', label: 'Full' },
              { id: 'BOOTS', label: 'Boots' },
              { id: 'UPPER_KIT', label: 'Kit' },
              { id: 'HEADGEAR', label: 'Gear' },
              { id: 'BALL', label: 'Ball' },
            ] as const
          ).map((cam) => (
            <button
              key={cam.id}
              onClick={() => {
                soundEngine.playUIClick();
                onChangeZoomTarget(cam.id);
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                zoomTarget === cam.id
                  ? 'bg-[#CCFF00] text-[#070A10]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            soundEngine.playUIClick();
            onCloseAndReturnToMatch();
          }}
          className="px-4 py-1.5 sm:px-5 sm:py-2 text-xs font-bold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d8ff33] text-[#070A10] rounded-lg transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer shadow-lg"
        >
          Save & Play →
        </button>
      </div>

      {/* Central 3D Viewport stays 100% Unobstructed */}
      <div className="flex-1" />

      {/* Unified Collapsible Bottom Control Dock (Zero Side-Panel Clutter) */}
      <div className="pointer-events-auto w-full max-w-[940px] mx-auto flex flex-col items-center">
        <button
          onClick={() => {
            soundEngine.playUIClick();
            setDockCollapsed((prev) => !prev);
          }}
          className="px-4 py-1 text-xs font-semibold tracking-wide text-slate-300 hover:text-white bg-[#090D16]/95 border border-b-0 border-white/15 rounded-t-lg cursor-pointer whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? '▴ Show Equipment Dock (Zen Mode)' : '▾ Hide Equipment Dock (Inspect 3D)'}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#090D16]/95 border border-white/15 rounded-xl p-4 shadow-2xl">
            {/* Category Tabs + Active Player Telemetry Summary */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 mb-2.5 border-b border-white/10">
              <div className="flex items-center gap-1 sm:gap-1.5 bg-[#111827] p-1 rounded-lg overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'BOOTS', label: '1. Pro Boots & Cleats' },
                    { id: 'KIT', label: '2. Kit & Jersey Pattern' },
                    { id: 'ACCESSORIES', label: '3. Visors, Wrist & Socks' },
                    { id: 'BALL_IDENTITY', label: '4. Match Ball & Star ID' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTab(t.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-[#CCFF00] text-[#070A10]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300 font-mono-tabular">
                <span>
                  STAR: <strong className="text-white">#{equipment.starNumber} {equipment.starName}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  PACE BOOST: <strong className="text-[#CCFF00]">+{currentBootSpec.speedBonus}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  SHOT POWER: <strong className="text-[#00F0FF]">+{currentBootSpec.shotBonus}</strong>
                </span>
              </div>
            </div>

            {/* Tab 1: Boots & Studs */}
            {activeTab === 'BOOTS' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(Object.keys(BOOT_CATALOG) as BootModelId[]).map((bootId) => {
                    const spec = BOOT_CATALOG[bootId];
                    const selected = equipment.bootModel === bootId;
                    return (
                      <button
                        key={bootId}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, bootModel: bootId });
                          onChangeZoomTarget('BOOTS');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-white/10 border-[#CCFF00]'
                            : 'bg-[#111827] border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                            style={{ backgroundColor: spec.primaryHex }}
                          />
                          <span
                            className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
                            style={{ backgroundColor: spec.accentHex }}
                          />
                        </div>
                        <div className="text-xs font-bold text-white truncate">{spec.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                          SPD +{spec.speedBonus} · SHT +{spec.shotBonus}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-[#111827] p-3 rounded-lg border border-white/10">
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Metallic Cleat Stud Finish
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'chrome_gold', label: '24K Gold' },
                        { id: 'anodized_cyan', label: 'Cyber Cyan' },
                        { id: 'matte_black', label: 'Stealth Carbon' },
                      ] as Array<{ id: StudFinishId; label: string }>
                    ).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, bootStudFinish: s.id });
                        }}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.bootStudFinish === s.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00] font-bold'
                            : 'bg-[#090D16] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                    {currentBootSpec.desc}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Kit Pattern & Colors */}
            {activeTab === 'KIT' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">Jersey Weave Pattern</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'solid', label: 'Classic Solid' },
                        { id: 'stripes', label: 'Vertical Stripes' },
                        { id: 'sash', label: 'Diagonal Sash' },
                        { id: 'chevron', label: 'Hyper Chevron' },
                      ] as Array<{ id: KitPatternId; label: string }>
                    ).map((pat) => (
                      <button
                        key={pat.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, kitPattern: pat.id });
                        }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.kitPattern === pat.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {pat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Home Primary Color
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-mono-tabular text-slate-300">
                      <span>Away Auto-Contrast:</span>
                      <span
                        className="w-3 h-3 rounded-xs border border-white/30 inline-block"
                        style={{
                          backgroundColor: resolveAwayKitPalette(equipment).primary,
                        }}
                      />
                      <strong className="text-white">
                        {resolveAwayKitPalette(equipment).label}
                      </strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {KIT_COLOR_SWATCHES.map((sw) => (
                      <button
                        key={sw.hex}
                        title={sw.label}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, kitPrimaryColor: sw.hex });
                        }}
                        className={`w-7 h-7 rounded-md border-2 transition-transform cursor-pointer ${
                          equipment.kitPrimaryColor === sw.hex
                            ? 'border-[#CCFF00] scale-110'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Secondary Trim & Pattern Accent
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {KIT_COLOR_SWATCHES.map((sw) => (
                      <button
                        key={sw.hex}
                        title={sw.label}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, kitSecondaryColor: sw.hex });
                        }}
                        className={`w-7 h-7 rounded-md border-2 transition-transform cursor-pointer ${
                          equipment.kitSecondaryColor === sw.hex
                            ? 'border-[#CCFF00] scale-110'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Protective & Performance Accessories */}
            {activeTab === 'ACCESSORIES' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Headgear & Optical Visor
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'None (Standard)' },
                        { id: 'aero_visor', label: 'Aero Glass Visor' },
                        { id: 'sweatband', label: 'Pro Sweatband' },
                        { id: 'carbon_mask', label: 'Carbon Face Mask' },
                      ] as Array<{ id: HeadgearId; label: string }>
                    ).map((hg) => (
                      <button
                        key={hg.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, headgear: hg.id });
                          onChangeZoomTarget('HEADGEAR');
                        }}
                        className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.headgear === hg.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {hg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Wrist Tape, Sleeves & Armband
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'Bare Forearms' },
                        { id: 'wrist_tape', label: 'White Pro Tape' },
                        { id: 'neon_bands', label: 'Volt Sweatbands' },
                        { id: 'captain_band', label: 'Gold Captain Band' },
                        { id: 'thermal_sleeves', label: 'Thermal Long Sleeves' },
                      ] as Array<{ id: ArmgearId; label: string }>
                    ).map((ag) => (
                      <button
                        key={ag.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, armgear: ag.id });
                          onChangeZoomTarget('UPPER_KIT');
                        }}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.armgear === ag.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {ag.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Sock Cut & Carbon Shin Guards
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(
                      [
                        { id: 'standard', label: 'Standard Pro Mid-Calf' },
                        { id: 'high_grip', label: 'High Over-Knee Grip Socks' },
                        { id: 'low_carbon_guard', label: 'Low Ankle + Exposed Carbon Guard' },
                      ] as Array<{ id: SockStyleId; label: string }>
                    ).map((sk) => (
                      <button
                        key={sk.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, sockStyle: sk.id });
                          onChangeZoomTarget('BOOTS');
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.sockStyle === sk.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {sk.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Match Ball & Star Identity */}
            {activeTab === 'BALL_IDENTITY' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Official Thermal-Bonded Match Ball
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'fc26_orbital', label: 'FC 26 Orbital Volt' },
                        { id: 'champions_gold', label: 'Champions Finale Gold' },
                        { id: 'winter_flare', label: 'High-Vis Winter Orange' },
                        { id: 'cyber_chrome', label: 'RTX Cyber Chrome' },
                      ] as Array<{ id: BallStyleId; label: string }>
                    ).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          soundEngine.playUIClick();
                          onChangeEquipment({ ...equipment, ballStyle: b.id });
                          onChangeZoomTarget('BALL');
                        }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          equipment.ballStyle === b.id
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-[#111827] p-3 rounded-lg border border-white/10">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Star Captain Name
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      value={equipment.starName}
                      onChange={(e) => {
                        onChangeEquipment({
                          ...equipment,
                          starName: e.target.value.toUpperCase(),
                        });
                        onChangeZoomTarget('UPPER_KIT');
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold uppercase bg-[#090D16] border border-white/15 rounded text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Squad Number (1–99)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[5, 7, 9, 10, 26].map((num) => (
                        <button
                          key={num}
                          onClick={() => {
                            soundEngine.playUIClick();
                            onChangeEquipment({ ...equipment, starNumber: num });
                            onChangeZoomTarget('UPPER_KIT');
                          }}
                          className={`px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded border cursor-pointer ${
                            equipment.starNumber === num
                              ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                              : 'bg-[#090D16] text-slate-300 border-white/10 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

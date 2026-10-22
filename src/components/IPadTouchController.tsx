import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SKILL_MOVES_CATALOG, SkillMoveId, TouchControllerInput } from '../types/game';
import { soundEngine } from '../audio/soundEngine';
import { isPhoneScreen, triggerHaptic } from '../utils/mobileDetection';

interface IPadTouchControllerProps {
  touchInputRef: React.MutableRefObject<TouchControllerInput>;
  activeSkillName: string | null;
  userHasBall?: boolean;
}

type LeftControlStyle = 'FLOATING_STICK' | 'FIXED_STICK' | 'DPAD_8WAY';

export const IPadTouchController: React.FC<IPadTouchControllerProps> = ({
  touchInputRef,
  activeSkillName,
  userHasBall = true,
}) => {
  const [controlStyle, setControlStyle] = useState<LeftControlStyle>('FLOATING_STICK');
  const [isPhone, setIsPhone] = useState<boolean>(() => isPhoneScreen());
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  const stickZoneRef = useRef<HTMLDivElement | null>(null);
  const leftCaptureRef = useRef<HTMLDivElement | null>(null);
  const dpadZoneRef = useRef<HTMLDivElement | null>(null);

  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const touchOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sprintButtonHeldRef = useRef<boolean>(false);
  const sprintLockedRef = useRef<boolean>(false);
  const sprintPressStartRef = useRef<number>(0);
  const closeDribbleActiveRef = useRef<boolean>(false);

  // Dynamic floating stick visual center (screen coordinates in px)
  const [floatingOrigin, setFloatingOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickHeld, setIsStickHeld] = useState(false);
  const [autoSprinting, setAutoSprinting] = useState(false);
  const [sprintButtonHeld, setSprintButtonHeld] = useState(false);
  const [sprintLocked, setSprintLocked] = useState(false);
  const [closeDribbleActive, setCloseDribbleActive] = useState(false);
  const [shootPressed, setShootPressed] = useState(false);
  const [slidePressed, setSlidePressed] = useState(false);
  const [passPressed, setPassPressed] = useState(false);
  const [isSwipingUpPass, setIsSwipingUpPass] = useState(false);
  const passTouchStartYRef = useRef<number | null>(null);
  const [activeDpadDir, setActiveDpadDir] = useState<string | null>(null);
  const [showSkillBar, setShowSkillBar] = useState(() => !isPhoneScreen());

  // Responsive radius: compact 28px on mobile phones to preserve field view
  const MAX_RADIUS = isPhone ? 28 : 42;
  const DEADZONE_PX = 2.5;

  // Window resize & orientation listener
  useEffect(() => {
    const onResize = () => {
      setIsPhone(isPhoneScreen());
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const applyMovementVector = useCallback(
    (rawX: number, rawZ: number, isOuterSprintThreshold: boolean) => {
      const len = Math.hypot(rawX, rawZ);
      if (len < 0.02) {
        touchInputRef.current.moveX = 0;
        touchInputRef.current.moveZ = 0;
        touchInputRef.current.sprintHeld =
          sprintButtonHeldRef.current || sprintLockedRef.current;
        setAutoSprinting(false);
        return;
      }

      const rawAngle = Math.atan2(rawZ, rawX);
      const snapStep = Math.PI / 4;
      const nearestCardinal = Math.round(rawAngle / snapStep) * snapStep;
      const angleDiff = Math.abs(
        Math.atan2(Math.sin(rawAngle - nearestCardinal), Math.cos(rawAngle - nearestCardinal))
      );
      const finalAngle =
        angleDiff < 0.16 ? rawAngle * 0.4 + nearestCardinal * 0.6 : rawAngle;

      const effectiveMag = Math.min(1, 0.72 + len * 0.28);
      touchInputRef.current.moveX = Math.cos(finalAngle) * effectiveMag;
      touchInputRef.current.moveZ = Math.sin(finalAngle) * effectiveMag;

      const shouldSprint =
        ((sprintButtonHeldRef.current || sprintLockedRef.current) ||
          isOuterSprintThreshold) &&
        !closeDribbleActiveRef.current;

      touchInputRef.current.sprintHeld = shouldSprint;
      setAutoSprinting(shouldSprint);
    },
    [touchInputRef]
  );

  const beginStickAt = useCallback(
    (clientX: number, clientY: number) => {
      setIsStickHeld(true);
      triggerHaptic(10);

      if (controlStyle === 'FLOATING_STICK') {
        // Dynamic spawn right under thumb position!
        touchOriginRef.current = { x: clientX, y: clientY };
        setFloatingOrigin({ x: clientX, y: clientY });
        setKnobOffset({ x: 0, y: 0 });
        return;
      }

      // Fixed Stick mode: center on the fixed stickZone element
      const zone = stickZoneRef.current;
      if (!zone) {
        touchOriginRef.current = { x: clientX, y: clientY };
        setFloatingOrigin({ x: clientX, y: clientY });
        setKnobOffset({ x: 0, y: 0 });
        return;
      }

      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      touchOriginRef.current = { x: centerX, y: centerY };
      setFloatingOrigin({ x: centerX, y: centerY });
      setKnobOffset({ x: 0, y: 0 });
    },
    [controlStyle]
  );

  const updateFloatingStick = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - touchOriginRef.current.x;
      const dy = clientY - touchOriginRef.current.y;
      const dist = Math.hypot(dx, dy);

      if (dist < DEADZONE_PX) {
        setKnobOffset({ x: 0, y: 0 });
        applyMovementVector(0, 0, false);
        return;
      }

      // If pulling beyond max radius in floating mode, drag the origin along gently
      if (controlStyle === 'FLOATING_STICK' && dist > MAX_RADIUS * 1.35) {
        const pull = dist - MAX_RADIUS * 1.35;
        const normDx = dx / dist;
        const normDy = dy / dist;
        touchOriginRef.current.x += normDx * pull;
        touchOriginRef.current.y += normDy * pull;
        setFloatingOrigin({
          x: touchOriginRef.current.x,
          y: touchOriginRef.current.y,
        });
      }

      const clampedDist = Math.min(dist, MAX_RADIUS);
      const nx = dx / dist;
      const ny = dy / dist;

      setKnobOffset({
        x: nx * clampedDist,
        y: ny * clampedDist,
      });

      const normalizedMag = Math.max(
        0.2,
        (clampedDist - DEADZONE_PX) / (MAX_RADIUS - DEADZONE_PX)
      );
      // Auto-sprint if thumb is pushed all the way to outer edge
      const isOuterEdge = clampedDist >= MAX_RADIUS * 0.88;
      applyMovementVector(nx * normalizedMag, ny * normalizedMag, isOuterEdge);
    },
    [MAX_RADIUS, controlStyle, applyMovementVector]
  );

  const endStick = useCallback(() => {
    activeTouchIdRef.current = null;
    activePointerIdRef.current = null;
    setIsStickHeld(false);
    setKnobOffset({ x: 0, y: 0 });
    setFloatingOrigin(null);
    applyMovementVector(0, 0, false);
  }, [applyMovementVector]);

  const updateDpadFromCoords = useCallback(
    (clientX: number, clientY: number) => {
      const el = dpadZoneRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < 6) {
        setActiveDpadDir(null);
        applyMovementVector(0, 0, false);
        return;
      }

      const angle = Math.atan2(dy, dx);
      const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const vx = Math.cos(snapAngle);
      const vz = Math.sin(snapAngle);

      const deg = Math.round((snapAngle * 180) / Math.PI);
      const dirMap: Record<number, string> = {
        0: 'E',
        45: 'SE',
        90: 'S',
        135: 'SW',
        180: 'W',
        [-180]: 'W',
        [-135]: 'NW',
        [-90]: 'N',
        [-45]: 'NE',
      };
      setActiveDpadDir(dirMap[deg] || 'E');
      applyMovementVector(vx, vz, false);
    },
    [applyMovementVector]
  );

  // Attach non-passive touch listeners for Stick and broad Left Capture Zone
  useEffect(() => {
    const captureEl = leftCaptureRef.current;
    const stickEl = stickZoneRef.current;
    if (controlStyle === 'DPAD_8WAY') return;

    const onNativeTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0] || e.targetTouches[0];
      if (!touch) return;
      activeTouchIdRef.current = touch.identifier;
      beginStickAt(touch.clientX, touch.clientY);
      updateFloatingStick(touch.clientX, touch.clientY);
    };

    const onNativeTouchMove = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === activeTouchIdRef.current) {
          updateFloatingStick(t.clientX, t.clientY);
          return;
        }
      }
      if (e.targetTouches[0]) {
        updateFloatingStick(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
      }
    };

    const onNativeTouchEnd = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchIdRef.current) {
          return; // Still touching with this identifier
        }
      }
      e.stopPropagation();
      endStick();
    };

    const onNativePointerDown = (e: PointerEvent) => {
      if (activeTouchIdRef.current !== null) return;
      e.stopPropagation();
      activePointerIdRef.current = e.pointerId;
      beginStickAt(e.clientX, e.clientY);
      updateFloatingStick(e.clientX, e.clientY);
    };

    const onWindowPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
        return;
      }
      updateFloatingStick(e.clientX, e.clientY);
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
        return;
      }
      endStick();
    };

    if (captureEl) {
      captureEl.addEventListener('touchstart', onNativeTouchStart, { passive: false });
      captureEl.addEventListener('pointerdown', onNativePointerDown);
    }
    if (stickEl) {
      stickEl.addEventListener('touchstart', onNativeTouchStart, { passive: false });
      stickEl.addEventListener('pointerdown', onNativePointerDown);
    }

    window.addEventListener('touchmove', onNativeTouchMove, { passive: false });
    window.addEventListener('touchend', onNativeTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onNativeTouchEnd, { passive: false });
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      if (captureEl) {
        captureEl.removeEventListener('touchstart', onNativeTouchStart);
        captureEl.removeEventListener('pointerdown', onNativePointerDown);
      }
      if (stickEl) {
        stickEl.removeEventListener('touchstart', onNativeTouchStart);
        stickEl.removeEventListener('pointerdown', onNativePointerDown);
      }
      window.removeEventListener('touchmove', onNativeTouchMove);
      window.removeEventListener('touchend', onNativeTouchEnd);
      window.removeEventListener('touchcancel', onNativeTouchEnd);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [controlStyle, beginStickAt, updateFloatingStick, endStick]);

  // Non-passive touch listeners for 8-Way D-Pad mode
  useEffect(() => {
    const dpadEl = dpadZoneRef.current;
    if (!dpadEl || controlStyle !== 'DPAD_8WAY') return;

    const onDpadTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0] || e.targetTouches[0];
      if (!t) return;
      activeTouchIdRef.current = t.identifier;
      triggerHaptic(10);
      updateDpadFromCoords(t.clientX, t.clientY);
    };

    const onDpadTouchMove = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchIdRef.current) {
          updateDpadFromCoords(e.touches[i].clientX, e.touches[i].clientY);
          return;
        }
      }
    };

    const onDpadTouchEnd = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchIdRef.current) return;
      }
      activeTouchIdRef.current = null;
      setActiveDpadDir(null);
      applyMovementVector(0, 0, false);
    };

    dpadEl.addEventListener('touchstart', onDpadTouchStart, { passive: false });
    window.addEventListener('touchmove', onDpadTouchMove, { passive: false });
    window.addEventListener('touchend', onDpadTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onDpadTouchEnd, { passive: false });

    return () => {
      dpadEl.removeEventListener('touchstart', onDpadTouchStart);
      window.removeEventListener('touchmove', onDpadTouchMove);
      window.removeEventListener('touchend', onDpadTouchEnd);
      window.removeEventListener('touchcancel', onDpadTouchEnd);
    };
  }, [controlStyle, updateDpadFromCoords, applyMovementVector]);

  const triggerSkill = (skillId: SkillMoveId) => {
    triggerHaptic(18);
    touchInputRef.current.pendingSkillMove = skillId;
  };

  // Dimensions based on device type
  const baseSizePx = isPhone ? 104 : 160;
  const ringSizePx = isPhone ? 78 : 124;
  const puckSizePx = isPhone ? 38 : 52;

  return (
    <>
      {/* INVISIBLE BROAD LEFT CAPTURE ZONE:
          Allows natural thumb placement anywhere in the bottom-left 45% of the screen */}
      <div
        ref={leftCaptureRef}
        className="fixed left-0 bottom-0 w-[46vw] h-[65vh] z-20 touch-none pointer-events-auto opacity-0"
        aria-hidden="true"
      />

      <div
        className={`fixed inset-x-0 bottom-2 sm:bottom-4 z-30 pointer-events-none flex items-end justify-between ${
          isPhone ? 'px-2 pb-[env(safe-area-inset-bottom,4px)]' : 'px-4 sm:px-6 pb-[env(safe-area-inset-bottom,8px)]'
        } select-none touch-none`}
        aria-label="Mobile & Touch Virtual Gamepad"
      >
        {/* LEFT THUMB: Responsive Analog Stick / 8-Way D-Pad */}
        <div className="pointer-events-auto flex flex-col items-start gap-1.5 sm:gap-2">
          {/* Mode Pill Bar: Switch Mode + Close Dribble + Switch Player (Tablet / Desktop only to keep phone vertical height ultra-compact) */}
          {!isPhone && (
            <div className="flex items-center gap-1 bg-[#090D16]/92 border border-white/15 p-1 rounded-xl shadow-lg backdrop-blur-md">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playUIClick();
                  triggerHaptic(12);
                  setControlStyle((prev) => {
                    if (prev === 'FLOATING_STICK') return 'FIXED_STICK';
                    if (prev === 'FIXED_STICK') return 'DPAD_8WAY';
                    return 'FLOATING_STICK';
                  });
                  endStick();
                  setActiveDpadDir(null);
                }}
                className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-display font-extrabold uppercase tracking-wider bg-[#111827] text-[#CCFF00] border border-[#CCFF00]/40 cursor-pointer active:scale-95 transition-transform"
              >
                {controlStyle === 'FLOATING_STICK'
                  ? 'Stick: Floating'
                  : controlStyle === 'FIXED_STICK'
                  ? 'Stick: Fixed'
                  : 'Mode: D-Pad'}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playUIClick();
                  triggerHaptic(12);
                  const next = !closeDribbleActive;
                  setCloseDribbleActive(next);
                  closeDribbleActiveRef.current = next;
                  touchInputRef.current.closeDribbleHeld = next;
                }}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-display font-extrabold uppercase tracking-wider border transition-colors cursor-pointer active:scale-95 ${
                  closeDribbleActive
                    ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                    : 'bg-[#111827] text-slate-200 border-white/15'
                }`}
              >
                {closeDribbleActive ? 'Tight Dribble' : 'Dribble'}
              </button>

              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic(12);
                  touchInputRef.current.pendingSwitchPlayer = true;
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerHaptic(12);
                  touchInputRef.current.pendingSwitchPlayer = true;
                }}
                className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-display font-bold uppercase tracking-wider bg-[#111827] text-[#38BDF8] border border-[#38BDF8]/40 active:scale-95 cursor-pointer"
              >
                Switch
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            {/* ANALOG THUMBSTICK (Floating Dynamic or Fixed) */}
            {controlStyle !== 'DPAD_8WAY' ? (
              <div
                ref={stickZoneRef}
                style={{
                  width: `${baseSizePx}px`,
                  height: `${baseSizePx}px`,
                }}
                className="relative rounded-3xl bg-[#090D16]/80 border-2 border-white/20 shadow-2xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing backdrop-blur-sm"
              >
                {/* Outer Ring */}
                <div
                  style={{
                    width: `${ringSizePx}px`,
                    height: `${ringSizePx}px`,
                  }}
                  className={`rounded-full border-2 transition-colors pointer-events-none flex items-center justify-center ${
                    autoSprinting
                      ? 'border-[#CCFF00] bg-[#CCFF00]/15'
                      : isStickHeld
                      ? 'border-[#38BDF8] bg-[#38BDF8]/10'
                      : 'border-white/30 bg-black/35'
                  }`}
                >
                  {/* 8-Way Crosshair guides */}
                  <div className="absolute inset-x-2 h-px bg-white/15 pointer-events-none" />
                  <div className="absolute inset-y-2 w-px bg-white/15 pointer-events-none" />

                  {/* Movable Thumbstick Puck */}
                  <div
                    style={{
                      width: `${puckSizePx}px`,
                      height: `${puckSizePx}px`,
                      transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
                    }}
                    className={`rounded-full border-2 shadow-xl flex items-center justify-center pointer-events-none transition-transform duration-75 ${
                      autoSprinting
                        ? 'bg-[#CCFF00] border-white shadow-[#CCFF00]/50'
                        : 'bg-gradient-to-br from-[#CCFF00] to-[#38BDF8] border-white'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#070A10]/90 border border-white/40" />
                  </div>
                </div>

                {/* Status footer inside stick */}
                <div className="absolute bottom-1 inset-x-0 text-center text-[8px] sm:text-[9px] font-mono-tabular uppercase tracking-wider text-[#CCFF00] font-bold pointer-events-none">
                  {autoSprinting ? '⚡ SPRINTING' : isStickHeld ? '✓ ACTIVE' : 'DRAG TO MOVE'}
                </div>
              </div>
            ) : (
              /* 8-WAY TACTILE D-PAD */
              <div
                ref={dpadZoneRef}
                style={{
                  width: `${baseSizePx}px`,
                  height: `${baseSizePx}px`,
                }}
                className="relative rounded-3xl bg-[#090D16]/85 border-2 border-white/25 p-1.5 grid grid-cols-3 grid-rows-3 gap-1 shadow-2xl touch-none"
              >
                {(
                  [
                    { id: 'NW', label: '↖' },
                    { id: 'N', label: '▲' },
                    { id: 'NE', label: '↗' },
                    { id: 'W', label: '◄' },
                    { id: 'CENTER', label: '●' },
                    { id: 'E', label: '►' },
                    { id: 'SW', label: '↙' },
                    { id: 'S', label: '▼' },
                    { id: 'SE', label: '↘' },
                  ] as const
                ).map((btn) => {
                  if (btn.id === 'CENTER') {
                    return (
                      <div
                        key={btn.id}
                        className="rounded-lg bg-[#111827]/70 border border-white/10 flex items-center justify-center text-[9px] font-mono-tabular text-slate-400 pointer-events-none"
                      >
                        D-PAD
                      </div>
                    );
                  }
                  const isAct = activeDpadDir === btn.id;
                  return (
                    <div
                      key={btn.id}
                      className={`rounded-lg border flex items-center justify-center font-bold text-sm pointer-events-none transition-colors ${
                        isAct
                          ? 'bg-[#CCFF00] text-[#070A10] border-white shadow-lg scale-95'
                          : 'bg-[#111827]/90 text-slate-200 border-white/15'
                      }`}
                    >
                      {btn.label}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mobile Phone Micro Utility Badges (Horizontally alongside the stick: zero vertical height overhead!) */}
            {isPhone && (
              <div className="flex flex-col gap-1 mb-0.5">
                <button
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerHaptic(12);
                    touchInputRef.current.pendingSwitchPlayer = true;
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    triggerHaptic(12);
                    touchInputRef.current.pendingSwitchPlayer = true;
                  }}
                  className="w-9 h-8 rounded-lg text-[9px] font-display font-extrabold flex flex-col items-center justify-center bg-[#111827]/90 text-[#38BDF8] border border-[#38BDF8]/40 active:scale-95 cursor-pointer shadow-md"
                  title="Switch Active Player"
                >
                  <span className="text-[10px] leading-none">⇄</span>
                  <span className="text-[7px] leading-tight">SW</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playUIClick();
                    triggerHaptic(12);
                    const next = !closeDribbleActive;
                    setCloseDribbleActive(next);
                    closeDribbleActiveRef.current = next;
                    touchInputRef.current.closeDribbleHeld = next;
                  }}
                  className={`w-9 h-8 rounded-lg text-[8px] font-display font-extrabold flex flex-col items-center justify-center border transition-colors cursor-pointer active:scale-95 shadow-md ${
                    closeDribbleActive
                      ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                      : 'bg-[#111827]/90 text-slate-300 border-white/20'
                  }`}
                  title="Close Dribble"
                >
                  <span className="text-[10px] leading-none">{closeDribbleActive ? '🎯' : '⚽'}</span>
                  <span className="text-[7px] leading-tight">DRB</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    soundEngine.playUIClick();
                    triggerHaptic(12);
                    setControlStyle((prev) => {
                      if (prev === 'FLOATING_STICK') return 'FIXED_STICK';
                      if (prev === 'FIXED_STICK') return 'DPAD_8WAY';
                      return 'FLOATING_STICK';
                    });
                    endStick();
                    setActiveDpadDir(null);
                  }}
                  className="w-9 h-7 rounded-lg text-[10px] font-display font-extrabold flex items-center justify-center bg-[#111827]/90 text-[#CCFF00] border border-white/20 active:scale-95 cursor-pointer shadow-md"
                  title="Stick Mode: Floating / Fixed / D-Pad"
                >
                  {controlStyle === 'FLOATING_STICK' ? '🕹' : controlStyle === 'FIXED_STICK' ? '🔒' : '➕'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Floating Skill Move Feedback Pill */}
        {activeSkillName && (
          <div className="mb-14 sm:mb-16 mx-auto bg-[#090D16]/95 border border-[#CCFF00] px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-xl shadow-2xl text-center backdrop-blur-md animate-bounce">
            <div className="text-[8px] sm:text-[9px] font-mono-tabular uppercase tracking-widest text-[#38BDF8]">
              SKILL MOVE
            </div>
            <div className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-[#CCFF00]">
              {activeSkillName}
            </div>
          </div>
        )}

        {/* RIGHT THUMB: Ergonomic Arcade Action Cluster */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 sm:gap-2">
          {/* Quick Skill Move Row (Collapsible on mobile phone) */}
          <div className="flex items-center gap-1 bg-[#090D16]/92 border border-white/15 px-2 py-0.5 rounded-lg shadow-lg backdrop-blur-md">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSkillBar(!showSkillBar);
              }}
              className="px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-mono-tabular font-bold text-slate-400 hover:text-white cursor-pointer"
            >
              {showSkillBar ? 'Skills ▾' : 'Skills ▸'}
            </button>

            {showSkillBar &&
              (Object.keys(SKILL_MOVES_CATALOG) as SkillMoveId[]).map((skillId) => {
                const spec = SKILL_MOVES_CATALOG[skillId];
                return (
                  <button
                    key={skillId}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      triggerSkill(skillId);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      triggerSkill(skillId);
                    }}
                    className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg bg-[#111827] active:bg-[#CCFF00] active:text-[#070A10] text-slate-200 border border-white/10 text-center transition-colors cursor-pointer"
                  >
                    <div className="text-[9px] sm:text-[10px] font-display font-extrabold uppercase tracking-wide text-[#CCFF00] active:text-[#070A10]">
                      {spec.name.split(' ')[0]}
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Ergonomic 3-Column Action Cluster */}
          <div className="grid grid-cols-3 gap-1 sm:gap-1.5 items-center">
            {/* Column 1: Dynamic THROUGH (Attacking) / SWITCH (Defending) & PASS (Attacking) / PRESS (Defending) */}
            <div className="flex flex-col gap-1 sm:gap-1.5">
              {/* Dynamic Action 1: THROUGH BALL / SWITCH DEFENDER */}
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic(14);
                  if (userHasBall) {
                    touchInputRef.current.pendingThroughBall = true;
                  } else {
                    touchInputRef.current.pendingSwitchPlayer = true;
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerHaptic(14);
                  if (userHasBall) {
                    touchInputRef.current.pendingThroughBall = true;
                  } else {
                    touchInputRef.current.pendingSwitchPlayer = true;
                  }
                }}
                className={`${
                  isPhone ? 'w-14 h-11' : 'w-18 h-13 sm:w-20 sm:h-15'
                } rounded-2xl bg-[#090D16]/95 border-2 border-[#38BDF8] text-[#38BDF8] active:bg-[#38BDF8] active:text-[#070A10] shadow-xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform`}
              >
                <span className="font-display font-extrabold text-[11px] sm:text-xs uppercase tracking-wider">
                  {userHasBall ? 'THROUGH' : 'SWITCH'}
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular opacity-85">
                  {userHasBall ? 'CROSS' : 'DEFENDER'}
                </span>
              </button>

              {/* PASS BUTTON (Tap = Ground Pass, Swipe Up = Lob/Upper Pass) / DEFENDING PRESS */}
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic(12);
                  setPassPressed(true);
                  setIsSwipingUpPass(false);
                  const t = e.changedTouches[0] || e.targetTouches[0];
                  if (t) passTouchStartYRef.current = t.clientY;
                }}
                onTouchMove={(e) => {
                  if (passTouchStartYRef.current !== null) {
                    e.stopPropagation();
                    const t = e.changedTouches[0] || e.targetTouches[0];
                    if (t) {
                      const dy = t.clientY - passTouchStartYRef.current;
                      if (dy < -16) {
                        if (!isSwipingUpPass) triggerHaptic(16);
                        setIsSwipingUpPass(true);
                      } else if (dy > -6) {
                        setIsSwipingUpPass(false);
                      }
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setPassPressed(false);
                  if (isSwipingUpPass) {
                    triggerHaptic(20);
                    soundEngine.playKick(0.72);
                    touchInputRef.current.pendingUpperPass = true;
                    setIsSwipingUpPass(false);
                  } else {
                    triggerHaptic(14);
                    touchInputRef.current.pendingPass = true;
                  }
                  passTouchStartYRef.current = null;
                }}
                onTouchCancel={() => {
                  setPassPressed(false);
                  setIsSwipingUpPass(false);
                  passTouchStartYRef.current = null;
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerHaptic(12);
                  setPassPressed(true);
                  setIsSwipingUpPass(false);
                  passTouchStartYRef.current = e.clientY;
                }}
                onPointerMove={(e) => {
                  if (passTouchStartYRef.current !== null) {
                    e.stopPropagation();
                    const dy = e.clientY - passTouchStartYRef.current;
                    if (dy < -16) {
                      setIsSwipingUpPass(true);
                    } else if (dy > -6) {
                      setIsSwipingUpPass(false);
                    }
                  }
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setPassPressed(false);
                  if (isSwipingUpPass) {
                    triggerHaptic(20);
                    soundEngine.playKick(0.72);
                    touchInputRef.current.pendingUpperPass = true;
                    setIsSwipingUpPass(false);
                  } else {
                    triggerHaptic(14);
                    touchInputRef.current.pendingPass = true;
                  }
                  passTouchStartYRef.current = null;
                }}
                className={`${
                  isPhone ? 'w-14 h-12' : 'w-18 h-15 sm:w-20 sm:h-16'
                } rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${
                  isSwipingUpPass
                    ? 'bg-cyan-500 text-[#070A10] border-cyan-300 scale-105 shadow-cyan-500/50'
                    : passPressed
                    ? 'bg-emerald-400 text-[#070A10] border-white'
                    : 'bg-[#090D16]/95 border-emerald-400 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-0.5">
                  <span
                    className={`text-[9px] font-bold ${
                      isSwipingUpPass ? 'animate-bounce text-[#070A10]' : 'text-cyan-400'
                    }`}
                  >
                    ▲
                  </span>
                  <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                    {userHasBall ? (isSwipingUpPass ? 'UPPER' : 'PASS') : 'PRESS'}
                  </span>
                </div>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular opacity-90 leading-tight">
                  {userHasBall ? (isSwipingUpPass ? 'RELEASE' : '↑ LOB') : 'CONTAIN'}
                </span>
              </button>
            </div>

            {/* Column 2: SKILL / JOCKEY & SPRINT / TURBO */}
            <div className="flex flex-col gap-1 sm:gap-1.5">
              {/* SKILL MOVE / JOCKEY BUTTON */}
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const skills: SkillMoveId[] = [
                    'elastico',
                    'roulette',
                    'stepover_burst',
                    'rainbow_flick',
                  ];
                  const pick = skills[Math.floor(Math.random() * skills.length)];
                  triggerSkill(pick);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const skills: SkillMoveId[] = [
                    'elastico',
                    'roulette',
                    'stepover_burst',
                    'rainbow_flick',
                  ];
                  const pick = skills[Math.floor(Math.random() * skills.length)];
                  triggerSkill(pick);
                }}
                className={`${
                  isPhone ? 'w-14 h-11' : 'w-18 h-13 sm:w-20 sm:h-15'
                } rounded-2xl bg-[#090D16]/95 border-2 border-amber-400 text-amber-300 active:bg-amber-400 active:text-[#070A10] shadow-xl flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform`}
              >
                <span className="font-display font-extrabold text-[11px] sm:text-xs uppercase tracking-wider">
                  {userHasBall ? 'SKILL' : 'JOCKEY'}
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular opacity-85">
                  {userHasBall ? 'FEINT' : 'CONTAIN'}
                </span>
              </button>

              {/* SPRINT BUTTON (Tap to lock turbo, hold for temporary burst) */}
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic(14);
                  sprintPressStartRef.current = performance.now();
                  setSprintButtonHeld(true);
                  sprintButtonHeldRef.current = true;
                  touchInputRef.current.sprintHeld = true;
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const heldMs = performance.now() - sprintPressStartRef.current;
                  setSprintButtonHeld(false);
                  sprintButtonHeldRef.current = false;
                  if (heldMs < 260) {
                    const nextLock = !sprintLockedRef.current;
                    triggerHaptic(nextLock ? [15, 30, 15] : 10);
                    sprintLockedRef.current = nextLock;
                    setSprintLocked(nextLock);
                    touchInputRef.current.sprintHeld = nextLock;
                    setAutoSprinting(nextLock);
                  } else {
                    touchInputRef.current.sprintHeld = sprintLockedRef.current;
                    setAutoSprinting(sprintLockedRef.current);
                  }
                }}
                onTouchCancel={() => {
                  setSprintButtonHeld(false);
                  sprintButtonHeldRef.current = false;
                  touchInputRef.current.sprintHeld = sprintLockedRef.current;
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'touch') return;
                  e.stopPropagation();
                  triggerHaptic(14);
                  sprintPressStartRef.current = performance.now();
                  setSprintButtonHeld(true);
                  sprintButtonHeldRef.current = true;
                  touchInputRef.current.sprintHeld = true;
                }}
                onPointerUp={(e) => {
                  if (e.pointerType === 'touch') return;
                  e.stopPropagation();
                  const heldMs = performance.now() - sprintPressStartRef.current;
                  setSprintButtonHeld(false);
                  sprintButtonHeldRef.current = false;
                  if (heldMs < 260) {
                    const nextLock = !sprintLockedRef.current;
                    sprintLockedRef.current = nextLock;
                    setSprintLocked(nextLock);
                    touchInputRef.current.sprintHeld = nextLock;
                    setAutoSprinting(nextLock);
                  } else {
                    touchInputRef.current.sprintHeld = sprintLockedRef.current;
                    setAutoSprinting(sprintLockedRef.current);
                  }
                }}
                className={`${
                  isPhone ? 'w-14 h-12' : 'w-18 h-15 sm:w-20 sm:h-16'
                } rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${
                  sprintButtonHeld || sprintLocked || autoSprinting
                    ? 'bg-[#CCFF00] text-[#070A10] border-white scale-105 shadow-[#CCFF00]/40'
                    : 'bg-[#090D16]/95 border-[#CCFF00]/80 text-[#CCFF00]'
                }`}
              >
                <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                  {sprintLocked ? '⚡ TURBO' : 'SPRINT'}
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular opacity-90">
                  {sprintLocked ? 'LOCKED' : 'TAP/HOLD'}
                </span>
              </button>
            </div>

            {/* Column 3: DYNAMIC SHOOT (with ball) OR SLIDE TACKLE (without ball) */}
            {userHasBall ? (
              /* POWER SHOOT BUTTON */
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic(18);
                  setShootPressed(true);
                  touchInputRef.current.shootCharging = true;
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  triggerHaptic([20, 40, 20]);
                  setShootPressed(false);
                  touchInputRef.current.shootCharging = false;
                  touchInputRef.current.pendingShootRelease = true;
                }}
                onTouchCancel={() => {
                  setShootPressed(false);
                  touchInputRef.current.shootCharging = false;
                  touchInputRef.current.pendingShootRelease = true;
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerHaptic(18);
                  setShootPressed(true);
                  touchInputRef.current.shootCharging = true;
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  triggerHaptic([20, 40, 20]);
                  setShootPressed(false);
                  touchInputRef.current.shootCharging = false;
                  touchInputRef.current.pendingShootRelease = true;
                }}
                className={`${
                  isPhone ? 'w-16 h-[96px]' : 'w-20 h-29 sm:w-24 sm:h-33'
                } rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                  shootPressed
                    ? 'bg-[#EF4444] text-white border-white scale-95 shadow-red-500/50'
                    : 'bg-[#090D16]/95 border-[#EF4444] text-[#EF4444]'
                }`}
              >
                <span className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider">
                  SHOOT
                </span>
                <span className="text-[8px] sm:text-[9px] font-mono-tabular opacity-90 mt-0.5">
                  CHARGE
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular text-slate-300 mt-0.5">
                  STRIKE
                </span>
              </button>
            ) : (
              /* DYNAMIC SLIDE TACKLE BUTTON */
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  triggerHaptic([25, 30, 25]);
                  setSlidePressed(true);
                  touchInputRef.current.pendingSlideTackle = true;
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setSlidePressed(false);
                }}
                onTouchCancel={() => {
                  setSlidePressed(false);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  triggerHaptic([25, 30, 25]);
                  setSlidePressed(true);
                  touchInputRef.current.pendingSlideTackle = true;
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setSlidePressed(false);
                }}
                className={`${
                  isPhone ? 'w-16 h-[96px]' : 'w-20 h-29 sm:w-24 sm:h-33'
                } rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${
                  slidePressed
                    ? 'bg-amber-400 text-[#070A10] border-white scale-95 shadow-amber-400/60'
                    : 'bg-[#090D16]/95 border-amber-400 text-amber-400 animate-pulse'
                }`}
              >
                <div className="flex items-center gap-0.5">
                  <span className="text-sm font-bold">⚡</span>
                  <span className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider">
                    SLIDE
                  </span>
                </div>
                <span className="text-[8px] sm:text-[9px] font-mono-tabular uppercase font-bold opacity-95 mt-0.5 text-white">
                  TACKLE
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tabular text-amber-300 mt-0.5">
                  SNATCH
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// Also export alias for semantic clarity
export const MobileTouchController = IPadTouchController;

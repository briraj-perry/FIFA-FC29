import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SKILL_MOVES_CATALOG, SkillMoveId, TouchControllerInput } from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface IPadTouchControllerProps {
  touchInputRef: React.MutableRefObject<TouchControllerInput>;
  activeSkillName: string | null;
  userHasBall?: boolean;
}

type LeftControlStyle = 'FLOATING_STICK' | 'DPAD_8WAY';

export const IPadTouchController: React.FC<IPadTouchControllerProps> = ({
  touchInputRef,
  activeSkillName,
  userHasBall = true,
}) => {
  const [controlStyle, setControlStyle] = useState<LeftControlStyle>('FLOATING_STICK');
  const stickZoneRef = useRef<HTMLDivElement | null>(null);
  const dpadZoneRef = useRef<HTMLDivElement | null>(null);

  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const touchOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sprintButtonHeldRef = useRef<boolean>(false);
  const sprintLockedRef = useRef<boolean>(false);
  const sprintPressStartRef = useRef<number>(0);
  const closeDribbleActiveRef = useRef<boolean>(false);

  const [stickOriginOffset, setStickOriginOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
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

  const MAX_RADIUS = 44;
  const DEADZONE_PX = 2;

  const applyMovementVector = useCallback(
    (rawX: number, rawZ: number, _isOuterSprint: boolean) => {
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
        angleDiff < 0.16
          ? rawAngle * 0.4 + nearestCardinal * 0.6
          : rawAngle;

      // High responsiveness: smooth directional movement
      const effectiveMag = Math.min(1, 0.72 + len * 0.28);
      touchInputRef.current.moveX = Math.cos(finalAngle) * effectiveMag;
      touchInputRef.current.moveZ = Math.sin(finalAngle) * effectiveMag;

      const shouldSprint =
        (sprintButtonHeldRef.current || sprintLockedRef.current) &&
        !closeDribbleActiveRef.current;
      touchInputRef.current.sprintHeld = shouldSprint;
      setAutoSprinting(shouldSprint);
    },
    [touchInputRef]
  );

  const beginStickAt = useCallback((clientX: number, clientY: number) => {
    const zone = stickZoneRef.current;
    setIsStickHeld(true);

    if (!zone) {
      touchOriginRef.current = { x: clientX, y: clientY };
      setStickOriginOffset({ x: 0, y: 0 });
      setKnobOffset({ x: 0, y: 0 });
      return;
    }

    const rect = zone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const offsetX = Math.max(-22, Math.min(22, clientX - centerX));
    const offsetY = Math.max(-22, Math.min(22, clientY - centerY));

    touchOriginRef.current = {
      x: centerX + offsetX,
      y: centerY + offsetY,
    };
    setStickOriginOffset({ x: offsetX, y: offsetY });
    setKnobOffset({ x: 0, y: 0 });
  }, []);

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

      if (dist > MAX_RADIUS * 1.25) {
        const pull = dist - MAX_RADIUS * 1.25;
        touchOriginRef.current.x += (dx / dist) * pull;
        touchOriginRef.current.y += (dy / dist) * pull;
        const zone = stickZoneRef.current;
        if (zone) {
          const rect = zone.getBoundingClientRect();
          setStickOriginOffset({
            x: Math.max(-26, Math.min(26, touchOriginRef.current.x - (rect.left + rect.width / 2))),
            y: Math.max(-26, Math.min(26, touchOriginRef.current.y - (rect.top + rect.height / 2))),
          });
        }
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
      applyMovementVector(nx * normalizedMag, ny * normalizedMag, false);
    },
    [applyMovementVector]
  );

  const endStick = useCallback(() => {
    activeTouchIdRef.current = null;
    activePointerIdRef.current = null;
    setIsStickHeld(false);
    setStickOriginOffset({ x: 0, y: 0 });
    setKnobOffset({ x: 0, y: 0 });
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

  // Attach NON-PASSIVE native touch + window pointer listeners so iPadOS Safari never cancels thumb drags!
  useEffect(() => {
    const stickEl = stickZoneRef.current;
    if (!stickEl || controlStyle !== 'FLOATING_STICK') return;

    const onNativeTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0] || e.targetTouches[0];
      if (!touch) return;
      activeTouchIdRef.current = touch.identifier;
      beginStickAt(touch.clientX, touch.clientY);
      // Apply immediate directional nudge if user tapped off-center on the stick ring!
      const rect = stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const tapDx = touch.clientX - cx;
      const tapDy = touch.clientY - cy;
      if (Math.hypot(tapDx, tapDy) > 10) {
        touchOriginRef.current = { x: cx, y: cy };
        setStickOriginOffset({ x: 0, y: 0 });
        updateFloatingStick(touch.clientX, touch.clientY);
      }
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
      // Fallback if touch identifier shifted
      if (e.targetTouches[0]) {
        updateFloatingStick(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
      }
    };

    const onNativeTouchEnd = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouchIdRef.current) {
          return; // Still holding!
        }
      }
      e.stopPropagation();
      endStick();
    };

    const onNativePointerDown = (e: PointerEvent) => {
      if (activeTouchIdRef.current !== null) return;
      e.stopPropagation();
      activePointerIdRef.current = e.pointerId;
      const rect = stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      beginStickAt(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - cx, e.clientY - cy) > 10) {
        touchOriginRef.current = { x: cx, y: cy };
        setStickOriginOffset({ x: 0, y: 0 });
        updateFloatingStick(e.clientX, e.clientY);
      }
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

    stickEl.addEventListener('touchstart', onNativeTouchStart, { passive: false });
    window.addEventListener('touchmove', onNativeTouchMove, { passive: false });
    window.addEventListener('touchend', onNativeTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onNativeTouchEnd, { passive: false });
    stickEl.addEventListener('pointerdown', onNativePointerDown);
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      stickEl.removeEventListener('touchstart', onNativeTouchStart);
      window.removeEventListener('touchmove', onNativeTouchMove);
      window.removeEventListener('touchend', onNativeTouchEnd);
      window.removeEventListener('touchcancel', onNativeTouchEnd);
      stickEl.removeEventListener('pointerdown', onNativePointerDown);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [controlStyle, beginStickAt, updateFloatingStick, endStick]);

  // Attach NON-PASSIVE native touch + pointer listeners for 8-Way D-Pad mode
  useEffect(() => {
    const dpadEl = dpadZoneRef.current;
    if (!dpadEl || controlStyle !== 'DPAD_8WAY') return;

    const onDpadTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0] || e.targetTouches[0];
      if (!t) return;
      activeTouchIdRef.current = t.identifier;
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

    const onDpadPointerDown = (e: PointerEvent) => {
      if (activeTouchIdRef.current !== null) return;
      e.stopPropagation();
      activePointerIdRef.current = e.pointerId;
      updateDpadFromCoords(e.clientX, e.clientY);
    };

    const onDpadPointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
        return;
      }
      updateDpadFromCoords(e.clientX, e.clientY);
    };

    const onDpadPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) {
        return;
      }
      activePointerIdRef.current = null;
      setActiveDpadDir(null);
      applyMovementVector(0, 0, false);
    };

    dpadEl.addEventListener('touchstart', onDpadTouchStart, { passive: false });
    window.addEventListener('touchmove', onDpadTouchMove, { passive: false });
    window.addEventListener('touchend', onDpadTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onDpadTouchEnd, { passive: false });
    dpadEl.addEventListener('pointerdown', onDpadPointerDown);
    window.addEventListener('pointermove', onDpadPointerMove);
    window.addEventListener('pointerup', onDpadPointerUp);
    window.addEventListener('pointercancel', onDpadPointerUp);

    return () => {
      dpadEl.removeEventListener('touchstart', onDpadTouchStart);
      window.removeEventListener('touchmove', onDpadTouchMove);
      window.removeEventListener('touchend', onDpadTouchEnd);
      window.removeEventListener('touchcancel', onDpadTouchEnd);
      dpadEl.removeEventListener('pointerdown', onDpadPointerDown);
      window.removeEventListener('pointermove', onDpadPointerMove);
      window.removeEventListener('pointerup', onDpadPointerUp);
      window.removeEventListener('pointercancel', onDpadPointerUp);
    };
  }, [controlStyle, updateDpadFromCoords, applyMovementVector]);

  const triggerSkill = (skillId: SkillMoveId) => {
    touchInputRef.current.pendingSkillMove = skillId;
  };

  return (
    <div
      className="fixed inset-x-0 bottom-4 sm:bottom-6 z-30 pointer-events-none flex items-end justify-between px-3 sm:px-6 pb-[env(safe-area-inset-bottom,6px)] select-none touch-none"
      aria-label="iPad & Touch Virtual Gamepad"
    >
      {/* LEFT THUMB: Forgiving Floating Analog Stick OR 8-Way D-Pad */}
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        {/* Top Mode Pill Bar: Switch between Stick & D-Pad + Close Dribble + Switch Player */}
        <div className="flex flex-wrap items-center gap-1 bg-[#090D16]/90 border border-white/15 p-1 rounded-xl shadow-lg">
          <button
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playUIClick();
              setControlStyle((prev) =>
                prev === 'FLOATING_STICK' ? 'DPAD_8WAY' : 'FLOATING_STICK'
              );
              endStick();
              setActiveDpadDir(null);
            }}
            className="px-2.5 py-1 rounded-lg text-[10px] font-display font-extrabold uppercase tracking-wider bg-[#111827] text-[#CCFF00] border border-[#CCFF00]/40 cursor-pointer"
          >
            {controlStyle === 'FLOATING_STICK' ? 'Mode: Smart Stick' : 'Mode: 8-Way D-Pad'}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playUIClick();
              const next = !closeDribbleActive;
              setCloseDribbleActive(next);
              closeDribbleActiveRef.current = next;
              touchInputRef.current.closeDribbleHeld = next;
            }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-display font-extrabold uppercase tracking-wider border transition-colors cursor-pointer ${
              closeDribbleActive
                ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                : 'bg-[#111827] text-slate-200 border-white/15'
            }`}
          >
            {closeDribbleActive ? 'Dribble: Tight' : 'Close Dribble'}
          </button>

          <button
            onTouchStart={(e) => {
              e.stopPropagation();
              touchInputRef.current.pendingSwitchPlayer = true;
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              touchInputRef.current.pendingSwitchPlayer = true;
            }}
            className="px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider bg-[#111827] text-[#38BDF8] border border-[#38BDF8]/40 active:scale-95 cursor-pointer"
          >
            Switch
          </button>
        </div>

        {controlStyle === 'FLOATING_STICK' ? (
          /* FORGIVING FLOATING-ORIGIN ANALOG THUMBSTICK (Non-Passive Native iPad Touch + Window Pointer) */
          <div
            ref={stickZoneRef}
            className="relative w-44 h-44 sm:w-48 sm:h-48 rounded-3xl bg-[#090D16]/75 border-2 border-white/25 shadow-2xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
          >
            {/* Outer Auto-Sprint Ring Indicator */}
            <div
              className={`w-32 h-32 sm:w-36 sm:h-36 rounded-full border-2 transition-colors pointer-events-none flex items-center justify-center ${
                autoSprinting
                  ? 'border-[#CCFF00] bg-[#CCFF00]/15'
                  : isStickHeld
                  ? 'border-[#38BDF8] bg-[#38BDF8]/10'
                  : 'border-white/30 bg-black/30'
              }`}
              style={{
                transform: `translate3d(${stickOriginOffset.x}px, ${stickOriginOffset.y}px, 0)`,
              }}
            >
              {/* 8-Way Compass Notches */}
              <div className="w-18 h-18 rounded-full border border-dashed border-white/25 pointer-events-none" />
              <div className="absolute inset-x-3 h-px bg-white/15 pointer-events-none" />
              <div className="absolute inset-y-3 w-px bg-white/15 pointer-events-none" />

              {/* Movable Thumbstick Puck */}
              <div
                className={`w-15 h-15 rounded-full border-2 shadow-xl flex items-center justify-center pointer-events-none ${
                  autoSprinting
                    ? 'bg-[#CCFF00] border-white'
                    : 'bg-gradient-to-br from-[#CCFF00] to-[#38BDF8] border-white'
                }`}
                style={{
                  transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
                }}
              >
                <div className="w-5 h-5 rounded-full bg-[#070A10]/85 border border-white/40" />
              </div>
            </div>

            <div className="absolute bottom-1.5 inset-x-0 text-center text-[9px] font-mono-tabular uppercase tracking-wider text-[#CCFF00] font-bold pointer-events-none">
              {autoSprinting
                ? '⚡ SPRINTING PLAYER'
                : isStickHeld
                ? '✓ MOVING PLAYER'
                : 'TOUCH OR DRAG TO MOVE'}
            </div>
          </div>
        ) : (
          /* 8-WAY TACTILE D-PAD CONTROLLER (Non-Passive Native iPad Touch + Window Pointer) */
          <div
            ref={dpadZoneRef}
            className="relative w-44 h-44 sm:w-48 sm:h-48 rounded-3xl bg-[#090D16]/85 border-2 border-white/25 p-2 grid grid-cols-3 grid-rows-3 gap-1.5 shadow-2xl touch-none"
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
                    className="rounded-xl bg-[#111827]/70 border border-white/10 flex items-center justify-center text-[10px] font-mono-tabular text-slate-400 pointer-events-none"
                  >
                    8-WAY
                  </div>
                );
              }
              const isAct = activeDpadDir === btn.id;
              return (
                <div
                  key={btn.id}
                  className={`rounded-xl border flex items-center justify-center font-bold text-base pointer-events-none transition-colors ${
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
      </div>

      {/* CENTER SKILL MOVE FEEDBACK PILL */}
      {activeSkillName && (
        <div className="mb-16 mx-auto bg-[#090D16]/95 border border-[#CCFF00] px-4 py-1.5 rounded-lg shadow-xl text-center">
          <div className="text-[9px] font-mono-tabular uppercase tracking-widest text-[#38BDF8]">
            SKILL MOVE
          </div>
          <div className="font-display font-extrabold text-base uppercase tracking-wider text-[#CCFF00]">
            {activeSkillName}
          </div>
        </div>
      )}

      {/* RIGHT THUMB: Ergonomic Action Cluster + 1-Tap Skill Bar */}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {/* 4 Signature Skill Move Quick Buttons */}
        <div className="grid grid-cols-4 gap-1 bg-[#090D16]/90 border border-white/15 p-1 rounded-xl shadow-xl">
          {(Object.keys(SKILL_MOVES_CATALOG) as SkillMoveId[]).map((skillId) => {
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
                className="px-2 py-1 rounded-lg bg-[#111827] active:bg-[#CCFF00] active:text-[#070A10] text-slate-200 border border-white/10 text-center transition-colors cursor-pointer"
              >
                <div className="text-[10px] font-display font-extrabold uppercase tracking-wide text-[#CCFF00] active:text-[#070A10]">
                  {spec.name.split(' ')[0]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Ergonomic 4-Button Right Thumb Cluster */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 items-center">
          {/* Column 1: THROUGH BALL & PASS / TACKLE */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                touchInputRef.current.pendingThroughBall = true;
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                touchInputRef.current.pendingThroughBall = true;
              }}
              className="w-16 h-13 sm:w-20 sm:h-15 rounded-2xl bg-[#090D16]/95 border-2 border-[#38BDF8] text-[#38BDF8] active:bg-[#38BDF8] active:text-[#070A10] shadow-xl flex flex-col items-center justify-center cursor-pointer"
            >
              <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                THROUGH
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono-tabular opacity-85">
                CROSS
              </span>
            </button>

            {/* PASS BUTTON WITH SWIPE-UP FOR UPPER PASS */}
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
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
                    if (dy < -18) {
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
                  soundEngine.playKick(0.72);
                  touchInputRef.current.pendingUpperPass = true;
                  setIsSwipingUpPass(false);
                } else {
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
                setPassPressed(true);
                setIsSwipingUpPass(false);
                passTouchStartYRef.current = e.clientY;
              }}
              onPointerMove={(e) => {
                if (passTouchStartYRef.current !== null) {
                  e.stopPropagation();
                  const dy = e.clientY - passTouchStartYRef.current;
                  if (dy < -18) {
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
                  soundEngine.playKick(0.72);
                  touchInputRef.current.pendingUpperPass = true;
                  setIsSwipingUpPass(false);
                } else {
                  touchInputRef.current.pendingPass = true;
                }
                passTouchStartYRef.current = null;
              }}
              className={`w-16 h-15 sm:w-20 sm:h-16 rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                isSwipingUpPass
                  ? 'bg-cyan-500 text-[#070A10] border-cyan-300 scale-105 shadow-cyan-500/50'
                  : passPressed
                  ? 'bg-emerald-400 text-[#070A10] border-white'
                  : 'bg-[#090D16]/95 border-emerald-400 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-0.5">
                <span className={`text-[10px] font-bold ${isSwipingUpPass ? 'animate-bounce text-[#070A10]' : 'text-cyan-400'}`}>
                  ▲
                </span>
                <span className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider">
                  {isSwipingUpPass ? 'UPPER' : 'PASS'}
                </span>
              </div>
              <span className="text-[7.5px] sm:text-[8.5px] font-mono-tabular opacity-90 leading-tight">
                {isSwipingUpPass ? 'RELEASE: LOB' : '↑ SWIPE: UPPER'}
              </span>
            </button>
          </div>

          {/* Column 2: SKILL MOVE & SPRINT */}
          <div className="flex flex-col gap-1.5 sm:gap-2">
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
              className="w-16 h-13 sm:w-20 sm:h-15 rounded-2xl bg-[#090D16]/95 border-2 border-amber-400 text-amber-300 active:bg-amber-400 active:text-[#070A10] shadow-xl flex flex-col items-center justify-center cursor-pointer"
            >
              <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                SKILL
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono-tabular opacity-85">
                FEINT
              </span>
            </button>

            <button
              onTouchStart={(e) => {
                e.stopPropagation();
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
              className={`w-16 h-15 sm:w-20 sm:h-16 rounded-2xl border-2 shadow-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                sprintButtonHeld || sprintLocked || autoSprinting
                  ? 'bg-[#CCFF00] text-[#070A10] border-white scale-105 shadow-[#CCFF00]/40'
                  : 'bg-[#090D16]/95 border-[#CCFF00]/80 text-[#CCFF00]'
              }`}
            >
              <span className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider">
                {sprintLocked ? '⚡ TURBO' : 'SPRINT'}
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono-tabular opacity-90">
                {sprintLocked ? 'LOCKED ON' : 'TAP / HOLD'}
              </span>
            </button>
          </div>

          {/* Column 3: DYNAMIC SHOOT (with ball) OR SLIDING MOVE (without ball) */}
          {userHasBall ? (
            /* WITH BALL: POWER SHOOT BUTTON */
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                setShootPressed(true);
                touchInputRef.current.shootCharging = true;
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
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
                setShootPressed(true);
                touchInputRef.current.shootCharging = true;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setShootPressed(false);
                touchInputRef.current.shootCharging = false;
                touchInputRef.current.pendingShootRelease = true;
              }}
              className={`w-20 h-29 sm:w-24 sm:h-33 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-transform ${
                shootPressed
                  ? 'bg-[#EF4444] text-white border-white scale-95 shadow-red-500/50'
                  : 'bg-[#090D16]/95 border-[#EF4444] text-[#EF4444]'
              }`}
            >
              <span className="font-display font-extrabold text-base sm:text-lg uppercase tracking-wider">
                SHOOT
              </span>
              <span className="text-[9px] font-mono-tabular opacity-90 mt-0.5">
                TAP OR HOLD
              </span>
              <span className="text-[8px] font-mono-tabular text-slate-300 mt-1">
                POWER STRIKE
              </span>
            </button>
          ) : (
            /* WITHOUT BALL: DYNAMIC SLIDE TACKLE & SNATCH BALL BUTTON */
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
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
                setSlidePressed(true);
                touchInputRef.current.pendingSlideTackle = true;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setSlidePressed(false);
              }}
              className={`w-20 h-29 sm:w-24 sm:h-33 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                slidePressed
                  ? 'bg-amber-400 text-[#070A10] border-white scale-95 shadow-amber-400/60'
                  : 'bg-[#090D16]/95 border-amber-400 text-amber-400 animate-pulse'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-base font-bold">⚡</span>
                <span className="font-display font-extrabold text-base sm:text-lg uppercase tracking-wider">
                  SLIDE
                </span>
              </div>
              <span className="text-[9px] font-mono-tabular uppercase font-bold opacity-95 mt-0.5 text-white">
                SNATCH BALL
              </span>
              <span className="text-[7.5px] font-mono-tabular text-amber-300 mt-1">
                LUNGE TACKLE
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

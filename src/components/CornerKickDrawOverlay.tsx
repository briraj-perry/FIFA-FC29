import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TouchControllerInput } from '../types/game';
import { isPhoneScreen, triggerHaptic } from '../utils/mobileDetection';

interface CornerKickDrawOverlayProps {
  takerName: string;
  teamLabel: string;
  touchInputRef: React.MutableRefObject<TouchControllerInput>;
  onExecuteKick?: () => void;
  cornerZSign?: -1 | 1;
}

type CornerPreset = 'NEAR_POST' | 'PENALTY_SPOT' | 'FAR_POST' | 'OLIMPICO';
type ArcHeight = 'LOW' | 'MEDIUM' | 'HIGH';

export const CornerKickDrawOverlay: React.FC<CornerKickDrawOverlayProps> = ({
  takerName,
  teamLabel,
  touchInputRef,
  onExecuteKick,
  cornerZSign = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [activePreset, setActivePreset] = useState<CornerPreset | null>('PENALTY_SPOT');
  const [arcHeight, setArcHeight] = useState<ArcHeight>('MEDIUM');
  const [targetLabel, setTargetLabel] = useState<string>('👑 BELLINGHAM · PENALTY SPOT HEADER');
  const animFrameRef = useRef<number | null>(null);

  // Generate preset curve in screen space based on viewport size and corner side
  const generatePresetPoints = useCallback((preset: CornerPreset): Array<{ x: number; y: number }> => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Ball starts near the bottom-center/bottom corner of the screen in first-person view
    const startX = cornerZSign > 0 ? w * 0.72 : w * 0.28;
    const startY = h * 0.88;

    let targetX = w * 0.5;
    let targetY = h * 0.42;
    let ctrlX = w * 0.5;
    let ctrlY = h * 0.6;

    if (preset === 'NEAR_POST') {
      targetX = cornerZSign > 0 ? w * 0.62 : w * 0.38;
      targetY = h * 0.48;
      ctrlX = cornerZSign > 0 ? w * 0.68 : w * 0.32;
      ctrlY = h * 0.65;
    } else if (preset === 'PENALTY_SPOT') {
      targetX = w * 0.50;
      targetY = h * 0.42;
      ctrlX = cornerZSign > 0 ? w * 0.58 : w * 0.42;
      ctrlY = h * 0.62;
    } else if (preset === 'FAR_POST') {
      targetX = cornerZSign > 0 ? w * 0.36 : w * 0.64;
      targetY = h * 0.38;
      ctrlX = cornerZSign > 0 ? w * 0.48 : w * 0.52;
      ctrlY = h * 0.58;
    } else if (preset === 'OLIMPICO') {
      targetX = cornerZSign > 0 ? w * 0.52 : w * 0.48;
      targetY = h * 0.34;
      ctrlX = cornerZSign > 0 ? w * 0.70 : w * 0.30;
      ctrlY = h * 0.50;
    }

    // Sample quadratic bezier curve into 24 points
    const sampled: Array<{ x: number; y: number }> = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const inv = 1 - t;
      const x = inv * inv * startX + 2 * inv * t * ctrlX + t * t * targetX;
      const y = inv * inv * startY + 2 * inv * t * ctrlY + t * t * targetY;
      sampled.push({ x, y });
    }
    return sampled;
  }, [cornerZSign]);

  // Set default initial path on mount
  useEffect(() => {
    const pts = generatePresetPoints('PENALTY_SPOT');
    setPoints(pts);
    touchInputRef.current.cornerPathPoints = pts;
    touchInputRef.current.cornerPreset = 'PENALTY_SPOT';
    touchInputRef.current.cornerArcHeight = 'MEDIUM';
  }, [generatePresetPoints, touchInputRef]);

  // Determine tactical target label based on final drawn point
  const updateTargetLabel = useCallback((finalPt: { x: number; y: number }) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const normX = finalPt.x / w;
    const normY = finalPt.y / h;

    if (normY < 0.36 && Math.abs(normX - 0.5) < 0.16) {
      setTargetLabel('🔥 OLIMPICO · DIRECT GOAL CURL');
    } else if (normX > 0.58) {
      setTargetLabel(cornerZSign > 0 ? '⚡ MBAPPÉ · NEAR POST FLICK' : '🚀 VALVERDE · FAR POST VOLLEY');
    } else if (normX < 0.42) {
      setTargetLabel(cornerZSign > 0 ? '🚀 VALVERDE · FAR POST VOLLEY' : '⚡ MBAPPÉ · NEAR POST FLICK');
    } else {
      setTargetLabel('👑 BELLINGHAM · PENALTY SPOT HEADER');
    }
  }, [cornerZSign]);

  // Draw smooth glowing canvas curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.04;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (points.length >= 2) {
        // Glowing Neon Outer Glow
        ctx.save();
        ctx.shadowColor = '#FACC15';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#FACC15';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Inner Bright Core
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
        ctx.restore();

        // Animated Traveling Pulse Beads along the curve
        const numBeads = 4;
        for (let b = 0; b < numBeads; b++) {
          const beadT = (time * 0.4 + b / numBeads) % 1;
          const idxFloat = beadT * (points.length - 1);
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(points.length - 1, i0 + 1);
          const frac = idxFloat - i0;
          const p0 = points[i0];
          const p1 = points[i1];
          if (p0 && p1) {
            const bx = p0.x + (p1.x - p0.x) * frac;
            const by = p0.y + (p1.y - p0.y) * frac;
            ctx.beginPath();
            ctx.arc(bx, by, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00FFFF';
            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 12;
            ctx.fill();
          }
        }

        // Start Point: Ball Anchor Ring
        const start = points[0];
        ctx.beginPath();
        ctx.arc(start.x, start.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#FACC15';
        ctx.shadowColor = '#FACC15';
        ctx.shadowBlur = 14;
        ctx.fill();

        // End Point: Animated Target Crosshair
        const end = points[points.length - 1];
        const pulse = 1 + Math.sin(time * 6) * 0.2;
        ctx.save();
        ctx.translate(end.x, end.y);

        // Outer pulsing ring
        ctx.beginPath();
        ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Inner target reticle
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#22C55E';
        ctx.fill();

        // Reticle tick marks
        const r = 20 * pulse;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(0, -r + 6);
        ctx.moveTo(0, r);
        ctx.lineTo(0, r - 6);
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r + 6, 0);
        ctx.moveTo(r, 0);
        ctx.lineTo(r - 6, 0);
        ctx.stroke();

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [points]);

  // Resize canvas to match screen
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pointer Handlers for drawing
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only capture if not clicking HUD buttons (which stopPropagation)
    setIsDrawing(true);
    setActivePreset(null);
    const pt = { x: e.clientX, y: e.clientY };
    setPoints([pt]);
    touchInputRef.current.cornerPathPoints = [pt];
    touchInputRef.current.cornerPreset = null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const pt = { x: e.clientX, y: e.clientY };
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        const dx = pt.x - last.x;
        const dy = pt.y - last.y;
        if (Math.hypot(dx, dy) < 8) return prev; // Min step filter
      }
      const updated = [...prev, pt];
      touchInputRef.current.cornerPathPoints = updated;
      updateTargetLabel(pt);
      return updated;
    });
  };

  const handlePointerUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (points.length >= 2) {
        updateTargetLabel(points[points.length - 1]);
      }
    }
  };

  const applyPreset = (preset: CornerPreset, label: string) => {
    triggerHaptic(12);
    setActivePreset(preset);
    setTargetLabel(label);
    const pts = generatePresetPoints(preset);
    setPoints(pts);
    touchInputRef.current.cornerPathPoints = pts;
    touchInputRef.current.cornerPreset = preset;
  };

  const executeKick = () => {
    triggerHaptic([20, 40, 20]);
    touchInputRef.current.pendingCornerKick = true;
    touchInputRef.current.cornerArcHeight = arcHeight;
    if (onExecuteKick) onExecuteKick();
  };

  const clearAndRedraw = () => {
    triggerHaptic(10);
    setActivePreset(null);
    setPoints([]);
    touchInputRef.current.cornerPathPoints = [];
    touchInputRef.current.cornerPreset = null;
    setTargetLabel('Draw ball path towards the penalty box with finger or mouse!');
  };

  const isPhone = isPhoneScreen();

  return (
    <div
      className="absolute inset-0 z-30 select-none overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 2D Trajectory Drawing Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Top First-Person Header Badge */}
      <div className="absolute top-2.5 sm:top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none px-2 max-w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-amber-400/60 shadow-xl shadow-amber-500/10">
          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-400 animate-ping" />
          <span className="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-amber-300">
            1ST PERSON CORNER · {takerName || 'TAKER'}
          </span>
          <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold border-l border-slate-700 pl-1.5 sm:pl-2">
            {teamLabel}
          </span>
        </div>

        {/* Dynamic Target Banner */}
        <div className="mt-1 sm:mt-2 flex items-center gap-1.5 px-3 py-0.5 sm:py-1 rounded-lg bg-black/80 backdrop-blur-md border border-emerald-500/50 text-emerald-400 text-[11px] sm:text-xs font-bold shadow-lg">
          <span>{targetLabel}</span>
        </div>

        {/* Instruction Guidance */}
        <div className="mt-1 text-[10px] sm:text-[11px] text-slate-300 font-medium drop-shadow-md text-center">
          {isDrawing
            ? 'Release to lock trajectory or draw more curve!'
            : '✍️ Draw with finger to curve the ball, or pick a preset'}
        </div>
      </div>

      {/* Bottom Controls Dock (Presets, Arc Height, Redraw & Execute) */}
      <div
        className="absolute bottom-2 sm:bottom-5 inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 flex flex-col items-center gap-1.5 sm:gap-2 pointer-events-auto pb-[env(safe-area-inset-bottom,4px)]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Tactical Quick Presets Row */}
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-xl bg-slate-900/92 backdrop-blur-lg border border-slate-700/80 shadow-2xl max-w-full">
          <button
            type="button"
            onClick={() => applyPreset('PENALTY_SPOT', '👑 BELLINGHAM · PENALTY SPOT HEADER')}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center gap-1 ${
              activePreset === 'PENALTY_SPOT'
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40 scale-105'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            👑 Penalty {isPhone ? '' : 'Spot'}
          </button>

          <button
            type="button"
            onClick={() => applyPreset('NEAR_POST', '⚡ MBAPPÉ · NEAR POST FLICK')}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center gap-1 ${
              activePreset === 'NEAR_POST'
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40 scale-105'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            ⚡ Near Post
          </button>

          <button
            type="button"
            onClick={() => applyPreset('FAR_POST', '🚀 VALVERDE · FAR POST VOLLEY')}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center gap-1 ${
              activePreset === 'FAR_POST'
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40 scale-105'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            🚀 Far Post
          </button>

          <button
            type="button"
            onClick={() => applyPreset('OLIMPICO', '🔥 OLIMPICO · DIRECT GOAL CURL')}
            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all flex items-center gap-1 ${
              activePreset === 'OLIMPICO'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40 scale-105'
                : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
            }`}
          >
            🔥 Olimpico
          </button>
        </div>

        {/* Action Row: Arc Height Selector, Redraw, and Execute Button */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {/* Arc Height Choice */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 backdrop-blur-lg border border-slate-700/80">
            <span className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 px-1">ARC:</span>
            {(['LOW', 'MEDIUM', 'HIGH'] as ArcHeight[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  setArcHeight(h);
                  touchInputRef.current.cornerArcHeight = h;
                }}
                className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[9px] sm:text-[10px] font-black transition-all ${
                  arcHeight === h
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Redraw Button */}
          <button
            type="button"
            onClick={clearAndRedraw}
            className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow-lg active:scale-95 transition-all"
          >
            ↺ Redraw
          </button>

          {/* Execute Kick Button */}
          <button
            type="button"
            onClick={executeKick}
            className="px-4 py-1.5 sm:px-6 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-xl shadow-emerald-500/30 flex items-center gap-1.5 border border-emerald-300/60 active:scale-95 transition-all animate-pulse"
          >
            <span>⚡ KICK CORNER</span>
          </button>
        </div>
      </div>
    </div>
  );
};

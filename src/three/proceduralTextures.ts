import * as THREE from 'three';
import {
  BallStyleId,
  PlayerEquipmentLoadout,
  resolveAwayKitPalette,
  StadiumId,
} from '../types/game';

export function createPitchGrassTexture(
  maxAnisotropy: number,
  stadiumId: StadiumId = 'santiago_bernabeu'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;

  // Lush vibrant Champions League broadcast turf base
  ctx.fillStyle = '#1e682e';
  ctx.fillRect(0, 0, w, h);

  const marginX = 96;
  const marginY = 64;
  const fieldW = w - marginX * 2;
  const fieldH = h - marginY * 2;
  const midX = w / 2;
  const midY = h / 2;

  if (stadiumId === 'wembley_arch') {
    // Classic Wembley Checkered Grid Mowing Pattern
    const cols = 18;
    const rows = 10;
    const cw = fieldW / cols;
    const rh = fieldH / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = (c + r) % 2 === 0 ? '#267d39' : '#1c622b';
        ctx.fillRect(marginX + c * cw, marginY + r * rh, cw, rh);
      }
    }
  } else if (stadiumId === 'allianz_arena') {
    // Bavarian Radial Concentric Rings + Vertical Stripes
    const numStripes = 18;
    const stripeW = fieldW / numStripes;
    for (let i = 0; i < numStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#257a37' : '#1b602a';
      ctx.fillRect(marginX + i * stripeW, marginY, stripeW, fieldH);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(marginX, marginY, fieldW, fieldH);
    ctx.clip();
    for (let rad = 850; rad >= 100; rad -= 95) {
      ctx.fillStyle =
        Math.floor(rad / 95) % 2 === 0
          ? 'rgba(255, 255, 255, 0.05)'
          : 'rgba(0, 0, 0, 0.03)';
      ctx.beginPath();
      ctx.arc(midX, midY, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (stadiumId === 'san_siro') {
    // Tight 24-Band Italian Serie A Mowing Stripes
    const numStripes = 24;
    const stripeW = fieldW / numStripes;
    for (let i = 0; i < numStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#247836' : '#1a5e29';
      ctx.fillRect(marginX + i * stripeW, marginY, stripeW, fieldH);
    }
  } else {
    // Santiago Bernabéu 18-Stripe Championship Cut
    const numStripes = 18;
    const stripeW = fieldW / numStripes;
    for (let i = 0; i < numStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#267e3a' : '#1c632c';
      ctx.fillRect(marginX + i * stripeW, marginY, stripeW, fieldH);
    }
    const numRows = 8;
    const rowH = fieldH / numRows;
    for (let r = 0; r < numRows; r++) {
      ctx.fillStyle = r % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
      ctx.fillRect(marginX, marginY + r * rowH, fieldW, rowH);
    }
  }

  // Organic turf micro-grain blades, directional mower sheen & subtle goalmouth wear
  for (let i = 0; i < 65000; i++) {
    const gx = Math.random() * w;
    const gy = Math.random() * h;
    ctx.fillStyle =
      i % 4 === 0
        ? 'rgba(163, 238, 128, 0.055)'
        : i % 4 === 1
        ? 'rgba(34, 108, 48, 0.048)'
        : i % 4 === 2
        ? 'rgba(255, 255, 255, 0.022)'
        : 'rgba(4, 18, 8, 0.065)';
    ctx.fillRect(gx, gy, 2, 3);
  }

  // Broadcast floodlight radial illumination highlight at center pitch & soft corner vignette
  const floodGrad = ctx.createRadialGradient(midX, midY, fieldH * 0.12, midX, midY, fieldW * 0.65);
  floodGrad.addColorStop(0, 'rgba(255, 253, 240, 0.06)');
  floodGrad.addColorStop(0.65, 'rgba(255, 253, 240, 0.0)');
  floodGrad.addColorStop(1, 'rgba(2, 10, 5, 0.18)');
  ctx.fillStyle = floodGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle realistic goalmouth & center-circle turf wear
  const wearSpots = [
    [marginX + 36, midY, 78],
    [marginX + fieldW - 36, midY, 78],
    [midX, midY, 58],
  ];
  wearSpots.forEach(([wx, wy, wr]) => {
    const wGrad = ctx.createRadialGradient(wx, wy, 4, wx, wy, wr);
    wGrad.addColorStop(0, 'rgba(62, 48, 28, 0.17)');
    wGrad.addColorStop(1, 'rgba(62, 48, 28, 0)');
    ctx.fillStyle = wGrad;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Subtle outer chalk glow / turf contact shadow under pitch lines for 3D crispness
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 4;
  ctx.strokeStyle = 'rgba(241, 247, 253, 0.92)';
  ctx.fillStyle = 'rgba(241, 247, 253, 0.92)';
  ctx.lineWidth = 6.0;

  // Outer Touchlines & Goal Lines
  ctx.strokeRect(marginX, marginY, fieldW, fieldH);

  // Halfway Line
  ctx.beginPath();
  ctx.moveTo(midX, marginY);
  ctx.lineTo(midX, marginY + fieldH);
  ctx.stroke();

  // Center Circle & Kick-Off Spot
  const centerRadius = fieldH * 0.145;
  ctx.beginPath();
  ctx.arc(midX, midY, centerRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(midX, midY, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right Penalty Areas (18-yard box)
  const penW = fieldW * 0.16;
  const penH = fieldH * 0.58;
  const penTop = midY - penH / 2;

  ctx.strokeRect(marginX, penTop, penW, penH);
  ctx.strokeRect(marginX + fieldW - penW, penTop, penW, penH);

  // Left & Right 6-Yard Goal Areas
  const goalBoxW = fieldW * 0.058;
  const goalBoxH = fieldH * 0.28;
  const goalBoxTop = midY - goalBoxH / 2;

  ctx.strokeRect(marginX, goalBoxTop, goalBoxW, goalBoxH);
  ctx.strokeRect(marginX + fieldW - goalBoxW, goalBoxTop, goalBoxW, goalBoxH);

  // Penalty Spots & Penalty D-Arcs
  const leftSpotX = marginX + fieldW * 0.11;
  const rightSpotX = marginX + fieldW - fieldW * 0.11;

  ctx.beginPath();
  ctx.arc(leftSpotX, midY, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(rightSpotX, midY, 6.5, 0, Math.PI * 2);
  ctx.fill();

  const dArcRadius = centerRadius * 0.92;
  ctx.beginPath();
  ctx.arc(leftSpotX, midY, dArcRadius, -0.92, 0.92);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rightSpotX, midY, dArcRadius, Math.PI - 0.92, Math.PI + 0.92);
  ctx.stroke();

  // Corner Arcs
  const cornerR = 26;
  ctx.beginPath();
  ctx.arc(marginX, marginY, cornerR, 0, Math.PI * 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(marginX + fieldW, marginY, cornerR, Math.PI * 0.5, Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(marginX + fieldW, marginY + fieldH, cornerR, Math.PI, Math.PI * 1.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(marginX, marginY + fieldH, cornerR, Math.PI * 1.5, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createPitchRoughnessTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#bcbcbc';
  ctx.fillRect(0, 0, 1024, 512);

  const numStripes = 18;
  const marginX = 48;
  const fieldW = 1024 - marginX * 2;
  const stripeW = fieldW / numStripes;

  for (let i = 0; i < numStripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#a4a4a4' : '#d4d4d4';
    ctx.fillRect(marginX + i * stripeW, 32, stripeW, 512 - 64);
  }

  // Subtle dew variation across the grass
  for (let i = 0; i < 8000; i++) {
    const rx = Math.random() * 1024;
    const ry = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rx, ry, 3, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createPitchNormalMap(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const bladeWave =
        Math.sin(x * 0.55) * 12 +
        Math.cos(y * 0.95) * 10 +
        Math.sin((x + y) * 0.35) * 6;
      const nx = Math.max(
        0,
        Math.min(255, 128 + Math.floor(bladeWave + (Math.random() - 0.5) * 38))
      );
      const ny = Math.max(
        0,
        Math.min(255, 128 + Math.floor((Math.random() - 0.5) * 38))
      );
      data[i * 4 + 0] = nx;
      data[i * 4 + 1] = ny;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
  }
  const normalTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(64, 42);
  normalTex.colorSpace = THREE.NoColorSpace;
  normalTex.needsUpdate = true;
  return normalTex;
}

export function createBallNormalMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Neutral normal base (#8080FF)
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, 512, 512);

  // Micro-dimple aerodynamic grip pattern across the ball surface
  for (let y = 4; y < 512; y += 8) {
    for (let x = (y % 16 === 0 ? 4 : 8); x < 512; x += 8) {
      ctx.fillStyle = 'rgb(114, 142, 255)';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.fillStyle = 'rgb(142, 114, 255)';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Deep thermally bonded panel seam channels
  const centers = [
    [128, 128],
    [384, 128],
    [256, 256],
    [128, 384],
    [384, 384],
    [64, 256],
    [448, 256],
    [256, 64],
    [256, 448],
  ];

  centers.forEach(([cx, cy], idx) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((idx * Math.PI) / 5);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const r = 56;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgb(92, 92, 220)';
    ctx.stroke();
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createVIPSuiteRibbonTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090D16';
  ctx.fillRect(0, 0, 1024, 128);

  // Warm Executive Glass Suites along the middle tier
  const suiteCount = 16;
  const sw = 1024 / suiteCount;
  for (let i = 0; i < suiteCount; i++) {
    const grad = ctx.createLinearGradient(0, 18, 0, 108);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.3, '#fef3c7');
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.fillRect(i * sw + 6, 22, sw - 12, 84);

    // Mullions
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(i * sw + sw / 2 - 2, 22, 4, 84);
  }

  // Upper & lower architectural concrete ledges
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 1024, 20);
  ctx.fillRect(0, 108, 1024, 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createAllianzCushionTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a060a';
  ctx.fillRect(0, 0, 512, 256);

  const cols = 8;
  const rows = 4;
  const cw = 512 / cols;
  const rh = 256 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cw + cw / 2;
      const cy = r * rh + rh / 2;

      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, cw * 0.48);
      if ((r + c) % 3 === 0) {
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(0.6, '#e11d48');
        grad.addColorStop(1, '#4c0519');
      } else {
        grad.addColorStop(0, '#fb7185');
        grad.addColorStop(0.55, '#be123c');
        grad.addColorStop(1, '#310712');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rh * 0.46);
      ctx.lineTo(cx + cw * 0.46, cy);
      ctx.lineTo(cx, cy + rh * 0.46);
      ctx.lineTo(cx - cw * 0.46, cy);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBallTexture(ballStyle: BallStyleId, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const palettes: Record<BallStyleId, { base: string; panel1: string; panel2: string; seam: string }> = {
    fc26_orbital: {
      base: '#F1F5F9',
      panel1: '#0A0E17',
      panel2: '#A3E635',
      seam: '#334155',
    },
    champions_gold: {
      base: '#FEF3C7',
      panel1: '#92400E',
      panel2: '#D97706',
      seam: '#1E293B',
    },
    winter_flare: {
      base: '#EA580C',
      panel1: '#0F172A',
      panel2: '#FACC15',
      seam: '#1E293B',
    },
    cyber_chrome: {
      base: '#1E293B',
      panel1: '#0284C7',
      panel2: '#84CC16',
      seam: '#94A3B8',
    },
  };

  const p = palettes[ballStyle] || palettes.fc26_orbital;

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle micro-grip texture on the ball shell
  ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  for (let y = 0; y < 1024; y += 8) {
    for (let x = (y % 16 === 0 ? 0 : 4); x < 1024; x += 8) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Connecting orbital speed ribs between star panels so rotation is super clear when dribbling!
  ctx.strokeStyle = p.panel2;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(0, 512);
  ctx.lineTo(1024, 512);
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 1024);
  ctx.stroke();

  const centers = [
    [256, 256],
    [768, 256],
    [512, 512],
    [256, 768],
    [768, 768],
    [128, 512],
    [896, 512],
    [512, 128],
    [512, 896],
  ];

  centers.forEach(([cx, cy], idx) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((idx * Math.PI) / 5);

    // Outer Champions Star / Pentagon Panel
    ctx.fillStyle = idx % 2 === 0 ? p.panel2 : p.panel1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 118 : 66;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = p.seam;
    ctx.stroke();

    // Inner High-Contrast Core Ring (makes ball spin immediately readable at 60fps)
    ctx.fillStyle = idx % 2 === 0 ? p.panel1 : p.panel2;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.base;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createJerseyTexture(
  loadout: PlayerEquipmentLoadout,
  isHome: boolean,
  squadNumber: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const awayKit = resolveAwayKitPalette(loadout);

  // Tone down pure #FFFFFF / ultra-bright #FACC15 slightly so jerseys have rich fabric texture and zero HDR glow
  const rawPrimary = isHome ? loadout.kitPrimaryColor : awayKit.primary;
  const upperRaw = rawPrimary.toUpperCase();
  const primary =
    upperRaw === '#FFFFFF' || upperRaw === '#F8FAFC'
      ? '#CBD5E1'
      : upperRaw === '#FACC15'
      ? '#E5A910'
      : rawPrimary;
  const secondary = isHome ? loadout.kitSecondaryColor : awayKit.secondary;
  const pattern = isHome ? loadout.kitPattern : awayKit.pattern;

  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle 3D torso contour shading (darker flanks, natural chest definition & muscle folds)
  const contourGrad = ctx.createLinearGradient(0, 0, 512, 0);
  contourGrad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
  contourGrad.addColorStop(0.18, 'rgba(0, 0, 0, 0.05)');
  contourGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
  contourGrad.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)');
  contourGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  ctx.fillStyle = contourGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle breathable jacquard mesh micro-weave across fabric
  ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
  for (let y = 0; y < 512; y += 6) {
    for (let x = (y % 12 === 0 ? 0 : 3); x < 512; x += 6) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  if (pattern === 'stripes') {
    ctx.fillStyle = secondary;
    const stripeCount = 8;
    const sw = 512 / stripeCount;
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillRect(i * sw, 0, sw * 0.52, 512);
    }
  } else if (pattern === 'sash') {
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(130, 0);
    ctx.lineTo(512, 390);
    ctx.lineTo(512, 512);
    ctx.lineTo(390, 512);
    ctx.closePath();
    ctx.fill();
  } else if (pattern === 'chevron') {
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 30;
    for (let y = 115; y <= 255; y += 70) {
      ctx.beginPath();
      ctx.moveTo(64, y - 36);
      ctx.lineTo(256, y + 42);
      ctx.lineTo(448, y - 36);
      ctx.stroke();
    }
  }

  // Athletic side-ribbed laser ventilation panels
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(0, 36, 28, 444);
  ctx.fillRect(484, 36, 28, 444);

  // Shoulder 3-Stripe Pro Trim + Collar & Hem Accent Band
  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, 512, 28);
  ctx.fillRect(0, 486, 512, 26);

  // Chest Club Crest Shield & Gold Star
  ctx.save();
  ctx.translate(366, 106);
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(24, -17);
  ctx.lineTo(20, 15);
  ctx.lineTo(0, 28);
  ctx.lineTo(-20, 15);
  ctx.lineTo(-24, -17);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();

  const upperPrimary = primary.toUpperCase();
  const isLightPrimary =
    upperPrimary === '#D8E0EA' ||
    upperPrimary === '#CBD5E1' ||
    upperPrimary === '#E2E8F0' ||
    upperPrimary === '#CCFF00' ||
    upperPrimary === '#FACC15' ||
    upperPrimary === '#E5A910' ||
    upperPrimary === '#EAB308' ||
    upperPrimary === '#D4AF37';

  ctx.fillStyle = isLightPrimary ? '#0A0E17' : '#FFFFFF';
  ctx.font = 'italic 800 174px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(squadNumber), 256, 278);

  ctx.strokeStyle = isLightPrimary ? secondary : '#0A0E17';
  ctx.lineWidth = 7;
  ctx.strokeText(String(squadNumber), 256, 278);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createAdBoardTexture(
  maxAnisotropy: number,
  stadiumId: StadiumId = 'santiago_bernabeu'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, 2048, 128);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
  for (let x = 0; x < 2048; x += 16) {
    ctx.fillRect(x, 0, 2, 128);
  }

  const stadiumBannerLabel =
    stadiumId === 'wembley_arch'
      ? 'WEMBLEY STADIUM LONDON'
      : stadiumId === 'allianz_arena'
      ? 'ALLIANZ ARENA MÜNCHEN'
      : stadiumId === 'san_siro'
      ? 'STADIO SAN SIRO MILANO'
      : 'ESTADIO SANTIAGO BERNABÉU';

  ctx.fillStyle = '#84cc16';
  ctx.fillRect(0, 0, 2048, 5);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(0, 123, 2048, 5);

  const banners = [
    { text: 'FC 26 · HYPERMOTION V', color: '#A3E635' },
    { text: stadiumBannerLabel, color: '#E2E8F0' },
    { text: 'DYNAMIC TACTICAL AI', color: '#38BDF8' },
    { text: 'PRO LOCKER ROOM 3D', color: '#FACC15' },
  ];

  const slotW = 2048 / banners.length;
  ctx.font = 'italic 800 50px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  banners.forEach((b, idx) => {
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, slotW * idx + slotW / 2, 66);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.76)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}


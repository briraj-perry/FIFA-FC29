import * as THREE from 'three';
import { StadiumId } from '../types/game';
import {
  createAdBoardTexture,
  createAllianzCushionTexture,
  createPitchGrassTexture,
  createPitchNormalMap,
  createPitchRoughnessTexture,
  createVIPSuiteRibbonTexture,
} from './proceduralTextures';

export const PITCH_HALF_W = 43.3; // Playable touchline X: -43.3 to +43.3 (86.6m)
export const PITCH_HALF_Z = 27.6; // Playable touchline Z: -27.6 to +27.6 (55.2m)
export const GOAL_HALF_WIDTH = 5.6; // Goal mouth Z: -5.6 to +5.6 (11.2m)
export const GOAL_HEIGHT = 3.35;
export const GOAL_DEPTH = 3.1;

export interface StadiumEnvironmentObjects {
  root: THREE.Group;
  pitchMesh: THREE.Mesh;
  crowdInstancedMesh: THREE.InstancedMesh;
  crowdBasePositions: Float32Array;
  supporterFlagsMesh: THREE.InstancedMesh;
  supporterFlagsBase: Float32Array;
  leftGoalNetMeshes: THREE.Mesh[];
  rightGoalNetMeshes: THREE.Mesh[];
  adBoardMaterials: THREE.MeshStandardMaterial[];
  cornerFlags: THREE.Mesh[];
  architectureGroup: THREE.Group;
  homeManagerGroup: THREE.Group;
  awayManagerGroup: THREE.Group;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function createStadiumArena(
  maxAnisotropy: number,
  initialStadium: StadiumId = 'santiago_bernabeu'
): StadiumEnvironmentObjects {
  const root = new THREE.Group();

  // 1. Main Turf Pitch Plane (96m x 64m) with Normal & Roughness Maps
  const grassTex = createPitchGrassTexture(maxAnisotropy, initialStadium);
  const roughTex = createPitchRoughnessTexture();
  const normalTex = createPitchNormalMap();

  const pitchGeo = new THREE.PlaneGeometry(96, 64, 24, 16);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    roughnessMap: roughTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: 0.78,
    metalness: 0.03,
    envMapIntensity: 0.82,
  });
  const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.receiveShadow = true;
  root.add(pitchMesh);

  // 1B. Extended Lush Turf Surround Apron (138m x 96m at y = -0.01) so iPad wide angles see rich turf around the pitch
  const outerTurfGeo = new THREE.PlaneGeometry(138, 96);
  const outerTurfMat = new THREE.MeshStandardMaterial({
    color: 0x1a5e2a,
    roughnessMap: roughTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.14, 0.14),
    roughness: 0.84,
    metalness: 0.02,
    envMapIntensity: 0.55,
  });
  const outerTurfMesh = new THREE.Mesh(outerTurfGeo, outerTurfMat);
  outerTurfMesh.rotation.x = -Math.PI / 2;
  outerTurfMesh.position.y = -0.01;
  outerTurfMesh.receiveShadow = true;
  root.add(outerTurfMesh);

  // 2. Massive Outer Stadium Technical Track Floor (380m x 320m at y = -0.03) — eliminates any background void
  const apronGeo = new THREE.PlaneGeometry(380, 320);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x141e2e,
    roughness: 0.88,
    metalness: 0.08,
    envMapIntensity: 0.45,
  });
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.rotation.x = -Math.PI / 2;
  apronMesh.position.y = -0.03;
  apronMesh.receiveShadow = true;
  root.add(apronMesh);

  // 3. 3D Regulation Goals (Left at -PITCH_HALF_W, Right at +PITCH_HALF_W)
  const leftGoalNetMeshes: THREE.Mesh[] = [];
  const rightGoalNetMeshes: THREE.Mesh[] = [];

  const postMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbe4ee,
    roughness: 0.25,
    metalness: 0.35,
    clearcoat: 0.8,
    envMapIntensity: 0.5,
  });

  const stanchionMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.8,
  });

  const netCanvas = document.createElement('canvas');
  netCanvas.width = 64;
  netCanvas.height = 64;
  const nctx = netCanvas.getContext('2d')!;
  nctx.clearRect(0, 0, 64, 64);
  nctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
  nctx.lineWidth = 3;
  nctx.strokeRect(2, 2, 60, 60);
  nctx.beginPath();
  nctx.moveTo(0, 0);
  nctx.lineTo(64, 64);
  nctx.moveTo(64, 0);
  nctx.lineTo(0, 64);
  nctx.stroke();

  const netTex = new THREE.CanvasTexture(netCanvas);
  netTex.wrapS = THREE.RepeatWrapping;
  netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(22, 8);

  const buildGoal = (sideSign: -1 | 1, netStore: THREE.Mesh[]) => {
    const goalGroup = new THREE.Group();
    goalGroup.position.set(sideSign * PITCH_HALF_W, 0, 0);

    const postRadius = 0.11;
    const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, GOAL_HEIGHT, 16);

    const nearPost = new THREE.Mesh(postGeo, postMat);
    nearPost.position.set(0, GOAL_HEIGHT / 2, -GOAL_HALF_WIDTH);
    nearPost.castShadow = true;
    goalGroup.add(nearPost);

    const farPost = new THREE.Mesh(postGeo, postMat);
    farPost.position.set(0, GOAL_HEIGHT / 2, GOAL_HALF_WIDTH);
    farPost.castShadow = true;
    goalGroup.add(farPost);

    const crossbarGeo = new THREE.CylinderGeometry(
      postRadius,
      postRadius,
      GOAL_HALF_WIDTH * 2 + postRadius * 2,
      16
    );
    const crossbar = new THREE.Mesh(crossbarGeo, postMat);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.set(0, GOAL_HEIGHT, 0);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    const backDepth = sideSign * GOAL_DEPTH;
    const backBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, GOAL_HALF_WIDTH * 2, 10),
      stanchionMat
    );
    backBar.rotation.x = Math.PI / 2;
    backBar.position.set(backDepth, 0.06, 0);
    goalGroup.add(backBar);

    const netMat = new THREE.MeshStandardMaterial({
      map: netTex,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.75,
    });

    const backNet = new THREE.Mesh(
      new THREE.PlaneGeometry(GOAL_HALF_WIDTH * 2, GOAL_HEIGHT, 12, 8),
      netMat
    );
    backNet.rotation.y = Math.PI / 2;
    backNet.position.set(backDepth, GOAL_HEIGHT / 2, 0);
    goalGroup.add(backNet);
    netStore.push(backNet);

    const topNet = new THREE.Mesh(
      new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF_WIDTH * 2, 6, 12),
      netMat
    );
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(backDepth / 2, GOAL_HEIGHT, 0);
    goalGroup.add(topNet);
    netStore.push(topNet);

    const sideNetGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT, 6, 6);
    const leftSideNet = new THREE.Mesh(sideNetGeo, netMat);
    leftSideNet.position.set(backDepth / 2, GOAL_HEIGHT / 2, -GOAL_HALF_WIDTH);
    goalGroup.add(leftSideNet);
    netStore.push(leftSideNet);

    const rightSideNet = new THREE.Mesh(sideNetGeo, netMat);
    rightSideNet.position.set(backDepth / 2, GOAL_HEIGHT / 2, GOAL_HALF_WIDTH);
    goalGroup.add(rightSideNet);
    netStore.push(rightSideNet);

    root.add(goalGroup);
  };

  buildGoal(-1, leftGoalNetMeshes);
  buildGoal(1, rightGoalNetMeshes);

  // 4. Corner Flags
  const cornerFlags: THREE.Mesh[] = [];
  const cornerCoords = [
    [-PITCH_HALF_W, -PITCH_HALF_Z],
    [PITCH_HALF_W, -PITCH_HALF_Z],
    [-PITCH_HALF_W, PITCH_HALF_Z],
    [PITCH_HALF_W, PITCH_HALF_Z],
  ];
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8);
  const flagGeo = new THREE.PlaneGeometry(0.45, 0.3, 4, 2);
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0xa3e635,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });

  cornerCoords.forEach(([cx, cz]) => {
    const pole = new THREE.Mesh(poleGeo, postMat);
    pole.position.set(cx, 0.75, cz);
    root.add(pole);

    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(cx + 0.22, 1.32, cz);
    root.add(flag);
    cornerFlags.push(flag);
  });

  // 5. Calibrated LED Perimeter Advertising Boards (Expanded perimeter around pitch)
  const adBoardTex = createAdBoardTexture(maxAnisotropy, initialStadium);
  const adBoardMat = new THREE.MeshStandardMaterial({
    map: adBoardTex,
    emissiveMap: adBoardTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.32,
    roughness: 0.4,
    metalness: 0.2,
  });

  const adBoardMaterials = [adBoardMat];

  const longAdGeo = new THREE.BoxGeometry(106, 1.15, 0.38);
  const northAd = new THREE.Mesh(longAdGeo, adBoardMat);
  northAd.position.set(0, 0.58, -34.2);
  northAd.castShadow = true;
  root.add(northAd);

  const southAd = new THREE.Mesh(longAdGeo, adBoardMat);
  southAd.position.set(0, 0.58, 34.2);
  southAd.castShadow = true;
  root.add(southAd);

  const shortAdGeo = new THREE.BoxGeometry(0.38, 1.15, 68);
  const westAd = new THREE.Mesh(shortAdGeo, adBoardMat);
  westAd.position.set(-53.0, 0.58, 0);
  root.add(westAd);

  const eastAd = new THREE.Mesh(shortAdGeo, adBoardMat);
  eastAd.position.set(53.0, 0.58, 0);
  root.add(eastAd);

  // 6. Touchline Technical Dugouts, Substitute Benches & Animated Managers
  const buildTechnicalDugout = (xPos: number, isHomeBench: boolean) => {
    const dugout = new THREE.Group();
    dugout.position.set(xPos, 0, -32.2);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.3,
    });
    const glassCanopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
      metalness: 0.1,
    });

    // Shelter Back & Roof
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.9, 0.15), glassCanopyMat);
    backWall.position.set(0, 0.95, -0.8);
    dugout.add(backWall);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.12, 1.8), frameMat);
    roof.position.set(0, 1.92, -0.1);
    dugout.add(roof);

    // 6 Recaro Bucket Bench Seats
    const seatMat = new THREE.MeshStandardMaterial({
      color: isHomeBench ? 0x334155 : 0xbe123c,
      roughness: 0.5,
    });
    for (let s = 0; s < 6; s++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.55), seatMat);
      seat.position.set(-2.5 + s * 1.0, 0.45, -0.45);
      dugout.add(seat);
    }

    root.add(dugout);

    // Animated Touchline Manager Figure in Suit
    const manager = new THREE.Group();
    manager.position.set(xPos * 0.75, 0, -30.5);
    const suitMat = new THREE.MeshStandardMaterial({
      color: isHomeBench ? 0x1e293b : 0x090d16,
      roughness: 0.6,
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.75, 0.26), suitMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    manager.add(torso);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.75, 0.22), suitMat);
    legs.position.y = 0.4;
    manager.add(legs);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.5 })
    );
    head.position.y = 1.68;
    manager.add(head);

    root.add(manager);
    return manager;
  };

  const homeManagerGroup = buildTechnicalDugout(-12, true);
  const awayManagerGroup = buildTechnicalDugout(12, false);

  // 7. Expanded Grand 3-Tier Stadium Bowl + 360° Continuous Enclosed Wrap-Around Wall
  const vipTex = createVIPSuiteRibbonTexture(maxAnisotropy);
  vipTex.repeat.set(5, 1);
  const vipMat = new THREE.MeshStandardMaterial({
    map: vipTex,
    emissiveMap: vipTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.4,
  });

  const standMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.82,
    metalness: 0.18,
  });

  // 360° Continuous Outer Stadium Bowl Enclosure (prevents any corner gaps or background void on iPad!)
  const continuousLowerBowl = new THREE.Mesh(
    new THREE.CylinderGeometry(78, 62, 16, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
  );
  continuousLowerBowl.scale.set(1.22, 1, 0.86);
  continuousLowerBowl.position.set(0, 8.0, 0);
  root.add(continuousLowerBowl);

  const continuousUpperBowl = new THREE.Mesh(
    new THREE.CylinderGeometry(96, 78, 20, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x0b111e,
      roughness: 0.85,
      metalness: 0.18,
      side: THREE.DoubleSide,
    })
  );
  continuousUpperBowl.scale.set(1.24, 1, 0.88);
  continuousUpperBowl.position.set(0, 25.0, 0);
  root.add(continuousUpperBowl);

  const createMultiTierTribune = (x: number, z: number, width: number, rotY: number) => {
    const tribune = new THREE.Group();
    tribune.position.set(x, 0, z);
    tribune.rotation.y = rotY;

    // Lower Bowl Tier (6 wide steps)
    for (let step = 0; step < 6; step++) {
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.2, 3.6), standMat);
      stepMesh.position.set(0, 1.1 + step * 2.0, -step * 3.1);
      stepMesh.receiveShadow = true;
      tribune.add(stepMesh);
    }

    // VIP Hospitality Executive Glass Ribbon (Middle Tier)
    const vipRibbon = new THREE.Mesh(new THREE.BoxGeometry(width + 8, 2.8, 2.8), vipMat);
    vipRibbon.position.set(0, 13.2, -16.8);
    tribune.add(vipRibbon);

    // Upper Steep Bowl Tier (6 steps reaching up to Y = 30m)
    for (let u = 0; u < 6; u++) {
      const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 16, 2.6, 3.4), standMat);
      upperMesh.position.set(0, 16.0 + u * 2.4, -19.2 - u * 2.9);
      upperMesh.receiveShadow = true;
      tribune.add(upperMesh);
    }

    root.add(tribune);
  };

  // Placed further back and significantly wider so the stadium feels colossal on iPad & Desktop
  createMultiTierTribune(0, -42.5, 136, 0); // North Stand
  createMultiTierTribune(0, 42.5, 136, Math.PI); // South Stand
  createMultiTierTribune(-61.5, 0, 92, Math.PI / 2); // West Stand
  createMultiTierTribune(61.5, 0, 92, -Math.PI / 2); // East Stand

  // 8. Dynamic Iconic Stadium Architecture Group (Swappable between Bernabéu, Wembley, Allianz, San Siro)
  const architectureGroup = new THREE.Group();
  root.add(architectureGroup);
  populateStadiumArchitecture(architectureGroup, initialStadium, maxAnisotropy);

  // 9. InstancedMesh 3D Crowd (1,800 Animated Spectators across Expanded Lower & Upper Bowls)
  const crowdCount = 1800;
  const spectatorGeo = new THREE.BoxGeometry(0.62, 1.25, 0.5);
  const spectatorMat = new THREE.MeshStandardMaterial({
    roughness: 0.75,
    metalness: 0.08,
  });

  const crowdInstancedMesh = new THREE.InstancedMesh(spectatorGeo, spectatorMat, crowdCount);
  crowdInstancedMesh.frustumCulled = false;

  const crowdBasePositions = new Float32Array(crowdCount * 4);
  const crowdColors = ['#F8FAFC', '#A3E635', '#FACC15', '#CBD5E1', '#E11D48', '#D97706', '#334155'];

  for (let i = 0; i < crowdCount; i++) {
    const standIdx = i % 4;
    const isUpperTier = i > 1050;
    const step = Math.floor(Math.random() * 6);
    const elevationY = isUpperTier ? 17.2 + step * 2.4 : 2.3 + step * 2.0;
    const depthOffset = isUpperTier ? 19.2 + step * 2.9 : step * 3.1;

    let sx = 0;
    let sz = 0;
    let rotY = 0;

    if (standIdx === 0) {
      sx = (Math.random() - 0.5) * 128;
      sz = -42.2 - depthOffset;
      rotY = 0;
    } else if (standIdx === 1) {
      sx = (Math.random() - 0.5) * 128;
      sz = 42.2 + depthOffset;
      rotY = Math.PI;
    } else if (standIdx === 2) {
      sx = -61.2 - depthOffset;
      sz = (Math.random() - 0.5) * 84;
      rotY = Math.PI / 2;
    } else {
      sx = 61.2 + depthOffset;
      sz = (Math.random() - 0.5) * 84;
      rotY = -Math.PI / 2;
    }

    const phase = Math.random() * Math.PI * 2;
    crowdBasePositions[i * 4 + 0] = sx;
    crowdBasePositions[i * 4 + 1] = elevationY;
    crowdBasePositions[i * 4 + 2] = sz;
    crowdBasePositions[i * 4 + 3] = phase;

    _dummy.position.set(sx, elevationY, sz);
    _dummy.rotation.set(0, rotY, 0);
    const scaleVar = 0.85 + Math.random() * 0.35;
    _dummy.scale.set(scaleVar, scaleVar, scaleVar);
    _dummy.updateMatrix();
    crowdInstancedMesh.setMatrixAt(i, _dummy.matrix);

    _color.set(crowdColors[i % crowdColors.length]);
    crowdInstancedMesh.setColorAt(i, _color);
  }

  crowdInstancedMesh.instanceMatrix.needsUpdate = true;
  if (crowdInstancedMesh.instanceColor) crowdInstancedMesh.instanceColor.needsUpdate = true;
  crowdInstancedMesh.computeBoundingSphere();
  root.add(crowdInstancedMesh);

  // 10. Waving Supporter Flags in Behind-Goal Curvas (48 Large Tifosi Banners)
  const flagCount = 48;
  const tifosiFlagGeo = new THREE.PlaneGeometry(2.4, 1.6, 4, 2);
  const tifosiFlagMat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const supporterFlagsMesh = new THREE.InstancedMesh(tifosiFlagGeo, tifosiFlagMat, flagCount);
  supporterFlagsMesh.frustumCulled = false;
  const supporterFlagsBase = new Float32Array(flagCount * 4);

  for (let i = 0; i < flagCount; i++) {
    const isWestEnd = i % 2 === 0;
    const step = i % 5;
    const fx = (isWestEnd ? -1 : 1) * (63.0 + step * 3.1);
    const fy = 3.8 + step * 2.1;
    const fz = (Math.random() - 0.5) * 64;
    const phase = Math.random() * Math.PI * 2;

    supporterFlagsBase[i * 4 + 0] = fx;
    supporterFlagsBase[i * 4 + 1] = fy;
    supporterFlagsBase[i * 4 + 2] = fz;
    supporterFlagsBase[i * 4 + 3] = phase;

    _dummy.position.set(fx, fy, fz);
    _dummy.rotation.set(0, isWestEnd ? Math.PI / 2 : -Math.PI / 2, 0);
    _dummy.updateMatrix();
    supporterFlagsMesh.setMatrixAt(i, _dummy.matrix);

    _color.set(isWestEnd ? (i % 3 === 0 ? '#D4AF37' : '#F8FAFC') : i % 3 === 0 ? '#CCFF00' : '#E2E8F0');
    supporterFlagsMesh.setColorAt(i, _color);
  }
  supporterFlagsMesh.instanceMatrix.needsUpdate = true;
  if (supporterFlagsMesh.instanceColor) supporterFlagsMesh.instanceColor.needsUpdate = true;
  root.add(supporterFlagsMesh);

  return {
    root,
    pitchMesh,
    crowdInstancedMesh,
    crowdBasePositions,
    supporterFlagsMesh,
    supporterFlagsBase,
    leftGoalNetMeshes,
    rightGoalNetMeshes,
    adBoardMaterials,
    cornerFlags,
    architectureGroup,
    homeManagerGroup,
    awayManagerGroup,
  };
}

export function populateStadiumArchitecture(
  archGroup: THREE.Group,
  stadiumId: StadiumId,
  maxAnisotropy: number
): void {
  // Dispose and clear old stadium-specific meshes
  while (archGroup.children.length > 0) {
    const child = archGroup.children[0];
    archGroup.remove(child);
  }

  const darkSteelMat = new THREE.MeshPhysicalMaterial({
    color: 0x161f30,
    metalness: 0.78,
    roughness: 0.32,
    clearcoat: 0.4,
  });

  const warmFloodLampMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef08a,
    emissiveIntensity: 1.55,
  });

  if (stadiumId === 'santiago_bernabeu') {
    // ESTADIO SANTIAGO BERNABÉU (Expanded Colossal Scale):
    // Wrap-around curved titanium louvers, 4 high overhanging roof decks (Y = 34.5m), and high 360° Halo Ring
    const titaniumMat = new THREE.MeshPhysicalMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 0.6,
    });

    // High Roof overhangs on all 4 sides (raised to Y = 34.5m and pushed out so camera never clips)
    const nRoof = new THREE.Mesh(new THREE.BoxGeometry(176, 1.4, 30), titaniumMat);
    nRoof.position.set(0, 34.5, -66);
    nRoof.rotation.x = 0.08;
    archGroup.add(nRoof);

    const sRoof = new THREE.Mesh(new THREE.BoxGeometry(176, 1.4, 30), titaniumMat);
    sRoof.position.set(0, 34.5, 66);
    sRoof.rotation.x = -0.08;
    archGroup.add(sRoof);

    const wRoof = new THREE.Mesh(new THREE.BoxGeometry(30, 1.4, 124), titaniumMat);
    wRoof.position.set(-86, 34.5, 0);
    wRoof.rotation.z = -0.08;
    archGroup.add(wRoof);

    const eRoof = new THREE.Mesh(new THREE.BoxGeometry(30, 1.4, 124), titaniumMat);
    eRoof.position.set(86, 34.5, 0);
    eRoof.rotation.z = 0.08;
    archGroup.add(eRoof);

    // High 360° Suspended Halo Fascia Ring at Y = 33.8m (Warm dark gold/slate, never blocks camera!)
    const haloRing = new THREE.Mesh(
      new THREE.CylinderGeometry(58, 58, 2.6, 56, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: 0xd4af37,
        emissiveIntensity: 0.28,
        side: THREE.DoubleSide,
      })
    );
    haloRing.scale.set(1.28, 1, 0.92);
    haloRing.position.set(0, 33.8, 0);
    archGroup.add(haloRing);

    // Retractable Roof Cross-Girders at Y = 35.8m
    for (let gx = -48; gx <= 48; gx += 24) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 118), darkSteelMat);
      girder.position.set(gx, 35.8, 0);
      archGroup.add(girder);
    }
  } else if (stadiumId === 'wembley_arch') {
    // WEMBLEY STADIUM LONDON (Expanded Colossal Scale):
    // Iconic 133m Latticed Tubular Steel Arch Tilted over the North Stand + Cable Stays
    const archSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      emissive: 0xfef08a,
      emissiveIntensity: 0.22,
      metalness: 0.65,
      roughness: 0.25,
      clearcoat: 0.7,
    });

    const wembleyArchGroup = new THREE.Group();
    wembleyArchGroup.position.set(0, 12, -62);
    wembleyArchGroup.rotation.x = 0.32;

    const mainArch = new THREE.Mesh(
      new THREE.TorusGeometry(86, 1.85, 18, 72, Math.PI),
      archSteelMat
    );
    wembleyArchGroup.add(mainArch);

    const chordArch = new THREE.Mesh(
      new THREE.TorusGeometry(82.5, 0.95, 12, 64, Math.PI),
      archSteelMat
    );
    wembleyArchGroup.add(chordArch);

    const cableMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.55,
    });
    for (let i = 1; i < 11; i++) {
      const angle = (i / 11) * Math.PI;
      const ax = Math.cos(angle) * 84;
      const ay = Math.sin(angle) * 84;
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, ay * 0.65, 6),
        cableMat
      );
      cable.position.set(ax, ay * 0.65, 4);
      wembleyArchGroup.add(cable);
    }

    archGroup.add(wembleyArchGroup);

    const roofCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.5,
    });
    const northCanopy = new THREE.Mesh(new THREE.BoxGeometry(168, 1.1, 28), roofCanopyMat);
    northCanopy.position.set(0, 33.5, -64);
    archGroup.add(northCanopy);

    const southCanopy = new THREE.Mesh(new THREE.BoxGeometry(168, 1.1, 28), roofCanopyMat);
    southCanopy.position.set(0, 33.5, 64);
    archGroup.add(southCanopy);
  } else if (stadiumId === 'allianz_arena') {
    // ALLIANZ ARENA MUNICH (Expanded Colossal Scale):
    const cushionTex = createAllianzCushionTexture(maxAnisotropy);
    cushionTex.repeat.set(8, 2);

    const cushionMat = new THREE.MeshStandardMaterial({
      map: cushionTex,
      emissiveMap: cushionTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });

    const shellWall = new THREE.Mesh(
      new THREE.CylinderGeometry(96, 104, 18, 56, 1, true),
      cushionMat
    );
    shellWall.scale.set(1.16, 1, 0.85);
    shellWall.position.set(0, 27.5, 0);
    archGroup.add(shellWall);

    const innerRoof = new THREE.Mesh(
      new THREE.RingGeometry(56, 96, 56),
      new THREE.MeshStandardMaterial({
        color: 0x1e1b24,
        roughness: 0.35,
        metalness: 0.4,
        side: THREE.DoubleSide,
      })
    );
    innerRoof.rotation.x = Math.PI / 2;
    innerRoof.scale.set(1.16, 0.85, 1);
    innerRoof.position.set(0, 35.5, 0);
    archGroup.add(innerRoof);
  } else {
    // STADIO SAN SIRO (MILAN) (Expanded Colossal Scale):
    const concreteTowerMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.85,
      metalness: 0.15,
    });
    const redTrussMat = new THREE.MeshPhysicalMaterial({
      color: 0xdc2626,
      roughness: 0.32,
      metalness: 0.65,
      clearcoat: 0.5,
    });

    const towerPositions = [
      [-82, -58],
      [82, -58],
      [-82, 58],
      [82, 58],
      [0, -70],
      [0, 70],
      [-92, 0],
      [92, 0],
    ];

    towerPositions.forEach(([tx, tz]) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);

      const coreCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.5, 38, 20),
        concreteTowerMat
      );
      coreCyl.position.y = 19;
      tGroup.add(coreCyl);

      for (let r = 0; r < 6; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(4.8, 0.48, 8, 24),
          concreteTowerMat
        );
        ring.rotation.x = Math.PI / 2 + 0.14;
        ring.position.y = 4 + r * 5.8;
        tGroup.add(ring);
      }

      archGroup.add(tGroup);
    });

    const longTrussGeo = new THREE.BoxGeometry(188, 3.2, 2.8);
    const northRedGirder = new THREE.Mesh(longTrussGeo, redTrussMat);
    northRedGirder.position.set(0, 36.5, -56);
    archGroup.add(northRedGirder);

    const southRedGirder = new THREE.Mesh(longTrussGeo, redTrussMat);
    southRedGirder.position.set(0, 36.5, 56);
    archGroup.add(southRedGirder);

    const crossTrussGeo = new THREE.BoxGeometry(2.8, 3.2, 138);
    const westRedGirder = new THREE.Mesh(crossTrussGeo, redTrussMat);
    westRedGirder.position.set(-78, 36.5, 0);
    archGroup.add(westRedGirder);

    const eastRedGirder = new THREE.Mesh(crossTrussGeo, redTrussMat);
    eastRedGirder.position.set(78, 36.5, 0);
    archGroup.add(eastRedGirder);
  }

  // Shared Corner Floodlight Banks (Raised to Y = 38.5m at expanded stadium corners) + Volumetric Light Cones & Jumbotrons
  const pylonCoords = [
    [-74, -54],
    [74, -54],
    [-74, 54],
    [74, 54],
  ];

  const volumetricConeMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.036,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const jumbotronScreenMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.5,
  });

  pylonCoords.forEach(([px, pz]) => {
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(px, 0, pz);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 38, 12), darkSteelMat);
    mast.position.y = 19;
    pylonGroup.add(mast);

    const headPanel = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.8, 1.4), darkSteelMat);
    headPanel.position.set(0, 38.5, 0);
    headPanel.lookAt(0, 0, 0);
    pylonGroup.add(headPanel);

    const lampGrid = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 3.2), warmFloodLampMat);
    lampGrid.position.set(0, 38.5, 0);
    lampGrid.lookAt(0, 0, 0);
    lampGrid.translateZ(0.75);
    pylonGroup.add(lampGrid);

    // Subtle Atmospheric Volumetric Floodlight Beam angling down toward the center pitch
    const beamTarget = new THREE.Vector3(-px * 0.65, 0, -pz * 0.65);
    const beamOrigin = new THREE.Vector3(0, 38.0, 0);
    const beamLen = beamOrigin.distanceTo(beamTarget);
    const beamGeo = new THREE.ConeGeometry(16, beamLen, 18, 1, true);
    beamGeo.translate(0, -beamLen / 2, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beamMesh = new THREE.Mesh(beamGeo, volumetricConeMat);
    beamMesh.position.copy(beamOrigin);
    beamMesh.lookAt(beamTarget);
    pylonGroup.add(beamMesh);

    // Corner Suspended Giant Broadcast LED Jumbotron Screen
    const jumboFrame = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6.2, 0.8), darkSteelMat);
    jumboFrame.position.set(-Math.sign(px) * 6, 25.5, -Math.sign(pz) * 4);
    jumboFrame.lookAt(0, 8, 0);
    pylonGroup.add(jumboFrame);

    const jumboScreen = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 5.4), jumbotronScreenMat);
    jumboScreen.position.copy(jumboFrame.position);
    jumboScreen.lookAt(0, 8, 0);
    jumboScreen.translateZ(0.45);
    pylonGroup.add(jumboScreen);

    archGroup.add(pylonGroup);
  });
}

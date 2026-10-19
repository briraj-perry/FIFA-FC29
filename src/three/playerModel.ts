import * as THREE from 'three';
import {
  BOOT_CATALOG,
  PlayerEquipmentLoadout,
  resolveAwayKitPalette,
  SkillMoveId,
} from '../types/game';
import { createJerseyTexture } from './proceduralTextures';

export interface ArticulatedPlayerParts {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoMesh: THREE.Mesh;
  shortsMesh: THREE.Mesh;
  headGroup: THREE.Group;
  visorMesh: THREE.Mesh;
  sweatbandMesh: THREE.Mesh;
  maskMesh: THREE.Mesh;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftElbowPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  leftSleeveMesh: THREE.Mesh;
  rightSleeveMesh: THREE.Mesh;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftKneePivot: THREE.Group;
  rightKneePivot: THREE.Group;
  leftSockMesh: THREE.Mesh;
  rightSockMesh: THREE.Mesh;
  leftShinGuard: THREE.Mesh;
  rightShinGuard: THREE.Mesh;
  leftWristBand: THREE.Mesh;
  rightWristBand: THREE.Mesh;
  captainArmband: THREE.Mesh;
  leftSleeveThermal: THREE.Mesh;
  rightSleeveThermal: THREE.Mesh;
  leftBootUpper: THREE.Mesh;
  rightBootUpper: THREE.Mesh;
  leftBootAccent: THREE.Mesh;
  rightBootAccent: THREE.Mesh;
  studMeshes: THREE.Mesh[];
  selectionRing: THREE.Mesh;
  overheadChevron: THREE.Mesh;
}

const SKIN_TONES = ['#E0AC69', '#C68642', '#8D5524', '#F1C27D', '#5C3818'];
const HAIR_COLORS = ['#111827', '#27272A', '#451A03', '#78350F', '#D97706'];

function calibrateFabricHex(rawHex: string): string {
  const upper = (rawHex || '').toUpperCase();
  if (upper === '#FFFFFF' || upper === '#F8FAFC') return '#CBD5E1';
  if (upper === '#FACC15') return '#D99B0E';
  return rawHex;
}

export function createArticulatedPlayer(
  playerIndex: number,
  squadNumber: number,
  isHome: boolean,
  isGoalkeeper: boolean,
  loadout: PlayerEquipmentLoadout,
  contactShadowTex: THREE.Texture,
  maxAnisotropy: number
): ArticulatedPlayerParts {
  const root = new THREE.Group();
  const awayKit = resolveAwayKitPalette(loadout);

  // 1. Grounded Contact Shadow Plane (y = 0.015)
  const shadowGeo = new THREE.PlaneGeometry(1.62, 1.62);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.66,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.015;
  root.add(shadowMesh);

  // 2. Active Player / Tactical Role Ring on Ground (y = 0.025)
  const ringGeo = new THREE.RingGeometry(0.68, 0.85, 36);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isHome ? 0xfacc15 : 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.025;
  root.add(selectionRing);

  // 3. Overhead HyperMotion Indicator Chevron
  const chevronShape = new THREE.Shape();
  chevronShape.moveTo(0, -0.22);
  chevronShape.lineTo(0.22, 0.14);
  chevronShape.lineTo(0.09, 0.14);
  chevronShape.lineTo(0, -0.04);
  chevronShape.lineTo(-0.09, 0.14);
  chevronShape.lineTo(-0.22, 0.14);
  chevronShape.closePath();

  const chevronGeo = new THREE.ExtrudeGeometry(chevronShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  chevronGeo.center();
  const chevronMat = new THREE.MeshStandardMaterial({
    color: 0xccff00,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.55,
    metalness: 0.05,
    envMapIntensity: 0.1,
  });
  const overheadChevron = new THREE.Mesh(chevronGeo, chevronMat);
  overheadChevron.position.set(0, 2.55, 0);
  overheadChevron.visible = false;
  root.add(overheadChevron);

  // Body Pivot for running lean, turn banking & animations
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const skinColor = SKIN_TONES[playerIndex % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(playerIndex * 3) % HAIR_COLORS.length];

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.78,
    metalness: 0.01,
    envMapIntensity: 0.08,
  });

  // 4. Athletic Beveled Torso (ExtrudeGeometry)
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.24, 0);
  torsoShape.lineTo(0.24, 0);
  torsoShape.lineTo(0.31, 0.68);
  torsoShape.lineTo(-0.31, 0.68);
  torsoShape.closePath();

  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  torsoGeo.center();

  // Compute normalized planar UVs for the jersey texture
  const posAttr = torsoGeo.attributes.position;
  const uvAttr = torsoGeo.attributes.uv;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    uvAttr.setXY(i, (vx + 0.35) / 0.7, 1 - (vy + 0.38) / 0.76);
  }
  uvAttr.needsUpdate = true;

  const jerseyTex = createJerseyTexture(loadout, isHome, squadNumber, maxAnisotropy);
  const torsoMat = new THREE.MeshStandardMaterial({
    map: isGoalkeeper ? undefined : jerseyTex,
    color: isGoalkeeper ? (isHome ? '#0D9488' : '#E11D48') : 0xdbe4ee,
    roughness: 0.88,
    metalness: 0.01,
    envMapIntensity: 0.06,
  });

  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.position.set(0, 1.24, 0);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyPivot.add(torsoMesh);

  // Sculpted Jersey Collar Ring
  const collarMat = new THREE.MeshStandardMaterial({
    color: isHome ? loadout.kitSecondaryColor : awayKit.secondary,
    roughness: 0.85,
    metalness: 0.01,
    envMapIntensity: 0.06,
  });
  const collarMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.024, 10, 20),
    collarMat
  );
  collarMesh.rotation.x = Math.PI / 2;
  collarMesh.position.set(0, 1.61, 0);
  bodyPivot.add(collarMesh);

  // 5. Athletic Shorts & Hip Block
  const shortsGeo = new THREE.BoxGeometry(0.54, 0.3, 0.32);
  const shortsMat = new THREE.MeshStandardMaterial({
    color: isGoalkeeper
      ? '#0F172A'
      : isHome
      ? loadout.shortsColor
      : awayKit.shorts,
    roughness: 0.86,
    metalness: 0.01,
    envMapIntensity: 0.06,
  });
  const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
  shortsMesh.position.set(0, 0.82, 0);
  shortsMesh.castShadow = true;
  shortsMesh.receiveShadow = true;
  bodyPivot.add(shortsMesh);

  // 6. Head, Neck, Facial Features, Hair & Customizable Headgear
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, 0);
  bodyPivot.add(headGroup);

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.1, 0.14, 12),
    skinMat
  );
  neckMesh.position.y = 0.04;
  headGroup.add(neckMesh);

  const skullMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.195, 24, 24),
    skinMat
  );
  skullMesh.scale.set(0.95, 1.12, 1.0);
  skullMesh.position.y = 0.21;
  skullMesh.castShadow = true;
  skullMesh.receiveShadow = true;
  headGroup.add(skullMesh);

  // Sculpted 3D Facial Features (Eyes, Brows, Nose & Ears for Next-Gen Detail)
  const eyeDarkMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
  });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), eyeDarkMat);
  leftEye.position.set(-0.064, 0.225, 0.172);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), eyeDarkMat);
  rightEye.position.set(0.064, 0.225, 0.172);
  headGroup.add(leftEye, rightEye);

  // Sculpted Nose Bridge
  const noseMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.026, 0.075, 8),
    skinMat
  );
  noseMesh.position.set(0, 0.195, 0.192);
  noseMesh.rotation.x = 0.35;
  headGroup.add(noseMesh);

  // Left & Right Ears
  const earGeo = new THREE.SphereGeometry(0.036, 10, 10);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.scale.set(0.45, 1.0, 0.7);
  leftEar.position.set(-0.185, 0.205, 0.0);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.scale.set(0.45, 1.0, 0.7);
  rightEar.position.set(0.185, 0.205, 0.0);
  headGroup.add(leftEar, rightEar);

  // Sculpted Modern Footballer Hair Cut & Brow Line
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.85,
    metalness: 0.03,
    envMapIntensity: 0.1,
  });
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.203, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  hairCap.position.set(0, 0.23, -0.01);
  hairCap.rotation.x = -0.15;
  headGroup.add(hairCap);

  const browGeo = new THREE.BoxGeometry(0.052, 0.014, 0.02);
  const leftBrow = new THREE.Mesh(browGeo, hairMat);
  leftBrow.position.set(-0.064, 0.256, 0.174);
  const rightBrow = new THREE.Mesh(browGeo, hairMat);
  rightBrow.position.set(0.064, 0.256, 0.174);
  headGroup.add(leftBrow, rightBrow);

  // Headgear Option A: Aero Sports Visor (No radioactive emissive glow)
  const visorGeo = new THREE.CylinderGeometry(
    0.205,
    0.205,
    0.095,
    20,
    1,
    true,
    -Math.PI * 0.42,
    Math.PI * 0.84
  );
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    metalness: 0.2,
    roughness: 0.15,
    transmission: 0.75,
    thickness: 0.3,
    clearcoat: 0.5,
    envMapIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.23, 0.01);
  visorMesh.rotation.y = Math.PI;
  headGroup.add(visorMesh);

  // Headgear Option B: Pro Sweatband
  const sweatbandGeo = new THREE.TorusGeometry(0.192, 0.028, 10, 24);
  const sweatbandMat = new THREE.MeshStandardMaterial({
    color: isHome ? loadout.kitSecondaryColor : awayKit.secondary,
    roughness: 0.65,
  });
  const sweatbandMesh = new THREE.Mesh(sweatbandGeo, sweatbandMat);
  sweatbandMesh.rotation.x = Math.PI / 2;
  sweatbandMesh.position.set(0, 0.285, 0);
  headGroup.add(sweatbandMesh);

  // Headgear Option C: Protective Carbon Face Mask
  const maskGeo = new THREE.CylinderGeometry(
    0.202,
    0.195,
    0.14,
    16,
    1,
    true,
    -Math.PI * 0.38,
    Math.PI * 0.76
  );
  const maskMat = new THREE.MeshPhysicalMaterial({
    color: 0x111827,
    roughness: 0.22,
    metalness: 0.8,
    clearcoat: 0.8,
    side: THREE.DoubleSide,
  });
  const maskMesh = new THREE.Mesh(maskGeo, maskMat);
  maskMesh.position.set(0, 0.21, 0.015);
  maskMesh.rotation.y = Math.PI;
  headGroup.add(maskMesh);

  // 7. Articulated Left & Right Arms with Elbow Joint + Customizable Armgear
  const createArm = (isLeft: boolean) => {
    const pivot = new THREE.Group();
    const xSign = isLeft ? -1 : 1;
    pivot.position.set(xSign * 0.36, 1.54, 0);

    // Jersey Sleeve (Upper Arm)
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: isGoalkeeper
        ? isHome
          ? '#10B981'
          : '#F43F5E'
        : isHome
        ? loadout.kitPrimaryColor
        : awayKit.primary,
      roughness: 0.65,
    });
    // Sculpted Shoulder Deltoid Cap for seamless upper-body anatomy
    const deltoidMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.094, 12, 12),
      sleeveMat
    );
    deltoidMesh.position.set(0, 0.01, 0);
    deltoidMesh.castShadow = true;
    pivot.add(deltoidMesh);

    // Jersey Sleeve (Upper Arm)
    const sleeveMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.078, 0.24, 14),
      sleeveMat
    );
    sleeveMesh.position.y = -0.11;
    sleeveMesh.castShadow = true;
    pivot.add(sleeveMesh);

    // Captain's Armband (on left arm)
    const captainArmband = new THREE.Mesh(
      new THREE.CylinderGeometry(0.092, 0.09, 0.08, 16),
      new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        metalness: 0.75,
        roughness: 0.22,
        clearcoat: 0.6,
      })
    );
    captainArmband.position.y = -0.14;
    captainArmband.visible = false;
    pivot.add(captainArmband);

    // Articulated Elbow Pivot
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.22, 0);
    pivot.add(elbowPivot);

    // Lower Forearm
    const forearmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.058, 0.3, 14),
      skinMat
    );
    forearmMesh.position.y = -0.14;
    forearmMesh.castShadow = true;
    elbowPivot.add(forearmMesh);

    const thermalSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.077, 0.062, 0.31, 14),
      new THREE.MeshStandardMaterial({
        color: isHome ? loadout.kitSecondaryColor : awayKit.secondary,
        roughness: 0.5,
      })
    );
    thermalSleeve.position.y = -0.14;
    thermalSleeve.visible = false;
    elbowPivot.add(thermalSleeve);

    // Wristband / Tape (Non-glowing matte athletic tape)
    const wristBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.064, 0.085, 14),
      new THREE.MeshStandardMaterial({
        color: 0xdbe4ee,
        roughness: 0.82,
        metalness: 0.02,
        envMapIntensity: 0.12,
      })
    );
    wristBand.position.y = -0.27;
    elbowPivot.add(wristBand);

    // Hand / Goalkeeper Glove
    const handMat = isGoalkeeper
      ? new THREE.MeshPhysicalMaterial({
          color: 0xa3e635,
          roughness: 0.55,
          clearcoat: 0.2,
          envMapIntensity: 0.15,
        })
      : skinMat;
    const handMesh = new THREE.Mesh(
      new THREE.SphereGeometry(isGoalkeeper ? 0.088 : 0.064, 12, 12),
      handMat
    );
    handMesh.position.y = -0.35;
    elbowPivot.add(handMesh);

    bodyPivot.add(pivot);
    return {
      pivot,
      elbowPivot,
      wristBand,
      captainArmband,
      thermalSleeve,
      sleeveMesh,
    };
  };

  const leftArm = createArm(true);
  const rightArm = createArm(false);

  // 8. Articulated Left & Right Legs with Knee Joint + Customizable Socks & Boots
  const studMeshes: THREE.Mesh[] = [];

  const createLegAndBoot = (isLeft: boolean) => {
    const legPivot = new THREE.Group();
    const xSign = isLeft ? -1 : 1;
    legPivot.position.set(xSign * 0.155, 0.72, 0);

    // Upper Thigh (Hip to Knee)
    const thighMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.31, 14),
      skinMat
    );
    thighMesh.position.y = -0.155;
    thighMesh.castShadow = true;
    legPivot.add(thighMesh);

    // Articulated Knee Joint Pivot (y = -0.30 below hip)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.3, 0);
    legPivot.add(kneePivot);

    // Sculpted Knee Cap Sphere
    const kneeCapMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.084, 12, 12),
      skinMat
    );
    kneeCapMesh.position.set(0, 0.0, 0.01);
    kneePivot.add(kneeCapMesh);

    // Lower Calf (Knee to Ankle)
    const calfSkinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.086, 0.068, 0.32, 14),
      skinMat
    );
    calfSkinMesh.position.y = -0.15;
    kneePivot.add(calfSkinMesh);

    // Customizable Team Sock
    const sockMat = new THREE.MeshStandardMaterial({
      color: isGoalkeeper
        ? isHome
          ? '#0D9488'
          : '#E11D48'
        : isHome
        ? loadout.kitPrimaryColor
        : awayKit.socks,
      roughness: 0.84,
      metalness: 0.02,
      envMapIntensity: 0.12,
    });
    const sockMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.091, 0.074, 0.34, 16),
      sockMat
    );
    sockMesh.position.y = -0.15;
    sockMesh.castShadow = true;
    kneePivot.add(sockMesh);

    // Pro Sock Top Turnover Cuff Band
    const sockCuffMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.094, 0.092, 0.036, 16),
      new THREE.MeshStandardMaterial({
        color: isHome ? loadout.kitSecondaryColor : awayKit.secondary,
        roughness: 0.8,
      })
    );
    sockCuffMesh.position.y = 0.155;
    sockMesh.add(sockCuffMesh);

    // Customizable Carbon Fiber Shin Shield (Matte carbon, zero emissive glow)
    const shinGuardMat = new THREE.MeshPhysicalMaterial({
      color: 0x111827,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      metalness: 0.45,
      roughness: 0.35,
      clearcoat: 0.3,
      envMapIntensity: 0.15,
    });
    const shinGuard = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.095,
        0.081,
        0.22,
        14,
        1,
        false,
        -Math.PI * 0.35,
        Math.PI * 0.7
      ),
      shinGuardMat
    );
    shinGuard.position.set(0, -0.15, 0.01);
    kneePivot.add(shinGuard);

    // Multi-Part Pro Football Boot attached to Knee/Calf hierarchy
    const bootGroup = new THREE.Group();
    bootGroup.position.set(0, -0.34, 0.045);
    kneePivot.add(bootGroup);

    const bootSpec =
      BOOT_CATALOG[loadout.bootModel] || BOOT_CATALOG.hypervenom_volt;

    const bootUpperMat = new THREE.MeshPhysicalMaterial({
      color: isHome ? bootSpec.primaryHex : awayKit.secondary,
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    const bootUpperGeo = new THREE.BoxGeometry(0.155, 0.11, 0.33);
    const bootUpper = new THREE.Mesh(bootUpperGeo, bootUpperMat);
    bootUpper.position.set(0, 0.015, 0.02);
    bootUpper.castShadow = true;
    bootGroup.add(bootUpper);

    // Sculpted Rounded Toe-Box Cap for authentic football boot silhouette
    const toeCapMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.076, 12, 10),
      bootUpperMat
    );
    toeCapMesh.scale.set(1.0, 0.68, 1.15);
    toeCapMesh.position.set(0, 0.005, 0.175);
    bootGroup.add(toeCapMesh);

    const bootAccentMat = new THREE.MeshPhysicalMaterial({
      color: isHome ? bootSpec.accentHex : awayKit.primary,
      roughness: 0.25,
      metalness: 0.6,
      clearcoat: 0.8,
    });
    const bootAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.162, 0.095, 0.145),
      bootAccentMat
    );
    bootAccent.position.set(0, 0.038, -0.075);
    bootGroup.add(bootAccent);

    const soleplate = new THREE.Mesh(
      new THREE.BoxGeometry(0.158, 0.025, 0.34),
      new THREE.MeshPhysicalMaterial({
        color: 0x090d16,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 1.0,
      })
    );
    soleplate.position.set(0, -0.045, 0.02);
    bootGroup.add(soleplate);

    const studMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.12,
    });
    const studOffsets = [
      [-0.05, -0.068, 0.13],
      [0.05, -0.068, 0.13],
      [-0.05, -0.068, 0.03],
      [0.05, -0.068, 0.03],
      [-0.045, -0.068, -0.1],
      [0.045, -0.068, -0.1],
    ];
    const studGeo = new THREE.CylinderGeometry(0.014, 0.008, 0.032, 8);
    studOffsets.forEach(([sx, sy, sz]) => {
      const stud = new THREE.Mesh(studGeo, studMat);
      stud.position.set(sx, sy, sz);
      bootGroup.add(stud);
      studMeshes.push(stud);
    });

    bodyPivot.add(legPivot);
    return { legPivot, kneePivot, sockMesh, shinGuard, bootUpper, bootAccent };
  };

  const leftLeg = createLegAndBoot(true);
  const rightLeg = createLegAndBoot(false);

  const parts: ArticulatedPlayerParts = {
    root,
    bodyPivot,
    torsoMesh,
    shortsMesh,
    headGroup,
    visorMesh,
    sweatbandMesh,
    maskMesh,
    leftArmPivot: leftArm.pivot,
    rightArmPivot: rightArm.pivot,
    leftElbowPivot: leftArm.elbowPivot,
    rightElbowPivot: rightArm.elbowPivot,
    leftSleeveMesh: leftArm.sleeveMesh,
    rightSleeveMesh: rightArm.sleeveMesh,
    leftLegPivot: leftLeg.legPivot,
    rightLegPivot: rightLeg.legPivot,
    leftKneePivot: leftLeg.kneePivot,
    rightKneePivot: rightLeg.kneePivot,
    leftSockMesh: leftLeg.sockMesh,
    rightSockMesh: rightLeg.sockMesh,
    leftShinGuard: leftLeg.shinGuard,
    rightShinGuard: rightLeg.shinGuard,
    leftWristBand: leftArm.wristBand,
    rightWristBand: rightArm.wristBand,
    captainArmband: leftArm.captainArmband,
    leftSleeveThermal: leftArm.thermalSleeve,
    rightSleeveThermal: rightArm.thermalSleeve,
    leftBootUpper: leftLeg.bootUpper,
    rightBootUpper: rightLeg.bootUpper,
    leftBootAccent: leftLeg.bootAccent,
    rightBootAccent: rightLeg.bootAccent,
    studMeshes,
    selectionRing,
    overheadChevron,
  };

  applyEquipmentLoadoutToPlayer(
    parts,
    loadout,
    isHome,
    isGoalkeeper,
    squadNumber,
    maxAnisotropy
  );
  return parts;
}

export function applyEquipmentLoadoutToPlayer(
  parts: ArticulatedPlayerParts,
  loadout: PlayerEquipmentLoadout,
  isHome: boolean,
  isGoalkeeper: boolean,
  squadNumber: number,
  maxAnisotropy: number
): void {
  const awayKit = resolveAwayKitPalette(loadout);

  if (!isHome) {
    // Dynamically update Away team kit so Yellow vs Blue contrast is always active!
    if (!isGoalkeeper) {
      const torsoMat = parts.torsoMesh.material as THREE.MeshPhysicalMaterial;
      if (torsoMat.map) torsoMat.map.dispose();
      torsoMat.map = createJerseyTexture(
        loadout,
        false,
        squadNumber,
        maxAnisotropy
      );
      torsoMat.needsUpdate = true;

      (parts.leftSleeveMesh.material as THREE.MeshStandardMaterial).color.set(
        awayKit.primary
      );
      (parts.rightSleeveMesh.material as THREE.MeshStandardMaterial).color.set(
        awayKit.primary
      );
      (parts.shortsMesh.material as THREE.MeshStandardMaterial).color.set(
        awayKit.shorts
      );
      (parts.leftSockMesh.material as THREE.MeshStandardMaterial).color.set(
        awayKit.socks
      );
      (parts.rightSockMesh.material as THREE.MeshStandardMaterial).color.set(
        awayKit.socks
      );
      (parts.leftBootUpper.material as THREE.MeshPhysicalMaterial).color.set(
        awayKit.secondary
      );
      (parts.rightBootUpper.material as THREE.MeshPhysicalMaterial).color.set(
        awayKit.secondary
      );
      (parts.leftBootAccent.material as THREE.MeshPhysicalMaterial).color.set(
        awayKit.primary
      );
      (parts.rightBootAccent.material as THREE.MeshPhysicalMaterial).color.set(
        awayKit.primary
      );
    }

    parts.visorMesh.visible = false;
    parts.sweatbandMesh.visible = false;
    parts.maskMesh.visible = false;
    parts.leftWristBand.visible = true;
    parts.rightWristBand.visible = true;
    parts.captainArmband.visible = false;
    parts.leftSleeveThermal.visible = false;
    parts.rightSleeveThermal.visible = false;
    parts.leftShinGuard.visible = false;
    parts.rightShinGuard.visible = false;
    return;
  }

  // Update Home Jersey Texture, Sleeves & Shorts
  if (!isGoalkeeper) {
    const torsoMat = parts.torsoMesh.material as THREE.MeshStandardMaterial;
    if (torsoMat.map) torsoMat.map.dispose();
    torsoMat.map = createJerseyTexture(
      loadout,
      true,
      squadNumber,
      maxAnisotropy
    );
    torsoMat.needsUpdate = true;

    const calibratedPrimary = calibrateFabricHex(loadout.kitPrimaryColor);
    (parts.leftSleeveMesh.material as THREE.MeshStandardMaterial).color.set(
      calibratedPrimary
    );
    (parts.rightSleeveMesh.material as THREE.MeshStandardMaterial).color.set(
      calibratedPrimary
    );

    const shortsMat = parts.shortsMesh.material as THREE.MeshStandardMaterial;
    shortsMat.color.set(calibrateFabricHex(loadout.shortsColor));
  }

  // Headgear
  parts.visorMesh.visible = loadout.headgear === 'aero_visor';
  parts.sweatbandMesh.visible = loadout.headgear === 'sweatband';
  parts.maskMesh.visible = loadout.headgear === 'carbon_mask';
  if (parts.sweatbandMesh.visible) {
    (parts.sweatbandMesh.material as THREE.MeshStandardMaterial).color.set(
      calibrateFabricHex(loadout.kitSecondaryColor)
    );
  }

  // Armgear
  parts.leftWristBand.visible =
    loadout.armgear === 'wrist_tape' || loadout.armgear === 'neon_bands';
  parts.rightWristBand.visible =
    loadout.armgear === 'wrist_tape' || loadout.armgear === 'neon_bands';
  parts.captainArmband.visible = loadout.armgear === 'captain_band';
  parts.leftSleeveThermal.visible = loadout.armgear === 'thermal_sleeves';
  parts.rightSleeveThermal.visible = loadout.armgear === 'thermal_sleeves';

  const bandColor = loadout.armgear === 'neon_bands' ? '#A3E635' : '#CBD5E1';
  (parts.leftWristBand.material as THREE.MeshStandardMaterial).color.set(
    bandColor
  );
  (parts.rightWristBand.material as THREE.MeshStandardMaterial).color.set(
    bandColor
  );
  (parts.leftSleeveThermal.material as THREE.MeshStandardMaterial).color.set(
    calibrateFabricHex(loadout.kitSecondaryColor)
  );
  (parts.rightSleeveThermal.material as THREE.MeshStandardMaterial).color.set(
    calibrateFabricHex(loadout.kitSecondaryColor)
  );

  // Sock Style & Carbon Shin Shields
  const sockScaleY =
    loadout.sockStyle === 'high_grip'
      ? 1.25
      : loadout.sockStyle === 'low_carbon_guard'
      ? 0.65
      : 1.0;
  parts.leftSockMesh.scale.set(1, sockScaleY, 1);
  parts.rightSockMesh.scale.set(1, sockScaleY, 1);
  if (!isGoalkeeper) {
    const calibratedPrimary = calibrateFabricHex(loadout.kitPrimaryColor);
    (parts.leftSockMesh.material as THREE.MeshStandardMaterial).color.set(
      calibratedPrimary
    );
    (parts.rightSockMesh.material as THREE.MeshStandardMaterial).color.set(
      calibratedPrimary
    );
  }

  parts.leftShinGuard.visible = loadout.sockStyle === 'low_carbon_guard';
  parts.rightShinGuard.visible = loadout.sockStyle === 'low_carbon_guard';

  // Boots & Metallic Studs
  const bootSpec =
    BOOT_CATALOG[loadout.bootModel] || BOOT_CATALOG.hypervenom_volt;
  (parts.leftBootUpper.material as THREE.MeshPhysicalMaterial).color.set(
    bootSpec.primaryHex
  );
  (parts.rightBootUpper.material as THREE.MeshPhysicalMaterial).color.set(
    bootSpec.primaryHex
  );
  (parts.leftBootAccent.material as THREE.MeshPhysicalMaterial).color.set(
    bootSpec.accentHex
  );
  (parts.rightBootAccent.material as THREE.MeshPhysicalMaterial).color.set(
    bootSpec.accentHex
  );

  const studHex =
    loadout.bootStudFinish === 'chrome_gold'
      ? '#F59E0B'
      : loadout.bootStudFinish === 'anodized_cyan'
      ? '#00F0FF'
      : '#1E293B';
  parts.studMeshes.forEach((stud) => {
    (stud.material as THREE.MeshStandardMaterial).color.set(studHex);
  });
}

export function animatePlayerKinematics(
  parts: ArticulatedPlayerParts,
  speed: number,
  stridePhase: number,
  kickTimer: number,
  isActiveUser: boolean,
  isAICarrier: boolean,
  elapsedTime: number,
  skillMove: SkillMoveId | null = null,
  skillProgress: number = 0,
  isOnlineAwayUser: boolean = false,
  gkDiveDir: number = 0,
  turnBankAngle: number = 0,
  headLookYaw: number = 0,
  slideProgress: number = 0,
  isCloseDribbling: boolean = false
): void {
  const normalizedSpeed = Math.min(1.32, speed / 15.5);
  const isCarryingBall = isAICarrier || (isActiveUser && isCloseDribbling);

  // Reset extra rotation axes by default
  parts.bodyPivot.rotation.y = 0;
  parts.bodyPivot.rotation.z = THREE.MathUtils.clamp(turnBankAngle, -0.32, 0.32);
  parts.torsoMesh.rotation.y = 0;
  parts.leftLegPivot.rotation.z = 0;
  parts.rightLegPivot.rotation.z = 0;
  parts.leftKneePivot.rotation.x = 0;
  parts.rightKneePivot.rotation.x = 0;
  parts.leftElbowPivot.rotation.x = -0.22;
  parts.rightElbowPivot.rotation.x = -0.22;

  // Natural head tracking toward the ball (glances down at the ball when dribbling!)
  parts.headGroup.rotation.y = THREE.MathUtils.clamp(headLookYaw, -0.64, 0.64);
  const dribbleLookDown =
    isAICarrier || isCloseDribbling
      ? 0.16 + Math.sin(stridePhase * 0.5) * 0.06
      : 0;
  parts.headGroup.rotation.x = dribbleLookDown - normalizedSpeed * 0.07;

  if (Math.abs(gkDiveDir) > 0.05) {
    // Goalkeeper Full-Stretch Reflex Diving Save Pose with bent knee push-off
    parts.bodyPivot.rotation.z = gkDiveDir * 1.05;
    parts.bodyPivot.position.y = 0.34;
    parts.leftArmPivot.rotation.x = -2.65;
    parts.rightArmPivot.rotation.x = -2.65;
    parts.leftElbowPivot.rotation.x = -0.15;
    parts.rightElbowPivot.rotation.x = -0.15;
    parts.leftArmPivot.rotation.z = -0.35;
    parts.rightArmPivot.rotation.z = 0.35;
    parts.leftLegPivot.rotation.x = 0.25;
    parts.rightLegPivot.rotation.x = -0.2;
    parts.leftKneePivot.rotation.x = 0.45;
    parts.rightKneePivot.rotation.x = 0.25;
  } else if (skillMove && skillProgress > 0) {
    if (skillMove === 'roulette') {
      // Zidane 360° Roulette Spin with natural knee bend & drag-back foot work
      parts.bodyPivot.rotation.y = skillProgress * Math.PI * 2;
      parts.bodyPivot.rotation.x = 0.26;
      const s = Math.sin(skillProgress * Math.PI * 4);
      parts.leftLegPivot.rotation.x = -s * 0.68;
      parts.rightLegPivot.rotation.x = s * 0.68;
      parts.leftKneePivot.rotation.x = Math.max(0.18, s * 0.68);
      parts.rightKneePivot.rotation.x = Math.max(0.18, -s * 0.68);
      parts.leftArmPivot.rotation.z = -0.48;
      parts.rightArmPivot.rotation.z = 0.48;
      parts.leftElbowPivot.rotation.x = -0.78;
      parts.rightElbowPivot.rotation.x = -0.78;
    } else if (skillMove === 'elastico') {
      // Ronaldinho / Vinicius Elastico Flip-Flap whip (outside push -> inside snap)
      const whip = Math.sin(skillProgress * Math.PI * 2);
      parts.bodyPivot.rotation.z = whip * 0.38;
      parts.bodyPivot.rotation.x = 0.24;
      parts.rightLegPivot.rotation.z = whip * 0.56;
      parts.rightLegPivot.rotation.x = -0.48 - Math.abs(whip) * 0.18;
      parts.rightKneePivot.rotation.x = 0.36;
      parts.leftLegPivot.rotation.x = 0.22;
      parts.leftKneePivot.rotation.x = 0.32;
      parts.leftArmPivot.rotation.z = -0.42;
      parts.rightArmPivot.rotation.z = 0.42;
      parts.leftElbowPivot.rotation.x = -0.68;
      parts.rightElbowPivot.rotation.x = -0.68;
    } else if (skillMove === 'stepover_burst') {
      // Rapid Dual-Leg Stepovers + Low Crouch Burst
      const scissors = Math.sin(skillProgress * Math.PI * 6);
      parts.bodyPivot.rotation.x = 0.34;
      parts.bodyPivot.position.y = -0.05;
      parts.leftLegPivot.rotation.x = -scissors * 0.72;
      parts.rightLegPivot.rotation.x = scissors * 0.72;
      parts.leftKneePivot.rotation.x = 0.42 + Math.max(0, scissors) * 0.48;
      parts.rightKneePivot.rotation.x = 0.42 + Math.max(0, -scissors) * 0.48;
      parts.leftLegPivot.rotation.z = scissors * 0.32;
      parts.rightLegPivot.rotation.z = -scissors * 0.32;
      parts.leftElbowPivot.rotation.x = -0.85;
      parts.rightElbowPivot.rotation.x = -0.85;
    } else if (skillMove === 'rainbow_flick') {
      // Neymar Heel-to-Overhead Rainbow Flick
      const arc = Math.sin(skillProgress * Math.PI);
      parts.bodyPivot.rotation.x = 0.4 * arc;
      parts.bodyPivot.position.y = 0.18 * arc;
      parts.leftLegPivot.rotation.x = 0.58 * arc;
      parts.rightLegPivot.rotation.x = 0.76 * arc;
      parts.leftKneePivot.rotation.x = 0.98 * arc;
      parts.rightKneePivot.rotation.x = 1.22 * arc;
      parts.leftArmPivot.rotation.x = -0.72 * arc;
      parts.rightArmPivot.rotation.x = -0.72 * arc;
    }
  } else if (kickTimer > 0) {
    // Biomechanical shooting / passing windup, knee snap & follow-through
    const prog = 1 - Math.min(1, kickTimer / 0.28);
    const windupAndStrike = Math.sin(prog * Math.PI * 1.35 - 0.35);
    parts.rightLegPivot.rotation.x = -windupAndStrike * 1.15;
    // Knee coils back during windup and snaps straight at ball contact
    parts.rightKneePivot.rotation.x =
      prog < 0.45 ? (1 - prog) * 1.18 : Math.max(0.05, (1 - prog) * 0.3);
    // Plant leg slightly flexed at knee for stability
    parts.leftLegPivot.rotation.x = 0.24;
    parts.leftKneePivot.rotation.x = 0.28;
    parts.leftArmPivot.rotation.x = -0.78;
    parts.leftArmPivot.rotation.z = -0.38;
    parts.rightArmPivot.rotation.x = 0.48;
    parts.leftElbowPivot.rotation.x = -0.55;
    parts.rightElbowPivot.rotation.x = -0.45;
    parts.bodyPivot.rotation.x = -windupAndStrike * 0.12 + 0.08;
    parts.torsoMesh.rotation.y = windupAndStrike * 0.26;
  } else if (slideProgress > 0) {
    // =========================================================================
    // DYNAMIC BIOMECHANICAL SLIDING TACKLE & GROUND BALL SNATCH KINEMATICS
    // =========================================================================
    const slideArch = Math.sin(slideProgress * Math.PI);
    const dropProg = Math.sin(Math.min(1.0, slideProgress * 1.8) * Math.PI * 0.5);

    parts.bodyPivot.position.y = -0.38 * dropProg;
    parts.bodyPivot.rotation.x = -0.48 * slideArch;
    parts.bodyPivot.rotation.z = 0.56 * slideArch;
    parts.torsoMesh.rotation.y = -0.32 * slideArch;

    parts.rightLegPivot.rotation.x = -1.48 * dropProg;
    parts.rightLegPivot.rotation.z = -0.15 * dropProg;
    parts.rightKneePivot.rotation.x = 0.04;

    parts.leftLegPivot.rotation.x = 0.62 * dropProg;
    parts.leftLegPivot.rotation.z = 0.22 * dropProg;
    parts.leftKneePivot.rotation.x = 1.38 * dropProg;

    parts.leftArmPivot.rotation.x = 0.42 * dropProg;
    parts.leftArmPivot.rotation.z = -0.68 * dropProg;
    parts.rightArmPivot.rotation.x = -0.85 * dropProg;
    parts.rightArmPivot.rotation.z = 0.45 * dropProg;
    parts.leftElbowPivot.rotation.x = -0.48;
    parts.rightElbowPivot.rotation.x = -0.48;
  } else if (normalizedSpeed > 0.03) {
    // =========================================================================
    // HYPERMOTION V RUNNING & BALL-TOUCH DRIBBLING CYCLE
    // =========================================================================
    const strideSin = Math.sin(stridePhase);
    const strideCos = Math.cos(stridePhase);

    // When dribbling with the ball, player takes quicker, tighter foot touches with a crisp boot tap at forward extension
    const dribbleTouchSnap = isCarryingBall
      ? Math.pow(Math.max(0, Math.abs(strideSin)), 2.2) * 0.14
      : 0;

    // Hip swing amplitude (negative X rotates thigh forward in our coordinate frame)
    const hipAmp =
      (isCloseDribbling ? 0.24 : 0.28) +
      normalizedSpeed * (isCloseDribbling ? 0.48 : 0.68) +
      dribbleTouchSnap;
    parts.leftLegPivot.rotation.x = -strideSin * hipAmp;
    parts.rightLegPivot.rotation.x = strideSin * hipAmp;

    // Subtle lateral foot-to-foot abduction when dribbling to cradle & roll the ball between boots
    if (isCarryingBall) {
      const lateralWeave = Math.sin(stridePhase) * (isCloseDribbling ? 0.14 : 0.08);
      parts.leftLegPivot.rotation.z = -0.05 + lateralWeave;
      parts.rightLegPivot.rotation.z = 0.05 + lateralWeave;
    }

    // Asymmetric Knee Flexion: knee bends deeply during recovery and snaps slightly at ball-touch contact
    const crouchKneeAdd = isCloseDribbling ? 0.16 : isCarryingBall ? 0.07 : 0;
    const leftRecoveryKnee =
      Math.max(0, Math.sin(stridePhase - 0.85)) * (0.45 + normalizedSpeed * 0.78) +
      0.08 +
      crouchKneeAdd;
    const rightRecoveryKnee =
      Math.max(0, Math.sin(stridePhase + Math.PI - 0.85)) *
        (0.45 + normalizedSpeed * 0.78) +
      0.08 +
      crouchKneeAdd;
    parts.leftKneePivot.rotation.x = leftRecoveryKnee;
    parts.rightKneePivot.rotation.x = rightRecoveryKnee;

    // Opposite Arm Pump + Wider Balance Arms When Dribbling
    const armAmp = 0.22 + normalizedSpeed * 0.62;
    const dribbleArmSpread = isCloseDribbling ? 0.14 : isCarryingBall ? 0.08 : 0;
    parts.leftArmPivot.rotation.x = strideSin * armAmp;
    parts.rightArmPivot.rotation.x = -strideSin * armAmp;
    parts.leftArmPivot.rotation.z =
      -0.14 - normalizedSpeed * 0.08 - dribbleArmSpread;
    parts.rightArmPivot.rotation.z =
      0.14 + normalizedSpeed * 0.08 + dribbleArmSpread;

    const elbowBase = -0.44 - normalizedSpeed * 0.5;
    parts.leftElbowPivot.rotation.x =
      elbowBase - Math.max(0, -strideSin) * 0.28;
    parts.rightElbowPivot.rotation.x =
      elbowBase - Math.max(0, strideSin) * 0.28;

    // Upper-Torso Counter-Rotation, Shoulder Feint & Pelvis Roll
    const feintSway = isCloseDribbling ? strideSin * 0.065 : 0;
    parts.torsoMesh.rotation.y = -strideSin * (0.1 + normalizedSpeed * 0.13);
    parts.bodyPivot.rotation.y = strideSin * 0.055 * normalizedSpeed;
    parts.bodyPivot.rotation.z =
      THREE.MathUtils.clamp(turnBankAngle, -0.32, 0.32) +
      strideCos * 0.038 * normalizedSpeed +
      feintSway;

    // Forward sprint lean & low-center-of-gravity dribble crouch
    const crouchDropY = isCloseDribbling ? -0.055 : isCarryingBall ? -0.022 : 0;
    parts.bodyPivot.rotation.x =
      (isCloseDribbling ? 0.16 : 0.06) + normalizedSpeed * 0.22;
    parts.bodyPivot.position.y =
      Math.abs(strideCos) * 0.072 * Math.min(1, normalizedSpeed) -
      0.015 * Math.min(1, normalizedSpeed) +
      crouchDropY;
  } else {
    // =========================================================================
    // NATURAL ATHLETIC READY STANCE (SLIGHT KNEE FLEX, BREATHING & WEIGHT SHIFT)
    // =========================================================================
    const idleBreath = Math.sin(elapsedTime * 2.8 + parts.root.id) * 0.028;
    const weightShift = Math.sin(elapsedTime * 1.4 + parts.root.id) * 0.025;

    parts.leftLegPivot.rotation.x = THREE.MathUtils.lerp(
      parts.leftLegPivot.rotation.x,
      -0.08,
      0.18
    );
    parts.rightLegPivot.rotation.x = THREE.MathUtils.lerp(
      parts.rightLegPivot.rotation.x,
      -0.08,
      0.18
    );
    parts.leftKneePivot.rotation.x = 0.16 + idleBreath;
    parts.rightKneePivot.rotation.x = 0.16 + idleBreath;
    parts.leftLegPivot.rotation.z = -0.04 + weightShift;
    parts.rightLegPivot.rotation.z = 0.04 + weightShift;

    parts.leftArmPivot.rotation.x = idleBreath * 1.2;
    parts.rightArmPivot.rotation.x = -idleBreath * 1.2;
    parts.leftArmPivot.rotation.z = -0.14;
    parts.rightArmPivot.rotation.z = 0.14;
    parts.leftElbowPivot.rotation.x = -0.36;
    parts.rightElbowPivot.rotation.x = -0.36;

    parts.bodyPivot.rotation.x = THREE.MathUtils.lerp(
      parts.bodyPivot.rotation.x,
      0.05,
      0.18
    );
    parts.bodyPivot.rotation.z = weightShift * 0.6;
    parts.bodyPivot.position.y = -0.02 + idleBreath * 0.4;
  }

  // Ground Selection Ring & Overhead HyperMotion Chevron
  const ringMat = parts.selectionRing.material as THREE.MeshBasicMaterial;
  const chevronMat =
    parts.overheadChevron.material as THREE.MeshStandardMaterial;
  if (isActiveUser) {
    ringMat.opacity = 0.88;
    ringMat.color.setHex(isCloseDribbling ? 0x38bdf8 : 0xccff00);
    chevronMat.color.setHex(isCloseDribbling ? 0x38bdf8 : 0xccff00);
    const pulseScale = 1 + Math.sin(elapsedTime * 6) * 0.04;
    parts.selectionRing.scale.set(pulseScale, pulseScale, 1);
    parts.overheadChevron.visible = true;
    parts.overheadChevron.position.y = 2.48 + Math.sin(elapsedTime * 5) * 0.08;
    parts.overheadChevron.rotation.y = elapsedTime * 2.2;
  } else if (isOnlineAwayUser) {
    ringMat.opacity = 0.88;
    ringMat.color.setHex(0x38bdf8);
    chevronMat.color.setHex(0x38bdf8);
    parts.overheadChevron.visible = true;
    parts.overheadChevron.position.y = 2.48 + Math.sin(elapsedTime * 5) * 0.08;
    parts.overheadChevron.rotation.y = -elapsedTime * 2.2;
  } else if (isAICarrier) {
    ringMat.opacity = 0.65;
    ringMat.color.setHex(0x00f0ff);
    parts.overheadChevron.visible = false;
  } else {
    ringMat.opacity = 0.0;
    parts.overheadChevron.visible = false;
  }
}

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  AITacticalConfig,
  BOOT_CATALOG,
  FormationId,
  GameMode,
  GameScreenState,
  GraphicsSettings,
  MatchStats,
  MentalityId,
  PlayerEquipmentLoadout,
  SKILL_MOVES_CATALOG,
  SkillMoveId,
  TouchControllerInput,
} from '../types/game';
import {
  applyEquipmentLoadoutToPlayer,
  ArticulatedPlayerParts,
  animatePlayerKinematics,
  createArticulatedPlayer,
} from './playerModel';
import { ProgressionService } from '../services/progressionService';
import {
  createAdBoardTexture,
  createBallNormalMap,
  createBallTexture,
  createContactShadowTexture,
  createPitchGrassTexture,
} from './proceduralTextures';
import {
  createStadiumArena,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  PITCH_HALF_W,
  PITCH_HALF_Z,
  populateStadiumArchitecture,
  StadiumEnvironmentObjects,
} from './stadiumBuilder';
import { soundEngine } from '../audio/soundEngine';

export type TacticalOverrideCommand =
  | 'TRIGGER_THROUGH_BALL'
  | 'INSTRUCT_SHOOT_NOW'
  | 'HIGH_PRESS_SWARM'
  | 'SWITCH_PLAY'
  | null;

export interface OnlineMatchSnapshot {
  bx: number;
  by: number;
  bz: number;
  bvx: number;
  bvy: number;
  bvz: number;
  ownerId: number | null;
  activeHomeIdx: number;
  activeAwayIdx: number;
  homeScore: number;
  awayScore: number;
  clock: number;
  half: 1 | 2;
  homeShots: number;
  awayShots: number;
  homePasses: number;
  awayPasses: number;
  homeTackles: number;
  awayTackles: number;
  homeCorners: number;
  awayCorners: number;
  homeXG: number;
  awayXG: number;
  momentum: number;
  aiAction: string;
  banner: string;
  setPieceBanner: string | null;
  players: Array<{
    x: number;
    z: number;
    vx: number;
    vz: number;
    fa: number;
    kt: number;
    st: number;
    sk: SkillMoveId | null;
    skt: number;
    gkd: number;
  }>;
}

interface FootballCanvasProps {
  screenState: GameScreenState;
  gameMode: GameMode;
  equipment: PlayerEquipmentLoadout;
  graphics: GraphicsSettings;
  aiTactics: AITacticalConfig;
  tacticalCommand: TacticalOverrideCommand;
  onConsumeTacticalCommand: () => void;
  onStatsUpdate: (stats: MatchStats) => void;
  onGoalScored: (
    scorerName: string,
    team: 'HOME' | 'AWAY',
    homeScore: number,
    awayScore: number
  ) => void;
  onMatchHalfTime: (homeScore: number, awayScore: number) => void;
  onMatchFullTime: (homeScore: number, awayScore: number) => void;
  resetSignal: number;
  secondHalfSignal: number;
  skipReplaySignal?: number;
  onSkipGoalReplay?: () => void;
  triggerCornerKickPractice?: number;
  starterPlayerIds?: string[];
  customizerZoomTarget: 'FULL_BODY' | 'BOOTS' | 'UPPER_KIT' | 'HEADGEAR' | 'BALL';
  touchInputRef: React.MutableRefObject<TouchControllerInput>;
  onlineRole: 'HOME' | 'AWAY' | 'SPECTATOR';
  remoteGuestInputRef: React.MutableRefObject<TouchControllerInput>;
  incomingSnapshotRef: React.MutableRefObject<OnlineMatchSnapshot | null>;
  onBroadcastMatchState?: (snapshot: OnlineMatchSnapshot) => void;
  onSendGuestInput?: (input: TouchControllerInput) => void;
}

interface ReplayFrameSnapshot {
  bx: number;
  by: number;
  bz: number;
  brx: number;
  brz: number;
  players: Array<{
    x: number;
    z: number;
    fa: number;
    sp: number;
    spd: number;
    kt: number;
    sk: SkillMoveId | null;
    skp: number;
    gkd: number;
    tb: number;
    slp?: number;
  }>;
}

interface SimPlayer {
  id: number;
  name: string;
  squadNumber: number;
  ovr: number;
  pace: number;
  shooting: number;
  isHome: boolean;
  isGK: boolean;
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
  baseX: number;
  baseZ: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  stridePhase: number;
  kickTimer: number;
  stamina: number;
  activeSkill: SkillMoveId | null;
  skillTimer: number;
  skillDuration: number;
  stunTimer: number;
  gkDiveTimer: number;
  gkDiveDir: number;
  turnBank: number;
  slideTimer: number;
  slideDuration: number;
  slideCooldown: number;
  slideDirX: number;
  slideDirZ: number;
  parts: ArticulatedPlayerParts;
}

const HOME_ROSTER = [
  { name: 'COURTOIS', number: 1, role: 'GK' as const, ovr: 89, pace: 78, shooting: 60 },
  { name: 'CARVAJAL', number: 2, role: 'DEF' as const, ovr: 86, pace: 82, shooting: 68 },
  { name: 'RÜDIGER', number: 22, role: 'DEF' as const, ovr: 88, pace: 85, shooting: 65 },
  { name: 'VALVERDE', number: 8, role: 'MID' as const, ovr: 88, pace: 88, shooting: 84 },
  { name: 'BELLINGHAM', number: 5, role: 'MID' as const, ovr: 90, pace: 84, shooting: 88 },
  { name: 'VINICIUS JR', number: 7, role: 'FWD' as const, ovr: 90, pace: 95, shooting: 86 },
  { name: 'MBAPPÉ', number: 9, role: 'FWD' as const, ovr: 91, pace: 97, shooting: 90 },
];

const AWAY_ROSTER = [
  { name: 'EDERSON', number: 31, role: 'GK' as const, ovr: 88, pace: 76, shooting: 62 },
  { name: 'DIAS', number: 3, role: 'DEF' as const, ovr: 88, pace: 78, shooting: 60 },
  { name: 'GVARDIOL', number: 24, role: 'DEF' as const, ovr: 85, pace: 82, shooting: 68 },
  { name: 'RODRI', number: 16, role: 'MID' as const, ovr: 91, pace: 76, shooting: 82 },
  { name: 'DE BRUYNE', number: 17, role: 'MID' as const, ovr: 90, pace: 77, shooting: 88 },
  { name: 'FODEN', number: 47, role: 'FWD' as const, ovr: 88, pace: 86, shooting: 85 },
  { name: 'HAALAND', number: 9, role: 'FWD' as const, ovr: 91, pace: 89, shooting: 93 },
];

const FORMATION_ANCHORS: Record<FormationId, Array<[number, number]>> = {
  '4-3-3 Attack': [
    [-0.92, 0], // GK
    [-0.56, -0.45], // DEF L
    [-0.56, 0.45], // DEF R
    [-0.18, 0.0], // CDM
    [0.08, -0.35], // CAM/CM (Star player slot index 4)
    [0.36, -0.68], // LW
    [0.44, 0.25], // ST/RW
  ],
  '4-4-2 Classic': [
    [-0.92, 0],
    [-0.58, -0.48],
    [-0.58, 0.48],
    [-0.15, -0.52],
    [-0.08, 0.0],
    [0.38, -0.32],
    [0.38, 0.32],
  ],
  '3-5-2 Wingplay': [
    [-0.92, 0],
    [-0.6, 0.0],
    [-0.45, -0.55],
    [-0.45, 0.55],
    [0.12, 0.0],
    [0.42, -0.38],
    [0.42, 0.38],
  ],
  '4-2-3-1 Control': [
    [-0.92, 0], // GK
    [-0.60, -0.45], // DEF L
    [-0.60, 0.45], // DEF R
    [-0.22, 0.0], // CDM
    [0.10, 0.0], // CAM
    [0.34, -0.55], // LW
    [0.46, 0.0], // ST
  ],
  '5-3-2 Counter': [
    [-0.92, 0], // GK
    [-0.66, -0.52], // LWB
    [-0.66, 0.0], // CB
    [-0.15, -0.28], // CM L
    [-0.15, 0.28], // CM R
    [0.42, -0.30], // CF
    [0.44, 0.30], // ST
  ],
};

const _camIdealPos = new THREE.Vector3();
const _camIdealLook = new THREE.Vector3();
const _dummyMatrix = new THREE.Object3D();
const _ballRollAxis = new THREE.Vector3();
const _ballMoveDir = new THREE.Vector3();

function pointToSegmentDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 0.0001) return Math.hypot(apx, apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
  const closestX = ax + t * abx;
  const closestZ = az + t * abz;
  return Math.hypot(px - closestX, pz - closestZ);
}

export const FootballCanvas: React.FC<FootballCanvasProps> = ({
  screenState,
  gameMode,
  equipment,
  graphics,
  aiTactics,
  tacticalCommand,
  onConsumeTacticalCommand,
  onStatsUpdate,
  onGoalScored,
  onMatchHalfTime,
  onMatchFullTime,
  resetSignal,
  secondHalfSignal,
  skipReplaySignal = 0,
  onSkipGoalReplay,
  triggerCornerKickPractice = 0,
  starterPlayerIds,
  customizerZoomTarget,
  touchInputRef,
  onlineRole,
  remoteGuestInputRef,
  incomingSnapshotRef,
  onBroadcastMatchState,
  onSendGuestInput,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;

  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;

  const onlineRoleRef = useRef(onlineRole);
  onlineRoleRef.current = onlineRole;

  const equipmentRef = useRef(equipment);
  const graphicsRef = useRef(graphics);
  const aiTacticsRef = useRef(aiTactics);
  aiTacticsRef.current = aiTactics;

  const tacticalCommandRef = useRef(tacticalCommand);
  tacticalCommandRef.current = tacticalCommand;

  const customizerZoomRef = useRef(customizerZoomTarget);
  customizerZoomRef.current = customizerZoomTarget;

  const starterPlayerIdsRef = useRef(starterPlayerIds);
  starterPlayerIdsRef.current = starterPlayerIds;

  const callbacksRef = useRef({
    onConsumeTacticalCommand,
    onStatsUpdate,
    onGoalScored,
    onMatchHalfTime,
    onMatchFullTime,
    onSkipGoalReplay,
    onBroadcastMatchState,
    onSendGuestInput,
  });
  callbacksRef.current = {
    onConsumeTacticalCommand,
    onStatsUpdate,
    onGoalScored,
    onMatchHalfTime,
    onMatchFullTime,
    onSkipGoalReplay,
    onBroadcastMatchState,
    onSendGuestInput,
  };

  const sceneObjectsRef = useRef<{
    players: SimPlayer[];
    ballMesh: THREE.Mesh;
    maxAnisotropy: number;
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    rimLight: THREE.DirectionalLight;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    bloomPass: UnrealBloomPass;
    stadium: StadiumEnvironmentObjects;
    currentStadiumId: string;
    resetMatchFn?: () => void;
    startSecondHalfFn?: () => void;
    skipGoalReplayFn?: () => void;
    triggerCornerKickFn?: (attackingTeam?: 'HOME' | 'AWAY', cornerZSign?: -1 | 1) => void;
  } | null>(null);

  useEffect(() => {
    if (screenState === 'PLAYING') {
      soundEngine.startStadiumAmbience();
    } else {
      soundEngine.stopStadiumAmbience();
    }
    return () => {
      soundEngine.stopStadiumAmbience();
    };
  }, [screenState]);

  useEffect(() => {
    equipmentRef.current = equipment;
    starterPlayerIdsRef.current = starterPlayerIds;
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;

    // Sync Home starters with drafted/equipped players (OVR, Pace, Shooting, Name & Number)
    ctx.players.forEach((p, idx) => {
      if (p.isHome && idx < 7) {
        const fallbackInfo = HOME_ROSTER[idx];
        const starterId = starterPlayerIds?.[idx];
        const customPlayer = starterId
          ? ProgressionService.getPlayerById(starterId)
          : undefined;
        if (customPlayer) {
          p.name = customPlayer.shortName;
          p.squadNumber = customPlayer.number;
          p.ovr = customPlayer.currentOvr ?? customPlayer.baseOvr ?? fallbackInfo.ovr;
          p.pace = customPlayer.pace ?? fallbackInfo.pace;
          p.shooting = customPlayer.shooting ?? fallbackInfo.shooting;
          p.role = customPlayer.primaryRole;
        } else if (idx === 4) {
          p.name = equipment.starName || fallbackInfo.name;
          p.squadNumber = equipment.starNumber || fallbackInfo.number;
          p.ovr = fallbackInfo.ovr;
          p.pace = fallbackInfo.pace;
          p.shooting = fallbackInfo.shooting;
        }
      }
      applyEquipmentLoadoutToPlayer(
        p.parts,
        equipment,
        p.isHome,
        p.isGK,
        p.squadNumber,
        ctx.maxAnisotropy
      );
    });

    const ballMat = ctx.ballMesh.material as THREE.MeshPhysicalMaterial;
    if (ballMat.map) ballMat.map.dispose();
    ballMat.map = createBallTexture(equipment.ballStyle, ctx.maxAnisotropy);
    ballMat.needsUpdate = true;
  }, [equipment, starterPlayerIds]);

  useEffect(() => {
    graphicsRef.current = graphics;
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;

    ctx.renderer.toneMappingExposure = graphics.exposure;

    ctx.bloomPass.enabled = graphics.bloomEnabled;
    ctx.bloomPass.threshold = 1.92;
    ctx.bloomPass.strength =
      graphics.preset === 'rtx5080_ultra'
        ? Math.min(0.05, graphics.bloomStrength)
        : graphics.preset === 'broadcast_high'
        ? Math.min(0.03, graphics.bloomStrength * 0.65)
        : 0;

    if (ctx.currentStadiumId !== graphics.stadium) {
      ctx.currentStadiumId = graphics.stadium;
      populateStadiumArchitecture(
        ctx.stadium.architectureGroup,
        graphics.stadium,
        ctx.maxAnisotropy
      );

      const pitchMat = ctx.stadium.pitchMesh.material as THREE.MeshStandardMaterial;
      if (pitchMat.map) pitchMat.map.dispose();
      pitchMat.map = createPitchGrassTexture(ctx.maxAnisotropy, graphics.stadium);
      pitchMat.needsUpdate = true;

      ctx.stadium.adBoardMaterials.forEach((mat) => {
        if (mat.map) mat.map.dispose();
        const newAdTex = createAdBoardTexture(ctx.maxAnisotropy, graphics.stadium);
        mat.map = newAdTex;
        mat.emissiveMap = newAdTex;
        mat.needsUpdate = true;
      });
    }

    if (graphics.weatherLighting === 'champions_night') {
      ctx.scene.background = new THREE.Color(0x050a14);
      ctx.scene.fog = new THREE.FogExp2(0x050a14, 0.0032);
      ctx.keyLight.color.setHex(0xfff7ed);
      ctx.keyLight.intensity = 1.58;
      ctx.fillLight.color.setHex(0xffedd5);
      ctx.fillLight.intensity = 0.46;
      ctx.hemiLight.color.setHex(0xbbe1fa);
      ctx.hemiLight.groundColor.setHex(0x143d1e);
      ctx.hemiLight.intensity = 0.68;
      ctx.rimLight.color.setHex(0x7dd3fc);
      ctx.rimLight.intensity = 0.42;
    } else if (graphics.weatherLighting === 'golden_hour') {
      ctx.scene.background = new THREE.Color(0x21121b);
      ctx.scene.fog = new THREE.FogExp2(0x21121b, 0.0036);
      ctx.keyLight.color.setHex(0xffaa48);
      ctx.keyLight.intensity = 1.65;
      ctx.fillLight.color.setHex(0xfde68a);
      ctx.fillLight.intensity = 0.48;
      ctx.hemiLight.color.setHex(0xfbcfe8);
      ctx.hemiLight.groundColor.setHex(0x1c3f22);
      ctx.hemiLight.intensity = 0.72;
      ctx.rimLight.color.setHex(0xf472b6);
      ctx.rimLight.intensity = 0.44;
    } else {
      ctx.scene.background = new THREE.Color(0x0c1422);
      ctx.scene.fog = new THREE.FogExp2(0x0c1422, 0.0026);
      ctx.keyLight.color.setHex(0xf8fafc);
      ctx.keyLight.intensity = 1.72;
      ctx.fillLight.color.setHex(0xe2e8f0);
      ctx.fillLight.intensity = 0.52;
      ctx.hemiLight.color.setHex(0xf1f5f9);
      ctx.hemiLight.groundColor.setHex(0x184223);
      ctx.hemiLight.intensity = 0.78;
      ctx.rimLight.color.setHex(0xbae6fd);
      ctx.rimLight.intensity = 0.42;
    }
  }, [graphics]);

  useEffect(() => {
    if (resetSignal > 0 && sceneObjectsRef.current?.resetMatchFn) {
      sceneObjectsRef.current.resetMatchFn();
    }
  }, [resetSignal]);

  useEffect(() => {
    if (secondHalfSignal > 0 && sceneObjectsRef.current?.startSecondHalfFn) {
      sceneObjectsRef.current.startSecondHalfFn();
    }
  }, [secondHalfSignal]);

  useEffect(() => {
    if (skipReplaySignal > 0 && sceneObjectsRef.current?.skipGoalReplayFn) {
      sceneObjectsRef.current.skipGoalReplayFn();
    }
  }, [skipReplaySignal]);

  useEffect(() => {
    if (
      triggerCornerKickPractice > 0 &&
      sceneObjectsRef.current?.triggerCornerKickFn
    ) {
      sceneObjectsRef.current.triggerCornerKickFn('HOME', 1);
    }
  }, [triggerCornerKickPractice]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.FogExp2(0x050a14, 0.0032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.2, 340);
    camera.position.set(0, 26, 38);
    const currentCamPos = new THREE.Vector3(0, 26, 38);
    const currentCamLook = new THREE.Vector3(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = graphicsRef.current.exposure;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2.0));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    // Calibrated environment intensity so players have crisp natural speculars and ZERO HDR glow
    scene.environmentIntensity = 0.26;
    pmremGenerator.dispose();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      Math.min(0.05, graphicsRef.current.bloomStrength),
      0.25,
      1.92
    );
    bloomPass.enabled = graphicsRef.current.bloomEnabled && !isHeadless;
    composer.addPass(bloomPass);

    const hemiLight = new THREE.HemisphereLight(0xbbe1fa, 0x143d1e, 0.68);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.58);
    keyLight.position.set(28, 48, 32);
    keyLight.castShadow = !isHeadless;
    const shadowRes = 2048;
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    const d = 48;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d * 0.72;
    keyLight.shadow.camera.bottom = -d * 0.72;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 135;
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.016;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.42);
    rimLight.position.set(-34, 28, -28);
    scene.add(rimLight);

    // Secondary fill floodlight calibrated for sculpted 3D player depth without washout
    const fillLight = new THREE.DirectionalLight(0xffedd5, 0.46);
    fillLight.position.set(-28, 42, 32);
    scene.add(fillLight);

    const stadium = createStadiumArena(maxAnisotropy, graphicsRef.current.stadium);
    scene.add(stadium.root);

    const contactShadowTex = createContactShadowTexture();

    const ballRadius = 0.34;
    const ballGeo = new THREE.SphereGeometry(ballRadius, 36, 36);
    const ballNormalTex = createBallNormalMap();
    const ballMat = new THREE.MeshPhysicalMaterial({
      map: createBallTexture(equipmentRef.current.ballStyle, maxAnisotropy),
      normalMap: ballNormalTex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.45,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, ballRadius, 0);
    scene.add(ballMesh);

    const ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.68,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.set(0, 0.018, 0);
    scene.add(ballShadow);

    const tacticalLinePositions = new Float32Array(6);
    const tacticalLineGeo = new THREE.BufferGeometry();
    tacticalLineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(tacticalLinePositions, 3)
    );
    const tacticalLineMat = new THREE.LineDashedMaterial({
      color: 0xa3e635,
      dashSize: 0.8,
      gapSize: 0.4,
      transparent: true,
      opacity: 0.78,
    });
    const tacticalLine = new THREE.Line(tacticalLineGeo, tacticalLineMat);
    tacticalLine.position.y = 0.06;
    scene.add(tacticalLine);

    const tacticalTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    tacticalTargetRing.rotation.x = -Math.PI / 2;
    tacticalTargetRing.visible = false;
    scene.add(tacticalTargetRing);

    // 3D Corner Kick Curved Trajectory Visualizer & Landing Indicator
    const cornerTrajectoryGroup = new THREE.Group();
    cornerTrajectoryGroup.visible = false;
    scene.add(cornerTrajectoryGroup);

    const cornerLineGeo = new THREE.BufferGeometry();
    const cornerLineMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    const cornerTrajectoryLine = new THREE.Line(cornerLineGeo, cornerLineMat);
    cornerTrajectoryGroup.add(cornerTrajectoryLine);

    const cornerLandingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 32),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    );
    cornerLandingRing.rotation.x = -Math.PI / 2;
    cornerLandingRing.position.y = 0.04;
    cornerTrajectoryGroup.add(cornerLandingRing);

    const cornerLandingCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    cornerLandingCenter.rotation.x = -Math.PI / 2;
    cornerLandingCenter.position.y = 0.042;
    cornerTrajectoryGroup.add(cornerLandingCenter);

    const PARTICLE_COUNT = 120;
    const particleGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInstanced = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_COUNT
    );
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particlePool = Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      x: 0,
      y: -10,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1,
      scale: 1,
    }));

    const spawnParticles = (
      originX: number,
      originY: number,
      originZ: number,
      count: number,
      colorHex: number,
      speedSpread: number
    ) => {
      const c = new THREE.Color(colorHex);
      let spawned = 0;
      for (let i = 0; i < PARTICLE_COUNT && spawned < count; i++) {
        const p = particlePool[i];
        if (!p.active) {
          p.active = true;
          p.x = originX + (Math.random() - 0.5) * 0.4;
          p.y = originY + Math.random() * 0.2;
          p.z = originZ + (Math.random() - 0.5) * 0.4;
          const angle = Math.random() * Math.PI * 2;
          const spd = (0.4 + Math.random() * 0.8) * speedSpread;
          p.vx = Math.cos(angle) * spd;
          p.vy = 2.2 + Math.random() * speedSpread * 0.9;
          p.vz = Math.sin(angle) * spd;
          p.life = 0;
          p.maxLife = 0.38 + Math.random() * 0.35;
          p.scale = 0.6 + Math.random() * 0.8;
          particleInstanced.setColorAt(i, c);
          spawned++;
        }
      }
      if (particleInstanced.instanceColor) {
        particleInstanced.instanceColor.needsUpdate = true;
      }
    };

    // 3D Aerodynamic Shot Velocity Trail for Powerful Strikes
    const TRAIL_POINTS = 14;
    const ballTrailHistory: THREE.Vector3[] = Array.from(
      { length: TRAIL_POINTS },
      () => new THREE.Vector3(0, ballRadius, 0)
    );
    const ballTrailGeo = new THREE.BufferGeometry().setFromPoints(ballTrailHistory);
    const ballTrailMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.0,
    });
    const ballTrailLine = new THREE.Line(ballTrailGeo, ballTrailMat);
    ballTrailLine.frustumCulled = false;
    scene.add(ballTrailLine);

    const players: SimPlayer[] = [];
    const anchors =
      FORMATION_ANCHORS[aiTacticsRef.current.formation] ||
      FORMATION_ANCHORS['4-3-3 Attack'];

    HOME_ROSTER.forEach((info, idx) => {
      const isStar = idx === 4;
      const starterId = starterPlayerIdsRef.current?.[idx];
      const customPlayer = starterId ? ProgressionService.getPlayerById(starterId) : undefined;
      const num = customPlayer ? customPlayer.number : (isStar ? equipmentRef.current.starNumber : info.number);
      const name = customPlayer ? customPlayer.shortName : (isStar ? equipmentRef.current.starName : info.name);
      const role = customPlayer ? customPlayer.primaryRole : info.role;
      const ovr = customPlayer ? (customPlayer.currentOvr ?? customPlayer.baseOvr ?? info.ovr) : info.ovr;
      const pace = customPlayer ? (customPlayer.pace ?? info.pace) : info.pace;
      const shooting = customPlayer ? (customPlayer.shooting ?? info.shooting) : info.shooting;
      const parts = createArticulatedPlayer(
        idx,
        num,
        true,
        role === 'GK',
        equipmentRef.current,
        contactShadowTex,
        maxAnisotropy
      );
      const [bx, bz] = anchors[idx];
      const startX = bx * PITCH_HALF_W * 0.82;
      const startZ = bz * PITCH_HALF_Z * 0.85;
      parts.root.position.set(startX, 0, startZ);
      parts.root.rotation.y = Math.PI / 2;
      scene.add(parts.root);

      players.push({
        id: idx,
        name,
        squadNumber: num,
        ovr,
        pace,
        shooting,
        isHome: true,
        isGK: role === 'GK',
        role: role as any,
        baseX: bx,
        baseZ: bz,
        x: startX,
        z: startZ,
        vx: 0,
        vz: 0,
        facingAngle: Math.PI / 2,
        stridePhase: Math.random() * Math.PI * 2,
        kickTimer: 0,
        stamina: 100,
        activeSkill: null,
        skillTimer: 0,
        skillDuration: 0.4,
        stunTimer: 0,
        gkDiveTimer: 0,
        gkDiveDir: 0,
        turnBank: 0,
        slideTimer: 0,
        slideDuration: 0.52,
        slideCooldown: 0,
        slideDirX: 0,
        slideDirZ: 0,
        parts,
      });
    });

    AWAY_ROSTER.forEach((info, idx) => {
      const parts = createArticulatedPlayer(
        idx + 7,
        info.number,
        false,
        info.role === 'GK',
        equipmentRef.current,
        contactShadowTex,
        maxAnisotropy
      );
      const [bx, bz] = anchors[idx];
      const startX = -bx * PITCH_HALF_W * 0.82;
      const startZ = -bz * PITCH_HALF_Z * 0.85;
      parts.root.position.set(startX, 0, startZ);
      parts.root.rotation.y = -Math.PI / 2;
      scene.add(parts.root);

      players.push({
        id: idx + 7,
        name: info.name,
        squadNumber: info.number,
        ovr: info.ovr,
        pace: info.pace,
        shooting: info.shooting,
        isHome: false,
        isGK: info.role === 'GK',
        role: info.role,
        baseX: -bx,
        baseZ: -bz,
        x: startX,
        z: startZ,
        vx: 0,
        vz: 0,
        facingAngle: -Math.PI / 2,
        stridePhase: Math.random() * Math.PI * 2,
        kickTimer: 0,
        stamina: 100,
        activeSkill: null,
        skillTimer: 0,
        skillDuration: 0.4,
        stunTimer: 0,
        gkDiveTimer: 0,
        gkDiveDir: 0,
        turnBank: 0,
        slideTimer: 0,
        slideDuration: 0.52,
        slideCooldown: 0,
        slideDirX: 0,
        slideDirZ: 0,
        parts,
      });
    });

    // Simulation State Variables
    let activeHomeIdx = 4;
    let activeAwayIdx = 11;
    let ballX = 0;
    let ballY = ballRadius;
    let ballZ = 0;
    let ballVX = 0;
    let ballVY = 0;
    let ballVZ = 0;
    let ballOwner: SimPlayer | null = null;
    let lastTouchTeam: 'HOME' | 'AWAY' = 'HOME';
    let possessCooldown = 0;
    let hitstopTimer = 0;
    let cameraShakeIntensity = 0;
    let netRippleTimer = 0;
    let netRippleSide: -1 | 1 = 1;

    let homeScore = 0;
    let awayScore = 0;
    let matchClockSeconds = 0;
    let currentHalf: 1 | 2 = 1;
    let halfTimeCompleted = false;
    let homePossessionFrames = 1;
    let awayPossessionFrames = 1;
    let homeShots = 0;
    let awayShots = 0;
    let homePasses = 0;
    let awayPasses = 0;
    let homeTackles = 0;
    let awayTackles = 0;
    let homeCorners = 0;
    let awayCorners = 0;
    let homeXG = 0;
    let awayXG = 0;
    let momentum = 0;

    let awayFormation: FormationId = '4-3-3 Attack';
    let awayMentality: MentalityId = 'Tiki-Taka';
    let dynamicHomeFormation: FormationId = aiTacticsRef.current.formation;
    let dynamicHomeMentality: MentalityId = aiTacticsRef.current.mentality;
    let aiTacticalAdaptationBanner =
      'AI Engine: Auto-Switch, Corner Kicks & Goal Kicks Ready';

    let setPieceBanner: string | null = null;
    let setPieceBannerTimer = 0;
    let activeSetPieceType: 'CORNER' | 'GOAL_KICK' | null = null;

    // First-Person Corner Kick & Interactive Trajectory State
    let isUserCornerActive = false;
    let cornerAttackingTeam: 'HOME' | 'AWAY' = 'HOME';
    let cornerZSignCurrent: -1 | 1 = 1;
    let cornerTakerPlayer: SimPlayer | null = null;
    let isFollowingCornerTrajectory = false;
    let cornerTrajectoryProgress = 0;
    let cornerTrajectoryDuration = 1.35;
    let cornerTrajectorySpline: THREE.CatmullRomCurve3 | null = null;
    const cornerTargetLandingPos = new THREE.Vector3();
    let cornerIsOlimpico = false;

    let lastScorerName = '';
    let lastScorerTeam: 'HOME' | 'AWAY' | null = null;
    let aiCurrentAction = 'Live Kick-Off · Match In Progress';
    let shotPowerCharge = 0;
    let isChargingShot = false;
    let guestShotPowerCharge = 0;
    let aiDecisionCooldown = 0;
    let adaptationCheckTimer = 0;
    let hudSyncTimer = 0;
    let netSyncTimer = 0;
    let goalResetTimer = 0;

    // Live 3D Action Goal Replay Ring Buffer & Playback State
    const MAX_REPLAY_FRAMES = 175;
    const replayRingBuffer: ReplayFrameSnapshot[] = [];
    let activeReplayFrames: ReplayFrameSnapshot[] = [];
    let replayCursor = 0;
    let isPlayingGoalReplay = false;
    let goalScoredElapsed = 0;

    let customizerOrbitAngle = 0.35;
    let isDraggingCustomizer = false;
    let prevPointerX = 0;

    const resetPositionsToKickOff = (kickOffTeam: 'HOME' | 'AWAY' = 'HOME') => {
      const homeAnchors =
        FORMATION_ANCHORS[dynamicHomeFormation] || FORMATION_ANCHORS['4-3-3 Attack'];
      const awayAnchors =
        FORMATION_ANCHORS[awayFormation] || FORMATION_ANCHORS['4-3-3 Attack'];

      players.forEach((p, idx) => {
        const rosterIdx = idx % 7;
        const [bx, bz] = p.isHome ? homeAnchors[rosterIdx] : awayAnchors[rosterIdx];
        p.baseX = p.isHome ? bx : -bx;
        p.baseZ = p.isHome ? bz : -bz;
        p.x = p.baseX * PITCH_HALF_W * 0.72;
        p.z = p.baseZ * PITCH_HALF_Z * 0.82;
        p.vx = 0;
        p.vz = 0;
        p.facingAngle = p.isHome ? Math.PI / 2 : -Math.PI / 2;
        p.kickTimer = 0;
        p.activeSkill = null;
        p.skillTimer = 0;
        p.stunTimer = 0;
        p.gkDiveTimer = 0;
        p.gkDiveDir = 0;
        p.slideTimer = 0;
        p.slideCooldown = 0;
        p.parts.root.position.set(p.x, 0, p.z);
        p.parts.root.rotation.y = p.facingAngle;
      });

      ballX = 0;
      ballY = ballRadius;
      ballZ = 0;
      ballVX = 0;
      ballVY = 0;
      ballVZ = 0;
      activeSetPieceType = null;

      if (kickOffTeam === 'AWAY') {
        players[11].x = 0.4;
        players[11].z = 0;
        players[11].parts.root.position.set(0.4, 0, 0);
        ballOwner = players[11];
        lastTouchTeam = 'AWAY';
      } else {
        players[4].x = -0.4;
        players[4].z = 0;
        players[4].parts.root.position.set(-0.4, 0, 0);
        ballOwner = players[4];
        lastTouchTeam = 'HOME';
      }
      activeHomeIdx = 4;
      activeAwayIdx = 11;
      possessCooldown = 0.3;
      shotPowerCharge = 0;
      isChargingShot = false;
    };

    // =========================================================================
    // OFFICIAL GOAL KICK & CORNER KICK SET-PIECE POSITIONING
    // =========================================================================
    const setupGoalKick = (team: 'HOME' | 'AWAY', sideSign: -1 | 1) => {
      soundEngine.playWhistle('kickoff');
      const teamLabel = team === 'HOME' ? 'REAL MADRID' : 'MANCHESTER CITY';
      setPieceBanner = `GOAL KICK · ${teamLabel}`;
      setPieceBannerTimer = 2.8;
      activeSetPieceType = 'GOAL_KICK';
      aiCurrentAction = `${teamLabel} Goal Kick`;

      // Push outfield players out of penalty area
      const homeAnchors =
        FORMATION_ANCHORS[dynamicHomeFormation] || FORMATION_ANCHORS['4-3-3 Attack'];
      const awayAnchors =
        FORMATION_ANCHORS[awayFormation] || FORMATION_ANCHORS['4-3-3 Attack'];

      players.forEach((p, idx) => {
        const rosterIdx = idx % 7;
        const [bx, bz] = p.isHome ? homeAnchors[rosterIdx] : awayAnchors[rosterIdx];
        p.x = (p.isHome ? bx : -bx) * PITCH_HALF_W * 0.68;
        p.z = (p.isHome ? bz : -bz) * PITCH_HALF_Z * 0.82;
        p.vx = 0;
        p.vz = 0;
        p.facingAngle = p.isHome ? Math.PI / 2 : -Math.PI / 2;
      });

      const gk = team === 'HOME' ? players[0] : players[7];
      const kickX = team === 'HOME' ? -PITCH_HALF_W + 5.2 : PITCH_HALF_W - 5.2;
      const kickZ = sideSign * 3.0;

      gk.x = kickX - (team === 'HOME' ? 0.6 : -0.6);
      gk.z = kickZ;
      gk.facingAngle = team === 'HOME' ? Math.PI / 2 : -Math.PI / 2;

      ballX = kickX;
      ballY = ballRadius;
      ballZ = kickZ;
      ballVX = 0;
      ballVY = 0;
      ballVZ = 0;
      ballOwner = gk;
      lastTouchTeam = team;
      possessCooldown = 0.45;
      aiDecisionCooldown = 0.85;
    };

    const setupCornerKick = (attackingTeam: 'HOME' | 'AWAY', cornerZSign: -1 | 1) => {
      soundEngine.playWhistle('kickoff');
      const teamLabel = attackingTeam === 'HOME' ? 'REAL MADRID' : 'MANCHESTER CITY';
      setPieceBanner = `CORNER KICK · ${teamLabel}`;
      setPieceBannerTimer = 3.0;
      activeSetPieceType = 'CORNER';
      aiCurrentAction = `${teamLabel} Corner Kick`;

      if (attackingTeam === 'HOME') homeCorners++;
      else awayCorners++;

      const goalSideSign = attackingTeam === 'HOME' ? 1 : -1;
      const cornerX = goalSideSign * (PITCH_HALF_W - 0.75);
      const cornerZ = cornerZSign * (PITCH_HALF_Z - 0.75);

      // Reset velocities
      players.forEach((p) => {
        p.vx = 0;
        p.vz = 0;
      });

      // Position Goalkeepers on their goal lines
      players[0].x = -PITCH_HALF_W + 1.2;
      players[0].z = 0;
      players[7].x = PITCH_HALF_W - 1.2;
      players[7].z = 0;

      // Pack the penalty box (x around ±(PITCH_HALF_W - 9.5)) for headers!
      const boxCenterX = goalSideSign * (PITCH_HALF_W - 9.5);
      if (attackingTeam === 'HOME') {
        // Home Corner Taker: Vinicius Jr (index 5)
        const taker = players[5];
        taker.x = cornerX;
        taker.z = cornerZ;
        taker.facingAngle = cornerZSign > 0 ? Math.PI : 0;
        ballOwner = taker;
        activeHomeIdx = 5;
        lastTouchTeam = 'HOME';

        // Home attackers in the box
        players[6].x = boxCenterX + 1.2;
        players[6].z = -2.2; // Mbappé near post
        players[4].x = boxCenterX - 0.8;
        players[4].z = 1.8; // Bellingham central penalty spot
        players[3].x = boxCenterX - 6.5;
        players[3].z = 0; // Valverde edge of box
        players[1].x = 4;
        players[1].z = -8;
        players[2].x = 4;
        players[2].z = 8;

        // Away defenders marking in the box
        players[8].x = boxCenterX + 1.8;
        players[8].z = -1.8;
        players[9].x = boxCenterX + 0.5;
        players[9].z = 1.5;
        players[10].x = boxCenterX - 2.5;
        players[10].z = 0.5;
        players[11].x = boxCenterX - 4.0;
        players[11].z = cornerZSign * 5.0;
        players[12].x = boxCenterX + 2.2;
        players[12].z = cornerZSign * 3.5;
        players[13].x = 5;
        players[13].z = 0;
      } else {
        // Away Corner Taker: Foden (index 12)
        const taker = players[12];
        taker.x = cornerX;
        taker.z = cornerZ;
        taker.facingAngle = cornerZSign > 0 ? Math.PI : 0;
        ballOwner = taker;
        activeAwayIdx = 12;
        lastTouchTeam = 'AWAY';

        // Away attackers in the box
        players[13].x = boxCenterX - 1.2;
        players[13].z = -2.0; // Haaland
        players[11].x = boxCenterX + 0.8;
        players[11].z = 1.8; // De Bruyne
        players[10].x = boxCenterX + 6.5;
        players[10].z = 0; // Rodri edge of box
        players[8].x = -4;
        players[8].z = -8;
        players[9].x = -4;
        players[9].z = 8;

        // Home defenders marking in the box
        players[1].x = boxCenterX - 1.8;
        players[1].z = -1.6;
        players[2].x = boxCenterX - 0.5;
        players[2].z = 1.5;
        players[3].x = boxCenterX + 2.5;
        players[3].z = 0.5;
        players[4].x = boxCenterX + 4.0;
        players[4].z = cornerZSign * 5.0;
        players[5].x = -5;
        players[5].z = 0;
        players[6].x = 0;
        players[6].z = 0;
        activeHomeIdx = 2; // Rüdiger in the box to clear!
      }

      players.forEach((p) => {
        p.parts.root.position.set(p.x, 0, p.z);
      });

      ballX = cornerX;
      ballY = ballRadius;
      ballZ = cornerZ;
      ballVX = 0;
      ballVY = 0;
      ballVZ = 0;
      possessCooldown = 0.45;
      aiDecisionCooldown = 0.95;

      const isUserAttacking =
        (attackingTeam === 'HOME' && onlineRoleRef.current !== 'AWAY') ||
        (attackingTeam === 'AWAY' && onlineRoleRef.current === 'AWAY');

      isUserCornerActive = isUserAttacking;
      cornerAttackingTeam = attackingTeam;
      cornerZSignCurrent = cornerZSign;
      cornerTakerPlayer = attackingTeam === 'HOME' ? players[5] : players[12];
      isFollowingCornerTrajectory = false;
      cornerTrajectoryProgress = 0;
      cornerTrajectorySpline = null;

      if (isUserCornerActive) {
        if (touchInputRef.current) {
          touchInputRef.current.pendingCornerKick = false;
          touchInputRef.current.cornerPreset = 'PENALTY_SPOT';
          touchInputRef.current.cornerArcHeight = 'MEDIUM';
        }
        updateCornerTrajectoryVisual();
      } else {
        cornerTrajectoryGroup.visible = false;
      }
    };

    const updateCornerTrajectoryVisual = () => {
      if (!isUserCornerActive || !cornerTakerPlayer) {
        cornerTrajectoryGroup.visible = false;
        return;
      }
      cornerTrajectoryGroup.visible = true;

      const goalSideSign = cornerAttackingTeam === 'HOME' ? 1 : -1;
      const tIn = touchInputRef.current;
      const preset = tIn?.cornerPreset || 'PENALTY_SPOT';
      const arcChoice = tIn?.cornerArcHeight || 'MEDIUM';
      const arcMult = arcChoice === 'LOW' ? 0.62 : arcChoice === 'HIGH' ? 1.4 : 1.0;

      const startPt = new THREE.Vector3(ballX, ballRadius, ballZ);
      const waypoints: THREE.Vector3[] = [startPt];

      const boxCenterX = goalSideSign * (PITCH_HALF_W - 9.5);
      let targetX = boxCenterX - 0.8;
      let targetZ = 0;
      cornerIsOlimpico = false;

      const drawnPts = tIn?.cornerPathPoints;
      if (drawnPts && drawnPts.length >= 2 && !tIn?.cornerPreset) {
        const rect = renderer.domElement.getBoundingClientRect();
        const numSamples = Math.min(16, drawnPts.length);
        const step = (drawnPts.length - 1) / Math.max(1, numSamples - 1);

        for (let i = 1; i < numSamples; i++) {
          const pt = drawnPts[Math.round(i * step)];
          pointerNDC.x = ((pt.x - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNDC.y = -((pt.y - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNDC, camera);
          if (raycaster.ray.intersectPlane(groundPlane, groundHitPoint)) {
            const wx = THREE.MathUtils.clamp(
              groundHitPoint.x,
              -PITCH_HALF_W + 1,
              PITCH_HALF_W - 1
            );
            const wz = THREE.MathUtils.clamp(
              groundHitPoint.z,
              -PITCH_HALF_Z + 1,
              PITCH_HALF_Z - 1
            );
            const t = i / (numSamples - 1);
            const apexH = Math.sin(t * Math.PI) * (5.0 * arcMult);
            waypoints.push(new THREE.Vector3(wx, apexH + ballRadius, wz));
          }
        }

        const lastWp = waypoints[waypoints.length - 1];
        if (lastWp) {
          targetX = lastWp.x;
          targetZ = lastWp.z;
          const distToGoal = Math.hypot(targetX - goalSideSign * PITCH_HALF_W, targetZ);
          if (distToGoal < 3.2) {
            cornerIsOlimpico = true;
          }
        }
      } else {
        if (preset === 'NEAR_POST') {
          targetX = boxCenterX + 1.2;
          targetZ = -2.2;
          const ctrlX = THREE.MathUtils.lerp(startPt.x, targetX, 0.45) - goalSideSign * 1.5;
          const ctrlZ = THREE.MathUtils.lerp(startPt.z, targetZ, 0.45);
          waypoints.push(new THREE.Vector3(ctrlX, 4.2 * arcMult, ctrlZ));
        } else if (preset === 'PENALTY_SPOT') {
          targetX = boxCenterX - 0.8;
          targetZ = 1.8;
          const ctrlX = THREE.MathUtils.lerp(startPt.x, targetX, 0.48) - goalSideSign * 2.2;
          const ctrlZ = THREE.MathUtils.lerp(startPt.z, targetZ, 0.48);
          waypoints.push(new THREE.Vector3(ctrlX, 5.5 * arcMult, ctrlZ));
        } else if (preset === 'FAR_POST') {
          targetX = boxCenterX - 5.5;
          targetZ = -cornerZSignCurrent * 5.0;
          const ctrlX = THREE.MathUtils.lerp(startPt.x, targetX, 0.5) - goalSideSign * 2.5;
          const ctrlZ = THREE.MathUtils.lerp(startPt.z, targetZ, 0.5);
          waypoints.push(new THREE.Vector3(ctrlX, 6.2 * arcMult, ctrlZ));
        } else if (preset === 'OLIMPICO') {
          targetX = goalSideSign * (PITCH_HALF_W - 0.5);
          targetZ = cornerZSignCurrent * 1.8;
          cornerIsOlimpico = true;
          const ctrlX = goalSideSign * (PITCH_HALF_W - 5.0);
          const ctrlZ = cornerZSignCurrent * 18.0;
          waypoints.push(new THREE.Vector3(ctrlX, 3.8 * arcMult, ctrlZ));
        }
        waypoints.push(
          new THREE.Vector3(
            targetX,
            ballRadius + (cornerIsOlimpico ? 1.8 : 0.2),
            targetZ
          )
        );
      }

      cornerTargetLandingPos.set(targetX, 0.04, targetZ);
      cornerLandingRing.position.set(targetX, 0.04, targetZ);
      cornerLandingCenter.position.set(targetX, 0.042, targetZ);

      try {
        if (waypoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(waypoints);
          curve.curveType = 'centripetal';
          cornerTrajectorySpline = curve;
          const sampledCurvePts = curve.getPoints(40);
          cornerTrajectoryLine.geometry.setFromPoints(sampledCurvePts);
        }
      } catch (e) {
        cornerTrajectoryLine.geometry.setFromPoints([startPt, cornerTargetLandingPos]);
      }
    };

    const executeCornerKickAction = () => {
      if (!isUserCornerActive || !cornerTakerPlayer) return;

      const taker = cornerTakerPlayer;
      isUserCornerActive = false;
      activeSetPieceType = null;
      cornerTrajectoryGroup.visible = false;
      taker.parts.root.visible = true;
      taker.kickTimer = 0.35;
      possessCooldown = 0.3;
      ballOwner = null;

      soundEngine.playKick(1.0);
      spawnParticles(ballX, 0.15, ballZ, 16, 0xfacc15, 5.0);

      updateCornerTrajectoryVisual();

      isFollowingCornerTrajectory = true;
      cornerTrajectoryProgress = 0;
      const totalFlightDist = Math.hypot(
        cornerTargetLandingPos.x - ballX,
        cornerTargetLandingPos.z - ballZ
      );
      cornerTrajectoryDuration = Math.max(1.15, Math.min(1.65, totalFlightDist / 23.0));

      if (cornerAttackingTeam === 'HOME') {
        homePasses++;
        aiCurrentAction = `${taker.name} Curled Corner Cross into Box!`;
      } else {
        awayPasses++;
        aiCurrentAction = `${taker.name} Curled Corner Cross into Box!`;
      }
    };

    const startSecondHalfKickOff = () => {
      currentHalf = 2;
      matchClockSeconds = 45;
      halfTimeCompleted = true;
      setPieceBanner = '2ND HALF KICK-OFF · 45:00';
      setPieceBannerTimer = 2.6;
      resetPositionsToKickOff('AWAY');
      soundEngine.playWhistle('kickoff');
    };

    const resetFullMatch = () => {
      homeScore = 0;
      awayScore = 0;
      matchClockSeconds = 0;
      currentHalf = 1;
      halfTimeCompleted = false;
      homePossessionFrames = 1;
      awayPossessionFrames = 1;
      homeShots = 0;
      awayShots = 0;
      homePasses = 0;
      awayPasses = 0;
      homeTackles = 0;
      awayTackles = 0;
      homeCorners = 0;
      awayCorners = 0;
      homeXG = 0;
      awayXG = 0;
      momentum = 0;
      lastScorerName = '';
      lastScorerTeam = null;
      goalResetTimer = 0;
      isPlayingGoalReplay = false;
      replayRingBuffer.length = 0;
      activeReplayFrames = [];
      setPieceBanner = '1ST HALF KICK-OFF';
      setPieceBannerTimer = 2.4;
      aiTacticalAdaptationBanner =
        'AI Engine: Kick-Off Tactical Equilibrium';
      resetPositionsToKickOff('HOME');
      soundEngine.playWhistle('kickoff');
    };

    const skipGoalReplayNow = () => {
      if (goalResetTimer > 0) {
        goalResetTimer = 0;
        isPlayingGoalReplay = false;
        activeReplayFrames = [];
        replayRingBuffer.length = 0;
        resetPositionsToKickOff(lastScorerTeam === 'HOME' ? 'AWAY' : 'HOME');
        soundEngine.playUIClick();
        callbacksRef.current.onSkipGoalReplay?.();
      }
    };

    sceneObjectsRef.current = {
      players,
      ballMesh,
      maxAnisotropy,
      keyLight,
      fillLight,
      hemiLight,
      rimLight,
      renderer,
      scene,
      bloomPass,
      stadium,
      currentStadiumId: graphicsRef.current.stadium,
      resetMatchFn: resetFullMatch,
      startSecondHalfFn: startSecondHalfKickOff,
      skipGoalReplayFn: skipGoalReplayNow,
      triggerCornerKickFn: (team = 'HOME', zSign = 1) => setupCornerKick(team, zSign),
    };

    renderer.compile(scene, camera);

    const heldKeys = new Set<string>();
    let shiftModifierActive = false;

    // =========================================================================
    // OVR & PACE DRIVEN SPEED CALCULATOR (High OVR is A LOT FASTER than Low OVR!)
    // - Low OVR (72-78 OVR, 50-62 Pace): Sluggish & heavy (jog 4.5-5.8 m/s, sprint 6.8-8.8 m/s)
    // - Mid OVR (79-84 OVR, 65-80 Pace): Average pro pace (jog 7.8-9.4 m/s, sprint 11.2-13.6 m/s)
    // - High OVR (88-95 OVR, 85-98 Pace): Blistering speed! (jog 12.8-15.0 m/s, sprint 18.8-22.5 m/s)
    // - Mythic Icon (120 OVR, 118-120 Pace): HyperMotion Super-Speed! (jog 17.5 m/s, sprint 28.5 m/s)
    // =========================================================================
    const computePlayerSpeedStats = (
      p: SimPlayer,
      isCloseDribbling: boolean,
      isSprinting: boolean
    ): number => {
      const safePace = Number.isFinite(p.pace) ? p.pace : 85;
      const safeOvr = Number.isFinite(p.ovr) ? p.ovr : 88;

      // Steep exponential curve for OVR and Pace so high OVR players leave low OVR players in the dust!
      const ovrProgress = THREE.MathUtils.clamp((safeOvr - 70) / 50, 0, 1);
      const paceProgress = THREE.MathUtils.clamp((safePace - 45) / 75, 0, 1);
      const compositeRating = paceProgress * 0.62 + ovrProgress * 0.38;

      // Non-linear power factor widening the gap between 72-80 OVR and 90-120 OVR
      const speedFactor = Math.pow(compositeRating, 1.38);

      // Low OVR (72) starts at 4.4 m/s jog / 6.8 m/s sprint
      // World-Class (90-95) reaches 13.5-15.2 m/s jog / 19.5-22.8 m/s sprint
      // Mythic (120) reaches 17.8 m/s jog / 28.5 m/s sprint
      const jogSpeed = THREE.MathUtils.lerp(4.4, 17.8, speedFactor);
      const sprintSpeed = THREE.MathUtils.lerp(6.8, 28.5, speedFactor);
      const closeDribbleSpeed = THREE.MathUtils.lerp(3.8, 14.5, speedFactor);

      if (isCloseDribbling) return closeDribbleSpeed;
      if (isSprinting) return sprintSpeed;
      return jogSpeed;
    };

    const executeSkillMove = (dribbler: SimPlayer, skillId: SkillMoveId) => {
      if (dribbler.skillTimer > 0) return;
      const spec = SKILL_MOVES_CATALOG[skillId];
      if (!spec || dribbler.stamina < spec.staminaCost) return;

      dribbler.stamina = Math.max(5, dribbler.stamina - spec.staminaCost);
      dribbler.activeSkill = skillId;
      dribbler.skillDuration = spec.duration;
      dribbler.skillTimer = spec.duration;

      const dirX = Math.sin(dribbler.facingAngle);
      const dirZ = Math.cos(dribbler.facingAngle);
      const baseSprint = computePlayerSpeedStats(dribbler, false, true);
      const burstSpeed = baseSprint * spec.speedBurstMult;

      if (skillId === 'elastico') {
        const sideSign = dribbler.z >= 0 ? -1 : 1;
        dribbler.vx = dirX * burstSpeed + -dirZ * sideSign * 5.2;
        dribbler.vz = dirZ * burstSpeed + dirX * sideSign * 5.2;
      } else if (skillId === 'rainbow_flick') {
        dribbler.vx = dirX * burstSpeed;
        dribbler.vz = dirZ * burstSpeed;
        if (ballOwner === dribbler) {
          ballY = 1.45;
          ballVY = 4.8;
        }
      } else {
        dribbler.vx = dirX * burstSpeed;
        dribbler.vz = dirZ * burstSpeed;
      }

      let stunnedCount = 0;
      for (const opp of players) {
        if (opp.isHome !== dribbler.isHome && !opp.isGK) {
          const dist = Math.hypot(opp.x - dribbler.x, opp.z - dribbler.z);
          if (dist < spec.stunRadius) {
            opp.stunTimer = 0.68;
            opp.vx *= 0.15;
            opp.vz *= 0.15;
            stunnedCount++;
          }
        }
      }

      possessCooldown = Math.max(possessCooldown, 0.36);
      soundEngine.playSkillMove();
      spawnParticles(
        dribbler.x,
        0.2,
        dribbler.z,
        14,
        dribbler.isHome ? 0xccff00 : 0x38bdf8,
        4.8
      );

      const dribblerName = dribbler.name || 'PLAYER';
      aiCurrentAction =
        stunnedCount > 0
          ? `${dribblerName}: ${spec.name} (Beat ${stunnedCount} Defender${stunnedCount > 1 ? 's' : ''}!)`
          : `${dribblerName}: ${spec.name}`;
    };

    const evaluateBestPassOption = (
      passer: SimPlayer,
      preferThroughBall: boolean
    ): { mate: SimPlayer | null; utility: number; shouldLobThrough: boolean } => {
      let bestMate: SimPlayer | null = null;
      let bestUtility = -999;
      let bestShouldLob = preferThroughBall;

      const forwardSign = passer.isHome ? 1 : -1;
      const facingDirX = Math.sin(passer.facingAngle);
      const facingDirZ = Math.cos(passer.facingAngle);

      for (const mate of players) {
        if (mate.isHome !== passer.isHome || mate.id === passer.id || mate.isGK) continue;

        const dx = mate.x - passer.x;
        const dz = mate.z - passer.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 3.5 || dist > 46) continue;

        const dirX = dx / dist;
        const dirZ = dz / dist;
        const facingAlignment = dirX * facingDirX + dirZ * facingDirZ;

        const forwardGain = (mate.x - passer.x) * forwardSign;
        const centralProximityBonus = (1 - Math.abs(mate.z) / PITCH_HALF_Z) * 4.5;

        let minMarkerDist = 99;
        let minCorridorClearance = 99;

        for (const opp of players) {
          if (opp.isHome !== passer.isHome) {
            const md = Math.hypot(opp.x - mate.x, opp.z - mate.z);
            if (md < minMarkerDist) minMarkerDist = md;

            const dToPasser = Math.hypot(opp.x - passer.x, opp.z - passer.z);
            if (dToPasser > 1.2 && dToPasser < dist) {
              const perpDist = pointToSegmentDist(
                opp.x,
                opp.z,
                passer.x,
                passer.z,
                mate.x,
                mate.z
              );
              if (perpDist < minCorridorClearance) {
                minCorridorClearance = perpDist;
              }
            }
          }
        }

        const laneBlockedPenalty =
          minCorridorClearance < 1.65
            ? -22
            : minCorridorClearance < 3.0
            ? -8
            : 6;

        const canExploitSpaceBehind =
          mate.role === 'FWD' &&
          forwardGain > 6 &&
          minMarkerDist > 3.2 &&
          (preferThroughBall || minCorridorClearance < 2.2);

        const utility =
          facingAlignment * 9.5 +
          forwardGain * (preferThroughBall ? 0.92 : 0.48) +
          centralProximityBonus +
          Math.min(minMarkerDist, 14) * 1.15 +
          (canExploitSpaceBehind ? 9.0 : laneBlockedPenalty) -
          dist * 0.16;

        if (utility > bestUtility) {
          bestUtility = utility;
          bestMate = mate;
          bestShouldLob = canExploitSpaceBehind || preferThroughBall;
        }
      }

      return {
        mate: bestMate,
        utility: bestUtility,
        shouldLobThrough: bestShouldLob,
      };
    };

    const executePass = (
      passer: SimPlayer,
      targetMate: SimPlayer | null,
      isThroughBall: boolean,
      isUpperPass: boolean = false
    ) => {
      const forwardSign = passer.isHome ? 1 : -1;
      lastTouchTeam = passer.isHome ? 'HOME' : 'AWAY';

      // Special Corner Kick Whipped Cross into the Penalty Box!
      if (activeSetPieceType === 'CORNER') {
        if (isUserCornerActive) {
          executeCornerKickAction();
          return;
        }
        activeSetPieceType = null;
        const targetBoxX = forwardSign * (PITCH_HALF_W - 9.2);
        const targetBoxZ = (Math.random() - 0.5) * 6.5;
        const dx = targetBoxX - ballX;
        const dz = targetBoxZ - ballZ;
        const dist = Math.max(1, Math.hypot(dx, dz));
        const crossSpeed = 24.5;

        ballVX = (dx / dist) * crossSpeed;
        ballVZ = (dz / dist) * crossSpeed;
        ballVY = 7.4;
        ballOwner = null;
        possessCooldown = 0.32;
        passer.kickTimer = 0.26;
        passer.facingAngle = Math.atan2(dx, dz);

        if (passer.isHome) {
          activeHomeIdx = 6; // Switch to Mbappé in the box to header!
          homePasses++;
        } else {
          activeAwayIdx = 13; // Switch to Haaland in the box!
          awayPasses++;
        }
        soundEngine.playKick(0.85);
        spawnParticles(ballX, 0.15, ballZ, 12, 0xccff00, 4.5);
        return;
      }

      const wasGoalKick = activeSetPieceType === 'GOAL_KICK';
      activeSetPieceType = null;

      let targetX = passer.x + Math.sin(passer.facingAngle) * 16;
      let targetZ = passer.z + Math.cos(passer.facingAngle) * 16;

      if (targetMate) {
        const leadDist = isThroughBall
          ? 7.8 * forwardSign
          : isUpperPass
          ? 2.8 * forwardSign
          : 0.65 * forwardSign;
        targetX = THREE.MathUtils.clamp(
          targetMate.x + leadDist + targetMate.vx * 0.22,
          -PITCH_HALF_W + 2,
          PITCH_HALF_W - 2
        );
        targetZ = THREE.MathUtils.clamp(
          targetMate.z + targetMate.vz * 0.25,
          -PITCH_HALF_Z + 2,
          PITCH_HALF_Z - 2
        );
        if (passer.isHome) {
          activeHomeIdx = targetMate.id;
        } else {
          activeAwayIdx = targetMate.id;
        }
      }

      const dx = targetX - ballX;
      const dz = targetZ - ballZ;
      const dist = Math.max(1, Math.hypot(dx, dz));
      const passSpeed = THREE.MathUtils.clamp(
        19 + dist * 0.52,
        20,
        wasGoalKick ? 32 : isThroughBall ? 33 : isUpperPass ? 32 : 29
      );

      ballVX = (dx / dist) * passSpeed;
      ballVZ = (dz / dist) * passSpeed;
      ballVY = wasGoalKick
        ? 6.8
        : isUpperPass
        ? Math.min(14.5, 9.8 + (dist / 13) * 3.0)
        : isThroughBall
        ? 5.4
        : 1.05;
      ballOwner = null;
      possessCooldown = isUpperPass ? 0.36 : 0.26;
      passer.kickTimer = 0.24;
      passer.facingAngle = Math.atan2(dx, dz);

      if (passer.isHome) {
        homePasses++;
        momentum = Math.min(100, momentum + 4);
      } else {
        awayPasses++;
        momentum = Math.max(-100, momentum - 4);
      }

      soundEngine.playKick(wasGoalKick || isThroughBall || isUpperPass ? 0.78 : 0.54);
      spawnParticles(ballX, 0.1, ballZ, isUpperPass ? 12 : 7, isUpperPass ? 0x38bdf8 : 0x22c55e, 3.5);
    };

    const executeShot = (shooter: SimPlayer, chargeRatio: number) => {
      activeSetPieceType = null;
      lastTouchTeam = shooter.isHome ? 'HOME' : 'AWAY';

      const bootSpec =
        BOOT_CATALOG[equipmentRef.current.bootModel] || BOOT_CATALOG.hypervenom_volt;
      const bootPowerMult = shooter.isHome ? 1 + bootSpec.shotBonus * 0.018 : 1.04;

      // OVR & Shooting Attribute Scaling:
      // - Low OVR (72-82 OVR, ~45 SHO): weak shot velocity (17-23 m/s) & wider aim scatter
      // - Standard OVR (85-89 OVR, ~82 SHO): balanced strike (29-40 m/s)
      // - High/Mythic OVR (94-120 OVR, 95-120 SHO): rocket thunderbolt (38-56 m/s) & laser top-corner accuracy!
      const shootNorm = THREE.MathUtils.clamp((shooter.shooting - 38) / 82, 0, 1);
      const ovrNorm = THREE.MathUtils.clamp((shooter.ovr - 70) / 50, 0, 1);
      const powerRatingNorm = shootNorm * 0.65 + ovrNorm * 0.35;

      const goalX = shooter.isHome ? PITCH_HALF_W : -PITCH_HALF_W;
      const oppGK = players.find((p) => p.isGK && p.isHome !== shooter.isHome);
      const gkZ = oppGK ? oppGK.z : 0;
      const openCornerSign = gkZ >= 0 ? -1 : 1;

      // Higher OVR players pick the far inside corner with minimal error; lower OVR players have wider scatter
      const cornerPrecision = THREE.MathUtils.lerp(0.42, 0.78, powerRatingNorm);
      const inaccuracyScatter = THREE.MathUtils.lerp(2.35, 0.12, powerRatingNorm);
      const aimCornerZ =
        openCornerSign * (GOAL_HALF_WIDTH * cornerPrecision) +
        (Math.random() - 0.5) * inaccuracyScatter;

      const dx = goalX - ballX;
      const dz = aimCornerZ - ballZ;
      const dist = Math.max(1, Math.hypot(dx, dz));

      const angleFactor = Math.max(0.15, 1 - Math.abs(ballZ) / (PITCH_HALF_Z * 1.1));
      const distFactor = Math.max(0.04, Math.exp(-dist / 16.5));
      const shotXG = Number(
        Math.min(
          0.95,
          distFactor * angleFactor * THREE.MathUtils.lerp(0.68, 1.45, powerRatingNorm)
        ).toFixed(2)
      );

      if (shooter.isHome) {
        homeShots++;
        homeXG = Number((homeXG + shotXG).toFixed(2));
        momentum = Math.min(100, momentum + 14);
      } else {
        awayShots++;
        awayXG = Number((awayXG + shotXG).toFixed(2));
        momentum = Math.max(-100, momentum - 14);
      }

      const minBaseShotSpeed = THREE.MathUtils.lerp(16.5, 38.0, powerRatingNorm);
      const maxChargeBonus = THREE.MathUtils.lerp(6.8, 18.5, powerRatingNorm);
      const shotSpeed = (minBaseShotSpeed + chargeRatio * maxChargeBonus) * bootPowerMult;

      ballVX = (dx / dist) * shotSpeed;
      ballVZ = (dz / dist) * shotSpeed;
      ballVY = THREE.MathUtils.lerp(1.4, 3.2, powerRatingNorm) + chargeRatio * THREE.MathUtils.lerp(2.0, 5.2, powerRatingNorm);

      ballOwner = null;
      possessCooldown = 0.34;
      shooter.kickTimer = 0.28;
      shooter.facingAngle = Math.atan2(dx, dz);

      if (powerRatingNorm > 0.75 || chargeRatio > 0.65) {
        hitstopTimer = powerRatingNorm > 0.85 ? 0.055 : 0.038;
        cameraShakeIntensity = THREE.MathUtils.lerp(0.16, 0.56, powerRatingNorm);
      }

      soundEngine.playKick(THREE.MathUtils.clamp(0.55 + powerRatingNorm * 0.45 + chargeRatio * 0.25, 0.5, 1.2));
      spawnParticles(
        ballX,
        0.18,
        ballZ,
        Math.round(THREE.MathUtils.lerp(8, 28, powerRatingNorm)),
        shooter.ovr >= 100 ? 0xfacc15 : shooter.ovr >= 90 ? 0xa3e635 : 0x94a3b8,
        THREE.MathUtils.lerp(3.2, 7.8, powerRatingNorm)
      );
    };

    const switchActivePlayerForSide = (isHomeSide: boolean) => {
      if (isHomeSide) {
        let nearestIdx = activeHomeIdx;
        let nearestDist = 9999;
        for (let i = 1; i < 7; i++) {
          if (i === activeHomeIdx) continue;
          const p = players[i];
          const d = Math.hypot(p.x - ballX, p.z - ballZ);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = i;
          }
        }
        activeHomeIdx = nearestIdx;
      } else {
        let nearestIdx = activeAwayIdx;
        let nearestDist = 9999;
        for (let i = 8; i < 14; i++) {
          if (i === activeAwayIdx) continue;
          const p = players[i];
          const d = Math.hypot(p.x - ballX, p.z - ballZ);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = i;
          }
        }
        activeAwayIdx = nearestIdx;
      }
      soundEngine.playUIClick();
    };

    const evaluateDynamicTacticalAdaptation = () => {
      const scoreDiff = homeScore - awayScore;
      const matchMin = Math.floor(matchClockSeconds);

      let nextAwayForm: FormationId = awayFormation;
      let nextAwayMent: MentalityId = awayMentality;
      let bannerMsg = '';

      if (scoreDiff > 0) {
        if (matchMin >= 50 || scoreDiff >= 2) {
          nextAwayForm = '3-5-2 Wingplay';
          nextAwayMent = 'Ultra Attack';
          bannerMsg = `${matchMin}' MCI AI ADAPTATION: Trailing ${homeScore}-${awayScore} → Shifted to 3-5-2 Ultra Attack Overload`;
        } else {
          nextAwayForm = '4-3-3 Attack';
          nextAwayMent = 'Gegenpress';
          bannerMsg = `${matchMin}' MCI AI ADAPTATION: High-Line Gegenpress Activated`;
        }
      } else if (scoreDiff < 0) {
        if (matchMin >= 60) {
          nextAwayForm = '4-4-2 Classic';
          nextAwayMent = 'Counter-Attack';
          bannerMsg = `${matchMin}' MCI AI ADAPTATION: Protecting Lead → Compact 4-4-2 Low Block & Direct Counters`;
        } else {
          nextAwayForm = '4-3-3 Attack';
          nextAwayMent = 'Tiki-Taka';
          bannerMsg = `${matchMin}' MCI AI ADAPTATION: Controlling Tempo with Tiki-Taka Possession`;
        }
      } else {
        if (momentum > 25) {
          nextAwayForm = '4-4-2 Classic';
          nextAwayMent = 'Counter-Attack';
          bannerMsg = `${matchMin}' MCI AI ADAPTATION: Absorbing Home Pressure → 4-4-2 Mid-Block`;
        } else {
          nextAwayForm = '4-3-3 Attack';
          nextAwayMent = 'Tiki-Taka';
          bannerMsg = `${matchMin}' AI TACTICAL ENGINE: Midfield Triangle Overload (${awayFormation})`;
        }
      }

      awayFormation = nextAwayForm;
      awayMentality = nextAwayMent;

      if (aiTacticsRef.current.dynamicAdaptation) {
        if (scoreDiff < 0 && matchMin >= 45) {
          dynamicHomeFormation = '3-5-2 Wingplay';
          dynamicHomeMentality = 'Ultra Attack';
          bannerMsg = `${matchMin}' RMA AI ADAPTATION: Chasing Equalizer → 3-5-2 All-Out Attack`;
        } else if (scoreDiff > 0 && matchMin >= 68) {
          dynamicHomeFormation = '4-4-2 Classic';
          dynamicHomeMentality = 'Counter-Attack';
          bannerMsg = `${matchMin}' RMA AI ADAPTATION: Securing Victory → Compact 4-4-2 Counter Shape`;
        } else {
          dynamicHomeFormation = aiTacticsRef.current.formation;
          dynamicHomeMentality = aiTacticsRef.current.mentality;
        }
      } else {
        dynamicHomeFormation = aiTacticsRef.current.formation;
        dynamicHomeMentality = aiTacticsRef.current.mentality;
      }

      if (bannerMsg) {
        aiTacticalAdaptationBanner = bannerMsg;
      }
    };

    const getActiveMovementVector = (isHomeSide: boolean) => {
      let mx = 0;
      let mz = 0;
      if (isHomeSide) {
        mx = touchInputRef.current.moveX;
        mz = touchInputRef.current.moveZ;
        if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) mz -= 1;
        if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) mz += 1;
        if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) mx -= 1;
        if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) mx += 1;
      } else {
        mx = remoteGuestInputRef.current.moveX;
        mz = remoteGuestInputRef.current.moveZ;
      }
      return { mx, mz };
    };

    // GROUND PASS: Always targets the NEAREST teammate on the pitch!
    const findNearestTeammateForPass = (
      passer: SimPlayer,
      isHomeSide: boolean
    ): SimPlayer | null => {
      let nearestMate: SimPlayer | null = null;
      let bestEffectiveDist = 9999;

      const { mx, mz } = getActiveMovementVector(isHomeSide);
      const inputLen = Math.hypot(mx, mz);
      const hasAimDir = inputLen > 0.08;
      const aimDirX = hasAimDir ? mx / inputLen : Math.sin(passer.facingAngle);
      const aimDirZ = hasAimDir ? mz / inputLen : Math.cos(passer.facingAngle);

      for (const mate of players) {
        if (mate.isHome !== passer.isHome || mate.id === passer.id || mate.isGK) {
          continue;
        }
        const dx = mate.x - passer.x;
        const dz = mate.z - passer.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.8) continue;

        const dirX = dx / dist;
        const dirZ = dz / dist;
        const dot = dirX * aimDirX + dirZ * aimDirZ;
        // Prioritize the nearest teammate, with a slight 2.2m tie-breaker for aim alignment
        const effectiveDist = dist - dot * 2.2;
        if (effectiveDist < bestEffectiveDist) {
          bestEffectiveDist = effectiveDist;
          nearestMate = mate;
        }
      }
      return nearestMate;
    };

    // UPPER PASS: Always targets a FAR teammate downfield or across the pitch!
    const findFarTeammateForUpperPass = (
      passer: SimPlayer,
      isHomeSide: boolean
    ): SimPlayer | null => {
      let farthestMate: SimPlayer | null = null;
      let bestFarScore = -9999;
      const forwardSign = isHomeSide ? 1 : -1;

      for (const mate of players) {
        if (mate.isHome !== passer.isHome || mate.id === passer.id || mate.isGK) {
          continue;
        }
        const dx = mate.x - passer.x;
        const dz = mate.z - passer.z;
        const dist = Math.hypot(dx, dz);
        const forwardGain = dx * forwardSign;

        // Strongly reward long distance (>15m) + forward attacking position
        const farScore = dist * 1.35 + forwardGain * 0.55;
        if (farScore > bestFarScore) {
          bestFarScore = farScore;
          farthestMate = mate;
        }
      }
      return farthestMate;
    };

    const performSideActionPassOrTackle = (isHomeSide: boolean) => {
      const activeIdx = isHomeSide ? activeHomeIdx : activeAwayIdx;
      const activePlayer = players[activeIdx];
      const sideHasBall = Boolean(ballOwner && ballOwner.isHome === isHomeSide);

      if (sideHasBall && ballOwner) {
        const passer = ballOwner;
        const nearestMate = findNearestTeammateForPass(passer, isHomeSide);
        const mateName = nearestMate?.name;
        executePass(passer, nearestMate, false, false);
        aiCurrentAction = mateName
          ? `Short Pass ➔ ${mateName} (Nearest)`
          : 'Driven Ground Pass';
      } else if (activePlayer) {
        const dx = ballX - activePlayer.x;
        const dz = ballZ - activePlayer.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.6 && possessCooldown <= 0) {
          ballOwner = activePlayer;
          lastTouchTeam = isHomeSide ? 'HOME' : 'AWAY';
          possessCooldown = 0.32;
          activePlayer.kickTimer = 0.2;
          if (isHomeSide) {
            homeTackles++;
            momentum = Math.min(100, momentum + 8);
          } else {
            awayTackles++;
            momentum = Math.max(-100, momentum - 8);
          }
          soundEngine.playTackle();
          spawnParticles(ballX, 0.1, ballZ, 12, 0x38bdf8, 4.5);
          aiCurrentAction = `${activePlayer?.name || 'Defender'} Clean Standing Tackle`;
        }
      }
    };

    const performSideThroughBall = (isHomeSide: boolean) => {
      const sideHasBall = Boolean(ballOwner && ballOwner.isHome === isHomeSide);
      if (sideHasBall && ballOwner) {
        const passer = ballOwner;
        const { mate } = evaluateBestPassOption(passer, true);
        const target = mate || findNearestTeammateForPass(passer, isHomeSide);
        const mateName = target?.name;
        executePass(passer, target, true);
        aiCurrentAction = mateName ? `Through-Ball ➔ ${mateName}` : 'Lofted Through-Ball';
      }
    };

    const performSideUpperPass = (isHomeSide: boolean) => {
      const sideHasBall = Boolean(ballOwner && ballOwner.isHome === isHomeSide);
      if (sideHasBall && ballOwner) {
        const passer = ballOwner;
        const farMate = findFarTeammateForUpperPass(passer, isHomeSide);
        const mateName = farMate?.name;
        executePass(passer, farMate, false, true);
        aiCurrentAction = mateName
          ? `${passer.name} Long Upper Pass ➔ ${mateName}`
          : 'High Long Upper Pass';
      }
    };

    const performSideSlideTackle = (isHomeSide: boolean) => {
      const activeIdx = isHomeSide ? activeHomeIdx : activeAwayIdx;
      const activePlayer = players[activeIdx];
      if (!activePlayer || activePlayer.isGK) return;
      if (activePlayer.slideCooldown > 0 || activePlayer.slideTimer > 0) return;

      activePlayer.slideTimer = 0.52;
      activePlayer.slideDuration = 0.52;
      activePlayer.slideCooldown = 0.68;

      const { mx, mz } = getActiveMovementVector(isHomeSide);
      const isMoving = Math.hypot(mx, mz) > 0.04;
      let dirX = 0;
      let dirZ = 0;

      if (isMoving) {
        dirX = mx;
        dirZ = mz;
      } else {
        const toBallX = ballX - activePlayer.x;
        const toBallZ = ballZ - activePlayer.z;
        const d = Math.hypot(toBallX, toBallZ);
        if (d > 0.05) {
          dirX = toBallX / d;
          dirZ = toBallZ / d;
        } else {
          dirX = Math.sin(activePlayer.facingAngle);
          dirZ = Math.cos(activePlayer.facingAngle);
        }
      }

      const len = Math.hypot(dirX, dirZ);
      if (len > 0.001) {
        dirX /= len;
        dirZ /= len;
      } else {
        dirX = isHomeSide ? 1 : -1;
        dirZ = 0;
      }

      activePlayer.slideDirX = dirX;
      activePlayer.slideDirZ = dirZ;
      activePlayer.facingAngle = Math.atan2(dirX, dirZ);
      activePlayer.vx = dirX * 18.5;
      activePlayer.vz = dirZ * 18.5;

      soundEngine.playTackle();
      spawnParticles(activePlayer.x, 0.05, activePlayer.z, 16, 0x15803d, 4.5);
      aiCurrentAction = `${activePlayer.name} Committed Sliding Tackle!`;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      const code = e.code;
      heldKeys.add(code);
      if (e.shiftKey || e.key === 'Shift' || code === 'ShiftLeft' || code === 'ShiftRight') {
        shiftModifierActive = true;
      }

      if (screenStateRef.current !== 'PLAYING') return;

      // Allow Space or Enter to immediately skip Live Goal Replay
      if (goalResetTimer > 0 && (code === 'Space' || code === 'Enter')) {
        e.preventDefault();
        skipGoalReplayNow();
        return;
      }

      // If 1st Person Corner Kick is active, Space / Enter / K / J / O / L executes the kick!
      if (activeSetPieceType === 'CORNER' && isUserCornerActive) {
        if (
          code === 'Space' ||
          code === 'Enter' ||
          code === 'KeyK' ||
          code === 'KeyJ' ||
          code === 'KeyO' ||
          code === 'KeyL'
        ) {
          e.preventDefault();
          executeCornerKickAction();
          return;
        }
      }

      const isAwayOnlineClient =
        gameModeRef.current === 'ONLINE_MULTIPLAYER' &&
        onlineRoleRef.current === 'AWAY';

      if (isAwayOnlineClient) {
        if (code === 'Tab' || code === 'KeyQ') {
          e.preventDefault();
          touchInputRef.current.pendingSwitchPlayer = true;
        } else if (code === 'KeyK' || code === 'KeyJ') {
          if (e.shiftKey || heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight')) {
            touchInputRef.current.pendingUpperPass = true;
          } else {
            touchInputRef.current.pendingPass = true;
          }
        } else if (code === 'KeyO') {
          touchInputRef.current.pendingUpperPass = true;
        } else if (code === 'KeyE' || code === 'KeyF') {
          touchInputRef.current.pendingSlideTackle = true;
        } else if (code === 'KeyL' || code === 'KeyU') {
          touchInputRef.current.pendingThroughBall = true;
        } else if (code === 'Space') {
          e.preventDefault();
          touchInputRef.current.shootCharging = true;
        } else if (code === 'Digit1' || code === 'KeyZ') {
          touchInputRef.current.pendingSkillMove = 'elastico';
        } else if (code === 'Digit2' || code === 'KeyX') {
          touchInputRef.current.pendingSkillMove = 'roulette';
        } else if (code === 'Digit3' || code === 'KeyV') {
          touchInputRef.current.pendingSkillMove = 'stepover_burst';
        } else if (code === 'Digit4' || code === 'KeyB') {
          touchInputRef.current.pendingSkillMove = 'rainbow_flick';
        }
        return;
      }

      if (code === 'Tab' || code === 'KeyQ') {
        e.preventDefault();
        switchActivePlayerForSide(true);
      }

      const activePlayer = players[activeHomeIdx];
      const homeHasBall = Boolean(ballOwner && ballOwner.isHome);

      const skillTarget = homeHasBall && ballOwner ? ballOwner : activePlayer;
      if (skillTarget) {
        if (code === 'Digit1' || code === 'KeyZ') {
          executeSkillMove(skillTarget, 'elastico');
        } else if (code === 'Digit2' || code === 'KeyX') {
          executeSkillMove(skillTarget, 'roulette');
        } else if (code === 'Digit3' || code === 'KeyV') {
          executeSkillMove(skillTarget, 'stepover_burst');
        } else if (code === 'Digit4' || code === 'KeyB') {
          executeSkillMove(skillTarget, 'rainbow_flick');
        }
      }

      if (code === 'KeyK' || code === 'KeyJ') {
        if (e.shiftKey || heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight')) {
          performSideUpperPass(true);
        } else {
          performSideActionPassOrTackle(true);
        }
      }

      if (code === 'KeyO') {
        performSideUpperPass(true);
      }

      if (code === 'KeyL' || code === 'KeyU') {
        performSideThroughBall(true);
      }

      if (code === 'KeyE' || code === 'KeyF') {
        performSideSlideTackle(true);
      }

      if (code === 'Space') {
        e.preventDefault();
        if (homeHasBall && ballOwner) {
          isChargingShot = true;
        } else {
          performSideSlideTackle(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
      if (!e.shiftKey && !heldKeys.has('ShiftLeft') && !heldKeys.has('ShiftRight')) {
        shiftModifierActive = false;
      }

      const isAwayOnlineClient =
        gameModeRef.current === 'ONLINE_MULTIPLAYER' &&
        onlineRoleRef.current === 'AWAY';

      if (isAwayOnlineClient) {
        if (e.code === 'Space') {
          touchInputRef.current.shootCharging = false;
          touchInputRef.current.pendingShootRelease = true;
        }
        return;
      }

      if (e.code === 'Space' && isChargingShot) {
        isChargingShot = false;
        const currentOwner = ballOwner;
        if (currentOwner && currentOwner.isHome) {
          const shooterName = currentOwner.name || 'STRIKER';
          const ratio = THREE.MathUtils.clamp(shotPowerCharge / 100, 0.25, 1.0);
          executeShot(currentOwner, ratio);
          aiCurrentAction = `${shooterName} Driven Strike (${Math.round(ratio * 100)}%)`;
        }
        shotPowerCharge = 0;
      }
    };

    const onWindowBlur = () => {
      heldKeys.clear();
      isChargingShot = false;
      shotPowerCharge = 0;
    };

    // Direct Pitch Touch-to-Move state for iPad / Touch screens
    let isTouchingPitch = false;
    let pitchTouchPointerId: number | null = null;
    let pitchTouchTargetX = 0;
    let pitchTouchTargetZ = 0;
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHitPoint = new THREE.Vector3();

    const updatePitchTouchTarget = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      if (raycaster.ray.intersectPlane(groundPlane, groundHitPoint)) {
        pitchTouchTargetX = THREE.MathUtils.clamp(
          groundHitPoint.x,
          -PITCH_HALF_W + 1,
          PITCH_HALF_W - 1
        );
        pitchTouchTargetZ = THREE.MathUtils.clamp(
          groundHitPoint.z,
          -PITCH_HALF_Z + 1,
          PITCH_HALF_Z - 1
        );
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (screenStateRef.current === 'CUSTOMIZER') {
        isDraggingCustomizer = true;
        prevPointerX = e.clientX;
      } else if (screenStateRef.current === 'PLAYING') {
        if (goalResetTimer > 0 && goalScoredElapsed > 0.25) {
          skipGoalReplayNow();
          return;
        }
        isTouchingPitch = true;
        pitchTouchPointerId = e.pointerId;
        updatePitchTouchTarget(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isDraggingCustomizer && screenStateRef.current === 'CUSTOMIZER') {
        const deltaX = e.clientX - prevPointerX;
        prevPointerX = e.clientX;
        customizerOrbitAngle -= deltaX * 0.012;
      } else if (
        isTouchingPitch &&
        pitchTouchPointerId === e.pointerId &&
        screenStateRef.current === 'PLAYING'
      ) {
        updatePitchTouchTarget(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isDraggingCustomizer = false;
      if (pitchTouchPointerId === null || pitchTouchPointerId === e.pointerId) {
        isTouchingPitch = false;
        pitchTouchPointerId = null;
      }
    };

    const onTouchStartPitch = (e: TouchEvent) => {
      if (screenStateRef.current === 'PLAYING') {
        if (goalResetTimer > 0 && goalScoredElapsed > 0.25) {
          skipGoalReplayNow();
          return;
        }
        const t = e.changedTouches[0] || e.targetTouches[0];
        if (t) {
          isTouchingPitch = true;
          pitchTouchPointerId = t.identifier;
          updatePitchTouchTarget(t.clientX, t.clientY);
        }
      }
    };

    const onTouchMovePitch = (e: TouchEvent) => {
      if (isTouchingPitch && screenStateRef.current === 'PLAYING') {
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === pitchTouchPointerId) {
            updatePitchTouchTarget(e.touches[i].clientX, e.touches[i].clientY);
            break;
          }
        }
      }
    };

    const onTouchEndPitch = (e: TouchEvent) => {
      if (!isTouchingPitch) return;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === pitchTouchPointerId) return;
      }
      isTouchingPitch = false;
      pitchTouchPointerId = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('touchstart', onTouchStartPitch, { passive: true });
    window.addEventListener('touchmove', onTouchMovePitch, { passive: true });
    window.addEventListener('touchend', onTouchEndPitch, { passive: true });
    window.addEventListener('touchcancel', onTouchEndPitch, { passive: true });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      // Widen vertical FOV slightly on portrait / 4:3 iPad screens so the full pitch fits
      camera.fov = camera.aspect < 1.0 ? 48 : camera.aspect < 1.45 ? 42 : 38;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let animFrameId = 0;
    let smoothedDt = 1 / 60;
    let latestRemoteSnap: OnlineMatchSnapshot | null = null;
    let remoteSnapAge = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);

      const rawDt = clock.getDelta();
      const clampedDt = Math.min(Math.max(rawDt, 0.004), 0.033);
      smoothedDt = smoothedDt * 0.8 + clampedDt * 0.2;
      const dt = smoothedDt;
      const elapsedTime = clock.getElapsedTime();

      if (hitstopTimer > 0) {
        hitstopTimer -= dt;
        if (bloomPass.enabled) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
        return;
      }

      if (setPieceBannerTimer > 0) {
        setPieceBannerTimer = Math.max(0, setPieceBannerTimer - dt);
        if (setPieceBannerTimer === 0) {
          setPieceBanner = null;
        }
      }

      const currentScreen = screenStateRef.current;
      const currentMode = gameModeRef.current;
      const currentOnlineRole = onlineRoleRef.current;
      const tactics = aiTacticsRef.current;

      // =======================================================================
      // UNIFIED 60FPS SIMULATION (Runs on Singleplayer, AI Mode, Online HOME & Online AWAY!)
      // =======================================================================
      if (true) {
        const isLocalOnlineAway =
          currentMode === 'ONLINE_MULTIPLAYER' && currentOnlineRole === 'AWAY';

        // If this iPad/client is AWAY in Online Multiplayer, reconcile fresh host snapshots
        // AND route local iPad/keyboard/pitch inputs directly to AWAY for instant 0ms movement!
        if (currentScreen === 'PLAYING' && isLocalOnlineAway) {
          let gMoveX = touchInputRef.current.moveX;
          let gMoveZ = touchInputRef.current.moveZ;
          if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) gMoveZ -= 1;
          if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) gMoveZ += 1;
          if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) gMoveX -= 1;
          if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) gMoveX += 1;

          if (
            isTouchingPitch &&
            Math.hypot(gMoveX, gMoveZ) <= 0.04 &&
            players[activeAwayIdx]
          ) {
            const actAway = players[activeAwayIdx];
            const pdx = pitchTouchTargetX - actAway.x;
            const pdz = pitchTouchTargetZ - actAway.z;
            const pdist = Math.hypot(pdx, pdz);
            if (pdist > 0.75) {
              gMoveX = pdx / pdist;
              gMoveZ = pdz / pdist;
            }
          }

          const gSprint =
            shiftModifierActive ||
            touchInputRef.current.sprintHeld ||
            heldKeys.has('ShiftLeft') ||
            heldKeys.has('ShiftRight') ||
            heldKeys.has('KeyR');
          const gCloseDribble =
            touchInputRef.current.closeDribbleHeld || heldKeys.has('KeyC');

          // Apply directly to remoteGuestInputRef so local 60fps simulation moves AWAY immediately!
          remoteGuestInputRef.current.moveX = gMoveX;
          remoteGuestInputRef.current.moveZ = gMoveZ;
          remoteGuestInputRef.current.sprintHeld = gSprint;
          remoteGuestInputRef.current.closeDribbleHeld = gCloseDribble;
          remoteGuestInputRef.current.shootCharging = touchInputRef.current.shootCharging;
          if (touchInputRef.current.pendingPass) {
            remoteGuestInputRef.current.pendingPass = true;
          }
          if (touchInputRef.current.pendingThroughBall) {
            remoteGuestInputRef.current.pendingThroughBall = true;
          }
          if (touchInputRef.current.pendingShootRelease) {
            remoteGuestInputRef.current.pendingShootRelease = true;
          }
          if (touchInputRef.current.pendingSkillMove) {
            remoteGuestInputRef.current.pendingSkillMove =
              touchInputRef.current.pendingSkillMove;
          }
          if (touchInputRef.current.pendingSwitchPlayer) {
            remoteGuestInputRef.current.pendingSwitchPlayer = true;
          }

          netSyncTimer += dt;
          const hasPendingDiscrete =
            touchInputRef.current.pendingPass ||
            touchInputRef.current.pendingThroughBall ||
            touchInputRef.current.pendingShootRelease ||
            touchInputRef.current.pendingSkillMove !== null ||
            touchInputRef.current.pendingSwitchPlayer;

          if (netSyncTimer >= 0.033 || hasPendingDiscrete) {
            netSyncTimer = 0;
            callbacksRef.current.onSendGuestInput?.({
              moveX: gMoveX,
              moveZ: gMoveZ,
              sprintHeld: gSprint,
              closeDribbleHeld: gCloseDribble,
              shootCharging: touchInputRef.current.shootCharging,
              pendingPass: touchInputRef.current.pendingPass,
              pendingThroughBall: touchInputRef.current.pendingThroughBall,
              pendingShootRelease: touchInputRef.current.pendingShootRelease,
              pendingSkillMove: touchInputRef.current.pendingSkillMove,
              pendingSwitchPlayer: touchInputRef.current.pendingSwitchPlayer,
            });
          }

          touchInputRef.current.pendingPass = false;
          touchInputRef.current.pendingThroughBall = false;
          touchInputRef.current.pendingShootRelease = false;
          touchInputRef.current.pendingSkillMove = null;
          touchInputRef.current.pendingSwitchPlayer = false;

          // Capture incoming authoritative snapshot from HOME if one arrived
          const snap = incomingSnapshotRef.current;
          if (snap) {
            incomingSnapshotRef.current = null;
            latestRemoteSnap = snap;
            remoteSnapAge = 0;
            ballVX = snap.bvx;
            ballVY = snap.bvy;
            ballVZ = snap.bvz;
            ballOwner = snap.ownerId !== null ? players[snap.ownerId] || null : null;
            activeHomeIdx = snap.activeHomeIdx;
            homeScore = snap.homeScore;
            awayScore = snap.awayScore;
            matchClockSeconds = snap.clock;
            currentHalf = snap.half || 1;
            homeShots = snap.homeShots;
            awayShots = snap.awayShots;
            homePasses = snap.homePasses;
            awayPasses = snap.awayPasses;
            homeTackles = snap.homeTackles;
            awayTackles = snap.awayTackles;
            homeCorners = snap.homeCorners || 0;
            awayCorners = snap.awayCorners || 0;
            homeXG = snap.homeXG;
            awayXG = snap.awayXG;
            momentum = snap.momentum;
            aiCurrentAction = snap.aiAction;
            aiTacticalAdaptationBanner = snap.banner;
            setPieceBanner = snap.setPieceBanner;
          }

          // Smoothly interpolate every single 60FPS frame using velocity dead-reckoning!
          if (latestRemoteSnap && remoteSnapAge < 0.65) {
            remoteSnapAge += dt;
            const leadT = Math.min(0.08, remoteSnapAge);
            const targetBx = latestRemoteSnap.bx + latestRemoteSnap.bvx * leadT;
            const targetBz = latestRemoteSnap.bz + latestRemoteSnap.bvz * leadT;
            const ballDistErr = Math.hypot(targetBx - ballX, targetBz - ballZ);
            if (ballDistErr > 8.0) {
              ballX = latestRemoteSnap.bx;
              ballY = latestRemoteSnap.by;
              ballZ = latestRemoteSnap.bz;
            } else {
              ballX = THREE.MathUtils.damp(ballX, targetBx, 16, dt);
              ballY = THREE.MathUtils.damp(ballY, latestRemoteSnap.by, 16, dt);
              ballZ = THREE.MathUtils.damp(ballZ, targetBz, 16, dt);
            }

            latestRemoteSnap.players.forEach((sp, i) => {
              const p = players[i];
              if (!p) return;
              const predX = sp.x + sp.vx * leadT;
              const predZ = sp.z + sp.vz * leadT;
              const errDist = Math.hypot(predX - p.x, predZ - p.z);

              if (i === activeAwayIdx) {
                // Keep local AWAY controlled player 100% smooth; only gently reconcile if drift > 1.2m
                if (errDist > 6.5) {
                  p.x = sp.x;
                  p.z = sp.z;
                } else if (errDist > 1.2) {
                  p.x = THREE.MathUtils.damp(p.x, predX, 3.5, dt);
                  p.z = THREE.MathUtils.damp(p.z, predZ, 3.5, dt);
                }
              } else {
                if (errDist > 7.5) {
                  p.x = sp.x;
                  p.z = sp.z;
                } else {
                  p.x = THREE.MathUtils.damp(p.x, predX, 15, dt);
                  p.z = THREE.MathUtils.damp(p.z, predZ, 15, dt);
                }
                p.vx = THREE.MathUtils.damp(p.vx, sp.vx, 18, dt);
                p.vz = THREE.MathUtils.damp(p.vz, sp.vz, 18, dt);
                p.facingAngle = sp.fa;
              }
            });
          }
        }

        const homeFormAnchors =
          FORMATION_ANCHORS[
            tactics.dynamicAdaptation ? dynamicHomeFormation : tactics.formation
          ] || FORMATION_ANCHORS['4-3-3 Attack'];
        const awayFormAnchors =
          FORMATION_ANCHORS[awayFormation] || FORMATION_ANCHORS['4-3-3 Attack'];

        for (let i = 0; i < 7; i++) {
          const [hbx, hbz] = homeFormAnchors[i];
          players[i].baseX = hbx;
          players[i].baseZ = hbz;

          const [abx, abz] = awayFormAnchors[i];
          players[i + 7].baseX = -abx;
          players[i + 7].baseZ = -abz;
        }

        if (tacticalCommandRef.current) {
          const cmd = tacticalCommandRef.current;
          callbacksRef.current.onConsumeTacticalCommand();

          if (cmd === 'TRIGGER_THROUGH_BALL' && ballOwner && ballOwner.isHome) {
            const passer = ballOwner;
            const { mate } = evaluateBestPassOption(passer, true);
            executePass(passer, mate, true);
            aiCurrentAction = 'AI Director: Threaded Through-Ball';
          } else if (cmd === 'INSTRUCT_SHOOT_NOW' && ballOwner && ballOwner.isHome) {
            const shooter = ballOwner;
            executeShot(shooter, 0.92);
            aiCurrentAction = 'AI Director: Immediate Strike';
          } else if (cmd === 'SWITCH_PLAY' && ballOwner && ballOwner.isHome) {
            const passer = ballOwner;
            let widestMate: SimPlayer | null = null;
            let maxZDiff = 0;
            for (const m of players) {
              if (m.isHome && m.id !== passer.id && !m.isGK) {
                const zd = Math.abs(m.z - passer.z);
                if (zd > maxZDiff) {
                  maxZDiff = zd;
                  widestMate = m;
                }
              }
            }
            executePass(passer, widestMate, true);
            aiCurrentAction = 'AI Director: Diagonal Flank Switch';
          } else if (cmd === 'HIGH_PRESS_SWARM') {
            aiCurrentAction = 'AI Director: Coordinated Pressing Trap';
          }
        }

        if (goalResetTimer > 0) {
          goalResetTimer -= dt;
          goalScoredElapsed += dt;

          // First 0.9s after goal: record post-goal net ripple & celebration into activeReplayFrames
          if (goalScoredElapsed <= 0.9) {
            isPlayingGoalReplay = false;
            ballX += ballVX * dt;
            ballZ += ballVZ * dt;
            ballVX *= 0.92;
            ballVZ *= 0.92;
            ballMesh.position.set(ballX, ballY, ballZ);
            ballShadow.position.set(ballX, 0.018, ballZ);

            players.forEach((p) => {
              const spd = Math.hypot(p.vx, p.vz) * 0.6;
              p.stridePhase += spd * dt * 1.95;
              animatePlayerKinematics(
                p.parts,
                spd,
                p.stridePhase,
                0,
                p.isHome && p.id === activeHomeIdx,
                false,
                elapsedTime,
                null,
                0,
                currentMode === 'ONLINE_MULTIPLAYER' &&
                  !p.isHome &&
                  p.id === activeAwayIdx,
                p.gkDiveDir,
                0,
                0
              );
            });

            activeReplayFrames.push({
              bx: ballX,
              by: ballY,
              bz: ballZ,
              brx: ballMesh.rotation.x,
              brz: ballMesh.rotation.z,
              players: players.map((p) => ({
                x: p.x,
                z: p.z,
                fa: p.parts.root.rotation.y,
                sp: p.stridePhase,
                spd: Math.hypot(p.vx, p.vz),
                kt: p.kickTimer,
                sk: p.activeSkill,
                skp:
                  p.activeSkill && p.skillTimer > 0
                    ? 1 - p.skillTimer / Math.max(0.1, p.skillDuration)
                    : 0,
                gkd: p.gkDiveDir,
                tb: p.turnBank,
                slp:
                  p.slideTimer > 0
                    ? 1 - p.slideTimer / Math.max(0.01, p.slideDuration)
                    : 0,
              })),
            });
          } else if (activeReplayFrames.length > 6) {
            // Slow-Motion 0.65x Live Action 3D Goal Replay Playback!
            isPlayingGoalReplay = true;
            const totalFrames = activeReplayFrames.length;
            replayCursor = Math.min(
              totalFrames - 1,
              replayCursor + dt * 39
            );
            const idx0 = Math.floor(replayCursor);
            const idx1 = Math.min(totalFrames - 1, idx0 + 1);
            const alpha = replayCursor - idx0;
            const f0 = activeReplayFrames[idx0];
            const f1 = activeReplayFrames[idx1];

            ballX = THREE.MathUtils.lerp(f0.bx, f1.bx, alpha);
            ballY = THREE.MathUtils.lerp(f0.by, f1.by, alpha);
            ballZ = THREE.MathUtils.lerp(f0.bz, f1.bz, alpha);
            ballMesh.position.set(ballX, ballY, ballZ);
            ballMesh.rotation.x = THREE.MathUtils.lerp(f0.brx, f1.brx, alpha);
            ballMesh.rotation.z = THREE.MathUtils.lerp(f0.brz, f1.brz, alpha);
            ballShadow.position.set(ballX, 0.018, ballZ);

            players.forEach((p, idx) => {
              const pf0 = f0.players[idx];
              const pf1 = f1.players[idx];
              if (!pf0 || !pf1) return;
              const px = THREE.MathUtils.lerp(pf0.x, pf1.x, alpha);
              const pz = THREE.MathUtils.lerp(pf0.z, pf1.z, alpha);
              p.parts.root.position.set(px, 0, pz);
              p.parts.root.rotation.y = pf0.fa;

              const toBallAngle = Math.atan2(ballX - px, ballZ - pz);
              const headYaw = Math.atan2(
                Math.sin(toBallAngle - pf0.fa),
                Math.cos(toBallAngle - pf0.fa)
              );

              animatePlayerKinematics(
                p.parts,
                THREE.MathUtils.lerp(pf0.spd, pf1.spd, alpha),
                THREE.MathUtils.lerp(pf0.sp, pf1.sp, alpha),
                pf0.kt,
                p.isHome && p.id === activeHomeIdx,
                false,
                elapsedTime,
                pf0.sk,
                pf0.skp,
                currentMode === 'ONLINE_MULTIPLAYER' &&
                  !p.isHome &&
                  p.id === activeAwayIdx,
                pf0.gkd,
                pf0.tb,
                headYaw,
                pf0.slp || 0
              );
            });
          }

          if (goalResetTimer <= 0) {
            isPlayingGoalReplay = false;
            activeReplayFrames = [];
            replayRingBuffer.length = 0;
            resetPositionsToKickOff(lastScorerTeam === 'HOME' ? 'AWAY' : 'HOME');
            callbacksRef.current.onSkipGoalReplay?.();
          }
        }

        if (currentScreen === 'PLAYING' && goalResetTimer <= 0) {
          // Process iPad / Touch Discrete Inputs for HOME User (when not playing as Online AWAY)
          if (!isLocalOnlineAway) {
            const tIn = touchInputRef.current;
            if (activeSetPieceType === 'CORNER' && isUserCornerActive) {
              updateCornerTrajectoryVisual();
              if (tIn.pendingCornerKick) {
                tIn.pendingCornerKick = false;
                executeCornerKickAction();
              }
              if (tIn.pendingPass || tIn.pendingUpperPass || tIn.pendingShootRelease) {
                tIn.pendingPass = false;
                tIn.pendingUpperPass = false;
                tIn.pendingShootRelease = false;
                executeCornerKickAction();
              }
            }
            if (tIn.pendingSwitchPlayer) {
              tIn.pendingSwitchPlayer = false;
              switchActivePlayerForSide(true);
            }
            if (tIn.pendingSkillMove) {
              const skillId = tIn.pendingSkillMove;
              tIn.pendingSkillMove = null;
              const target =
                ballOwner && ballOwner.isHome ? ballOwner : players[activeHomeIdx];
              if (target) executeSkillMove(target, skillId);
            }
            if (tIn.pendingPass) {
              tIn.pendingPass = false;
              performSideActionPassOrTackle(true);
            }
            if (tIn.pendingUpperPass) {
              tIn.pendingUpperPass = false;
              performSideUpperPass(true);
            }
            if (tIn.pendingSlideTackle) {
              tIn.pendingSlideTackle = false;
              performSideSlideTackle(true);
            }
            if (tIn.pendingThroughBall) {
              tIn.pendingThroughBall = false;
              performSideThroughBall(true);
            }
            if (tIn.shootCharging) {
              if (ballOwner && ballOwner.isHome) {
                isChargingShot = true;
              } else {
                tIn.shootCharging = false;
                performSideSlideTackle(true);
              }
            }
            if (tIn.pendingShootRelease) {
              tIn.pendingShootRelease = false;
              isChargingShot = false;
              const currentOwner = ballOwner;
              if (currentOwner && currentOwner.isHome) {
                const shooterName = currentOwner.name || 'STRIKER';
                const ratio = THREE.MathUtils.clamp(
                  Math.max(0.56, shotPowerCharge / 100),
                  0.56,
                  1.0
                );
                executeShot(currentOwner, ratio);
                aiCurrentAction = `${shooterName} Driven Strike (${Math.round(ratio * 100)}%)`;
              }
              shotPowerCharge = 0;
            }
          }

          if (isChargingShot && ballOwner && ballOwner.isHome) {
            shotPowerCharge = Math.min(100, shotPowerCharge + dt * 145);
          }

          // Process Online Guest (AWAY) Discrete Inputs if in ONLINE_MULTIPLAYER
          if (currentMode === 'ONLINE_MULTIPLAYER') {
            const gIn = remoteGuestInputRef.current;
            if (gIn.pendingSwitchPlayer) {
              gIn.pendingSwitchPlayer = false;
              switchActivePlayerForSide(false);
            }
            if (gIn.pendingSkillMove) {
              const sk = gIn.pendingSkillMove;
              gIn.pendingSkillMove = null;
              const target =
                ballOwner && !ballOwner.isHome ? ballOwner : players[activeAwayIdx];
              if (target) executeSkillMove(target, sk);
            }
            if (gIn.pendingPass) {
              gIn.pendingPass = false;
              performSideActionPassOrTackle(false);
            }
            if (gIn.pendingUpperPass) {
              gIn.pendingUpperPass = false;
              performSideUpperPass(false);
            }
            if (gIn.pendingSlideTackle) {
              gIn.pendingSlideTackle = false;
              performSideSlideTackle(false);
            }
            if (gIn.pendingThroughBall) {
              gIn.pendingThroughBall = false;
              performSideThroughBall(false);
            }
            if (gIn.shootCharging) {
              if (ballOwner && !ballOwner.isHome) {
                guestShotPowerCharge = Math.min(100, guestShotPowerCharge + dt * 145);
              } else {
                gIn.shootCharging = false;
                performSideSlideTackle(false);
              }
            }
            if (gIn.pendingShootRelease) {
              gIn.pendingShootRelease = false;
              if (ballOwner && !ballOwner.isHome) {
                const shooter = ballOwner;
                const ratio = THREE.MathUtils.clamp(
                  Math.max(0.56, guestShotPowerCharge / 100),
                  0.56,
                  1.0
                );
                executeShot(shooter, ratio);
                aiCurrentAction = `${shooter.name} Online Driven Strike!`;
              }
              guestShotPowerCharge = 0;
            }
          }

          // ===================================================================
          // CHECK IF USER IS MOVING ANY PLAYER
          // "If the user is not moving any player so the app should not move any player also"
          // ===================================================================
          let homeInputX = isLocalOnlineAway ? 0 : touchInputRef.current.moveX;
          let homeInputZ = isLocalOnlineAway ? 0 : touchInputRef.current.moveZ;
          if (!isLocalOnlineAway) {
            if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) homeInputZ -= 1;
            if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) homeInputZ += 1;
            if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) homeInputX -= 1;
            if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) homeInputX += 1;

            // Support Direct Pitch Touch-to-Move if user touches the 3D grass field directly
            if (
              isTouchingPitch &&
              Math.hypot(homeInputX, homeInputZ) <= 0.04 &&
              players[activeHomeIdx]
            ) {
              const actP = players[activeHomeIdx];
              const pdx = pitchTouchTargetX - actP.x;
              const pdz = pitchTouchTargetZ - actP.z;
              const pdist = Math.hypot(pdx, pdz);
              if (pdist > 0.75) {
                homeInputX = pdx / pdist;
                homeInputZ = pdz / pdist;
              }
            }
          }

          const homeUserIsMoving = Math.hypot(homeInputX, homeInputZ) > 0.03;
          const guestUserIsMoving =
            currentMode === 'ONLINE_MULTIPLAYER' &&
            Math.hypot(
              remoteGuestInputRef.current.moveX,
              remoteGuestInputRef.current.moveZ
            ) > 0.03;
          const freezePlayersBecauseUserIdle = false;

          // Advance Match Clock continuously during live match play
          if (!freezePlayersBecauseUserIdle) {
            matchClockSeconds += dt * 0.55;

            // Check for 45:00 HALF-TIME!
            if (currentHalf === 1 && !halfTimeCompleted && matchClockSeconds >= 45) {
              matchClockSeconds = 45;
              halfTimeCompleted = true;
              soundEngine.playWhistle('fulltime');
              callbacksRef.current.onMatchHalfTime(homeScore, awayScore);
            } else if (matchClockSeconds >= 90) {
              matchClockSeconds = 90;
              soundEngine.playWhistle('fulltime');
              callbacksRef.current.onMatchFullTime(homeScore, awayScore);
            }
          }

          if (possessCooldown > 0) possessCooldown -= dt;
          if (aiDecisionCooldown > 0) aiDecisionCooldown -= dt;

          adaptationCheckTimer += dt;
          if (adaptationCheckTimer >= 3.8 && !freezePlayersBecauseUserIdle) {
            adaptationCheckTimer = 0;
            evaluateDynamicTacticalAdaptation();
          }

          const boxProximity = Math.min(1, Math.abs(ballX) / (PITCH_HALF_W * 0.85));
          soundEngine.updateStadiumExcitement(boxProximity);

          momentum = THREE.MathUtils.damp(momentum, 0, 0.08, dt);

          if (ballOwner && !freezePlayersBecauseUserIdle) {
            if (ballOwner.isHome) homePossessionFrames++;
            else awayPossessionFrames++;
          }

          const bootSpec =
            BOOT_CATALOG[equipmentRef.current.bootModel] ||
            BOOT_CATALOG.hypervenom_volt;
          const homeSpeedBonus = 1 + bootSpec.speedBonus * 0.015;

          const activeHomeMentality = tactics.dynamicAdaptation
            ? dynamicHomeMentality
            : tactics.mentality;

          const homeLineShiftX =
            activeHomeMentality === 'Ultra Attack'
              ? 11.5
              : activeHomeMentality === 'Gegenpress'
              ? 7.0
              : activeHomeMentality === 'Counter-Attack'
              ? -4.5
              : 2.5;

          const awayLineShiftX =
            awayMentality === 'Ultra Attack'
              ? -11.5
              : awayMentality === 'Gegenpress'
              ? -7.0
              : awayMentality === 'Counter-Attack'
              ? 4.5
              : -2.5;

          let closestHome = players[4];
          let secondHome = players[3];
          let minHD1 = 999,
            minHD2 = 999;

          let closestAway = players[11];
          let secondAway = players[10];
          let minAD1 = 999,
            minAD2 = 999;

          for (const p of players) {
            if (p.isGK) continue;
            const d = Math.hypot(p.x - ballX, p.z - ballZ);
            if (p.isHome) {
              if (d < minHD1) {
                minHD2 = minHD1;
                secondHome = closestHome;
                minHD1 = d;
                closestHome = p;
              } else if (d < minHD2) {
                minHD2 = d;
                secondHome = p;
              }
            } else {
              if (d < minAD1) {
                minAD2 = minAD1;
                secondAway = closestAway;
                minAD1 = d;
                closestAway = p;
              } else if (d < minAD2) {
                minAD2 = d;
                secondAway = p;
              }
            }
          }

          // ===================================================================
          // AUTOMATIC CLOSEST-PLAYER CONTROL SWITCHING
          // ===================================================================
          if (currentMode === 'AI_VS_AI') {
            activeHomeIdx =
              ballOwner && ballOwner.isHome ? ballOwner.id : closestHome.id;
          } else {
            if (ballOwner && ballOwner.isHome && !ballOwner.isGK) {
              activeHomeIdx = ballOwner.id;
            } else if (tactics.autoSwitchPlayer) {
              const currentActivePlayer = players[activeHomeIdx];
              const currentActiveDist = currentActivePlayer
                ? Math.hypot(currentActivePlayer.x - ballX, currentActivePlayer.z - ballZ)
                : 999;
              if (
                closestHome.id !== activeHomeIdx &&
                (minHD1 < 3.5 || minHD1 < currentActiveDist - 0.65)
              ) {
                activeHomeIdx = closestHome.id;
              }
            }
          }

          if (ballOwner && !ballOwner.isHome && !ballOwner.isGK) {
            activeAwayIdx = ballOwner.id;
          } else {
            const currentAwayPlayer = players[activeAwayIdx];
            const currentAwayDist = currentAwayPlayer
              ? Math.hypot(currentAwayPlayer.x - ballX, currentAwayPlayer.z - ballZ)
              : 999;
            if (
              closestAway.id !== activeAwayIdx &&
              (minAD1 < 3.5 || minAD1 < currentAwayDist - 0.65)
            ) {
              activeAwayIdx = closestAway.id;
            }
          }

          let awayDefLineX = PITCH_HALF_W - 8;
          let homeDefLineX = -PITCH_HALF_W + 8;
          for (const p of players) {
            if (p.isGK) continue;
            if (!p.isHome && p.x > awayDefLineX) awayDefLineX = p.x;
            if (p.isHome && p.x < homeDefLineX) homeDefLineX = p.x;
          }

          // Update all 14 Players
          for (const p of players) {
            if (p.kickTimer > 0) p.kickTimer = Math.max(0, p.kickTimer - dt);
            if (p.skillTimer > 0) {
              p.skillTimer = Math.max(0, p.skillTimer - dt);
              if (p.skillTimer === 0) p.activeSkill = null;
            }
            if (p.stunTimer > 0) {
              p.stunTimer = Math.max(0, p.stunTimer - dt);
            }
            if (p.gkDiveTimer > 0) {
              p.gkDiveTimer = Math.max(0, p.gkDiveTimer - dt);
              if (p.gkDiveTimer === 0) p.gkDiveDir = 0;
            }
            if (p.slideCooldown > 0) {
              p.slideCooldown = Math.max(0, p.slideCooldown - dt);
            }

            // ACTIVE SLIDING TACKLE MOTION & BALL SNATCH LOGIC
            if (p.slideTimer > 0) {
              p.slideTimer = Math.max(0, p.slideTimer - dt);
              const slideProgress = 1 - p.slideTimer / Math.max(0.01, p.slideDuration);
              const currentSlideSpeed = 18.5 * Math.max(0, 1 - Math.pow(slideProgress, 1.35));
              p.vx = p.slideDirX * currentSlideSpeed;
              p.vz = p.slideDirZ * currentSlideSpeed;
              p.x = THREE.MathUtils.clamp(
                p.x + p.vx * dt,
                -PITCH_HALF_W + 0.35,
                PITCH_HALF_W - 0.35
              );
              p.z = THREE.MathUtils.clamp(
                p.z + p.vz * dt,
                -PITCH_HALF_Z + 0.35,
                PITCH_HALF_Z - 0.35
              );

              if (Math.random() < 0.38) {
                spawnParticles(p.x, 0.05, p.z, 2, 0x15803d, 1.8);
              }

              // Snatch ball if within sliding contact radius!
              const toBallDist = Math.hypot(ballX - p.x, ballZ - p.z);
              if (toBallDist < 3.5 && possessCooldown <= 0) {
                if (ballOwner && ballOwner.id !== p.id) {
                  if (ballOwner.isHome !== p.isHome) {
                    ballOwner.stunTimer = 0.45;
                    ballOwner.vx *= 0.15;
                    ballOwner.vz *= 0.15;
                  }
                }
                ballOwner = p;
                lastTouchTeam = p.isHome ? 'HOME' : 'AWAY';
                possessCooldown = 0.32;
                if (p.isHome) {
                  homeTackles++;
                  momentum = Math.min(100, momentum + 12);
                } else {
                  awayTackles++;
                  momentum = Math.max(-100, momentum - 12);
                }
                soundEngine.playTackle();
                spawnParticles(ballX, 0.08, ballZ, 18, 0x38bdf8, 5.5);
                aiCurrentAction = `⚡ ${p.name} Snatched Ball with Slide Tackle!`;
              }

              p.parts.root.position.set(p.x, 0, p.z);
              p.parts.root.rotation.y = p.facingAngle;
              animatePlayerKinematics(
                p.parts,
                currentSlideSpeed,
                p.stridePhase,
                p.kickTimer,
                p.isHome && p.id === activeHomeIdx,
                ballOwner?.id === p.id,
                elapsedTime,
                p.activeSkill,
                0,
                currentMode === 'ONLINE_MULTIPLAYER' &&
                  !p.isHome &&
                  p.id === activeAwayIdx,
                p.gkDiveDir,
                0,
                0,
                slideProgress
              );
              continue;
            }

            // IF USER IS NOT MOVING ANY PLAYER: Keep all players stationary!
            if (freezePlayersBecauseUserIdle) {
              p.vx = 0;
              p.vz = 0;
              p.stamina = Math.min(100, p.stamina + dt * 5.0);
              p.parts.root.position.set(p.x, 0, p.z);

              const skillProgress =
                p.activeSkill && p.skillTimer > 0
                  ? 1 - p.skillTimer / Math.max(0.1, p.skillDuration)
                  : 0;

              p.turnBank = THREE.MathUtils.damp(p.turnBank, 0, 10, dt);
              const idleToBallAngle = Math.atan2(ballX - p.x, ballZ - p.z);
              const idleHeadYaw = Math.atan2(
                Math.sin(idleToBallAngle - p.parts.root.rotation.y),
                Math.cos(idleToBallAngle - p.parts.root.rotation.y)
              );

              animatePlayerKinematics(
                p.parts,
                0,
                p.stridePhase,
                p.kickTimer,
                p.isHome && p.id === activeHomeIdx,
                ballOwner?.id === p.id,
                elapsedTime,
                p.activeSkill,
                skillProgress,
                currentMode === 'ONLINE_MULTIPLAYER' &&
                  !p.isHome &&
                  p.id === activeAwayIdx,
                p.gkDiveDir,
                p.turnBank,
                idleHeadYaw
              );
              continue;
            }

            const isHomeUserControlled =
              !isLocalOnlineAway &&
              (currentMode === 'PLAYER_VS_AI' ||
                currentMode === 'ONLINE_MULTIPLAYER') &&
              p.isHome &&
              p.id === activeHomeIdx;

            const isAwayOnlineControlled =
              currentMode === 'ONLINE_MULTIPLAYER' &&
              !p.isHome &&
              p.id === activeAwayIdx &&
              (isLocalOnlineAway || guestUserIsMoving);

            // On the Online AWAY client, all non-local players are smoothly driven by latestRemoteSnap dead-reckoning!
            if (
              isLocalOnlineAway &&
              latestRemoteSnap &&
              remoteSnapAge < 0.65 &&
              !isAwayOnlineControlled
            ) {
              const currentSpeed = Math.hypot(p.vx, p.vz);
              p.stridePhase += currentSpeed * dt * 2.05;
              p.parts.root.position.set(p.x, 0, p.z);
              const diffAngle = Math.atan2(
                Math.sin(p.facingAngle - p.parts.root.rotation.y),
                Math.cos(p.facingAngle - p.parts.root.rotation.y)
              );
              p.parts.root.rotation.y += diffAngle * Math.min(1, dt * 13.5);
              const targetBank = THREE.MathUtils.clamp(
                -diffAngle * (currentSpeed / 13.5) * 0.45,
                -0.26,
                0.26
              );
              p.turnBank = THREE.MathUtils.damp(p.turnBank, targetBank, 12, dt);
              const toBallAngle = Math.atan2(ballX - p.x, ballZ - p.z);
              const headLookYaw = Math.atan2(
                Math.sin(toBallAngle - p.parts.root.rotation.y),
                Math.cos(toBallAngle - p.parts.root.rotation.y)
              );
              const skillProgress =
                p.activeSkill && p.skillTimer > 0
                  ? 1 - p.skillTimer / Math.max(0.1, p.skillDuration)
                  : 0;
              animatePlayerKinematics(
                p.parts,
                currentSpeed,
                p.stridePhase,
                p.kickTimer,
                p.isHome && p.id === activeHomeIdx,
                ballOwner?.id === p.id,
                elapsedTime,
                p.activeSkill,
                skillProgress,
                false,
                p.gkDiveDir,
                p.turnBank,
                headLookYaw
              );
              continue;
            }

            if (isHomeUserControlled) {
              if (activeSetPieceType === 'CORNER' && isUserCornerActive) {
                p.vx = 0;
                p.vz = 0;
                continue;
              }
              const isCloseDribbling =
                heldKeys.has('KeyC') || touchInputRef.current.closeDribbleHeld;
              const isSprinting =
                !isCloseDribbling &&
                (shiftModifierActive ||
                  heldKeys.has('ShiftLeft') ||
                  heldKeys.has('ShiftRight') ||
                  heldKeys.has('KeyR') ||
                  touchInputRef.current.sprintHeld);

              if (homeUserIsMoving) {
                const len = Math.hypot(homeInputX, homeInputZ);
                let dirX = homeInputX / Math.max(0.0001, len);
                let dirZ = homeInputZ / Math.max(0.0001, len);

                // SMART JOYSTICK ASSIST 1: Loose/Opponent Ball Magnet (within 5.2m)
                if (ballOwner !== p) {
                  const toBallX = ballX - p.x;
                  const toBallZ = ballZ - p.z;
                  const toBallDist = Math.hypot(toBallX, toBallZ);
                  if (toBallDist > 0.2 && toBallDist < 5.2) {
                    const bxNorm = toBallX / toBallDist;
                    const bzNorm = toBallZ / toBallDist;
                    const dot = dirX * bxNorm + dirZ * bzNorm;
                    if (dot > 0.25) {
                      // Gently pull player trajectory onto the ball so iPad joystick never misses the ball
                      const assistWeight = 0.44;
                      dirX = dirX * (1 - assistWeight) + bxNorm * assistWeight;
                      dirZ = dirZ * (1 - assistWeight) + bzNorm * assistWeight;
                      const reLen = Math.max(0.0001, Math.hypot(dirX, dirZ));
                      dirX /= reLen;
                      dirZ /= reLen;
                    }
                  }
                } else if (p.x > 10 && dirX > 0.45) {
                  // SMART JOYSTICK ASSIST 2: Subtle Goal-Lane Guide when dribbling in attacking half
                  const toGoalX = PITCH_HALF_W - p.x;
                  const toGoalZ = (0 - p.z) * 0.65;
                  const toGoalLen = Math.max(1, Math.hypot(toGoalX, toGoalZ));
                  const gxNorm = toGoalX / toGoalLen;
                  const gzNorm = toGoalZ / toGoalLen;
                  dirX = dirX * 0.82 + gxNorm * 0.18;
                  dirZ = dirZ * 0.82 + gzNorm * 0.18;
                  const reLen = Math.max(0.0001, Math.hypot(dirX, dirZ));
                  dirX /= reLen;
                  dirZ /= reLen;
                }

                const skillBoost =
                  p.activeSkill && p.skillTimer > 0
                    ? SKILL_MOVES_CATALOG[p.activeSkill].speedBurstMult
                    : 1.0;

                const analogSpeedFactor = THREE.MathUtils.clamp(
                  0.82 + Math.min(1, len) * 0.18,
                  0.82,
                  1.0
                );

                const baseSpeed = computePlayerSpeedStats(
                  p,
                  isCloseDribbling,
                  isSprinting
                );

                const topSpeed =
                  baseSpeed *
                  analogSpeedFactor *
                  homeSpeedBonus *
                  skillBoost *
                  (p.stamina < 10 ? 0.9 : 1.0);

                // OVR-Driven Agility & Acceleration Scaling:
                // Low OVR players (72-78) have heavier inertia (agilityDamp 12-16)
                // High OVR players (88-95) turn on a dime (agilityDamp 26-32)
                // Mythic 120 Icons have superhuman instant response (agilityDamp 36-40)
                const ovrRatio = THREE.MathUtils.clamp((p.ovr - 70) / 50, 0, 1);
                const baseAgility = THREE.MathUtils.lerp(14, 34, Math.pow(ovrRatio, 1.25));
                const agilityDamp = isCloseDribbling
                  ? baseAgility + 8
                  : isSprinting
                  ? baseAgility + 4
                  : baseAgility;

                p.vx = THREE.MathUtils.damp(p.vx, dirX * topSpeed, agilityDamp, dt);
                p.vz = THREE.MathUtils.damp(p.vz, dirZ * topSpeed, agilityDamp, dt);
                p.facingAngle = Math.atan2(p.vx, p.vz);

                if (isSprinting) {
                  // Low OVR players tire faster when sprinting; High OVR / Icons possess elite endurance
                  const staminaDrainRate = THREE.MathUtils.lerp(4.5, 1.8, ovrRatio);
                  p.stamina = Math.max(8, p.stamina - dt * staminaDrainRate);
                  if (Math.random() < 0.55) {
                    spawnParticles(
                      p.x,
                      0.06,
                      p.z,
                      p.ovr >= 110 ? 3 : p.ovr >= 90 ? 2 : 1,
                      p.ovr >= 118 ? 0xfacc15 : p.ovr >= 90 ? 0xa3e635 : 0x22c55e,
                      p.ovr >= 110 ? 3.8 : 2.8
                    );
                  }
                } else {
                  p.stamina = Math.min(100, p.stamina + dt * 8.0);
                }
              } else if (p.skillTimer <= 0) {
                p.vx = 0;
                p.vz = 0;
                p.stamina = Math.min(100, p.stamina + dt * 9.0);
              }
            } else if (isAwayOnlineControlled) {
              const gIn = remoteGuestInputRef.current;
              if (guestUserIsMoving) {
                const len = Math.hypot(gIn.moveX, gIn.moveZ);
                let dirX = gIn.moveX / Math.max(0.0001, len);
                let dirZ = gIn.moveZ / Math.max(0.0001, len);

                // SMART JOYSTICK ASSIST FOR ONLINE AWAY PLAYER (Ball Magnet within 5.2m)
                if (ballOwner !== p) {
                  const toBallX = ballX - p.x;
                  const toBallZ = ballZ - p.z;
                  const toBallDist = Math.hypot(toBallX, toBallZ);
                  if (toBallDist > 0.2 && toBallDist < 5.2) {
                    const bxNorm = toBallX / toBallDist;
                    const bzNorm = toBallZ / toBallDist;
                    const dot = dirX * bxNorm + dirZ * bzNorm;
                    if (dot > 0.25) {
                      const assistWeight = 0.44;
                      dirX = dirX * (1 - assistWeight) + bxNorm * assistWeight;
                      dirZ = dirZ * (1 - assistWeight) + bzNorm * assistWeight;
                      const reLen = Math.max(0.0001, Math.hypot(dirX, dirZ));
                      dirX /= reLen;
                      dirZ /= reLen;
                    }
                  }
                } else if (p.x < -10 && dirX < -0.45) {
                  const toGoalX = -PITCH_HALF_W - p.x;
                  const toGoalZ = (0 - p.z) * 0.65;
                  const toGoalLen = Math.max(1, Math.hypot(toGoalX, toGoalZ));
                  const gxNorm = toGoalX / toGoalLen;
                  const gzNorm = toGoalZ / toGoalLen;
                  dirX = dirX * 0.82 + gxNorm * 0.18;
                  dirZ = dirZ * 0.82 + gzNorm * 0.18;
                  const reLen = Math.max(0.0001, Math.hypot(dirX, dirZ));
                  dirX /= reLen;
                  dirZ /= reLen;
                }

                const skillBoost =
                  p.activeSkill && p.skillTimer > 0
                    ? SKILL_MOVES_CATALOG[p.activeSkill].speedBurstMult
                    : 1.0;
                const analogSpeedFactor = THREE.MathUtils.clamp(
                  0.82 + Math.min(1, len) * 0.18,
                  0.82,
                  1.0
                );
                const baseSpeed = computePlayerSpeedStats(
                  p,
                  gIn.closeDribbleHeld,
                  gIn.sprintHeld
                );
                const topSpeed = baseSpeed * analogSpeedFactor * skillBoost;
                const agilityDamp = gIn.closeDribbleHeld ? 28 : gIn.sprintHeld ? 26 : 24;
                p.vx = THREE.MathUtils.damp(p.vx, dirX * topSpeed, agilityDamp, dt);
                p.vz = THREE.MathUtils.damp(p.vz, dirZ * topSpeed, agilityDamp, dt);
                p.facingAngle = Math.atan2(p.vx, p.vz);
              } else if (p.skillTimer <= 0) {
                // Online Away player stands still when Guest is not moving!
                p.vx = 0;
                p.vz = 0;
              }
            } else {
              // ===============================================================
              // UPGRADED PRO GOALKEEPER & UTILITY AI
              // ===============================================================
              if (p.stunTimer > 0) {
                p.vx = THREE.MathUtils.damp(p.vx, 0, 6, dt);
                p.vz = THREE.MathUtils.damp(p.vz, 0, 6, dt);
              } else {
                p.stamina = Math.min(100, p.stamina + dt * 2.5);
                const attackDir = p.isHome ? 1 : -1;
                const oppGoalX = p.isHome ? PITCH_HALF_W : -PITCH_HALF_W;
                const ownGoalX = p.isHome ? -PITCH_HALF_W : PITCH_HALF_W;
                const teamMentality = p.isHome ? activeHomeMentality : awayMentality;

                if (p.isGK) {
                  // PRO GOALKEEPER PREDICTIVE SHOT INTERCEPTION & ANGLE NARROWING
                  const ballThreatDist = Math.abs(ballX - ownGoalX);
                  const shotHeadingToGoal =
                    !ballOwner &&
                    Math.abs(ballVX) > 5.5 &&
                    Math.sign(ballVX) === (p.isHome ? -1 : 1);

                  let desiredZ = ballZ * 0.68;
                  let comeOffLine = ballThreatDist < 22 ? 2.6 : 1.4;

                  if (shotHeadingToGoal) {
                    // Raycast exact ball trajectory intersection with goal line!
                    const timeToGoal =
                      Math.abs(ownGoalX - ballX) / Math.max(1, Math.abs(ballVX));
                    desiredZ = ballZ + ballVZ * timeToGoal;
                    comeOffLine = 1.1; // Hold goal line to maximize reaction time
                  } else if (
                    !ballOwner &&
                    ballThreatDist < 13 &&
                    Math.hypot(ballVX, ballVZ) < 9
                  ) {
                    // Sweep loose through-balls inside the penalty box!
                    comeOffLine = Math.min(9.5, ballThreatDist * 0.75);
                    desiredZ = ballZ;
                  }

                  const targetX = ownGoalX + attackDir * comeOffLine;
                  const targetZ = THREE.MathUtils.clamp(
                    desiredZ,
                    -GOAL_HALF_WIDTH + 0.35,
                    GOAL_HALF_WIDTH - 0.35
                  );

                  p.vx = (targetX - p.x) * 11.5;
                  p.vz = (targetZ - p.z) * (shotHeadingToGoal ? 18.5 : 13.0);
                  p.facingAngle = Math.atan2(ballX - p.x, ballZ - p.z);

                  if (ballOwner === p && aiDecisionCooldown <= 0) {
                    const { mate } = evaluateBestPassOption(p, true);
                    executePass(p, mate, true);
                    aiDecisionCooldown = 0.55;
                    aiCurrentAction = `${p.name} Long Goal Kick Distribution`;
                  }
                } else if (ballOwner === p) {
                  const distToGoal = Math.hypot(oppGoalX - p.x, 0 - p.z);
                  const paceFactor = p.isHome
                    ? 0.85 + (tactics.attackingPace / 100) * 0.3
                    : 1.03;
                  const baseCarrySpeed = computePlayerSpeedStats(p, false, false);
                  const carrySpeed =
                    baseCarrySpeed * paceFactor * (p.isHome ? homeSpeedBonus : 1.0);

                  let evadeX = attackDir * 1.0;
                  let evadeZ = (0 - p.z) * 0.14;
                  let nearestDefDist = 99;

                  for (const opp of players) {
                    if (opp.isHome !== p.isHome) {
                      const d = Math.hypot(opp.x - p.x, opp.z - p.z);
                      if (d < nearestDefDist) nearestDefDist = d;
                      if (d < 7.0 && d > 0.1) {
                        evadeX += ((p.x - opp.x) / d) * 0.45;
                        evadeZ += ((p.z - opp.z) / d) * 0.85;
                      }
                    }
                  }

                  const gLen = Math.max(0.1, Math.hypot(evadeX, evadeZ));
                  p.vx = THREE.MathUtils.damp(
                    p.vx,
                    (evadeX / gLen) * carrySpeed,
                    8.5,
                    dt
                  );
                  p.vz = THREE.MathUtils.damp(
                    p.vz,
                    (evadeZ / gLen) * carrySpeed,
                    8.5,
                    dt
                  );
                  p.facingAngle = Math.atan2(p.vx, p.vz);

                  if (aiDecisionCooldown <= 0) {
                    if (activeSetPieceType === 'CORNER') {
                      executePass(p, null, true);
                      aiDecisionCooldown = 0.65;
                      aiCurrentAction = `${p.name} Whipped Corner Cross!`;
                    } else {
                      const clearShotAngle = Math.abs(p.z) < 14.5;
                      const inShootingRange = distToGoal < 22.0;

                      if (
                        inShootingRange &&
                        clearShotAngle &&
                        (distToGoal < 15.5 ||
                          nearestDefDist < 3.6 ||
                          Math.random() < 0.65)
                      ) {
                        executeShot(p, 0.78 + Math.random() * 0.2);
                        aiDecisionCooldown = 0.62;
                        aiCurrentAction = `${p.name} (${p.ovr} OVR) Clinical Strike (${distToGoal.toFixed(0)}m)`;
                      } else if (
                        nearestDefDist < 3.4 &&
                        p.role === 'FWD' &&
                        Math.random() < 0.38
                      ) {
                        executeSkillMove(
                          p,
                          Math.random() < 0.5 ? 'elastico' : 'roulette'
                        );
                        aiDecisionCooldown = 0.45;
                      } else {
                        const preferThrough =
                          teamMentality === 'Counter-Attack' ||
                          teamMentality === 'Ultra Attack';
                        const { mate, utility, shouldLobThrough } =
                          evaluateBestPassOption(p, preferThrough);

                        const underPressure = nearestDefDist < 4.5;
                        const tikiTakaTrigger =
                          teamMentality === 'Tiki-Taka' && utility > 8.5;

                        if (
                          mate &&
                          (underPressure || tikiTakaTrigger || utility > 14.5)
                        ) {
                          executePass(p, mate, shouldLobThrough);
                          aiDecisionCooldown = 0.4;
                          aiCurrentAction = `${p.name} ➔ ${mate.name} (${
                            shouldLobThrough ? 'Through-Ball' : 'Triangle Pass'
                          })`;
                        } else {
                          aiDecisionCooldown = 0.22;
                          aiCurrentAction = `${p.name} Carrying into Space`;
                        }
                      }
                    }
                  }
                } else {
                  const isPrimaryPresser =
                    (p.isHome && p.id === closestHome.id) ||
                    (!p.isHome && p.id === closestAway.id);
                  const isSecondaryCover =
                    (p.isHome && p.id === secondHome.id) ||
                    (!p.isHome && p.id === secondAway.id);

                  const teamHasPossession =
                    ballOwner !== null && ballOwner.isHome === p.isHome;

                  let targetX = p.baseX * PITCH_HALF_W * 0.78;
                  let targetZ = p.baseZ * PITCH_HALF_Z * 0.85;

                  if (!teamHasPossession) {
                    if (isPrimaryPresser) {
                      const toGoalX = ownGoalX - ballX;
                      const toGoalZ = 0 - ballZ;
                      const gDist = Math.max(1, Math.hypot(toGoalX, toGoalZ));
                      const dToBall = Math.hypot(p.x - ballX, p.z - ballZ);
                      // Gentle goal-side stance so AI approaches realistically without instantly swarming
                      const stanceOffset = dToBall > 2.6 ? 0.88 : 0.58;
                      targetX =
                        ballX +
                        (toGoalX / gDist) * stanceOffset +
                        (ballOwner ? ballOwner.vx * 0.06 : ballVX * 0.06);
                      targetZ =
                        ballZ +
                        (toGoalZ / gDist) * stanceOffset +
                        (ballOwner ? ballOwner.vz * 0.06 : ballVZ * 0.06);
                    } else if (isSecondaryCover && ballOwner) {
                      const { mate: threatReceiver } = evaluateBestPassOption(
                        ballOwner,
                        false
                      );
                      if (threatReceiver) {
                        targetX = (ballX + threatReceiver.x) * 0.5;
                        targetZ = (ballZ + threatReceiver.z) * 0.5;
                      } else {
                        targetX = ballX + (ownGoalX - ballX) * 0.25;
                        targetZ = ballZ * 0.78;
                      }
                    } else {
                      const ballShiftX = ballX * 0.4;
                      const lineShift = p.isHome ? homeLineShiftX : awayLineShiftX;
                      targetX += ballShiftX + lineShift;
                      targetZ = THREE.MathUtils.lerp(targetZ, ballZ, 0.28);
                    }
                  } else {
                    const ballShiftX = ballX * 0.45;
                    const lineShift = p.isHome ? homeLineShiftX : awayLineShiftX;
                    targetX += ballShiftX + lineShift;

                    if (p.role === 'FWD') {
                      const desiredRunX = targetX + attackDir * 11.0;
                      targetX = p.isHome
                        ? Math.min(desiredRunX, awayDefLineX - 0.8)
                        : Math.max(desiredRunX, homeDefLineX + 0.8);
                    } else if (p.role === 'MID' && ballOwner) {
                      const distToCarrier = Math.hypot(
                        p.x - ballOwner.x,
                        p.z - ballOwner.z
                      );
                      if (distToCarrier > 18) {
                        targetX = THREE.MathUtils.lerp(
                          targetX,
                          ballOwner.x + attackDir * 5,
                          0.45
                        );
                        targetZ = THREE.MathUtils.lerp(targetZ, ballOwner.z, 0.35);
                      }
                    }
                  }

                  targetX = THREE.MathUtils.clamp(
                    targetX,
                    -PITCH_HALF_W + 2.8,
                    PITCH_HALF_W - 2.8
                  );
                  targetZ = THREE.MathUtils.clamp(
                    targetZ,
                    -PITCH_HALF_Z + 2.2,
                    PITCH_HALF_Z - 2.2
                  );

                  const dx = targetX - p.x;
                  const dz = targetZ - p.z;
                  const dist = Math.hypot(dx, dz);
                  const pressMult = p.isHome
                    ? 0.92 + (tactics.pressingIntensity / 100) * 0.28
                    : awayMentality === 'Gegenpress' ||
                      awayMentality === 'Ultra Attack'
                    ? 0.86
                    : 0.8;
                  const isAggressivePursuit = !teamHasPossession && isPrimaryPresser;
                  const playerBaseSpeed = computePlayerSpeedStats(
                    p,
                    false,
                    isAggressivePursuit && p.isHome
                  );
                  const maxRunSpeed =
                    (isAggressivePursuit
                      ? playerBaseSpeed * 0.78
                      : playerBaseSpeed * 0.74) * pressMult;

                  if (dist > 0.35) {
                    const spd = isAggressivePursuit
                      ? Math.min(maxRunSpeed, dist * 5.8)
                      : Math.min(maxRunSpeed, dist * 4.2);
                    p.vx = THREE.MathUtils.damp(p.vx, (dx / dist) * spd, 8.5, dt);
                    p.vz = THREE.MathUtils.damp(p.vz, (dz / dist) * spd, 8.5, dt);
                    if (Math.hypot(p.vx, p.vz) > 0.85) {
                      p.facingAngle = Math.atan2(p.vx, p.vz);
                    } else {
                      p.facingAngle = Math.atan2(ballX - p.x, ballZ - p.z);
                    }
                  } else {
                    p.vx = THREE.MathUtils.damp(p.vx, 0, 10, dt);
                    p.vz = THREE.MathUtils.damp(p.vz, 0, 10, dt);
                    p.facingAngle = Math.atan2(ballX - p.x, ballZ - p.z);
                  }

                  // Balanced AI Ball-Snatching Lunge (forgiving against User, strong for User's teammates!)
                  if (
                    isAggressivePursuit &&
                    ballOwner &&
                    ballOwner.isHome !== p.isHome &&
                    possessCooldown <= 0 &&
                    p.stunTimer <= 0
                  ) {
                    const distToBallNow = Math.hypot(ballX - p.x, ballZ - p.z);
                    const carrierProtected =
                      ballOwner.skillTimer > 0 ||
                      (ballOwner.isHome &&
                        (heldKeys.has('KeyC') ||
                          touchInputRef.current.closeDribbleHeld));
                    const lungeRange = p.isHome ? 1.55 : 1.18;
                    if (distToBallNow < lungeRange) {
                      const snatchChance = p.isHome
                        ? carrierProtected
                          ? 0.05
                          : 0.14
                        : carrierProtected
                        ? 0.003
                        : 0.012;
                      if (Math.random() < snatchChance) {
                        const prevCarrier = ballOwner;
                        ballOwner = p;
                        lastTouchTeam = p.isHome ? 'HOME' : 'AWAY';
                        if (p.isHome && !p.isGK) activeHomeIdx = p.id;
                        if (!p.isHome && !p.isGK) activeAwayIdx = p.id;
                        possessCooldown = p.isHome ? 0.55 : 0.42;
                        aiDecisionCooldown = 0.28;
                        p.kickTimer = 0.22;
                        prevCarrier.stunTimer = p.isHome ? 0.42 : 0.25;
                        if (p.isHome) {
                          homeTackles++;
                          momentum = Math.min(100, momentum + 9);
                        } else {
                          awayTackles++;
                          momentum = Math.max(-100, momentum - 9);
                        }
                        soundEngine.playTackle();
                        spawnParticles(ballX, 0.1, ballZ, 12, 0x38bdf8, 4.2);
                        aiCurrentAction = `${p.name} Pressing Tackle — Ball Snatched!`;
                      }
                    }
                  }
                }
              }
            }

            // Soft player-to-player separation so two players never stack on the same point and vibrate
            if (!p.isGK) {
              for (const other of players) {
                if (other.id === p.id || other.isGK) continue;
                const sepX = p.x - other.x;
                const sepZ = p.z - other.z;
                const sepDist = Math.hypot(sepX, sepZ);
                const minSep = 0.72;
                if (sepDist > 0.001 && sepDist < minSep) {
                  const push = (minSep - sepDist) * 4.5 * dt;
                  p.x += (sepX / sepDist) * push;
                  p.z += (sepZ / sepDist) * push;
                }
              }
            }

            p.x = THREE.MathUtils.clamp(
              p.x + p.vx * dt,
              -PITCH_HALF_W - 1.5,
              PITCH_HALF_W + 1.5
            );
            p.z = THREE.MathUtils.clamp(
              p.z + p.vz * dt,
              -PITCH_HALF_Z - 1.5,
              PITCH_HALF_Z + 1.5
            );

            const currentSpeed = Math.hypot(p.vx, p.vz);
            p.stridePhase += currentSpeed * dt * 2.05;

            p.parts.root.position.set(p.x, 0, p.z);
            const diffAngle = Math.atan2(
              Math.sin(p.facingAngle - p.parts.root.rotation.y),
              Math.cos(p.facingAngle - p.parts.root.rotation.y)
            );
            p.parts.root.rotation.y += diffAngle * Math.min(1, dt * 13.5);

            // Natural biomechanical turn banking & head look-at ball tracking
            const targetBank = THREE.MathUtils.clamp(
              -diffAngle * (currentSpeed / 13.5) * 0.45,
              -0.26,
              0.26
            );
            p.turnBank = THREE.MathUtils.damp(p.turnBank, targetBank, 12, dt);

            const toBallAngle = Math.atan2(ballX - p.x, ballZ - p.z);
            const headLookYaw = Math.atan2(
              Math.sin(toBallAngle - p.parts.root.rotation.y),
              Math.cos(toBallAngle - p.parts.root.rotation.y)
            );

            const skillProgress =
              p.activeSkill && p.skillTimer > 0
                ? 1 - p.skillTimer / Math.max(0.1, p.skillDuration)
                : 0;

            const isCarrierCloseDribble =
              p.isHome &&
              ballOwner?.id === p.id &&
              (heldKeys.has('KeyC') || touchInputRef.current.closeDribbleHeld);

            animatePlayerKinematics(
              p.parts,
              currentSpeed,
              p.stridePhase,
              p.kickTimer,
              p.isHome && p.id === activeHomeIdx,
              ballOwner?.id === p.id,
              elapsedTime,
              p.activeSkill,
              skillProgress,
              currentMode === 'ONLINE_MULTIPLAYER' &&
                !p.isHome &&
                p.id === activeAwayIdx,
              p.gkDiveDir,
              p.turnBank,
              headLookYaw,
              0,
              isCarrierCloseDribble
            );
          }

          // ===================================================================
          // BALL POSSESSION, UPGRADED GOALKEEPER DIVING SAVES & TIMED TACKLES
          // ===================================================================
          const isAuthoritativeForTackles =
            !isLocalOnlineAway || !latestRemoteSnap || remoteSnapAge >= 0.65;
          if (
            possessCooldown <= 0 &&
            !freezePlayersBecauseUserIdle &&
            isAuthoritativeForTackles
          ) {
            for (const p of players) {
              if (p.stunTimer > 0) continue;

              // Goalkeepers can dive 2.45m laterally and leap up to 3.30m (crossbar height)!
              const maxVerticalReach = p.isGK ? GOAL_HEIGHT - 0.05 : 1.75;
              if (ballY > maxVerticalReach) continue;

              const reach = p.isGK ? 2.45 : p.isHome ? 1.42 : 1.12;
              const d = Math.hypot(p.x - ballX, p.z - ballZ);
              if (d < reach) {
                if (!ballOwner) {
                  const ballSpeed = Math.hypot(ballVX, ballVZ);
                  if (p.isGK && ballSpeed > 13) {
                    // Trigger 3D Goalkeeper Diving Save Pose!
                    p.gkDiveTimer = 0.55;
                    p.gkDiveDir = ballZ >= p.z ? 1 : -1;
                    lastTouchTeam = p.isHome ? 'HOME' : 'AWAY';
                    soundEngine.playKick(0.92);
                    spawnParticles(ballX, Math.max(0.5, ballY), ballZ, 16, 0xffffff, 5.5);

                    // Thunderbolt or wide-corner shots are parried past the post for a Corner Kick!
                    if (ballSpeed > 26 || Math.abs(ballZ) > 2.4 || ballY > 2.0) {
                      const outDirX = p.isHome ? -1 : 1;
                      const outDirZ = ballZ >= 0 ? 1 : -1;
                      ballVX = outDirX * 12;
                      ballVZ = outDirZ * 14;
                      ballVY = 2.8;
                      possessCooldown = 0.3;
                      aiCurrentAction = `${p.name} fingertips Diving Parry over the bar!`;
                      break;
                    } else {
                      aiCurrentAction = `${p.name} Reflex Diving Save & Catch!`;
                    }
                  }

                  ballOwner = p;
                  lastTouchTeam = p.isHome ? 'HOME' : 'AWAY';
                  if (p.isHome && !p.isGK) activeHomeIdx = p.id;
                  if (!p.isHome && !p.isGK) activeAwayIdx = p.id;
                  possessCooldown = p.isHome ? 0.45 : 0.24;
                  aiDecisionCooldown = p.isGK ? 0.65 : 0.28;
                  break;
                } else if (ballOwner.isHome !== p.isHome) {
                  const carrierProtected =
                    ballOwner.skillTimer > 0 ||
                    (ballOwner.isHome &&
                      (heldKeys.has('KeyC') ||
                        touchInputRef.current.closeDribbleHeld));
                  // User's team snatches easily (0.18), while AI opponents snatch much more gently (0.022)
                  const baseProb = p.isGK
                    ? 0.45
                    : p.isHome
                    ? 0.18
                    : p.role === 'DEF'
                    ? 0.022
                    : 0.014;
                  const tackleSuccessProb = carrierProtected
                    ? baseProb * 0.25
                    : baseProb;

                  if (Math.random() < tackleSuccessProb) {
                    const prevOwner = ballOwner;
                    ballOwner = p;
                    lastTouchTeam = p.isHome ? 'HOME' : 'AWAY';
                    if (p.isHome && !p.isGK) activeHomeIdx = p.id;
                    if (!p.isHome && !p.isGK) activeAwayIdx = p.id;
                    possessCooldown = p.isHome ? 0.52 : 0.36;
                    p.kickTimer = 0.2;
                    prevOwner.stunTimer = p.isHome ? 0.38 : 0.22;
                    if (p.isHome) {
                      homeTackles++;
                      momentum = Math.min(100, momentum + 9);
                    } else {
                      awayTackles++;
                      momentum = Math.max(-100, momentum - 9);
                    }
                    soundEngine.playTackle();
                    spawnParticles(ballX, 0.1, ballZ, 9, 0x38bdf8, 3.8);
                    aiCurrentAction = `${p.name} Snatched the Ball!`;
                    break;
                  }
                }
              }
            }
          }

          // ===================================================================
          // REALISTIC HYPERMOTION V DRIBBLING & 3D BALL MOVEMENT
          // ===================================================================
          if (ballOwner) {
            const isCloseDribble =
              ballOwner.isHome &&
              (heldKeys.has('KeyC') || touchInputRef.current.closeDribbleHeld);
            const isSprintDribble =
              (ballOwner.isHome &&
                (shiftModifierActive ||
                  heldKeys.has('ShiftLeft') ||
                  heldKeys.has('ShiftRight') ||
                  touchInputRef.current.sprintHeld)) ||
              (!ballOwner.isHome && remoteGuestInputRef.current.sprintHeld);

            const carrierSpeed = Math.hypot(ballOwner.vx, ballOwner.vz);
            const ovrFactor = THREE.MathUtils.clamp((ballOwner.ovr - 70) / 50, 0, 1);

            // Stride-synchronized foot touches:
            // When carrier swings their foot forward (Math.sin peaks), the boot taps the ball forward!
            // Between touches, the ball rolls smoothly ahead of the dribbler
            const strideCycle = Math.sin(ballOwner.stridePhase);
            const strideTouchPulse = Math.max(0, strideCycle) * 0.16;

            // Close Dribble: Ball glued tight to feet with rapid sole rolls (0.42m - 0.52m)
            // Normal Jog: Standard rhythmic touches (0.58m - 0.72m)
            // Sprint Knock-on: Ball knocked further out into space to run onto (0.85m - 1.25m)
            const baseLead = isCloseDribble
              ? 0.44
              : isSprintDribble
              ? THREE.MathUtils.lerp(0.85, 1.25, ovrFactor)
              : 0.64;

            const dribbleOffset =
              (activeSetPieceType ? 0.45 : baseLead) +
              strideTouchPulse * (isSprintDribble ? 0.28 : 0.12);

            // Alternating Left / Right foot lateral shifts (creates authentic foot-to-foot dribble cradle)
            const lateralFootShift =
              carrierSpeed > 0.8
                ? Math.sin(ballOwner.stridePhase) * (isCloseDribble ? 0.18 : 0.11)
                : 0;

            let lateralSkillWave = 0;
            if (ballOwner.activeSkill === 'elastico' && ballOwner.skillTimer > 0) {
              const elProg = 1 - ballOwner.skillTimer / Math.max(0.01, ballOwner.skillDuration);
              // Elastico: quick flick outward followed by sharp snap inward
              lateralSkillWave = Math.sin(elProg * Math.PI * 2) * 0.55;
            } else if (ballOwner.activeSkill === 'roulette' && ballOwner.skillTimer > 0) {
              const rProg = 1 - ballOwner.skillTimer / Math.max(0.01, ballOwner.skillDuration);
              lateralSkillWave = Math.cos(rProg * Math.PI * 2) * 0.35;
            }

            const sinF = Math.sin(ballOwner.facingAngle);
            const cosF = Math.cos(ballOwner.facingAngle);

            const targetBX =
              ballOwner.x +
              sinF * dribbleOffset -
              cosF * (lateralFootShift + lateralSkillWave);
            const targetBZ =
              ballOwner.z +
              cosF * dribbleOffset +
              sinF * (lateralFootShift + lateralSkillWave);

            // High OVR players have magnetic, silky-smooth micro-damp control (32 damp)
            // Low OVR players have looser touches (18 damp)
            const touchDamp = isCloseDribble
              ? 34
              : THREE.MathUtils.lerp(18, 32, ovrFactor);

            const prevBX = ballX;
            const prevBZ = ballZ;

            ballX = THREE.MathUtils.damp(ballX, targetBX, touchDamp, dt);
            ballZ = THREE.MathUtils.damp(ballZ, targetBZ, touchDamp, dt);

            if (ballOwner.activeSkill === 'rainbow_flick' && ballOwner.skillTimer > 0) {
              const prog =
                1 - ballOwner.skillTimer / Math.max(0.1, ballOwner.skillDuration);
              ballY = ballRadius + Math.sin(prog * Math.PI) * 1.55;
            } else {
              // Subtle micro-hop on heavy sprint touches for realistic ball dynamics
              const microHop = isSprintDribble && strideTouchPulse > 0.12 ? 0.05 : 0;
              ballY = ballRadius + microHop;
            }

            // Calculate instantaneous ball movement vector for TRUE 3D rolling physics
            const actualMoveX = (ballX - prevBX) / Math.max(0.001, dt);
            const actualMoveZ = (ballZ - prevBZ) / Math.max(0.001, dt);
            ballVX = actualMoveX;
            ballVZ = actualMoveZ;
            ballVY = 0;

            // True 3D rolling rotation around the perpendicular ground axis
            const ballGroundSpeed = Math.hypot(actualMoveX, actualMoveZ);
            if (ballGroundSpeed > 0.25) {
              _ballMoveDir.set(actualMoveX / ballGroundSpeed, 0, actualMoveZ / ballGroundSpeed);
              _ballRollAxis.set(-_ballMoveDir.z, 0, _ballMoveDir.x);
              const rollAngle = (ballGroundSpeed / ballRadius) * dt;
              ballMesh.rotateOnWorldAxis(_ballRollAxis, rollAngle);

              // Subtle grass puff on high-speed sprint knock-on touches
              if (isSprintDribble && strideTouchPulse > 0.14 && Math.random() < 0.25) {
                spawnParticles(ballX, 0.05, ballZ, 2, 0x15803d, 1.6);
              }
            }
          } else if (isFollowingCornerTrajectory && cornerTrajectorySpline) {
            cornerTrajectoryProgress += dt / Math.max(0.1, cornerTrajectoryDuration);
            if (cornerTrajectoryProgress < 1.0) {
              const pt = cornerTrajectorySpline.getPoint(cornerTrajectoryProgress);
              const tangent = cornerTrajectorySpline.getTangent(cornerTrajectoryProgress);
              ballX = pt.x;
              ballY = Math.max(ballRadius, pt.y);
              ballZ = pt.z;
              ballVX = tangent.x * 24;
              ballVY = tangent.y * 24;
              ballVZ = tangent.z * 24;

              const curlSign = cornerZSignCurrent > 0 ? -1 : 1;
              ballMesh.rotation.y += dt * 32 * curlSign;
              ballMesh.rotation.x += dt * 25;

              if (Math.random() < 0.65) {
                spawnParticles(ballX, ballY, ballZ, 1, 0xfacc15, 1.8);
              }

              // Contest in the box
              if (cornerTrajectoryProgress >= 0.82) {
                const targetBoxX = cornerTargetLandingPos.x;
                const targetBoxZ = cornerTargetLandingPos.z;

                if (cornerIsOlimpico) {
                  const gk = cornerAttackingTeam === 'HOME' ? players[7] : players[0];
                  gk.gkDiveDir = cornerZSignCurrent > 0 ? 1 : -1;
                  gk.kickTimer = 0.45;
                  cameraShakeIntensity = 0.45;
                } else {
                  const attackers = cornerAttackingTeam === 'HOME'
                    ? [players[6], players[4], players[3]]
                    : [players[13], players[11], players[10]];

                  let nearestAttacker: SimPlayer = attackers[0];
                  let minDist = 999;
                  attackers.forEach((att) => {
                    const d = Math.hypot(att.x - targetBoxX, att.z - targetBoxZ);
                    if (d < minDist) {
                      minDist = d;
                      nearestAttacker = att;
                    }
                  });

                  if (nearestAttacker && minDist < 3.8) {
                    nearestAttacker.kickTimer = 0.35;
                    if (cornerTrajectoryProgress >= 0.92) {
                      isFollowingCornerTrajectory = false;
                      soundEngine.playKick(1.0);
                      spawnParticles(ballX, ballY, ballZ, 14, 0xffffff, 4.2);
                      executeShot(nearestAttacker, 0.88 + Math.random() * 0.12);
                      aiCurrentAction = `${nearestAttacker.name} Powerful Header on Goal!`;
                    }
                  }
                }
              }
            } else {
              isFollowingCornerTrajectory = false;
            }
          } else {
            ballX += ballVX * dt;
            ballZ += ballVZ * dt;
            ballY += ballVY * dt;

            // High-Velocity Ball Flight Aerodynamic Spark Trail
            const flightSpeed = Math.hypot(ballVX, ballVZ);
            if (flightSpeed > 17 && Math.random() < 0.55) {
              spawnParticles(
                ballX,
                ballY,
                ballZ,
                1,
                lastTouchTeam === 'HOME' ? 0xfacc15 : 0x38bdf8,
                1.4
              );
            }

            if (ballY > ballRadius) {
              ballVY -= 21.5 * dt;
              ballVX *= 1 - 0.18 * dt;
              ballVZ *= 1 - 0.18 * dt;
            } else {
              ballY = ballRadius;
              if (Math.abs(ballVY) > 2.2) {
                ballVY = -ballVY * 0.52;
                soundEngine.playKick(0.26);
              } else {
                ballVY = 0;
              }
              const friction = Math.pow(0.22, dt);
              ballVX *= friction;
              ballVZ *= friction;
            }

            const freeBallSpd = Math.hypot(ballVX, ballVZ);
            if (freeBallSpd > 0.15) {
              _ballMoveDir.set(ballVX / freeBallSpd, 0, ballVZ / freeBallSpd);
              _ballRollAxis.set(-_ballMoveDir.z, 0, _ballMoveDir.x);
              const rollAngle = (freeBallSpd / ballRadius) * dt;
              ballMesh.rotateOnWorldAxis(_ballRollAxis, rollAngle);
            }

            const inGoalMouthZ = Math.abs(ballZ) < GOAL_HALF_WIDTH;
            const underCrossbarY = ballY < GOAL_HEIGHT;

            // Crossbar / Post Collision
            if (
              Math.abs(Math.abs(ballX) - PITCH_HALF_W) < 0.48 &&
              ((Math.abs(Math.abs(ballZ) - GOAL_HALF_WIDTH) < 0.35 &&
                ballY <= GOAL_HEIGHT + 0.25) ||
                (inGoalMouthZ && Math.abs(ballY - GOAL_HEIGHT) < 0.32))
            ) {
              ballVX = -ballVX * 0.72;
              ballVZ += (Math.random() - 0.5) * 8;
              hitstopTimer = 0.045;
              cameraShakeIntensity = 0.42;
              soundEngine.playPostHit();
              spawnParticles(ballX, ballY, ballZ, 18, 0xffffff, 6.5);
              aiCurrentAction = 'WOODWORK! Struck the Frame!';
            }

            // Ball Crossed Goal Line (Goal, Goal Kick, or Corner Kick!)
            if (Math.abs(ballX) > PITCH_HALF_W + 0.25) {
              if (inGoalMouthZ && underCrossbarY) {
                const scoredByHome = ballX > 0;
                if (scoredByHome) {
                  homeScore++;
                  lastScorerTeam = 'HOME';
                  lastScorerName =
                    players[activeHomeIdx]?.name || equipmentRef.current.starName;
                  netRippleSide = 1;
                  momentum = 55;
                } else {
                  awayScore++;
                  lastScorerTeam = 'AWAY';
                  lastScorerName =
                    players[activeAwayIdx]?.name || closestAway.name || 'HAALAND';
                  netRippleSide = -1;
                  momentum = -55;
                }

                netRippleTimer = 2.0;
                cameraShakeIntensity = 0.72;
                // 0.9s live celebration + 4.3s Slow-Mo 3D Action Goal Replay!
                goalResetTimer = 5.2;
                goalScoredElapsed = 0;
                activeReplayFrames = replayRingBuffer.slice(-115);
                replayCursor = 0;
                isPlayingGoalReplay = false;
                ballVX *= 0.18;
                ballVZ *= 0.18;

                evaluateDynamicTacticalAdaptation();

                soundEngine.playWhistle('goal');
                soundEngine.playGoalRoar();
                spawnParticles(
                  scoredByHome ? PITCH_HALF_W : -PITCH_HALF_W,
                  1.8,
                  ballZ,
                  60,
                  scoredByHome ? 0xfacc15 : 0x38bdf8,
                  11.5
                );

                callbacksRef.current.onGoalScored(
                  lastScorerName,
                  scoredByHome ? 'HOME' : 'AWAY',
                  homeScore,
                  awayScore
                );
              } else {
                // Ball missed the goal over the endline -> Award GOAL KICK or CORNER KICK!
                if (Math.abs(ballZ) < GOAL_HALF_WIDTH + 2.5) {
                  soundEngine.playCrowdGasp();
                }

                const wentOutRightEnd = ballX > 0; // Right end is defended by AWAY
                const defendingTeam: 'HOME' | 'AWAY' = wentOutRightEnd
                  ? 'AWAY'
                  : 'HOME';
                const attackingTeam: 'HOME' | 'AWAY' = wentOutRightEnd
                  ? 'HOME'
                  : 'AWAY';
                const sideSign: -1 | 1 = ballZ >= 0 ? 1 : -1;

                if (lastTouchTeam === defendingTeam) {
                  // Defending team / GK touched it last -> CORNER KICK!
                  setupCornerKick(attackingTeam, sideSign);
                } else {
                  // Attacking team shot wide -> GOAL KICK!
                  setupGoalKick(defendingTeam, sideSign);
                }
              }
            }

            if (Math.abs(ballZ) > PITCH_HALF_Z) {
              ballZ = Math.sign(ballZ) * (PITCH_HALF_Z - 0.2);
              ballVZ = -ballVZ * 0.65;
            }
          }

          ballMesh.position.set(ballX, ballY, ballZ);
          ballShadow.position.set(ballX, 0.018, ballZ);
          const shadowScale = Math.max(0.35, 1 - (ballY - ballRadius) * 0.14);
          ballShadow.scale.set(shadowScale, shadowScale, 1);

          // Update 3D Aerodynamic Shot Velocity Ribbon Trail
          for (let ti = TRAIL_POINTS - 1; ti > 0; ti--) {
            ballTrailHistory[ti].copy(ballTrailHistory[ti - 1]);
          }
          ballTrailHistory[0].set(ballX, ballY, ballZ);
          const currentBallFlightSpd = !ballOwner ? Math.hypot(ballVX, ballVZ) : 0;
          if (currentBallFlightSpd > 19) {
            ballTrailGeo.setFromPoints(ballTrailHistory);
            ballTrailMat.color.setHex(
              lastTouchTeam === 'HOME' ? 0xfacc15 : 0x38bdf8
            );
            ballTrailMat.opacity = Math.min(0.85, (currentBallFlightSpd - 18) / 28);
          } else {
            ballTrailMat.opacity = THREE.MathUtils.damp(
              ballTrailMat.opacity,
              0,
              14,
              dt
            );
          }

          // Record live frame into 60fps Replay Ring Buffer
          if (goalResetTimer <= 0) {
            replayRingBuffer.push({
              bx: ballX,
              by: ballY,
              bz: ballZ,
              brx: ballMesh.rotation.x,
              brz: ballMesh.rotation.z,
              players: players.map((p) => ({
                x: p.x,
                z: p.z,
                fa: p.parts.root.rotation.y,
                sp: p.stridePhase,
                spd: Math.hypot(p.vx, p.vz),
                kt: p.kickTimer,
                sk: p.activeSkill,
                skp:
                  p.activeSkill && p.skillTimer > 0
                    ? 1 - p.skillTimer / Math.max(0.1, p.skillDuration)
                    : 0,
                gkd: p.gkDiveDir,
                tb: p.turnBank,
                slp:
                  p.slideTimer > 0
                    ? 1 - p.slideTimer / Math.max(0.01, p.slideDuration)
                    : 0,
              })),
            });
            if (replayRingBuffer.length > MAX_REPLAY_FRAMES) {
              replayRingBuffer.shift();
            }
          }

          // Broadcast Authoritative Online Match State at 30Hz if Online Host
          if (
            currentMode === 'ONLINE_MULTIPLAYER' &&
            currentOnlineRole === 'HOME' &&
            callbacksRef.current.onBroadcastMatchState
          ) {
            netSyncTimer += dt;
            if (netSyncTimer >= 0.033) {
              netSyncTimer = 0;
              callbacksRef.current.onBroadcastMatchState({
                bx: Number(ballX.toFixed(2)),
                by: Number(ballY.toFixed(2)),
                bz: Number(ballZ.toFixed(2)),
                bvx: Number(ballVX.toFixed(2)),
                bvy: Number(ballVY.toFixed(2)),
                bvz: Number(ballVZ.toFixed(2)),
                ownerId: ballOwner ? ballOwner.id : null,
                activeHomeIdx,
                activeAwayIdx,
                homeScore,
                awayScore,
                clock: Number(matchClockSeconds.toFixed(2)),
                half: currentHalf,
                homeShots,
                awayShots,
                homePasses,
                awayPasses,
                homeTackles,
                awayTackles,
                homeCorners,
                awayCorners,
                homeXG,
                awayXG,
                momentum: Math.round(momentum),
                aiAction: aiCurrentAction,
                banner: aiTacticalAdaptationBanner,
                setPieceBanner,
                players: players.map((p) => ({
                  x: Number(p.x.toFixed(2)),
                  z: Number(p.z.toFixed(2)),
                  vx: Number(p.vx.toFixed(2)),
                  vz: Number(p.vz.toFixed(2)),
                  fa: Number(p.facingAngle.toFixed(2)),
                  kt: Number(p.kickTimer.toFixed(2)),
                  st: Math.round(p.stamina),
                  sk: p.activeSkill,
                  skt: Number(p.skillTimer.toFixed(2)),
                  gkd: Number(p.gkDiveDir.toFixed(2)),
                })),
              });
            }
          }

          if (tactics.showTacticalTelemetry && ballOwner && ballOwner.isHome) {
            const { mate: bestMate } = evaluateBestPassOption(ballOwner, false);
            if (bestMate) {
              tacticalLine.visible = true;
              const posArr = tacticalLine.geometry.attributes.position
                .array as Float32Array;
              posArr[0] = ballOwner.x;
              posArr[1] = 0.06;
              posArr[2] = ballOwner.z;
              posArr[3] = bestMate.x;
              posArr[4] = 0.06;
              posArr[5] = bestMate.z;
              tacticalLine.geometry.attributes.position.needsUpdate = true;
              tacticalLine.computeLineDistances();

              tacticalTargetRing.visible = true;
              tacticalTargetRing.position.set(bestMate.x, 0.035, bestMate.z);
              tacticalTargetRing.rotation.z = elapsedTime * 2.5;
            } else {
              tacticalLine.visible = false;
              tacticalTargetRing.visible = false;
            }
          } else {
            tacticalLine.visible = false;
            tacticalTargetRing.visible = false;
          }
        } else {
          tacticalLine.visible = false;
          tacticalTargetRing.visible = false;

          if (currentScreen === 'CUSTOMIZER') {
            const hero = players[4];
            hero.parts.root.position.set(0, 0, 0);
            hero.parts.root.rotation.y = customizerOrbitAngle;
            animatePlayerKinematics(
              hero.parts,
              0,
              0,
              0,
              true,
              false,
              elapsedTime
            );
            ballMesh.position.set(0.55, ballRadius, 0.35);
            ballShadow.position.set(0.55, 0.018, 0.35);
            ballMesh.rotation.y = elapsedTime * 0.8;
          } else if (
            currentScreen === 'TITLE' ||
            currentScreen === 'ONLINE_LOBBY'
          ) {
            players.forEach((p, idx) => {
              animatePlayerKinematics(
                p.parts,
                1.4,
                elapsedTime * 2.8 + idx,
                0,
                idx === 4,
                false,
                elapsedTime
              );
            });
          }
        }
      }

      stadium.homeManagerGroup.position.x = -8.5 + Math.sin(elapsedTime * 1.4) * 1.8;
      stadium.homeManagerGroup.rotation.y = Math.atan2(
        ballX - stadium.homeManagerGroup.position.x,
        ballZ - stadium.homeManagerGroup.position.z
      );
      stadium.awayManagerGroup.position.x = 8.5 + Math.cos(elapsedTime * 1.6) * 1.8;
      stadium.awayManagerGroup.rotation.y = Math.atan2(
        ballX - stadium.awayManagerGroup.position.x,
        ballZ - stadium.awayManagerGroup.position.z
      );

      if (netRippleTimer > 0) {
        netRippleTimer = Math.max(0, netRippleTimer - dt);
        const nets =
          netRippleSide === 1
            ? stadium.rightGoalNetMeshes
            : stadium.leftGoalNetMeshes;
        const rippleScale =
          1 + Math.sin(netRippleTimer * 28) * 0.14 * netRippleTimer;
        nets.forEach((n) => {
          n.scale.set(1, rippleScale, rippleScale);
        });
      }

      stadium.cornerFlags.forEach((flag, idx) => {
        flag.rotation.y = Math.sin(elapsedTime * 5.5 + idx) * 0.28;
      });

      let anyParticleUpdated = false;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particlePool[i];
        if (p.active) {
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
            _dummyMatrix.position.set(0, -20, 0);
            _dummyMatrix.scale.set(0.001, 0.001, 0.001);
          } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vy -= 14.5 * dt;
            if (p.y < 0.05) {
              p.y = 0.05;
              p.vy = -p.vy * 0.4;
            }
            const s = p.scale * (1 - p.life / p.maxLife);
            _dummyMatrix.position.set(p.x, p.y, p.z);
            _dummyMatrix.rotation.set(p.life * 8, p.life * 6, 0);
            _dummyMatrix.scale.set(s, s, s);
          }
          _dummyMatrix.updateMatrix();
          particleInstanced.setMatrixAt(i, _dummyMatrix.matrix);
          anyParticleUpdated = true;
        }
      }
      if (anyParticleUpdated) {
        particleInstanced.instanceMatrix.needsUpdate = true;
      }

      if (graphicsRef.current.crowdAnimation) {
        const excitementBoost = Math.min(1, Math.abs(ballX) / PITCH_HALF_W);
        const cheerMult =
          goalResetTimer > 0 ? 0.58 : 0.12 + excitementBoost * 0.18;
        const cheerFreq = goalResetTimer > 0 ? 11.5 : 4.2 + excitementBoost * 3.0;
        const baseArr = stadium.crowdBasePositions;
        const frameParity = Math.floor(elapsedTime * 60) % 3;
        for (let i = frameParity; i < 1800; i += 3) {
          const bx = baseArr[i * 4 + 0];
          const by = baseArr[i * 4 + 1];
          const bz = baseArr[i * 4 + 2];
          const phase = baseArr[i * 4 + 3];
          const waveAngle = Math.atan2(bz, bx);
          const wavePulse =
            Math.max(0, Math.sin(waveAngle * 2 - elapsedTime * 2.4)) * 0.18;
          const jumpY =
            by +
            Math.max(0, Math.sin(elapsedTime * cheerFreq + phase)) * cheerMult +
            wavePulse;
          _dummyMatrix.position.set(bx, jumpY, bz);
          _dummyMatrix.rotation.set(0, 0, 0);
          _dummyMatrix.scale.set(1, 1, 1);
          _dummyMatrix.updateMatrix();
          stadium.crowdInstancedMesh.setMatrixAt(i, _dummyMatrix.matrix);
        }
        stadium.crowdInstancedMesh.instanceMatrix.needsUpdate = true;

        const flagArr = stadium.supporterFlagsBase;
        for (let f = 0; f < 48; f++) {
          const fx = flagArr[f * 4 + 0];
          const fy = flagArr[f * 4 + 1];
          const fz = flagArr[f * 4 + 2];
          const fPhase = flagArr[f * 4 + 3];
          const isWest = f % 2 === 0;
          _dummyMatrix.position.set(fx, fy, fz);
          _dummyMatrix.rotation.set(
            Math.sin(elapsedTime * 4.5 + fPhase) * 0.35,
            (isWest ? Math.PI / 2 : -Math.PI / 2) +
              Math.cos(elapsedTime * 3.8 + fPhase) * 0.42,
            0
          );
          _dummyMatrix.scale.set(1, 1, 1);
          _dummyMatrix.updateMatrix();
          stadium.supporterFlagsMesh.setMatrixAt(f, _dummyMatrix.matrix);
        }
        stadium.supporterFlagsMesh.instanceMatrix.needsUpdate = true;
      }

      // Adaptive aspect-ratio scaling so iPad (4:3 & portrait) fits the pitch while staying well inside the enlarged stadium bowl
      const aspectScale = THREE.MathUtils.clamp(
        1.62 / Math.max(0.75, camera.aspect),
        1.0,
        1.18
      );
      const isIpadHUD = graphicsRef.current.ipadControls;

      if (currentScreen === 'TITLE' || currentScreen === 'ONLINE_LOBBY') {
        const orbitAngle = elapsedTime * 0.16;
        _camIdealPos.set(
          Math.sin(orbitAngle) * 32,
          17.5 + Math.sin(elapsedTime * 0.35) * 2.5,
          Math.cos(orbitAngle) * 34
        );
        _camIdealLook.set(0, 4.5, 0);
      } else if (currentScreen === 'CUSTOMIZER') {
        const zoom = customizerZoomRef.current;
        if (zoom === 'BOOTS') {
          _camIdealPos.set(0.15, 0.52, 1.85 * aspectScale);
          _camIdealLook.set(0, 0.22, 0);
        } else if (zoom === 'HEADGEAR') {
          _camIdealPos.set(0, 1.92, 1.55 * aspectScale);
          _camIdealLook.set(0, 1.84, 0);
        } else if (zoom === 'UPPER_KIT') {
          _camIdealPos.set(0, 1.32, 2.25 * aspectScale);
          _camIdealLook.set(0, 1.22, 0);
        } else if (zoom === 'BALL') {
          _camIdealPos.set(0.55, 0.65, 1.55 * aspectScale);
          _camIdealLook.set(0.55, 0.34, 0.35);
        } else {
          _camIdealPos.set(0.2, 1.25, 3.25 * aspectScale);
          _camIdealLook.set(0.1, 1.02, 0);
        }
      } else if (isPlayingGoalReplay && goalResetTimer > 0) {
        // Dramatic Low-Angle Broadcast Action Replay Camera orbiting the goal mouth!
        const goalSign = lastScorerTeam === 'HOME' ? 1 : -1;
        const replayProg =
          activeReplayFrames.length > 1
            ? replayCursor / (activeReplayFrames.length - 1)
            : 0;
        const orbitSweep = (replayProg - 0.5) * 0.95;
        _camIdealPos.set(
          goalSign * (PITCH_HALF_W - 15.5) - goalSign * Math.cos(orbitSweep) * 8.5,
          5.2 + Math.sin(replayProg * Math.PI) * 1.8,
          ballZ * 0.55 + Math.sin(orbitSweep) * 14.5 + 6.5
        );
        _camIdealLook.set(
          THREE.MathUtils.lerp(ballX, goalSign * PITCH_HALF_W, 0.35),
          1.15,
          ballZ * 0.65
        );
      } else if (activeSetPieceType === 'CORNER' && isUserCornerActive && cornerTakerPlayer) {
        // FIRST-PERSON VIEW of Corner Kick Taker looking directly across the penalty box & goal mouth!
        const goalSideSign = cornerAttackingTeam === 'HOME' ? 1 : -1;
        const zSign = cornerZSignCurrent;
        _camIdealPos.set(
          cornerTakerPlayer.x - goalSideSign * 0.22,
          1.70,
          cornerTakerPlayer.z - zSign * 0.22
        );
        _camIdealLook.set(
          goalSideSign * (PITCH_HALF_W - 8.5),
          1.25,
          zSign * 3.5
        );
        cornerTakerPlayer.parts.root.visible = false;
        camera.fov = 54;
        camera.updateProjectionMatrix();
      } else if (isFollowingCornerTrajectory) {
        // Dramatic follow-cam tracking the whipped corner kick soaring into the box!
        const goalSideSign = cornerAttackingTeam === 'HOME' ? 1 : -1;
        _camIdealPos.set(
          ballX - goalSideSign * 11.5,
          9.8 * aspectScale,
          ballZ * 0.65 + 13.5
        );
        _camIdealLook.set(
          goalSideSign * (PITCH_HALF_W - 7.0),
          1.2,
          ballZ * 0.3
        );
      } else {
        if (cornerTakerPlayer && !isUserCornerActive) {
          cornerTakerPlayer.parts.root.visible = true;
        }
        const camStyle = graphicsRef.current.cameraAngle;
        const ipadZOffset = isIpadHUD ? 1.8 : 0;
        const ipadLookZOffset = isIpadHUD ? 1.8 : 0;
        if (camStyle === 'broadcast_tele') {
          _camIdealPos.set(
            ballX * 0.65,
            21.5 * aspectScale,
            (32.5 + ballZ * 0.26) * aspectScale + ipadZOffset
          );
          _camIdealLook.set(ballX * 0.75, 0.4, ballZ * 0.45 + ipadLookZOffset);
        } else if (camStyle === 'pro_end_to_end') {
          const isAwayView =
            currentMode === 'ONLINE_MULTIPLAYER' && currentOnlineRole === 'AWAY';
          const activeP = isAwayView
            ? players[activeAwayIdx] || players[11]
            : players[activeHomeIdx] || players[4];
          const camOffsetDir = (isAwayView ? 14.5 : -14.5) * aspectScale;
          _camIdealPos.set(
            activeP.x + camOffsetDir,
            9.2 * aspectScale,
            activeP.z * 0.85
          );
          _camIdealLook.set(ballX + (isAwayView ? -8 : 8), 1.0, ballZ);
        } else if (camStyle === 'tactical_overhead') {
          _camIdealPos.set(ballX * 0.35, 48.0 * aspectScale, 12.0 * aspectScale);
          _camIdealLook.set(ballX * 0.35, 0, ipadLookZOffset);
        } else {
          _camIdealPos.set(
            ballX * 0.82,
            7.8 * aspectScale,
            25.0 * aspectScale + ipadZOffset
          );
          _camIdealLook.set(ballX, 1.0, ballZ * 0.65 + ipadLookZOffset);
        }
      }

      const camDamp = isPlayingGoalReplay
        ? 9.5
        : (activeSetPieceType === 'CORNER' && isUserCornerActive)
        ? 12.0
        : 5.5;
      currentCamPos.x = THREE.MathUtils.damp(currentCamPos.x, _camIdealPos.x, camDamp, dt);
      currentCamPos.y = THREE.MathUtils.damp(currentCamPos.y, _camIdealPos.y, camDamp, dt);
      currentCamPos.z = THREE.MathUtils.damp(currentCamPos.z, _camIdealPos.z, camDamp, dt);

      currentCamLook.x = THREE.MathUtils.damp(currentCamLook.x, _camIdealLook.x, 8.5, dt);
      currentCamLook.y = THREE.MathUtils.damp(currentCamLook.y, _camIdealLook.y, 8.5, dt);
      currentCamLook.z = THREE.MathUtils.damp(currentCamLook.z, _camIdealLook.z, 8.5, dt);

      if (cameraShakeIntensity > 0.005) {
        cameraShakeIntensity = THREE.MathUtils.damp(cameraShakeIntensity, 0, 7, dt);
        camera.position.set(
          currentCamPos.x + (Math.random() - 0.5) * cameraShakeIntensity,
          currentCamPos.y + (Math.random() - 0.5) * cameraShakeIntensity,
          currentCamPos.z + (Math.random() - 0.5) * cameraShakeIntensity
        );
      } else {
        camera.position.copy(currentCamPos);
      }
      camera.lookAt(currentCamLook);

      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.085) {
        hudSyncTimer = 0;
        const isAwayUser =
          currentMode === 'ONLINE_MULTIPLAYER' && currentOnlineRole === 'AWAY';
        const activeP = isAwayUser
          ? players[activeAwayIdx] || players[11]
          : players[activeHomeIdx] || players[4];
        const activeSkillSpec = activeP.activeSkill
          ? SKILL_MOVES_CATALOG[activeP.activeSkill]
          : null;

        const replayPct =
          isPlayingGoalReplay && activeReplayFrames.length > 1
            ? Math.min(100, Math.round((replayCursor / (activeReplayFrames.length - 1)) * 100))
            : 0;

        const isUserSprintingNow = Boolean(
          shiftModifierActive ||
            heldKeys.has('ShiftLeft') ||
            heldKeys.has('ShiftRight') ||
            heldKeys.has('KeyR') ||
            touchInputRef.current.sprintHeld
        );

        callbacksRef.current.onStatsUpdate({
          homeScore,
          awayScore,
          matchClockSeconds,
          currentHalf,
          homePossessionFrames,
          awayPossessionFrames,
          homeShots,
          awayShots,
          homePasses,
          awayPasses,
          homeTackles,
          awayTackles,
          homeCorners,
          awayCorners,
          homeXG,
          awayXG,
          momentum: Math.round(momentum),
          lastScorerName,
          lastScorerTeam,
          activePlayerName: activeP.name,
          activePlayerNumber: activeP.squadNumber,
          activePlayerStamina: Math.round(activeP.stamina),
          activePlayerOvr: activeP.ovr,
          activePlayerPace: activeP.pace,
          activePlayerShooting: activeP.shooting,
          isSprinting: isUserSprintingNow,
          activeSkillMoveName: activeSkillSpec ? activeSkillSpec.name : null,
          setPieceBanner,
          shotPowerCharge: Math.round(
            isAwayUser ? guestShotPowerCharge : shotPowerCharge
          ),
          aiCurrentAction,
          aiTacticalAdaptationBanner,
          awayFormation,
          awayMentality,
          isGoalReplay: goalResetTimer > 0,
          goalReplayProgress: replayPct,
          userHasBall: Boolean(
            ballOwner && (isAwayUser ? !ballOwner.isHome : ballOwner.isHome)
          ),
          isCornerKickActive: activeSetPieceType === 'CORNER',
          isUserCornerKick: activeSetPieceType === 'CORNER' && isUserCornerActive,
          cornerTakerName:
            cornerTakerPlayer?.name ||
            (cornerAttackingTeam === 'HOME' ? 'VINICIUS JR' : 'FODEN'),
          cornerKickTeam: cornerAttackingTeam,
          cornerZSign: cornerZSignCurrent,
        });
      }

      if (bloomPass.enabled) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    resetPositionsToKickOff('HOME');
    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMovePitch);
      window.removeEventListener('touchend', onTouchEndPitch);
      window.removeEventListener('touchcancel', onTouchEndPitch);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('touchstart', onTouchStartPitch);
      composer.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#05080F]"
      aria-label="FC 26 HyperMotion V 3D Stadium Viewport"
    />
  );
};

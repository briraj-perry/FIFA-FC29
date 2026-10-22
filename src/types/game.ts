export type GameScreenState =
  | 'LOGIN'
  | 'MENU'
  | 'TEAM_MANAGEMENT'
  | 'PLAYER_DRAFT'
  | 'TITLE'
  | 'CUSTOMIZER'
  | 'ONLINE_LOBBY'
  | 'PLAYING'
  | 'HALF_TIME'
  | 'PAUSED'
  | 'GOAL_CELEBRATION'
  | 'FULL_TIME';

export type GameMode = 'PLAYER_VS_AI' | 'AI_VS_AI' | 'ONLINE_MULTIPLAYER';

export type SkillMoveId =
  | 'elastico'
  | 'roulette'
  | 'stepover_burst'
  | 'rainbow_flick';

export interface SkillMoveSpec {
  id: SkillMoveId;
  name: string;
  keyHint: string;
  staminaCost: number;
  duration: number;
  speedBurstMult: number;
  stunRadius: number;
  description: string;
}

export const SKILL_MOVES_CATALOG: Record<SkillMoveId, SkillMoveSpec> = {
  elastico: {
    id: 'elastico',
    name: 'Elastico Flip-Flap',
    keyHint: '1 / Z',
    staminaCost: 9,
    duration: 0.42,
    speedBurstMult: 1.38,
    stunRadius: 3.6,
    description: 'Whip ball outside-to-inside to wrong-foot nearby defenders.',
  },
  roulette: {
    id: 'roulette',
    name: 'Zidane 360° Roulette',
    keyHint: '2 / X',
    staminaCost: 10,
    duration: 0.48,
    speedBurstMult: 1.32,
    stunRadius: 3.8,
    description: '360-degree drag-back spin shielding the ball through traffic.',
  },
  stepover_burst: {
    id: 'stepover_burst',
    name: 'Stepover Speed Burst',
    keyHint: '3 / V',
    staminaCost: 8,
    duration: 0.38,
    speedBurstMult: 1.48,
    stunRadius: 3.3,
    description: 'Rapid scissors feint followed by an explosive sprint knock-on.',
  },
  rainbow_flick: {
    id: 'rainbow_flick',
    name: 'Neymar Rainbow Flick',
    keyHint: '4 / B',
    staminaCost: 12,
    duration: 0.52,
    speedBurstMult: 1.34,
    stunRadius: 4.0,
    description: 'Arc the ball overhead over sliding or pressing defenders.',
  },
};

export interface TouchControllerInput {
  moveX: number; // -1 to 1 from virtual thumbstick
  moveZ: number; // -1 to 1 from virtual thumbstick
  sprintHeld: boolean;
  closeDribbleHeld: boolean;
  shootCharging: boolean;
  pendingPass: boolean;
  pendingUpperPass?: boolean;
  pendingSlideTackle?: boolean;
  pendingThroughBall: boolean;
  pendingShootRelease: boolean;
  pendingSkillMove: SkillMoveId | null;
  pendingSwitchPlayer: boolean;
  pendingCornerKick?: boolean;
  cornerPreset?: 'NEAR_POST' | 'PENALTY_SPOT' | 'FAR_POST' | 'OLIMPICO' | null;
  cornerArcHeight?: 'LOW' | 'MEDIUM' | 'HIGH';
  cornerPathPoints?: Array<{ x: number; y: number }>;
}

export interface OnlineChatMessage {
  id: string;
  sender: string;
  role: 'HOME' | 'AWAY' | 'SPECTATOR';
  text: string;
  timestamp: number;
}

export interface OnlineRoomSummary {
  roomId: string;
  stadium: string;
  status: 'WAITING' | 'PLAYING';
  hostName: string;
  guestName: string | null;
  playerCount: number;
  chatMessages: OnlineChatMessage[];
}

export interface FriendRequestItem {
  id: string;
  fromClientId: string;
  fromName: string;
  toName: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  timestamp: number;
}

export interface AcceptedFriendItem {
  name: string;
  friendName?: string;
  clientId: string | null;
  friendClientId?: string;
  friendOvr?: string;
  online: boolean;
  roomId: string | null;
  lastSeenAt: number;
}

export interface OnlinePlayerSearchResult {
  name: string;
  playerName?: string;
  clubName?: string;
  squadOvr?: string;
  clientId: string;
  online: boolean;
  roomId: string | null;
  isFriend: boolean;
  requestPending: boolean;
}

export interface MatchInviteItem {
  id: string;
  fromName: string;
  roomId: string;
  stadium: string;
  timestamp: number;
}

export interface OnlineSessionState {
  connected: boolean;
  roomId: string | null;
  role: 'HOME' | 'AWAY' | 'SPECTATOR';
  playerName: string;
  latencyMs: number;
  room: OnlineRoomSummary | null;
  incomingRequests?: FriendRequestItem[];
  outgoingRequests?: FriendRequestItem[];
  friends?: AcceptedFriendItem[];
  matchInvites?: MatchInviteItem[];
}

export type StadiumId =
  | 'santiago_bernabeu'
  | 'wembley_arch'
  | 'allianz_arena'
  | 'san_siro';

export interface StadiumSpec {
  id: StadiumId;
  name: string;
  city: string;
  capacity: string;
  architectureDesc: string;
  turfPattern: 'classic_stripes' | 'wembley_checkered' | 'diamond_radial' | 'italian_tight';
  accentColor: string;
}

export const STADIUM_CATALOG: Record<StadiumId, StadiumSpec> = {
  santiago_bernabeu: {
    id: 'santiago_bernabeu',
    name: 'Estadio Santiago Bernabéu',
    city: 'Madrid, Spain',
    capacity: '85,000',
    architectureDesc: 'Futuristic wrap-around titanium louver facade, 360° halo scoreboard & steep 4-tier bowl.',
    turfPattern: 'classic_stripes',
    accentColor: '#38BDF8',
  },
  wembley_arch: {
    id: 'wembley_arch',
    name: 'Wembley Stadium',
    city: 'London, England',
    capacity: '90,000',
    architectureDesc: 'Iconic 133m illuminated steel lattice arch spanning the North Stand with checkered turf.',
    turfPattern: 'wembley_checkered',
    accentColor: '#F8FAFC',
  },
  allianz_arena: {
    id: 'allianz_arena',
    name: 'Allianz Arena',
    city: 'Munich, Germany',
    capacity: '75,000',
    architectureDesc: '2,760 illuminated ETFE diamond cushions glowing in crimson & alpine white.',
    turfPattern: 'diamond_radial',
    accentColor: '#EF4444',
  },
  san_siro: {
    id: 'san_siro',
    name: 'Stadio San Siro',
    city: 'Milan, Italy',
    capacity: '75,817',
    architectureDesc: '11 iconic cylindrical spiral concrete towers crowned by 4 monumental red steel roof trusses.',
    turfPattern: 'italian_tight',
    accentColor: '#F43F5E',
  },
};

export type BootModelId =
  | 'hypervenom_volt'
  | 'predator_crimson'
  | 'mercurial_cyan'
  | 'phantom_gold'
  | 'stealth_carbon';

export type StudFinishId = 'chrome_gold' | 'anodized_cyan' | 'matte_black';

export type KitPatternId = 'solid' | 'stripes' | 'sash' | 'chevron';

export type HeadgearId = 'none' | 'aero_visor' | 'sweatband' | 'carbon_mask';

export type ArmgearId =
  | 'none'
  | 'wrist_tape'
  | 'neon_bands'
  | 'captain_band'
  | 'thermal_sleeves';

export type SockStyleId = 'standard' | 'high_grip' | 'low_carbon_guard';

export type BallStyleId =
  | 'fc26_orbital'
  | 'champions_gold'
  | 'winter_flare'
  | 'cyber_chrome';

export interface PlayerEquipmentLoadout {
  starName: string;
  starNumber: number;
  bootModel: BootModelId;
  bootStudFinish: StudFinishId;
  kitPattern: KitPatternId;
  kitPrimaryColor: string;
  kitSecondaryColor: string;
  shortsColor: string;
  headgear: HeadgearId;
  armgear: ArmgearId;
  sockStyle: SockStyleId;
  ballStyle: BallStyleId;
}

export type GraphicsPresetId = 'rtx5080_ultra' | 'broadcast_high' | 'competitive_120';

export type WeatherLightingId = 'champions_night' | 'golden_hour' | 'crisp_daylight';

export type CameraAngleId =
  | 'broadcast_tele'
  | 'pro_end_to_end'
  | 'tactical_overhead'
  | 'sideline_cinematic';

export interface GraphicsSettings {
  stadium: StadiumId;
  preset: GraphicsPresetId;
  weatherLighting: WeatherLightingId;
  cameraAngle: CameraAngleId;
  exposure: number; // 0.55 to 1.15 (default 0.76 for rich, non-blown-out dimmer lighting)
  bloomEnabled: boolean;
  bloomStrength: number;
  crowdAnimation: boolean;
  ipadControls: boolean; // Shows on-screen Phone / iPad / Touch virtual thumbstick & skill pad
}

export type FormationId =
  | '4-3-3 Attack'
  | '4-4-2 Classic'
  | '3-5-2 Wingplay'
  | '4-2-3-1 Control'
  | '5-3-2 Counter';

export type MentalityId = 'Tiki-Taka' | 'Gegenpress' | 'Counter-Attack' | 'Ultra Attack';

export interface AITacticalConfig {
  formation: FormationId;
  mentality: MentalityId;
  pressingIntensity: number; // 30 - 95
  attackingPace: number; // 40 - 95
  dynamicAdaptation: boolean; // Automatically adapts formations & strategies to score & game flow
  autoSwitchPlayer: boolean; // Automatically gives user control of the player closest to the ball
  showTacticalTelemetry: boolean;
  aiAssistLevel: 'full_autonomous' | 'hybrid_director' | 'manual_control';
}

export interface MatchStats {
  homeScore: number;
  awayScore: number;
  matchClockSeconds: number; // 0 to 90 (scaled match minutes)
  currentHalf: 1 | 2;
  homePossessionFrames: number;
  awayPossessionFrames: number;
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
  momentum: number; // -100 (Away) to +100 (Home)
  lastScorerName: string;
  lastScorerTeam: 'HOME' | 'AWAY' | null;
  activePlayerName: string;
  activePlayerNumber: number;
  activePlayerStamina: number; // 0 - 100
  activePlayerOvr?: number;
  activePlayerPace?: number;
  activePlayerShooting?: number;
  isSprinting?: boolean;
  activeSkillMoveName: string | null;
  setPieceBanner: string | null;
  shotPowerCharge: number; // 0 - 100
  aiCurrentAction: string;
  aiTacticalAdaptationBanner: string;
  awayFormation: FormationId;
  awayMentality: MentalityId;
  isGoalReplay?: boolean;
  goalReplayProgress?: number;
  userHasBall?: boolean;
  isCornerKickActive?: boolean;
  isUserCornerKick?: boolean;
  cornerTakerName?: string;
  cornerKickTeam?: 'HOME' | 'AWAY' | null;
  cornerZSign?: -1 | 1;
}

export interface AwayKitPalette {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  pattern: KitPatternId;
  label: string;
}

/**
 * Ensures high-contrast Yellow vs Blue kits:
 * - If Home team is Yellow/Gold/Volt -> Away team is Royal Blue (#2563EB)
 * - If Home team is Blue/Cyan -> Away team is Championship Yellow (#FACC15)
 */
export function resolveAwayKitPalette(homeLoadout: PlayerEquipmentLoadout): AwayKitPalette {
  const homeHex = (homeLoadout.kitPrimaryColor || '').toUpperCase();
  const isHomeBlueOrCyan =
    homeHex === '#2563EB' ||
    homeHex === '#1D4ED8' ||
    homeHex === '#00F0FF' ||
    homeHex === '#38BDF8' ||
    homeHex === '#0284C7';

  if (isHomeBlueOrCyan) {
    return {
      primary: '#FACC15', // Championship Yellow
      secondary: '#1E3A8A', // Royal Blue trim
      shorts: '#0F172A', // Deep Navy shorts
      socks: '#FACC15', // Yellow socks
      pattern: 'solid',
      label: 'CHAMPIONSHIP YELLOW',
    };
  }

  // When Home is Yellow (#FACC15, #CCFF00, #D4AF37) or any other color, Away is Royal Blue!
  return {
    primary: '#2563EB', // Royal Blue
    secondary: '#FACC15', // Golden Yellow trim
    shorts: '#1E3A8A', // Deep Royal Blue shorts
    socks: '#2563EB', // Royal Blue socks
    pattern: 'solid',
    label: 'ROYAL BLUE',
  };
}

export interface AICoachInsight {
  coachHeadline: string;
  tacticalAnalysis: string;
  recommendedFormation: FormationId;
  recommendedMentality: MentalityId;
  pressingIntensity: number;
  attackingPace: number;
}

export const BOOT_CATALOG: Record<
  BootModelId,
  { name: string; primaryHex: string; accentHex: string; speedBonus: number; shotBonus: number; desc: string }
> = {
  hypervenom_volt: {
    name: 'HyperVenom V Volt',
    primaryHex: '#CCFF00',
    accentHex: '#0A0E17',
    speedBonus: 6,
    shotBonus: 5,
    desc: 'Acid-lime carbon weave with high-rebound strike zone.',
  },
  predator_crimson: {
    name: 'Predator Elite Strike',
    primaryHex: '#EF4444',
    accentHex: '#F8FAFC',
    speedBonus: 3,
    shotBonus: 9,
    desc: 'Raised rubber swerve fins for maximum shot power & dip.',
  },
  mercurial_cyan: {
    name: 'Mercurial Vapor Cyber',
    primaryHex: '#00F0FF',
    accentHex: '#0F172A',
    speedBonus: 9,
    shotBonus: 4,
    desc: 'Featherweight Flyknit shell engineered for explosive acceleration.',
  },
  phantom_gold: {
    name: 'Phantom GX Ballon d’Or',
    primaryHex: '#F59E0B',
    accentHex: '#FEF3C7',
    speedBonus: 5,
    shotBonus: 7,
    desc: '24K brushed metallic gold finish with micro-textured touch control.',
  },
  stealth_carbon: {
    name: 'Shadow Obsidian Pro',
    primaryHex: '#1E293B',
    accentHex: '#CCFF00',
    speedBonus: 6,
    shotBonus: 6,
    desc: 'Raw matte carbon fiber chassis with iridescent soleplate.',
  },
};

export const DEFAULT_EQUIPMENT: PlayerEquipmentLoadout = {
  starName: 'BELLINGHAM',
  starNumber: 5,
  bootModel: 'hypervenom_volt',
  bootStudFinish: 'chrome_gold',
  kitPattern: 'chevron',
  kitPrimaryColor: '#FACC15', // Championship Yellow (Away automatically becomes Royal Blue #2563EB)
  kitSecondaryColor: '#1E3A8A',
  shortsColor: '#0F172A',
  headgear: 'none',
  armgear: 'wrist_tape',
  sockStyle: 'high_grip',
  ballStyle: 'fc26_orbital',
};

const isTouchCapableDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  stadium: 'santiago_bernabeu',
  preset: 'rtx5080_ultra',
  weatherLighting: 'champions_night',
  cameraAngle: 'broadcast_tele',
  exposure: 0.88, // Natural HDR broadcast lighting with zero player glow
  bloomEnabled: false,
  bloomStrength: 0.03, // Ultra-subtle floodlight halo only when enabled
  crowdAnimation: true,
  ipadControls: isTouchCapableDevice, // Automatically enabled on Phone/iPad/touch, toggleable anytime!
};

export const DEFAULT_AI_TACTICS: AITacticalConfig = {
  formation: '4-3-3 Attack',
  mentality: 'Gegenpress',
  pressingIntensity: 78,
  attackingPace: 82,
  dynamicAdaptation: true,
  autoSwitchPlayer: true, // Automatically switches control when a teammate is close to the ball
  showTacticalTelemetry: true,
  aiAssistLevel: 'manual_control',
};

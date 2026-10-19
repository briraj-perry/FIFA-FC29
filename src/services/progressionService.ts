import {
  CAREER_RANKS,
  CareerRankTier,
  INITIAL_SQUAD_DATABASE,
  SquadPlayer,
  UserCareerProfile,
} from '../types/progression';
import { FormationId } from '../types/game';

const STORAGE_KEY = 'fc26_career_progression_v1';

const INITIAL_STARTERS = [
  'courtois', // Slot 0: GK
  'carvajal', // Slot 1: DEF
  'rudiger',  // Slot 2: DEF
  'valverde', // Slot 3: MID
  'bellingham', // Slot 4: MID (Star)
  'vinicius', // Slot 5: FWD
  'mbappe',   // Slot 6: FWD
];

export const DEFAULT_USER_PROFILE: UserCareerProfile = {
  userId: 'user_sinny_fc26',
  email: 'sinny777@gmail.com',
  displayName: 'Sinny',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=SinnyFC26',
  isLoggedIn: false,
  clubName: 'REAL MADRID / SINNY FC',
  coins: 50000, // Start with 50,000 coins + earn 10,000 coins every match win!
  xp: 0,
  level: 1,
  rankTitle: 'Beginner I',
  ovrBonus: 0.0,
  matchesPlayed: 0,
  matchesWon: 0,
  matchesDrawn: 0,
  matchesLost: 0,
  goalsScored: 0,
  cleanSheets: 0,
  activeFormation: '4-3-3 Attack',
  starterPlayerIds: [...INITIAL_STARTERS],
  unlockedPlayerIds: [...INITIAL_STARTERS],
};

export interface TenPackDrawResultItem {
  player: SquadPlayer;
  isNewUnlock: boolean;
  isGuaranteedGoodPick: boolean;
  isGuaranteedHighlight?: boolean;
}

export class ProgressionService {
  private static cachedProfile: UserCareerProfile | null = null;

  public static getProfile(): UserCareerProfile {
    if (this.cachedProfile) return this.cachedProfile;

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as UserCareerProfile;
        // Backfill coins and unlockedPlayerIds for existing profiles
        if (typeof parsed.coins !== 'number' || Number.isNaN(parsed.coins)) {
          parsed.coins = 50000 + (parsed.matchesWon || 0) * 10000;
        }
        if (!Array.isArray(parsed.unlockedPlayerIds) || parsed.unlockedPlayerIds.length === 0) {
          parsed.unlockedPlayerIds = Array.from(
            new Set([...INITIAL_STARTERS, ...(parsed.starterPlayerIds || [])])
          );
        }
        this.cachedProfile = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse career progression from localStorage', e);
    }

    this.cachedProfile = {
      ...DEFAULT_USER_PROFILE,
      starterPlayerIds: [...INITIAL_STARTERS],
      unlockedPlayerIds: [...INITIAL_STARTERS],
    };
    this.saveProfile(this.cachedProfile);
    return this.cachedProfile;
  }

  public static saveProfile(profile: UserCareerProfile): void {
    this.cachedProfile = profile;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('Failed to save career progression to localStorage', e);
    }
  }

  public static getRankForXp(xp: number): CareerRankTier {
    for (let i = CAREER_RANKS.length - 1; i >= 0; i--) {
      if (xp >= CAREER_RANKS[i].minXp) {
        return CAREER_RANKS[i];
      }
    }
    return CAREER_RANKS[0]; // Beginner I
  }

  public static getPlayerById(id: string): SquadPlayer | undefined {
    return INITIAL_SQUAD_DATABASE.find((p) => p.id === id);
  }

  public static getAllSquadPlayers(): SquadPlayer[] {
    return [...INITIAL_SQUAD_DATABASE];
  }

  public static getUnlockedSquadPlayers(profile?: UserCareerProfile): SquadPlayer[] {
    const prof = profile || this.getProfile();
    const unlockedSet = new Set([
      ...(prof.unlockedPlayerIds || []),
      ...(prof.starterPlayerIds || []),
    ]);
    return INITIAL_SQUAD_DATABASE.filter((p) => unlockedSet.has(p.id));
  }

  public static getPlayerPrice(player: SquadPlayer): number {
    if (typeof player.coinPrice === 'number') return player.coinPrice;
    if (player.baseOvr >= 118) return 45000;
    if (player.baseOvr >= 92) return 15000;
    if (player.baseOvr >= 88) return 10000;
    return 5000; // Lower OVR players (72-86 OVR) cost 5,000 coins
  }

  public static isPlayerUnlocked(playerId: string, profile?: UserCareerProfile): boolean {
    const prof = profile || this.getProfile();
    return (
      prof.unlockedPlayerIds.includes(playerId) ||
      prof.starterPlayerIds.includes(playerId)
    );
  }

  /**
   * Direct player draft with Coins
   */
  public static draftPlayerWithCoins(playerId: string): {
    success: boolean;
    error?: string;
    profile: UserCareerProfile;
    player?: SquadPlayer;
  } {
    const profile = this.getProfile();
    const player = this.getPlayerById(playerId);
    if (!player) {
      return { success: false, error: 'Player not found in database.', profile };
    }
    if (this.isPlayerUnlocked(playerId, profile)) {
      return { success: false, error: 'Player is already in your Club Squad!', profile, player };
    }
    const price = this.getPlayerPrice(player);
    if (profile.coins < price) {
      return {
        success: false,
        error: `Need ${price.toLocaleString()} Coins (You have ${profile.coins.toLocaleString()} Coins). Win matches (+10,000 Coins/win)!`,
        profile,
      };
    }

    profile.coins -= price;
    profile.unlockedPlayerIds = Array.from(new Set([...profile.unlockedPlayerIds, playerId]));
    this.saveProfile({ ...profile });
    return { success: true, profile: { ...profile }, player };
  }

  /**
   * Lucky FC Pack Draw (5,000 Standard | 15,000 World Class | 35,000 120-OVR Mythic Icon)
   */
  public static drawPackPlayer(
    packTier: 'STANDARD_5K' | 'WORLD_CLASS_15K' | 'MYTHIC_120_35K'
  ): {
    success: boolean;
    error?: string;
    profile: UserCareerProfile;
    drawnPlayer?: SquadPlayer;
    isNewUnlock?: boolean;
  } {
    const profile = this.getProfile();
    const costMap = {
      STANDARD_5K: 5000,
      WORLD_CLASS_15K: 15000,
      MYTHIC_120_35K: 35000,
    };
    const cost = costMap[packTier];

    if (profile.coins < cost) {
      return {
        success: false,
        error: `Not enough Coins! Need ${cost.toLocaleString()} Coins (You have ${profile.coins.toLocaleString()}). Win a match for +10,000 Coins!`,
        profile,
      };
    }

    let pool: SquadPlayer[] = [];
    if (packTier === 'STANDARD_5K') {
      // Primarily 72-89 OVR players, with a 15% lucky chance at 90+ OVR!
      const roll = Math.random();
      if (roll < 0.15) {
        pool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 90 && p.baseOvr <= 95);
      } else {
        pool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr <= 89);
      }
    } else if (packTier === 'WORLD_CLASS_15K') {
      // 88-95 OVR World Class stars + 30% chance at a 120 OVR Mythic Icon!
      const roll = Math.random();
      if (roll < 0.30) {
        pool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 118);
      } else {
        pool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 88 && p.baseOvr <= 96);
      }
    } else {
      // MYTHIC_120_35K: Guaranteed 120 OVR Mythic Icon!
      pool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 118);
    }

    // Prefer locked players first so draws feel super rewarding
    const unownedInPool = pool.filter((p) => !this.isPlayerUnlocked(p.id, profile));
    const finalCandidates = unownedInPool.length > 0 ? unownedInPool : pool;
    const drawnPlayer = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];

    const isNewUnlock = !this.isPlayerUnlocked(drawnPlayer.id, profile);
    profile.coins -= cost;

    if (isNewUnlock) {
      profile.unlockedPlayerIds = Array.from(
        new Set([...profile.unlockedPlayerIds, drawnPlayer.id])
      );
    } else {
      // Duplicate compensation: +40 XP & +0.10 OVR chemistry training boost
      profile.xp += 40;
      profile.ovrBonus += 0.1;
      const newRank = this.getRankForXp(profile.xp);
      profile.level = newRank.level;
      profile.rankTitle = newRank.title;
    }

    this.saveProfile({ ...profile });
    return {
      success: true,
      profile: { ...profile },
      drawnPlayer,
      isNewUnlock,
    };
  }

  /**
   * 10x Multi-Player Draft at Once!
   * GUARANTEES at least 1 Elite Good Player (94-120 OVR Superstar / 120 OVR Mythic Icon) in every 10x pull!
   */
  public static drawTenPackPlayers(
    packTier: 'PRO_10X_10K' | 'MYTHIC_10X_45K' = 'PRO_10X_10K'
  ): {
    success: boolean;
    error?: string;
    profile: UserCareerProfile;
    drawnItems?: TenPackDrawResultItem[];
  } {
    const profile = this.getProfile();
    const cost = packTier === 'MYTHIC_10X_45K' ? 45000 : 10000;

    if (profile.coins < cost) {
      return {
        success: false,
        error: `Not enough Coins for 10x Multi-Draft! Need ${cost.toLocaleString()} Coins (You have ${profile.coins.toLocaleString()}). Win a match for +10,000 Coins!`,
        profile,
      };
    }

    profile.coins -= cost;

    const standardPool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr <= 89);
    const eliteGoodPool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 90);
    const mythicIconPool = INITIAL_SQUAD_DATABASE.filter((p) => p.baseOvr >= 118);

    const drawnItems: TenPackDrawResultItem[] = [];
    const pickedIdsThisBatch = new Set<string>();

    const pickFromPool = (pool: SquadPlayer[]): SquadPlayer => {
      // Prefer unowned & not yet picked in this 10x batch
      const freshUnowned = pool.filter(
        (p) => !this.isPlayerUnlocked(p.id, profile) && !pickedIdsThisBatch.has(p.id)
      );
      if (freshUnowned.length > 0) {
        return freshUnowned[Math.floor(Math.random() * freshUnowned.length)];
      }
      const notInBatch = pool.filter((p) => !pickedIdsThisBatch.has(p.id));
      if (notInBatch.length > 0) {
        return notInBatch[Math.floor(Math.random() * notInBatch.length)];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    };

    for (let i = 0; i < 10; i++) {
      let chosen: SquadPlayer;
      let isGuaranteedGoodPick = false;

      if (i === 0) {
        // Slot 1: GUARANTEED GOOD / ELITE PLAYER (or 120 OVR Icon)!
        isGuaranteedGoodPick = true;
        if (packTier === 'MYTHIC_10X_45K' || Math.random() < 0.55) {
          chosen = pickFromPool(mythicIconPool);
        } else {
          chosen = pickFromPool(eliteGoodPool);
        }
      } else if (i === 1 && packTier === 'MYTHIC_10X_45K') {
        // Slot 2 in 45K Mega Pack: Second Guaranteed 120 OVR Icon / World Class Star!
        isGuaranteedGoodPick = true;
        chosen = pickFromPool(mythicIconPool);
      } else {
        const roll = Math.random();
        const eliteChance = packTier === 'MYTHIC_10X_45K' ? 0.45 : 0.22;
        if (roll < eliteChance) {
          chosen = pickFromPool(eliteGoodPool);
          if (chosen.baseOvr >= 94) isGuaranteedGoodPick = true;
        } else {
          chosen = pickFromPool(standardPool);
        }
      }

      pickedIdsThisBatch.add(chosen.id);
      const isNewUnlock = !this.isPlayerUnlocked(chosen.id, profile);

      if (isNewUnlock) {
        profile.unlockedPlayerIds = Array.from(
          new Set([...profile.unlockedPlayerIds, chosen.id])
        );
      } else {
        profile.xp += 25;
        profile.ovrBonus += 0.05;
      }

      drawnItems.push({
        player: chosen,
        isNewUnlock,
        isGuaranteedGoodPick,
        isGuaranteedHighlight: isGuaranteedGoodPick,
      });
    }

    // Sort drawn items so the highest OVR / guaranteed good players headline the reveal!
    drawnItems.sort((a, b) => b.player.baseOvr - a.player.baseOvr);

    const newRank = this.getRankForXp(profile.xp);
    profile.level = newRank.level;
    profile.rankTitle = newRank.title;

    this.saveProfile({ ...profile });
    return {
      success: true,
      profile: { ...profile },
      drawnItems,
    };
  }

  /**
   * Immediately slot a drafted player into the Starting 7 based on their primary role
   */
  public static slotPlayerIntoStarters(playerId: string): UserCareerProfile {
    const profile = this.getProfile();
    const player = this.getPlayerById(playerId);
    if (!player) return profile;

    if (!profile.unlockedPlayerIds.includes(playerId)) {
      profile.unlockedPlayerIds.push(playerId);
    }

    if (profile.starterPlayerIds.includes(playerId)) {
      this.saveProfile({ ...profile });
      return { ...profile };
    }

    const nextStarters = [...profile.starterPlayerIds];
    // Find best matching slot by role:
    // Slot 0 = GK, Slots 1-2 = DEF, Slots 3-4 = MID, Slots 5-6 = FWD
    let targetSlot = 6;
    if (player.primaryRole === 'GK') targetSlot = 0;
    else if (player.primaryRole === 'DEF') {
      const s1 = this.getPlayerById(nextStarters[1]);
      const s2 = this.getPlayerById(nextStarters[2]);
      targetSlot = (s1?.baseOvr || 0) <= (s2?.baseOvr || 0) ? 1 : 2;
    } else if (player.primaryRole === 'MID') {
      const s3 = this.getPlayerById(nextStarters[3]);
      const s4 = this.getPlayerById(nextStarters[4]);
      targetSlot = (s3?.baseOvr || 0) <= (s4?.baseOvr || 0) ? 3 : 4;
    } else {
      const s5 = this.getPlayerById(nextStarters[5]);
      const s6 = this.getPlayerById(nextStarters[6]);
      targetSlot = (s5?.baseOvr || 0) <= (s6?.baseOvr || 0) ? 5 : 6;
    }

    nextStarters[targetSlot] = playerId;
    profile.starterPlayerIds = nextStarters;
    this.saveProfile({ ...profile });
    return { ...profile };
  }

  /**
   * Calculates dynamic team OVR based on the 7 active starters and career OVR bonus
   */
  public static calculateTeamOVR(profile: UserCareerProfile): {
    overall: number;
    formatted: string;
    attackOvr: number;
    midfieldOvr: number;
    defenseOvr: number;
  } {
    const starters = profile.starterPlayerIds
      .map((id) => this.getPlayerById(id))
      .filter((p): p is SquadPlayer => Boolean(p));

    if (starters.length === 0) {
      return { overall: 85.0, formatted: '85.0', attackOvr: 85, midfieldOvr: 85, defenseOvr: 85 };
    }

    const avgBase = starters.reduce((acc, p) => acc + p.baseOvr, 0) / starters.length;
    // OVR gets slightly higher with each win (+0.2 per win)
    const totalOvr = avgBase + profile.ovrBonus;

    const forwards = starters.filter((p) => p.primaryRole === 'FWD');
    const mids = starters.filter((p) => p.primaryRole === 'MID');
    const defs = starters.filter((p) => p.primaryRole === 'DEF' || p.primaryRole === 'GK');

    const attackOvr = forwards.length > 0
      ? Math.round((forwards.reduce((a, b) => a + b.baseOvr, 0) / forwards.length) + profile.ovrBonus)
      : Math.round(totalOvr);

    const midfieldOvr = mids.length > 0
      ? Math.round((mids.reduce((a, b) => a + b.baseOvr, 0) / mids.length) + profile.ovrBonus)
      : Math.round(totalOvr);

    const defenseOvr = defs.length > 0
      ? Math.round((defs.reduce((a, b) => a + b.baseOvr, 0) / defs.length) + profile.ovrBonus)
      : Math.round(totalOvr);

    return {
      overall: totalOvr,
      formatted: totalOvr.toFixed(1),
      attackOvr,
      midfieldOvr,
      defenseOvr,
    };
  }

  /**
   * Awards progression & 10,000 Coins when match ends
   */
  public static recordMatchResult(
    homeScore: number,
    awayScore: number
  ): {
    profile: UserCareerProfile;
    coinsGained: number;
    xpGained: number;
    ovrGained: number;
    previousOvr: string;
    newOvr: string;
    leveledUp: boolean;
    previousRank: CareerRankTier;
    newRank: CareerRankTier;
  } {
    const profile = this.getProfile();
    const prevCalculated = this.calculateTeamOVR(profile);
    const previousRank = this.getRankForXp(profile.xp);

    let coinsGained = 1500;
    let xpGained = 20;
    let ovrGained = 0.0;

    if (homeScore > awayScore) {
      // VICTORY! User gets +10,000 Coins, +100 XP, and subtle +0.20 OVR bump
      coinsGained = 10000;
      xpGained = 100 + homeScore * 10;
      ovrGained = 0.2;
      profile.matchesWon++;
    } else if (homeScore === awayScore) {
      // DRAW
      coinsGained = 3500;
      xpGained = 45;
      ovrGained = 0.05;
      profile.matchesDrawn++;
    } else {
      // LOSS
      coinsGained = 1500;
      xpGained = 25;
      ovrGained = 0.0;
      profile.matchesLost++;
    }

    if (awayScore === 0) {
      profile.cleanSheets++;
      xpGained += 15;
    }

    profile.matchesPlayed++;
    profile.goalsScored += homeScore;
    profile.coins = (profile.coins || 0) + coinsGained;
    profile.xp += xpGained;
    profile.ovrBonus += ovrGained;

    const newRank = this.getRankForXp(profile.xp);
    const leveledUp = newRank.level > previousRank.level;
    profile.level = newRank.level;
    profile.rankTitle = newRank.title;

    this.saveProfile({ ...profile });
    const newCalculated = this.calculateTeamOVR(profile);

    return {
      profile: { ...profile },
      coinsGained,
      xpGained,
      ovrGained,
      previousOvr: prevCalculated.formatted,
      newOvr: newCalculated.formatted,
      leveledUp,
      previousRank,
      newRank,
    };
  }

  public static updateLineup(starterIds: string[], formation: FormationId): UserCareerProfile {
    const profile = this.getProfile();
    profile.starterPlayerIds = [...starterIds];
    profile.activeFormation = formation;
    this.saveProfile({ ...profile });
    return { ...profile };
  }

  public static loginGoogle(email: string, name: string): UserCareerProfile {
    const profile = this.getProfile();
    profile.email = email;
    profile.displayName = name;
    profile.isLoggedIn = true;
    profile.clubName = `REAL MADRID / ${name.toUpperCase()} FC`;
    this.saveProfile({ ...profile });
    return { ...profile };
  }

  public static logout(): UserCareerProfile {
    const profile = this.getProfile();
    profile.isLoggedIn = false;
    this.saveProfile({ ...profile });
    return { ...profile };
  }

  public static resetCareer(): UserCareerProfile {
    const fresh: UserCareerProfile = {
      ...DEFAULT_USER_PROFILE,
      isLoggedIn: true,
      starterPlayerIds: [...INITIAL_STARTERS],
      unlockedPlayerIds: [...INITIAL_STARTERS],
    };
    this.saveProfile(fresh);
    return fresh;
  }
}

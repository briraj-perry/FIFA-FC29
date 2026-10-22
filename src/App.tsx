import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AITacticalConfig,
  BOOT_CATALOG,
  DEFAULT_AI_TACTICS,
  DEFAULT_EQUIPMENT,
  DEFAULT_GRAPHICS,
  FormationId,
  GameMode,
  GameScreenState,
  GraphicsSettings,
  MatchStats,
  MentalityId,
  OnlinePlayerSearchResult,
  OnlineSessionState,
  PlayerEquipmentLoadout,
  STADIUM_CATALOG,
  StadiumId,
  TouchControllerInput,
} from './types/game';
import {
  FootballCanvas,
  OnlineMatchSnapshot,
  TacticalOverrideCommand,
} from './three/FootballCanvas';
import { MatchBroadcastHUD } from './components/MatchBroadcastHUD';
import { EquipmentCustomizerModal } from './components/EquipmentCustomizerModal';
import { OnlineLobbyModal } from './components/OnlineLobbyModal';
import { GoogleAuthScreen } from './components/GoogleAuthScreen';
import { FC26MainMenu } from './components/FC26MainMenu';
import { TeamManagementModal } from './components/TeamManagementModal';
import { PlayerDraftModal } from './components/PlayerDraftModal';
import { PostMatchProgressionModal } from './components/PostMatchProgressionModal';
import { ProgressionService } from './services/progressionService';
import { UserCareerProfile } from './types/progression';
import { soundEngine } from './audio/soundEngine';
import { MobileOrientationBanner } from './components/MobileOrientationBanner';
import { isPhoneScreen } from './utils/mobileDetection';

const INITIAL_STATS: MatchStats = {
  homeScore: 0,
  awayScore: 0,
  matchClockSeconds: 0,
  currentHalf: 1,
  homePossessionFrames: 1,
  awayPossessionFrames: 1,
  homeShots: 0,
  awayShots: 0,
  homePasses: 0,
  awayPasses: 0,
  homeTackles: 0,
  awayTackles: 0,
  homeCorners: 0,
  awayCorners: 0,
  homeXG: 0,
  awayXG: 0,
  momentum: 0,
  lastScorerName: '',
  lastScorerTeam: null,
  activePlayerName: 'BELLINGHAM',
  activePlayerNumber: 5,
  activePlayerStamina: 100,
  activePlayerOvr: 92,
  activePlayerPace: 88,
  activePlayerShooting: 88,
  isSprinting: false,
  activeSkillMoveName: null,
  setPieceBanner: null,
  shotPowerCharge: 0,
  aiCurrentAction: 'Hold WASD / Arrow Keys to Move · Shift / R to Sprint',
  aiTacticalAdaptationBanner: 'Pro Goalkeepers · OVR Speed & Shot Scaling · 45m Halves',
  awayFormation: '4-3-3 Attack',
  awayMentality: 'Tiki-Taka',
  isCornerKickActive: false,
  isUserCornerKick: false,
  cornerTakerName: '',
  cornerKickTeam: null,
  cornerZSign: 1,
};

const createEmptyTouchInput = (): TouchControllerInput => ({
  moveX: 0,
  moveZ: 0,
  sprintHeld: false,
  closeDribbleHeld: false,
  shootCharging: false,
  pendingPass: false,
  pendingThroughBall: false,
  pendingShootRelease: false,
  pendingSkillMove: null,
  pendingSwitchPlayer: false,
});

export default function App() {
  const [userProfile, setUserProfile] = useState<UserCareerProfile>(() => ProgressionService.getProfile());
  const [screenState, setScreenState] = useState<GameScreenState>(() => {
    const prof = ProgressionService.getProfile();
    return prof.isLoggedIn ? 'MENU' : 'LOGIN';
  });
  const [progressionResult, setProgressionResult] = useState<ReturnType<typeof ProgressionService.recordMatchResult> | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('PLAYER_VS_AI');
  const [equipment, setEquipment] = useState<PlayerEquipmentLoadout>(DEFAULT_EQUIPMENT);
  const [graphics, setGraphics] = useState<GraphicsSettings>(() => ({
    ...DEFAULT_GRAPHICS,
    ipadControls:
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 ||
        'ontouchstart' in window ||
        isPhoneScreen() ||
        (typeof window !== 'undefined' && window.innerWidth < 1024)),
  }));
  const [aiTactics, setAiTactics] = useState<AITacticalConfig>(() => ({
    ...DEFAULT_AI_TACTICS,
    formation: ProgressionService.getProfile().activeFormation,
  }));
  const [stats, setStats] = useState<MatchStats>(INITIAL_STATS);
  const [tacticalCommand, setTacticalCommand] = useState<TacticalOverrideCommand>(null);
  const [goalBanner, setGoalBanner] = useState<{
    scorerName: string;
    team: 'HOME' | 'AWAY';
  } | null>(null);
  const [friendAcceptedToast, setFriendAcceptedToast] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState<number>(0);
  const [secondHalfSignal, setSecondHalfSignal] = useState<number>(0);
  const [skipReplaySignal, setSkipReplaySignal] = useState<number>(0);
  const [practiceCornerSignal, setPracticeCornerSignal] = useState<number>(0);
  const goalBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [customizerZoomTarget, setCustomizerZoomTarget] = useState<
    'FULL_BODY' | 'BOOTS' | 'UPPER_KIT' | 'HEADGEAR' | 'BALL'
  >('FULL_BODY');

  // Shared refs for iPad/Touch input & Online WebSocket + HTTP hybrid streaming
  const touchInputRef = useRef<TouchControllerInput>(createEmptyTouchInput());
  const remoteGuestInputRef = useRef<TouchControllerInput>(createEmptyTouchInput());
  const incomingSnapshotRef = useRef<OnlineMatchSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(
    `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );

  const [onlineState, setOnlineState] = useState<OnlineSessionState>(() => {
    const prof = ProgressionService.getProfile();
    const initialName =
      prof.displayName && prof.displayName !== 'Pro Manager'
        ? prof.displayName.slice(0, 18)
        : `Captain_${Math.floor(10 + Math.random() * 89)}`;
    return {
      connected: true,
      roomId: null,
      role: 'HOME',
      playerName: initialName,
      latencyMs: 14,
      room: null,
      incomingRequests: [],
      outgoingRequests: [],
      friends: [],
      matchInvites: [],
    };
  });

  const onlineStateRef = useRef(onlineState);
  onlineStateRef.current = onlineState;

  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;

  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;

  const playerNameRef = useRef(onlineState.playerName);
  playerNameRef.current = onlineState.playerName;

  const stadiumRef = useRef(graphics.stadium);
  stadiumRef.current = graphics.stadium;

  // Helper to apply incoming guest input
  const applyRemoteGuestInput = useCallback((inp: TouchControllerInput) => {
    const cur = remoteGuestInputRef.current;
    cur.moveX = inp.moveX || 0;
    cur.moveZ = inp.moveZ || 0;
    cur.sprintHeld = Boolean(inp.sprintHeld);
    cur.closeDribbleHeld = Boolean(inp.closeDribbleHeld);
    cur.shootCharging = Boolean(inp.shootCharging);
    if (inp.pendingPass) cur.pendingPass = true;
    if (inp.pendingThroughBall) cur.pendingThroughBall = true;
    if (inp.pendingShootRelease) cur.pendingShootRelease = true;
    if (inp.pendingSkillMove) cur.pendingSkillMove = inp.pendingSkillMove;
    if (inp.pendingSwitchPlayer) cur.pendingSwitchPlayer = true;
  }, []);

  // HTTP action helper so Online Multiplayer & Friend Requests work reliably
  const postOnlineAction = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const t0 = performance.now();
        const prof = ProgressionService.getProfile();
        const teamOvr = ProgressionService.calculateTeamOVR(prof).formatted;
        const res = await fetch('/api/online-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: playerNameRef.current,
            clubName: prof.clubName,
            squadOvr: teamOvr,
            ...body,
            clientId: clientIdRef.current,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const rtt = Math.max(4, Math.round(performance.now() - t0));

        setOnlineState((prev) => ({
          ...prev,
          connected: true,
          latencyMs: rtt,
          roomId: data.roomId !== undefined ? data.roomId : prev.roomId,
          role: data.role ?? prev.role,
          room: data.room !== undefined ? data.room : prev.room,
          incomingRequests: data.incomingRequests ?? prev.incomingRequests,
          outgoingRequests: data.outgoingRequests ?? prev.outgoingRequests,
          friends: data.friends ?? prev.friends,
          matchInvites: data.matchInvites ?? prev.matchInvites,
        }));

        if (data.room) {
          if (data.room.stadium) {
            setGraphics((g) => ({
              ...g,
              stadium: data.room.stadium as StadiumId,
            }));
          }

          if (
            data.room.status === 'PLAYING' &&
            screenStateRef.current === 'ONLINE_LOBBY'
          ) {
            soundEngine.playWhistle('kickoff');
            setGameMode('ONLINE_MULTIPLAYER');
            setScreenState('PLAYING');
          }
        }

        if (data.initialSnapshot) {
          incomingSnapshotRef.current = data.initialSnapshot;
        }
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  // Initialize Real-Time WebSocket connection to /ws-match + URL ?room=CODE auto-join
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let isUnmounted = false;

    // Check URL ?room=CODE immediately via HTTP so invite links work instantaneously
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom && urlRoom.trim().length >= 3) {
      const code = urlRoom.trim().toUpperCase();
      setScreenState('ONLINE_LOBBY');
      postOnlineAction({
        action: 'join',
        roomId: code,
        playerName: playerNameRef.current,
        stadium: stadiumRef.current,
      });
    }

    const connectWebSocket = () => {
      if (isUnmounted) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws-match?clientId=${encodeURIComponent(
          clientIdRef.current
        )}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setOnlineState((prev) => ({ ...prev, connected: true }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (!msg || typeof msg.type !== 'string') return;

            if (msg.type === 'pong' && typeof msg.clientSentAt === 'number') {
              const rtt = Math.max(1, Date.now() - msg.clientSentAt);
              setOnlineState((prev) => ({ ...prev, connected: true, latencyMs: rtt }));
              return;
            }

            if (msg.type === 'room:joined') {
              if (msg.initialSnapshot) {
                incomingSnapshotRef.current = msg.initialSnapshot;
              }
              setOnlineState((prev) => ({
                ...prev,
                connected: true,
                roomId: msg.roomId,
                role: msg.role,
                room: msg.room,
              }));
              if (msg.room?.stadium) {
                setGraphics((g) => ({ ...g, stadium: msg.room.stadium as StadiumId }));
              }
              if (msg.room?.status === 'PLAYING') {
                setGameMode('ONLINE_MULTIPLAYER');
                setScreenState('PLAYING');
              }
              return;
            }

            if (msg.type === 'room:role_assigned') {
              setOnlineState((prev) => ({
                ...prev,
                role: msg.role,
                roomId: msg.roomId,
              }));
              return;
            }

            if (msg.type === 'room:state') {
              setOnlineState((prev) => ({
                ...prev,
                room: msg.room,
              }));
              return;
            }

            if (msg.type === 'room:left') {
              setOnlineState((prev) => ({
                ...prev,
                roomId: null,
                room: null,
              }));
              return;
            }

            if (msg.type === 'room:chat_message' && msg.message) {
              setOnlineState((prev) => {
                if (!prev.room) return prev;
                const exists = prev.room.chatMessages.some(
                  (m) => m.id === msg.message.id
                );
                if (exists) return prev;
                return {
                  ...prev,
                  room: {
                    ...prev.room,
                    chatMessages: [...prev.room.chatMessages, msg.message],
                  },
                };
              });
              return;
            }

            if (msg.type === 'match:started') {
              soundEngine.playWhistle('kickoff');
              if (msg.room?.stadium) {
                setGraphics((g) => ({ ...g, stadium: msg.room.stadium as StadiumId }));
              }
              setOnlineState((prev) => ({
                ...prev,
                room: msg.room || prev.room,
              }));
              setGameMode('ONLINE_MULTIPLAYER');
              setScreenState('PLAYING');
              return;
            }

            if (msg.type === 'match:state' && msg.snapshot) {
              incomingSnapshotRef.current = msg.snapshot;
              return;
            }

            if (msg.type === 'player:input' && msg.input) {
              applyRemoteGuestInput(msg.input as TouchControllerInput);
              return;
            }

            if (msg.type === 'match:goal') {
              soundEngine.playWhistle('goal');
              soundEngine.playGoalRoar();
              setGoalBanner({
                scorerName: msg.scorerName,
                team: msg.team,
              });
              setTimeout(() => setGoalBanner(null), 2700);
              return;
            }

            if (msg.type === 'friend:request_received' && msg.request) {
              soundEngine.playUIClick();
              postOnlineAction({ action: 'heartbeat' });
              return;
            }

            if (msg.type === 'friend:request_accepted' && msg.request) {
              soundEngine.playWhistle('goal');
              setFriendAcceptedToast(
                `🎉 ${msg.request.toName} accepted your Friend Request! They are now in your Accepted Friends List!`
              );
              setTimeout(() => setFriendAcceptedToast(null), 6000);
              postOnlineAction({ action: 'heartbeat' });
              return;
            }

            if (msg.type === 'friend:match_invite' && msg.invite) {
              soundEngine.playWhistle('kickoff');
              postOnlineAction({ action: 'heartbeat' });
              return;
            }
          } catch {
            // Ignore malformed message
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimer = setTimeout(connectWebSocket, 2500);
          }
        };
      } catch {
        // Fallback to HTTP polling automatically
      }
    };

    connectWebSocket();

    pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'ping', clientSentAt: Date.now() })
        );
      }
    }, 3500);

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [applyRemoteGuestInput, postOnlineAction]);

  // Background Friend Request & Online Presence Heartbeat (paused during active 60FPS match play)
  useEffect(() => {
    if (screenState === 'PLAYING') return;
    postOnlineAction({ action: 'heartbeat' });
    const hb = setInterval(() => {
      if (screenStateRef.current !== 'PLAYING') {
        postOnlineAction({ action: 'heartbeat' });
      }
    }, 3500);
    return () => clearInterval(hb);
  }, [postOnlineAction, onlineState.playerName, screenState]);

  // Hybrid HTTP synchronization fallback when inside an Online Room
  useEffect(() => {
    if (!onlineState.roomId) return;

    const isPlayingOnline =
      gameMode === 'ONLINE_MULTIPLAYER' && screenState === 'PLAYING';
    const intervalMs = isPlayingOnline ? 1200 : 900;

    const timer = setInterval(async () => {
      const wsOpen = wsRef.current?.readyState === WebSocket.OPEN;
      // If playing live and WebSocket is open and healthy, skip fast HTTP polling to prevent out-of-order rubber-banding!
      if (isPlayingOnline && wsOpen) return;

      try {
        const res = await fetch('/api/online-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll',
            roomId: onlineState.roomId,
            playerName: playerNameRef.current,
            clientId: clientIdRef.current,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.room) {
          setOnlineState((prev) => {
            const sameRoomState =
              prev.role === (data.role ?? prev.role) &&
              prev.room?.status === data.room.status &&
              prev.room?.playerCount === data.room.playerCount &&
              prev.room?.guestName === data.room.guestName &&
              (prev.room?.chatMessages?.length || 0) ===
                (data.room.chatMessages?.length || 0);
            if (isPlayingOnline && sameRoomState) {
              return prev;
            }
            return {
              ...prev,
              connected: true,
              role: data.role ?? prev.role,
              room: data.room,
              incomingRequests: data.incomingRequests ?? prev.incomingRequests,
              outgoingRequests: data.outgoingRequests ?? prev.outgoingRequests,
              friends: data.friends ?? prev.friends,
              matchInvites: data.matchInvites ?? prev.matchInvites,
            };
          });
          if (
            data.room.status === 'PLAYING' &&
            screenStateRef.current === 'ONLINE_LOBBY'
          ) {
            soundEngine.playWhistle('kickoff');
            setGameMode('ONLINE_MULTIPLAYER');
            setScreenState('PLAYING');
          }
        }
        if (!wsOpen) {
          const effectiveRole = data.role || onlineState.role;
          if (effectiveRole === 'AWAY' && data.snapshot && data.snapshotAgeMs < 1500) {
            incomingSnapshotRef.current = data.snapshot;
          }
          if (effectiveRole === 'HOME' && data.guestInput) {
            applyRemoteGuestInput(data.guestInput as TouchControllerInput);
          }
        }
      } catch {
        // Ignore transient network hiccup
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    onlineState.roomId,
    onlineState.role,
    gameMode,
    screenState,
    applyRemoteGuestInput,
  ]);

  const sendWsMessage = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const handleSearchPlayers = useCallback(
    async (query: string): Promise<OnlinePlayerSearchResult[]> => {
      const data = await postOnlineAction({
        action: 'search_players',
        query,
      });
      return (data?.results as OnlinePlayerSearchResult[]) || [];
    },
    [postOnlineAction]
  );

  const handleSendFriendRequest = useCallback(
    async (targetClientId: string, targetPlayerName: string) => {
      await postOnlineAction({
        action: 'send_friend_request',
        targetClientId,
        targetPlayerName,
      });
    },
    [postOnlineAction]
  );

  const handleRespondFriendRequest = useCallback(
    async (requestId: string, decision: 'ACCEPT' | 'DECLINE') => {
      await postOnlineAction({
        action: 'respond_friend_request',
        requestId,
        decision,
      });
    },
    [postOnlineAction]
  );

  const handlePlayWithFriend = useCallback(
    async (friendClientId: string, friendName: string, friendRoomId: string | null) => {
      if (friendRoomId) {
        await postOnlineAction({
          action: 'join',
          roomId: friendRoomId,
          playerName: onlineState.playerName,
          stadium: graphics.stadium,
        });
      } else {
        await postOnlineAction({
          action: 'invite_friend_match',
          targetClientId: friendClientId,
          targetPlayerName: friendName,
          playerName: onlineState.playerName,
          stadium: graphics.stadium,
        });
      }
    },
    [postOnlineAction, onlineState.playerName, graphics.stadium]
  );

  const startKickOff = useCallback((mode: GameMode) => {
    soundEngine.playUIClick();
    soundEngine.playWhistle('kickoff');
    setGameMode(mode);
    setScreenState('PLAYING');
  }, []);

  const handleGoalScored = useCallback(
    (
      scorerName: string,
      team: 'HOME' | 'AWAY',
      homeScore: number,
      awayScore: number
    ) => {
      if (goalBannerTimerRef.current) {
        clearTimeout(goalBannerTimerRef.current);
      }
      setGoalBanner({ scorerName, team });
      goalBannerTimerRef.current = setTimeout(() => {
        setGoalBanner(null);
      }, 5150);

      if (gameMode === 'ONLINE_MULTIPLAYER' && onlineState.role === 'HOME') {
        sendWsMessage({
          type: 'match:goal',
          scorerName,
          team,
          homeScore,
          awayScore,
        });
      }
    },
    [gameMode, onlineState.role, sendWsMessage]
  );

  const handleSkipGoalReplay = useCallback(() => {
    if (goalBannerTimerRef.current) {
      clearTimeout(goalBannerTimerRef.current);
      goalBannerTimerRef.current = null;
    }
    setGoalBanner(null);
    setStats((prev) => ({
      ...prev,
      isGoalReplay: false,
      goalReplayProgress: 0,
    }));
  }, []);

  const handleMatchHalfTime = useCallback(() => {
    setScreenState('HALF_TIME');
  }, []);

  const handleMatchFullTime = useCallback((homeScore: number = 0, awayScore: number = 0) => {
    const result = ProgressionService.recordMatchResult(homeScore, awayScore);
    setProgressionResult(result);
    setUserProfile(result.profile);
    setScreenState('FULL_TIME');
  }, []);

  const handleSaveLineup = useCallback((starterIds: string[], formation: FormationId) => {
    const updated = ProgressionService.updateLineup(starterIds, formation);
    setUserProfile(updated);
    setAiTactics((prev) => ({ ...prev, formation }));
  }, []);

  const handleConsumeTacticalCommand = useCallback(() => {
    setTacticalCommand(null);
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMute = !soundEngine.muted;
    soundEngine.setMuted(nextMute);
    setMuted(nextMute);
  }, []);

  const lastHttpStateSyncRef = useRef<number>(0);
  const handleBroadcastMatchState = useCallback(
    (snapshot: OnlineMatchSnapshot) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendWsMessage({
          type: 'match:state',
          snapshot,
        });
        return;
      }
      const now = performance.now();
      if (onlineStateRef.current.roomId && now - lastHttpStateSyncRef.current > 120) {
        lastHttpStateSyncRef.current = now;
        fetch('/api/online-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sync_state',
            roomId: onlineStateRef.current.roomId,
            snapshot,
          }),
        }).catch(() => {});
      }
    },
    [sendWsMessage]
  );

  const lastHttpInputSyncRef = useRef<number>(0);
  const handleSendGuestInput = useCallback(
    (input: TouchControllerInput) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendWsMessage({
          type: 'player:input',
          input,
        });
        return;
      }
      const now = performance.now();
      if (onlineStateRef.current.roomId && now - lastHttpInputSyncRef.current > 100) {
        lastHttpInputSyncRef.current = now;
        fetch('/api/online-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'guest_input',
            roomId: onlineStateRef.current.roomId,
            input,
          }),
        }).catch(() => {});
      }
    },
    [sendWsMessage]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (screenState === 'TITLE' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startKickOff('PLAYER_VS_AI');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (screenState === 'PLAYING') {
          soundEngine.playUIClick();
          setScreenState('PAUSED');
        } else if (screenState === 'PAUSED') {
          soundEngine.playUIClick();
          setScreenState('PLAYING');
        } else if (
          screenState === 'CUSTOMIZER' ||
          screenState === 'ONLINE_LOBBY' ||
          screenState === 'PLAYER_DRAFT'
        ) {
          soundEngine.playUIClick();
          setScreenState('MENU');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screenState, startKickOff]);

  // Unlock web audio on first mobile screen touch or user interaction
  useEffect(() => {
    const unlockAudio = () => {
      soundEngine.startStadiumAmbience();
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);

  const totalPoss = Math.max(1, stats.homePossessionFrames + stats.awayPossessionFrames);
  const homePossPct = Math.round((stats.homePossessionFrames / totalPoss) * 100);
  const currentBoot = BOOT_CATALOG[equipment.bootModel];
  const currentStadium = STADIUM_CATALOG[graphics.stadium];

  const pendingFriendRequests = onlineState.incomingRequests || [];
  const activeMatchInvites = onlineState.matchInvites || [];

  return (
    <main className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#05080F] select-none touch-none">
      {/* Mobile Orientation Notification & Fullscreen Landscape Helper */}
      <MobileOrientationBanner />
      {/* GLOBAL ON-SCREEN FRIEND REQUEST & MATCH INVITE NOTIFICATION OVERLAY (Visible whenever online) */}
      {(pendingFriendRequests.length > 0 || activeMatchInvites.length > 0 || friendAcceptedToast) && (
        <div className="fixed top-3 right-3 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto px-2">
          {friendAcceptedToast && (
            <div className="p-3.5 rounded-2xl bg-[#090D16]/95 border-2 border-[#CCFF00] shadow-2xl flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-[#CCFF00]">{friendAcceptedToast}</div>
              <button
                type="button"
                onClick={() => setFriendAcceptedToast(null)}
                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {pendingFriendRequests.map((req) => (
            <div
              key={req.id}
              className="p-3.5 rounded-2xl bg-[#090D16]/95 border-2 border-[#CCFF00] shadow-2xl flex items-center justify-between gap-3 animate-pulse"
            >
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-black">
                  🔔 NEW FRIEND REQUEST
                </div>
                <div className="font-display text-base font-black text-white uppercase">
                  {req.fromName} wants to be friends!
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playWhistle('goal');
                    handleRespondFriendRequest(req.id, 'ACCEPT');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 font-black text-xs uppercase cursor-pointer shadow"
                >
                  ✓ Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUIClick();
                    handleRespondFriendRequest(req.id, 'DECLINE');
                  }}
                  className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {activeMatchInvites.map((inv) => (
            <div
              key={inv.id}
              className="p-3.5 rounded-2xl bg-[#090D16]/95 border-2 border-[#38BDF8] shadow-2xl flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#38BDF8] font-black">
                  ⚽ FRIEND MATCH INVITE
                </div>
                <div className="font-display text-base font-black text-white uppercase">
                  {inv.fromName} invited you to Room #{inv.roomId}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  soundEngine.playWhistle('kickoff');
                  await postOnlineAction({
                    action: 'join',
                    roomId: inv.roomId,
                    playerName: onlineState.playerName,
                    stadium: inv.stadium,
                  });
                  setScreenState('ONLINE_LOBBY');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#38BDF8] hover:bg-[#7dd3fc] text-slate-950 font-black text-xs uppercase cursor-pointer shrink-0"
              >
                Join Match
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Isolated 60fps Three.js WebGL Stadium & Match Simulation */}
      <FootballCanvas
        screenState={screenState}
        gameMode={gameMode}
        equipment={equipment}
        graphics={graphics}
        aiTactics={aiTactics}
        tacticalCommand={tacticalCommand}
        onConsumeTacticalCommand={handleConsumeTacticalCommand}
        onStatsUpdate={setStats}
        onGoalScored={handleGoalScored}
        onMatchHalfTime={handleMatchHalfTime}
        onMatchFullTime={handleMatchFullTime}
        resetSignal={resetSignal}
        secondHalfSignal={secondHalfSignal}
        skipReplaySignal={skipReplaySignal}
        onSkipGoalReplay={handleSkipGoalReplay}
        triggerCornerKickPractice={practiceCornerSignal}
        starterPlayerIds={userProfile.starterPlayerIds}
        customizerZoomTarget={customizerZoomTarget}
        touchInputRef={touchInputRef}
        onlineRole={onlineState.role}
        remoteGuestInputRef={remoteGuestInputRef}
        incomingSnapshotRef={incomingSnapshotRef}
        onBroadcastMatchState={handleBroadcastMatchState}
        onSendGuestInput={handleSendGuestInput}
      />

      {/* 0A. GOOGLE LOGIN SCREEN */}
      {screenState === 'LOGIN' && (
        <GoogleAuthScreen
          defaultEmail={userProfile.email}
          defaultName={userProfile.displayName}
          onLoginSuccess={() => {
            const prof = ProgressionService.getProfile();
            setUserProfile(prof);
            if (prof.displayName && prof.displayName !== 'Pro Manager') {
              setOnlineState((prev) => ({
                ...prev,
                playerName: prof.displayName.slice(0, 18),
              }));
            }
            setScreenState('MENU');
          }}
        />
      )}

      {/* 0B. FC 26 MAIN MENU HUB */}
      {screenState === 'MENU' && (
        <FC26MainMenu
          profile={userProfile}
          onStartMatch={() => setScreenState('PLAYING')}
          onOpenTeamManagement={() => setScreenState('TEAM_MANAGEMENT')}
          onOpenPlayerDraft={() => setScreenState('PLAYER_DRAFT')}
          onOpenCustomizer={() => {
            setCustomizerZoomTarget('FULL_BODY');
            setScreenState('CUSTOMIZER');
          }}
          onOpenOnlineLobby={() => setScreenState('ONLINE_LOBBY')}
          onPracticeCornerKick={() => {
            setPracticeCornerSignal((prev) => prev + 1);
            setScreenState('PLAYING');
          }}
          onLogout={() => {
            ProgressionService.logout();
            setUserProfile(ProgressionService.getProfile());
            setScreenState('LOGIN');
          }}
          onProfileUpdate={setUserProfile}
        />
      )}

      {/* 0C. TEAM MANAGEMENT & FORMATION BOARD */}
      {screenState === 'TEAM_MANAGEMENT' && (
        <TeamManagementModal
          profile={userProfile}
          onSaveLineup={handleSaveLineup}
          onOpenPlayerDraft={() => setScreenState('PLAYER_DRAFT')}
          onClose={() => setScreenState('MENU')}
        />
      )}

      {/* 0D. PLAYER DRAFT, 10X PACK DRAW & SCOUT CATALOG */}
      {screenState === 'PLAYER_DRAFT' && (
        <PlayerDraftModal
          profile={userProfile}
          onUpdateProfile={setUserProfile}
          onOpenTeamManagement={() => setScreenState('TEAM_MANAGEMENT')}
          onClose={() => setScreenState('MENU')}
        />
      )}

      {/* 1. TITLE SCREEN OVERLAY */}
      {screenState === 'TITLE' && (
        <div className="fixed inset-0 z-20 pointer-events-auto overflow-y-auto flex flex-col justify-between py-3 sm:py-5 px-4 sm:px-8 md:px-12 bg-gradient-to-t from-[#05080F]/92 via-transparent to-[#05080F]/75">
          {/* Top Perimeter Bar: Spec Readout, iPad Controls Toggle, Brightness & Audio */}
          <div className="pointer-events-auto max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono-tabular text-slate-300">
              <span className="font-bold text-[#CCFF00]">RTX 5080 ULTRA READY</span>
              <span aria-hidden="true">·</span>
              <span>HALF-TIME · CORNER & GOAL KICKS · PRO GK</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#38BDF8] font-bold">{currentStadium.name.toUpperCase()}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* iPad / Touch Controls Quick Toggle */}
              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setGraphics({
                    ...graphics,
                    ipadControls: !graphics.ipadControls,
                  });
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                  graphics.ipadControls
                    ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                    : 'bg-[#090D16]/90 text-slate-200 border-white/15 hover:text-white'
                }`}
              >
                {graphics.ipadControls ? 'iPad Controls: ON' : 'Enable iPad Controls'}
              </button>

              {/* Quick Exposure / Dimmer Control */}
              <div className="flex items-center gap-2 bg-[#090D16]/90 border border-white/15 px-3 py-1.5 rounded-lg text-xs">
                <span className="text-slate-300 font-medium">Light Level</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.02}
                  value={graphics.exposure}
                  onChange={(e) =>
                    setGraphics({ ...graphics, exposure: parseFloat(e.target.value) })
                  }
                  className="w-20 accent-[#CCFF00] cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="font-mono-tabular text-[#CCFF00] w-9 text-right">
                  {Math.round(graphics.exposure * 100)}%
                </span>
              </div>

              <button
                onClick={handleToggleMute}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#090D16]/90 border border-white/15 rounded-lg text-slate-200 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                {muted ? 'Audio: Muted' : 'Audio: Live Stadium On'}
              </button>
            </div>
          </div>

          {/* Center-Left Bespoke Inline SVG Title Lockup & Stadium Selector */}
          <div className="pointer-events-auto max-w-7xl w-full mx-auto my-auto">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular tracking-widest uppercase text-[#38BDF8] mb-2">
                <span>WORLD STADIUM EDITION</span>
                <span aria-hidden="true">·</span>
                <span>PRO GOALKEEPERS · CORNERS & GOAL KICKS · ONLINE 1V1</span>
              </div>

              {/* Bespoke SVG Title Lockup */}
              <svg
                viewBox="0 0 580 124"
                className="w-full max-w-[500px] h-auto drop-shadow-2xl"
                role="img"
                aria-label="FC 26 HyperMotion V"
              >
                <defs>
                  <linearGradient id="fcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#CBD5E1" />
                  </linearGradient>
                  <linearGradient id="voltGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#CCFF00" />
                    <stop offset="100%" stopColor="#38BDF8" />
                  </linearGradient>
                </defs>
                <polygon points="8,14 68,14 38,106" fill="#CCFF00" />
                <polygon points="44,14 84,14 54,106" fill="#38BDF8" opacity="0.88" />
                <text
                  x="102"
                  y="92"
                  fill="url(#fcGrad)"
                  fontFamily="'Barlow Condensed', sans-serif"
                  fontWeight="800"
                  fontStyle="italic"
                  fontSize="102"
                  letterSpacing="2"
                >
                  FC 26
                </text>
                <rect
                  x="348"
                  y="30"
                  width="218"
                  height="34"
                  rx="4"
                  fill="#090D16"
                  stroke="#CCFF00"
                  strokeWidth="2"
                />
                <text
                  x="457"
                  y="53"
                  textAnchor="middle"
                  fill="#CCFF00"
                  fontFamily="'Barlow Condensed', sans-serif"
                  fontWeight="800"
                  fontStyle="italic"
                  fontSize="22"
                  letterSpacing="3"
                >
                  HYPERMOTION V
                </text>
                <text
                  x="350"
                  y="90"
                  fill="url(#voltGrad)"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="700"
                  fontSize="13.5"
                  letterSpacing="1.4"
                >
                  ONLINE 1V1 · SKILL MOVES · IPAD PRO
                </text>
              </svg>

              <p className="text-sm md:text-base text-slate-300 mt-2 max-w-xl leading-relaxed">
                Complete match rules with 45:00 Half-Time, Corner Kicks, Goal Kicks, and diving
                Pro Goalkeepers. All players pause when you stop moving so you always control the tempo.
              </p>

              {/* Live 3D Stadium Selector Bar on Title Screen */}
              <div className="mt-4 bg-[#090D16]/90 border border-white/15 p-3 rounded-xl max-w-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-300">
                    Select 3D Stadium Venue ({currentStadium.city} · Cap. {currentStadium.capacity})
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(Object.keys(STADIUM_CATALOG) as StadiumId[]).map((stId) => {
                    const spec = STADIUM_CATALOG[stId];
                    const active = graphics.stadium === stId;
                    return (
                      <button
                        key={stId}
                        onClick={() => {
                          soundEngine.playUIClick();
                          setGraphics({ ...graphics, stadium: stId });
                        }}
                        className={`px-2.5 py-2 text-xs font-bold rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                            : 'bg-[#111827] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        <div className="truncate">
                          {spec.name.replace('Estadio ', '').replace('Stadio ', '')}
                        </div>
                        <div
                          className={`text-[10px] font-mono-tabular truncate ${
                            active ? 'text-[#070A10]/80' : 'text-slate-400'
                          }`}
                        >
                          {spec.city.split(',')[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Start CTAs */}
              <div className="flex flex-wrap items-center gap-2.5 mt-5">
                <button
                  onClick={() => startKickOff('PLAYER_VS_AI')}
                  className="px-5 py-3 text-sm font-display font-extrabold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d8ff33] text-[#070A10] rounded-lg shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Kick-Off: Player vs AI
                </button>

                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    setScreenState('ONLINE_LOBBY');
                  }}
                  className="px-5 py-3 text-sm font-display font-extrabold uppercase tracking-wider bg-emerald-400 hover:bg-emerald-300 text-[#070A10] rounded-lg shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Play Online With Friends
                </button>

                <button
                  onClick={() => startKickOff('AI_VS_AI')}
                  className="px-4 py-3 text-sm font-display font-extrabold uppercase tracking-wider bg-[#38BDF8] hover:bg-[#7dd3fc] text-[#070A10] rounded-lg shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                >
                  AI Mode: Director
                </button>

                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    setCustomizerZoomTarget('FULL_BODY');
                    setScreenState('CUSTOMIZER');
                  }}
                  className="px-4 py-3 text-sm font-display font-bold uppercase tracking-wider bg-[#090D16]/95 hover:bg-[#111827] text-white border border-white/20 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Customize Gear
                </button>
              </div>

              {/* Active Equipment Loadout Preview Strip */}
              <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-slate-300 font-mono-tabular">
                <span>
                  CAPTAIN: <strong className="text-white">#{equipment.starNumber} {equipment.starName}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  BOOTS: <strong className="text-[#CCFF00]">{currentBoot.name}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  TEMPO LOCK: <strong className="text-emerald-400">PAUSES WHEN USER IDLE</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Flat Control-Hint Line */}
          <div className="pointer-events-auto max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-3.5 text-xs font-mono-tabular text-slate-300">
            <div>
              WASD Move · C Close Dribble · 1-4 Skill Feints · Space Shoot / Slide Snatch · K Pass / Shift+K (Swipe Up) Upper Pass · L Through
            </div>
            <div className="text-slate-400">
              45:00 Half-Time · Corner Kicks · Goal Kicks · Online Friend Rooms
            </div>
          </div>
        </div>
      )}

      {/* 2. PRO LOCKER ROOM 3D EQUIPMENT CUSTOMIZER */}
      {screenState === 'CUSTOMIZER' && (
        <EquipmentCustomizerModal
          equipment={equipment}
          onChangeEquipment={setEquipment}
          zoomTarget={customizerZoomTarget}
          onChangeZoomTarget={setCustomizerZoomTarget}
          onCloseAndReturnToMatch={() => setScreenState('PLAYING')}
          onBackToTitle={() => setScreenState('TITLE')}
        />
      )}

      {/* 3. ONLINE MULTIPLAYER ROOM LOBBY */}
      {screenState === 'ONLINE_LOBBY' && (
        <OnlineLobbyModal
          onlineState={onlineState}
          selectedStadium={graphics.stadium}
          onSelectStadium={(st) => setGraphics({ ...graphics, stadium: st })}
          onChangePlayerName={(name) =>
            setOnlineState((prev) => ({ ...prev, playerName: name }))
          }
          onCreateRoom={async (customCode) => {
            await postOnlineAction({
              action: 'create',
              roomId: customCode,
              playerName: onlineState.playerName,
              stadium: graphics.stadium,
            });
          }}
          onJoinRoom={async (code) => {
            await postOnlineAction({
              action: 'join',
              roomId: code,
              playerName: onlineState.playerName,
              stadium: graphics.stadium,
            });
          }}
          onQuickMatch={async () => {
            await postOnlineAction({
              action: 'quick_match',
              playerName: onlineState.playerName,
              stadium: graphics.stadium,
            });
            soundEngine.playWhistle('kickoff');
            setGameMode('ONLINE_MULTIPLAYER');
            setScreenState('PLAYING');
          }}
          onLeaveRoom={async () => {
            const oldRoom = onlineState.roomId;
            sendWsMessage({ type: 'room:leave' });
            setOnlineState((prev) => ({ ...prev, roomId: null, room: null }));
            if (oldRoom) {
              await postOnlineAction({ action: 'leave', roomId: oldRoom });
            }
          }}
          onStartOnlineMatch={async () => {
            sendWsMessage({
              type: 'room:start_match',
              stadium: graphics.stadium,
            });
            if (onlineState.roomId) {
              await postOnlineAction({
                action: 'start_match',
                roomId: onlineState.roomId,
                stadium: graphics.stadium,
              });
            }
            soundEngine.playWhistle('kickoff');
            setGameMode('ONLINE_MULTIPLAYER');
            setScreenState('PLAYING');
          }}
          onSendChat={async (text) => {
            const msgId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            sendWsMessage({
              type: 'room:chat',
              id: msgId,
              text,
            });
            if (onlineState.roomId) {
              await postOnlineAction({
                action: 'chat',
                roomId: onlineState.roomId,
                playerName: onlineState.playerName,
                role: onlineState.role,
                id: msgId,
                text,
              });
            }
          }}
          onSearchPlayers={handleSearchPlayers}
          onSendFriendRequest={handleSendFriendRequest}
          onRespondFriendRequest={handleRespondFriendRequest}
          onPlayWithFriend={handlePlayWithFriend}
          onBackToTitle={() => setScreenState('MENU')}
        />
      )}

      {/* 4. PLAYING BROADCAST HUD */}
      {screenState === 'PLAYING' && (
        <MatchBroadcastHUD
          stats={stats}
          gameMode={gameMode}
          onToggleGameMode={setGameMode}
          equipment={equipment}
          onChangeEquipment={setEquipment}
          graphics={graphics}
          onChangeGraphics={setGraphics}
          aiTactics={aiTactics}
          onChangeAiTactics={setAiTactics}
          onTriggerTacticalCommand={setTacticalCommand}
          onOpenCustomizer={() => {
            setCustomizerZoomTarget('FULL_BODY');
            setScreenState('CUSTOMIZER');
          }}
          onOpenOnlineLobby={() => setScreenState('ONLINE_LOBBY')}
          onOpenPauseModal={() => setScreenState('PAUSED')}
          goalBanner={goalBanner}
          onSkipReplay={() => {
            setSkipReplaySignal((prev) => prev + 1);
            handleSkipGoalReplay();
          }}
          onPracticeCornerKick={() => setPracticeCornerSignal((p) => p + 1)}
          muted={muted}
          onToggleMute={handleToggleMute}
          touchInputRef={touchInputRef}
          onlineState={onlineState}
        />
      )}

      {/* 5. HALF-TIME LOCKER ROOM & TACTICAL BREAK MODAL (45:00) */}
      {screenState === 'HALF_TIME' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#05080F]/88 overflow-y-auto">
          <div className="w-full max-w-xl bg-[#090D16] border border-[#CCFF00]/40 rounded-2xl p-4 sm:p-6 shadow-2xl my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono-tabular uppercase tracking-widest text-[#CCFF00]">
                  45:00 HALF-TIME SHOW · {currentStadium.name.toUpperCase()}
                </div>
                <h2 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white mt-0.5">
                  First Half Complete — Locker Room
                </h2>
              </div>

              <div className="font-mono-tabular text-4xl font-extrabold text-[#CCFF00]">
                {stats.homeScore} <span className="text-slate-500">-</span> {stats.awayScore}
              </div>
            </div>

            {/* 1st Half Match Telemetry Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-4 text-center font-mono-tabular">
              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">POSSESSION</div>
                <div className="text-sm font-bold text-white mt-1">
                  {homePossPct}% / {100 - homePossPct}%
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">xG</div>
                <div className="text-sm font-bold text-[#CCFF00] mt-1">
                  {stats.homeXG.toFixed(2)} - {stats.awayXG.toFixed(2)}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">SHOTS</div>
                <div className="text-sm font-bold text-[#38BDF8] mt-1">
                  {stats.homeShots} - {stats.awayShots}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">CORNERS</div>
                <div className="text-sm font-bold text-amber-400 mt-1">
                  {stats.homeCorners} - {stats.awayCorners}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400">TACKLES</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">
                  {stats.homeTackles} - {stats.awayTackles}
                </div>
              </div>
            </div>

            {/* Half-Time Tactical Adjustment */}
            <div className="bg-[#111827] border border-white/10 rounded-xl p-3.5 mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                2nd Half Tactical Adjustment (Stamina Restored to 100%)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-1">
                    Home Team Formation
                  </label>
                  <select
                    value={aiTactics.formation}
                    onChange={(e) =>
                      setAiTactics({
                        ...aiTactics,
                        formation: e.target.value as FormationId,
                      })
                    }
                    className="w-full bg-[#090D16] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-white font-semibold"
                  >
                    <option value="4-3-3 Attack">4-3-3 Attack</option>
                    <option value="4-4-2 Classic">4-4-2 Classic</option>
                    <option value="3-5-2 Wingplay">3-5-2 Wingplay</option>
                    <option value="4-2-3-1 Control">4-2-3-1 Control</option>
                    <option value="5-3-2 Counter">5-3-2 Counter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-1">
                    2nd Half Mentality
                  </label>
                  <select
                    value={aiTactics.mentality}
                    onChange={(e) =>
                      setAiTactics({
                        ...aiTactics,
                        mentality: e.target.value as MentalityId,
                      })
                    }
                    className="w-full bg-[#090D16] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-white font-semibold"
                  >
                    <option value="Gegenpress">Gegenpress (High Press)</option>
                    <option value="Tiki-Taka">Tiki-Taka (Short Passing)</option>
                    <option value="Counter-Attack">Counter-Attack (Direct)</option>
                    <option value="All-Out Attack">All-Out Attack</option>
                    <option value="Park the Bus">Park the Bus</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setSecondHalfSignal((prev) => prev + 1);
                  setScreenState('PLAYING');
                }}
                className="w-full py-3.5 text-sm font-display font-extrabold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d8ff33] text-[#070A10] rounded-lg shadow-lg cursor-pointer"
              >
                Start 2nd Half Kick-Off (45:00)
              </button>

              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setCustomizerZoomTarget('FULL_BODY');
                  setScreenState('CUSTOMIZER');
                }}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-[#111827] hover:bg-white/10 text-white border border-white/15 rounded-lg cursor-pointer"
              >
                Customize Player Equipment Before 2nd Half
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6A. FULL-TIME POST-MATCH PROGRESSION MODAL */}
      {screenState === 'FULL_TIME' && (
        <PostMatchProgressionModal
          homeScore={stats.homeScore}
          awayScore={stats.awayScore}
          progressionResult={progressionResult}
          onPlayAgain={() => {
            soundEngine.playUIClick();
            setResetSignal((prev) => prev + 1);
            setScreenState('PLAYING');
          }}
          onOpenTeamManagement={() => {
            soundEngine.playUIClick();
            setScreenState('TEAM_MANAGEMENT');
          }}
          onOpenPlayerDraft={() => {
            soundEngine.playUIClick();
            setScreenState('PLAYER_DRAFT');
          }}
          onReturnToMenu={() => {
            soundEngine.playUIClick();
            setScreenState('MENU');
          }}
        />
      )}

      {/* 6B. MATCH PAUSE MODAL */}
      {screenState === 'PAUSED' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#05080F]/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-[#090D16] border border-white/15 rounded-2xl p-4 sm:p-6 shadow-2xl my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono-tabular uppercase tracking-widest text-[#CCFF00]">
                  MATCH PAUSED · {currentStadium.name.toUpperCase()}
                </div>
                <h2 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white mt-0.5">
                  Real Madrid vs Man City
                </h2>
              </div>

              <div className="font-mono-tabular text-4xl font-extrabold text-[#CCFF00]">
                {stats.homeScore} <span className="text-slate-500">-</span> {stats.awayScore}
              </div>
            </div>

            {/* Match Telemetry Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-5 text-center font-mono-tabular">
              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">POSSESSION</div>
                <div className="text-sm font-bold text-white mt-1">
                  {homePossPct}% / {100 - homePossPct}%
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">xG</div>
                <div className="text-sm font-bold text-[#CCFF00] mt-1">
                  {stats.homeXG.toFixed(2)} - {stats.awayXG.toFixed(2)}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">SHOTS</div>
                <div className="text-sm font-bold text-[#38BDF8] mt-1">
                  {stats.homeShots} - {stats.awayShots}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">CORNERS</div>
                <div className="text-sm font-bold text-amber-400 mt-1">
                  {stats.homeCorners} - {stats.awayCorners}
                </div>
              </div>

              <div className="bg-[#111827] border border-white/10 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400">TACKLES</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">
                  {stats.homeTackles} - {stats.awayTackles}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setScreenState('PLAYING');
                }}
                className="w-full py-3 text-sm font-display font-extrabold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d8ff33] text-[#070A10] rounded-lg cursor-pointer shadow-lg active:scale-[0.99] transition-transform"
              >
                Resume Match (Esc)
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    setScreenState('MENU');
                  }}
                  className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 rounded-lg cursor-pointer"
                >
                  🏠 Menu Hub
                </button>

                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    setScreenState('PLAYER_DRAFT');
                  }}
                  className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 rounded-lg cursor-pointer"
                >
                  🪙 Player Draft
                </button>

                <button
                  onClick={() => {
                    soundEngine.playUIClick();
                    setScreenState('TEAM_MANAGEMENT');
                  }}
                  className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-lg cursor-pointer"
                >
                  📋 Lineup
                </button>
              </div>

              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setResetSignal((prev) => prev + 1);
                  setScreenState('PLAYING');
                }}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-[#38BDF8] hover:bg-[#7dd3fc] text-[#070A10] rounded-lg cursor-pointer"
              >
                Restart Match Kick-Off
              </button>

              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setCustomizerZoomTarget('FULL_BODY');
                  setScreenState('CUSTOMIZER');
                }}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-[#111827] hover:bg-white/10 text-white border border-white/15 rounded-lg cursor-pointer"
              >
                Customize Equipment (3D Locker)
              </button>

              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  setScreenState('ONLINE_LOBBY');
                }}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg cursor-pointer"
              >
                Online Multiplayer & Friends Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

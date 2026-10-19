import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import ngrok from '@ngrok/ngrok';
import localtunnel from 'localtunnel';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  playerName: string;
  roomId: string | null;
  role: 'HOME' | 'AWAY' | 'SPECTATOR';
}

interface OnlineUserProfile {
  clientId: string;
  playerName: string;
  clubName: string;
  squadOvr: string;
  lastSeenAt: number;
  currentRoomId: string | null;
  isSimulatedPro?: boolean;
}

interface StoredFriendRequest {
  id: string;
  fromClientId: string;
  fromName: string;
  fromOvr: string;
  toClientId: string;
  toName: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: number;
}

interface StoredMatchInvite {
  id: string;
  fromClientId: string;
  fromName: string;
  toClientId: string;
  toName: string;
  roomId: string;
  stadium: string;
  createdAt: number;
}

interface ChatMessage {
  id: string;
  sender: string;
  role: 'HOME' | 'AWAY' | 'SPECTATOR';
  text: string;
  timestamp: number;
}

interface OnlineRoom {
  roomId: string;
  stadium: string;
  status: 'WAITING' | 'PLAYING';
  hostClientId: string | null;
  hostName: string;
  hostLastSeenAt: number;
  guestClientId: string | null;
  guestName: string | null;
  guestLastSeenAt: number;
  createdAt: number;
  updatedAt: number;
  chatMessages: ChatMessage[];
  lastMatchSnapshot: unknown | null;
  lastSnapshotAt: number;
  lastGuestInput: unknown | null;
  lastGoalEvent: {
    id: string;
    scorerName: string;
    team: 'HOME' | 'AWAY';
    homeScore: number;
    awayScore: number;
  } | null;
}

const rooms = new Map<string, OnlineRoom>();
const clients = new Map<string, ConnectedClient>();
const onlineUsers = new Map<string, OnlineUserProfile>();
const friendRequests: StoredFriendRequest[] = [];
const matchInvites: StoredMatchInvite[] = [];

// Seed active online community captains so searching names always finds online players even in single-browser testing
const SEEDED_PRO_CAPTAINS: OnlineUserProfile[] = [
  {
    clientId: 'pro_alex_fc26',
    playerName: 'Alex_FC26',
    clubName: 'Real Madrid Icons',
    squadOvr: '112.4',
    lastSeenAt: Date.now(),
    currentRoomId: null,
    isSimulatedPro: true,
  },
  {
    clientId: 'pro_madrid_king',
    playerName: 'MadridKing7',
    clubName: 'Bernabéu Ultra',
    squadOvr: '118.0',
    lastSeenAt: Date.now(),
    currentRoomId: null,
    isSimulatedPro: true,
  },
  {
    clientId: 'pro_leo_120',
    playerName: 'LeoGoat120',
    clubName: 'Mythic XI',
    squadOvr: '120.0',
    lastSeenAt: Date.now(),
    currentRoomId: null,
    isSimulatedPro: true,
  },
  {
    clientId: 'pro_cr7_striker',
    playerName: 'CR7_Rocket',
    clubName: 'CR7 Galaxy FC',
    squadOvr: '119.5',
    lastSeenAt: Date.now(),
    currentRoomId: null,
    isSimulatedPro: true,
  },
  {
    clientId: 'pro_yamal_star',
    playerName: 'LamineStar19',
    clubName: 'NextGen FC',
    squadOvr: '96.2',
    lastSeenAt: Date.now(),
    currentRoomId: null,
    isSimulatedPro: true,
  },
];

for (const bot of SEEDED_PRO_CAPTAINS) {
  onlineUsers.set(bot.clientId, bot);
}

function isClientActive(clientId: string | null, lastSeenAt: number): boolean {
  if (!clientId) return false;
  if (clientId.startsWith('pro_')) return true;
  if (Date.now() - lastSeenAt < 15000) return true;
  const wsClient = clients.get(clientId);
  return Boolean(wsClient && wsClient.ws.readyState === WebSocket.OPEN);
}

function upsertOnlineUser(
  clientId: string,
  playerName: string,
  clubName = 'Apex FC',
  squadOvr = '91.0',
  currentRoomId: string | null = null
) {
  const cleanName = (playerName || 'Captain').trim().slice(0, 18) || 'Captain';
  const existing = onlineUsers.get(clientId);
  onlineUsers.set(clientId, {
    clientId,
    playerName: cleanName,
    clubName: clubName || existing?.clubName || 'Apex FC',
    squadOvr: squadOvr || existing?.squadOvr || '91.0',
    lastSeenAt: Date.now(),
    currentRoomId: currentRoomId !== null ? currentRoomId : existing?.currentRoomId ?? null,
    isSimulatedPro: false,
  });
}

function matchesUser(
  targetClientId: string,
  targetName: string,
  clientId: string,
  playerName: string
): boolean {
  if (targetClientId && clientId && targetClientId === clientId) return true;
  if (
    targetName &&
    playerName &&
    targetName.trim().toLowerCase() === playerName.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

function getSocialPayloadForUser(clientId: string, playerName: string) {
  const now = Date.now();
  const incomingRequests = friendRequests.filter(
    (r) =>
      r.status === 'PENDING' &&
      matchesUser(r.toClientId, r.toName, clientId, playerName)
  );
  const outgoingRequests = friendRequests.filter(
    (r) =>
      r.status === 'PENDING' &&
      matchesUser(r.fromClientId, r.fromName, clientId, playerName)
  );

  // Build accepted friends list
  const acceptedRows = friendRequests.filter(
    (r) =>
      r.status === 'ACCEPTED' &&
      (matchesUser(r.fromClientId, r.fromName, clientId, playerName) ||
        matchesUser(r.toClientId, r.toName, clientId, playerName))
  );

  const friendsMap = new Map<
    string,
    {
      friendClientId: string;
      friendName: string;
      friendOvr: string;
      online: boolean;
      roomId: string | null;
    }
  >();

  for (const r of acceptedRows) {
    const isSender = matchesUser(r.fromClientId, r.fromName, clientId, playerName);
    const fClientId = isSender ? r.toClientId : r.fromClientId;
    const fName = isSender ? r.toName : r.fromName;

    // Look up latest online presence by clientId or name
    let liveProfile = onlineUsers.get(fClientId);
    if (!liveProfile) {
      for (const u of onlineUsers.values()) {
        if (u.playerName.toLowerCase() === fName.toLowerCase()) {
          liveProfile = u;
          break;
        }
      }
    }

    const isOnline = liveProfile
      ? isClientActive(liveProfile.clientId, liveProfile.lastSeenAt)
      : false;

    friendsMap.set(fName.toLowerCase(), {
      friendClientId: liveProfile?.clientId || fClientId,
      friendName: liveProfile?.playerName || fName,
      friendOvr: liveProfile?.squadOvr || r.fromOvr || '92.0',
      online: isOnline,
      roomId: liveProfile?.currentRoomId || null,
    });
  }

  const activeInvites = matchInvites.filter(
    (inv) =>
      now - inv.createdAt < 90000 &&
      matchesUser(inv.toClientId, inv.toName, clientId, playerName)
  );

  return {
    incomingRequests,
    outgoingRequests,
    friends: Array.from(friendsMap.values()),
    matchInvites: activeInvites,
  };
}

function notifyUserViaWs(targetClientId: string, targetName: string, payload: unknown) {
  const raw = JSON.stringify(payload);
  for (const c of clients.values()) {
    if (
      (c.clientId === targetClientId ||
        c.playerName.trim().toLowerCase() === targetName.trim().toLowerCase()) &&
      c.ws.readyState === WebSocket.OPEN
    ) {
      c.ws.send(raw);
    }
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastToRoom(roomId: string, payload: unknown, excludeClientId?: string) {
  const message = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (
      client.roomId === roomId &&
      client.clientId !== excludeClientId &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(message);
    }
  }
}

function getRoomPublicSummary(room: OnlineRoom) {
  return {
    roomId: room.roomId,
    stadium: room.stadium,
    status: room.status,
    hostName: room.hostName,
    guestName: room.guestName,
    playerCount: (room.hostClientId ? 1 : 0) + (room.guestClientId ? 1 : 0),
    chatMessages: room.chatMessages.slice(-20),
  };
}

function createOrJoinRoomLogic(
  clientId: string,
  playerName: string,
  mode: 'create' | 'join' | 'quick_match',
  requestedRoomId?: string,
  stadium: string = 'santiago_bernabeu'
): {
  room: OnlineRoom;
  role: 'HOME' | 'AWAY' | 'SPECTATOR';
} {
  const cleanName = (playerName || 'Captain').slice(0, 18);
  const now = Date.now();

  // Prune stale rooms where neither host nor guest has been active in 12s
  for (const [code, r] of rooms.entries()) {
    const hostAlive = isClientActive(r.hostClientId, r.hostLastSeenAt);
    const guestAlive = isClientActive(r.guestClientId, r.guestLastSeenAt);
    if (!hostAlive && !guestAlive && now - r.updatedAt > 12000) {
      rooms.delete(code);
    } else if (!hostAlive && guestAlive && r.guestClientId) {
      r.hostClientId = r.guestClientId;
      r.hostName = r.guestName || 'Host';
      r.hostLastSeenAt = r.guestLastSeenAt;
      r.guestClientId = null;
      r.guestName = null;
      r.guestLastSeenAt = 0;
    }
  }

  // If mode is 'create' and requestedRoomId already exists and belongs to this host, return it idempotently!
  if (mode === 'create' && requestedRoomId) {
    const existingCode = requestedRoomId.trim().toUpperCase().slice(0, 6);
    const existingRoom = rooms.get(existingCode);
    if (existingRoom && existingRoom.hostClientId === clientId) {
      existingRoom.hostLastSeenAt = now;
      return { room: existingRoom, role: 'HOME' };
    }
  }

  if (mode === 'create') {
    const code =
      requestedRoomId && requestedRoomId.trim().length >= 3
        ? requestedRoomId.trim().toUpperCase().slice(0, 6)
        : generateRoomCode();
    const finalCode = rooms.has(code) ? generateRoomCode() : code;

    const newRoom: OnlineRoom = {
      roomId: finalCode,
      stadium,
      status: 'WAITING',
      hostClientId: clientId,
      hostName: cleanName,
      hostLastSeenAt: now,
      guestClientId: null,
      guestName: null,
      guestLastSeenAt: 0,
      createdAt: now,
      updatedAt: now,
      chatMessages: [
        {
          id: `sys_${now}`,
          sender: 'STADIUM NETWORK',
          role: 'HOME',
          text: `${cleanName} created Room ${finalCode} (Real Madrid - HOME). Share code ${finalCode} with a friend!`,
          timestamp: now,
        },
      ],
      lastMatchSnapshot: null,
      lastSnapshotAt: 0,
      lastGuestInput: null,
      lastGoalEvent: null,
    };
    rooms.set(finalCode, newRoom);
    return { room: newRoom, role: 'HOME' };
  }

  let targetRoom: OnlineRoom | undefined;
  if (mode === 'quick_match') {
    for (const r of rooms.values()) {
      if (r.hostClientId === clientId) {
        targetRoom = r;
        break;
      }
      if (
        r.hostClientId &&
        isClientActive(r.hostClientId, r.hostLastSeenAt) &&
        !r.guestClientId &&
        r.hostClientId !== clientId
      ) {
        targetRoom = r;
        break;
      }
    }
  } else if (requestedRoomId) {
    targetRoom = rooms.get(requestedRoomId.trim().toUpperCase());
  }

  if (!targetRoom) {
    const created = createOrJoinRoomLogic(
      clientId,
      cleanName,
      'create',
      requestedRoomId,
      stadium
    );
    if (mode === 'quick_match') {
      created.room.status = 'PLAYING';
    }
    return created;
  }

  let assignedRole: 'HOME' | 'AWAY' | 'SPECTATOR' = 'AWAY';
  const alreadyInRoom =
    targetRoom.hostClientId === clientId || targetRoom.guestClientId === clientId;

  const hostCurrentlyAlive = isClientActive(
    targetRoom.hostClientId,
    targetRoom.hostLastSeenAt
  );

  if (!targetRoom.hostClientId || targetRoom.hostClientId === clientId || !hostCurrentlyAlive) {
    targetRoom.hostClientId = clientId;
    targetRoom.hostName = cleanName;
    targetRoom.hostLastSeenAt = now;
    assignedRole = 'HOME';
  } else if (
    !targetRoom.guestClientId ||
    targetRoom.guestClientId === clientId ||
    !isClientActive(targetRoom.guestClientId, targetRoom.guestLastSeenAt)
  ) {
    targetRoom.guestClientId = clientId;
    targetRoom.guestName = cleanName;
    targetRoom.guestLastSeenAt = now;
    assignedRole = 'AWAY';
  } else {
    assignedRole = 'SPECTATOR';
  }

  if (mode === 'quick_match') {
    targetRoom.status = 'PLAYING';
  }

  targetRoom.updatedAt = now;
  if (!alreadyInRoom) {
    targetRoom.chatMessages.push({
      id: `join_${clientId}_${now}`,
      sender: 'STADIUM NETWORK',
      role: assignedRole,
      text: `${cleanName} joined Room ${targetRoom.roomId} as ${
        assignedRole === 'AWAY' ? 'Manchester City (AWAY)' : 'Real Madrid (HOME)'
      }!`,
      timestamp: now,
    });
  }

  broadcastToRoom(targetRoom.roomId, {
    type: 'room:state',
    room: getRoomPublicSummary(targetRoom),
  });

  return { room: targetRoom, role: assignedRole };
}

function handleOnlineHttpAction(req: express.Request, res: express.Response) {
  const {
    action,
    clientId = `http_${Math.random().toString(36).slice(2, 9)}`,
    playerName = 'Captain',
    clubName = 'Apex FC',
    squadOvr = '91.0',
    roomId,
    stadium = 'santiago_bernabeu',
    text,
    id,
    chatId,
    snapshot,
    input,
    query = '',
    targetClientId = '',
    targetPlayerName = '',
    requestId = '',
    decision = 'ACCEPT',
  } = req.body || {};

  const now = Date.now();
  upsertOnlineUser(clientId, playerName, clubName, squadOvr, roomId || null);

  if (action === 'heartbeat') {
    return res.json({
      ok: true,
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'search_players') {
    const cleanQ = String(query || '').trim().toLowerCase();
    const results: Array<{
      clientId: string;
      playerName: string;
      clubName: string;
      squadOvr: string;
      online: boolean;
      currentRoomId: string | null;
    }> = [];

    for (const u of onlineUsers.values()) {
      if (u.clientId === clientId) continue;
      if (
        !cleanQ ||
        u.playerName.toLowerCase().includes(cleanQ) ||
        u.clubName.toLowerCase().includes(cleanQ)
      ) {
        results.push({
          clientId: u.clientId,
          playerName: u.playerName,
          clubName: u.clubName,
          squadOvr: u.squadOvr,
          online: isClientActive(u.clientId, u.lastSeenAt),
          currentRoomId: u.currentRoomId,
        });
      }
    }

    // If user searched a specific name not yet in onlineUsers, register an online captain entry so any searched friend name can be found
    if (
      cleanQ.length >= 2 &&
      !results.some((r) => r.playerName.toLowerCase() === cleanQ) &&
      cleanQ !== String(playerName).trim().toLowerCase()
    ) {
      const displayTarget = String(query).trim().slice(0, 18);
      const simId = `pro_custom_${cleanQ.replace(/[^a-z0-9]/g, '')}`;
      const simUser: OnlineUserProfile = {
        clientId: simId,
        playerName: displayTarget,
        clubName: `${displayTarget} FC`,
        squadOvr: '94.5',
        lastSeenAt: now,
        currentRoomId: null,
        isSimulatedPro: true,
      };
      onlineUsers.set(simId, simUser);
      results.unshift({
        clientId: simUser.clientId,
        playerName: simUser.playerName,
        clubName: simUser.clubName,
        squadOvr: simUser.squadOvr,
        online: true,
        currentRoomId: null,
      });
    }

    return res.json({
      results: results.slice(0, 12),
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'send_friend_request') {
    const cleanTargetName = String(targetPlayerName || '').trim().slice(0, 18);
    if (!cleanTargetName) {
      return res.status(400).json({ error: 'Target player name required.' });
    }

    // Check if there is a real connected user with that name first
    let resolvedTarget: OnlineUserProfile | undefined;
    for (const u of onlineUsers.values()) {
      if (
        !u.isSimulatedPro &&
        (u.clientId === targetClientId ||
          u.playerName.toLowerCase() === cleanTargetName.toLowerCase())
      ) {
        resolvedTarget = u;
        break;
      }
    }
    if (!resolvedTarget) {
      resolvedTarget =
        onlineUsers.get(targetClientId) ||
        Array.from(onlineUsers.values()).find(
          (u) => u.playerName.toLowerCase() === cleanTargetName.toLowerCase()
        );
    }

    const finalToClientId = resolvedTarget?.clientId || targetClientId || `user_${cleanTargetName.toLowerCase()}`;
    const finalToName = resolvedTarget?.playerName || cleanTargetName;

    let reqItem = friendRequests.find(
      (r) =>
        r.status !== 'DECLINED' &&
        ((matchesUser(r.fromClientId, r.fromName, clientId, playerName) &&
          matchesUser(r.toClientId, r.toName, finalToClientId, finalToName)) ||
          (matchesUser(r.fromClientId, r.fromName, finalToClientId, finalToName) &&
            matchesUser(r.toClientId, r.toName, clientId, playerName)))
    );

    if (!reqItem) {
      reqItem = {
        id: `freq_${now}_${Math.random().toString(36).slice(2, 7)}`,
        fromClientId: clientId,
        fromName: playerName,
        fromOvr: squadOvr,
        toClientId: finalToClientId,
        toName: finalToName,
        status: 'PENDING',
        createdAt: now,
      };
      friendRequests.push(reqItem);
    }

    // Notify target friend immediately over WebSocket if they are online
    notifyUserViaWs(finalToClientId, finalToName, {
      type: 'friend:request_received',
      request: reqItem,
    });

    // If the target is a simulated online captain (and no real browser tab owns that name), auto-accept after 2.2s so single-player testing also works!
    if (resolvedTarget?.isSimulatedPro) {
      const capturedReq = reqItem;
      setTimeout(() => {
        // Only auto-accept if no real user with that name has connected in the meantime
        const realUserExists = Array.from(onlineUsers.values()).some(
          (u) =>
            !u.isSimulatedPro &&
            u.playerName.toLowerCase() === finalToName.toLowerCase()
        );
        if (!realUserExists && capturedReq.status === 'PENDING') {
          capturedReq.status = 'ACCEPTED';
          notifyUserViaWs(clientId, playerName, {
            type: 'friend:request_accepted',
            request: capturedReq,
          });
        }
      }, 2200);
    }

    return res.json({
      ok: true,
      request: reqItem,
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'respond_friend_request') {
    const reqItem = friendRequests.find((r) => r.id === requestId);
    if (!reqItem) {
      return res.status(404).json({ error: 'Friend request not found.' });
    }
    reqItem.status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    if (reqItem.status === 'ACCEPTED') {
      notifyUserViaWs(reqItem.fromClientId, reqItem.fromName, {
        type: 'friend:request_accepted',
        request: reqItem,
      });
    }
    return res.json({
      ok: true,
      request: reqItem,
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'invite_friend_match') {
    // Ensure host has an active room
    const { room, role } = createOrJoinRoomLogic(
      clientId,
      playerName,
      'create',
      roomId,
      stadium
    );
    upsertOnlineUser(clientId, playerName, clubName, squadOvr, room.roomId);

    const invite: StoredMatchInvite = {
      id: `minv_${now}_${Math.random().toString(36).slice(2, 6)}`,
      fromClientId: clientId,
      fromName: playerName,
      toClientId: targetClientId,
      toName: targetPlayerName,
      roomId: room.roomId,
      stadium: room.stadium,
      createdAt: now,
    };
    matchInvites.push(invite);

    notifyUserViaWs(targetClientId, targetPlayerName, {
      type: 'friend:match_invite',
      invite,
    });

    // If inviting a simulated online friend, have them join the room as AWAY guest after 1.5s!
    const targetProfile = onlineUsers.get(targetClientId);
    if (targetProfile?.isSimulatedPro) {
      setTimeout(() => {
        if (!room.guestClientId) {
          room.guestClientId = targetProfile.clientId;
          room.guestName = targetProfile.playerName;
          room.guestLastSeenAt = Date.now();
          room.chatMessages.push({
            id: `sim_join_${Date.now()}`,
            sender: targetProfile.playerName,
            role: 'AWAY',
            text: `Hey ${playerName}! Accepted your friend invite — ready for Kick-Off!`,
            timestamp: Date.now(),
          });
          broadcastToRoom(room.roomId, {
            type: 'room:state',
            room: getRoomPublicSummary(room),
          });
        }
      }, 1200);
    }

    return res.json({
      ok: true,
      roomId: room.roomId,
      role,
      room: getRoomPublicSummary(room),
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'create' || action === 'join' || action === 'quick_match') {
    const { room, role } = createOrJoinRoomLogic(
      clientId,
      playerName,
      action,
      roomId,
      stadium
    );
    upsertOnlineUser(clientId, playerName, clubName, squadOvr, room.roomId);
    const wsClient = clients.get(clientId);
    if (wsClient) {
      wsClient.roomId = room.roomId;
      wsClient.role = role;
      wsClient.playerName = playerName;
    }
    return res.json({
      roomId: room.roomId,
      role,
      room: getRoomPublicSummary(room),
      initialSnapshot: room.lastMatchSnapshot,
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (!roomId) return res.status(400).json({ error: 'Missing roomId' });
  const room = rooms.get(String(roomId).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (room.hostClientId === clientId) {
    room.hostLastSeenAt = now;
  } else if (room.guestClientId === clientId) {
    room.guestLastSeenAt = now;
    // If host became inactive, auto-promote guest to HOME so their game never stalls
    if (!isClientActive(room.hostClientId, room.hostLastSeenAt)) {
      room.hostClientId = clientId;
      room.hostName = room.guestName || playerName || 'Host';
      room.hostLastSeenAt = now;
      room.guestClientId = null;
      room.guestName = null;
      room.guestLastSeenAt = 0;
    }
  }

  const currentRole =
    room.hostClientId === clientId
      ? 'HOME'
      : room.guestClientId === clientId
      ? 'AWAY'
      : 'SPECTATOR';

  if (action === 'poll') {
    return res.json({
      role: currentRole,
      room: getRoomPublicSummary(room),
      snapshot: room.lastMatchSnapshot,
      snapshotAgeMs: room.lastSnapshotAt ? now - room.lastSnapshotAt : 99999,
      guestInput: room.lastGuestInput,
      goalEvent: room.lastGoalEvent,
      ...getSocialPayloadForUser(clientId, playerName),
    });
  }

  if (action === 'sync_state' && snapshot) {
    room.lastMatchSnapshot = snapshot;
    room.lastSnapshotAt = now;
    room.hostLastSeenAt = now;
    room.updatedAt = now;
    broadcastToRoom(
      room.roomId,
      {
        type: 'match:state',
        snapshot,
      },
      clientId
    );
    return res.json({ ok: true, guestInput: room.lastGuestInput });
  }

  if (action === 'guest_input' && input) {
    room.lastGuestInput = input;
    room.guestLastSeenAt = now;
    room.updatedAt = now;
    if (room.hostClientId) {
      const host = clients.get(room.hostClientId);
      if (host && host.ws.readyState === WebSocket.OPEN) {
        host.ws.send(JSON.stringify({ type: 'player:input', input }));
      }
    }
    return res.json({
      ok: true,
      role: currentRole,
      snapshot: room.lastMatchSnapshot,
      snapshotAgeMs: room.lastSnapshotAt ? now - room.lastSnapshotAt : 99999,
    });
  }

  if (action === 'start_match') {
    room.status = 'PLAYING';
    if (stadium) room.stadium = stadium;
    room.updatedAt = now;
    broadcastToRoom(room.roomId, {
      type: 'match:started',
      room: getRoomPublicSummary(room),
    });
    return res.json({ role: currentRole, room: getRoomPublicSummary(room) });
  }

  if (action === 'chat' && typeof text === 'string') {
    const msgId = id || chatId || `chat_${Date.now()}_${Math.random()}`;
    if (!room.chatMessages.some((m) => m.id === msgId)) {
      const role = room.hostClientId === clientId ? 'HOME' : 'AWAY';
      const entry: ChatMessage = {
        id: msgId,
        sender: playerName,
        role,
        text: text.slice(0, 140),
        timestamp: Date.now(),
      };
      room.chatMessages.push(entry);
      if (room.chatMessages.length > 40) room.chatMessages.shift();
      broadcastToRoom(room.roomId, {
        type: 'room:chat_message',
        message: entry,
      });
    }
    return res.json({ room: getRoomPublicSummary(room) });
  }

  if (action === 'leave') {
    if (room.hostClientId === clientId) {
      if (room.guestClientId) {
        room.hostClientId = room.guestClientId;
        room.hostName = room.guestName || 'Host';
        room.guestClientId = null;
        room.guestName = null;
      } else {
        rooms.delete(room.roomId);
        return res.json({ left: true });
      }
    } else if (room.guestClientId === clientId) {
      room.guestClientId = null;
      room.guestName = null;
    }
    return res.json({ left: true, room: getRoomPublicSummary(room) });
  }

  return res.json({ room: getRoomPublicSummary(room) });
}

function getNgrokAuthtoken(): string | undefined {
  if (process.env.NGROK_AUTHTOKEN && process.env.NGROK_AUTHTOKEN.trim().length > 0) {
    return process.env.NGROK_AUTHTOKEN.trim();
  }
  const localAppData = process.env.LOCALAPPDATA || '';
  const ymlPath = path.join(localAppData, 'ngrok', 'ngrok.yml');
  if (fs.existsSync(ymlPath)) {
    try {
      const content = fs.readFileSync(ymlPath, 'utf8');
      const m = content.match(/authtoken:\s*([^\s\r\n]+)/);
      if (m && m[1]) return m[1].trim();
    } catch {
      // Ignore read error
    }
  }
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const altYml = path.join(homeDir, '.config', 'ngrok', 'ngrok.yml');
  if (fs.existsSync(altYml)) {
    try {
      const content = fs.readFileSync(altYml, 'utf8');
      const m = content.match(/authtoken:\s*([^\s\r\n]+)/);
      if (m && m[1]) return m[1].trim();
    } catch {
      // Ignore read error
    }
  }
  return undefined;
}

let activeNgrokListener: ngrok.Listener | null = null;
let dynamicNgrokUrl: string | null = null;
let ngrokLastError: string | null = null;
let isNgrokStarting = false;

let activeLocaltunnel: any = null;
let dynamicLocaltunnelUrl: string | null = null;
let localtunnelLastError: string | null = null;
let isLocaltunnelStarting = false;
let hostPublicIp: string | null = null;

let activeCloudflaredProcess: ChildProcess | null = null;
let dynamicCloudflareUrl: string | null = null;
let cloudflareLastError: string | null = null;
let isCloudflareStarting = false;

let activeTunnelProvider: 'localtunnel' | 'ngrok' | 'cloudflare' = 'localtunnel';
let currentActiveTunnelUrl: string | null = null;

async function fetchHostPublicIp(): Promise<string> {
  if (hostPublicIp) return hostPublicIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3500) });
    const data = await res.json();
    if (data?.ip) {
      hostPublicIp = data.ip;
      return hostPublicIp;
    }
  } catch {
    // Ignore
  }
  return '';
}

async function startLocaltunnel(port: number, forceNew: boolean = false): Promise<string | null> {
  if (isLocaltunnelStarting) return dynamicLocaltunnelUrl;
  if (activeLocaltunnel && !forceNew) return dynamicLocaltunnelUrl;
  isLocaltunnelStarting = true;
  localtunnelLastError = null;

  try {
    if (activeLocaltunnel) {
      try {
        activeLocaltunnel.close();
      } catch {
        // Ignore
      }
      activeLocaltunnel = null;
      dynamicLocaltunnelUrl = null;
    }

    console.log(`[LOCALTUNNEL] Forwarding free unlimited dynamic tunnel on port ${port}...`);
    const tunnel = await localtunnel({ port });
    activeLocaltunnel = tunnel;
    dynamicLocaltunnelUrl = tunnel.url;

    tunnel.on('close', () => {
      dynamicLocaltunnelUrl = null;
      activeLocaltunnel = null;
    });

    tunnel.on('error', (err: any) => {
      console.warn('[LOCALTUNNEL] Tunnel error:', err?.message || err);
      localtunnelLastError = err?.message || String(err);
    });

    fetchHostPublicIp().catch(() => {});
    console.log(`[LOCALTUNNEL] ✓ Free Dynamic Tunnel active: ${dynamicLocaltunnelUrl}`);
    return dynamicLocaltunnelUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[LOCALTUNNEL] Warning: Could not start localtunnel: ${msg}`);
    localtunnelLastError = msg;
    return null;
  } finally {
    isLocaltunnelStarting = false;
  }
}

function findCloudflaredPath(): string {
  const commonPaths = [
    'cloudflared',
    'cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'cloudflared.exe';
}

async function startCloudflareTunnel(port: number, forceNew: boolean = false): Promise<string | null> {
  if (isCloudflareStarting) return dynamicCloudflareUrl;
  if (activeCloudflaredProcess && !forceNew) return dynamicCloudflareUrl;
  isCloudflareStarting = true;
  cloudflareLastError = null;

  try {
    if (activeCloudflaredProcess) {
      try {
        activeCloudflaredProcess.kill();
      } catch {
        // Ignore
      }
      activeCloudflaredProcess = null;
      dynamicCloudflareUrl = null;
    }

    const bin = findCloudflaredPath();
    console.log(`[CLOUDFLARE] Launching free dynamic tunnel on port ${port}...`);

    return await new Promise<string | null>((resolve) => {
      let resolved = false;
      const cp = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      activeCloudflaredProcess = cp;

      const handleData = (chunk: Buffer) => {
        const text = chunk.toString();
        const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (m && !resolved) {
          resolved = true;
          dynamicCloudflareUrl = m[0];
          console.log(`[CLOUDFLARE] ✓ Dynamic Tunnel active: ${dynamicCloudflareUrl}`);
          resolve(dynamicCloudflareUrl);
        }
      };

      cp.stdout?.on('data', handleData);
      cp.stderr?.on('data', handleData);

      cp.on('error', (err) => {
        console.warn('[CLOUDFLARE] Process error:', err.message);
        cloudflareLastError = err.message;
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      cp.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          cloudflareLastError = `Cloudflared exited with code ${code}`;
          resolve(null);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(dynamicCloudflareUrl);
        }
      }, 12000);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cloudflareLastError = msg;
    return null;
  } finally {
    isCloudflareStarting = false;
  }
}

async function startNgrokTunnel(port: number, forceNew: boolean = false): Promise<string | null> {
  if (isNgrokStarting) {
    return dynamicNgrokUrl;
  }
  if (activeNgrokListener && !forceNew) {
    return dynamicNgrokUrl;
  }
  isNgrokStarting = true;
  ngrokLastError = null;
  try {
    if (activeNgrokListener) {
      try {
        await activeNgrokListener.close();
      } catch {
        // Ignore close error
      }
      activeNgrokListener = null;
      dynamicNgrokUrl = null;
    }

    const token = getNgrokAuthtoken();
    console.log(`[NGROK] Forwarding free dynamic tunnel for port ${port}...`);
    // Connect without domain to get an ephemeral changing dynamic URL on free tier
    const listener = await ngrok.forward({
      addr: port,
      authtoken: token,
    });
    activeNgrokListener = listener;
    dynamicNgrokUrl = listener.url() || null;
    console.log(`[NGROK] ✓ Free Dynamic Tunnel active: ${dynamicNgrokUrl}`);
    return dynamicNgrokUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[NGROK] Warning: Could not start dynamic tunnel: ${msg}`);
    ngrokLastError = msg;
    return null;
  } finally {
    isNgrokStarting = false;
  }
}

async function startDynamicTunnel(
  port: number,
  preferredProvider: 'localtunnel' | 'ngrok' | 'cloudflare' = 'localtunnel',
  forceNew: boolean = false
): Promise<{ url: string | null; provider: 'localtunnel' | 'ngrok' | 'cloudflare'; error: string | null; publicIp?: string | null }> {
  activeTunnelProvider = preferredProvider;

  if (preferredProvider === 'ngrok') {
    const ngUrl = await startNgrokTunnel(port, forceNew);
    // If ngrok bandwidth is exceeded (e.g. ERR_NGROK_725) or error, auto-fallback to localtunnel!
    if (!ngUrl || (ngrokLastError && (ngrokLastError.includes('725') || ngrokLastError.toLowerCase().includes('bandwidth')))) {
      console.warn('[TUNNEL] ngrok monthly bandwidth exceeded (ERR_NGROK_725). Auto-switching to Localtunnel (Unlimited Free)...');
      const ltUrl = await startLocaltunnel(port, forceNew);
      if (ltUrl) {
        activeTunnelProvider = 'localtunnel';
        currentActiveTunnelUrl = ltUrl;
        return {
          url: ltUrl,
          provider: 'localtunnel',
          error: 'ngrok bandwidth limit reached (1GB cap). Switched to Localtunnel (100% Free & Unlimited Bandwidth).',
          publicIp: hostPublicIp,
        };
      }
    }
    if (ngUrl) {
      currentActiveTunnelUrl = ngUrl;
      return { url: ngUrl, provider: 'ngrok', error: null };
    }
    return { url: null, provider: 'ngrok', error: ngrokLastError };
  } else if (preferredProvider === 'localtunnel') {
    const ltUrl = await startLocaltunnel(port, forceNew);
    if (ltUrl) {
      currentActiveTunnelUrl = ltUrl;
      return { url: ltUrl, provider: 'localtunnel', error: null, publicIp: hostPublicIp };
    }
    // Fallback to ngrok
    const ngUrl = await startNgrokTunnel(port, forceNew);
    if (ngUrl) {
      activeTunnelProvider = 'ngrok';
      currentActiveTunnelUrl = ngUrl;
      return { url: ngUrl, provider: 'ngrok', error: null };
    }
    return { url: null, provider: 'localtunnel', error: localtunnelLastError };
  } else {
    // Cloudflare
    const cfUrl = await startCloudflareTunnel(port, forceNew);
    if (cfUrl) {
      currentActiveTunnelUrl = cfUrl;
      return { url: cfUrl, provider: 'cloudflare', error: null };
    }
    const ltUrl = await startLocaltunnel(port, forceNew);
    if (ltUrl) {
      activeTunnelProvider = 'localtunnel';
      currentActiveTunnelUrl = ltUrl;
      return { url: ltUrl, provider: 'localtunnel', error: null, publicIp: hostPublicIp };
    }
    return { url: null, provider: 'cloudflare', error: cloudflareLastError };
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  let detectedPublicOrigin: string | null = null;

  app.use(express.json({ limit: '1mb' }));

  app.use((req, _res, next) => {
    const host = req.headers.host || '';
    if (
      host &&
      !host.startsWith('localhost') &&
      !host.startsWith('127.0.0.1') &&
      !host.startsWith('0.0.0.0')
    ) {
      const proto =
        req.headers['x-forwarded-proto'] === 'https' ||
        host.includes('ngrok') ||
        host.includes('loca.lt') ||
        host.includes('trycloudflare.com') ||
        host.includes('onrender.com') ||
        Boolean(process.env.RENDER)
          ? 'https'
          : 'http';
      detectedPublicOrigin = `${proto}://${host}`;
    }
    next();
  });

  // 1. List active waiting rooms + detected public tunnel origin
  app.get('/api/online-rooms', (_req, res) => {
    const activeRooms = Array.from(rooms.values())
      .filter((r) => r.hostClientId !== null)
      .map((r) => getRoomPublicSummary(r));
    const effectiveUrl =
      currentActiveTunnelUrl ||
      dynamicLocaltunnelUrl ||
      dynamicNgrokUrl ||
      detectedPublicOrigin ||
      '';
    res.json({
      rooms: activeRooms,
      publicShareOrigin: effectiveUrl,
      tunnelUrl: effectiveUrl,
      provider: activeTunnelProvider,
      localtunnelUrl: dynamicLocaltunnelUrl,
      ngrokUrl: dynamicNgrokUrl,
      cloudflareUrl: dynamicCloudflareUrl,
      tunnelActive: !!effectiveUrl,
      publicIp: hostPublicIp,
    });
  });

  // 2. Tunnel status and dynamic URL refresh endpoints
  app.get('/api/tunnel/status', (_req, res) => {
    const effectiveUrl =
      currentActiveTunnelUrl || dynamicLocaltunnelUrl || dynamicNgrokUrl || dynamicCloudflareUrl;
    res.json({
      active: !!effectiveUrl,
      url: effectiveUrl,
      provider: activeTunnelProvider,
      localtunnelUrl: dynamicLocaltunnelUrl,
      cloudflareUrl: dynamicCloudflareUrl,
      ngrokUrl: dynamicNgrokUrl,
      publicIp: hostPublicIp,
      error:
        activeTunnelProvider === 'localtunnel'
          ? localtunnelLastError
          : activeTunnelProvider === 'ngrok'
          ? ngrokLastError
          : cloudflareLastError,
    });
  });

  app.post('/api/tunnel/refresh', async (req, res) => {
    try {
      const reqProvider =
        (req.body?.provider as 'localtunnel' | 'ngrok' | 'cloudflare') || activeTunnelProvider;
      const result = await startDynamicTunnel(PORT, reqProvider, true);
      if (result.url) {
        detectedPublicOrigin = result.url;
      }
      res.json({
        success: !!result.url,
        url: result.url,
        provider: result.provider,
        error: result.error,
        publicIp: hostPublicIp,
        message: result.url
          ? `Generated fresh dynamic ${result.provider} URL`
          : 'Failed to generate new dynamic tunnel URL',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tunnel refresh error';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Endpoint to update ngrok token on the fly
  app.post('/api/ngrok/token', (req, res) => {
    const { token } = req.body || {};
    if (typeof token === 'string' && token.trim().length > 8) {
      process.env.NGROK_AUTHTOKEN = token.trim();
      res.json({ success: true, message: 'Saved new ngrok authtoken in memory.' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid authtoken provided.' });
    }
  });

  // Backward compatibility endpoints for ngrok UI
  app.get('/api/ngrok/tunnel', (_req, res) => {
    const effectiveUrl =
      currentActiveTunnelUrl || dynamicLocaltunnelUrl || dynamicNgrokUrl || dynamicCloudflareUrl;
    res.json({
      active: !!effectiveUrl,
      url: effectiveUrl,
      provider: activeTunnelProvider,
      error: ngrokLastError,
      type: 'ephemeral-free',
    });
  });

  app.post('/api/ngrok/tunnel/refresh', async (req, res) => {
    try {
      const reqProvider =
        (req.body?.provider as 'localtunnel' | 'ngrok' | 'cloudflare') || activeTunnelProvider;
      const result = await startDynamicTunnel(PORT, reqProvider, true);
      if (result.url) {
        detectedPublicOrigin = result.url;
      }
      res.json({
        success: !!result.url,
        url: result.url,
        provider: result.provider,
        error: result.error,
        publicIp: hostPublicIp,
        message: result.url
          ? `Generated fresh free dynamic ${result.provider} URL`
          : 'Failed to generate new dynamic tunnel URL',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tunnel refresh error';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // 3. Support both /api/online-action and /api/online/action
  app.post('/api/online-action', handleOnlineHttpAction);
  app.post('/api/online/action', handleOnlineHttpAction);

  app.post('/api/ai-tactics', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const {
        homeScore = 0,
        awayScore = 0,
        matchTime = 0,
        homePossession = 50,
        homeShots = 0,
        awayShots = 0,
        currentFormation = '4-3-3 Attack',
        currentMentality = 'Gegenpress',
        customInstruction = '',
      } = req.body || {};

      const prompt = `You are the FC 26 HyperMotion V Tactical AI Director for the Home Team (Real Madrid / Apex FC).
Current Match Telemetry:
- Score: Home ${homeScore} - ${awayScore} Away (Minute ${Math.floor(matchTime)}')
- Possession: Home ${homePossession}% - ${100 - homePossession}% Away
- Shots on Goal: Home ${homeShots} - ${awayShots} Away
- Active Formation: ${currentFormation}
- Active Mentality: ${currentMentality}
${customInstruction ? `- Manager Request: "${customInstruction}"` : ''}

Provide an immediate, high-IQ football tactical adjustment and live touchline directive to optimize the Home Team's AI behavior on the pitch.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coachHeadline: {
                type: Type.STRING,
                description: 'Short 3-6 word tactical directive headline.',
              },
              tacticalAnalysis: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence breakdown of pitch dynamics and space exploitation.',
              },
              recommendedFormation: {
                type: Type.STRING,
                description: 'One of: "4-3-3 Attack", "4-4-2 Classic", "3-5-2 Wingplay"',
              },
              recommendedMentality: {
                type: Type.STRING,
                description: 'One of: "Tiki-Taka", "Gegenpress", "Counter-Attack", "Ultra Attack"',
              },
              pressingIntensity: {
                type: Type.INTEGER,
                description: 'Recommended pressing intensity from 30 to 95.',
              },
              attackingPace: {
                type: Type.INTEGER,
                description: 'Recommended attacking tempo from 40 to 95.',
              },
            },
            required: [
              'coachHeadline',
              'tacticalAnalysis',
              'recommendedFormation',
              'recommendedMentality',
              'pressingIntensity',
              'attackingPace',
            ],
          },
        },
      });

      const text = response.text;
      if (!text) {
        return res.status(500).json({ error: 'Empty response from Gemini Tactical AI.' });
      }

      const parsed = JSON.parse(text.trim());
      return res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI tactical insight';
      return res.status(500).json({ error: message });
    }
  });

  // Attach Real-Time Multiplayer WebSocket Server on /ws-match
  const wss = new WebSocketServer({ server: httpServer, path: '/ws-match' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws-match', 'http://localhost:3000');
    const queryClientId = reqUrl.searchParams.get('clientId');
    const clientId =
      queryClientId && queryClientId.trim().length > 2
        ? queryClientId.trim()
        : `u_${Math.random().toString(36).slice(2, 10)}`;

    // Preserve existing room/role if this clientId already joined via HTTP!
    let existingRoomId: string | null = null;
    let existingRole: 'HOME' | 'AWAY' | 'SPECTATOR' = 'HOME';
    for (const r of rooms.values()) {
      if (r.hostClientId === clientId) {
        existingRoomId = r.roomId;
        existingRole = 'HOME';
        break;
      }
      if (r.guestClientId === clientId) {
        existingRoomId = r.roomId;
        existingRole = 'AWAY';
        break;
      }
    }

    const client: ConnectedClient = {
      ws,
      clientId,
      playerName: 'Captain',
      roomId: existingRoomId,
      role: existingRole,
    };
    clients.set(clientId, client);

    ws.send(
      JSON.stringify({
        type: 'connection:welcome',
        clientId,
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', clientSentAt: msg.clientSentAt }));
          return;
        }

        if (
          msg.type === 'room:create' ||
          msg.type === 'room:join' ||
          msg.type === 'room:quick_match'
        ) {
          const actionMode =
            msg.type === 'room:create'
              ? 'create'
              : msg.type === 'room:join'
              ? 'join'
              : 'quick_match';
          const { room, role } = createOrJoinRoomLogic(
            client.clientId,
            msg.playerName || 'Captain',
            actionMode,
            msg.roomId,
            msg.stadium
          );
          client.playerName = (msg.playerName || 'Captain').slice(0, 18);
          client.roomId = room.roomId;
          client.role = role;

          ws.send(
            JSON.stringify({
              type: 'room:joined',
              roomId: room.roomId,
              role,
              room: getRoomPublicSummary(room),
              initialSnapshot: room.lastMatchSnapshot,
            })
          );
          return;
        }

        if (msg.type === 'room:leave') {
          const oldRoomId = client.roomId;
          client.roomId = null;
          if (oldRoomId) {
            const room = rooms.get(oldRoomId);
            if (room && room.hostClientId === client.clientId && !room.guestClientId) {
              rooms.delete(oldRoomId);
            }
          }
          ws.send(JSON.stringify({ type: 'room:left' }));
          return;
        }

        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room) return;

        if (msg.type === 'room:start_match') {
          room.status = 'PLAYING';
          if (msg.stadium) room.stadium = msg.stadium;
          broadcastToRoom(room.roomId, {
            type: 'match:started',
            room: getRoomPublicSummary(room),
          });
          return;
        }

        if (msg.type === 'room:chat' && typeof msg.text === 'string') {
          const msgId = typeof msg.id === 'string' ? msg.id : `chat_${Date.now()}_${Math.random()}`;
          if (room.chatMessages.some((m) => m.id === msgId)) return;
          const chatEntry: ChatMessage = {
            id: msgId,
            sender: client.playerName,
            role: client.role,
            text: msg.text.slice(0, 140),
            timestamp: Date.now(),
          };
          room.chatMessages.push(chatEntry);
          if (room.chatMessages.length > 40) room.chatMessages.shift();
          broadcastToRoom(room.roomId, {
            type: 'room:chat_message',
            message: chatEntry,
          });
          return;
        }

        if (msg.type === 'match:state' && client.role === 'HOME') {
          room.lastMatchSnapshot = msg.snapshot;
          room.lastSnapshotAt = Date.now();
          broadcastToRoom(
            room.roomId,
            {
              type: 'match:state',
              snapshot: msg.snapshot,
            },
            client.clientId
          );
          return;
        }

        if (msg.type === 'player:input') {
          room.lastGuestInput = msg.input;
          if (room.hostClientId && room.hostClientId !== client.clientId) {
            const host = clients.get(room.hostClientId);
            if (host && host.ws.readyState === WebSocket.OPEN) {
              host.ws.send(
                JSON.stringify({
                  type: 'player:input',
                  input: msg.input,
                })
              );
            }
          }
          return;
        }

        if (msg.type === 'match:goal') {
          room.lastGoalEvent = {
            id: `g_${Date.now()}`,
            scorerName: msg.scorerName,
            team: msg.team,
            homeScore: msg.homeScore,
            awayScore: msg.awayScore,
          };
          broadcastToRoom(
            room.roomId,
            {
              type: 'match:goal',
              scorerName: msg.scorerName,
              team: msg.team,
              homeScore: msg.homeScore,
              awayScore: msg.awayScore,
            },
            client.clientId
          );
          return;
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`FC 26 HyperMotion V server + WebSocket running on http://0.0.0.0:${PORT}`);
    if (!process.env.RENDER) {
      startDynamicTunnel(PORT, 'localtunnel')
        .then((res) => {
          if (res.url) {
            detectedPublicOrigin = res.url;
            console.log(`[FC 26 ONLINE] Shareable dynamic tunnel ready (${res.provider}): ${res.url}`);
          }
        })
        .catch((err) => {
          console.warn('[FC 26 ONLINE] Dynamic tunnel launch warning:', err);
        });
    } else {
      console.log('[FC 26 ONLINE] Hosted on Render Cloud. Native public domain active.');
    }
  });

  const handleShutdown = async () => {
    if (activeLocaltunnel) {
      console.log('[TUNNEL] Closing Localtunnel...');
      try {
        activeLocaltunnel.close();
      } catch {
        // Ignore
      }
    }
    if (activeCloudflaredProcess) {
      console.log('[TUNNEL] Closing Cloudflare dynamic tunnel...');
      try {
        activeCloudflaredProcess.kill();
      } catch {
        // Ignore
      }
    }
    if (activeNgrokListener) {
      console.log('[TUNNEL] Closing ngrok dynamic tunnel...');
      try {
        await activeNgrokListener.close();
      } catch {
        // Ignore
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}

startServer();

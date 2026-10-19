import React, { useEffect, useState } from 'react';
import {
  OnlinePlayerSearchResult,
  OnlineRoomSummary,
  OnlineSessionState,
  STADIUM_CATALOG,
  StadiumId,
} from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface OnlineLobbyModalProps {
  onlineState: OnlineSessionState;
  selectedStadium: StadiumId;
  onSelectStadium: (stadium: StadiumId) => void;
  onChangePlayerName: (name: string) => void;
  onCreateRoom: (customCode?: string) => void;
  onJoinRoom: (roomId: string) => void;
  onQuickMatch: () => void;
  onLeaveRoom: () => void;
  onStartOnlineMatch: () => void;
  onSendChat: (text: string) => void;
  onSearchPlayers: (query: string) => Promise<OnlinePlayerSearchResult[]>;
  onSendFriendRequest: (targetClientId: string, targetPlayerName: string) => Promise<void>;
  onRespondFriendRequest: (requestId: string, decision: 'ACCEPT' | 'DECLINE') => Promise<void>;
  onPlayWithFriend: (friendClientId: string, friendName: string, friendRoomId: string | null) => Promise<void>;
  onBackToTitle: () => void;
}

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  onlineState,
  selectedStadium,
  onSelectStadium,
  onChangePlayerName,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onLeaveRoom,
  onStartOnlineMatch,
  onSendChat,
  onSearchPlayers,
  onSendFriendRequest,
  onRespondFriendRequest,
  onPlayWithFriend,
  onBackToTitle,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<OnlineRoomSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OnlinePlayerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [socialBanner, setSocialBanner] = useState<string | null>(null);
  const [isRefreshingTunnel, setIsRefreshingTunnel] = useState(false);
  const [tunnelActive, setTunnelActive] = useState<boolean>(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelProvider, setTunnelProvider] = useState<'localtunnel' | 'ngrok' | 'cloudflare'>('localtunnel');
  const [hostPublicIp, setHostPublicIp] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [ngrokTokenInput, setNgrokTokenInput] = useState('');
  const [copiedIp, setCopiedIp] = useState(false);
  const [shareBaseUrl, setShareBaseUrl] = useState<string>(() => {
    return window.location.origin;
  });

  const fetchOpenRooms = async () => {
    try {
      const res = await fetch('/api/online-rooms');
      if (res.ok) {
        const data = await res.json();
        setAvailableRooms(data.rooms || []);
        if (data.publicIp) setHostPublicIp(data.publicIp);
        const activeUrl =
          data.tunnelUrl ||
          data.publicShareOrigin ||
          data.localtunnelUrl ||
          data.ngrokUrl ||
          data.cloudflareUrl;
        if (activeUrl) {
          setTunnelUrl(activeUrl);
          setTunnelActive(true);
          if (data.provider) setTunnelProvider(data.provider);
          const host = window.location.hostname;
          if (host === 'localhost' || host === '127.0.0.1') {
            setShareBaseUrl((prev) =>
              prev.includes('localhost') ||
              prev.includes('127.0.0.1')
                ? activeUrl
                : prev
            );
          }
        }
      }
    } catch {
      // Ignore network poll error
    }
  };

  const handleRefreshTunnel = async (providerToUse?: 'localtunnel' | 'ngrok' | 'cloudflare') => {
    soundEngine.playUIClick();
    setIsRefreshingTunnel(true);
    const target = providerToUse || tunnelProvider;
    try {
      const res = await fetch('/api/tunnel/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: target }),
      });
      const data = await res.json();
      if (data.url) {
        setTunnelUrl(data.url);
        setShareBaseUrl(data.url);
        setTunnelActive(true);
        if (data.provider) setTunnelProvider(data.provider);
        if (data.publicIp) setHostPublicIp(data.publicIp);
        const providerLabel =
          data.provider === 'localtunnel'
            ? 'Localtunnel (Free & Unlimited)'
            : data.provider === 'ngrok'
            ? 'ngrok (Free Dynamic URL)'
            : 'Cloudflare';
        setSocialBanner(`✓ Fresh Free Dynamic URL active (${providerLabel}): ${data.url}`);
      } else if (data.error) {
        setSocialBanner(`Tunnel Notice: ${data.error}`);
      }
    } catch {
      setSocialBanner('Could not reach tunnel service');
    } finally {
      setIsRefreshingTunnel(false);
    }
  };

  const handleSaveNgrokToken = async () => {
    if (!ngrokTokenInput.trim()) return;
    soundEngine.playUIClick();
    setIsRefreshingTunnel(true);
    try {
      const res = await fetch('/api/ngrok/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ngrokTokenInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShowTokenInput(false);
        setSocialBanner('✓ New ngrok authtoken saved! Generating fresh ngrok dynamic tunnel...');
        await handleRefreshTunnel('ngrok');
      } else {
        setSocialBanner(`⚠️ ${data.error || 'Failed to save token'}`);
      }
    } catch {
      setSocialBanner('⚠️ Could not save token to server');
    } finally {
      setIsRefreshingTunnel(false);
    }
  };

  useEffect(() => {
    fetchOpenRooms();
    // Load initial online players directory
    onSearchPlayers('').then((list) => setSearchResults(list));
    const timer = setInterval(fetchOpenRooms, 3000);
    return () => clearInterval(timer);
  }, [onlineState.roomId]);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    soundEngine.playUIClick();
    setIsSearching(true);
    const list = await onSearchPlayers(searchQuery.trim());
    setSearchResults(list);
    setIsSearching(false);
  };

  const handleClickFriendRequest = async (player: OnlinePlayerSearchResult) => {
    soundEngine.playUIClick();
    const targetName = player.playerName || player.name;
    await onSendFriendRequest(player.clientId, targetName);
    setSocialBanner(
      `Friend Request sent to ${targetName}! They will get an on-screen notification whenever online.`
    );
  };

  const getShareableInviteUrl = () => {
    const roomCode = onlineState.roomId || '';
    const base = (shareBaseUrl || window.location.origin).trim().replace(/\/+$/, '');
    return `${base}/?room=${encodeURIComponent(roomCode)}`;
  };

  const handleCopyInviteLink = () => {
    if (!onlineState.roomId) return;
    soundEngine.playUIClick();
    const inviteUrl = getShareableInviteUrl();
    navigator.clipboard?.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleSendChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    soundEngine.playUIClick();
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const incomingRequests = onlineState.incomingRequests || [];
  const outgoingRequests = onlineState.outgoingRequests || [];
  const acceptedFriends = onlineState.friends || [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#05080F]/90 backdrop-blur-xl overflow-y-auto select-none">
      <div className="w-full max-w-6xl bg-[#090D16] border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl my-auto max-h-[94vh] overflow-y-auto flex flex-col gap-5">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-tabular uppercase tracking-widest text-[#38BDF8]">
              <span>FC 26 ONLINE FRIENDS & 1V1 MULTIPLAYER</span>
              <span>·</span>
              <span className={onlineState.connected ? 'text-[#CCFF00]' : 'text-amber-400'}>
                {onlineState.connected
                  ? `LIVE ONLINE (${onlineState.latencyMs}ms PING)`
                  : 'ONLINE READY'}
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-wide text-white mt-0.5">
              Search Players, Add Friends & Play Online 1v1
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="px-3 py-1.5 rounded-xl bg-[#111827] border border-white/10 text-xs font-mono-tabular">
              <span className="text-slate-400">Your Name: </span>
              <strong className="text-[#CCFF00]">{onlineState.playerName}</strong>
            </div>

            <button
              onClick={() => {
                soundEngine.playUIClick();
                onBackToTitle();
              }}
              className="px-4 py-2 text-xs font-bold bg-[#111827] hover:bg-white/10 text-slate-200 border border-white/15 rounded-xl cursor-pointer"
            >
              ← Back to Menu
            </button>
          </div>
        </div>

        {/* Free Dynamic Tunnel Banner (Localtunnel Unlimited + ngrok + Cloudflare) */}
        <div className="px-4 py-3 rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#111C38] to-[#0A1628] border border-cyan-500/30 flex flex-col gap-2.5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono-tabular font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                  tunnelActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${tunnelActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {tunnelActive
                  ? tunnelProvider === 'localtunnel'
                    ? '⚡ LOCALTUNNEL UNLIMITED ACTIVE (NO BANDWIDTH CAP)'
                    : tunnelProvider === 'ngrok'
                    ? 'NGROK FREE DYNAMIC TUNNEL ACTIVE'
                    : 'CLOUDFLARE DYNAMIC TUNNEL ACTIVE'
                  : 'TUNNEL CONNECTING'}
              </span>

              {/* Provider Switcher Tabs */}
              <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-white/10 text-[10px] font-mono-tabular">
                <button
                  type="button"
                  onClick={() => handleRefreshTunnel('localtunnel')}
                  disabled={isRefreshingTunnel}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    tunnelProvider === 'localtunnel'
                      ? 'bg-[#38BDF8] text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="100% Free, Unlimited Bandwidth, No NXDOMAIN errors (Works in India/Everywhere)"
                >
                  Localtunnel (Unlimited)
                </button>
                <button
                  type="button"
                  onClick={() => handleRefreshTunnel('ngrok')}
                  disabled={isRefreshingTunnel}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    tunnelProvider === 'ngrok'
                      ? 'bg-[#CCFF00] text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="ngrok Free Dynamic URL"
                >
                  ngrok
                </button>
                <button
                  type="button"
                  onClick={() => handleRefreshTunnel('cloudflare')}
                  disabled={isRefreshingTunnel}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    tunnelProvider === 'cloudflare'
                      ? 'bg-indigo-400 text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Cloudflare Quick Tunnel"
                >
                  Cloudflare
                </button>
              </div>

              <div className="text-xs font-mono-tabular text-slate-300 truncate max-w-xs sm:max-w-md">
                Dynamic URL:{' '}
                <span className="text-[#38BDF8] font-bold">
                  {tunnelUrl || shareBaseUrl || 'Generating dynamic URL...'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono-tabular cursor-pointer"
                title="Enter a new ngrok authtoken if your account reached bandwidth limits"
              >
                🔑 ngrok Token
              </button>
              <button
                type="button"
                disabled={isRefreshingTunnel}
                onClick={() => handleRefreshTunnel()}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 font-mono-tabular text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                title="Generate a fresh, free random dynamic URL on demand"
              >
                <span className={isRefreshingTunnel ? 'animate-spin inline-block' : ''}>🔄</span>
                {isRefreshingTunnel ? 'Generating...' : 'Get Fresh Free URL'}
              </button>
              {onlineState.roomId && (
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="px-3 py-1.5 rounded-lg bg-[#CCFF00] hover:bg-[#d9ff33] text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  {copiedLink ? '✓ Copied!' : '📋 Copy Match Link'}
                </button>
              )}
            </div>
          </div>

          {/* Quick ngrok token updater if user creates a new free account */}
          {showTokenInput && (
            <div className="p-2.5 rounded-xl bg-[#090D16] border border-cyan-400/30 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono-tabular text-slate-300">
                Paste Fresh Free ngrok Token (from dashboard.ngrok.com/signup):
              </span>
              <input
                type="password"
                value={ngrokTokenInput}
                onChange={(e) => setNgrokTokenInput(e.target.value)}
                placeholder="Paste authtoken (e.g. 2abC...)"
                className="flex-1 min-w-[200px] px-2.5 py-1 text-xs font-mono-tabular bg-[#111827] border border-white/20 rounded text-white focus:outline-none focus:border-[#CCFF00]"
              />
              <button
                type="button"
                onClick={handleSaveNgrokToken}
                className="px-3 py-1 rounded bg-[#CCFF00] hover:bg-[#d9ff33] text-slate-950 text-xs font-black uppercase cursor-pointer"
              >
                Save & Connect ngrok
              </button>
            </div>
          )}

          {/* Localtunnel helper: Friend Passcode */}
          {tunnelProvider === 'localtunnel' && hostPublicIp && (
            <div className="text-[10px] font-mono-tabular text-slate-400 flex items-center gap-2">
              <span>💡 If loca.lt asks your friend for a "Tunnel Password", tell them to enter:</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(hostPublicIp);
                  setCopiedIp(true);
                  setTimeout(() => setCopiedIp(false), 2000);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[#38BDF8] font-bold cursor-pointer"
              >
                {copiedIp ? '✓ Copied IP!' : `${hostPublicIp} (Click to copy)`}
              </button>
            </div>
          )}
        </div>

        {/* Status Toast */}
        {socialBanner && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 text-xs font-bold flex items-center justify-between">
            <span>🔔 {socialBanner}</span>
            <button
              type="button"
              onClick={() => setSocialBanner(null)}
              className="text-slate-300 hover:text-white ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* INCOMING FRIEND REQUESTS BANNER (IF ANY) */}
        {incomingRequests.length > 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-[#131C31] to-emerald-500/20 border-2 border-[#CCFF00] shadow-xl flex flex-col gap-2.5">
            <div className="text-xs font-mono-tabular uppercase tracking-widest text-[#CCFF00] font-black">
              🔔 INCOMING FRIEND REQUESTS ({incomingRequests.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl bg-[#090D16]/90 border border-white/15 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-display text-lg font-black text-white uppercase">
                      {req.fromName}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-slate-400">
                      Wants to add you as an Online Friend!
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playWhistle('goal');
                        onRespondFriendRequest(req.id, 'ACCEPT');
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#CCFF00] hover:bg-[#d9ff33] text-slate-950 font-black text-xs uppercase cursor-pointer"
                    >
                      ✓ Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUIClick();
                        onRespondFriendRequest(req.id, 'DECLINE');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* If NOT inside a room yet: Show 1. Search Players & Send Friend Request + 2. Accepted Friends List + 3. Room Controls */}
        {!onlineState.room ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT 7 COLS: STEP 1 (SEARCH PLAYER BY NAME & SEND FRIEND REQUEST) + STEP 2 (ACCEPTED FRIENDS LIST) */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* STEP 1: Search Player Name & Send Friend Request */}
              <div className="bg-[#111827] border-2 border-indigo-400/40 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono-tabular font-black uppercase">
                      STEP 1 · FIND PLAYERS ONLINE
                    </span>
                    <h3 className="font-display text-xl font-black uppercase text-white mt-1">
                      Search Player Name & Send Friend Request
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    Real-time Friend Notifications
                  </span>
                </div>

                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player name (e.g. Alex_FC26, MadridKing7, LeoGoat120, or friend's name)..."
                    className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm font-mono-tabular bg-[#090D16] border border-white/15 rounded-xl text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-5 py-2.5 rounded-xl bg-[#38BDF8] hover:bg-[#7dd3fc] text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer shrink-0"
                  >
                    {isSearching ? 'Searching...' : '🔍 Search Player'}
                  </button>
                </form>

                {/* Search Results List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {searchResults.length === 0 ? (
                    <div className="col-span-2 text-xs text-slate-400 py-5 text-center border border-dashed border-white/10 rounded-xl">
                      Type any player name above and click <strong>Search Player</strong> to find them and send a Friend Request!
                    </div>
                  ) : (
                    searchResults.map((p) => {
                      const pName = p.playerName || p.name || 'Captain';
                      const isAlreadyFriend = acceptedFriends.some(
                        (f) =>
                          (f.friendName || f.name || '').toLowerCase() ===
                          pName.toLowerCase()
                      );
                      const isPendingSent = outgoingRequests.some(
                        (r) => r.toName.toLowerCase() === pName.toLowerCase()
                      );

                      return (
                        <div
                          key={p.clientId}
                          className="p-3 rounded-xl bg-[#090D16] border border-white/10 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  p.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                                }`}
                              />
                              <span className="font-display font-black text-sm text-white truncate">
                                {pName}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-amber-400/15 text-amber-300 text-[9px] font-mono-tabular font-bold">
                                OVR {p.squadOvr || '91.0'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {p.clubName || 'Apex FC'} · {p.online ? '🟢 Online Now' : 'Offline'}
                            </div>
                          </div>

                          {isAlreadyFriend ? (
                            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-mono-tabular font-black shrink-0">
                              ✓ Friends
                            </span>
                          ) : isPendingSent ? (
                            <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-mono-tabular font-bold shrink-0">
                              ⏳ Request Sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleClickFriendRequest(p)}
                              className="px-3 py-1.5 rounded-lg bg-[#CCFF00] hover:bg-[#d8ff33] text-slate-950 font-black text-[10px] uppercase tracking-wider cursor-pointer shrink-0 shadow"
                            >
                              + Friend Request
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* STEP 2: MY ACCEPTED FRIENDS LIST (PLAY ONLINE WITH FRIENDS) */}
              <div className="bg-[#111827] border-2 border-emerald-400/50 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono-tabular font-black uppercase">
                      STEP 2 · ACCEPTED FRIENDS ({acceptedFriends.length})
                    </span>
                    <h3 className="font-display text-xl font-black uppercase text-white mt-1">
                      Your Friends Who Accepted — Click to Play Online!
                    </h3>
                  </div>
                </div>

                {acceptedFriends.length === 0 ? (
                  <div className="text-xs text-slate-400 py-6 text-center border border-dashed border-white/10 rounded-xl">
                    No accepted friends yet. Search a player above and click{' '}
                    <strong className="text-[#CCFF00]">+ Friend Request</strong> — once they accept the notification, they appear right here so you can play online together!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {acceptedFriends.map((friend) => {
                      const fName = friend.friendName || friend.name || 'Friend';
                      const fId = friend.friendClientId || friend.clientId || fName;
                      return (
                        <div
                          key={fId}
                          className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/50 via-[#090D16] to-[#090D16] border border-emerald-400/40 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  friend.online ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                                }`}
                              />
                              <span className="font-display text-base font-black text-white uppercase">
                                {fName}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono-tabular text-emerald-300 mt-0.5">
                              {friend.online ? '🟢 ONLINE · FRIEND ACCEPTED' : '⚪ OFFLINE'} · OVR{' '}
                              {friend.friendOvr || '92.0'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playWhistle('kickoff');
                              onPlayWithFriend(fId, fName, friend.roomId);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:brightness-110 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer shrink-0"
                          >
                            ⚽ Play Online
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT 5 COLS: CAPTAIN NAME, DIRECT ROOM CODE & OPEN LOBBIES */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Your Online Captain Name (Friends search this name to add you!)
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={onlineState.playerName}
                  onChange={(e) => onChangePlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full px-3.5 py-2 text-sm font-mono-tabular font-bold bg-[#090D16] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
                  <button
                    onClick={() => {
                      soundEngine.playUIClick();
                      onCreateRoom();
                    }}
                    className="py-2.5 px-4 text-xs font-display font-extrabold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d9ff33] text-[#070A10] rounded-lg shadow-lg cursor-pointer"
                  >
                    + Create Friend Room
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playUIClick();
                      onQuickMatch();
                    }}
                    className="py-2.5 px-4 text-xs font-display font-extrabold uppercase tracking-wider bg-[#38BDF8] hover:bg-[#7dd3fc] text-[#070A10] rounded-lg shadow-lg cursor-pointer"
                  >
                    Quick Match Online
                  </button>
                </div>
              </div>

              {/* Join by Room Code */}
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Have a Friend’s 4-Letter Room Code?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="E.G. FC26"
                    className="flex-1 px-3.5 py-2 text-sm font-mono-tabular font-extrabold tracking-widest uppercase bg-[#090D16] border border-white/15 rounded-lg text-[#CCFF00] focus:outline-none focus:border-[#CCFF00]"
                  />
                  <button
                    onClick={() => {
                      if (!joinCodeInput.trim()) return;
                      soundEngine.playUIClick();
                      onJoinRoom(joinCodeInput.trim().toUpperCase());
                    }}
                    className="px-5 py-2 text-xs font-display font-extrabold uppercase tracking-wider bg-white text-[#070A10] hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Join Room
                  </button>
                </div>
              </div>

              {/* Active Rooms Browser */}
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Active Stadium Lobbies ({availableRooms.length})
                    </span>
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        fetchOpenRooms();
                      }}
                      className="text-[11px] font-mono-tabular text-[#38BDF8] hover:underline cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>

                  {availableRooms.length === 0 ? (
                    <div className="text-xs text-slate-400 py-5 text-center border border-dashed border-white/10 rounded-lg">
                      No open rooms waiting. Search a friend above or click{' '}
                      <strong className="text-[#CCFF00]">Play Online</strong> next to any accepted friend!
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                      {availableRooms.map((r) => (
                        <div
                          key={r.roomId}
                          className="flex items-center justify-between bg-[#090D16] border border-white/10 px-3 py-2 rounded-lg"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono-tabular font-extrabold text-xs text-[#CCFF00]">
                                #{r.roomId}
                              </span>
                              <span className="text-xs font-semibold text-white">{r.hostName}</span>
                            </div>
                            <div className="text-[10px] font-mono-tabular text-slate-400">
                              {STADIUM_CATALOG[r.stadium as StadiumId]?.name || 'Santiago Bernabéu'} ·{' '}
                              {r.playerCount}/2 Players
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              soundEngine.playUIClick();
                              onJoinRoom(r.roomId);
                            }}
                            className="px-3 py-1 text-xs font-display font-bold uppercase bg-[#38BDF8] text-[#070A10] rounded cursor-pointer"
                          >
                            Join
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* INSIDE AN ACTIVE ROOM LOBBY */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left 7 Cols: Head-to-Head Matchup Card + Stadium Selector */}
            <div className="md:col-span-7 flex flex-col gap-4">
              {/* Room Code & Invite Share Banner */}
              <div className="flex flex-col gap-3 bg-[#111827] border border-[#CCFF00]/50 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono-tabular uppercase text-slate-400">
                      ROOM CODE (SHARE OR INVITE ACCEPTED FRIENDS)
                    </div>
                    <div className="font-mono-tabular text-3xl font-extrabold tracking-widest text-[#CCFF00]">
                      {onlineState.room.roomId}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyInviteLink}
                      className="px-3.5 py-2 text-xs font-bold bg-[#CCFF00] text-[#070A10] rounded-lg cursor-pointer"
                    >
                      {copiedLink ? '✓ Public Invite Link Copied!' : 'Copy Friend Invite Link'}
                    </button>
                    <button
                      onClick={() => {
                        soundEngine.playUIClick();
                        onLeaveRoom();
                      }}
                      className="px-3 py-2 text-xs font-semibold bg-[#090D16] text-slate-300 hover:text-white border border-white/15 rounded-lg cursor-pointer"
                    >
                      Leave Room
                    </button>
                  </div>
                </div>

                {/* Free Dynamic Tunnel Share URL Preview */}
                <div className="pt-2.5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono-tabular uppercase text-[#38BDF8] font-bold">
                        Free Dynamic Tunnel URL ({
                          tunnelProvider === 'localtunnel'
                            ? 'Localtunnel Unlimited Bandwidth'
                            : tunnelProvider === 'ngrok'
                            ? 'ngrok Free Dynamic'
                            : 'Cloudflare'
                        }):
                      </label>
                      <button
                        type="button"
                        disabled={isRefreshingTunnel}
                        onClick={() => handleRefreshTunnel()}
                        className="text-[10px] font-mono-tabular text-cyan-400 hover:text-cyan-300 underline cursor-pointer flex items-center gap-1"
                      >
                        <span className={isRefreshingTunnel ? 'animate-spin inline-block' : ''}>🔄</span>
                        {isRefreshingTunnel ? 'Generating...' : 'Get Fresh Free URL'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={shareBaseUrl}
                      onChange={(e) => setShareBaseUrl(e.target.value)}
                      placeholder="https://your-dynamic-url.loca.lt"
                      className="w-full px-3 py-1.5 text-xs font-mono-tabular bg-[#090D16] border border-[#38BDF8]/40 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                    <div className="flex items-center justify-between mt-1 text-[9px] font-mono-tabular text-slate-400">
                      <span>
                        {tunnelProvider === 'localtunnel'
                          ? '100% Free with UNLIMITED bandwidth (no ERR_NGROK_725 or NXDOMAIN limits).'
                          : tunnelProvider === 'ngrok'
                          ? 'Free ngrok dynamic URL (1GB bandwidth cap). Switch to Localtunnel for unlimited bandwidth.'
                          : 'Cloudflare Quick Tunnel.'}
                      </span>
                      {tunnelProvider === 'localtunnel' && hostPublicIp && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(hostPublicIp);
                            setCopiedIp(true);
                            setTimeout(() => setCopiedIp(false), 2000);
                          }}
                          className="text-[#38BDF8] hover:underline cursor-pointer"
                        >
                          {copiedIp ? '✓ IP Copied!' : `Friend Passcode: ${hostPublicIp}`}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-300 bg-[#090D16] px-3 py-2 rounded-lg border border-white/10 shrink-0">
                    Invite Link: <strong className="text-[#CCFF00]">{getShareableInviteUrl()}</strong>
                  </div>
                </div>
              </div>

              {/* Head-to-Head Team Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* HOME SLOT (Real Madrid) */}
                <div className="bg-[#111827] border-2 border-[#CCFF00] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-tabular font-bold px-2 py-0.5 rounded bg-[#CCFF00] text-[#070A10]">
                      HOME · HOST
                    </span>
                    {onlineState.role === 'HOME' && (
                      <span className="text-[10px] font-mono-tabular text-[#CCFF00]">YOU</span>
                    )}
                  </div>
                  <div className="font-display text-2xl font-extrabold text-white uppercase mt-2">
                    Real Madrid CF
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-300 mt-1">
                    Captain: <strong className="text-[#CCFF00]">{onlineState.room.hostName}</strong>
                  </div>
                </div>

                {/* AWAY SLOT (Manchester City) */}
                <div
                  className={`bg-[#111827] border-2 rounded-xl p-4 ${
                    onlineState.room.guestName
                      ? 'border-[#38BDF8]'
                      : 'border-dashed border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-tabular font-bold px-2 py-0.5 rounded bg-[#38BDF8] text-[#070A10]">
                      AWAY · FRIEND CHALLENGER
                    </span>
                    {onlineState.role === 'AWAY' && (
                      <span className="text-[10px] font-mono-tabular text-[#38BDF8]">YOU</span>
                    )}
                  </div>
                  <div className="font-display text-2xl font-extrabold text-white uppercase mt-2">
                    Manchester City
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-300 mt-1">
                    {onlineState.room.guestName ? (
                      <>
                        Friend Connected:{' '}
                        <strong className="text-[#38BDF8]">{onlineState.room.guestName}</strong>
                      </>
                    ) : (
                      <span className="text-amber-300">
                        Waiting for friend to join...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Host Stadium Picker */}
              <div className="bg-[#111827] border border-white/10 rounded-xl p-3.5">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Match Venue: <strong className="text-[#38BDF8]">{STADIUM_CATALOG[selectedStadium].name}</strong>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(Object.keys(STADIUM_CATALOG) as StadiumId[]).map((stId) => (
                    <button
                      key={stId}
                      onClick={() => {
                        soundEngine.playUIClick();
                        onSelectStadium(stId);
                      }}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded border text-left truncate cursor-pointer ${
                        selectedStadium === stId
                          ? 'bg-[#CCFF00] text-[#070A10] border-[#CCFF00]'
                          : 'bg-[#090D16] text-slate-300 border-white/10'
                      }`}
                    >
                      {STADIUM_CATALOG[stId].name.replace('Estadio ', '').replace('Stadio ', '')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kick-Off Online Match CTA */}
              <button
                onClick={() => {
                  soundEngine.playUIClick();
                  onStartOnlineMatch();
                }}
                className="w-full py-3.5 text-base font-display font-extrabold uppercase tracking-wider bg-[#CCFF00] hover:bg-[#d9ff33] text-[#070A10] rounded-xl shadow-xl cursor-pointer"
              >
                {onlineState.room.guestName
                  ? `⚽ Kick-Off Live Match vs ${onlineState.room.guestName}!`
                  : '⚽ Kick-Off Match (Friend Can Join Anytime!)'}
              </button>
            </div>

            {/* Right 5 Cols: Real-Time Room Chat & Quick Tactical Emotes */}
            <div className="md:col-span-5 bg-[#111827] border border-white/10 rounded-xl p-4 flex flex-col justify-between h-88">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-white/10 pb-2">
                Locker Room Live Chat
              </div>

              <div className="flex-1 overflow-y-auto py-2.5 flex flex-col gap-2">
                {onlineState.room.chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-[#090D16] border border-white/10 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span
                      className={`font-bold ${
                        msg.role === 'HOME' ? 'text-[#CCFF00]' : 'text-[#38BDF8]'
                      }`}
                    >
                      {msg.sender}:{' '}
                    </span>
                    <span className="text-slate-200">{msg.text}</span>
                  </div>
                ))}
              </div>

              {/* Quick Emote Buttons */}
              <div className="flex flex-wrap gap-1 mb-2">
                {['Ready for Kick-Off!', 'Watch my 120 OVR Shot!', 'Good Luck Friend!', 'Rematch!'].map(
                  (emote) => (
                    <button
                      key={emote}
                      onClick={() => {
                        soundEngine.playUIClick();
                        onSendChat(emote);
                      }}
                      className="px-2 py-1 text-[10px] font-semibold bg-[#090D16] hover:bg-white/10 text-slate-300 border border-white/10 rounded cursor-pointer"
                    >
                      {emote}
                    </button>
                  )
                )}
              </div>

              <form onSubmit={handleSendChatSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message friend..."
                  className="flex-1 px-3 py-1.5 text-xs bg-[#090D16] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#CCFF00]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-bold bg-[#38BDF8] text-[#070A10] rounded-lg cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

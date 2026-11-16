const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,range,x-colabgg-token",
};

const HEARTBEAT_TIMEOUT_MS = 180 * 1000;
const OFFLINE_PRUNE_MS = 3 * 24 * 60 * 60 * 1000;
const HTTP_RPC_TIMEOUT_MS = 22 * 1000;
const TURN_CACHE_TTL_MS = 18 * 60 * 60 * 1000; // Refresh TURN creds every 18h (valid 24h)

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function cleanRoom(room) {
  return String(room || "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 96);
}

function parseRoomGatewayPath(pathname) {
  // Matches: /r/<roomId>/<token> or /r/<roomId>/<token>/<rest...>
  const m = /^\/r\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m) return null;
  const roomId = cleanRoom(decodeURIComponent(m[1]));
  const token = decodeURIComponent(m[2]);
  const rest = m[3] || "/";
  if (!roomId || !token) return null;
  return { roomId, token, rest };
}

function bytesToBase64(bytes) {
  let binary = "";
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function generateCloudflareTurnServers(env) {
  const keyId = String(env.CF_TURN_KEY_ID || "").trim();
  const apiToken = String(env.CF_TURN_API_TOKEN || "").trim();
  if (!keyId || !apiToken) return null;

  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: 86400 }),
  });

  if (!resp.ok) {
    return null;
  }
  const data = await resp.json().catch(() => null);
  if (!data || !data.iceServers) return null;
  return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
      }

      // 1. Check /r/<roomId>/<token>/* gateway routes
      const gw = parseRoomGatewayPath(url.pathname);
      if (gw) {
        const prefix = `/r/${encodeURIComponent(gw.roomId)}/${encodeURIComponent(gw.token)}`;

        // Redirect /r/<roomId>/<token> -> /r/<roomId>/<token>/ so relative ES module imports resolve properly
        if (url.pathname === prefix) {
          return Response.redirect(`${url.origin}${prefix}/${url.search}`, 302);
        }

        // Dynamic config.js telling moonlight-web its exact base path_prefix
        if (gw.rest === "/config.js") {
          const jsBody = `export default ${JSON.stringify({ path_prefix: prefix })};\n`;
          return new Response(jsBody, {
            status: 200,
            headers: {
              "content-type": "application/javascript; charset=utf-8",
              "cache-control": "private, max-age=3600",
            },
          });
        }

        // Backend API calls & /api/host/stream WebSocket go to the Room Durable Object
        if (gw.rest === "/api" || gw.rest.startsWith("/api/")) {
          if (!env.COLABGG_RELAY) {
            return json({ error: "misconfigured", message: "COLABGG_RELAY Durable Object binding missing" }, 500);
          }
          const stub = env.COLABGG_RELAY.get(env.COLABGG_RELAY.idFromName(gw.roomId));
          const fwdHeaders = new Headers(request.headers);
          fwdHeaders.set("x-colabgg-room", gw.roomId);
          fwdHeaders.set("x-colabgg-token", gw.token);
          fwdHeaders.set("x-colabgg-subpath", gw.rest);
          const fwdUrl = new URL(request.url);
          fwdUrl.pathname = "/__gw" + gw.rest;
          return await stub.fetch(new Request(fwdUrl.toString(), {
            method: request.method,
            headers: fwdHeaders,
            body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
          }));
        }

        // Everything else under /r/<roomId>/<token>/* is a static Moonlight frontend file served from ASSETS!
        if (env.ASSETS) {
          const assetPath = gw.rest === "/" ? "/moonlight/index.html" : `/moonlight${gw.rest}`;
          const assetUrl = new URL(request.url);
          assetUrl.pathname = assetPath;
          const assetResp = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
            method: "GET",
            headers: request.headers,
          }));
          if (assetResp.status === 200) {
            const cachedHeaders = new Headers(assetResp.headers);
            cachedHeaders.set("cache-control", "public, max-age=86400");
            return new Response(assetResp.body, { status: 200, headers: cachedHeaders });
          }
          return assetResp;
        }
        return new Response("Static assets binding unavailable", { status: 404 });
      }

      // 2. /api/colabgg/* Control & Signaling routes
      if (url.pathname.startsWith("/api/colabgg/")) {
        if (url.pathname === "/api/colabgg/ping") {
          return json({
            ok: true,
            service: "colabgg-relay",
            turnConfigured: Boolean(env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN),
            timestamp: Date.now(),
          });
        }

        const room = cleanRoom(url.searchParams.get("room") || request.headers.get("x-colabgg-room") || "");
        if (!room) {
          return json({ error: "room_required", message: "Query parameter ?room=<roomId> is required" }, 400);
        }
        if (!env.COLABGG_RELAY) {
          return json({ error: "misconfigured", message: "COLABGG_RELAY Durable Object binding missing" }, 500);
        }
        const stub = env.COLABGG_RELAY.get(env.COLABGG_RELAY.idFromName(room));
        return await stub.fetch(request);
      }

      // 3. Fallback to static Web Client UI (public/index.html, etc.)
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return json({ ok: true, service: "colabgg-relay" });
    } catch (err) {
      return json({ error: "internal_error", message: err?.message || "Unexpected Worker error" }, 500);
    }
  },
};

export class ColabGGRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.roomMeta = {
      roomId: "",
      token: "",
      serverName: "Colab Cloud Gaming",
      gpuName: "",
      driverVersion: "",
      resolution: "1920x1080@60",
      privateIp: "",
      turnActive: false,
      apps: [],
      desktopAppId: null,
      steamAppId: null,
      lastColabActivityAt: 0,
      colabConnectedAt: 0,
      colabDisconnectedAt: null,
    };
    this.pendingHttp = new Map(); // reqId -> { resolve, reject, timer }
    this.streamEarlyQueue = new Map(); // streamId -> Array<string | ArrayBuffer>
    this.cachedTurn = { servers: null, fetchedAt: 0 };

    // Zero-cost Edge auto-responder for dashboard RTT pings (does not wake or bill Durable Object!)
    try {
      if (typeof WebSocketRequestResponsePair !== "undefined" && state.setWebSocketAutoResponse) {
        state.setWebSocketAutoResponse(
          new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
        );
      }
    } catch {}

    if (state.blockConcurrencyWhile) {
      state.blockConcurrencyWhile(async () => {
        const saved = await state.storage.get("roomMeta").catch(() => null);
        if (saved && typeof saved === "object") {
          this.roomMeta = { ...this.roomMeta, ...saved };
        }
      });
    }
  }

  async saveMeta() {
    try {
      if (this.state?.storage?.put) {
        await this.state.storage.put("roomMeta", this.roomMeta);
      }
    } catch {}
  }

  async scheduleCleanupAlarm() {
    try {
      if (this.state?.storage?.setAlarm) {
        await this.state.storage.setAlarm(Date.now() + OFFLINE_PRUNE_MS);
      }
    } catch {}
  }

  getSockets(filterFn = null) {
    const all = this.state.getWebSockets ? this.state.getWebSockets() : [];
    const out = [];
    for (const ws of all) {
      if (ws.readyState === 2 || ws.readyState === 3) continue;
      let att = {};
      try {
        att = ws.deserializeAttachment() || {};
      } catch {}
      if (!filterFn || filterFn(att, ws)) {
        out.push({ ws, att });
      }
    }
    return out;
  }

  getColabControlSocket(excludeWs = null) {
    const list = this.getSockets((att, ws) => att.role === "colab" && ws !== excludeWs);
    return list.length > 0 ? list[0].ws : null;
  }

  isColabOnline(excludeWs = null) {
    const ws = this.getColabControlSocket(excludeWs);
    if (!ws) return false;
    if (this.roomMeta.lastColabActivityAt && Date.now() - this.roomMeta.lastColabActivityAt > HEARTBEAT_TIMEOUT_MS) {
      return false;
    }
    return true;
  }

  verifyToken(candidateToken) {
    if (!this.roomMeta.token) return false;
    return Boolean(candidateToken && candidateToken === this.roomMeta.token);
  }

  async getTurnIceServers() {
    const now = Date.now();
    if (this.cachedTurn.servers && now - this.cachedTurn.fetchedAt < TURN_CACHE_TTL_MS) {
      return this.cachedTurn.servers;
    }
    const servers = await generateCloudflareTurnServers(this.env).catch(() => null);
    if (servers && servers.length > 0) {
      this.cachedTurn = { servers, fetchedAt: now };
      return servers;
    }
    return null;
  }

  buildPublicStatus() {
    const online = this.isColabOnline();
    return {
      ok: true,
      roomId: this.roomMeta.roomId,
      online,
      colabReady: online,
      serverName: this.roomMeta.serverName || "Colab Cloud Gaming",
      gpuName: this.roomMeta.gpuName || "",
      driverVersion: this.roomMeta.driverVersion || "",
      resolution: this.roomMeta.resolution || "1920x1080@60",
      privateIp: this.roomMeta.privateIp || "",
      turnConfigured: Boolean((this.env.CF_TURN_KEY_ID && this.env.CF_TURN_API_TOKEN) || this.roomMeta.turnActive),
      apps: Array.isArray(this.roomMeta.apps) ? this.roomMeta.apps : [],
      desktopAppId: this.roomMeta.desktopAppId ?? null,
      steamAppId: this.roomMeta.steamAppId ?? null,
      colabConnectedAt: this.roomMeta.colabConnectedAt || null,
      colabDisconnectedAt: online ? null : (this.roomMeta.colabDisconnectedAt || null),
      lastColabActivityAt: this.roomMeta.lastColabActivityAt || null,
      timestamp: Date.now(),
    };
  }

  broadcastToClients(payload) {
    const raw = JSON.stringify(payload);
    for (const { ws } of this.getSockets((att) => att.role === "client")) {
      try {
        ws.send(raw);
      } catch {}
    }
  }

  async alarm() {
    if (!this.isColabOnline() && this.roomMeta.colabDisconnectedAt) {
      if (Date.now() - this.roomMeta.colabDisconnectedAt >= OFFLINE_PRUNE_MS - 5000) {
        if (this.state?.storage?.deleteAll) {
          await this.state.storage.deleteAll().catch(() => {});
        }
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // =========================================================================
    // A. Gateway requests forwarded from /r/<roomId>/<token>/api/...
    // =========================================================================
    if (url.pathname.startsWith("/__gw/api")) {
      const roomId = cleanRoom(request.headers.get("x-colabgg-room") || "");
      const token = request.headers.get("x-colabgg-token") || "";
      const subpath = request.headers.get("x-colabgg-subpath") || "/api";

      if (!this.verifyToken(token)) {
        return json({ error: "unauthorized", message: "Invalid Room ID or Connection Token" }, 401);
      }

      if (!this.isColabOnline()) {
        return json({ error: "colab_offline", message: "Colab GPU Server is currently offline" }, 503);
      }

      // 1. Streaming WebSocket bridge: /api/host/stream
      if (subpath === "/api/host/stream" && request.headers.get("Upgrade") === "websocket") {
        const colabWs = this.getColabControlSocket();
        if (!colabWs) {
          return json({ error: "colab_offline" }, 503);
        }

        const streamId = crypto.randomUUID();
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.state.acceptWebSocket(server);
        server.serializeAttachment({ role: "browser_stream", roomId, streamId });
        this.streamEarlyQueue.set(streamId, []);

        // Pre-warm TURN credentials so Setup injection is instant
        this.getTurnIceServers().catch(() => {});

        try {
          colabWs.send(JSON.stringify({ type: "open_stream_ws", streamId }));
        } catch {
          try {
            server.close(1011, "colab_send_failed");
          } catch {}
          return json({ error: "colab_unreachable" }, 502);
        }

        return new Response(null, { status: 101, webSocket: client });
      }

      // 2. Fast-path /api/authenticate (token was already verified above!)
      if (subpath === "/api/authenticate" && request.method === "GET") {
        return new Response("", { status: 200, headers: { "cache-control": "no-store" } });
      }

      // 3. Forward general HTTP API request (/api/role, /api/hosts, /api/apps, /api/app/image, etc.) to Colab
      return await this.forwardHttpToColab(request, subpath, url.search);
    }

    // =========================================================================
    // B. /api/colabgg/* Control & Signaling Endpoints
    // =========================================================================
    const roomParam = cleanRoom(url.searchParams.get("room") || "");
    const tokenParam = url.searchParams.get("token") || request.headers.get("x-colabgg-token") || "";

    // 1. GET /api/colabgg/status
    if (request.method === "GET" && url.pathname === "/api/colabgg/status") {
      if (!this.roomMeta.token) {
        return json({ error: "room_not_found", message: "Phòng chưa khởi tạo hoặc chưa kết nối từ Colab." }, 404);
      }
      if (!this.verifyToken(tokenParam)) {
        return json({ error: "invalid_token", message: "Sai mã Token kết nối." }, 401);
      }
      return json(this.buildPublicStatus());
    }

    // 2. POST /api/colabgg/turn (Fetch temporary Cloudflare TURN UDP credentials for Colab / Client)
    if ((request.method === "POST" || request.method === "GET") && url.pathname === "/api/colabgg/turn") {
      if (!this.verifyToken(tokenParam)) {
        return json({ error: "invalid_token" }, 401);
      }
      const iceServers = await this.getTurnIceServers();
      return json({
        ok: true,
        turnConfigured: Boolean(iceServers && iceServers.length > 0),
        iceServers: iceServers || [],
      });
    }

    // 3. WebSocket /api/colabgg/ws (roles: colab | colab_stream | client)
    if (url.pathname === "/api/colabgg/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "websocket_required" }, 426);
      }
      const role = url.searchParams.get("role") || "client";
      if (!tokenParam) {
        return json({ error: "token_required" }, 401);
      }

      if (role === "colab") {
        // First colab connection or matching token (or allow rotating token if no active colab is online)
        if (!this.roomMeta.token || !this.isColabOnline()) {
          this.roomMeta.roomId = roomParam;
          this.roomMeta.token = tokenParam;
        } else if (this.roomMeta.token !== tokenParam) {
          return json({ error: "invalid_token", message: "Room is already active with another token" }, 401);
        }

        // Close any stale colab control sockets
        for (const { ws } of this.getSockets((att) => att.role === "colab")) {
          try {
            ws.close(1000, "replaced");
          } catch {}
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.state.acceptWebSocket(server);
        server.serializeAttachment({ role: "colab", roomId: roomParam });

        const now = Date.now();
        this.roomMeta.roomId = roomParam;
        this.roomMeta.lastColabActivityAt = now;
        this.roomMeta.colabConnectedAt = now;
        this.roomMeta.colabDisconnectedAt = null;
        await this.saveMeta();

        const turnServers = await this.getTurnIceServers();
        server.send(JSON.stringify({
          type: "welcome",
          roomId: roomParam,
          iceServers: turnServers || [],
        }));
        this.broadcastToClients({ type: "status", ...this.buildPublicStatus() });

        return new Response(null, { status: 101, webSocket: client });
      }

      if (role === "colab_stream") {
        if (!this.verifyToken(tokenParam)) {
          return json({ error: "invalid_token" }, 401);
        }
        const streamId = url.searchParams.get("streamId") || "";
        if (!streamId) {
          return json({ error: "streamId_required" }, 400);
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.state.acceptWebSocket(server);
        server.serializeAttachment({ role: "colab_stream", roomId: roomParam, streamId });

        // Flush any buffered early messages sent by browser_stream before colab_stream connected
        const queued = this.streamEarlyQueue.get(streamId);
        this.streamEarlyQueue.delete(streamId);
        if (Array.isArray(queued) && queued.length > 0) {
          for (const item of queued) {
            try {
              server.send(item);
            } catch {}
          }
        }

        return new Response(null, { status: 101, webSocket: client });
      }

      // role === "client" (Dashboard live status watcher)
      if (!this.verifyToken(tokenParam)) {
        return json({ error: "invalid_token" }, 401);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ role: "client", roomId: roomParam });
      server.send(JSON.stringify({ type: "status", ...this.buildPublicStatus() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not_found" }, 404);
  }

  async forwardHttpToColab(request, subpath, search) {
    const colabWs = this.getColabControlSocket();
    if (!colabWs) {
      return json({ error: "colab_offline" }, 503);
    }

    const reqId = crypto.randomUUID();
    let bodyB64 = "";
    if (request.method !== "GET" && request.method !== "HEAD") {
      const ab = await request.arrayBuffer().catch(() => new ArrayBuffer(0));
      if (ab.byteLength > 0) {
        bodyB64 = bytesToBase64(new Uint8Array(ab));
      }
    }

    const reqHeaders = {};
    const ct = request.headers.get("content-type");
    if (ct) reqHeaders["content-type"] = ct;

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHttp.delete(reqId);
        reject(new Error("Colab HTTP proxy timeout"));
      }, HTTP_RPC_TIMEOUT_MS);
      this.pendingHttp.set(reqId, { resolve, reject, timer });
    });

    try {
      colabWs.send(JSON.stringify({
        type: "http_req",
        reqId,
        method: request.method,
        path: `${subpath}${search || ""}`,
        headers: reqHeaders,
        bodyB64,
      }));
    } catch (err) {
      const entry = this.pendingHttp.get(reqId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pendingHttp.delete(reqId);
      }
      return json({ error: "colab_send_error", message: err?.message || "Failed to send to Colab" }, 502);
    }

    try {
      const resMsg = await resultPromise;
      const outHeaders = new Headers();
      if (resMsg.headers && typeof resMsg.headers === "object") {
        for (const [k, v] of Object.entries(resMsg.headers)) {
          const lk = k.toLowerCase();
          if (["transfer-encoding", "content-encoding", "content-length", "connection", "set-cookie"].includes(lk)) continue;
          outHeaders.set(k, String(v));
        }
      }
      outHeaders.set("cache-control", "no-store");
      const bytes = base64ToBytes(resMsg.bodyB64 || "");
      return new Response(bytes, { status: Number(resMsg.status || 200), headers: outHeaders });
    } catch (err) {
      return json({ error: "gateway_timeout", message: err?.message || "Timed out waiting for Colab" }, 504);
    }
  }

  async webSocketMessage(ws, raw) {
    let att = {};
    try {
      att = ws.deserializeAttachment() || {};
    } catch {}
    const role = att.role || "";

    // 1. Dedicated raw 1-to-1 Stream WebSocket Bridge (zero-copy binary + text!)
    if (role === "browser_stream") {
      const streamId = att.streamId;
      const twin = this.getSockets((a) => a.role === "colab_stream" && a.streamId === streamId)[0]?.ws;
      if (twin) {
        try {
          twin.send(raw);
        } catch {}
      } else {
        const q = this.streamEarlyQueue.get(streamId);
        if (q && q.length < 64) {
          q.push(raw);
        }
      }
      return;
    }

    if (role === "colab_stream") {
      this.roomMeta.lastColabActivityAt = Date.now();
      const streamId = att.streamId;
      const twin = this.getSockets((a) => a.role === "browser_stream" && a.streamId === streamId)[0]?.ws;
      if (!twin) return;

      // Enrich WebRTC "Setup" message with Cloudflare TURN servers if configured on Worker
      if (typeof raw === "string" && raw.includes('"Setup"')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.Setup && Array.isArray(parsed.Setup.ice_servers)) {
            const turnList = await this.getTurnIceServers();
            if (turnList && turnList.length > 0) {
              const existingUrls = new Set(
                parsed.Setup.ice_servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]))
              );
              for (const ts of turnList) {
                const urls = Array.isArray(ts.urls) ? ts.urls : [ts.urls];
                if (!urls.some((u) => existingUrls.has(u))) {
                  parsed.Setup.ice_servers.unshift(ts);
                }
              }
              twin.send(JSON.stringify(parsed));
              return;
            }
          }
        } catch {}
      }

      try {
        twin.send(raw);
      } catch {}
      return;
    }

    // 2. Client Dashboard WebSocket Ping
    if (role === "client") {
      if (typeof raw === "string") {
        try {
          const m = JSON.parse(raw);
          if (m.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", ts: m.ts, serverTs: Date.now() }));
          }
        } catch {}
      }
      return;
    }

    // 3. Colab Control WebSocket
    if (role !== "colab" || typeof raw !== "string") return;

    let msg = {};
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    this.roomMeta.lastColabActivityAt = Date.now();

    if (msg.type === "http_res" && msg.reqId) {
      const pending = this.pendingHttp.get(msg.reqId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingHttp.delete(msg.reqId);
        pending.resolve(msg);
      }
      return;
    }

    if (msg.type === "hello" || msg.type === "heartbeat") {
      const prevSig = JSON.stringify([
        this.roomMeta.serverName,
        this.roomMeta.gpuName,
        this.roomMeta.driverVersion,
        this.roomMeta.resolution,
        this.roomMeta.privateIp,
        this.roomMeta.turnActive,
        this.roomMeta.apps,
      ]);

      if (msg.serverName) this.roomMeta.serverName = String(msg.serverName).slice(0, 80);
      if (msg.gpuName !== undefined) this.roomMeta.gpuName = String(msg.gpuName || "").slice(0, 80);
      if (msg.driverVersion !== undefined) this.roomMeta.driverVersion = String(msg.driverVersion || "").slice(0, 40);
      if (msg.resolution !== undefined) this.roomMeta.resolution = String(msg.resolution || "1920x1080@60").slice(0, 40);
      if (msg.privateIp !== undefined) this.roomMeta.privateIp = String(msg.privateIp || "").slice(0, 40);
      if (msg.turnActive !== undefined) this.roomMeta.turnActive = Boolean(msg.turnActive);
      if (Array.isArray(msg.apps)) {
        this.roomMeta.apps = msg.apps.slice(0, 30);
        const desk = this.roomMeta.apps.find((a) => /desktop/i.test(String(a.title || "")));
        const steam = this.roomMeta.apps.find((a) => /steam/i.test(String(a.title || "")));
        this.roomMeta.desktopAppId = desk ? desk.app_id : (this.roomMeta.apps[0]?.app_id ?? null);
        this.roomMeta.steamAppId = steam ? steam.app_id : null;
      }

      const nextSig = JSON.stringify([
        this.roomMeta.serverName,
        this.roomMeta.gpuName,
        this.roomMeta.driverVersion,
        this.roomMeta.resolution,
        this.roomMeta.privateIp,
        this.roomMeta.turnActive,
        this.roomMeta.apps,
      ]);

      // Only write to SQLite & broadcast when metadata actually changed (saves 99%+ DO row writes & messages!)
      if (msg.type === "hello" || prevSig !== nextSig) {
        await this.saveMeta();
        this.broadcastToClients({ type: "status", ...this.buildPublicStatus() });
      }
    }
  }

  async handleDisconnect(ws) {
    let att = {};
    try {
      att = ws.deserializeAttachment() || {};
    } catch {}

    if (att.role === "browser_stream" || att.role === "colab_stream") {
      const targetRole = att.role === "browser_stream" ? "colab_stream" : "browser_stream";
      this.streamEarlyQueue.delete(att.streamId);
      for (const { ws: twin } of this.getSockets((a) => a.role === targetRole && a.streamId === att.streamId)) {
        try {
          twin.close(1000, "peer_closed");
        } catch {}
      }
      return;
    }

    if (att.role === "colab") {
      if (!this.isColabOnline(ws)) {
        this.roomMeta.colabDisconnectedAt = Date.now();
        await this.saveMeta();
        await this.scheduleCleanupAlarm();
        this.broadcastToClients({ type: "status", ...this.buildPublicStatus() });
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code || 1000, reason || "closed");
    } catch {}
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws) {
    await this.handleDisconnect(ws);
  }
}

export const __test = { parseRoomGatewayPath, bytesToBase64, base64ToBytes, ColabGGRoom };

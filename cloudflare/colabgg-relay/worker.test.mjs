import test from "node:test";
import assert from "node:assert/strict";
import worker, { __test } from "./worker.js";

const { parseRoomGatewayPath, bytesToBase64, base64ToBytes, ColabGGRoom } = __test;

class MockSocket {
  constructor() {
    this.readyState = 1;
    this.sent = [];
    this.closed = false;
    this._att = null;
    this.peer = null;
  }
  send(data) {
    this.sent.push(data);
    if (this.peer && this.peer.onmessage) {
      this.peer.onmessage({ data });
    }
  }
  close(code = 1000, reason = "") {
    this.closed = true;
    this.readyState = 3;
    this.closeInfo = { code, reason };
  }
  serializeAttachment(obj) {
    this._att = JSON.parse(JSON.stringify(obj));
  }
  deserializeAttachment() {
    return this._att;
  }
}

// Polyfill Cloudflare Workers WebSocketPair & Response(101) for Node.js tests
globalThis.WebSocketPair = class WebSocketPair {
  constructor() {
    const client = new MockSocket();
    const server = new MockSocket();
    client.peer = server;
    server.peer = client;
    this[0] = client;
    this[1] = server;
  }
};

class MockState {
  constructor() {
    this.store = new Map();
    this.sockets = [];
    this.storage = {
      get: async (k) => this.store.get(k),
      put: async (k, v) => this.store.set(k, v),
      deleteAll: async () => this.store.clear(),
      setAlarm: async () => {},
    };
  }
  acceptWebSocket(ws) {
    this.sockets.push(ws);
  }
  getWebSockets() {
    return this.sockets;
  }
}

test("parseRoomGatewayPath distinguishes static files from /api routes", () => {
  const p1 = parseRoomGatewayPath("/r/gg-abc123/tok_xyz/stream.html");
  assert.deepEqual(p1, { roomId: "gg-abc123", token: "tok_xyz", rest: "/stream.html" });

  const p2 = parseRoomGatewayPath("/r/gg-abc123/tok_xyz/api.js");
  assert.equal(p2.rest, "/api.js");
  assert.equal(p2.rest.startsWith("/api/"), false);

  const p3 = parseRoomGatewayPath("/r/gg-abc123/tok_xyz/api/hosts");
  assert.equal(p3.rest, "/api/hosts");
  assert.equal(p3.rest.startsWith("/api/"), true);
});

test("base64 binary round-trip preserves arbitrary PNG bytes", () => {
  const sample = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10, 0x80]);
  const b64 = bytesToBase64(sample);
  const out = base64ToBytes(b64);
  assert.deepEqual(Array.from(out), Array.from(sample));
});

test("ColabGGRoom authenticates Colab, proxies HTTP RPC, and bridges binary/text stream sockets", async () => {
  const state = new MockState();
  const env = {};
  const room = new ColabGGRoom(state, env);

  // Override Response for status 101 in Node.js (undici rejects 101 in standard Response constructor)
  const OrigResponse = globalThis.Response;
  globalThis.Response = class PatchedResponse extends OrigResponse {
    constructor(body, init = {}) {
      if (init && init.status === 101) {
        super(null, { status: 200 });
        this._wsStatus = 101;
        this.webSocket = init.webSocket;
        return;
      }
      super(body, init);
    }
  };

  try {
    // 1. Connect Colab control socket
    const colabRes = await room.fetch(
      new Request("https://relay.example/api/colabgg/ws?room=gg-room1&role=colab&token=sec123", {
        headers: { Upgrade: "websocket" },
      })
    );
    assert.equal(colabRes._wsStatus, 101);
    const colabServerWs = state.sockets[0];

    // Send hello telemetry from Colab
    await room.webSocketMessage(
      colabServerWs,
      JSON.stringify({
        type: "hello",
        gpuName: "Tesla T4",
        driverVersion: "580.82.07",
        apps: [
          { app_id: 101, title: "Desktop" },
          { app_id: 202, title: "Steam Big Picture" },
        ],
      })
    );

    // 2. Check status endpoint with wrong vs right token
    const badStatus = await room.fetch(
      new Request("https://relay.example/api/colabgg/status?room=gg-room1&token=wrong")
    );
    assert.equal(badStatus.status, 401);

    const okStatus = await room.fetch(
      new Request("https://relay.example/api/colabgg/status?room=gg-room1&token=sec123")
    );
    assert.equal(okStatus.status, 200);
    const stJson = await okStatus.json();
    assert.equal(stJson.online, true);
    assert.equal(stJson.gpuName, "Tesla T4");
    assert.equal(stJson.desktopAppId, 101);
    assert.equal(stJson.steamAppId, 202);

    // 3. Test HTTP RPC proxy (/api/apps)
    const rpcPromise = room.fetch(
      new Request("https://relay.example/__gw/api/apps?host_id=0", {
        headers: {
          "x-colabgg-room": "gg-room1",
          "x-colabgg-token": "sec123",
          "x-colabgg-subpath": "/api/apps",
        },
      })
    );
    await new Promise((r) => setTimeout(r, 10));
    const lastColabMsg = JSON.parse(colabServerWs.sent[colabServerWs.sent.length - 1]);
    assert.equal(lastColabMsg.type, "http_req");
    assert.equal(lastColabMsg.path, "/api/apps?host_id=0");

    const payloadBytes = new TextEncoder().encode(JSON.stringify({ apps: [{ app_id: 101, title: "Desktop" }] }));
    await room.webSocketMessage(
      colabServerWs,
      JSON.stringify({
        type: "http_res",
        reqId: lastColabMsg.reqId,
        status: 200,
        headers: { "content-type": "application/json" },
        bodyB64: bytesToBase64(payloadBytes),
      })
    );
    const rpcResp = await rpcPromise;
    assert.equal(rpcResp.status, 200);
    const rpcBody = await rpcResp.json();
    assert.equal(rpcBody.apps[0].title, "Desktop");

    // 4. Test Stream WebSocket 1-to-1 bridging + early queue flush
    const browserStreamRes = await room.fetch(
      new Request("https://relay.example/__gw/api/host/stream", {
        headers: {
          Upgrade: "websocket",
          "x-colabgg-room": "gg-room1",
          "x-colabgg-token": "sec123",
          "x-colabgg-subpath": "/api/host/stream",
        },
      })
    );
    assert.equal(browserStreamRes._wsStatus, 101);
    const browserServerWs = state.sockets[1];

    const openCmd = JSON.parse(colabServerWs.sent[colabServerWs.sent.length - 1]);
    assert.equal(openCmd.type, "open_stream_ws");
    assert.ok(openCmd.streamId);

    // Browser sends Init BEFORE colab_stream connects -> buffered!
    const initPayload = JSON.stringify({ Init: { host_id: 0, app_id: 101 } });
    await room.webSocketMessage(browserServerWs, initPayload);

    // Now Colab opens colab_stream
    const colabStreamRes = await room.fetch(
      new Request(
        `https://relay.example/api/colabgg/ws?room=gg-room1&role=colab_stream&token=sec123&streamId=${openCmd.streamId}`,
        { headers: { Upgrade: "websocket" } }
      )
    );
    assert.equal(colabStreamRes._wsStatus, 101);
    const colabStreamServerWs = state.sockets[2];
    assert.equal(colabStreamServerWs.sent[0], initPayload);

    // Colab sends binary video frame -> forwarded zero-copy to browser!
    const binFrame = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await room.webSocketMessage(colabStreamServerWs, binFrame);
    assert.equal(browserServerWs.sent[0], binFrame);
  } finally {
    globalThis.Response = OrigResponse;
  }
});

test("Worker dynamic config.js returns exact room path_prefix", async () => {
  const req = new Request("https://relay.example/r/gg-room9/tok99/config.js");
  const resp = await worker.fetch(req, {});
  assert.equal(resp.status, 200);
  const text = await resp.text();
  assert.match(text, /"path_prefix":"\/r\/gg-room9\/tok99"/);
});

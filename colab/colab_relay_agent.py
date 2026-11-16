#!/usr/bin/env python3
"""
ColabGG Relay Agent — Bridges local Moonlight-Web (:8081) & Sunshine (:47990)
on Google Colab to the dedicated `colabgg-relay` Cloudflare Worker + Durable Object,
plus configures Cloudflare TURN UDP (`webrtc.ice_servers`) automatically.
"""
from __future__ import annotations

import asyncio
import base64
import inspect
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RELAY_URL = os.environ.get("COLABGG_RELAY_URL", "").strip().rstrip("/")
ROOM_ID = os.environ.get("COLABGG_ROOM_ID", "").strip()
TOKEN = os.environ.get("COLABGG_TOKEN", "").strip()
LOCAL_ORIGIN = os.environ.get("MOONWEB_LOCAL_ORIGIN", "http://127.0.0.1:8081").strip().rstrip("/")
WEB_USER = os.environ.get("WEB_USER", "admin").strip() or "admin"
WEB_PASS = os.environ.get("WEB_PASS", "admin").strip() or "admin"
CF_TURN_KEY_ID = os.environ.get("CF_TURN_KEY_ID", "").strip()
CF_TURN_API_TOKEN = os.environ.get("CF_TURN_API_TOKEN", "").strip()
MOONWEB_DIR = pathlib.Path(os.environ.get("MOONWEB_DIR", "/opt/moonlight-web/package"))


def build_ws_url(role: str, extra_query: dict[str, str] | None = None) -> str:
    raw = RELAY_URL
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urllib.parse.urlsplit(raw)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    params = {"room": ROOM_ID, "role": role, "token": TOKEN}
    if extra_query:
        params.update(extra_query)
    return urllib.parse.urlunsplit(
        (scheme, parsed.netloc, "/api/colabgg/ws", urllib.parse.urlencode(params), "")
    )


def local_ws_origin() -> str:
    parsed = urllib.parse.urlsplit(LOCAL_ORIGIN)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urllib.parse.urlunsplit((scheme, parsed.netloc, "", "", ""))


class LocalMoonWebClient:
    def __init__(self) -> None:
        self.cookie: str = ""
        self.turn_applied: bool = False

    def login(self) -> str:
        payload = json.dumps({"name": WEB_USER, "password": WEB_PASS}).encode("utf-8")
        for _ in range(15):
            try:
                req = urllib.request.Request(
                    f"{LOCAL_ORIGIN}/api/login",
                    data=payload,
                    method="POST",
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    cookies = resp.headers.get_all("Set-Cookie") or []
                    self.cookie = "; ".join(c.split(";", 1)[0] for c in cookies if "=" in c)
                    return self.cookie
            except Exception:
                time.sleep(1)
        return self.cookie

    def ensure_cookie(self) -> str:
        if not self.cookie:
            return self.login()
        return self.cookie

    def request(self, method: str, path_and_query: str, headers: dict[str, str], body: bytes) -> tuple[int, dict[str, str], bytes]:
        for attempt in range(2):
            cookie = self.ensure_cookie()
            req_headers = dict(headers or {})
            if cookie:
                req_headers["Cookie"] = cookie
            data = body if method not in ("GET", "HEAD") and body else None
            req = urllib.request.Request(
                f"{LOCAL_ORIGIN}{path_and_query}",
                data=data,
                method=method,
                headers=req_headers,
            )
            try:
                with urllib.request.urlopen(req, timeout=18) as resp:
                    out_body = resp.read()
                    out_headers = {k: v for k, v in resp.headers.items()}
                    return resp.status, out_headers, out_body
            except urllib.error.HTTPError as e:
                if e.code == 401 and attempt == 0:
                    self.cookie = ""
                    continue
                err_body = e.read() if e.fp else b""
                err_headers = {k: v for k, v in (e.headers.items() if e.headers else [])}
                return e.code, err_headers, err_body
            except Exception as exc:
                if attempt == 0:
                    time.sleep(0.4)
                    continue
                msg = json.dumps({"error": "local_moonweb_error", "message": str(exc)}).encode("utf-8")
                return 502, {"content-type": "application/json"}, msg
        return 502, {"content-type": "application/json"}, b'{"error":"unreachable"}'

    def get_apps(self) -> list[dict]:
        status, _, body = self.request("GET", "/api/apps?host_id=0", {}, b"")
        if status == 200 and body:
            try:
                data = json.loads(body.decode("utf-8"))
                return data.get("apps", []) if isinstance(data, dict) else []
            except Exception:
                pass
        return []


def query_gpu_telemetry() -> tuple[str, str, str, str]:
    gpu_name, driver_ver, priv_ip = "", "", ""
    resolution = "1920x1080@60"
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"],
            text=True,
            timeout=4,
            stderr=subprocess.DEVNULL,
        ).strip()
        if out:
            parts = [p.strip() for p in out.splitlines()[0].split(",")]
            gpu_name = parts[0] if len(parts) > 0 else ""
            driver_ver = parts[1] if len(parts) > 1 else ""
    except Exception:
        pass

    if not gpu_name:
        # CPU Fallback Mode — read CPU model & vCPU count
        cores = os.cpu_count() or 2
        cpu_model = "Colab CPU"
        try:
            for line in pathlib.Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.lower().startswith("model name"):
                    cpu_model = line.split(":", 1)[1].strip()
                    break
        except Exception:
            pass
        gpu_name = f"CPU Mode ({cores} vCPU - {cpu_model})"
        driver_ver = "software-x264"
        resolution = "1280x720@30"

    try:
        ip_out = subprocess.check_output(["hostname", "-I"], text=True, timeout=3).strip().split()
        if ip_out:
            priv_ip = ip_out[0]
    except Exception:
        pass
    return gpu_name, driver_ver, priv_ip, resolution


def fetch_direct_cloudflare_turn() -> list[dict]:
    if not (CF_TURN_KEY_ID and CF_TURN_API_TOKEN):
        return []
    url = f"https://rtc.live.cloudflare.com/v1/turn/keys/{urllib.parse.quote(CF_TURN_KEY_ID)}/credentials/generate"
    req = urllib.request.Request(
        url,
        data=b'{"ttl":86400}',
        method="POST",
        headers={
            "Authorization": f"Bearer {CF_TURN_API_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            ice = data.get("iceServers")
            if isinstance(ice, list):
                return ice
            if isinstance(ice, dict):
                return [ice]
    except Exception as exc:
        print(f"[TURN] Warning: Could not generate direct TURN credentials: {exc}", flush=True)
    return []


def apply_turn_to_moonweb_config(turn_servers: list[dict], local_client: LocalMoonWebClient) -> bool:
    if not turn_servers or not (MOONWEB_DIR / "web-server").exists():
        return False
    cfg_path = MOONWEB_DIR / "server" / "config.json"
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg = None
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception:
            cfg = None
    if not isinstance(cfg, dict):
        try:
            raw_cfg = subprocess.check_output(
                [str(MOONWEB_DIR / "web-server"), "print-config"],
                cwd=str(MOONWEB_DIR),
                text=True,
                timeout=8,
            )
            cfg = json.loads(raw_cfg)
        except Exception as exc:
            print(f"[TURN] Could not inspect web-server config.json: {exc}", flush=True)
            return False

    webrtc_cfg = cfg.setdefault("webrtc", {})
    existing = webrtc_cfg.get("ice_servers")
    if not isinstance(existing, list):
        existing = []

    # Remove old turn.cloudflare.com entries and prepend fresh ones
    cleaned = [
        s for s in existing
        if not any("cloudflare.com" in str(u) for u in (s.get("urls") if isinstance(s.get("urls"), list) else [s.get("urls")]))
    ]
    webrtc_cfg["ice_servers"] = list(turn_servers) + cleaned
    cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    # Restart local web-server cleanly so it reloads server/config.json with TURN UDP enabled
    subprocess.run(["pkill", "-f", str(MOONWEB_DIR / "web-server")], check=False)
    time.sleep(0.8)
    subprocess.Popen(
        [str(MOONWEB_DIR / "web-server"), "--bind-address", "0.0.0.0:8081"],
        cwd=str(MOONWEB_DIR),
        stdout=open("/tmp/webserver.log", "ab"),
        stderr=subprocess.STDOUT,
    )
    time.sleep(1.2)
    local_client.cookie = ""
    local_client.login()
    print("[TURN] Injected Cloudflare TURN UDP servers into Moonlight-Web streamer!", flush=True)
    return True


def _ws_connect_kwargs(websockets_mod, headers: dict[str, str] | None = None) -> dict:
    kwargs: dict = {"max_size": None, "ping_interval": 20, "ping_timeout": 20}
    if headers:
        sig = inspect.signature(websockets_mod.connect)
        if "additional_headers" in sig.parameters:
            kwargs["additional_headers"] = headers
        else:
            kwargs["extra_headers"] = headers
    return kwargs


async def bridge_stream_ws(stream_id: str, local_client: LocalMoonWebClient) -> None:
    import websockets

    cookie = await asyncio.to_thread(local_client.ensure_cookie)
    local_url = f"{local_ws_origin()}/api/host/stream"
    remote_url = build_ws_url("colab_stream", {"streamId": stream_id})

    local_headers = {"Cookie": cookie} if cookie else None
    try:
        async with websockets.connect(local_url, **_ws_connect_kwargs(websockets, local_headers)) as ws_local, \
                   websockets.connect(remote_url, **_ws_connect_kwargs(websockets)) as ws_remote:

            async def pump(src, dst) -> None:
                try:
                    async for frame in src:
                        await dst.send(frame)
                except Exception:
                    pass
                finally:
                    try:
                        await dst.close()
                    except Exception:
                        pass

            await asyncio.gather(pump(ws_remote, ws_local), pump(ws_local, ws_remote))
    except Exception as exc:
        print(f"[StreamBridge] Session {stream_id[:8]} ended: {exc}", flush=True)


async def handle_http_rpc(ws, msg: dict, local_client: LocalMoonWebClient) -> None:
    req_id = msg.get("reqId", "")
    method = str(msg.get("method") or "GET").upper()
    path = str(msg.get("path") or "/api")
    headers = msg.get("headers") if isinstance(msg.get("headers"), dict) else {}
    body = base64.b64decode(msg.get("bodyB64") or "") if msg.get("bodyB64") else b""

    status, resp_headers, resp_body = await asyncio.to_thread(
        local_client.request, method, path, headers, body
    )
    reply = {
        "type": "http_res",
        "reqId": req_id,
        "status": status,
        "headers": resp_headers,
        "bodyB64": base64.b64encode(resp_body).decode("ascii") if resp_body else "",
    }
    try:
        await ws.send(json.dumps(reply))
    except Exception:
        pass


async def relay_main() -> None:
    import websockets

    if not (RELAY_URL and ROOM_ID and TOKEN):
        print("[ERROR] COLABGG_RELAY_URL, COLABGG_ROOM_ID, and COLABGG_TOKEN are required.", flush=True)
        sys.exit(1)

    local_client = LocalMoonWebClient()
    await asyncio.to_thread(local_client.login)

    direct_turn = await asyncio.to_thread(fetch_direct_cloudflare_turn)
    if direct_turn:
        local_client.turn_applied = await asyncio.to_thread(apply_turn_to_moonweb_config, direct_turn, local_client)

    gpu_name, driver_ver, priv_ip, resolution = await asyncio.to_thread(query_gpu_telemetry)
    backoff = 2

    while True:
        try:
            ws_url = build_ws_url("colab")
            async with websockets.connect(ws_url, **_ws_connect_kwargs(websockets)) as ws:
                backoff = 2
                apps = await asyncio.to_thread(local_client.get_apps)
                await ws.send(json.dumps({
                    "type": "hello",
                    "serverName": "ColabGG Cloud Gaming",
                    "gpuName": gpu_name,
                    "driverVersion": driver_ver,
                    "resolution": resolution,
                    "privateIp": priv_ip,
                    "turnActive": local_client.turn_applied,
                    "apps": apps,
                }))
                print(f"[ColabGG Relay] Connected to room '{ROOM_ID}' at {RELAY_URL}!", flush=True)

                async def heartbeat_loop() -> None:
                    tick = 0
                    while True:
                        await asyncio.sleep(8.0)
                        tick += 1
                        cur_apps = await asyncio.to_thread(local_client.get_apps) if tick % 3 == 0 else apps
                        await ws.send(json.dumps({
                            "type": "heartbeat",
                            "gpuName": gpu_name,
                            "driverVersion": driver_ver,
                            "resolution": resolution,
                            "privateIp": priv_ip,
                            "turnActive": local_client.turn_applied,
                            "apps": cur_apps,
                        }))

                hb_task = asyncio.create_task(heartbeat_loop())
                try:
                    async for raw in ws:
                        if not isinstance(raw, str):
                            continue
                        msg = json.loads(raw)
                        mtype = msg.get("type")
                        if mtype == "welcome":
                            worker_turn = msg.get("iceServers") or []
                            if worker_turn and not local_client.turn_applied:
                                applied = await asyncio.to_thread(apply_turn_to_moonweb_config, worker_turn, local_client)
                                if applied:
                                    local_client.turn_applied = True
                                    await ws.send(json.dumps({"type": "heartbeat", "turnActive": True}))
                        elif mtype == "http_req":
                            asyncio.create_task(handle_http_rpc(ws, msg, local_client))
                        elif mtype == "open_stream_ws" and msg.get("streamId"):
                            asyncio.create_task(bridge_stream_ws(str(msg["streamId"]), local_client))
                finally:
                    hb_task.cancel()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[ColabGG Relay] Disconnected ({exc}), retrying in {backoff}s...", flush=True)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 20)


if __name__ == "__main__":
    asyncio.run(relay_main())

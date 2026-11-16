#!/usr/bin/env bash
set -uo pipefail

# Usage:
#   ./moon-pair.sh --auto     # Automatically add 127.0.0.1 & pair Moonlight Web with Sunshine
#   ./moon-pair.sh 1234       # Pair a specific 4-digit Moonlight PIN with Sunshine
#   ./moon-pair.sh            # Prompt interactively for PIN (or press Enter for --auto)

ARG="${1:-}"

if command -v sunshine >/dev/null 2>&1 && id user >/dev/null 2>&1; then
    su - user -c "sunshine --creds '${SUNSHINE_USER:-admin}' '${SUNSHINE_PASS:-admin}'" >/dev/null 2>&1 || true
fi

if [ -z "$ARG" ]; then
    printf "Enter Moonlight PIN (or press Enter for --auto): "
    read -r ARG || ARG="--auto"
    if [ -z "$ARG" ] || [ "$ARG" = "auto" ]; then
        ARG="--auto"
    fi
fi

python3 - "$ARG" <<'PYEOF'
import base64
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

WEB_BASE = os.environ.get("MOONWEB_URL", "http://127.0.0.1:8081/api")
SUNSHINE_BASE = os.environ.get("SUNSHINE_URL", "https://127.0.0.1:47990/api")
WEB_USER = os.environ.get("WEB_USER", "admin")
WEB_PASS = os.environ.get("WEB_PASS", "admin")
SUN_USER = os.environ.get("SUNSHINE_USER", "admin")
SUN_PASS = os.environ.get("SUNSHINE_PASS", "admin")

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def sunshine_req(path, payload):
    auth = base64.b64encode(f"{SUN_USER}:{SUN_PASS}".encode()).decode()
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{SUNSHINE_BASE}{path}",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth}",
        },
    )
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def ensure_sunshine_ready():
    for _ in range(25):
        try:
            req = urllib.request.Request(SUNSHINE_BASE.replace("/api", "/"), method="GET")
            urllib.request.urlopen(req, context=ssl_ctx, timeout=3)
            break
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(1)
    try:
        sunshine_req(
            "/password",
            {
                "currentUsername": SUN_USER,
                "currentPassword": SUN_PASS,
                "newUsername": SUN_USER,
                "newPassword": SUN_PASS,
                "confirmNewPassword": SUN_PASS,
            },
        )
    except Exception:
        pass


def web_req(path, method="GET", payload=None, cookie="", timeout=15):
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{WEB_BASE}{path}", data=data, method=method, headers={**headers})
    return urllib.request.urlopen(req, timeout=timeout)


def login_moonweb():
    for _ in range(20):
        try:
            resp = web_req("/login", method="POST", payload={"name": WEB_USER, "password": WEB_PASS})
            raw_cookies = resp.headers.get_all("Set-Cookie") or []
            cookie = "; ".join(c.split(";", 1)[0] for c in raw_cookies if "=" in c)
            return cookie
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise RuntimeError(f"Moonlight Web login rejected for user '{WEB_USER}' (HTTP {e.code}).")
            time.sleep(1)
        except Exception:
            time.sleep(1)
    raise RuntimeError("Moonlight Web server (:8081) did not become ready in time.")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--auto"
    ensure_sunshine_ready()

    if mode != "--auto":
        pin = mode.strip()
        status, body = sunshine_req("/pin", {"pin": pin, "name": "moonlight"})
        print(f"Sunshine PIN response ({status}): {body}")
        return 0

    cookie = login_moonweb()

    resp = web_req("/hosts", method="GET", cookie=cookie, timeout=15)
    first_line = resp.readline().decode("utf-8").strip()
    resp.close()
    hosts_obj = json.loads(first_line) if first_line else {"hosts": []}
    hosts = hosts_obj.get("hosts", [])

    target_host = None
    for h in hosts:
        if h.get("address") in ("127.0.0.1", "localhost") or len(hosts) == 1:
            target_host = h
            break

    if target_host is None:
        resp = web_req(
            "/host",
            method="POST",
            payload={"address": "127.0.0.1", "http_port": None},
            cookie=cookie,
            timeout=20,
        )
        target_host = json.loads(resp.read().decode("utf-8"))["host"]

    host_id = target_host["host_id"]

    try:
        web_req(
            "/host",
            method="PATCH",
            payload={"host_id": host_id, "change_owner": True, "owner": None},
            cookie=cookie,
            timeout=10,
        )
    except Exception:
        pass

    if target_host.get("paired") == "Paired":
        print(f"[Auto-Pair] Host #{host_id} (127.0.0.1) is already Paired!")
        return 0

    pair_resp = web_req(
        "/pair",
        method="POST",
        payload={"host_id": host_id},
        cookie=cookie,
        timeout=60,
    )
    stage1_raw = pair_resp.readline().decode("utf-8").strip()
    if not stage1_raw:
        raise RuntimeError("Empty stage 1 response from /api/pair")
    stage1 = json.loads(stage1_raw)
    if isinstance(stage1, str) or "Pin" not in stage1:
        raise RuntimeError(f"Failed to initiate pair (stage 1): {stage1}")

    pin = stage1["Pin"]
    print(f"[Auto-Pair] Generated Moonlight PIN: {pin} -> Submitting to Sunshine...")
    sunshine_req("/pin", {"pin": pin, "name": "moonlight-web"})

    stage2_raw = pair_resp.readline().decode("utf-8").strip()
    pair_resp.close()
    if not stage2_raw:
        raise RuntimeError("Empty stage 2 response from /api/pair")
    stage2 = json.loads(stage2_raw)
    if isinstance(stage2, str) or "Paired" not in stage2:
        raise RuntimeError(f"Failed to complete pair (stage 2): {stage2}")

    print(f"[Auto-Pair] Successfully paired Moonlight Web host #{host_id} with Sunshine!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
PYEOF

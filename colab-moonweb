#!/usr/bin/env bash
# ==============================================================================
# ColabGG Cloud Gaming — Native Ubuntu 24.04/22.04 Edition
# GPU (NVENC 1080p60) + CPU Fallback (Dummy Xorg 720p30)
# ==============================================================================

set -uo pipefail

if [ ! -d "/content" ] && [ "${FORCE_LINUX:-0}" != "1" ]; then
    echo "======================================================================"
    echo "[ERROR] Script nay duoc thiet ke de chay tren Google Colab (Linux)!"
    echo "        This script must be run inside a Google Colab runtime."
    echo "======================================================================"
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_SUSPEND=1
export NEEDRESTART_MODE=l
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/lib/games:$PATH"

STATE_FILE="/var/tmp/colab_gpu_setup.done"
LOG_FILE="/tmp/colab_gaming_setup.log"
MOONWEB_ZIP_URL="https://github.com/kmille36/moonlight-web-remote/releases/download/0.0.2/colab-linux.zip"
MOONWEB_FALLBACK_URL="https://bit.ly/4fuW6fO"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
STEAM_DEB_URL="https://cdn.fastly.steamstatic.com/client/installer/steam.deb"
CHROME_DEB_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
HEROIC_DEB_URL="https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/download/v2.22.4/Heroic-2.22.4-linux-amd64.deb"

WEB_USER="${WEB_USER:-admin}"
WEB_PASS="${WEB_PASS:-admin}"
SUNSHINE_USER="${SUNSHINE_USER:-admin}"
SUNSHINE_PASS="${SUNSHINE_PASS:-admin}"
RESTORE_BACKUP="${RESTORE_BACKUP:-ask}"
BACKUP_ON_EXIT="${BACKUP_ON_EXIT:-ask}"
AUTO_PAIR="${AUTO_PAIR:-true}"
KEEP_ALIVE_LOOP="${KEEP_ALIVE_LOOP:-true}"
SETUP_ONLY="${SETUP_ONLY:-false}"

COLABGG_RELAY_URL="${COLABGG_RELAY_URL:-}"
COLABGG_ROOM_ID="${COLABGG_ROOM_ID:-}"
COLABGG_TOKEN="${COLABGG_TOKEN:-}"
CF_TURN_KEY_ID="${CF_TURN_KEY_ID:-}"
CF_TURN_API_TOKEN="${CF_TURN_API_TOKEN:-}"
CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"

touch "$STATE_FILE" "$LOG_FILE"

log_info() { printf "\033[1;32m[INFO]\033[0m %s\n" "$*"; }
log_warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
log_err()  { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*"; }

already_done() {
    grep -qxF "$1" "$STATE_FILE" 2>/dev/null
}

mark_done() {
    if ! already_done "$1"; then
        echo "$1" >> "$STATE_FILE"
    fi
}

run_step() {
    local desc="$1"
    local cmd="$2"
    log_info "$desc..."
    echo "=== [$(date -Iseconds)] $desc ===" >> "$LOG_FILE"
    if bash -eo pipefail -c "$cmd" >> "$LOG_FILE" 2>&1; then
        return 0
    else
        local rc=$?
        log_err "Step failed (exit $rc): $desc"
        log_err "Last 30 log lines ($LOG_FILE):"
        tail -n 30 "$LOG_FILE" || true
        return $rc
    fi
}

optional_input() {
    local prompt="$1"
    local default="${2:-n}"
    local input=""
    if [ -t 0 ]; then
        printf "%s" "$prompt" >&2
        read -r input || input="$default"
    else
        input="$default"
    fi
    input=$(printf "%s" "$input" | tr '[:upper:]' '[:lower:]')
    printf "%s" "${input:-$default}"
}

user_exists() {
    id "$1" >/dev/null 2>&1
}

backup_user() {
    echo ""
    log_info "Stopping user session processes..."
    pkill -KILL -u user >/dev/null 2>&1 || true

    if ! mountpoint -q /content/drive 2>/dev/null && [ ! -d /content/drive/MyDrive ]; then
        log_warn "Google Drive not mounted (/content/drive/MyDrive). Skipping backup."
        exit 0
    fi

    local ans="n"
    if [ "$BACKUP_ON_EXIT" = "true" ] || [ "$BACKUP_ON_EXIT" = "y" ]; then
        ans="y"
    elif [ "$BACKUP_ON_EXIT" = "false" ] || [ "$BACKUP_ON_EXIT" = "n" ]; then
        ans="n"
    else
        ans=$(optional_input "Do you want to back up /home/user to Google Drive? (y/n): " "n")
    fi

    if [ "$ans" = "y" ]; then
        if [ ! -d /home/user ]; then
            log_err "/home/user does not exist."
            exit 1
        fi
        log_info "Backing up /home/user -> /content/drive/MyDrive/backup.tar.gz ..."
        tar -cf - -C /home/user ./ | pigz -6 > /content/drive/MyDrive/backup.tar.gz
        log_info "Backup completed: /content/drive/MyDrive/backup.tar.gz"
    else
        log_info "Backup skipped."
    fi
    exit 0
}

setup_linux_user() {
    echo "root:123456" | sudo chpasswd || true
    if ! user_exists user; then
        sudo useradd -m -s /bin/bash user
    fi
    echo "user:123456" | sudo chpasswd || true
    for grp in sudo video render audio input plugdev; do
        if getent group "$grp" >/dev/null 2>&1; then
            sudo usermod -aG "$grp" user || true
        fi
    done
    printf 'user ALL=(ALL) NOPASSWD:ALL\n' | sudo tee /etc/sudoers.d/colab-user >/dev/null
    sudo chmod 0440 /etc/sudoers.d/colab-user

    local uid
    uid=$(id -u user)
    sudo mkdir -p "/run/user/${uid}"
    sudo chown user:user "/run/user/${uid}"
    sudo chmod 0700 "/run/user/${uid}"

    sudo mkdir -p /home/user/.config/sunshine /home/user/Desktop
    printf '%s\n' "--no-sandbox" "--disable-dev-shm-usage" | sudo tee /home/user/.config/chrome-flags.conf >/dev/null
    printf '%s\n' "--no-sandbox" "--disable-dev-shm-usage" | sudo tee /home/user/.config/electron-flags.conf >/dev/null

    if ! sudo grep -q "COLABGG_ENV" /home/user/.profile 2>/dev/null; then
        cat <<EOF | sudo tee -a /home/user/.profile >/dev/null

# COLABGG_ENV
export XDG_RUNTIME_DIR="/run/user/${uid}"
export DISPLAY=":1"
export PATH="/usr/local/bin:/usr/games:/usr/lib/games:\$PATH"
EOF
    fi

    # Generate clean dark gradient desktop wallpaper if missing
    if [ ! -f /home/user/colabgg-wallpaper.png ]; then
        sudo python3 - /home/user/colabgg-wallpaper.png <<'PYWP' || true
import pathlib, struct, sys, zlib
w, h = 640, 360
rows = []
for y in range(h):
    row = bytearray([0])
    fy = y / (h - 1)
    for x in range(w):
        fx = x / (w - 1)
        r = int(11 + 14 * (1 - fy) + 8 * fx)
        g = int(19 + 34 * (1 - fy) + 18 * fx)
        b = int(38 + 56 * (1 - fy) + 26 * fx)
        row.extend((r, g, b))
    rows.append(bytes(row))
raw = b"".join(rows)
def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
pathlib.Path(sys.argv[1]).write_bytes(png)
PYWP
    fi

    sudo chown -R user:user /home/user
    sudo chmod 666 /dev/nvidia* /dev/dri/* 2>/dev/null || true
}

restore_backup() {
    if [ ! -d /content/drive/MyDrive ] || [ ! -f /content/drive/MyDrive/backup.tar.gz ]; then
        return 0
    fi
    setup_linux_user
    log_info "Restoring /content/drive/MyDrive/backup.tar.gz -> /home/user ..."
    pigz -dc /content/drive/MyDrive/backup.tar.gz | sudo tar -xf - -C /home/user
    setup_linux_user
    log_info "Backup restored successfully."
}

install_native_gaming_packages() {
    if already_done "packages_installed" && command -v sunshine >/dev/null 2>&1 && command -v steam >/dev/null 2>&1 && command -v Xorg >/dev/null 2>&1; then
        log_info "Desktop & gaming packages already installed, skipping."
        return 0
    fi

    run_step "Enable i386 multiarch & update Ubuntu package index" \
        "sudo dpkg --add-architecture i386 && sudo apt-get update -y" || return 1

    run_step "Install native Ubuntu Xorg, Openbox, PulseAudio & 32/64-bit Vulkan/OpenGL libraries" \
        "sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 NEEDRESTART_MODE=l apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' \
            wget curl pigz unzip jq pciutils psmisc ca-certificates file xz-utils lsof kmod libcap2-bin \
            xserver-xorg xserver-xorg-core xserver-xorg-input-all xserver-xorg-video-dummy xinit x11-xserver-utils x11-utils xauth dbus-x11 \
            openbox pulseaudio pulseaudio-utils alsa-utils feh xvkbd thunar xterm zenity \
            libnss3 python3-apt xdg-user-dirs xdg-utils xdg-desktop-portal xdg-desktop-portal-gtk \
            mesa-utils vulkan-tools libgl1 libgl1-mesa-dri libglx-mesa0 libegl1 libgbm1 libvulkan1 mesa-vulkan-drivers \
            libc6:i386 libstdc++6:i386 libgcc-s1:i386 libgl1:i386 libgl1-mesa-dri:i386 libglx-mesa0:i386 \
            libegl1:i386 libgbm1:i386 libvulkan1:i386 mesa-vulkan-drivers:i386 libpulse0:i386 \
            libx11-6:i386 libxext6:i386 libxinerama1:i386 libxrandr2:i386 libxss1:i386 libxtst6:i386" || return 1

    # Detect Ubuntu version for matching Sunshine .deb
    local ubu_ver="24.04"
    if [ -r /etc/os-release ]; then
        local det_ver
        det_ver=$(. /etc/os-release && printf "%s" "${VERSION_ID:-24.04}")
        case "$det_ver" in
            22.04|24.04|26.04) ubu_ver="$det_ver" ;;
            *) ubu_ver="24.04" ;;
        esac
    fi

    local sun_primary="https://github.com/SunshineStream/Sunshine/releases/download/v2026.914.233613/sunshine_2026.914.233613-1%2Bubuntu${ubu_ver}_amd64.deb"
    run_step "Download & install Sunshine GameStream Host (Ubuntu ${ubu_ver})" "
        rm -f /tmp/sunshine.deb
        if ! wget -q --retry-connrefused --tries=3 -O /tmp/sunshine.deb '$sun_primary' || [ ! -s /tmp/sunshine.deb ]; then
            eff=\$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/SunshineStream/Sunshine/releases/latest)
            tag=\"\${eff##*/}\"
            ver=\"\${tag#v}\"
            wget -q --retry-connrefused --tries=3 -O /tmp/sunshine.deb \"https://github.com/SunshineStream/Sunshine/releases/download/\${tag}/sunshine_\${ver}-1%2Bubuntu${ubu_ver}_amd64.deb\"
        fi
        sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 NEEDRESTART_MODE=l apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' /tmp/sunshine.deb
        rm -f /tmp/sunshine.deb
    " || return 1

    # Clear file capabilities if container bounding set blocks non-root exec
    if user_exists user && ! su - user -c "sunshine --version" >/dev/null 2>&1; then
        sudo setcap -r "$(readlink -f "$(command -v sunshine)")" 2>/dev/null || true
    fi

    run_step "Download & install official Valve Steam Launcher & Google Chrome" "
        rm -f /tmp/steam.deb /tmp/chrome.deb
        wget -q --retry-connrefused --tries=3 -O /tmp/steam.deb '$STEAM_DEB_URL'
        wget -q --retry-connrefused --tries=3 -O /tmp/chrome.deb '$CHROME_DEB_URL'
        sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 NEEDRESTART_MODE=l apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' /tmp/steam.deb /tmp/chrome.deb
        sudo rm -f /etc/apt/sources.list.d/steam*.list /tmp/steam.deb /tmp/chrome.deb
        sudo ln -sf /bin/true /usr/bin/steamdeps
    " || return 1

    # Optional Heroic Games Launcher (Epic / GOG / Amazon)
    if ! command -v heroic >/dev/null 2>&1; then
        run_step "Install Heroic Games Launcher (Epic/GOG)" "
            rm -f /tmp/heroic.deb
            wget -q --retry-connrefused --tries=2 -O /tmp/heroic.deb '$HEROIC_DEB_URL' && \
            sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 NEEDRESTART_MODE=l apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' /tmp/heroic.deb
            rm -f /tmp/heroic.deb
        " || log_warn "Optional Heroic launcher skipped; continuing."
    fi

    printf 'allowed_users=anybody\nneeds_root_rights=yes\n' | sudo tee /etc/X11/Xwrapper.config >/dev/null
    mark_done "packages_installed"
}

install_matching_nvidia_driver() {
    local xorg_drv="/usr/lib/x86_64-linux-gnu/xorg/modules/drivers/nvidia_drv.so"
    if already_done "nvidia_driver_installed" && [ -f "$xorg_drv" ] && nvidia-smi >/dev/null 2>&1; then
        log_info "NVIDIA Xorg & 32/64-bit userspace libraries already configured, skipping."
        return 0
    fi

    local host_ver=""
    if [ -r /proc/driver/nvidia/version ]; then
        host_ver=$(sed -n 's/.*Kernel Module  *\([0-9][0-9.]*\).*/\1/p' /proc/driver/nvidia/version | head -n 1)
    fi
    if [ -z "$host_ver" ]; then
        host_ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -n 1 | tr -d '[:space:]')
    fi
    if [ -z "$host_ver" ]; then
        log_err "Could not detect host NVIDIA kernel driver version!"
        return 1
    fi

    local major="${host_ver%%.*}"
    log_info "Detected Colab host NVIDIA kernel module version: $host_ver (series $major)"

    local installer="/tmp/NVIDIA-Linux-x86_64-${host_ver}.run"
    local dl_ok="false"
    for nv_url in \
        "https://us.download.nvidia.com/tesla/${host_ver}/NVIDIA-Linux-x86_64-${host_ver}.run" \
        "https://download.nvidia.com/tesla/${host_ver}/NVIDIA-Linux-x86_64-${host_ver}.run" \
        "https://us.download.nvidia.com/XFree86/Linux-x86_64/${host_ver}/NVIDIA-Linux-x86_64-${host_ver}.run" \
        "https://download.nvidia.com/XFree86/Linux-x86_64/${host_ver}/NVIDIA-Linux-x86_64-${host_ver}.run"
    do
        if wget -q --retry-connrefused --tries=2 -O "$installer" "$nv_url" && [ -s "$installer" ]; then
            dl_ok="true"
            log_info "Downloaded exact NVIDIA driver archive ($host_ver)"
            break
        fi
        rm -f "$installer"
    done

    if [ "$dl_ok" = "true" ]; then
        chmod +x "$installer"
        run_step "Unpack & configure container-safe NVIDIA Xorg, NVENC & 32/64-bit GL/Vulkan ($host_ver)" "
            sudo rm -rf /tmp/nv_extract
            sudo '$installer' --extract-only --target /tmp/nv_extract
            sudo mkdir -p /usr/lib/x86_64-linux-gnu/xorg/modules/drivers \
                          /usr/lib/x86_64-linux-gnu/xorg/modules/extensions \
                          /usr/local/lib/nvidia64 \
                          /usr/local/lib/nvidia32 \
                          /usr/share/glvnd/egl_vendor.d \
                          /etc/vulkan/icd.d

            nv_drv=\$(find /tmp/nv_extract -maxdepth 2 -name 'nvidia_drv.so' -print -quit)
            if [ -n \"\$nv_drv\" ]; then
                sudo cp -f \"\$nv_drv\" /usr/lib/x86_64-linux-gnu/xorg/modules/drivers/nvidia_drv.so
            fi

            glx_so=\$(find /tmp/nv_extract -maxdepth 2 -name 'libglxserver_nvidia.so.*' -print -quit)
            if [ -n \"\$glx_so\" ]; then
                base_glx=\$(basename \"\$glx_so\")
                sudo cp -f \"\$glx_so\" /usr/lib/x86_64-linux-gnu/xorg/modules/extensions/
                sudo ln -sf \"\$base_glx\" /usr/lib/x86_64-linux-gnu/xorg/modules/extensions/libglxserver_nvidia.so
                sudo ln -sf \"\$base_glx\" /usr/lib/x86_64-linux-gnu/xorg/modules/extensions/libglxserver_nvidia.so.1
            fi

            nv_xcfg=\$(find /tmp/nv_extract -maxdepth 2 -name 'nvidia-xconfig' -type f -print -quit)
            if [ -n \"\$nv_xcfg\" ]; then
                sudo cp -f \"\$nv_xcfg\" /usr/local/bin/nvidia-xconfig
                sudo chmod +x /usr/local/bin/nvidia-xconfig
            fi

            find /tmp/nv_extract -maxdepth 1 -type f -name '*.so.*' ! -name 'libglxserver_nvidia*' -exec sudo cp -f {} /usr/local/lib/nvidia64/ \;
            if [ -d /tmp/nv_extract/32 ]; then
                find /tmp/nv_extract/32 -maxdepth 2 -type f -name '*.so.*' -exec sudo cp -f {} /usr/local/lib/nvidia32/ \;
            fi

            sudo rm -rf /tmp/nv_extract '$installer'
        " || return 1
    else
        log_warn "Exact NVIDIA-$host_ver.run archive unavailable; installing Ubuntu nvidia-$major packages..."
        run_step "Install Ubuntu xserver-xorg-video-nvidia-${major} & NVENC/GL libraries" \
            "sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 NEEDRESTART_MODE=l apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' xserver-xorg-video-nvidia-${major} libnvidia-gl-${major} libnvidia-gl-${major}:i386 libnvidia-encode-${major} nvidia-utils-${major}" || return 1
    fi

    sudo tee /usr/share/glvnd/egl_vendor.d/10_nvidia.json >/dev/null <<'EOF'
{
    "file_format_version" : "1.0.0",
    "ICD" : {
        "library_path" : "libEGL_nvidia.so.0"
    }
}
EOF

    sudo tee /etc/vulkan/icd.d/nvidia_icd.json >/dev/null <<'EOF'
{
    "file_format_version" : "1.0.0",
    "ICD": {
        "library_path": "libGLX_nvidia.so.0",
        "api_version" : "1.3"
    }
}
EOF

    printf "/usr/lib64-nvidia\n/usr/local/lib/nvidia64\n/usr/local/lib/nvidia32\n" | sudo tee /etc/ld.so.conf.d/99-colabgg-nvidia.conf >/dev/null
    sudo ldconfig
    sudo chmod 666 /dev/nvidia* /dev/dri/* 2>/dev/null || true

    if [ ! -f "$xorg_drv" ]; then
        log_err "nvidia_drv.so was not installed at $xorg_drv!"
        return 1
    fi

    mark_done "nvidia_driver_installed"
}

write_nvidia_xorg_conf() {
    local headless_none="${1:-false}"
    if command -v nvidia-xconfig >/dev/null 2>&1; then
        if [ "$headless_none" = "true" ]; then
            sudo nvidia-xconfig -a --allow-empty-initial-configuration --use-display-device=None --virtual=1920x1080 --preserve-busid >> "$LOG_FILE" 2>&1 && return 0
        else
            sudo nvidia-xconfig -a --allow-empty-initial-configuration --virtual=1920x1080 --preserve-busid >> "$LOG_FILE" 2>&1 && return 0
        fi
    fi

    # Fallback pure-Python PCI BusID xorg.conf generator
    sudo python3 - "$headless_none" <<'PYXORG'
import pathlib, re, subprocess, sys
use_none = sys.argv[1] == "true"
raw = subprocess.check_output(["nvidia-smi", "--query-gpu=gpu_bus_id", "--format=csv,noheader"], text=True).splitlines()[0].strip()
m = re.search(r"([0-9a-fA-F]+):([0-9a-fA-F]+)\.([0-9a-fA-F]+)$", raw)
bus_id = f"PCI:{int(m.group(1), 16)}:{int(m.group(2), 16)}:{int(m.group(3), 16)}" if m else "PCI:0:4:0"
extra = '    Option         "UseDisplayDevice" "None"\n' if use_none else ""
conf = f'''Section "ServerLayout"
    Identifier     "Layout0"
    Screen      0  "Screen0" 0 0
EndSection

Section "Monitor"
    Identifier     "Monitor0"
    HorizSync       28.0 - 80.0
    VertRefresh     43.0 - 75.0
EndSection

Section "Device"
    Identifier     "Device0"
    Driver         "nvidia"
    VendorName     "NVIDIA Corporation"
    BusID          "{bus_id}"
    Option         "AllowEmptyInitialConfiguration" "True"
{extra}EndSection

Section "Screen"
    Identifier     "Screen0"
    Device         "Device0"
    Monitor        "Monitor0"
    DefaultDepth    24
    SubSection     "Display"
        Depth       24
        Virtual     1920 1080
    EndSubSection
EndSection
'''
pathlib.Path("/etc/X11/xorg.conf").write_text(conf, encoding="utf-8")
PYXORG
}

setup_cpu_dummy_display() {
    sudo tee /etc/X11/xorg.conf >/dev/null <<'XORGEOF'
Section "Device"
    Identifier  "Configured Video Device"
    Driver      "dummy"
    VideoRam    256000
EndSection

Section "Monitor"
    Identifier  "Configured Monitor"
    HorizSync   30.0-130.0
    VertRefresh 50.0-120.0
    Modeline "1280x720_60.00" 74.48 1280 1336 1472 1664 720 721 724 746 -HSync +Vsync
    Modeline "1920x1080_60.00" 172.80 1920 2040 2248 2576 1080 1081 1084 1118 -HSync +Vsync
EndSection

Section "Screen"
    Identifier  "Default Screen"
    Monitor     "Configured Monitor"
    Device      "Configured Video Device"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Modes "1280x720_60.00" "1920x1080_60.00"
    EndSubSection
EndSection
XORGEOF
}

configure_sunshine_encoder() {
    local has_gpu="$1"
    local conf="/home/user/.config/sunshine/sunshine.conf"
    local apps="/home/user/.config/sunshine/apps.json"
    sudo mkdir -p /home/user/.config/sunshine
    sudo touch "$conf"

    sudo python3 - "$conf" "$apps" "$has_gpu" <<'PYSUN'
import json, pathlib, re, sys
p = pathlib.Path(sys.argv[1])
apps_p = pathlib.Path(sys.argv[2])
has_gpu = sys.argv[3] == "true"

txt = p.read_text(encoding="utf-8", errors="ignore")
txt = re.sub(r"\n?# COLABGG_AUTO_START.*?# COLABGG_AUTO_END\n?", "\n", txt, flags=re.S)
txt = re.sub(r"\n?# COLABGG_CPU_MODE_START.*?# COLABGG_CPU_MODE_END\n?", "\n", txt, flags=re.S).strip()

lines = [
    "# COLABGG_AUTO_START",
    "sunshine_name = ColabGG Cloud Gaming",
    "capture = x11",
    "audio_sink = sunshine_sink",
    "upnp = disabled",
    "system_tray = disabled",
    "notify_pre_releases = disabled",
]
if not has_gpu:
    lines.extend([
        "encoder = software",
        "sw_preset = ultrafast",
    ])
lines.append("# COLABGG_AUTO_END")
block = "\n".join(lines) + "\n"
txt = (txt + "\n\n" + block).lstrip()
p.write_text(txt, encoding="utf-8")

if not apps_p.exists():
    apps_data = {
        "env": {"PATH": "$(PATH):$(HOME)/.local/bin:/usr/games:/usr/local/bin"},
        "apps": [
            {"name": "Desktop", "image-path": "desktop.png"},
            {
                "name": "Steam Big Picture",
                "detached": ["setsid steam steam://open/bigpicture"],
                "image-path": "steam.png",
            },
        ],
    }
    apps_p.write_text(json.dumps(apps_data, indent=2) + "\n", encoding="utf-8")
PYSUN
    sudo chown -R user:user /home/user/.config/sunshine
}

steam_check_loop() {
    log_info "Entering keep-alive & watchdog loop..."
    while true; do
        if ! pgrep -u user -x steam >/dev/null 2>&1 && ! pgrep -u user -f "ubuntu12_32/steam" >/dev/null 2>&1; then
            su - user -c 'DISPLAY=:1 nohup steam -console >/tmp/steam.log 2>&1 &' || true
        fi
        if ! pgrep -u user -x sunshine >/dev/null 2>&1; then
            su - user -c 'DISPLAY=:1 nohup sunshine >/tmp/sunshine.log 2>&1 &' || true
        fi
        if [ -n "$COLABGG_RELAY_URL" ] && [ -n "$COLABGG_ROOM_ID" ] && ! pgrep -f "colab_relay_agent.py" >/dev/null 2>&1; then
            COLABGG_RELAY_URL="$COLABGG_RELAY_URL" COLABGG_ROOM_ID="$COLABGG_ROOM_ID" COLABGG_TOKEN="$COLABGG_TOKEN" \
            CF_TURN_KEY_ID="$CF_TURN_KEY_ID" CF_TURN_API_TOKEN="$CF_TURN_API_TOKEN" WEB_USER="$WEB_USER" WEB_PASS="$WEB_PASS" \
            nohup python3 /content/colab_relay_agent.py >/tmp/colabgg_relay.log 2>&1 &
        fi
        sleep 25
    done
}

main() {
    echo "======================================================================"
    echo "   ColabGG Cloud Gaming — Auto GPU (NVENC) / CPU Fallback Edition"
    echo "======================================================================"

    # Enlarge /dev/shm when allowed so Steam Chromium UI & X11 MIT-SHM never OOM
    sudo mount -o remount,size=4G /dev/shm 2>/dev/null || true

    local has_gpu="false"
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        has_gpu="true"
        log_info "Hardware Mode: NVIDIA GPU Detected -> Full 1080p60 NVENC Acceleration!"
    else
        log_warn "No NVIDIA GPU detected -> Enabling CPU Fallback Mode (720p30 Dummy Xorg + Ultrafast x264)!"
        log_warn "(Ideal for downloading/installing Steam games & backing up to Drive without using GPU quota)"
    fi

    # 1. Safe /etc/profile.d/custom_path.sh
    printf '#!/bin/sh\nexport PATH="$PATH:/usr/local/bin:/usr/games:/usr/lib/games"\n' | sudo tee /etc/profile.d/custom_path.sh >/dev/null
    sudo chmod 0755 /etc/profile.d/custom_path.sh

    # 2. Install native Ubuntu 24.04/22.04 packages + Sunshine + Steam + Chrome
    install_native_gaming_packages || exit 1

    # 3. User setup & optional Google Drive backup restore
    setup_linux_user
    if [ -f /content/drive/MyDrive/backup.tar.gz ]; then
        local do_restore="n"
        if [ "$RESTORE_BACKUP" = "true" ] || [ "$RESTORE_BACKUP" = "y" ]; then
            do_restore="y"
        elif [ "$RESTORE_BACKUP" = "false" ] || [ "$RESTORE_BACKUP" = "n" ]; then
            do_restore="n"
        else
            do_restore=$(optional_input "Found backup.tar.gz on Google Drive. Restore backup? (y/n): " "n")
        fi
        if [ "$do_restore" = "y" ]; then
            restore_backup
        fi
    fi

    # 4. Configure Display Driver (NVIDIA GPU vs CPU Dummy Xorg)
    if [ "$has_gpu" = "true" ]; then
        install_matching_nvidia_driver || exit 1
        log_info "Configuring virtual 1920x1080 NVIDIA Xorg screen..."
        write_nvidia_xorg_conf "false"
    else
        setup_cpu_dummy_display || exit 1
    fi

    # 5. Start Xorg display (:1)
    if ! pgrep -f "Xorg :1" >/dev/null 2>&1; then
        sudo rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 || true
        log_info "Starting Xorg server on DISPLAY=:1 ..."
        sudo nohup Xorg :1 -config /etc/X11/xorg.conf -seat seat-1 -novtswitch -nolisten tcp -noreset >/tmp/xorg.log 2>&1 &
        for _ in $(seq 1 10); do
            if DISPLAY=:1 xrandr >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done

        # Headless datacenter Tesla/L4/A100 GPUs (0 display heads) sometimes require UseDisplayDevice=None
        if ! DISPLAY=:1 xrandr >/dev/null 2>&1 && [ "$has_gpu" = "true" ]; then
            log_warn "Retrying Xorg :1 with headless UseDisplayDevice=None config..."
            sudo pkill -f "Xorg :1" >/dev/null 2>&1 || true
            sleep 1
            sudo rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 || true
            write_nvidia_xorg_conf "true"
            sudo nohup Xorg :1 -config /etc/X11/xorg.conf -seat seat-1 -novtswitch -nolisten tcp -noreset >/tmp/xorg.log 2>&1 &
            for _ in $(seq 1 10); do
                if DISPLAY=:1 xrandr >/dev/null 2>&1; then
                    break
                fi
                sleep 1
            done
        fi
    fi

    if ! DISPLAY=:1 xrandr >/dev/null 2>&1; then
        log_err "Xorg :1 failed to start! Check /tmp/xorg.log:"
        tail -n 35 /tmp/xorg.log || true
        exit 1
    fi

    DISPLAY=:1 xhost +local: >/dev/null 2>&1 || true
    local xout=""
    xout=$(DISPLAY=:1 xrandr 2>/dev/null | awk '/ connected/{print $1; exit}')
    if [ -n "$xout" ]; then
        if [ "$has_gpu" = "true" ]; then
            DISPLAY=:1 xrandr --output "$xout" --mode 1920x1080 --rate 60 >/dev/null 2>&1 || \
            DISPLAY=:1 xrandr --output "$xout" --mode 1920x1080 >/dev/null 2>&1 || true
        else
            DISPLAY=:1 xrandr --output "$xout" --mode "1280x720_60.00" >/dev/null 2>&1 || \
            DISPLAY=:1 xrandr --output "$xout" --mode 1280x720 >/dev/null 2>&1 || true
        fi
    fi

    # 6. Start PulseAudio (virtual sink), Openbox, Sunshine, Steam, Heroic, Chrome
    configure_sunshine_encoder "$has_gpu"

    log_info "Starting PulseAudio, Openbox, Sunshine, Steam & desktop tools..."
    su - user -c 'pulseaudio --check >/dev/null 2>&1 || pulseaudio --start --exit-idle-time=-1 >/dev/null 2>&1 || true'
    su - user -c 'pactl list short sinks 2>/dev/null | grep -q sunshine_sink || pactl load-module module-null-sink sink_name=sunshine_sink sink_properties=device.description="Sunshine_Virtual_Audio" >/dev/null 2>&1 || true'
    su - user -c 'pactl set-default-sink sunshine_sink >/dev/null 2>&1 || true'

    pgrep -u user -x openbox >/dev/null 2>&1 || su - user -c 'DISPLAY=:1 nohup openbox >/tmp/openbox.log 2>&1 &'
    sleep 1
    if [ -f /home/user/nvidia-wallpaper.jpg ]; then
        su - user -c 'DISPLAY=:1 feh --bg-scale ~/nvidia-wallpaper.jpg >/dev/null 2>&1 || true'
    elif [ -f /home/user/colabgg-wallpaper.png ]; then
        su - user -c 'DISPLAY=:1 feh --bg-scale ~/colabgg-wallpaper.png >/dev/null 2>&1 || true'
    else
        DISPLAY=:1 xsetroot -solid "#0f172a" >/dev/null 2>&1 || true
    fi

    pkill -u user -x sunshine >/dev/null 2>&1 || true
    sleep 1
    if ! su - user -c "sunshine --version" >/dev/null 2>&1; then
        sudo setcap -r "$(readlink -f "$(command -v sunshine)")" 2>/dev/null || true
    fi
    su - user -c "sunshine --creds '$SUNSHINE_USER' '$SUNSHINE_PASS'" >/dev/null 2>&1 || true
    su - user -c 'DISPLAY=:1 nohup sunshine >/tmp/sunshine.log 2>&1 &'

    pgrep -u user -x steam >/dev/null 2>&1 || su - user -c 'DISPLAY=:1 nohup steam -console >/tmp/steam.log 2>&1 &'
    pgrep -u user -x xvkbd >/dev/null 2>&1 || su - user -c 'DISPLAY=:1 nohup xvkbd >/dev/null 2>&1 &'
    pgrep -u user -x thunar >/dev/null 2>&1 || su - user -c 'DISPLAY=:1 nohup thunar >/dev/null 2>&1 &'
    if command -v heroic >/dev/null 2>&1 && ! pgrep -u user -f heroic >/dev/null 2>&1; then
        su - user -c 'DISPLAY=:1 nohup heroic --no-sandbox --disable-dev-shm-usage >/tmp/heroic.log 2>&1 &' || true
    fi
    if command -v google-chrome >/dev/null 2>&1 && ! pgrep -u user -f google-chrome >/dev/null 2>&1; then
        su - user -c 'DISPLAY=:1 nohup google-chrome --no-sandbox --disable-dev-shm-usage --no-first-run https://store.steampowered.com >/tmp/chrome.log 2>&1 &' || true
    fi

    # 7. Install, patch, and launch Moonlight Web Remote (:8081)
    if [ ! -x /opt/moonlight-web/package/web-server ]; then
        run_step "Download & unpack Moonlight Web Remote" \
            "sudo rm -rf /opt/moonlight-web && (wget -q --retry-connrefused --tries=3 -O /tmp/colab-linux.zip -L '$MOONWEB_ZIP_URL' || wget --no-check-certificate -q -O /tmp/colab-linux.zip -L '$MOONWEB_FALLBACK_URL') && sudo unzip -qo /tmp/colab-linux.zip -d /opt/moonlight-web && rm -f /tmp/colab-linux.zip && sudo chmod +x /opt/moonlight-web/package/web-server /opt/moonlight-web/package/streamer" || exit 1
    fi
    sudo python3 -c '
import pathlib
p = pathlib.Path("/opt/moonlight-web/package/static/api.js")
if p.exists():
    s = p.read_text(encoding="utf-8")
    old = "request.signal = AbortSignal.timeout(timeout);"
    new = "if (!(init && init.noTimeout)) { request.signal = AbortSignal.timeout(timeout); }"
    if old in s and new not in s:
        p.write_text(s.replace(old, new, 1), encoding="utf-8")
d = pathlib.Path("/opt/moonlight-web/package/static/default_settings.js")
if d.exists():
    ds = d.read_text(encoding="utf-8")
    ds = ds.replace("\"dataTransport\": \"websocket\"", "\"dataTransport\": \"auto\"", 1)
    d.write_text(ds, encoding="utf-8")
'

    pkill -f "/opt/moonlight-web/package/web-server" >/dev/null 2>&1 || true
    sleep 1
    log_info "Starting local Moonlight Web Server on 0.0.0.0:8081 ..."
    (cd /opt/moonlight-web/package && nohup ./web-server --bind-address 0.0.0.0:8081 >/tmp/webserver.log 2>&1 &)

    # 8. Auto-pair Moonlight Web (127.0.0.1) with Sunshine (:47990)
    if [ "$AUTO_PAIR" = "true" ]; then
        log_info "Auto-pairing local Moonlight Web with Sunshine..."
        WEB_USER="$WEB_USER" WEB_PASS="$WEB_PASS" SUNSHINE_USER="$SUNSHINE_USER" SUNSHINE_PASS="$SUNSHINE_PASS" python3 - --auto <<'PYAUTOPAIR' || log_warn "Auto-pair warning; can re-run moon-pair.sh"
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


def sunshine_req(path, method="GET", payload=None, extra_headers=None):
    auth = base64.b64encode(f"{SUN_USER}:{SUN_PASS}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}
    if extra_headers:
        headers.update(extra_headers)
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{SUNSHINE_BASE}{path}",
        data=data,
        method=method,
        headers=headers,
    )
    with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
        raw_cookies = resp.headers.get_all("Set-Cookie") or []
        cookie = "; ".join(c.split(";", 1)[0] for c in raw_cookies if "=" in c)
        return resp.status, resp.read().decode("utf-8", errors="replace"), cookie


def get_sunshine_csrf_headers():
    headers = {}
    try:
        _, body, cookie = sunshine_req("/csrf-token", method="GET")
        if cookie:
            headers["Cookie"] = cookie
        obj = json.loads(body)
        tok = obj.get("csrf_token") or obj.get("token") or ""
        if tok:
            headers["X-CSRF-Token"] = tok
    except Exception:
        pass
    return headers


def ensure_sunshine_ready():
    for _ in range(30):
        try:
            req = urllib.request.Request(SUNSHINE_BASE.replace("/api", "/"), method="GET")
            urllib.request.urlopen(req, context=ssl_ctx, timeout=3)
            break
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(1)
    try:
        csrf_hdrs = get_sunshine_csrf_headers()
        sunshine_req(
            "/password",
            method="POST",
            payload={
                "currentUsername": SUN_USER,
                "currentPassword": SUN_PASS,
                "newUsername": SUN_USER,
                "newPassword": SUN_PASS,
                "confirmNewPassword": SUN_PASS,
            },
            extra_headers=csrf_hdrs,
        )
    except Exception:
        pass


def submit_sunshine_pin(pin, client_name="moonlight-web"):
    csrf_hdrs = get_sunshine_csrf_headers()
    supports_pairing_list = False
    for _ in range(18):
        try:
            _, body, _ = sunshine_req("/pin", method="GET", extra_headers=csrf_hdrs)
            data = json.loads(body)
            if isinstance(data, dict) and "pairings" in data:
                supports_pairing_list = True
                pairings = data.get("pairings") or []
                if pairings:
                    last_status, last_body = 200, body
                    for item in pairings:
                        pid = item.get("id") or item.get("pairing_id") or ""
                        payload = {"pin": pin, "name": client_name}
                        if pid:
                            payload["pairing_id"] = pid
                        last_status, last_body, _ = sunshine_req(
                            "/pin",
                            method="POST",
                            payload=payload,
                            extra_headers=csrf_hdrs,
                        )
                        try:
                            if json.loads(last_body).get("status") is True:
                                return last_status, last_body
                        except Exception:
                            return last_status, last_body
                    return last_status, last_body
                time.sleep(0.35)
                continue
            break
        except urllib.error.HTTPError as e:
            if e.code in (404, 405):
                break
            time.sleep(0.35)
        except Exception:
            break

    status, body, _ = sunshine_req(
        "/pin",
        method="POST",
        payload={"pin": pin, "name": client_name},
        extra_headers=csrf_hdrs,
    )
    return status, body


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
    for _ in range(25):
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
        status, body = submit_sunshine_pin(pin, "moonlight")
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
    submit_sunshine_pin(pin, "moonlight-web")

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
PYAUTOPAIR
    fi

    if [ "$SETUP_ONLY" = "true" ]; then
        log_info "Local Cloud Gaming stack (Xorg + Sunshine + Moonlight-Web) is ready!"
        return 0
    fi

    # 9. Optional Cloudflare Zero Trust Named Tunnel
    if [ -n "$CF_TUNNEL_TOKEN" ]; then
        if [ ! -x /usr/local/bin/cloudflared ]; then
            run_step "Install cloudflared binary" \
                "sudo wget -q --retry-connrefused --tries=3 '$CLOUDFLARED_URL' -O /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared" || true
        fi
        pkill -f "cloudflared tunnel.*--token" >/dev/null 2>&1 || true
        nohup /usr/local/bin/cloudflared tunnel --no-autoupdate --protocol quic run --token "$CF_TUNNEL_TOKEN" >/tmp/cf_zerotrust.log 2>&1 &
    fi

    # 10. Primary Connection Mode: VaultBox-style Cloudflare Relay Room OR Legacy Quick Tunnel
    if [ -n "$COLABGG_RELAY_URL" ] && [ -n "$COLABGG_ROOM_ID" ] && [ -n "$COLABGG_TOKEN" ]; then
        run_step "Install Python websockets client for ColabGG Relay" \
            "python3 -m pip install -q websockets" || exit 1

        cat <<'PYRELAYEOF' > /content/colab_relay_agent.py
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
    kwargs: dict = {"max_size": None, "ping_interval": 30, "ping_timeout": 25}
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
                    nonlocal apps
                    tick = 0
                    while True:
                        await asyncio.sleep(60.0)
                        tick += 1
                        if not apps or tick % 5 == 0:
                            fresh = await asyncio.to_thread(local_client.get_apps)
                            if fresh:
                                apps = fresh
                        await ws.send(json.dumps({
                            "type": "heartbeat",
                            "gpuName": gpu_name,
                            "driverVersion": driver_ver,
                            "resolution": resolution,
                            "privateIp": priv_ip,
                            "turnActive": local_client.turn_applied,
                            "apps": apps,
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

PYRELAYEOF
        chmod +x /content/colab_relay_agent.py
        pkill -f "colab_relay_agent.py" >/dev/null 2>&1 || true
        log_info "Starting ColabGG Relay Agent -> $COLABGG_RELAY_URL (Room: $COLABGG_ROOM_ID)..."
        COLABGG_RELAY_URL="$COLABGG_RELAY_URL" COLABGG_ROOM_ID="$COLABGG_ROOM_ID" COLABGG_TOKEN="$COLABGG_TOKEN" \
        CF_TURN_KEY_ID="$CF_TURN_KEY_ID" CF_TURN_API_TOKEN="$CF_TURN_API_TOKEN" WEB_USER="$WEB_USER" WEB_PASS="$WEB_PASS" \
        nohup python3 /content/colab_relay_agent.py >/tmp/colabgg_relay.log 2>&1 &

        for _ in $(seq 1 15); do
            if grep -q "Connected to room" /tmp/colabgg_relay.log 2>/dev/null; then
                break
            fi
            sleep 1
        done
        log_info "ColabGG Relay Room '$COLABGG_ROOM_ID' is LIVE!"
    else
        if [ ! -x /usr/local/bin/cloudflared ]; then
            run_step "Install cloudflared binary" \
                "sudo wget -q --retry-connrefused --tries=3 '$CLOUDFLARED_URL' -O /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared" || exit 1
        fi
        pkill -f "cloudflared tunnel --protocol http2" >/dev/null 2>&1 || true
        rm -f /tmp/cloudflared.log
        nohup /usr/local/bin/cloudflared tunnel --protocol http2 --url http://127.0.0.1:8081 >/tmp/cloudflared.log 2>&1 &
        local tunnel_url=""
        for _ in $(seq 1 30); do
            tunnel_url=$(grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -n 1 || true)
            [ -n "$tunnel_url" ] && break
            sleep 1
        done
        echo "Quick Tunnel URL: ${tunnel_url:-unavailable} (Login: $WEB_USER / $WEB_PASS)"
    fi

    if [ "$KEEP_ALIVE_LOOP" = "true" ]; then
        steam_check_loop
    fi
}

trap backup_user SIGINT SIGTERM

main "$@"

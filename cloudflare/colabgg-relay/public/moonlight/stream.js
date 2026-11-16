var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import "./polyfill/index.js";
import { apiGetRole, getApi } from "./api.js";
import { showErrorPopup } from "./component/error.js";
import { Stream } from "./stream/index.js";
import { getModalBackground, showMessage, showModal } from "./component/modal/index.js";
import { getSidebarRoot, setSidebar, setSidebarExtended, setSidebarStyle } from "./component/sidebar/index.js";
import { defaultStreamInputConfig } from "./stream/input.js";
import { getLocalStreamSettings } from "./component/settings_menu.js";
import { SelectComponent } from "./component/input.js";
import { StreamKeys } from "./api_bindings.js";
import { VirtualKeyboard } from "./component/virtual_keyboard.js";
import { CustomKeysOverlay } from "./component/custom_keys.js";
import { FormModal } from "./component/modal/form.js";
import { streamStatsToText } from "./stream/stats.js";
import { convertToKey } from "./stream/keyboard.js";
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations } from "./i18n.js";
let I = getTranslations(getCurrentLanguage());
function startApp() {
    return __awaiter(this, void 0, void 0, function* () {
        const api = yield getApi();
        const bootstrapRole = yield apiGetRole(api, { id: null });
        adoptRoleDefaultLanguage(bootstrapRole.role.default_settings);
        I = getTranslations(getCurrentLanguage());
        const rootElement = document.getElementById("root");
        if (rootElement == null) {
            showErrorPopup(I.stream.rootNotFound, true);
            return;
        }
        // Get Host and App via Query
        const queryParams = new URLSearchParams(location.search);
        const hostIdStr = queryParams.get("hostId");
        const appIdStr = queryParams.get("appId");
        if (hostIdStr == null || appIdStr == null) {
            yield showMessage(I.stream.missingHostOrApp);
            window.close();
            return;
        }
        const hostId = Number.parseInt(hostIdStr);
        const appId = Number.parseInt(appIdStr);
        // event propagation on overlays
        const sidebarRoot = getSidebarRoot();
        if (sidebarRoot) {
            stopPropagationOn(sidebarRoot);
        }
        const modalBackground = getModalBackground();
        if (modalBackground) {
            stopPropagationOn(modalBackground);
        }
        // Start and Mount App
        const app = new ViewerApp(api, hostId, appId, bootstrapRole.role);
        app.mount(rootElement);
        window["app"] = app;
        initSmartTurnOverlay(app);
    });
}
// Prevent starting transition
window.requestAnimationFrame(() => {
    var _a;
    // Note: elements is a live array
    const elements = document.getElementsByClassName("prevent-start-transition");
    while (elements.length > 0) {
        (_a = elements.item(0)) === null || _a === void 0 ? void 0 : _a.classList.remove("prevent-start-transition");
    }
});
startApp();
class ViewerApp {
    constructor(api, hostId, appId, bootstrapRole) {
        this.div = document.createElement("div");
        this.statsDiv = document.createElement("div");
        this.localTouchCursorDiv = document.createElement("div");
        this.stream = null;
        this.inputConfig = defaultStreamInputConfig();
        this.autoEnterFullscreenOnStart = false;
        this.pendingAutoFullscreenPrompt = false;
        this.fullscreenPromptShown = false;
        this.toggleFullscreenWithKeybind = false;
        this.hasShownFullscreenEscapeWarning = false;
        this.isTogglingFullscreenWithKeybind = "none";
        this.api = api;
        const settings = getLocalStreamSettings(bootstrapRole.default_settings);
        Object.assign(this.inputConfig, {
            mouseMode: settings.mouseMode,
            mouseScrollMode: settings.mouseScrollMode,
            touchMode: settings.touchMode,
            localCursorSensitivity: settings.localCursorSensitivity,
            controllerConfig: settings.controllerConfig
        });
        // Configure sidebar
        this.sidebar = new ViewerSidebar(this);
        setSidebar(this.sidebar);
        // Configure stats element
        this.statsDiv.hidden = true;
        this.statsDiv.classList.add("video-stats");
        this.localTouchCursorDiv.hidden = true;
        this.localTouchCursorDiv.classList.add("local-touch-cursor");
        setInterval(() => {
            var _a;
            // Update stats display every 100ms
            const stats = (_a = this.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats && stats.isEnabled()) {
                this.statsDiv.hidden = false;
                const text = streamStatsToText(stats.getCurrentStats());
                this.statsDiv.innerText = text;
            }
            else {
                this.statsDiv.hidden = true;
            }
        }, 100);
        this.div.appendChild(this.statsDiv);
        this.div.appendChild(this.localTouchCursorDiv);
        // Configure stream
        this.previousMouseMode = this.inputConfig.mouseMode;
        const browserWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const browserHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        this.autoEnterFullscreenOnStart = settings.enterFullscreenOnStreamStart;
        this.toggleFullscreenWithKeybind = settings.toggleFullscreenWithKeybind;
        this.startStream(hostId, appId, bootstrapRole.permissions, settings, [browserWidth, browserHeight]);
        // Configure input
        this.addListeners(document);
        this.addListeners(document.getElementById("input"));
        // In mobile Chrome with Pointer Lock, wheel events can be intercepted by
        // the browser before reaching the element. A capture-phase listener on
        // document catches them at the earliest point in the event chain.
        document.addEventListener("wheel", this.onMouseWheel.bind(this), { capture: true, passive: false });
        window.addEventListener("blur", () => {
            var _a;
            (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().raiseAllKeys();
        });
        document.addEventListener("visibilitychange", () => {
            var _a;
            if (document.visibilityState !== "visible") {
                (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().raiseAllKeys();
            }
        });
        document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
        document.addEventListener("fullscreenchange", this.onFullscreenChange.bind(this));
        window.addEventListener("gamepadconnected", this.onGamepadConnect.bind(this));
        window.addEventListener("gamepaddisconnected", this.onGamepadDisconnect.bind(this));
        // Connect all gamepads
        for (const gamepad of navigator.getGamepads()) {
            if (gamepad != null) {
                this.onGamepadAdd(gamepad);
            }
        }
    }
    addListeners(element) {
        element.addEventListener("keydown", this.onKeyDown.bind(this), { passive: false });
        element.addEventListener("keyup", this.onKeyUp.bind(this), { passive: false });
        element.addEventListener("paste", this.onPaste.bind(this));
        element.addEventListener("mousedown", this.onMouseButtonDown.bind(this), { passive: false });
        element.addEventListener("mouseup", this.onMouseButtonUp.bind(this), { passive: false });
        element.addEventListener("mousemove", this.onMouseMove.bind(this), { passive: false });
        element.addEventListener("wheel", this.onMouseWheel.bind(this), { passive: false });
        element.addEventListener("contextmenu", this.onContextMenu.bind(this), { passive: false });
        element.addEventListener("touchstart", this.onTouchStart.bind(this), { passive: false });
        element.addEventListener("touchend", this.onTouchEnd.bind(this), { passive: false });
        element.addEventListener("touchcancel", this.onTouchCancel.bind(this), { passive: false });
        element.addEventListener("touchmove", this.onTouchMove.bind(this), { passive: false });
    }
    startStream(hostId, appId, permissions, settings, browserSize) {
        return __awaiter(this, void 0, void 0, function* () {
            setSidebarStyle({
                edge: settings.sidebarEdge,
            });
            this.stream = new Stream(this.api, hostId, appId, settings, browserSize, permissions);
            // Add app info listener
            this.stream.addInfoListener(this.onInfo.bind(this));
            // Create connection info modal
            const connectionInfo = new ConnectionInfoModal();
            const connectionInfoListener = connectionInfo.onInfo.bind(connectionInfo);
            this.stream.addInfoListener(connectionInfoListener);
            void showModal(connectionInfo).then(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                (_a = this.stream) === null || _a === void 0 ? void 0 : _a.removeInfoListener(connectionInfoListener);
                if (this.autoEnterFullscreenOnStart && this.pendingAutoFullscreenPrompt && !this.fullscreenPromptShown && !this.isFullscreen()) {
                    this.fullscreenPromptShown = true;
                    this.pendingAutoFullscreenPrompt = false;
                    yield this.promptAutoFullscreen();
                }
            }));
            // Start animation frame loop
            this.onTouchUpdate();
            this.onGamepadUpdate();
            this.stream.getInput().addScreenKeyboardVisibleEvent(this.onScreenKeyboardSetVisible.bind(this));
            this.stream.mount(this.div);
            if (this.autoEnterFullscreenOnStart) {
                this.pendingAutoFullscreenPrompt = true;
            }
        });
    }
    onInfo(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = event.detail;
            if (data.type == "app") {
                const app = data.app;
                document.title = `Stream: ${app.title}`;
            }
            else if (data.type == "connectionComplete") {
                this.sidebar.onCapabilitiesChange(data.capabilities);
            }
        });
    }
    focusInput() {
        var _a;
        if (((_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().getCurrentPredictedTouchAction()) != "screenKeyboard" && !this.sidebar.getScreenKeyboard().isVisible()) {
            const inputElement = document.getElementById("input");
            inputElement.focus();
        }
    }
    onUserInteraction() {
        var _a, _b, _c, _d;
        this.focusInput();
        (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.onUserInteraction();
        (_d = (_c = this.stream) === null || _c === void 0 ? void 0 : _c.getAudioPlayer()) === null || _d === void 0 ? void 0 : _d.onUserInteraction();
    }
    onScreenKeyboardSetVisible(event) {
        console.info(event.detail);
        const screenKeyboard = this.sidebar.getScreenKeyboard();
        const newShown = event.detail.visible;
        if (newShown != screenKeyboard.isVisible()) {
            if (newShown) {
                screenKeyboard.show();
            }
            else {
                screenKeyboard.hide();
            }
        }
    }
    // Input
    getInputConfig() {
        return this.inputConfig;
    }
    setInputConfig(config) {
        var _a;
        Object.assign(this.inputConfig, config);
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().setConfig(this.inputConfig);
        this.renderLocalTouchCursor();
    }
    // Keyboard
    onKeyDown(event) {
        var _a;
        this.onUserInteraction();
        console.debug(event);
        if (event.shiftKey && event.ctrlKey && event.code == "KeyV") {
            // We are likely pasting -> don't send keys
        }
        else if (event.code == "F11") {
            // Allow manual fullscreen
        }
        else {
            event.preventDefault();
            (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onKeyDown(event);
        }
        event.stopPropagation();
    }
    onKeyUp(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onKeyUp(event);
        event.stopPropagation();
        if (this.toggleFullscreenWithKeybind && this.isTogglingFullscreenWithKeybind == "none" && event.ctrlKey && event.shiftKey && event.code == "KeyI") {
            this.isTogglingFullscreenWithKeybind = "waitForCtrl";
        }
        if (this.isTogglingFullscreenWithKeybind == "waitForCtrl" && (event.code == "ControlRight" || event.code == "ControlLeft")) {
            this.isTogglingFullscreenWithKeybind = "makingFullscreen";
            (() => __awaiter(this, void 0, void 0, function* () {
                if (this.isFullscreen()) {
                    yield this.exitPointerLock();
                    yield this.exitFullscreen();
                }
                else {
                    yield this.requestFullscreen();
                    yield this.requestPointerLock();
                }
                this.isTogglingFullscreenWithKeybind = "none";
            }))();
        }
    }
    onPaste(event) {
        var _a;
        this.onUserInteraction();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onPaste(event);
        event.stopPropagation();
    }
    // Mouse
    onMouseButtonDown(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseDown(event, this.getStreamRect());
        event.stopPropagation();
    }
    onMouseButtonUp(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseUp(event);
        event.stopPropagation();
    }
    onMouseMove(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseMove(event, this.getStreamRect());
        event.stopPropagation();
    }
    onMouseWheel(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseWheel(event);
        event.stopPropagation();
    }
    onContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
    }
    // Touch
    onTouchStart(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchStart(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchEnd(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchEnd(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchCancel(event) {
        var _a;
        this.onUserInteraction();
        event === null || event === void 0 ? void 0 : event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchCancel(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchUpdate() {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchUpdate(this.getStreamRect());
        this.renderLocalTouchCursor();
        window.requestAnimationFrame(this.onTouchUpdate.bind(this));
    }
    onTouchMove(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchMove(event, this.getStreamRect());
        event.stopPropagation();
    }
    // Gamepad
    onGamepadConnect(event) {
        this.onGamepadAdd(event.gamepad);
    }
    onGamepadAdd(gamepad) {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadConnect(gamepad);
    }
    onGamepadDisconnect(event) {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadDisconnect(event);
    }
    onGamepadUpdate() {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadUpdate();
        window.requestAnimationFrame(this.onGamepadUpdate.bind(this));
    }
    // Fullscreen
    promptAutoFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            yield showModal(new AutoFullscreenModal(this.requestFullscreen.bind(this)));
        });
    }
    requestFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const body = document.body;
            if (body) {
                if (!("requestFullscreen" in body && typeof body.requestFullscreen == "function")) {
                    yield showMessage(I.stream.fullscreenUnsupported);
                    return;
                }
                this.focusInput();
                if (!this.isFullscreen()) {
                    try {
                        yield body.requestFullscreen({
                            navigationUI: "hide"
                        });
                    }
                    catch (e) {
                        console.warn("failed to request fullscreen", e);
                    }
                }
                if ("keyboard" in navigator && navigator.keyboard && "lock" in navigator.keyboard) {
                    yield navigator.keyboard.lock();
                    if (!this.hasShownFullscreenEscapeWarning) {
                        yield showMessage(I.stream.fullscreenEscapeHint);
                    }
                    this.hasShownFullscreenEscapeWarning = true;
                }
                if (((_a = this.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().getConfig().mouseMode) == "relative") {
                    yield this.requestPointerLock();
                }
                try {
                    if (screen && "orientation" in screen) {
                        const orientation = screen.orientation;
                        if ("lock" in orientation && typeof orientation.lock == "function") {
                            yield orientation.lock("landscape");
                        }
                    }
                }
                catch (e) {
                    console.warn("failed to set orientation to landscape", e);
                }
            }
            else {
                console.warn("root element not found");
            }
        });
    }
    exitFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            if ("keyboard" in navigator && navigator.keyboard && "unlock" in navigator.keyboard) {
                yield navigator.keyboard.unlock();
            }
            if ("exitFullscreen" in document && typeof document.exitFullscreen == "function") {
                yield document.exitFullscreen();
            }
        });
    }
    isFullscreen() {
        return "fullscreenElement" in document && !!document.fullscreenElement;
    }
    onFullscreenChange() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkFullyImmersed();
        });
    }
    // Pointer Lock
    requestPointerLock() {
        return __awaiter(this, arguments, void 0, function* (errorIfNotFound = false) {
            this.previousMouseMode = this.inputConfig.mouseMode;
            const inputElement = document.getElementById("input");
            if (inputElement && "requestPointerLock" in inputElement && typeof inputElement.requestPointerLock == "function") {
                this.focusInput();
                this.inputConfig.mouseMode = "relative";
                this.setInputConfig(this.inputConfig);
                setSidebarExtended(false);
                const onLockError = () => {
                    document.removeEventListener("pointerlockerror", onLockError);
                    // Fallback: try to request pointer lock without options
                    inputElement.requestPointerLock();
                };
                document.addEventListener("pointerlockerror", onLockError, { once: true });
                try {
                    let promise = inputElement.requestPointerLock({
                        unadjustedMovement: true
                    });
                    if (promise) {
                        yield promise;
                    }
                    else {
                        inputElement.requestPointerLock();
                    }
                }
                catch (error) {
                    // Some platforms do not support unadjusted movement. If you
                    // would like PointerLock anyway, request again.
                    if (error instanceof Error && error.name == "NotSupportedError") {
                        inputElement.requestPointerLock();
                    }
                    else {
                        throw error;
                    }
                }
                finally {
                    document.removeEventListener("pointerlockerror", onLockError);
                }
            }
            else if (errorIfNotFound) {
                yield showMessage(I.stream.pointerLockUnsupported);
            }
        });
    }
    exitPointerLock() {
        return __awaiter(this, void 0, void 0, function* () {
            if ("exitPointerLock" in document && typeof document.exitPointerLock == "function") {
                document.exitPointerLock();
            }
        });
    }
    onPointerLockChange() {
        this.checkFullyImmersed();
        if (!document.pointerLockElement) {
            this.inputConfig.mouseMode = this.previousMouseMode;
            this.setInputConfig(this.inputConfig);
        }
    }
    // -- Fully immersed Fullscreen -> Fullscreen API + Pointer Lock
    checkFullyImmersed() {
        if ("pointerLockElement" in document && document.pointerLockElement &&
            "fullscreenElement" in document && document.fullscreenElement) {
            // We're fully immersed -> remove sidebar
            setSidebar(null);
        }
        else {
            setSidebar(this.sidebar);
        }
    }
    renderLocalTouchCursor() {
        var _a;
        const localCursorState = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().getLocalCursorState();
        if (!(localCursorState === null || localCursorState === void 0 ? void 0 : localCursorState.visible)) {
            this.localTouchCursorDiv.hidden = true;
            return;
        }
        const rect = this.getStreamRect();
        if (rect.width <= 0 || rect.height <= 0) {
            this.localTouchCursorDiv.hidden = true;
            return;
        }
        this.localTouchCursorDiv.hidden = false;
        this.localTouchCursorDiv.style.left = `${rect.left + localCursorState.x * rect.width}px`;
        this.localTouchCursorDiv.style.top = `${rect.top + localCursorState.y * rect.height}px`;
    }
    mount(parent) {
        parent.appendChild(this.div);
    }
    unmount(parent) {
        parent.removeChild(this.div);
    }
    getStreamRect() {
        var _a, _b, _c;
        // The bounding rect of the videoElement or canvasElement can be bigger than the actual video
        // -> We need to correct for this when sending positions, else positions are wrong
        return (_c = (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.getStreamRect()) !== null && _c !== void 0 ? _c : new DOMRect();
    }
    getStream() {
        return this.stream;
    }
}
class ConnectionInfoModal {
    constructor() {
        this.eventTarget = new EventTarget();
        this.root = document.createElement("div");
        this.textTy = null;
        this.text = document.createElement("p");
        this.options = document.createElement("div");
        this.debugDetailButton = document.createElement("button");
        this.closeButton = document.createElement("button");
        this.debugDetail = ""; // We store this seperate because line breaks don't work when the element is not mounted on the dom
        this.debugDetailDisplay = document.createElement("div");
        this.root.classList.add("modal-video-connect");
        this.text.innerText = I.stream.connecting;
        this.root.appendChild(this.text);
        this.root.appendChild(this.options);
        this.options.classList.add("modal-video-connect-options");
        this.debugDetailButton.innerText = I.stream.showLogs;
        this.debugDetailButton.addEventListener("click", this.onDebugDetailClick.bind(this));
        this.options.appendChild(this.debugDetailButton);
        this.closeButton.innerText = I.stream.close;
        this.closeButton.addEventListener("click", this.onClose.bind(this));
        this.options.appendChild(this.closeButton);
        this.debugDetailDisplay.classList.add("textlike");
        this.debugDetailDisplay.classList.add("modal-video-connect-debug");
    }
    onDebugDetailClick() {
        let debugDetailCurrentlyShown = this.root.contains(this.debugDetailDisplay);
        if (debugDetailCurrentlyShown) {
            this.debugDetailButton.innerText = I.stream.showLogs;
            this.root.removeChild(this.debugDetailDisplay);
        }
        else {
            this.debugDetailButton.innerText = I.stream.hideLogs;
            this.root.appendChild(this.debugDetailDisplay);
            this.debugDetailDisplay.innerText = this.debugDetail;
        }
    }
    debugLog(line) {
        this.debugDetail += `${line}\n`;
        this.debugDetailDisplay.innerText = this.debugDetail;
        console.info(`[Stream]: ${line}`);
    }
    onInfo(event) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const data = event.detail;
        if (data.type == "connectionComplete") {
            const text = I.stream.connectionComplete;
            this.text.innerText = text;
            this.debugLog(text);
            this.eventTarget.dispatchEvent(new Event("ml-connected"));
        }
        else if (data.type == "addDebugLine") {
            const message = data.line.trim();
            if (message) {
                this.debugLog(message);
                if (!this.textTy) {
                    this.text.innerText = message;
                    this.textTy = (_b = (_a = data.additional) === null || _a === void 0 ? void 0 : _a.type) !== null && _b !== void 0 ? _b : null;
                }
                else if (((_c = data.additional) === null || _c === void 0 ? void 0 : _c.type) == "fatalDescription" || ((_d = data.additional) === null || _d === void 0 ? void 0 : _d.type) == "ifErrorDescription") {
                    if (this.text.innerText) {
                        this.text.innerText += "\n" + message;
                    }
                    else {
                        this.text.innerText = message;
                    }
                    this.textTy = data.additional.type;
                }
            }
            if (((_e = data.additional) === null || _e === void 0 ? void 0 : _e.type) == "fatal" || ((_f = data.additional) === null || _f === void 0 ? void 0 : _f.type) == "fatalDescription") {
                showModal(this);
            }
            else if (((_g = data.additional) === null || _g === void 0 ? void 0 : _g.type) == "recover") {
                showModal(null);
            }
            else if (((_h = data.additional) === null || _h === void 0 ? void 0 : _h.type) == "informError") {
                showErrorPopup(data.line);
            }
        }
        else if (data.type == "serverMessage") {
            const text = I.stream.serverMessage(data.message);
            this.text.innerText = text;
            this.debugLog(text);
        }
    }
    onClose() {
        showModal(null);
    }
    onFinish(abort) {
        return new Promise((resolve, reject) => {
            this.eventTarget.addEventListener("ml-connected", () => resolve(), { once: true, signal: abort });
        });
    }
    mount(parent) {
        parent.appendChild(this.root);
    }
    unmount(parent) {
        parent.removeChild(this.root);
    }
}
class AutoFullscreenModal {
    constructor(onConfirm) {
        this.message = document.createElement("p");
        this.root = document.createElement("div");
        this.okButton = document.createElement("button");
        this.cancelButton = document.createElement("button");
        this.onConfirm = onConfirm;
        this.message.innerText = I.stream.autoFullscreenPrompt;
        this.okButton.innerText = I.modal.ok;
        this.cancelButton.innerText = I.modal.cancel;
    }
    mount(parent) {
        this.root.appendChild(this.message);
        this.root.appendChild(this.okButton);
        this.root.appendChild(this.cancelButton);
        parent.appendChild(this.root);
    }
    unmount(parent) {
        parent.removeChild(this.root);
    }
    onFinish(abort) {
        return new Promise((resolve) => {
            this.okButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
                yield this.onConfirm();
                resolve();
            }), { once: true, signal: abort });
            this.cancelButton.addEventListener("click", () => {
                resolve();
            }, { once: true, signal: abort });
        });
    }
}
class ViewerSidebar {
    constructor(app) {
        this.div = document.createElement("div");
        this.buttonDiv = document.createElement("div");
        this.sendKeycodeButton = document.createElement("button");
        this.keyboardButton = document.createElement("button");
        this.screenKeyboard = new VirtualKeyboard();
        this.customKeysOverlay = new CustomKeysOverlay();
        this.editCustomKeysButton = document.createElement("button");
        this.addCustomKeyButton = document.createElement("button");
        this.addCustomMouseButton = document.createElement("button");
        this.lockMouseButton = document.createElement("button");
        this.fullscreenButton = document.createElement("button");
        this.statsButton = document.createElement("button");
        this.exitStreamButton = document.createElement("button");
        this.app = app;
        // Configure divs
        this.div.classList.add("sidebar-stream");
        this.buttonDiv.classList.add("sidebar-stream-buttons");
        this.div.appendChild(this.buttonDiv);
        // Send keycode
        this.sendKeycodeButton.innerText = I.stream.sendKeycode;
        this.sendKeycodeButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const key = yield showModal(new SendKeycodeModal());
            if (key == null) {
                return;
            }
            (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendKey(true, key, 0);
            (_b = this.app.getStream()) === null || _b === void 0 ? void 0 : _b.getInput().sendKey(false, key, 0);
        }));
        this.buttonDiv.appendChild(this.sendKeycodeButton);
        // Pointer Lock
        this.lockMouseButton.innerText = I.stream.lockMouse;
        this.lockMouseButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            yield this.app.requestPointerLock(true);
        }));
        this.buttonDiv.appendChild(this.lockMouseButton);
        // Pop up keyboard
        this.keyboardButton.innerText = I.stream.keyboard;
        this.keyboardButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            setSidebarExtended(false);
            this.screenKeyboard.show();
        }));
        this.buttonDiv.appendChild(this.keyboardButton);
        this.screenKeyboard.addKeyDownListener(this.onKeyDown.bind(this));
        this.screenKeyboard.addKeyUpListener(this.onKeyUp.bind(this));
        this.screenKeyboard.addTextListener(this.onText.bind(this));
        // Custom buttons overlay
        this.customKeysOverlay.addKeyDownListener(this.onKeyDown.bind(this));
        this.customKeysOverlay.addKeyUpListener(this.onKeyUp.bind(this));
        this.customKeysOverlay.addMouseButtonListener((isDown, button) => {
            var _a;
            (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendMouseButton(isDown, button);
        });
        // Edit Custom Keys
        this.editCustomKeysButton.innerText = "Edit Layout";
        this.editCustomKeysButton.addEventListener("click", () => {
            this.customKeysOverlay.toggleEditMode();
            if (this.customKeysOverlay.isEditing()) {
                this.editCustomKeysButton.innerText = "Save Layout";
                this.addCustomKeyButton.style.display = "block";
                this.addCustomMouseButton.style.display = "block";
            }
            else {
                this.editCustomKeysButton.innerText = "Edit Layout";
                this.addCustomKeyButton.style.display = "none";
                this.addCustomMouseButton.style.display = "none";
            }
        });
        this.buttonDiv.appendChild(this.editCustomKeysButton);
        // Add Custom Key
        this.addCustomKeyButton.innerText = "Add Key";
        this.addCustomKeyButton.style.display = "none";
        this.addCustomKeyButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            const key = yield showModal(new KeyCaptureModal(this.screenKeyboard));
            if (key == null)
                return;
            // Re-resolve StreamKeys from value to name
            for (const keyNameRaw in StreamKeys) {
                const keyName = keyNameRaw;
                const keyValue = StreamKeys[keyName];
                if (keyValue === key) {
                    const PREFIX = "VK_";
                    let name = keyName;
                    if (name.startsWith(PREFIX)) {
                        name = name.slice(PREFIX.length);
                    }
                    this.customKeysOverlay.addCustomKey(name);
                    break;
                }
            }
        }));
        this.buttonDiv.appendChild(this.addCustomKeyButton);
        // Add Mouse Button
        this.addCustomMouseButton.innerText = "Add Mouse Btn";
        this.addCustomMouseButton.style.display = "none";
        this.addCustomMouseButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            const result = yield showModal(new MouseButtonModal());
            if (result == null)
                return;
            this.customKeysOverlay.addCustomMouseButton(result.label, result.value);
        }));
        this.buttonDiv.appendChild(this.addCustomMouseButton);
        // Fullscreen
        this.fullscreenButton.innerText = I.stream.fullscreen;
        this.fullscreenButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            if (this.app.isFullscreen()) {
                yield this.app.exitFullscreen();
            }
            else {
                yield this.app.requestFullscreen();
            }
        }));
        this.buttonDiv.appendChild(this.fullscreenButton);
        // Stats
        this.statsButton.innerText = I.stream.stats;
        this.statsButton.addEventListener("click", () => {
            var _a;
            const stats = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats) {
                stats.toggle();
            }
        });
        this.buttonDiv.appendChild(this.statsButton);
        // Smart Zero-TURN Download Saver Button
        this.downloadSaverButton = document.createElement("button");
        this.downloadSaverButton.innerText = "📥 Treo Tải Game (0 GB)";
        this.downloadSaverButton.title = "Ngắt tạm luồng video để tốn 0 MB băng thông trong khi Colab vẫn tải game ngầm";
        this.downloadSaverButton.style.borderColor = "#10b981";
        this.downloadSaverButton.addEventListener("click", () => {
            setSidebarExtended(false);
            if (typeof window["colabggEnterPause"] === "function") {
                window["colabggEnterPause"]("Đang bật Chế độ Treo Tải Game thủ công");
            }
        });
        this.buttonDiv.appendChild(this.downloadSaverButton);
        // Close stream
        this.exitStreamButton.innerText = I.stream.exit;
        this.exitStreamButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            const stream = this.app.getStream();
            if (stream) {
                const success = yield stream.stop();
                if (!success) {
                    console.debug("Failed to close stream correctly");
                }
            }
            if (window.matchMedia('(display-mode: standalone)').matches) {
                history.back();
            }
            else {
                window.close();
            }
        }));
        this.buttonDiv.appendChild(this.exitStreamButton);
        // Select Mouse Mode
        this.mouseMode = new SelectComponent("mouseMode", [
            { value: "relative", name: I.stream.relative },
            { value: "follow", name: I.stream.follow },
            { value: "localCursor", name: I.stream.localCursor },
            { value: "pointAndDrag", name: I.stream.pointAndDrag }
        ], {
            displayName: I.stream.mouseMode,
            preSelectedOption: this.app.getInputConfig().mouseMode
        });
        this.mouseMode.addChangeListener(this.onMouseModeChange.bind(this));
        this.mouseMode.mount(this.div);
        // Select Touch Mode
        this.touchMode = new SelectComponent("touchMode", [
            { value: "touch", name: I.stream.touch },
            { value: "mouseRelative", name: I.stream.relative },
            { value: "localCursor", name: I.stream.localCursor },
            { value: "pointAndDrag", name: I.stream.pointAndDrag }
        ], {
            displayName: I.stream.touchMode,
            preSelectedOption: this.app.getInputConfig().touchMode
        });
        this.touchMode.addChangeListener(this.onTouchModeChange.bind(this));
        this.touchMode.mount(this.div);
    }
    onCapabilitiesChange(capabilities) {
        this.touchMode.setOptionEnabled("touch", capabilities.touch);
    }
    getScreenKeyboard() {
        return this.screenKeyboard;
    }
    // -- Keyboard
    onText(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendText(event.detail.text);
    }
    onKeyDown(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().onKeyDown(event);
    }
    onKeyUp(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().onKeyUp(event);
    }
    // -- Mouse Mode
    onMouseModeChange() {
        const config = this.app.getInputConfig();
        config.mouseMode = this.mouseMode.getValue();
        this.app.setInputConfig(config);
    }
    // -- Touch Mode
    onTouchModeChange() {
        const config = this.app.getInputConfig();
        config.touchMode = this.touchMode.getValue();
        this.app.setInputConfig(config);
    }
    extended() {
    }
    unextend() {
    }
    mount(parent) {
        parent.appendChild(this.div);
        document.body.appendChild(this.screenKeyboard.getHiddenElement());
        document.body.appendChild(this.customKeysOverlay.getContainer());
    }
    unmount(parent) {
        parent.removeChild(this.div);
        const kbEl = this.screenKeyboard.getHiddenElement();
        if (kbEl.parentNode) kbEl.parentNode.removeChild(kbEl);
        const ckEl = this.customKeysOverlay.getContainer();
        if (ckEl.parentNode) ckEl.parentNode.removeChild(ckEl);
    }
}
class KeyCaptureModal {
    constructor(screenKeyboard) {
        this.screenKeyboard = screenKeyboard !== null && screenKeyboard !== void 0 ? screenKeyboard : null;
        this.capturedVkValue = null;
        this.vkKeyDownHandler = null;
        this.root = document.createElement("div");
        this.instruction = document.createElement("p");
        this.keyDisplay = document.createElement("div");
        this.confirmBtn = document.createElement("button");
        this.cancelBtn = document.createElement("button");
        this.root.className = "key-capture-modal";
        this.instruction.className = "key-capture-instruction";
        this.instruction.innerText = "Press any key on your keyboard";
        this.keyDisplay.className = "key-capture-display";
        this.keyDisplay.innerText = "—";
        this.confirmBtn.type = "button";
        this.confirmBtn.innerText = "OK";
        this.confirmBtn.disabled = true;
        this.cancelBtn.type = "button";
        this.cancelBtn.innerText = "Cancel";
        const btnRow = document.createElement("div");
        btnRow.className = "key-capture-buttons";
        if (this.screenKeyboard) {
            this.kbToggleBtn = document.createElement("button");
            this.kbToggleBtn.type = "button";
            this.kbToggleBtn.innerText = "⌨ Show Keyboard";
            this.kbToggleBtn.className = "key-capture-kb-toggle";
            this.kbToggleBtn.addEventListener("click", () => {
                var _a, _b;
                if ((_a = this.screenKeyboard) === null || _a === void 0 ? void 0 : _a.isVisible()) {
                    (_b = this.screenKeyboard) === null || _b === void 0 ? void 0 : _b.hide();
                    this.kbToggleBtn.innerText = "⌨ Show Keyboard";
                }
                else {
                    this.screenKeyboard.show();
                    this.kbToggleBtn.innerText = "⌨ Hide Keyboard";
                }
            });
            btnRow.appendChild(this.kbToggleBtn);
        }
        btnRow.appendChild(this.confirmBtn);
        btnRow.appendChild(this.cancelBtn);
        this.root.appendChild(this.instruction);
        this.root.appendChild(this.keyDisplay);
        this.root.appendChild(btnRow);
    }
    captureKey(e) {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key))
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const vkValue = convertToKey(e);
        if (vkValue != null) {
            this.capturedVkValue = vkValue;
            let displayName = e.code || e.key;
            for (const rawName in StreamKeys) {
                if (StreamKeys[rawName] === vkValue) {
                    displayName = rawName.startsWith("VK_") ? rawName.slice(3) : rawName;
                    break;
                }
            }
            this.keyDisplay.innerText = displayName;
            this.keyDisplay.classList.add("key-capture-active");
            this.confirmBtn.disabled = false;
        }
    }
    mount(parent) {
        parent.appendChild(this.root);
    }
    unmount(parent) {
        var _a, _b;
        parent.removeChild(this.root);
        (_a = this.screenKeyboard) === null || _a === void 0 ? void 0 : _a.hide();
        if (this.vkKeyDownHandler) {
            (_b = this.screenKeyboard) === null || _b === void 0 ? void 0 : _b.removeKeyDownListener(this.vkKeyDownHandler);
            this.vkKeyDownHandler = null;
        }
    }
    onFinish(signal) {
        return new Promise((resolve) => {
            const abort = new AbortController();
            signal.addEventListener("abort", () => { abort.abort(); resolve(null); });
            const onPhysicalKeyDown = this.captureKey.bind(this);
            document.addEventListener("keydown", onPhysicalKeyDown, { capture: true, signal: abort.signal });
            if (this.screenKeyboard) {
                this.vkKeyDownHandler = this.captureKey.bind(this);
                this.screenKeyboard.addKeyDownListener(this.vkKeyDownHandler);
            }
            this.confirmBtn.addEventListener("click", () => {
                abort.abort();
                resolve(this.capturedVkValue);
            }, { signal: abort.signal });
            this.cancelBtn.addEventListener("click", () => {
                abort.abort();
                resolve(null);
            }, { signal: abort.signal });
        });
    }
}
const MOUSE_BUTTON_OPTIONS = [
    { label: 'LMB', value: 1 },
    { label: 'RMB', value: 3 },
    { label: 'MMB', value: 2 },
    { label: 'X1 (Back)', value: 4 },
    { label: 'X2 (Fwd)', value: 5 },
];
class MouseButtonModal extends FormModal {
    constructor() {
        super();
        this.select = document.createElement("select");
        this.select.className = "mouse-btn-select";
        for (const opt of MOUSE_BUTTON_OPTIONS) {
            const option = document.createElement("option");
            option.value = String(opt.value);
            option.textContent = opt.label;
            this.select.appendChild(option);
        }
        const label = document.createElement("label");
        label.textContent = "Mouse Button:";
        label.className = "mouse-btn-label";
        label.appendChild(this.select);
        this._label = label;
    }
    mountForm(form) {
        form.appendChild(this._label);
    }
    reset() {
        this.select.selectedIndex = 0;
    }
    submit() {
        const value = parseInt(this.select.value);
        const opt = MOUSE_BUTTON_OPTIONS.find(o => o.value === value);
        return opt ? { label: opt.label, value: opt.value } : null;
    }
}
class SendKeycodeModal extends FormModal {
    constructor() {
        super();
        const keyList = [];
        for (const keyNameRaw in StreamKeys) {
            const keyName = keyNameRaw;
            const keyValue = StreamKeys[keyName];
            const PREFIX = "VK_";
            let name = keyName;
            if (name.startsWith(PREFIX)) {
                name = name.slice(PREFIX.length);
            }
            keyList.push({
                value: keyValue.toString(),
                name
            });
        }
        // datalist dropdowns (hasSearch: true) often fail or have terrible UX on mobile virtual keyboards
        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        this.dropdownSearch = new SelectComponent("winKeycode", keyList, {
            hasSearch: !isTouch,
            displayName: I.stream.selectKeycode
        });
    }
    mountForm(form) {
        this.dropdownSearch.mount(form);
    }
    reset() {
        this.dropdownSearch.reset();
    }
    submit() {
        const keyString = this.dropdownSearch.getValue();
        if (keyString == null) {
            return null;
        }
        return parseInt(keyString);
    }
}
// Stop propagation so the stream doesn't get it
function stopPropagationOn(element) {
    element.addEventListener("keydown", onStopPropagation);
    element.addEventListener("keyup", onStopPropagation);
    element.addEventListener("keypress", onStopPropagation);
    element.addEventListener("click", onStopPropagation);
    element.addEventListener("mousedown", onStopPropagation);
    element.addEventListener("mouseup", onStopPropagation);
    element.addEventListener("mousemove", onStopPropagation);
    element.addEventListener("wheel", onStopPropagation);
    element.addEventListener("contextmenu", onStopPropagation);
    element.addEventListener("touchstart", onStopPropagation);
    element.addEventListener("touchmove", onStopPropagation);
    element.addEventListener("touchend", onStopPropagation);
    element.addEventListener("touchcancel", onStopPropagation);
}
function onStopPropagation(event) {
    event.stopPropagation();
}
function initSmartTurnOverlay(app) {
    const pill = document.createElement("div");
    pill.style.cssText = "position:fixed;top:12px;right:14px;z-index:9998;padding:6px 12px;border-radius:999px;font:600 12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:rgba(15,23,42,0.88);border:1px solid #334155;color:#f8fafc;pointer-events:none;transition:opacity 0.4s ease;box-shadow:0 6px 18px rgba(0,0,0,0.45);";
    pill.textContent = "🧠 Smart Zero-TURN: Đang dò P2P (0 GB)...";
    document.body.appendChild(pill);
    let fadeTimer = null;
    const showPill = (text, borderColor, autoHideMs = 6500) => {
        pill.textContent = text;
        pill.style.borderColor = borderColor;
        pill.style.opacity = "1";
        if (fadeTimer) {
            window.clearTimeout(fadeTimer);
            fadeTimer = null;
        }
        if (autoHideMs > 0) {
            fadeTimer = window.setTimeout(() => {
                pill.style.opacity = "0";
            }, autoHideMs);
        }
    };
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,0.94);padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f8fafc;";
    overlay.innerHTML = `
      <div style="max-width:480px;width:100%;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:24px;text-align:center;box-shadow:0 20px 45px rgba(0,0,0,0.65);">
        <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#34d399;font-size:12px;font-weight:700;margin-bottom:12px;">🛡️ Băng thông Stream hiện tại: 0.00 MB/s</div>
        <h2 style="margin:0 0 8px;font-size:19px;color:#f8fafc;">Đang ở Chế độ Treo Tải Game (0 GB TURN)</h2>
        <p id="cgg-pause-reason" style="margin:0 0 10px;font-size:13px;color:#38bdf8;font-weight:600;"></p>
        <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;line-height:1.55;">Luồng hình ảnh về trình duyệt đã tạm ngắt để không tốn 1 KB nào của Cloudflare TURN. <b>Steam, Chrome &amp; Desktop trên Google Colab vẫn đang chạy và tải game tối đa tốc độ ở phía sau!</b></p>
        <button id="cgg-btn-resume" type="button" style="width:100%;padding:13px 16px;border-radius:10px;border:1px solid #34d399;background:linear-gradient(135deg,#059669,#10b981);color:#022c22;font-size:14.5px;font-weight:800;cursor:pointer;">▶️ Mở lại màn hình Stream ngay</button>
      </div>
    `;
    stopPropagationOn(overlay);
    document.body.appendChild(overlay);
    const reasonEl = overlay.querySelector("#cgg-pause-reason");
    const resumeBtn = overlay.querySelector("#cgg-btn-resume");
    const enterPause = (reasonText) => {
        const stream = app.getStream();
        if (!stream || stream.isPausedForDownload()) {
            return;
        }
        if (document.pointerLockElement) {
            try {
                document.exitPointerLock();
            }
            catch (_e) { }
        }
        if (reasonEl) {
            reasonEl.textContent = reasonText || "Đã tạm dừng nhận hình ảnh";
        }
        overlay.style.display = "flex";
        void stream.pauseForDownload();
    };
    window["colabggEnterPause"] = enterPause;
    if (resumeBtn) {
        resumeBtn.addEventListener("click", () => {
            overlay.style.display = "none";
            const stream = app.getStream();
            if (stream) {
                void stream.resumeFromPause();
            }
        });
    }
    window.addEventListener("colabgg-route", (ev) => {
        const d = ev.detail || {};
        if (d.route === "p2p") {
            showPill("🟢 P2P Trực tiếp — Tốn 0 GB Cloudflare TURN!", "#10b981", 6500);
        }
        else if (d.route === "turn") {
            showPill("🟡 Đang truyền qua Cloudflare TURN UDP", "#f59e0b", 7500);
        }
        else if (d.route === "websocket") {
            showPill("🔵 Đang truyền qua WebSocket (0 GB TURN)", "#38bdf8", 6500);
        }
        else if (d.route === "connecting") {
            showPill("🧠 " + (d.detail || "Đang kết nối..."), "#38bdf8", 0);
        }
    });
    let idleTimer = null;
    const clearIdleTimer = () => {
        if (idleTimer) {
            window.clearTimeout(idleTimer);
            idleTimer = null;
        }
    };
    document.addEventListener("visibilitychange", () => {
        clearIdleTimer();
        if (document.visibilityState === "visible") {
            return;
        }
        let idleMode = "turn_3m";
        try {
            idleMode = localStorage.getItem("colabgg_idle_saver") || "turn_3m";
        }
        catch (_e) { }
        if (idleMode === "off") {
            return;
        }
        const stream = app.getStream();
        if (!stream || stream.isPausedForDownload()) {
            return;
        }
        const route = stream.getActiveRoute();
        if (idleMode === "turn_3m" && route !== "turn") {
            // Direct P2P and WebSocket cost 0 GB of Cloudflare TURN quota!
            return;
        }
        const waitMs = idleMode === "all_1m" ? 60000 : 180000;
        idleTimer = window.setTimeout(() => {
            if (document.visibilityState !== "visible") {
                enterPause(idleMode === "all_1m"
                    ? "Đã tự động ngắt hình sau 1 phút ẩn tab (Chế độ Treo Tải Game)"
                    : "Đã tự động ngắt hình sau 3 phút ẩn tab để bảo vệ 1.000 GB TURN");
            }
        }, waitMs);
    });
}

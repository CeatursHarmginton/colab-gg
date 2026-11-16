const CHAR_TO_CODE = {
    'a': 'KeyA', 'b': 'KeyB', 'c': 'KeyC', 'd': 'KeyD', 'e': 'KeyE', 'f': 'KeyF', 'g': 'KeyG', 'h': 'KeyH', 'i': 'KeyI', 'j': 'KeyJ', 'k': 'KeyK', 'l': 'KeyL', 'm': 'KeyM', 'n': 'KeyN', 'o': 'KeyO', 'p': 'KeyP', 'q': 'KeyQ', 'r': 'KeyR', 's': 'KeyS', 't': 'KeyT', 'u': 'KeyU', 'v': 'KeyV', 'w': 'KeyW', 'x': 'KeyX', 'y': 'KeyY', 'z': 'KeyZ',
    'A': 'KeyA', 'B': 'KeyB', 'C': 'KeyC', 'D': 'KeyD', 'E': 'KeyE', 'F': 'KeyF', 'G': 'KeyG', 'H': 'KeyH', 'I': 'KeyI', 'J': 'KeyJ', 'K': 'KeyK', 'L': 'KeyL', 'M': 'KeyM', 'N': 'KeyN', 'O': 'KeyO', 'P': 'KeyP', 'Q': 'KeyQ', 'R': 'KeyR', 'S': 'KeyS', 'T': 'KeyT', 'U': 'KeyU', 'V': 'KeyV', 'W': 'KeyW', 'X': 'KeyX', 'Y': 'KeyY', 'Z': 'KeyZ',
    '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4', '5': 'Digit5', '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9', '0': 'Digit0',
    ' ': 'Space', '.': 'Period', ',': 'Comma', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '/': 'Slash',
    '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0',
    '_': 'Minus', '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash', ':': 'Semicolon', '"': 'Quote', '~': 'Backquote', '<': 'Comma', '>': 'Period', '?': 'Slash'
};
const SPECIAL_CODE_MAP = {
    'ESC': 'Escape', 'BKSP': 'Backspace', 'TAB': 'Tab', 'ENTER': 'Enter', 'SPACE': 'Space',
    'CTRL': 'ControlLeft', 'ALT': 'AltLeft', 'WIN': 'MetaLeft', 'SHIFT': 'ShiftLeft', 'SHIFT_L': 'ShiftLeft',
    'UP': 'ArrowUp', 'DOWN': 'ArrowDown', 'LEFT': 'ArrowLeft', 'RIGHT': 'ArrowRight',
    'INS': 'Insert', 'DEL': 'Delete', 'HOME': 'Home', 'END': 'End', 'PGUP': 'PageUp', 'PGDN': 'PageDown'
};
const VK_NAME_TO_DOM_CODE = {
    'KEY_A': 'KeyA', 'KEY_B': 'KeyB', 'KEY_C': 'KeyC', 'KEY_D': 'KeyD', 'KEY_E': 'KeyE',
    'KEY_F': 'KeyF', 'KEY_G': 'KeyG', 'KEY_H': 'KeyH', 'KEY_I': 'KeyI', 'KEY_J': 'KeyJ',
    'KEY_K': 'KeyK', 'KEY_L': 'KeyL', 'KEY_M': 'KeyM', 'KEY_N': 'KeyN', 'KEY_O': 'KeyO',
    'KEY_P': 'KeyP', 'KEY_Q': 'KeyQ', 'KEY_R': 'KeyR', 'KEY_S': 'KeyS', 'KEY_T': 'KeyT',
    'KEY_U': 'KeyU', 'KEY_V': 'KeyV', 'KEY_W': 'KeyW', 'KEY_X': 'KeyX', 'KEY_Y': 'KeyY',
    'KEY_Z': 'KeyZ',
    'KEY_0': 'Digit0', 'KEY_1': 'Digit1', 'KEY_2': 'Digit2', 'KEY_3': 'Digit3', 'KEY_4': 'Digit4',
    'KEY_5': 'Digit5', 'KEY_6': 'Digit6', 'KEY_7': 'Digit7', 'KEY_8': 'Digit8', 'KEY_9': 'Digit9',
    'BACK': 'Backspace', 'TAB': 'Tab', 'RETURN': 'Enter', 'ESCAPE': 'Escape', 'SPACE': 'Space',
    'DELETE': 'Delete', 'INSERT': 'Insert', 'HOME': 'Home', 'END': 'End',
    'PRIOR': 'PageUp', 'NEXT': 'PageDown',
    'LEFT': 'ArrowLeft', 'RIGHT': 'ArrowRight', 'UP': 'ArrowUp', 'DOWN': 'ArrowDown',
    'SHIFT': 'ShiftLeft', 'LSHIFT': 'ShiftLeft', 'RSHIFT': 'ShiftRight',
    'CONTROL': 'ControlLeft', 'LCONTROL': 'ControlLeft', 'RCONTROL': 'ControlRight',
    'MENU': 'AltLeft', 'LMENU': 'AltLeft', 'RMENU': 'AltRight',
    'LWIN': 'MetaLeft', 'RWIN': 'MetaRight',
    'CAPITAL': 'CapsLock', 'NUMLOCK': 'NumLock', 'SCROLL': 'ScrollLock', 'PAUSE': 'Pause',
    'NUMPAD0': 'Numpad0', 'NUMPAD1': 'Numpad1', 'NUMPAD2': 'Numpad2', 'NUMPAD3': 'Numpad3',
    'NUMPAD4': 'Numpad4', 'NUMPAD5': 'Numpad5', 'NUMPAD6': 'Numpad6', 'NUMPAD7': 'Numpad7',
    'NUMPAD8': 'Numpad8', 'NUMPAD9': 'Numpad9',
    'MULTIPLY': 'NumpadMultiply', 'ADD': 'NumpadAdd', 'SUBTRACT': 'NumpadSubtract',
    'DECIMAL': 'NumpadDecimal', 'DIVIDE': 'NumpadDivide',
    'OEM_MINUS': 'Minus', 'OEM_PLUS': 'Equal',
    'OEM_1': 'Semicolon', 'OEM_2': 'Slash', 'OEM_3': 'Backquote',
    'OEM_4': 'BracketLeft', 'OEM_5': 'Backslash', 'OEM_6': 'BracketRight', 'OEM_7': 'Quote',
    'OEM_COMMA': 'Comma', 'OEM_PERIOD': 'Period',
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'F13': 'F13', 'F14': 'F14', 'F15': 'F15', 'F16': 'F16', 'F17': 'F17', 'F18': 'F18',
    'F19': 'F19', 'F20': 'F20', 'F21': 'F21', 'F22': 'F22', 'F23': 'F23', 'F24': 'F24',
    'SNAPSHOT': 'PrintScreen', 'APPS': 'ContextMenu',
};
export class CustomKeysOverlay {
    constructor() {
        this.eventTarget = new EventTarget();
        this.container = document.createElement("div");
        this.customKeys = [];
        this.isEditMode = false;
        this.activeDraggedKeyId = null;
        this.isResizing = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.initialKeyX = 0;
        this.initialKeyY = 0;
        this.initialKeySize = 0;
        this.container.className = "custom-keys-container";
        this.container.id = "customKeyContainer";
        this.loadLayout();
        this.render();
        document.addEventListener('touchmove', this.onGlobalTouchMove.bind(this), { passive: false });
        // Mouse fallback
        document.addEventListener('mousemove', this.onGlobalMouseMove.bind(this));
        document.addEventListener('mouseup', this.onGlobalMouseUp.bind(this));
    }
    getContainer() {
        return this.container;
    }
    addKeyDownListener(listener) {
        this.eventTarget.addEventListener("keydown", listener);
    }
    addKeyUpListener(listener) {
        this.eventTarget.addEventListener("keyup", listener);
    }
    addMouseButtonListener(listener) {
        this.eventTarget.addEventListener("ml-mousebutton", (e) => {
            listener(e.detail.isDown, e.detail.button);
        });
    }
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        if (!this.isEditMode) {
            this.saveLayout();
            this.activeDraggedKeyId = null;
        }
        this.render();
    }
    isEditing() {
        return this.isEditMode;
    }
    addCustomKey(keyName) {
        const id = Date.now();
        this.customKeys.push({
            id: id,
            type: 'key',
            key: keyName,
            x: 45,
            y: 45,
            size: 60
        });
        this.render();
        this.saveLayout();
    }
    addCustomMouseButton(label, buttonValue) {
        this.customKeys.push({
            id: Date.now(),
            type: 'mouse',
            key: label,
            mouseButton: buttonValue,
            x: 45,
            y: 55,
            size: 60
        });
        this.render();
        this.saveLayout();
    }
    removeCustomKey(id) {
        this.customKeys = this.customKeys.filter(k => k.id !== id);
        this.render();
        this.saveLayout();
    }
    saveLayout() {
        try {
            localStorage.setItem('webrtc_custom_keys', JSON.stringify(this.customKeys));
        }
        catch (e) {
            console.error('Failed to save custom keys layout', e);
        }
    }
    loadLayout() {
        try {
            const data = localStorage.getItem('webrtc_custom_keys');
            if (data) {
                this.customKeys = JSON.parse(data);
                // Migrate legacy px values to percentages just in case
                this.customKeys.forEach(k => {
                    if (k.x > 100)
                        k.x = (k.x / window.innerWidth) * 100;
                    if (k.y > 100)
                        k.y = (k.y / window.innerHeight) * 100;
                });
            }
        }
        catch (e) {
            console.error('Failed to load custom keys layout', e);
            this.customKeys = [];
        }
    }
    render() {
        // Delta update: Remove elements that are no longer in customKeys
        const existingIds = this.customKeys.map(k => 'floating-key-' + k.id);
        Array.from(this.container.children).forEach(child => {
            if (existingIds.indexOf(child.id) === -1)
                this.container.removeChild(child);
        });
        this.customKeys.forEach(k => {
            let div = document.getElementById('floating-key-' + k.id);
            if (!div) {
                div = document.createElement('div');
                div.id = 'floating-key-' + k.id;
                const label = document.createElement('span');
                label.className = 'key-label';
                div.appendChild(label);
                const del = document.createElement('div');
                del.className = 'delete-btn';
                del.innerHTML = '&times;';
                del.ontouchstart = (e) => { e.preventDefault(); e.stopPropagation(); this.removeCustomKey(k.id); };
                del.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.removeCustomKey(k.id); };
                div.appendChild(del);
                const res = document.createElement('div');
                res.className = 'resize-handle';
                res.innerHTML = '&#10529;'; // ⤡ double-headed diagonal arrow
                div.appendChild(res);
                div.ontouchstart = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.isEditMode) {
                        const touch = e.touches[0];
                        const target = e.target;
                        if (target.classList.contains('delete-btn'))
                            return;
                        this.activeDraggedKeyId = k.id;
                        this.dragStartX = touch.clientX;
                        this.dragStartY = touch.clientY;
                        this.initialKeyX = k.x;
                        this.initialKeyY = k.y;
                        this.initialKeySize = k.size;
                        this.isResizing = target.classList.contains('resize-handle');
                    }
                    else {
                        this.handleKeyDown(k, div);
                    }
                };
                div.ontouchmove = (e) => {
                    if (this.isEditMode)
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                };
                div.ontouchend = div.ontouchcancel = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.isEditMode) {
                        this.activeDraggedKeyId = null;
                        this.saveLayout();
                    }
                    else {
                        this.handleKeyUp(k, div);
                    }
                };
                // Mouse fallback
                div.onmousedown = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.isEditMode) {
                        const target = e.target;
                        if (target.classList.contains('delete-btn'))
                            return;
                        this.activeDraggedKeyId = k.id;
                        this.dragStartX = e.clientX;
                        this.dragStartY = e.clientY;
                        this.initialKeyX = k.x;
                        this.initialKeyY = k.y;
                        this.initialKeySize = k.size;
                        this.isResizing = target.classList.contains('resize-handle');
                    }
                    else {
                        this.handleKeyDown(k, div);
                    }
                };
                div.onmouseup = (e) => {
                    if (this.isEditMode) {
                        this.activeDraggedKeyId = null;
                        this.saveLayout();
                    }
                    else {
                        this.handleKeyUp(k, div);
                    }
                };
                this.container.appendChild(div);
            }
            // Update properties
            div.className = 'floating-key' + (k.type === 'mouse' ? ' mouse-btn' : '') + (this.isEditMode ? ' editing' : '');
            div.style.left = k.x + '%';
            div.style.top = k.y + '%';
            div.style.width = k.size + 'px';
            div.style.height = k.size + 'px';
            div.style.fontSize = Math.floor(k.size * 0.3) + 'px';
            const label = div.querySelector('.key-label');
            if (label) {
                label.textContent = k.key;
            }
            const dbtn = div.querySelector('.delete-btn');
            const rbtn = div.querySelector('.resize-handle');
            if (dbtn)
                dbtn.style.display = this.isEditMode ? 'flex' : 'none';
            if (rbtn)
                rbtn.style.display = this.isEditMode ? 'flex' : 'none';
        });
    }
    processDrag(clientX, clientY) {
        if (this.isEditMode && this.activeDraggedKeyId !== null) {
            const dx = clientX - this.dragStartX;
            const dy = clientY - this.dragStartY;
            const key = this.customKeys.find(k => k.id === this.activeDraggedKeyId);
            const div = document.getElementById('floating-key-' + this.activeDraggedKeyId);
            if (key && div) {
                if (this.isResizing) {
                    const newSize = Math.max(40, this.initialKeySize + dx);
                    key.size = newSize;
                    div.style.width = newSize + 'px';
                    div.style.height = newSize + 'px';
                    div.style.fontSize = Math.floor(newSize * 0.3) + 'px';
                }
                else {
                    const dxRel = (dx / window.innerWidth) * 100;
                    const dyRel = (dy / window.innerHeight) * 100;
                    const newX = this.initialKeyX + dxRel;
                    const newY = this.initialKeyY + dyRel;
                    key.x = newX;
                    key.y = newY;
                    div.style.left = newX + '%';
                    div.style.top = newY + '%';
                }
            }
        }
    }
    onGlobalTouchMove(e) {
        if (this.isEditMode && this.activeDraggedKeyId !== null) {
            e.preventDefault();
            this.processDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    }
    onGlobalMouseMove(e) {
        if (this.isEditMode && this.activeDraggedKeyId !== null) {
            this.processDrag(e.clientX, e.clientY);
        }
    }
    onGlobalMouseUp(e) {
        if (this.isEditMode && this.activeDraggedKeyId !== null) {
            this.activeDraggedKeyId = null;
            this.saveLayout();
        }
    }
    dispatchKeyEvents(isDown, key) {
        let code = SPECIAL_CODE_MAP[key] || VK_NAME_TO_DOM_CODE[key] || (key.length === 1 ? CHAR_TO_CODE[key] : null);
        if (code) {
            const eventObj = {
                code: code,
                key: key.length === 1 ? key : code,
                shiftKey: false,
                ctrlKey: false,
                altKey: false,
                metaKey: false,
                preventDefault: () => { },
                stopPropagation: () => { }
            };
            const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', eventObj);
            Object.defineProperty(event, 'code', { value: eventObj.code });
            Object.defineProperty(event, 'key', { value: eventObj.key });
            Object.defineProperty(event, 'shiftKey', { value: eventObj.shiftKey });
            Object.defineProperty(event, 'ctrlKey', { value: eventObj.ctrlKey });
            Object.defineProperty(event, 'altKey', { value: eventObj.altKey });
            Object.defineProperty(event, 'metaKey', { value: eventObj.metaKey });
            this.eventTarget.dispatchEvent(event);
        }
    }
    handleKeyDown(k, btn) {
        if (btn)
            btn.classList.add('active');
        if (k.type === 'mouse') {
            this.eventTarget.dispatchEvent(new CustomEvent('ml-mousebutton', { detail: { isDown: true, button: k.mouseButton } }));
        }
        else {
            this.dispatchKeyEvents(true, k.key);
        }
    }
    handleKeyUp(k, btn) {
        if (btn)
            btn.classList.remove('active');
        if (k.type === 'mouse') {
            this.eventTarget.dispatchEvent(new CustomEvent('ml-mousebutton', { detail: { isDown: false, button: k.mouseButton } }));
        }
        else {
            this.dispatchKeyEvents(false, k.key);
        }
    }
}

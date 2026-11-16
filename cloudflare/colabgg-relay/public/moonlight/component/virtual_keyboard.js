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
const KEY_LAYOUTS = {
    lower: [
        ['ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BKSP'],
        ['TAB', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'SYM'],
        ['CTRL', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ENTER'],
        ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'SHIFT_L'],
        ['ALT', 'WIN', 'SPACE', 'HIDE', 'LEFT', 'UP', 'DOWN', 'RIGHT']
    ],
    upper: [
        ['ESC', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 'BKSP'],
        ['TAB', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'SYM'],
        ['CTRL', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'ENTER'],
        ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?', 'SHIFT_L'],
        ['ALT', 'WIN', 'SPACE', 'HIDE', 'LEFT', 'UP', 'DOWN', 'RIGHT']
    ],
    sym: [
        ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
        ['[', ']', '{', '}', '\\', '|', ';', ':', '\'', '"', 'SYM'],
        ['CTRL', '`', '~', 'INS', 'DEL', 'HOME', 'END', 'PGUP', 'PGDN', 'ENTER'],
        ['ABC', '-', '_', '=', '+', 'SPACE', 'ENTER', 'HIDE', 'LEFT', 'UP', 'DOWN', 'RIGHT']
    ]
};
export class VirtualKeyboard {
    constructor() {
        this.eventTarget = new EventTarget();
        this.container = document.createElement("div");
        this.fakeElement = document.createElement("input");
        this.visible = false;
        this.currentLayout = 'lower';
        this.isShifted = false;
        this.isCapsLock = false;
        this.isCtrlDown = false;
        this.isAltDown = false;
        this.isMetaDown = false;
        this.container.className = "virtual-keyboard";
        this.container.id = "virtualKeyboard";
        // Keeping fakeElement to satisfy the old API
        this.fakeElement.style.display = "none";
        this.renderKeyboard();
    }
    getHiddenElement() {
        return this.container; // Return the real container instead of the hidden input
    }
    show() {
        if (!this.visible) {
            this.visible = true;
            this.container.style.display = 'flex';
            // Trigger reflow
            void this.container.offsetWidth;
            this.container.classList.add('visible');
        }
    }
    hide() {
        if (this.visible) {
            this.visible = false;
            if (this.isShifted || this.isCapsLock) {
                this.isShifted = false;
                this.isCapsLock = false;
                this.dispatchKeyEvents(false, 'SHIFT');
                this.currentLayout = 'lower';
                this.renderKeyboard();
            }
            this.container.classList.remove('visible');
            setTimeout(() => {
                if (!this.visible) {
                    this.container.style.display = 'none';
                }
            }, 300);
        }
    }
    isVisible() {
        return this.visible;
    }
    addKeyDownListener(listener) {
        this.eventTarget.addEventListener("keydown", listener);
    }
    removeKeyDownListener(listener) {
        this.eventTarget.removeEventListener("keydown", listener);
    }
    addKeyUpListener(listener) {
        this.eventTarget.addEventListener("keyup", listener);
    }
    addTextListener(listener) {
        this.eventTarget.addEventListener("ml-text", listener);
    }
    renderKeyboard() {
        const layout = KEY_LAYOUTS[this.currentLayout];
        this.container.innerHTML = '';
        layout.forEach((rowKeys, rowIndex) => {
            const row = document.createElement('div');
            row.id = `row${rowIndex + 1}`;
            row.className = 'kbd-row';
            rowKeys.forEach(key => {
                const btn = document.createElement('div');
                btn.className = 'kbd-key';
                let label = key;
                if (key === 'SHIFT_L')
                    label = 'SHIFT';
                if (key === 'SHIFT') {
                    if (this.isCapsLock)
                        btn.classList.add('active-caps');
                    else if (this.isShifted)
                        btn.classList.add('active');
                }
                else if (key === 'CTRL' && this.isCtrlDown) {
                    btn.classList.add('active');
                }
                else if (key === 'ALT' && this.isAltDown) {
                    btn.classList.add('active');
                }
                else if (key === 'WIN' && this.isMetaDown) {
                    btn.classList.add('active');
                }
                btn.textContent = label;
                btn.oncontextmenu = (e) => e.preventDefault();
                btn.ontouchstart = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleKeyDown(key, btn);
                };
                btn.ontouchmove = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                };
                btn.ontouchend = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleKeyUp(key, btn);
                };
                btn.ontouchcancel = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleKeyUp(key, btn);
                };
                // Mouse fallback for testing on desktop
                btn.onmousedown = (e) => {
                    e.preventDefault();
                    this.handleKeyDown(key, btn);
                };
                btn.onmouseup = (e) => {
                    e.preventDefault();
                    this.handleKeyUp(key, btn);
                };
                btn.onmouseleave = (e) => {
                    if (btn.classList.contains('active') && ['SHIFT', 'CTRL', 'ALT', 'WIN'].indexOf(key) === -1) {
                        this.handleKeyUp(key, btn);
                    }
                };
                if (['CTRL', 'ALT', 'WIN', 'ENTER', 'BKSP', 'TAB', 'SYM', 'ABC'].indexOf(key) !== -1)
                    btn.classList.add('wide');
                if (key === 'SHIFT')
                    btn.classList.add('shift-extra-wide');
                if (key === 'SPACE')
                    btn.classList.add('extra-wide');
                btn.setAttribute('data-key', key);
                row.appendChild(btn);
            });
            this.container.appendChild(row);
        });
    }
    dispatchKeyEvents(isDown, key) {
        let code = SPECIAL_CODE_MAP[key] || (key.length === 1 ? CHAR_TO_CODE[key] : (key.startsWith('F') ? key : null));
        if (code) {
            const eventObj = {
                code: code,
                key: key.length === 1 ? key : code,
                shiftKey: this.isShifted || this.isCapsLock,
                ctrlKey: this.isCtrlDown,
                altKey: this.isAltDown,
                metaKey: this.isMetaDown,
                preventDefault: () => { },
                stopPropagation: () => { }
            };
            const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', eventObj);
            // Hack to override read-only properties of KeyboardEvent
            Object.defineProperty(event, 'code', { value: eventObj.code });
            Object.defineProperty(event, 'key', { value: eventObj.key });
            Object.defineProperty(event, 'shiftKey', { value: eventObj.shiftKey });
            Object.defineProperty(event, 'ctrlKey', { value: eventObj.ctrlKey });
            Object.defineProperty(event, 'altKey', { value: eventObj.altKey });
            Object.defineProperty(event, 'metaKey', { value: eventObj.metaKey });
            this.eventTarget.dispatchEvent(event);
        }
    }
    handleKeyDown(key, btn) {
        if (btn)
            btn.classList.add('active');
        if (key === 'SHIFT' || key === 'SHIFT_L') {
            const wasShiftDown = this.isShifted || this.isCapsLock;
            if (!this.isShifted && !this.isCapsLock) {
                this.isShifted = true;
                this.isCapsLock = false;
            }
            else if (this.isShifted && !this.isCapsLock) {
                this.isShifted = false;
                this.isCapsLock = true;
            }
            else {
                this.isShifted = false;
                this.isCapsLock = false;
            }
            const isShiftDown = this.isShifted || this.isCapsLock;
            if (!wasShiftDown && isShiftDown) {
                this.dispatchKeyEvents(true, 'SHIFT');
            }
            else if (wasShiftDown && !isShiftDown) {
                this.dispatchKeyEvents(false, 'SHIFT');
            }
            this.currentLayout = isShiftDown ? 'upper' : 'lower';
            this.renderKeyboard();
            return;
        }
        else if (key === 'SYM') {
            if (this.isShifted || this.isCapsLock) {
                this.isShifted = false;
                this.isCapsLock = false;
                this.dispatchKeyEvents(false, 'SHIFT');
            }
            this.currentLayout = 'sym';
            this.renderKeyboard();
            return;
        }
        else if (key === 'ABC') {
            const wasShiftDown = this.isShifted || this.isCapsLock;
            if (wasShiftDown) {
                this.isShifted = false;
                this.isCapsLock = false;
                this.dispatchKeyEvents(false, 'SHIFT');
            }
            this.currentLayout = 'lower';
            this.renderKeyboard();
            return;
        }
        else if (key === 'HIDE') {
            this.hide();
            return;
        }
        if (key === 'CTRL') {
            this.isCtrlDown = !this.isCtrlDown;
            this.renderKeyboard();
            this.dispatchKeyEvents(this.isCtrlDown, key);
            return;
        }
        if (key === 'ALT') {
            this.isAltDown = !this.isAltDown;
            this.renderKeyboard();
            this.dispatchKeyEvents(this.isAltDown, key);
            return;
        }
        if (key === 'WIN') {
            this.isMetaDown = !this.isMetaDown;
            this.renderKeyboard();
            this.dispatchKeyEvents(this.isMetaDown, key);
            return;
        }
        this.dispatchKeyEvents(true, key);
    }
    handleKeyUp(key, btn) {
        if (['CTRL', 'ALT', 'WIN'].indexOf(key) === -1) {
            btn.classList.remove('active');
        }
        if (['SHIFT', 'SHIFT_L', 'SYM', 'ABC', 'HIDE', 'CTRL', 'ALT', 'WIN'].indexOf(key) !== -1)
            return;
        this.dispatchKeyEvents(false, key);
        // Auto-reset shift if we just typed a character
        if (this.isShifted && !this.isCapsLock && key.length === 1) {
            this.isShifted = false;
            this.currentLayout = 'lower';
            this.renderKeyboard();
            this.dispatchKeyEvents(false, 'SHIFT');
        }
    }
}

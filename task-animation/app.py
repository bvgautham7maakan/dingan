"""Claude Code task-animation companion.

A frameless always-on-top pywebview window, a tray icon, a global hotkey and a
127.0.0.1-only HTTP server that receives events from hook.py.

Threads:
  main      pywebview GUI loop (required by pywebview)
  http      ThreadingHTTPServer -> Controller.handle()
  ui        UiDispatcher: the only thread that touches the window/JS, so the
            controller lock is never held while waiting on the GUI thread
  tray      pystray (run_detached)
  hotkey    Win32 RegisterHotKey message loop
"""
import argparse
import json
import logging
import logging.handlers
import os
import queue
import socket
import socketserver
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hook import RUNNING_FILE, STATE_DIR, is_hidden  # noqa: E402

STATE_FILE = os.path.join(STATE_DIR, "state.json")
UI_FILE = os.path.join(HERE, "ui.html")
MAX_BODY = 256 * 1024
MIN_W, MIN_H = 420, 180

DEFAULTS = {
    "port": 47821,
    "hotkey": "ctrl+alt+m",
    "always_on_top": True,
    "window": {"width": 900, "height": 320},
    "typing_ms_per_char": 45,
    "backlog_chars": 1500,
    "stop_flush_max_ms": 3000,
    "rain_step_ms": 90,
    "token_step_ms": 180,
    "hex_update_ms": 350,
    "colors": {"background": "#050805", "green": "#00ff41", "cyan": "#22d3ee",
               "pink": "#ff7ad9", "amber": "#ffcf5c"},
    "max_payload_chars": 4000,
    "hidden_patterns": [".env*", "*.key", "*.pem", "*secret*", "*credential*", "id_rsa*"],
}

log = logging.getLogger("task-animation")


def load_config(path=os.path.join(HERE, "config.json")):
    cfg = json.loads(json.dumps(DEFAULTS))
    try:
        with open(path, encoding="utf-8-sig") as f:
            user = json.load(f)
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    except FileNotFoundError:
        pass
    except Exception:
        log.exception("bad config.json, using defaults")
    return cfg


def load_state():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp, STATE_FILE)
    except Exception:
        log.exception("save_state failed")


def clip(value, n):
    return str(value if value is not None else "")[:n]


# --------------------------------------------------------------------------- #
# Controller: pure logic, no GUI imports (unit-tested on any OS)
# --------------------------------------------------------------------------- #
class Controller:
    """Decides when to show/hide and what to send to the UI.

    `ui` needs: show(), hide(), call(fn_name, payload), on_visibility(bool).
    """

    def __init__(self, ui, cfg):
        self.ui = ui
        self.cfg = cfg
        self.lock = threading.RLock()
        self.session = ""
        self.active = False         # a task is running (prompt seen, no Stop yet)
        self.visible = False
        self.user_hidden = False    # user hid the window during this task
        self.stop_gen = 0           # bumps on every Stop / prompt; stale timers no-op
        self.stop_pending = False
        self.paused = False
        self.quitting = False

    # ---- events from hooks -------------------------------------------------
    def handle(self, evt):
        if not isinstance(evt, dict):
            return
        kind = evt.get("type")
        session = clip(evt.get("session"), 64)
        with self.lock:
            if kind == "prompt":
                self._start(session)
            elif kind in ("pre", "post"):
                if session:
                    self.session = session      # most recently active session wins
                if not self.active:             # e.g. app launched mid-task
                    self._start(self.session)
                self.ui.call("onTool", self._tool_payload(evt))
            elif kind == "stop":
                if session and self.session and session != self.session:
                    return                      # another session finished; keep showing this one
                if not self.active:
                    return
                self.active = False
                self.stop_pending = True
                self.stop_gen += 1
                gen = self.stop_gen
                max_ms = int(self.cfg.get("stop_flush_max_ms", 3000))
                self.ui.call("onStop", {"maxMs": max_ms, "gen": gen})
                t = threading.Timer(max_ms / 1000.0 + 0.6, self.flushed, args=(gen,))
                t.daemon = True
                t.start()

    def _start(self, session):
        self.session = session or self.session
        self.active = True
        self.stop_pending = False
        self.stop_gen += 1
        self.user_hidden = False
        self.ui.call("onPrompt", {"session": self.session})
        self._show()

    def _tool_payload(self, evt):
        max_chars = int(self.cfg.get("max_payload_chars", 4000))
        out = {"tool": clip(evt.get("tool"), 40), "target": clip(evt.get("target"), 80)}
        if "code" in evt:
            file = clip(evt.get("file"), 120)
            hidden = is_hidden(file, self.cfg.get("hidden_patterns"))
            out["file"] = file
            out["code"] = "[hidden]" if hidden else clip(evt.get("code"), max_chars)
        return out

    # ---- callbacks from the UI --------------------------------------------
    def flushed(self, gen=None):
        """Typewriter finished (or flush timeout) after Stop -> hide to tray."""
        with self.lock:
            if not self.stop_pending or self.active:
                return
            if gen is not None and gen != self.stop_gen:
                return
            self.stop_pending = False
            self._hide()

    def hide_by_user(self):
        with self.lock:
            self.user_hidden = True
            self._hide()

    def show_by_user(self):
        with self.lock:
            self.user_hidden = False
            self._show()

    def toggle(self):
        with self.lock:
            if self.visible:
                self.hide_by_user()
            else:
                self.show_by_user()

    def set_paused(self, paused):
        with self.lock:
            self.paused = bool(paused)
            self.ui.call("setPaused", self.paused)

    # ---- internals ---------------------------------------------------------
    def _show(self):
        if self.user_hidden or self.quitting:
            return
        if not self.visible:
            self.visible = True
            self.ui.show()
            self.ui.call("setVisible", True)
            self.ui.on_visibility(True)

    def _hide(self):
        if self.visible:
            self.visible = False
            self.ui.call("setVisible", False)
            self.ui.hide()
            self.ui.on_visibility(False)


# --------------------------------------------------------------------------- #
# HTTP server (127.0.0.1 only)
# --------------------------------------------------------------------------- #
class Server(ThreadingHTTPServer):
    allow_reuse_address = False     # SO_REUSEADDR on Windows would allow a 2nd instance
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        socketserver.TCPServer.server_bind(self)   # skip HTTPServer's slow getfqdn()
        self.server_name, self.server_port = self.server_address[:2]


def make_handler(controller, on_quit):
    class Handler(BaseHTTPRequestHandler):
        server_version = "task-animation"

        def log_message(self, *a):
            pass

        def _reply(self, code, body=b""):
            self.send_response(code)
            self.send_header("Content-Length", str(len(body)))
            if body:
                self.send_header("Content-Type", "application/json")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._reply(200, json.dumps({"ok": True, "pid": os.getpid()}).encode())
            else:
                self._reply(404)

        def do_POST(self):
            # A custom header cannot be sent cross-origin without a CORS preflight,
            # which this server never answers -> web pages can't drive the app.
            if self.headers.get("X-Task-Animation") != "1":
                return self._reply(403)
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self._reply(400)
            if length < 0 or length > MAX_BODY:
                return self._reply(413)
            raw = self.rfile.read(length) if length else b""
            if self.path == "/event":
                try:
                    evt = json.loads(raw.decode("utf-8"))
                except Exception:
                    return self._reply(400)
                self._reply(204)
                try:
                    controller.handle(evt)
                except Exception:
                    log.exception("handle failed")
            elif self.path == "/quit":
                self._reply(204)
                threading.Thread(target=on_quit, daemon=True).start()
            else:
                self._reply(404)

    return Handler


def start_server(port, controller, on_quit):
    server = Server(("127.0.0.1", port), make_handler(controller, on_quit))
    threading.Thread(target=server.serve_forever, name="http", daemon=True).start()
    return server


# --------------------------------------------------------------------------- #
# GUI glue (Windows / pywebview / pystray)
# --------------------------------------------------------------------------- #
class UiDispatcher:
    """Serialises every window/JS operation onto one worker thread."""

    def __init__(self):
        self.window = None
        self.q = queue.Queue()
        self.ready = threading.Event()
        self.visibility_listeners = []
        threading.Thread(target=self._run, name="ui", daemon=True).start()

    def _run(self):
        self.ready.wait()
        while True:
            op = self.q.get()
            if op is None:
                return
            try:
                op()
            except Exception:
                log.exception("ui op failed")

    def show(self):
        self.q.put(lambda: (self.window.show(), self.window.restore() if hasattr(self.window, "restore") else None))

    def hide(self):
        self.q.put(lambda: self.window.hide())

    def call(self, fn, payload=None):
        js = "window.TA && TA.%s(%s)" % (fn, json.dumps(payload, ensure_ascii=True))
        self.q.put(lambda: self.window.evaluate_js(js))

    def on_visibility(self, visible):
        for cb in self.visibility_listeners:
            try:
                cb(visible)
            except Exception:
                log.exception("visibility listener failed")

    def stop(self):
        self.q.put(None)


class JsApi:
    """Exposed to ui.html as window.pywebview.api (underscore attrs stay private)."""

    def __init__(self, app):
        self._app = app

    def hide_user(self):
        self._app.controller.hide_by_user()

    def flushed(self, gen=None):
        self._app.controller.flushed(gen)

    def resize_start(self):
        w = self._app.window
        self._app.resize_origin = (w.width, w.height)

    def resize_delta(self, dx, dy):
        w0, h0 = self._app.resize_origin or (self._app.window.width, self._app.window.height)
        self._app.window.resize(max(MIN_W, int(w0 + dx)), max(MIN_H, int(h0 + dy)))


def parse_hotkey(spec):
    mods, vk = 0, 0
    for part in str(spec).lower().replace(" ", "").split("+"):
        if part in ("ctrl", "control"):
            mods |= 0x2
        elif part == "alt":
            mods |= 0x1
        elif part == "shift":
            mods |= 0x4
        elif part in ("win", "super"):
            mods |= 0x8
        elif len(part) == 1 and part.isalnum():
            vk = ord(part.upper())
        elif part.startswith("f") and part[1:].isdigit() and 1 <= int(part[1:]) <= 24:
            vk = 0x6F + int(part[1:])
    return mods, vk


class Hotkey:
    """Global hotkey via Win32 RegisterHotKey (no admin rights, no extra package)."""

    def __init__(self, spec, callback):
        self.spec, self.callback, self.tid = spec, callback, None
        threading.Thread(target=self._run, name="hotkey", daemon=True).start()

    def _run(self):
        import ctypes
        from ctypes import wintypes
        user32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
        mods, vk = parse_hotkey(self.spec)
        if not vk or not user32.RegisterHotKey(None, 1, mods | 0x4000, vk):  # MOD_NOREPEAT
            log.warning("could not register hotkey %r (in use by another app?)", self.spec)
            return
        self.tid = k32.GetCurrentThreadId()
        msg = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            if msg.message == 0x0312:  # WM_HOTKEY
                try:
                    self.callback()
                except Exception:
                    log.exception("hotkey callback failed")
        user32.UnregisterHotKey(None, 1)

    def stop(self):
        if self.tid:
            import ctypes
            ctypes.windll.user32.PostThreadMessageW(self.tid, 0x0012, 0, 0)  # WM_QUIT


def on_screen(x, y):
    if x is None or y is None:
        return False
    if os.name != "nt":
        return True
    try:
        import ctypes
        m = ctypes.windll.user32.GetSystemMetrics
        vx, vy, vw, vh = m(76), m(77), m(78), m(79)
        return vx - 50 <= x < vx + vw - 80 and vy - 10 <= y < vy + vh - 40
    except Exception:
        return True


def make_tray_image(color):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((2, 2, 62, 62), radius=12, fill=(5, 8, 5, 255), outline=color, width=3)
    d.rectangle((16, 18, 22, 46), fill=color)
    d.rectangle((28, 18, 34, 34), fill=color)
    d.rectangle((40, 26, 46, 46), fill=color)
    return img


class App:
    def __init__(self, cfg, args):
        self.cfg, self.args = cfg, args
        self.ui = UiDispatcher()
        self.controller = Controller(self.ui, cfg)
        self.state = load_state()
        self.window = None
        self.icon = None
        self.hotkey = None
        self.server = None
        self.resize_origin = None
        self._save_timer = None
        self._quit_lock = threading.Lock()

    # ---- lifecycle ---------------------------------------------------------
    def run(self):
        try:
            self.server = start_server(int(self.cfg["port"]), self.controller, self.quit)
        except OSError:
            log.info("port %s busy: another instance is running", self.cfg["port"])
            return
        self._write_running()

        import webview

        geo = self.state.get("geometry") or {}
        win = self.cfg.get("window") or {}
        w = max(MIN_W, int(geo.get("width") or win.get("width") or 900))
        h = max(MIN_H, int(geo.get("height") or win.get("height") or 320))
        x, y = geo.get("x"), geo.get("y")
        if not on_screen(x, y):
            x = y = None
        with open(UI_FILE, encoding="utf-8") as f:
            html = f.read()

        self.window = webview.create_window(
            "claude code", html=html, js_api=JsApi(self),
            width=w, height=h, x=x, y=y, min_size=(MIN_W, MIN_H),
            resizable=True, frameless=True, easy_drag=False,
            on_top=bool(self.cfg.get("always_on_top", True)),
            background_color=self.cfg["colors"].get("background", "#050805"),
            hidden=True,
        )
        self.ui.window = self.window
        ev = self.window.events
        ev.loaded += self._on_loaded
        ev.closing += self._on_closing
        ev.moved += self._on_moved
        ev.resized += self._on_resized
        if hasattr(ev, "minimized"):
            ev.minimized += lambda *a: self.controller.hide_by_user()

        self._start_tray()
        if os.name == "nt":
            self.hotkey = Hotkey(self.cfg.get("hotkey", "ctrl+alt+m"), self.controller.toggle)
        self.ui.visibility_listeners.append(lambda v: self.icon and self.icon.update_menu())

        webview.start(debug=False)
        self.quit()

    def _on_loaded(self, *a):
        ui_cfg = {k: self.cfg[k] for k in (
            "typing_ms_per_char", "backlog_chars", "stop_flush_max_ms",
            "rain_step_ms", "token_step_ms", "hex_update_ms", "colors")}
        self.window.evaluate_js("window.TA && TA.init(%s)" % json.dumps(ui_cfg, ensure_ascii=True))
        self.ui.ready.set()
        if self.args.show:
            self.controller.handle({"type": "prompt", "session": self.args.session or ""})

    def _on_closing(self, *a):
        if self.controller.quitting:
            return True
        self.controller.hide_by_user()   # (x) / Alt+F4 only hide to tray
        return False

    def _on_moved(self, *a):
        if len(a) >= 2:
            self.state.setdefault("geometry", {}).update(x=int(a[-2]), y=int(a[-1]))
            self._save_soon()

    def _on_resized(self, *a):
        if len(a) >= 2:
            self.state.setdefault("geometry", {}).update(width=int(a[-2]), height=int(a[-1]))
            self._save_soon()

    def _save_soon(self):
        if self._save_timer:
            self._save_timer.cancel()
        self._save_timer = threading.Timer(0.8, save_state, args=(self.state,))
        self._save_timer.daemon = True
        self._save_timer.start()

    def _start_tray(self):
        try:
            import pystray
        except Exception:
            log.exception("pystray unavailable; running without tray icon")
            return
        c = self.controller
        menu = pystray.Menu(
            pystray.MenuItem(lambda i: "Hide" if c.visible else "Show",
                             lambda i, it: c.toggle(), default=True),
            pystray.MenuItem("Pause animation", lambda i, it: c.set_paused(not c.paused),
                             checked=lambda it: c.paused),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", lambda i, it: threading.Thread(target=self.quit, daemon=True).start()),
        )
        img = make_tray_image(self.cfg["colors"].get("green", "#00ff41"))
        self.icon = pystray.Icon("task-animation", img, "Claude Code task animation", menu)
        self.icon.run_detached()

    def _write_running(self):
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(RUNNING_FILE, "w", encoding="utf-8") as f:
            json.dump({"pid": os.getpid(), "port": int(self.cfg["port"])}, f)

    def quit(self):
        if not self._quit_lock.acquire(blocking=False):
            return
        self.controller.quitting = True
        log.info("quitting")
        save_state(self.state)
        for step in (
            lambda: self.hotkey and self.hotkey.stop(),
            lambda: self.icon and self.icon.stop(),
            lambda: self.ui.stop(),
            lambda: os.remove(RUNNING_FILE),
            lambda: self.server and self.server.shutdown(),
            lambda: self.window and self.window.destroy(),
        ):
            try:
                step()
            except Exception:
                pass
        os._exit(0)


def setup_logging():
    os.makedirs(STATE_DIR, exist_ok=True)
    h = logging.handlers.RotatingFileHandler(os.path.join(STATE_DIR, "app.log"),
                                             maxBytes=256 * 1024, backupCount=1, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(threadName)s: %(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--show", action="store_true", help="show the window immediately")
    p.add_argument("--session", default="")
    args = p.parse_args()
    setup_logging()
    try:
        App(load_config(), args).run()
    except Exception:
        log.exception("fatal")
    os._exit(0)


if __name__ == "__main__":
    main()

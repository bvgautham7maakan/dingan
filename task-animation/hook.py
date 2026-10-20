"""Claude Code hook -> task-animation app.

Reads the hook JSON from stdin, trims it to what the UI needs and POSTs it to
the local app. It must never block or fail a Claude Code action: every path
is wrapped, network I/O is capped at ~250 ms, and the process always exits 0.
"""
import fnmatch
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_DIR = os.path.join(HERE, "state")
RUNNING_FILE = os.path.join(STATE_DIR, "running.json")

DEFAULT_PORT = 47821
DEFAULT_MAX = 4000
DEFAULT_HIDDEN = [".env*", "*.key", "*.pem", "*secret*", "*credential*", "id_rsa*"]
HTTP_TIMEOUT = 0.25

EVENT_KINDS = {
    "UserPromptSubmit": "prompt",
    "PreToolUse": "pre",
    "PostToolUse": "post",
    "Stop": "stop",
}
CODE_TOOLS = ("Write", "Edit", "MultiEdit", "NotebookEdit")


def load_config():
    cfg = {}
    try:
        with open(os.path.join(HERE, "config.json"), encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except Exception:
        pass
    return cfg


def is_hidden(path, patterns=None):
    """True if a file path matches a sensitive-file pattern."""
    if not path:
        return False
    patterns = patterns or DEFAULT_HIDDEN
    norm = str(path).replace("\\", "/").lower()
    name = norm.rsplit("/", 1)[-1]
    for pat in patterns:
        pat = str(pat).lower()
        if fnmatch.fnmatchcase(name, pat):
            return True
        # "*secret*"-style patterns also apply to directories (e.g. secrets/x.yml)
        if pat.startswith("*") and pat.endswith("*") and fnmatch.fnmatchcase(norm, pat):
            return True
    return False


def display_path(path, cwd=None):
    if not path:
        return ""
    p = str(path).replace("\\", "/")
    if cwd:
        c = str(cwd).replace("\\", "/").rstrip("/") + "/"
        if p.lower().startswith(c.lower()):
            return p[len(c):]
    parts = [x for x in p.split("/") if x]
    return "/".join(parts[-2:])


def extract_code(tool, ti):
    if tool == "Write":
        return str(ti.get("content") or "")
    if tool == "Edit":
        return str(ti.get("new_string") or "")
    if tool == "MultiEdit":
        edits = ti.get("edits") or []
        return "\n".join(str(e.get("new_string") or "") for e in edits if isinstance(e, dict))
    if tool == "NotebookEdit":
        return str(ti.get("new_source") or "")
    return ""


def describe(tool, ti, shown_path):
    """Short, low-risk status text. Bash shows its description or program name only."""
    if tool == "Bash":
        desc = ti.get("description")
        if desc:
            return str(desc)
        cmd = str(ti.get("command") or "").strip()
        return cmd.split()[0] if cmd else ""
    if tool in ("Grep", "Glob"):
        return str(ti.get("pattern") or "")
    if tool in ("Task", "Agent"):
        return str(ti.get("description") or "")
    if tool == "WebFetch":
        url = str(ti.get("url") or "")
        return url.split("//", 1)[-1].split("/", 1)[0]
    if tool == "WebSearch":
        return str(ti.get("query") or "")
    return shown_path


def trim(data, cfg, argv_event=""):
    """Turn raw hook JSON into the small event the app understands (or None)."""
    name = data.get("hook_event_name") or argv_event
    kind = EVENT_KINDS.get(name)
    if not kind:
        return None
    max_chars = int(cfg.get("max_payload_chars") or DEFAULT_MAX)
    patterns = cfg.get("hidden_patterns") or DEFAULT_HIDDEN
    out = {"type": kind, "session": str(data.get("session_id") or "")[:64], "ts": time.time()}
    if kind in ("pre", "post"):
        tool = str(data.get("tool_name") or "")[:40]
        ti = data.get("tool_input")
        if not isinstance(ti, dict):
            ti = {}
        path = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
        shown = display_path(path, data.get("cwd"))
        out["tool"] = tool
        out["target"] = describe(tool, ti, shown)[:80]
        if kind == "pre" and tool in CODE_TOOLS:
            code = "[hidden]" if is_hidden(path, patterns) else extract_code(tool, ti)
            out["code"] = code[:max_chars]
            out["file"] = shown[:120]
    return out


def pid_alive(pid):
    try:
        pid = int(pid)
        if pid <= 0:
            return False
        if os.name == "nt":
            import ctypes
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return False
            code = ctypes.c_ulong()
            ok = k32.GetExitCodeProcess(h, ctypes.byref(code))
            k32.CloseHandle(h)
            return bool(ok) and code.value == 259  # STILL_ACTIVE
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except Exception:
        return False


def app_running():
    """Cheap check before touching the network.

    On Windows a connect() to a closed localhost port can take ~1-2 s, so the
    app's PID file decides whether a connection is even attempted.
    """
    try:
        with open(RUNNING_FILE, encoding="utf-8") as f:
            info = json.load(f)
        return pid_alive(info.get("pid"))
    except Exception:
        return False


def post(port, event):
    import http.client
    body = json.dumps(event, ensure_ascii=True).encode("ascii")
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=HTTP_TIMEOUT)
    try:
        conn.request("POST", "/event", body, {
            "Content-Type": "application/json",
            "X-Task-Animation": "1",
        })
        return 200 <= conn.getresponse().status < 300
    finally:
        conn.close()


def launch_app(session):
    if os.environ.get("TASK_ANIMATION_NO_LAUNCH"):
        return
    import subprocess
    app = os.path.join(HERE, "app.py")
    args = ["--show", "--session", session or ""]
    common = dict(stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                  stderr=subprocess.DEVNULL, close_fds=True, cwd=HERE)
    if os.name == "nt":
        exe = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
        if not os.path.exists(exe):
            exe = sys.executable
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        subprocess.Popen([exe, app] + args, creationflags=0x08 | 0x200 | 0x08000000, **common)
    else:
        subprocess.Popen([sys.executable, app] + args, start_new_session=True, **common)


def run():
    raw = sys.stdin.buffer.read() if sys.stdin else b""
    data = json.loads(raw.decode("utf-8", "replace") or "{}")
    if not isinstance(data, dict):
        return
    cfg = load_config()
    event = trim(data, cfg, sys.argv[1] if len(sys.argv) > 1 else "")
    if not event:
        return
    port = int(os.environ.get("TASK_ANIMATION_PORT") or cfg.get("port") or DEFAULT_PORT)
    sent = False
    if app_running():
        try:
            sent = post(port, event)
        except Exception:
            sent = False
    if not sent and event["type"] == "prompt":
        launch_app(event["session"])


def main():
    try:
        run()
    except BaseException:
        pass
    try:
        sys.stdout.flush()
    except Exception:
        pass
    os._exit(0)


if __name__ == "__main__":
    main()

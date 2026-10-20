"""Acceptance tests that run on any OS (no GUI). Run: python -m unittest discover tests -v"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import app  # noqa: E402
import hook  # noqa: E402
import settings_merge  # noqa: E402


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class FakeUI:
    def __init__(self):
        self.calls, self.shown, self.hidden = [], 0, 0

    def show(self):
        self.shown += 1

    def hide(self):
        self.hidden += 1

    def call(self, fn, payload=None):
        self.calls.append((fn, payload))

    def on_visibility(self, v):
        pass

    def names(self):
        return [c[0] for c in self.calls]


class HookSandbox:
    """Copy hook.py + config.json into a temp dir so state/running.json is isolated."""

    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="ta-hook-")
        for f in ("hook.py", "config.json"):
            shutil.copy(os.path.join(ROOT, f), self.dir)
        os.makedirs(os.path.join(self.dir, "state"))
        self.running = os.path.join(self.dir, "state", "running.json")

    def run(self, payload, env=None):
        e = dict(os.environ, TASK_ANIMATION_NO_LAUNCH="1", **(env or {}))
        t0 = time.perf_counter()
        p = subprocess.run([sys.executable, os.path.join(self.dir, "hook.py")],
                           input=json.dumps(payload).encode(), capture_output=True, env=e, timeout=10)
        return p.returncode, (time.perf_counter() - t0) * 1000

    def cleanup(self):
        shutil.rmtree(self.dir, ignore_errors=True)


PRE_WRITE = {"hook_event_name": "PreToolUse", "session_id": "s1", "cwd": "/proj",
             "tool_name": "Write", "tool_input": {"file_path": "/proj/src/app.py", "content": "print('hi')\n"}}


class TestHookTiming(unittest.TestCase):
    def setUp(self):
        self.sb = HookSandbox()

    def tearDown(self):
        self.sb.cleanup()

    def test_app_closed_under_300ms(self):
        events = [
            {"hook_event_name": "UserPromptSubmit", "session_id": "s1", "prompt": "x"},
            PRE_WRITE,
            dict(PRE_WRITE, hook_event_name="PostToolUse"),
            {"hook_event_name": "Stop", "session_id": "s1"},
        ]
        for ev in events:
            code, ms = self.sb.run(ev)
            print("  hook %-16s app closed: exit=%d %.0f ms" % (ev["hook_event_name"], code, ms))
            self.assertEqual(code, 0)
            self.assertLess(ms, 300)

    def test_stale_pid_file_under_300ms(self):
        with open(self.sb.running, "w") as f:
            json.dump({"pid": 999999, "port": 1}, f)
        code, ms = self.sb.run(PRE_WRITE)
        print("  hook stale running.json: exit=%d %.0f ms" % (code, ms))
        self.assertEqual(code, 0)
        self.assertLess(ms, 300)

    def test_live_pid_but_port_closed_under_300ms(self):
        with open(self.sb.running, "w") as f:
            json.dump({"pid": os.getpid(), "port": 1}, f)
        code, ms = self.sb.run(PRE_WRITE, env={"TASK_ANIMATION_PORT": str(free_port())})
        print("  hook live pid, nothing listening: exit=%d %.0f ms" % (code, ms))
        self.assertEqual(code, 0)
        self.assertLess(ms, 300)

    def test_garbage_stdin_exits_zero(self):
        for raw in (b"", b"not json", b"[1,2]", b"\xff\xfe"):
            p = subprocess.run([sys.executable, os.path.join(self.sb.dir, "hook.py")], input=raw,
                               capture_output=True, timeout=10,
                               env=dict(os.environ, TASK_ANIMATION_NO_LAUNCH="1"))
            self.assertEqual(p.returncode, 0)


class TestTrimAndHidden(unittest.TestCase):
    def test_write_edit_multiedit_notebook(self):
        cfg = {}
        e = hook.trim(PRE_WRITE, cfg)
        self.assertEqual((e["type"], e["tool"], e["file"], e["code"]), ("pre", "Write", "src/app.py", "print('hi')\n"))
        self.assertEqual(e["target"], "src/app.py")
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "Edit",
                       "tool_input": {"file_path": "a.py", "old_string": "x", "new_string": "y = 1"}}, cfg)
        self.assertEqual(e["code"], "y = 1")
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "MultiEdit",
                       "tool_input": {"file_path": "a.py", "edits": [{"new_string": "a"}, {"new_string": "b"}]}}, cfg)
        self.assertEqual(e["code"], "a\nb")
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "NotebookEdit",
                       "tool_input": {"notebook_path": "n.ipynb", "new_source": "x=2"}}, cfg)
        self.assertEqual(e["code"], "x=2")

    def test_post_and_read_carry_no_code(self):
        self.assertNotIn("code", hook.trim(dict(PRE_WRITE, hook_event_name="PostToolUse"), {}))
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "Read", "tool_input": {"file_path": "/x/y/z.py"}}, {})
        self.assertNotIn("code", e)
        self.assertEqual(e["target"], "y/z.py")

    def test_bash_never_shows_full_command(self):
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "Bash",
                       "tool_input": {"command": "curl -H 'Authorization: Bearer abc' x"}}, {})
        self.assertEqual(e["target"], "curl")

    def test_prompt_text_not_forwarded(self):
        e = hook.trim({"hook_event_name": "UserPromptSubmit", "session_id": "s", "prompt": "my secret plan"}, {})
        self.assertNotIn("my secret plan", json.dumps(e))

    def test_hidden_files(self):
        hidden = [".env", ".env.local", "C:\\proj\\.ENV.production", "server.key", "cert.pem", "my_secret.txt",
                  "aws_credentials", "id_rsa", "id_rsa.pub", "/home/u/secrets/config.yml"]
        shown = ["app.py", "environment.py", "keys.py", "README.md"]
        for p in hidden:
            self.assertTrue(hook.is_hidden(p), p)
        for p in shown:
            self.assertFalse(hook.is_hidden(p), p)
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "Write",
                       "tool_input": {"file_path": "/p/.env", "content": "API_KEY=sk-123"}}, {})
        self.assertEqual(e["code"], "[hidden]")

    def test_truncate_4000(self):
        e = hook.trim({"hook_event_name": "PreToolUse", "tool_name": "Write",
                       "tool_input": {"file_path": "big.txt", "content": "x" * 10000}}, {})
        self.assertEqual(len(e["code"]), 4000)


class TestController(unittest.TestCase):
    def setUp(self):
        self.ui = FakeUI()
        self.c = app.Controller(self.ui, dict(app.DEFAULTS, stop_flush_max_ms=100))

    def test_prompt_shows_write_types_stop_hides(self):
        c, ui = self.c, self.ui
        c.handle({"type": "prompt", "session": "s1"})
        self.assertTrue(c.visible)
        self.assertEqual(ui.shown, 1)
        c.handle({"type": "pre", "session": "s1", "tool": "Write", "target": "a.py", "file": "a.py", "code": "x = 1"})
        self.assertIn(("onTool", {"tool": "Write", "target": "a.py", "file": "a.py", "code": "x = 1"}), ui.calls)
        c.handle({"type": "stop", "session": "s1"})
        self.assertTrue(c.visible)                    # waits for the typewriter
        stop = [p for f, p in ui.calls if f == "onStop"][0]
        c.flushed(stop["gen"])                        # UI says buffer finished
        self.assertFalse(c.visible)

    def test_stop_timeout_hides_without_ui(self):
        self.c.handle({"type": "prompt", "session": "s1"})
        self.c.handle({"type": "stop", "session": "s1"})
        time.sleep(0.9)                               # 100 ms flush + 600 ms grace
        self.assertFalse(self.c.visible)

    def test_stale_flush_after_new_prompt_ignored(self):
        c = self.c
        c.handle({"type": "prompt", "session": "s1"})
        c.handle({"type": "stop", "session": "s1"})
        old = [p for f, p in self.ui.calls if f == "onStop"][0]["gen"]
        c.handle({"type": "prompt", "session": "s1"})
        c.flushed(old)
        self.assertTrue(c.visible)

    def test_user_minimize_sticky_until_next_prompt(self):
        c = self.c
        c.handle({"type": "prompt", "session": "s1"})
        c.hide_by_user()
        for _ in range(5):
            c.handle({"type": "pre", "session": "s1", "tool": "Read", "target": "x"})
        self.assertFalse(c.visible)
        c.handle({"type": "prompt", "session": "s1"})
        self.assertTrue(c.visible)

    def test_toggle(self):
        c = self.c
        c.toggle()
        self.assertTrue(c.visible)
        c.toggle()
        self.assertFalse(c.visible)

    def test_other_session_stop_ignored_and_latest_session_wins(self):
        c = self.c
        c.handle({"type": "prompt", "session": "A"})
        c.handle({"type": "pre", "session": "B", "tool": "Read"})
        self.assertEqual(c.session, "B")
        c.handle({"type": "stop", "session": "A"})
        self.assertFalse(c.stop_pending)
        self.assertTrue(c.visible)

    def test_app_side_redaction(self):
        self.c.handle({"type": "pre", "session": "s", "tool": "Write", "file": "x/.env.local", "code": "SECRET=1"})
        payload = [p for f, p in self.ui.calls if f == "onTool"][0]
        self.assertEqual(payload["code"], "[hidden]")


class TestEndToEnd(unittest.TestCase):
    """Real hook.py process -> real HTTP server -> Controller."""

    def setUp(self):
        self.sb = HookSandbox()
        self.ui = FakeUI()
        self.c = app.Controller(self.ui, dict(app.DEFAULTS))
        self.port = free_port()
        self.server = app.start_server(self.port, self.c, lambda: None)
        with open(self.sb.running, "w") as f:
            json.dump({"pid": os.getpid(), "port": self.port}, f)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.sb.cleanup()

    def test_flow(self):
        env = {"TASK_ANIMATION_PORT": str(self.port)}
        seq = [
            {"hook_event_name": "UserPromptSubmit", "session_id": "s1", "prompt": "hi"},
            PRE_WRITE,
            {"hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "Write",
             "tool_input": {"file_path": "/proj/.env", "content": "TOKEN=abc"}},
            {"hook_event_name": "Stop", "session_id": "s1"},
        ]
        for ev in seq:
            code, ms = self.sb.run(ev, env)
            print("  hook %-16s app running: exit=%d %.0f ms" % (ev["hook_event_name"], code, ms))
            self.assertEqual(code, 0)
            self.assertLess(ms, 300)
        time.sleep(0.2)
        self.assertEqual(self.ui.names()[:2], ["onPrompt", "setVisible"])
        tools = [p for f, p in self.ui.calls if f == "onTool"]
        self.assertEqual(tools[0]["code"], "print('hi')\n")
        self.assertEqual(tools[1]["code"], "[hidden]")
        self.assertNotIn("abc", json.dumps(self.ui.calls))
        self.assertIn("onStop", self.ui.names())

    def test_rejects_requests_without_header(self):
        import http.client
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        conn.request("POST", "/event", b'{"type":"prompt"}', {"Content-Type": "text/plain"})
        self.assertEqual(conn.getresponse().status, 403)
        self.assertFalse(self.c.visible)

    def test_second_instance_cannot_bind(self):
        with self.assertRaises(OSError):
            app.start_server(self.port, self.c, lambda: None)


class TestSettingsMerge(unittest.TestCase):
    EXISTING = {
        "model": "opus",
        "permissions": {"allow": ["Bash(ls:*)"]},
        "hooks": {
            "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "my-guard.sh"}]}],
            "Stop": [{"hooks": [{"type": "command", "command": "python notify.py"}]}],
            "Notification": [{"hooks": [{"type": "command", "command": "toast.exe"}]}],
        },
    }

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "settings.json")
        with open(self.path, "w") as f:
            json.dump(self.EXISTING, f)
        self.args = ["--settings", self.path, "--python", r"C:\Users\me\.claude\task-animation\.venv\Scripts\python.exe",
                     "--hook", r"C:\Users\me\.claude\task-animation\hook.py"]

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def load(self):
        with open(self.path) as f:
            return json.load(f)

    def test_install_preserves_and_is_idempotent(self):
        self.assertEqual(settings_merge.main(["install"] + self.args), 0)
        self.assertEqual(settings_merge.main(["install"] + self.args), 0)
        d = self.load()
        self.assertEqual(d["model"], "opus")
        self.assertEqual(d["permissions"], self.EXISTING["permissions"])
        self.assertEqual(d["hooks"]["Notification"], self.EXISTING["hooks"]["Notification"])
        self.assertEqual(d["hooks"]["PreToolUse"][0], self.EXISTING["hooks"]["PreToolUse"][0])
        self.assertEqual(d["hooks"]["Stop"][0], self.EXISTING["hooks"]["Stop"][0])
        for ev in ("UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"):
            ours = [g for g in d["hooks"][ev] if any(settings_merge.is_ours(h) for h in g["hooks"])]
            self.assertEqual(len(ours), 1, ev)
        self.assertEqual([g for g in d["hooks"]["PreToolUse"] if g.get("matcher") == "*"][0]["hooks"][0]["command"],
                         'C:/Users/me/.claude/task-animation/.venv/Scripts/python.exe '
                         'C:/Users/me/.claude/task-animation/hook.py PreToolUse')
        backups = [f for f in os.listdir(self.dir) if ".bak-" in f]
        self.assertTrue(backups)

    def test_command_parses_in_powershell_cmd_and_bash(self):
        cmd = settings_merge.build_command(r"C:\Users\gautham\.claude\task-animation\.venv\Scripts\python.exe",
                                           r"C:\Users\gautham\.claude\task-animation\hook.py", "Stop")
        self.assertFalse(cmd.startswith('"'))         # PowerShell rejects a leading quoted string
        self.assertNotIn("\\", cmd)                  # bash would eat backslashes
        self.assertTrue(settings_merge.is_ours({"command": cmd}))
        spaced = settings_merge.build_command("C:/Users/Jo Ann/py.exe", "C:/Users/Jo Ann/task-animation/hook.py", "Stop")
        self.assertTrue(spaced.startswith('& "'))

    def test_reinstall_replaces_old_quoted_entries(self):
        old = {"hooks": {"Stop": [{"hooks": [{"type": "command", "command":
               '"C:/u/.claude/task-animation/.venv/Scripts/python.exe" "C:/u/.claude/task-animation/hook.py" Stop'}]}]}}
        with open(self.path, "w") as f:
            json.dump(old, f)
        settings_merge.main(["install"] + self.args)
        cmds = [h["command"] for g in self.load()["hooks"]["Stop"] for h in g["hooks"]]
        self.assertEqual(len(cmds), 1)
        self.assertFalse(cmds[0].startswith('"'))

    def test_uninstall_restores_original(self):
        settings_merge.main(["install"] + self.args)
        settings_merge.main(["uninstall", "--settings", self.path])
        self.assertEqual(self.load(), self.EXISTING)

    def test_invalid_json_untouched(self):
        with open(self.path, "w") as f:
            f.write("{ broken")
        self.assertEqual(settings_merge.main(["install"] + self.args), 2)
        with open(self.path) as f:
            self.assertEqual(f.read(), "{ broken")

    def test_missing_settings_created(self):
        os.remove(self.path)
        settings_merge.main(["install"] + self.args)
        self.assertEqual(len(self.load()["hooks"]), 4)


class TestHotkeyParse(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(app.parse_hotkey("ctrl+alt+m"), (0x3, ord("M")))
        self.assertEqual(app.parse_hotkey("Ctrl+Shift+F9"), (0x6, 0x78))


if __name__ == "__main__":
    unittest.main(verbosity=2)

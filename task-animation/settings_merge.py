"""Add / remove the task-animation hooks in Claude Code's user settings.json.

    python settings_merge.py install   --settings PATH --python PY --hook HOOK
    python settings_merge.py uninstall --settings PATH

Install backs the file up first, keeps every existing hook and setting, and is
idempotent (old task-animation entries are replaced, never duplicated).
Our entries are recognised by "task-animation/hook.py" in the command.
"""
import argparse
import json
import os
import shutil
import sys
import time

MARKER = "task-animation/hook.py"
EVENTS = [("UserPromptSubmit", None), ("PreToolUse", "*"), ("PostToolUse", "*"), ("Stop", None)]
HOOK_TIMEOUT_S = 5


def is_ours(hook):
    return isinstance(hook, dict) and MARKER in str(hook.get("command", "")).replace("\\", "/")


def strip_ours(settings):
    """Remove our hook commands; drop groups / events that end up empty because of it."""
    hooks = settings.get("hooks")
    if not isinstance(hooks, dict):
        return
    for event in list(hooks):
        groups = hooks[event]
        if not isinstance(groups, list):
            continue
        kept = []
        for g in groups:
            if isinstance(g, dict) and isinstance(g.get("hooks"), list):
                inner = [h for h in g["hooks"] if not is_ours(h)]
                if not inner and g["hooks"]:
                    continue  # group held only our hooks
                g["hooks"] = inner
            kept.append(g)
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
    if not hooks:
        del settings["hooks"]


def add_ours(settings, python, hook):
    py, hk = python.replace("\\", "/"), hook.replace("\\", "/")
    hooks = settings.setdefault("hooks", {})
    for event, matcher in EVENTS:
        group = {"hooks": [{"type": "command",
                            "command": '"%s" "%s" %s' % (py, hk, event),
                            "timeout": HOOK_TIMEOUT_S}]}
        if matcher is not None:
            group = {"matcher": matcher, **group}
        hooks.setdefault(event, []).append(group)


def load(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()
    if not text.strip():
        return {}
    data = json.loads(text)  # invalid JSON -> raise, never overwrite the user's file
    if not isinstance(data, dict):
        raise ValueError("settings.json is not a JSON object")
    return data


def write(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def backup(path):
    if not os.path.exists(path):
        return None
    dst = "%s.bak-%s" % (path, time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(path, dst)
    return dst


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["install", "uninstall"])
    p.add_argument("--settings", default=os.path.join(os.path.expanduser("~"), ".claude", "settings.json"))
    p.add_argument("--python")
    p.add_argument("--hook")
    a = p.parse_args(argv)
    try:
        data = load(a.settings)
    except Exception as e:
        print("ERROR: cannot parse %s (%s); nothing changed." % (a.settings, e), file=sys.stderr)
        return 2
    bak = backup(a.settings)
    if bak:
        print("Backup: " + bak)
    strip_ours(data)
    if a.action == "install":
        if not a.python or not a.hook:
            p.error("install needs --python and --hook")
        add_ours(data, a.python, a.hook)
    write(a.settings, data)
    print("%s hooks in %s" % ("Registered" if a.action == "install" else "Removed", a.settings))
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Claude Code task animation (Windows)

A floating window that appears when you submit a prompt to Claude Code. It types the code Claude is writing, runs a Matrix-style animation alongside, and hides to the system tray when Claude stops.

## Install

You need Python 3.9–3.13 on your PATH and the Edge WebView2 runtime (already included in Windows 10 and 11).

```powershell
cd task-animation
powershell -ExecutionPolicy Bypass -File .\install.ps1          # optional: -Port 47900  -ResetConfig
```

The installer:

- copies the files to `%USERPROFILE%\.claude\task-animation\`
- creates a separate Python environment (`.venv`) there and installs `pywebview`, `pystray` and `Pillow`
- backs up `~/.claude/settings.json` to `settings.json.bak-<timestamp>`
- adds hooks for `UserPromptSubmit`, `PreToolUse` (`*`), `PostToolUse` (`*`) and `Stop`, keeping all your existing hooks and settings

Running the installer again is safe. It replaces its own hook entries instead of adding duplicates, and keeps your `config.json`.

## Use

| Action | How |
|---|---|
| Show | Automatic on each prompt |
| Hide | Automatic on Stop, once the typewriter finishes (at most 3 s) |
| Toggle | **Ctrl+Alt+M**, or left-click the tray icon |
| Minimize / close | `–` or `×` in the header. Both hide to the tray. If you hide the window during a task, it stays hidden until your next prompt. |
| Tray menu | Show/Hide · Pause animation · Quit |
| Move / resize | Drag the header. Resize from the bottom-right grip (window edges also work where Windows supports it). Position and size are remembered. |

Files matching `.env*`, `*.key`, `*.pem`, `*secret*`, `*credential*` or `id_rsa*` are shown as `[hidden]`. Each piece of code is cut at 4000 characters. For Bash calls, the header shows only the command's description or program name, never the full command.

## Configure: `%USERPROFILE%\.claude\task-animation\config.json`

| Key | Default | Meaning |
|---|---|---|
| `port` | `47821` | Local port (bound to 127.0.0.1 only). Quit the app from the tray after changing it. |
| `hotkey` | `ctrl+alt+m` | Modifiers `ctrl` `alt` `shift` `win`, plus a letter, a digit, or `f1`–`f24` |
| `typing_ms_per_char` | `45` | Typewriter speed |
| `backlog_chars` | `1500` | Above this many waiting characters, typing speeds up or skips ahead |
| `stop_flush_max_ms` | `3000` | Longest wait after Stop before hiding |
| `rain_step_ms` / `token_step_ms` / `hex_update_ms` | `90` / `180` / `350` | Speeds of the three animation layers |
| `colors` | `background` `green` `cyan` `pink` `amber` | Hex colours |
| `always_on_top`, `window.width`, `window.height` | `true`, `900`, `320` | Window settings. The saved size wins once you resize the window. |
| `hidden_patterns`, `max_payload_chars` | see above | Which files to hide, and the per-payload character cap |

Changes take effect after you quit the app from the tray. It restarts on your next prompt.

## Disable / uninstall

| Goal | How |
|---|---|
| Pause for now | Tray → Quit. It comes back on the next prompt. |
| Disable without uninstalling | Remove the four `task-animation/hook.py` entries from `~/.claude/settings.json` |
| Uninstall | `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\task-animation\uninstall.ps1"`. This stops the app, removes only its hook entries (after a backup) and deletes the folder. |

## How it works

| Part | Role |
|---|---|
| `hook.py` | Hook script that reads the hook JSON, keeps only what the UI needs and POSTs it to the app with a 250 ms timeout. It always exits 0. When the app isn't running it skips the network call (it checks `state/running.json` and the process ID), so it stays fast with the app closed. On `UserPromptSubmit` it starts the app with `pythonw.exe`, detached and with no console window. |
| `app.py` | Local HTTP server, the pywebview window, the pystray tray icon and the Windows hotkey. It accepts only requests carrying the `X-Task-Animation: 1` header, which stops web pages from driving it. Only one copy runs at a time. |
| `ui.html` | The canvas and DOM user interface. Hook text is inserted as plain text only, never as HTML. Rendering stops while the window is hidden. |
| `settings_merge.py` | Adds and removes the hook entries in `settings.json`. Used by both install and uninstall. |
| `state/` | `running.json`, the saved window position and size (`state.json`), and `app.log` |

When several Claude Code sessions are running, the window follows whichever session sent the most recent event. A Stop from another session is ignored.

## Tests

```bash
python -m unittest discover tests -v                  # hook timing, hidden files, settings merge, controller, HTTP
NODE_PATH=$(npm root -g) node tests/ui_test.mjs       # headless check of ui.html (needs Playwright)
```

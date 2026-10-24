# KEM Site – running on the ZBook (Windows)

Everything runs on the ZBook. No cloud services; remote access only through Tailscale (see `TAILSCALE_FUNNEL.md`).

## 1. One-time install

| # | Step | Command / where |
|---|---|---|
| 1 | Install **Node.js 22 LTS** and **Git for Windows** | nodejs.org · git-scm.com |
| 2 | Get the code | `git clone https://github.com/bvgautham7maakan/dingan.git C:\KEM-Site` |
| 3 | Settings | `cd C:\KEM-Site` → `powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1` (first run creates `.env` and opens it in Notepad) |
| 4 | Fill in `.env` | `SEED_TEMP_PASSWORD`, `BACKUP_DIR` (OneDrive folder), `COOKIE_SECURE="true"` once Funnel is on, `SEED_DEMO="false"` for go-live |
| 5 | Install, migrate, seed, build | run `setup.ps1` again |
| 6 | Run as a service + nightly backup | **Administrator** PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\windows\install-service.ps1` |
| 7 | Check | http://localhost:3000/api/health → `{"ok":true}` · sign in at http://localhost:3000 |

`install-service.ps1` registers two Windows Task Scheduler tasks (built in, nothing to download):

| Task | When | What |
|---|---|---|
| KEM Site | at start-up, restarts on failure | `scripts\windows\start-kem.cmd` → `npm start` (port 3000, this machine only) |
| KEM Site backup | daily 02:00 (runs later if the ZBook was off) | `scripts\windows\backup-now.cmd` → `npm run backup` |

Power settings: set **Sleep = Never** when plugged in, or the app is unreachable while the ZBook sleeps.

## 2. Daily operation

| Need | Do |
|---|---|
| Is it running? | `Get-ScheduledTask "KEM Site*" \| Get-ScheduledTaskInfo` · http://localhost:3000/api/health |
| Logs | `C:\KEM-Site\data\logs\server.log`, `backup.log`; backup history also in `BACKUP_DIR\backup.log` |
| Restart | `Restart-ScheduledTask "KEM Site"` (or reboot) |
| Stop | `Stop-ScheduledTask "KEM Site"` |
| Remove service | `scripts\windows\uninstall-service.ps1` (data is kept) |

## 3. Backup and restore

Backup (`npm run backup`, nightly):
- `BACKUP_DIR\db\kem-YYYY-MM-DD.db` – consistent copy of the database taken while the app runs (`VACUUM INTO`), checked by opening it.
- `BACKUP_DIR\uploads\…` – photos, voice notes, drawings, exports; new and changed files only, never deleted.
- Keeps the last 14 daily copies plus the first copy of each month for 12 months.

Restore (e.g. new ZBook):
1. Install as in section 1 (steps 1–5, use the same `.env`).
2. `Stop-ScheduledTask "KEM Site"`.
3. Copy `BACKUP_DIR\db\kem-<date>.db` to `C:\KEM-Site\data\kem.db` (replace).
4. Copy `BACKUP_DIR\uploads` to `C:\KEM-Site\data\uploads`.
5. `npx prisma migrate deploy` (in case the code is newer), then `Start-ScheduledTask "KEM Site"`.

Test a restore once before go-live.

## 4. Updating to a new version

```
cd C:\KEM-Site
git pull
powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
Restart-ScheduledTask "KEM Site"
```
`setup.ps1` applies new database migrations; it never deletes data. Take a backup first (`npm run backup`).

## 5. Demo data and go-live

| Situation | Do |
|---|---|
| Pilot demo | default seed (`SEED_DEMO="true"`): sample plan, attendance, moves, trips with a clash, requests with HIGH-ALERT, drawings, queries, duties |
| Reset the demo | `npm run reset-demo` (type RESET) – deletes **all** data and re-seeds |
| Go live (real data only) | set `SEED_DEMO="false"` in `.env`, then `npm run reset-demo` once; hand out the temporary passwords; everyone sets their own at first sign-in |

## 6. Security checklist

- [ ] `.env` is not shared; `SEED_TEMP_PASSWORD` changed from the example
- [ ] `COOKIE_SECURE="true"` when served over HTTPS (Funnel)
- [ ] Windows Update on, BitLocker on (the database and photos are on this disk)
- [ ] Port 3000 is **not** opened in the Windows firewall (the app listens on 127.0.0.1 only)
- [ ] Backup folder is in OneDrive and `backup.log` shows OK daily
- [ ] Admin reviews Admin › Users › devices monthly; deactivate leavers the same day

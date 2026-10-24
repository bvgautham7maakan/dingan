# Remote access with Tailscale Funnel

Funnel gives the ZBook a public HTTPS address (e.g. `https://kem-zbook.<your-tailnet>.ts.net`) so phones on mobile data can reach KEM Site without opening router ports. **These steps are for you to run – nothing here has been run for you.**

## Option A – Funnel (public URL, simplest for site phones)

| # | Step |
|---|---|
| 1 | Install **Tailscale for Windows** on the ZBook and sign in with the KEM account. In the tray menu enable **Run unattended** (works when nobody is logged in). |
| 2 | Name the machine, e.g. `kem-zbook` (admin console › Machines). |
| 3 | Admin console › **DNS**: turn on **MagicDNS** and **HTTPS certificates**. |
| 4 | Admin console › **Access controls**: allow Funnel for the ZBook, e.g. add `"nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]` (Tailscale also offers this when you first run the command below). |
| 5 | On the ZBook (PowerShell): `tailscale funnel --bg 3000` – prints the public URL. `--bg` keeps it on after reboots. |
| 6 | In `C:\KEM-Site\.env` set `COOKIE_SECURE="true"`, then `Restart-ScheduledTask "KEM Site"`. |
| 7 | Phones: open the URL in Chrome → ⋮ → **Add to Home screen**. |

Check / stop:
```
tailscale funnel status
tailscale funnel --https=443 off      # stop public access
```

## Option B – Tailscale only (no public URL, more secure)

`tailscale serve --bg 3000` instead of `funnel`, and install the Tailscale app on every phone and office PC (free for small teams). Only signed-in Tailscale devices can reach the app. Recommended if anyone is uncomfortable with a public login page.

## What protects the public login page

| Control | In the app |
|---|---|
| HTTPS | Tailscale certificate (automatic) |
| Password storage | argon2id hashes; temporary passwords must be changed at first sign-in |
| Brute force | 5 wrong passwords for a username → blocked 15 minutes (plus 20 per client address when the address is known) |
| Sessions | server-side; Admin/PM can sign out all devices of a user at once; deactivated users are out immediately |
| Data exposure | money fields removed server-side for site/driver/design roles; drawings only "for construction" for site roles |
| Headers | Content-Security-Policy (same-origin only), no framing, no MIME sniffing |
| No third parties | no CDNs, fonts, analytics or telemetry (Next.js telemetry off) |

## Notes

- Funnel serves only ports 443, 8443 and 10000 publicly; the app itself stays on 127.0.0.1:3000.
- Funnel has bandwidth limits suitable for a team of this size; large drawing PDFs load once and are then cached on the phone.
- If the ZBook is asleep or off, the app is unreachable – keep it plugged in with sleep disabled.

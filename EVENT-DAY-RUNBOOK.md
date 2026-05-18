# Event-Day Setup Runbook
## Coyote Creek Camporee 2026 — "The Circus"
### Camp Chesebrough, May 15–17, 2026

**Read this top-to-bottom before touching anything. Then follow it in order.**
Cert valid until: **July 1 2026** — no renewal needed today.
Judge URL: **https://judge.camporeeconductor.com**

---

## BEFORE YOU GO OFFLINE — Do These Now (While on Starlink)

- [ ] QR codes printed or on screen — see Part 7 below
- [ ] Docker Desktop is installed and has run at least once
- [ ] `docker compose pull` or images already built (so no internet needed)
- [ ] This file is readable offline

---

## PART 1 — GL-iNet Opal GL-SFT1200 First Boot

**Check bottom of router** — the label has:
- Default SSID (e.g. `GL-SFT1200-abc`)
- Default WiFi password
- Default admin password

### 1.1 Power it on
Plug in the USB-C power cable. Wait ~60 seconds for full boot (power LED solid).

### 1.2 Connect a device (phone or laptop) to its default WiFi
Use the SSID and password from the bottom label.

### 1.3 Open the admin panel
Browser → **http://192.168.8.1**
Set a new admin password when prompted (write it below):

> **Admin password:** campore2026           

### 1.4 Set your event WiFi name and password
Admin panel → Wireless:
- **SSID:** `Camporee2026` (or whatever you want on the QR code)
- **Password:** (something judges can type; write it below)

> **WiFi SSID:** GL-SFT1200-280
> **WiFi Password:**  goodlife

Leave all other defaults. Router mode is correct. No WAN uplink needed.

---

## PART 2 — Connect the Laptop to the Opal

1. On Windows: forget any other WiFi networks that might auto-connect
2. Connect Windows WiFi to your new **Camporee2026** SSID
3. Open WSL2 terminal

Confirm the laptop got an IP from the Opal:
```bash
ip addr show eth0 2>/dev/null || ip addr show | grep "192.168.8"
```
You should see something like `192.168.8.100/24`.

> **Write down the laptop's IP:** `192.168.8.________`

This IP goes into the DNS entry in Part 4.

Also get the Windows IP (needed for the portproxy check):
```powershell
# In Windows PowerShell:
ipconfig | findstr "192.168.8"
```
The Windows IP and WSL2 IP are different — the router talks to the **Windows** IP.
The DNS entry should point to the **Windows** IP (what `ipconfig` shows on that adapter).

> **Windows IP on Opal network:** `192.168.8.________`

---

## PART 3 — Windows Firewall / Port Forwarding (WSL2 → Router)

Docker runs inside WSL2 but judges connect to the Windows IP. Windows must
forward ports 80 and 443 through to WSL2.

**Open PowerShell as Administrator** and run the commands from `WinFireWall.sh`:

```powershell
# Step 1: Get WSL2 internal IP
$wslIp = (wsl hostname -I).Trim().Split()[0]
Write-Host "WSL2 IP: $wslIp"

# Step 2: Forward ports 80 and 443 from Windows → WSL2
netsh interface portproxy add v4tov4 listenport=80  listenaddress=0.0.0.0 connectport=80  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp

# Step 3: Open those ports in Windows Firewall
netsh advfirewall firewall add rule name="WSL2 HTTP"  dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="WSL2 HTTPS" dir=in action=allow protocol=TCP localport=443

# Step 4: Confirm
netsh interface portproxy show all
```

You should see rows for `0.0.0.0:80` and `0.0.0.0:443` forwarding to the WSL2 IP.

> **NOTE:** WSL2's internal IP changes on every reboot. Re-run these commands
> if you restart Windows during the event.

---

## PART 4 — DNS: Point judge.camporeeconductor.com → Laptop

The Opal's built-in dnsmasq must resolve `judge.camporeeconductor.com` to the
laptop's Windows IP so that judge phones on the WiFi find the server.

### Option A — SSH into the router (recommended, most reliable)

From WSL2:
```bash
ssh root@192.168.8.1
# Password: the admin password you set in Part 1
```

Once logged in, run (replace X with your laptop's last octet from Part 2):
```bash
LAPTOP_IP="192.168.8.X"    # ← fill in your actual IP

# Add the local DNS record
echo "$LAPTOP_IP  judge.camporeeconductor.com" >> /etc/hosts

# Restart dnsmasq to pick it up
/etc/init.d/dnsmasq restart
```

Verify:
```bash
nslookup judge.camporeeconductor.com 127.0.0.1
# Should show your laptop IP
```

Type `exit` to leave the router shell.

### Option B — LuCI web interface (if SSH doesn't work)

1. Browser → **http://192.168.8.1** → click **Advanced** button (bottom of left nav)
2. Log in with your admin password
3. Navigate: **Network → DHCP and DNS → Hostnames** tab
4. Click **Add**:
   - Hostname: `judge.camporeeconductor.com`
   - IP Address: `192.168.8.X` (your laptop's Windows IP)
5. Click **Save & Apply**

### Verify DNS from the laptop

```bash
# From WSL2:
nslookup judge.camporeeconductor.com 192.168.8.1
```
Should return your laptop IP. If it returns something else, the DNS entry didn't take — recheck and retry.

---

## PART 5 — Start Docker and the Collator

### 5.1 Make sure Docker Desktop is running
Windows taskbar → Docker icon → should say "Running". If not, launch it and wait ~30 seconds.

### 5.2 Start the services
```bash
cd ~/ws/camporee-conductor

# Start Collator + Caddy (the two services judges need)
docker compose up -d collator caddy

# Watch startup logs
docker compose logs -f collator caddy
```

Healthy output looks like:
```
camporee-collator  | Collator running on port 3000
camporee-caddy     | ... serving https://judge.camporeeconductor.com
```

Press `Ctrl+C` to stop tailing logs (services keep running).

### 5.3 Check container status
```bash
docker compose ps
```
Both `camporee-collator` and `camporee-caddy` should show **Up**.

---

## PART 6 — End-to-End Verification

### From the laptop (browser)
- [ ] **http://localhost:3000/admin.html** — Collator admin dashboard loads
- [ ] **https://judge.camporeeconductor.com** — Judge PWA loads with no cert warning

### From a judge's phone
1. Connect phone to **Camporee2026** WiFi
2. Browser → **https://judge.camporeeconductor.com**
3. Should load the judge PWA — no cert warning (real Let's Encrypt cert)
4. If prompted to "Add to Home Screen" → do it (makes it feel native)

### If HTTPS shows a cert warning
```bash
# Check Caddy logs
docker compose logs caddy

# Verify cert files exist
ls -la ~/ws/camporee-conductor/certs/
# Should see: fullchain.pem  privkey.pem

# Check cert expiry
openssl x509 -enddate -noout -in ~/ws/camporee-conductor/certs/fullchain.pem
# Expect: notAfter=Jul  1 00:04:15 2026 GMT  ← valid, you're fine
```

---

## PART 7 — QR Codes for Judges

### Generate QR codes (do this NOW while online, or use the commands below offline)

Install qrencode if needed:
```bash
sudo apt install qrencode -y
```

**WiFi QR code** (judges scan to join the network automatically):
```bash
cd ~/ws/camporee-conductor

# Fill in your SSID and password from Part 1
SSID="Camporee2026"
PASS="YourPasswordHere"

qrencode -o qr-wifi.png -s 8 "WIFI:T:WPA;S:${SSID};P:${PASS};;"
```

**Judge URL QR code** (judges scan to open the PWA):
```bash
qrencode -o qr-judge.png -s 8 "https://judge.camporeeconductor.com"
```

Open and print (or display on screen at check-in):
```bash
# Open in Windows from WSL2
explorer.exe qr-wifi.png
explorer.exe qr-judge.png
```

### What to tell judges
> "Connect your phone to the **Camporee2026** WiFi (scan the QR or type the password),
> then go to **https://judge.camporeeconductor.com** or scan the second QR code.
> Add it to your home screen for the best experience."

---

## PART 8 — During the Event

### Admin dashboard (laptop only)
http://localhost:3000/admin.html

- Monitor scores per game
- **Close Game** when each event finishes (prevents further scoring)
- View patrol standings

### Leaderboard (any device on WiFi)
https://judge.camporeeconductor.com/official.html

### Print tools
https://judge.camporeeconductor.com/utils.html

---

## PART 9 — Troubleshooting

### Judges can't reach the server
1. Is the laptop still on **Camporee2026** WiFi? `ip addr | grep 192.168.8`
2. Did the Windows port proxy survive a sleep/wake? Re-run Part 3 commands.
3. Try direct IP: `http://192.168.8.X:3000` from a phone — if that works, it's a DNS issue
4. Re-run the SSH DNS setup from Part 4 and verify with `nslookup`

### Collator not responding
```bash
docker compose ps                          # check container states
docker compose logs collator              # look for errors
docker compose restart collator           # restart it
```

### Caddy cert error in logs
```bash
docker compose logs caddy
ls -la ~/ws/camporee-conductor/certs/     # both files must exist
```

### Scores seem stuck
- Judge PWA syncs on form submit — it queues offline and retries
- Check `docker compose logs collator` for POST errors
- Data is safe in the phone's LocalStorage until sync succeeds

### Service worker locks up a judge's phone
- Kill the tab, reopen the URL
- Last resort: DevTools (or long-press reload) → Application → Service Workers → Unregister → reload

### After a Windows reboot (WSL2 IP changes)
```powershell
# In PowerShell as Admin — clears old rules and re-adds with new WSL2 IP
netsh interface portproxy reset
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=80  listenaddress=0.0.0.0 connectport=80  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp
netsh advfirewall firewall add rule name="WSL2 HTTP"  dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="WSL2 HTTPS" dir=in action=allow protocol=TCP localport=443
```

---

## QUICK REFERENCE CARD

| What | Where |
|------|-------|
| Router admin | http://192.168.8.1 |
| Admin dashboard | http://localhost:3000/admin.html |
| Judge PWA | https://judge.camporeeconductor.com |
| Leaderboard | https://judge.camporeeconductor.com/official.html |
| Print tools | https://judge.camporeeconductor.com/utils.html |
| Start services | `cd ~/ws/camporee-conductor && docker compose up -d collator caddy` |
| Check status | `docker compose ps` |
| Tail logs | `docker compose logs -f` |
| Laptop IP | `ip addr show \| grep 192.168.8` |

---

*Good luck, Jim. You built this. It'll work.*

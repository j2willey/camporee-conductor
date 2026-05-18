# Event Day — What's Left To Do
## Coyote Creek Camporee 2026 — May 16, 2026

**Status going in:**
- Collator running ✅
- Connected to Opal WiFi ✅
- Router admin password set ✅

**Network credentials (filled in):**
- WiFi SSID: `GL-SFT1200-280`
- WiFi Password: `goodlife`
- Router admin: http://192.168.8.1 — password `campore2026`
- Judge URL: **https://judge.camporeeconductor.com**

---

## STEP 1 — Find Your IPs

**In WSL2:**
```bash
ip addr show | grep "192.168.8"
```
Note the laptop's IP (e.g. `192.168.8.105`).

**In Windows PowerShell:**
```powershell
ipconfig | findstr "192.168.8"
```
Note the Windows IP on the Opal adapter — this is what the router talks to.

> **Laptop Windows IP:** `192.168.8.228`   ← write it here

---

## STEP 2 — Windows Port Forwarding (PowerShell as Admin)

```powershell
# Get WSL2 internal IP
$wslIp = (wsl hostname -I).Trim().Split()[0]
Write-Host "WSL2 IP: $wslIp"

# Forward ports 80 and 443 from Windows to WSL2
netsh interface portproxy add v4tov4 listenport=80  listenaddress=0.0.0.0 connectport=80  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp

# Open firewall
netsh advfirewall firewall add rule name="WSL2 HTTP"  dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="WSL2 HTTPS" dir=in action=allow protocol=TCP localport=443

# Confirm — you should see rows for 0.0.0.0:80 and 0.0.0.0:443
netsh interface portproxy show all
```

> **NOTE:** WSL2 IP changes on reboot. Re-run these if you restart Windows.

---

## STEP 3 — DNS on the Opal Router

SSH in from WSL2:
```bash
ssh root@192.168.8.1
# Password: campore2026
```

Once in, add the DNS record (replace X with your Windows IP last octet from Step 1):
```bash
LAPTOP_IP="192.168.8.X"
echo "$LAPTOP_IP  judge.camporeeconductor.com" >> /etc/hosts
/etc/init.d/dnsmasq restart
```

Verify it resolved:
```bash
nslookup judge.camporeeconductor.com 127.0.0.1
# Should show your laptop IP
```

Type `exit` to leave the router.

Verify from WSL2:
```bash
nslookup judge.camporeeconductor.com 192.168.8.1
```

---

## STEP 4 — Verify End-to-End

- [ ] **Laptop browser:** http://localhost:3000/admin.html — admin dashboard loads
- [ ] **Laptop browser:** https://judge.camporeeconductor.com — loads with no cert warning
- [ ] **Phone** (on `GL-SFT1200-280` WiFi): https://judge.camporeeconductor.com — judge PWA loads, no cert warning
- [ ] Phone: tap "Add to Home Screen"

---

## STEP 5 — QR Codes for Judges

```bash
cd ~/ws/camporee-conductor

# WiFi QR (judges scan to join automatically)
qrencode -o qr-wifi.png -s 8 "WIFI:T:WPA;S:GL-SFT1200-280;P:goodlife;;"

# Judge URL QR
qrencode -o qr-judge.png -s 8 "https://judge.camporeeconductor.com"

# Open in Windows to print or display
explorer.exe qr-wifi.png
explorer.exe qr-judge.png
```

If `qrencode` not installed: `sudo apt install qrencode -y`

**Tell judges:**
> "Connect to WiFi **GL-SFT1200-280** (password: **goodlife**), then go to **https://judge.camporeeconductor.com** or scan the QR. Add it to your home screen."

---

## QUICK REFERENCE

| What | Where |
|------|-------|
| Router admin | http://192.168.8.1 (pw: campore2026) |
| Admin dashboard | http://localhost:3000/admin.html |
| Judge PWA | https://judge.camporeeconductor.com |
| Leaderboard | https://judge.camporeeconductor.com/official.html |
| Print tools | https://judge.camporeeconductor.com/utils.html |
| Check containers | `docker compose ps` |
| Tail logs | `docker compose logs -f` |

---

## IF SOMETHING BREAKS

**Judges can't reach server:**
1. Still on `GL-SFT1200-280` WiFi? `ip addr | grep 192.168.8`
2. Port proxy still alive? Re-run Step 2.
3. Test direct: from a phone browser try `http://192.168.8.X:3000` — if that works, it's DNS. Re-run Step 3.

**Collator not responding:**
```bash
docker compose ps
docker compose logs collator
docker compose restart collator
```

**After a Windows reboot (WSL2 IP changes):**
```powershell
netsh interface portproxy reset
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=80  listenaddress=0.0.0.0 connectport=80  connectaddress=$wslIp
netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp
netsh advfirewall firewall add rule name="WSL2 HTTP"  dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="WSL2 HTTPS" dir=in action=allow protocol=TCP localport=443
```

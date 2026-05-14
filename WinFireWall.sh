
# Fix: Windows port proxy rules

# Run this in Windows PowerShell as Administrator:

# Get your WSL2 internal IP
$wslIp = (wsl hostname -I).Trim().Split()[0]

# Forward ports 80 and 443 from Windows → WSL2
 netsh interface portproxy add v4tov4 listenport=80  listenaddress=0.0.0.0 connectport=80  connectaddress=$wslIp
 netsh interface portproxy add v4tov4 listenport=443 listenaddress=0.0.0.0 connectport=443 connectaddress=$wslIp

# Allow through Windows Firewall
  netsh advfirewall firewall add rule name="WSL2 HTTP"  dir=in action=allow protocol=TCP localport=80
  netsh advfirewall firewall add rule name="WSL2 HTTPS" dir=in action=allow protocol=TCP localport=443

# Confirm rules were added
  netsh interface portproxy show all

#  Caveat: WSL2's internal IP changes on every reboot. You'll need to re-run 
#  the port proxy commands after each restart. To make it permanent, add a 
#  startup script — let me know and I'll set that up.

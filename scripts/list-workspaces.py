#!/usr/bin/env python3
"""
Offline workspace audit tool for Camporee Conductor.
Reads conductor.db and workspace dirs directly — no server or Docker required.

Usage:
    python scripts/list-workspaces.py
    python scripts/list-workspaces.py --json
    python scripts/list-workspaces.py --user j2willey@gmail.com

Path resolution order (highest priority first):
    1. CLI flags:        --db / --workspaces
    2. Env vars:         CONDUCTOR_DB_PATH / WORKSPACE_PATH  (same vars used by the Node app)
    3. .env file:        loaded automatically from repo root if present
    4. Repo-relative defaults: ./data/shared/conductor.db  /  ./data/composer/workspaces

Recommended setup — add to ~/.bashrc on each machine:
    # Dev (nothing needed — repo-relative defaults work out of the box)
    # VPS:
    export CONDUCTOR_DB_PATH=/opt/camporee-conductor-data/shared/conductor.db
    export WORKSPACE_PATH=/opt/camporee-conductor-data/composer/workspaces

Then the alias is identical on both machines:
    alias cc-workspaces='python3 ~/ws/camporee-conductor/scripts/list-workspaces.py'
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve repo root
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT  = SCRIPT_DIR.parent

# Load .env from repo root if present — populates os.environ
_env_file = REPO_ROOT / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

DEFAULT_DB = Path(os.environ.get(
    "CONDUCTOR_DB_PATH",
    str(REPO_ROOT / "data" / "shared" / "conductor.db")
))
DEFAULT_WORKSPACES = Path(os.environ.get(
    "WORKSPACE_PATH",
    str(REPO_ROOT / "data" / "composer" / "workspaces")
))

# Args
parser = argparse.ArgumentParser(description="Audit Camporee Conductor workspaces.")
parser.add_argument("--db",         default=str(DEFAULT_DB),         help="Path to conductor.db")
parser.add_argument("--workspaces", default=str(DEFAULT_WORKSPACES), help="Path to workspaces dir")
parser.add_argument("--user",       default=None,  help="Filter by email or user_id substring")
parser.add_argument("--json",       action="store_true",             help="Output JSON")
args = parser.parse_args()

db_path = Path(args.db)
ws_path = Path(args.workspaces)

if not db_path.exists():
    print(f"ERROR: DB not found at {db_path}", file=sys.stderr)
    print(f"       Set CONDUCTOR_DB_PATH env var or use --db flag.", file=sys.stderr)
    sys.exit(1)

# Read DB
con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()
cur.execute("""
    SELECT ep.event_id, ep.role, ep.granted_at,
           up.user_id, up.display_name, up.email, up.is_sysadmin
    FROM event_permissions ep
    LEFT JOIN user_profiles up ON ep.user_id = up.user_id
    ORDER BY ep.granted_at ASC
""")
rows = cur.fetchall()
con.close()

def read_camporee_meta(event_id):
    p = ws_path / event_id / "camporee.json"
    if not p.exists():
        return {"title": "(missing camporee.json)", "year": "", "theme": "", "games": "?", "dir_exists": False}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        meta = data.get("meta", {})
        return {
            "title": meta.get("title", "(no title)"),
            "year":  str(meta.get("year", "")),
            "theme": meta.get("theme", ""),
            "games": len(data.get("games", [])),
            "dir_exists": True,
        }
    except Exception as e:
        return {"title": f"(corrupt: {e})", "year": "", "theme": "", "games": "?", "dir_exists": True}

# Find orphan dirs
known_ids = {r["event_id"] for r in rows}
orphan_dirs = []
if ws_path.exists():
    for entry in sorted(ws_path.iterdir()):
        if entry.is_dir() and entry.name not in known_ids:
            orphan_dirs.append(entry.name)

# Group by event_id
events = {}
for r in rows:
    eid = r["event_id"]
    if eid not in events:
        events[eid] = {"event_id": eid, "permissions": [], **read_camporee_meta(eid)}
    granted_ts  = r["granted_at"]
    granted_str = (
        datetime.fromtimestamp(granted_ts, tz=timezone.utc).strftime("%Y-%m-%d")
        if granted_ts else ""
    )
    events[eid]["permissions"].append({
        "role":         r["role"],
        "user_id":      r["user_id"] or "",
        "display_name": r["display_name"] or "(no profile)",
        "email":        r["email"] or "(unknown)",
        "is_sysadmin":  bool(r["is_sysadmin"]),
        "granted_at":   granted_str,
    })

event_list = list(events.values())

# User filter
if args.user:
    f = args.user.lower()
    event_list = [
        e for e in event_list
        if any(
            f in (p["email"] or "").lower() or f in (p["user_id"] or "").lower()
            for p in e["permissions"]
        )
    ]

# JSON output
if args.json:
    out = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "db":           str(db_path),
        "workspaces":   str(ws_path),
        "event_count":  len(event_list),
        "orphan_count": len(orphan_dirs),
        "events":       event_list,
        "orphan_dirs":  [{"dir": d, **read_camporee_meta(d)} for d in orphan_dirs],
    }
    print(json.dumps(out, indent=2))
    sys.exit(0)

# Table output
def trunc(s, n):
    s = str(s or "")
    return (s[:n-1] + "~") if len(s) > n else s.ljust(n)

C = dict(event_id=14, title=30, year=6, games=5, role=8,
         email=30, display_name=22, granted=12, dir=4)

def row(*cells):
    keys = list(C.keys())
    return " | ".join(trunc(cells[i], C[keys[i]]) for i in range(len(cells)))

def divider():
    return "-+-".join("-" * w for w in C.values())

print(f"\nWorkspace audit -- {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print(f"DB:         {db_path}")
print(f"Workspaces: {ws_path}")
if args.user:
    print(f"Filter:     {args.user}")
print(f"Events:     {len(event_list)}  |  Orphan dirs: {len(orphan_dirs)}\n")

print(row("event_id","title","year","games","role","email","display_name","granted","dir"))
print(divider())

for e in event_list:
    for p in e["permissions"]:
        print(row(
            e["event_id"], e["title"], e["year"], e["games"],
            p["role"], p["email"], p["display_name"], p["granted_at"],
            "Y" if e["dir_exists"] else "N",
        ))

if orphan_dirs:
    print("\n-- Orphan workspace dirs (no DB entry) --")
    for d in orphan_dirs:
        meta = read_camporee_meta(d)
        print(f"  {d}  ->  {meta['title']} {meta['year']}")

print()

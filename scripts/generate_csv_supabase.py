#!/usr/bin/env python3
"""Fetch cadet data from Supabase Functions/PostgREST and write CSV files for Excel import.

Outputs:
- outputs/cadets.csv
- outputs/leaderboards.csv
- outputs/attendance.csv
- outputs/points.csv

Usage:
  python scripts/generate_csv_supabase.py --output-dir outputs

Environment:
  Set `SUPABASE_SERVICE_ROLE_KEY` for full access. Optionally set `SUPABASE_PROJECT_ID`.
"""
from __future__ import annotations
import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from urllib.parse import quote


REPO_ROOT = Path(__file__).resolve().parent.parent


def read_project_id_from_repo() -> Optional[str]:
    info_file = REPO_ROOT / "utils" / "supabase" / "info.tsx"
    if not info_file.exists():
        return None
    text = info_file.read_text(encoding="utf-8")
    m = re.search(r"projectId\s*=\s*\"([a-z0-9]+)\"", text)
    if m:
        return m.group(1)
    return None


def request_json(url: str, api_key: Optional[str] = None, timeout: int = 15) -> Optional[Any]:
    headers = {"Accept": "application/json"}
    if api_key:
        headers.update({"apikey": api_key, "Authorization": f"Bearer {api_key}"})
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"Warning: request to {url} failed: {e}")
        return None


def build_functions_base(project_id: str, function_name: str = "server") -> str:
    return f"https://{project_id}.functions.supabase.co/{function_name}"


def try_endpoints(base: str, paths: List[str], api_key: Optional[str]) -> Optional[Any]:
    for p in paths:
        url = base.rstrip("/") + "/" + p.lstrip("/")
        j = request_json(url, api_key)
        if j is not None:
            return j
    return None


def fetch_cadets_functions(base: str, api_key: Optional[str]) -> List[Dict[str, Any]]:
    paths = ["public/cadets", "cadets", "make-server-73a3871f/public/cadets", "make-server-73a3871f/cadets"]
    j = try_endpoints(base, paths, api_key)
    if not j:
        return []
    if isinstance(j, dict) and "cadets" in j:
        return j["cadets"] or []
    if isinstance(j, list):
        return j
    return []


def fetch_leaderboards_functions(base: str, api_key: Optional[str]) -> Dict[str, Any]:
    paths = ["make-server-73a3871f/leaderboards", "leaderboards"]
    j = try_endpoints(base, paths, api_key)
    return j or {}


def fetch_attendance_functions(base: str, api_key: Optional[str]) -> List[Dict[str, Any]]:
    paths = ["make-server-73a3871f/attendance", "attendance"]
    j = try_endpoints(base, paths, api_key)
    if not j:
        return []
    if isinstance(j, dict) and "attendance" in j:
        return j["attendance"] or []
    if isinstance(j, list):
        return j
    return []


def fetch_kv_table_postgrest(project_id: str, table: str, api_key: Optional[str], prefix: Optional[str] = None) -> List[Dict[str, Any]]:
    if not api_key:
        return []
    base = f"https://{project_id}.supabase.co/rest/v1/{table}"
    url = base + "?select=key,value"
    if prefix:
        filter_expr = f"&key=like.%25{quote(prefix)}%25"
        url = url + filter_expr
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()
        return r.json() or []
    except Exception as e:
        print(f"Warning: PostgREST request to {url} failed: {e}")
        return []


def rows_to_csv(rows: List[Dict[str, Any]], out_path: Path):
    if not rows:
        print(f"No rows to write for {out_path.name}")
        return
    df = pd.json_normalize(rows)
    df.to_csv(out_path, index=False)
    print(f"Wrote {out_path} ({len(df)} rows)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="outputs")
    parser.add_argument("--project-id", default=None)
    args = parser.parse_args()

    project_id = args.project_id or os.environ.get("SUPABASE_PROJECT_ID") or read_project_id_from_repo()
    if not project_id:
        print("Error: SUPABASE project id not found. Set SUPABASE_PROJECT_ID env var or add utils/supabase/info.tsx")
        return

    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    base = build_functions_base(project_id, "server")

    cadets = []
    # Prefer PostgREST KV table when service key available to avoid Functions auth issues
    if api_key:
        kv_rows = fetch_kv_table_postgrest(project_id, "kv_store_73a3871f", api_key, prefix="cadet:")
        if kv_rows:
            for r in kv_rows:
                val = r.get("value")
                try:
                    cadets.append(json.loads(val))
                except Exception:
                    cadets.append({"id": r.get("key"), "name": val})

    if not cadets:
        cadets = fetch_cadets_functions(base, api_key)

    # Leaderboards and attendance (try functions; service key used if available)
    leaderboards = fetch_leaderboards_functions(base, api_key)
    attendance = fetch_attendance_functions(base, api_key)

    # Points: try to get points via functions route
    points = []
    pts_resp = try_endpoints(base, ["make-server-73a3871f/points", "points"], api_key)
    if isinstance(pts_resp, dict) and "points" in pts_resp:
        points = pts_resp["points"] or []
    elif isinstance(pts_resp, list):
        points = pts_resp

    # Write CSVs
    rows_to_csv(cadets, out_dir / "cadets.csv")

    # leaderboards may contain arrays
    if isinstance(leaderboards, dict):
        cadet_lb = leaderboards.get("cadetLeaderboard") or leaderboards.get("cadetLeaderboard")
        flight_lb = leaderboards.get("flightLeaderboard")
        if cadet_lb:
            rows_to_csv(cadet_lb, out_dir / "leaderboards_cadets.csv")
        if flight_lb:
            rows_to_csv(flight_lb, out_dir / "leaderboards_flights.csv")
    else:
        print("No leaderboards data")

    rows_to_csv(attendance, out_dir / "attendance.csv")
    rows_to_csv(points, out_dir / "points.csv")


if __name__ == "__main__":
    main()

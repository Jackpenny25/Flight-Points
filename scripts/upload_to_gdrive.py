#!/usr/bin/env python3
"""Upload CSV files from outputs/ to Google Drive using a Service Account.

Usage:
  Provide these GitHub Actions secrets or environment variables:
    - GDRIVE_SERVICE_ACCOUNT_JSON: full JSON content of the service account key
    - GDRIVE_FOLDER_ID: (optional) Drive folder ID to upload into

How to create service account and folder (short):
  1. In Google Cloud Console create a project (or use existing).
  2. Enable Drive API for the project.
  3. Create a Service Account and generate a JSON key (store safely).
  4. Create a folder in Google Drive, note its folder id from the URL.
  5. Share that folder with the service account email (role: Editor).
  6. Store the JSON file content as GitHub secret `GDRIVE_SERVICE_ACCOUNT_JSON` and the folder id as `GDRIVE_FOLDER_ID`.

Security: Do NOT commit service account JSON into the repo. Use GitHub Secrets.
"""
from __future__ import annotations
import os
import json
from pathlib import Path
from typing import Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


def load_credentials_from_env() -> Optional[service_account.Credentials]:
    sa_json = os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        print("Error: GDRIVE_SERVICE_ACCOUNT_JSON not set")
        return None
    try:
        info = json.loads(sa_json)
        creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/drive"])
        return creds
    except Exception as e:
        print(f"Error parsing service account JSON: {e}")
        return None


def upload_file(service, file_path: Path, folder_id: Optional[str] = None):
    metadata = {"name": file_path.name}
    if folder_id:
        metadata["parents"] = [folder_id]
    media = MediaFileUpload(str(file_path), mimetype="text/csv")
    created = service.files().create(body=metadata, media_body=media, fields="id,name,webViewLink").execute()
    return created


def main():
    out_dir = Path("outputs")
    if not out_dir.exists():
        print("No outputs/ directory found — nothing to upload")
        return

    creds = load_credentials_from_env()
    if not creds:
        return

    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    service = build("drive", "v3", credentials=creds)

    csvs = list(out_dir.glob("*.csv"))
    if not csvs:
        print("No CSV files found in outputs/")
        return

    for f in csvs:
        try:
            res = upload_file(service, f, folder_id)
            print(f"Uploaded {f.name} -> id={res.get('id')} link={res.get('webViewLink')}")
        except Exception as e:
            print(f"Failed to upload {f}: {e}")


if __name__ == "__main__":
    main()

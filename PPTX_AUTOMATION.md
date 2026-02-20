PPTX Automation - Python Prototype

Overview
- Script: scripts/generate_presentation.py
- Purpose: Read site JSON files (`data/attendance.json`, `data/cadets.json`) and generate a PowerPoint `outputs/cadets_presentation.pptx` with summary slides and charts.

Quick start (Windows)
1. Install Python 3.9+ and create a venv (optional):

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

2. Run the generator:

```powershell
python scripts/generate_presentation.py --data-dir data --output outputs/cadets_presentation.pptx
```

3. Output will be in `outputs/`.

Scheduling options
- Windows Task Scheduler: schedule the above command twice weekly.
- GitHub Actions: create a workflow that checks out the repo, installs Python, installs requirements, runs the script, and uploads the PPTX as an artifact or pushes to a storage location.
- Server cron: run the script on a server/VM twice weekly.

Server/local data workflow
- Use `scripts/generate_presentation.py` with JSON data files in `data/`.
- For scheduled automation, run the same command in GitHub Actions, Windows Task Scheduler, or cron.
 
Google Drive upload (GitHub Actions)
- To upload generated CSVs to Google Drive from GitHub Actions the workflow expects two repository secrets:
	- `GDRIVE_SERVICE_ACCOUNT_JSON`: the full JSON content of a Google Service Account key (store as a secret; do NOT commit to repo).
	- `GDRIVE_FOLDER_ID`: (optional) the Drive folder id to upload files into. If omitted the files will be uploaded to the service account's root.

Steps to create the service account and add secrets:
1. In Google Cloud Console create or select a project and enable the Drive API.
2. Create a Service Account. In the Service Account details create a key (JSON) and download it.
3. Create a folder in Google Drive and copy its folder id from the URL.
4. Share the Drive folder with the service account email (Grant Editor permission).
5. In your GitHub repo go to Settings → Secrets → Actions → New repository secret and add:
	 - `GDRIVE_SERVICE_ACCOUNT_JSON`: paste the entire JSON key file content.
	 - `GDRIVE_FOLDER_ID`: paste the folder id (or leave blank in the workflow if you prefer root upload).

The included workflow `.github/workflows/generate-presentation.yml` now runs `scripts/upload_to_gdrive.py` after CSVs are generated and reads these secrets at runtime. Check the Action logs for printed `webViewLink` entries to confirm files uploaded successfully.

Quick note — download from website
- There is now a "Download CSV" button in the site's top navigation which downloads `cadets.csv` (derived from `data/cadets.json`). Use this to quickly get cadet data for importing into Excel.

Customization
- The script can be extended to add extra slides, inject images, or use a template PPTX as a starting point.
- See `scripts/generate_presentation.py` for where slides are created (functions `add_title_slide`, `add_text_slide`, `add_image_slide`, `add_table_slide`).

Next steps I can do for you
- Tweak the script to include additional slide types or custom text/images from a `templates/` folder.
- Add a GitHub Actions workflow to run the script on schedule and upload the PPTX to Google Drive / S3 / email.


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

Supabase (preferred) — using hosted data
- The repository includes Supabase function routes (the function is named `server`). The script `scripts/generate_presentation_supabase.py` calls your deployed Supabase Function endpoints to fetch `cadets` and `leaderboards`.
- For secure access to protected endpoints (leaderboards, attendance reports) set the following environment variable on the machine or CI runner where you run the script:
	- `SUPABASE_SERVICE_ROLE_KEY` (service role key) — do NOT commit this to source control.
- Optionally set `SUPABASE_PROJECT_ID` if you don't want the script to read it from `utils/supabase/info.tsx`.

Example (Windows PowerShell):

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<your-service-role-key>"
python scripts/generate_presentation_supabase.py --output outputs/cadets_presentation_supabase.pptx
```

Notes
- If `SUPABASE_SERVICE_ROLE_KEY` is not provided the script will try public endpoints (may return fewer metrics).
- For fully automated runs, save the service role key as a secret in GitHub Actions / your scheduler and run the script on schedule.

Customization
- The script can be extended to add extra slides, inject images, or use a template PPTX as a starting point.
- See `scripts/generate_presentation.py` for where slides are created (functions `add_title_slide`, `add_text_slide`, `add_image_slide`, `add_table_slide`).

Next steps I can do for you
- Tweak the script to include additional slide types or custom text/images from a `templates/` folder.
- Add a GitHub Actions workflow to run the script on schedule and upload the PPTX to Google Drive / S3 / email.


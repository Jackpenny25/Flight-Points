
I DONT USE SUPABASE ANYMORE. I USE A POSTGRES DATABASE INSTEAD ON A SERVER. I HAVE ACCESS TO THE DATABASE AND CAN MAKE CHANGES TO IT IF NEEDED. WHICH IS A POSTGRES DATABASE WHERE I MAINLY USE DBEAVER TO MANAGE IT.

Please frequently update your knowledge of the project based on the information I give you. And add it to the botom of this file. This will help you understand the project better and make it easier for you to assist me with it.

If you can do as much as possible without human input, do so. But when in doubt, ask the human for clarification.

make it clear when you are unsure about something or need more info.

make it clear when you want me to do something.

For termnial commands i use the built in vs studio code terminal. Which is normally powershell

Im not very good with coding so please explain things in simple terms.

When possible explain what and where im supposed to do something

I give you full permission to make changes to files in this repo. You do not need to ask me for permission first.

The webstie is now run locally on a server where I have wireless connection too. I normally use my computer where I am connected to the server to make changes to the code. There is a database that is connected to the server that the website uses. I have access to the database and can make changes to it if needed. which is a Postgres Database where i mainly use Dbeaver to manage it. 

I use Deploy.bat to download the latest code from the repo to the server. Which also restarts the server and updates the website. I can also use Deploy.bat to update the code on the server after making changes to the code on my computer.


I DONT USE SUPABASE ANYMORE. I USE A POSTGRES DATABASE INSTEAD ON A SERVER. I HAVE ACCESS TO THE DATABASE AND CAN MAKE CHANGES TO IT IF NEEDED. WHICH IS A POSTGRES DATABASE WHERE I MAINLY USE DBEAVER TO MANAGE IT.

LATEST PROJECT NOTES (2026-02-23):
- Backend should load environment values from .env.local (not .env.example).
- PostgreSQL SSL mode for local server should be non-SSL (PGSSLMODE=disable) unless explicitly needed.
- Admin PIN is env-based and must be exactly 6 digits in .env.local.
- Admin PIN verification is server-side and restricted to lead roles.
- Use Deploy.bat to pull latest code and restart the Flight-Points service on the server.
- DBeaver timeout check: db.flightpoints.uk currently resolves to Cloudflare IPs and direct TCP to 5432/5433 from local PC fails.
- If using Cloudflare Tunnel for Postgres, connect DBeaver to localhost via cloudflared access tcp; direct host:port to db.flightpoints.uk may timeout.
- Cloudflared ingress rule order matters: the catch-all fallback (service: http_status:404) must be the final rule, otherwise later hostnames (like db.flightpoints.uk) will never match.
- In PowerShell, run local executables from current folder with .\cloudflared.exe (not cloudflared) unless the folder is added to PATH.
- Any cloudflared ingress rule missing hostname/path is a catch-all; only one catch-all should exist and it must be the last rule.
- For cloudflared 2026.x, pass --config before subcommands: `cloudflared tunnel --config <file> ingress validate` and `cloudflared tunnel --config <file> run <tunnel-id>`.
- To use `cloudflared access tcp` from a local PC, cloudflared must be installed on that local PC (or run via full path to cloudflared.exe if not in PATH).
- On some Windows installs via winget, cloudflared may be at C:\Program Files (x86)\cloudflared\cloudflared.exe; use full path or open a new PowerShell session to refresh PATH.
- `cloudflared access tcp --hostname db.flightpoints.uk --url localhost:6543` is expected to stay running and show `Start Websocket listener`; in DBeaver, connect to localhost:6543 while it runs.
- Local PC test confirmed listener on localhost:6543 (TcpTestSucceeded=True) while cloudflared access tcp is running.
- App database credentials are configured in the project root .env.local via DATABASE_URL (backend loads .env.local).

LATEST PROJECT NOTES (2026-02-23 - migration audit):
- Project stack is local/server-first: PostgreSQL on server, backend reads .env.local, and deployment is performed with Deploy.bat on the local/squadron server.
- Removed legacy GitHub Pages deployment workflow from the repo to avoid accidental cloud deploys.
- Removed GitHub Pages-specific metadata/comment references from package.json and vite.config.ts.
- Privacy policy text should describe server/infrastructure providers generically (not GitHub Pages) and must not mention RAF or Biggin Hill.

LATEST PROJECT NOTES (2026-02-23 - local cloudflared setup):
- If `cloudflared` shows `CommandNotFoundException` right after a successful winget install, the current PowerShell session likely has stale PATH.
- Fix by either opening a new PowerShell window or running with full path and call operator: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" access tcp --hostname db.flightpoints.uk --url localhost:6543`.
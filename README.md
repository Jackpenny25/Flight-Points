# RAF Cadet Squadron — Flight Points (Private)

WARNING: This repository is private and intended for the repository owner only. Do NOT run, deploy, fork, clone, or share this project or its data unless you are explicitly authorised by the repository owner.

If you are not the repository owner or authorised maintainer:

- Do not attempt to run or deploy this software.
- Do not use any included credentials, sample data, or instructions.
- Do not share or distribute this repository or any of its contents.

Authorized maintainers only: contact the repository owner for guidance and explicit permission before taking any action.

Repository owner: Jack Penny — add an official contact email in the repo when ready.

Security notes:

- Store any sensitive runtime secrets (like the admin PIN) in a local `.env` file and do NOT commit it.
- Create a `.env` file from `.env.example` and add `.env` to your `.gitignore` so secrets don't get committed.
- The application reads the admin PIN from `VITE_ADMIN_PIN` (available client-side). Prefer using authenticated admin accounts instead of a shared PIN where possible.

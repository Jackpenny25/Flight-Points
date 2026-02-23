
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
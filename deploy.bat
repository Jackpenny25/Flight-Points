@echo off
cd /d C:\Users\Admin\Desktop\Flight-Points\Code\Flight-Points
git pull
npm install
npm run build
net stop cadet-website
net start cadet-website

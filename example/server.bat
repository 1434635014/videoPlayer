@echo off
title ydplayer-example
node -v
if NOT "%ERRORLEVEL%"=="0" GOTO NODEJSNOTFOUND
@echo on
node server
GOTO END

:NODEJSNOTFOUND
echo NodeJS is not found. please install nodejs first: https://nodejs.org/
pause

:END
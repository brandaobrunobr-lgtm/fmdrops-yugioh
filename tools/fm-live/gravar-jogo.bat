@echo off
rem FMDrops - abre o OBS na cena do jogo. O iniciar-live.bat (programa da live)
rem comeca um video quando cada duelo comeca e para depois do resultado e dos drops.
rem Videos na pasta Videos, com o nome do oponente e o resultado.
rem Para gravar tudo sem parar (sem um video por duelo), use: gravar-jogo.bat continuo
set "OBS=C:\Program Files\obs-studio\bin\64bit"
if not exist "%OBS%\obs64.exe" (echo OBS nao encontrado em %OBS% & pause & exit /b 1)
set "EXTRA="
if /i "%~1"=="continuo" set "EXTRA=--startrecording"
cd /d "%OBS%"
start "" obs64.exe --profile FMDrops --collection FMDrops --disable-shutdown-check --minimize-to-tray %EXTRA%

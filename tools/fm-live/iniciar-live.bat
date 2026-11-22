@echo off
rem FMDrops - ponte do jogo para o painel de live. Deixe esta janela aberta.
title FMDrops live
cd /d "%~dp0"
where py >nul 2>nul && (py -3 -I fmlive.py %*) || (python -I fmlive.py %*)
pause

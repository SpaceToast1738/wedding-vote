@echo off
REM ============================================================
REM  One-shot git setup for the wedding-vote project.
REM  Safe to re-run: it just stops if .git already has commits.
REM  Delete this file after the initial push if you like.
REM ============================================================

setlocal
cd /d "%~dp0"

echo.
echo === Cleaning any half-initialised .git directory ===
if exist .git (
    rmdir /s /q .git 2>nul
    if exist .git (
        echo  ! Could not remove .git — close any program that has it open and re-run.
        pause
        exit /b 1
    )
)

echo.
echo === git init ===
git init -b main || goto :err

git config user.email "jspencer1706@outlook.com"
git config user.name  "Jamie Spencer"

echo.
echo === git add . ===
git add . || goto :err

echo.
echo === git commit ===
git commit -m "Initial commit: wedding vote app" -m "Self-hosted Fastify + SQLite vote app for picking the flower girl dress. Anonymised totals visible to all; voter names + comments revealed only after you've cast your own vote (server-enforced). Multi-arch Docker image via GitHub Actions -> GHCR. Designed for Unraid + Cloudflare Tunnel." || goto :err

echo.
echo === setting remote ===
git remote remove origin 2>nul
git remote add origin https://github.com/SpaceToast1738/wedding-vote.git || goto :err

echo.
echo === pushing to GitHub (you may be prompted to log in) ===
git push -u origin main || goto :err

echo.
echo ============================================================
echo  DONE. The GitHub Action should now be building the image.
echo  Check it at:
echo    https://github.com/SpaceToast1738/wedding-vote/actions
echo ============================================================
echo.
pause
exit /b 0

:err
echo.
echo ============================================================
echo  Something went wrong. Check the messages above.
echo  Common fixes:
echo   - If the auth prompt failed, install GitHub CLI ("winget install GitHub.cli")
echo     then run "gh auth login" and re-run this script.
echo   - If the push was rejected because the repo isn't empty, the README/LICENSE
echo     might already exist on GitHub — pull first or force-push.
echo ============================================================
echo.
pause
exit /b 1

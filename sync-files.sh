#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# sync-files.sh — Git Bash wrapper for sync-files.ps1
# Usage:
#   ./sync-files.sh
#   ./sync-files.sh --server http://192.168.0.12:3000 --user admin --pass 1234 --path 'Z:\'
# ============================================================

SERVER_URL="http://192.168.0.12:3000"
USERNAME="admin"
PASSWORD="1234"
SCAN_PATH="Z:\\"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)
      SERVER_URL="${2:-}"
      shift 2
      ;;
    --user)
      USERNAME="${2:-}"
      shift 2
      ;;
    --pass)
      PASSWORD="${2:-}"
      shift 2
      ;;
    --path)
      SCAN_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./sync-files.sh [--server URL] [--user USER] [--pass PASS] [--path 'Z:\\']"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help to see available options."
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS1_PATH="$SCRIPT_DIR/sync-files.ps1"

if [[ ! -f "$PS1_PATH" ]]; then
  echo "sync-files.ps1 not found: $PS1_PATH"
  exit 1
fi

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "powershell.exe not found in PATH."
  echo "Run this script in Git Bash on Windows."
  exit 1
fi

echo ""
echo "Running sync via PowerShell..."
echo "  Server: $SERVER_URL"
echo "  User  : $USERNAME"
echo "  Path  : $SCAN_PATH"
echo ""

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PS1_PATH" \
  -ServerUrl "$SERVER_URL" \
  -Username "$USERNAME" \
  -Password "$PASSWORD" \
  -ScanPath "$SCAN_PATH"

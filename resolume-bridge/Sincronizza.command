#!/bin/bash
cd "$(dirname "$0")"
echo "=== Sincronizzazione Brasserie ==="
echo ""
npm run sync
echo ""
read -p "Premi INVIO per chiudere questa finestra..."

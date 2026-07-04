#!/bin/bash
cd "$(dirname "$0")"
echo "=== Applica config a Resolume (modalità Live) ==="
echo ""
npm run live
echo ""
read -p "Premi INVIO per chiudere questa finestra..."

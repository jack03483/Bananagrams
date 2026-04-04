#!/bin/bash
cd "$(dirname "$0")/public"
echo "Bananagrams running at http://localhost:3001"
echo "Press Ctrl+C to stop"
python3 -m http.server 3001

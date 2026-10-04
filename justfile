# Start the songbook at http://localhost:8000
serve:
    lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; sleep 0.2; python3 server.py & sleep 1; open http://localhost:8000; wait

# Start the songbook on a custom port
serve-port port='8080':
    lsof -tiTCP:{{port}} -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; sleep 0.2; python3 server.py --port {{port}} & sleep 1; open http://localhost:{{port}}; wait

# Make the server reachable from other devices on the local network
serve-lan:
    lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; sleep 0.2; python3 server.py --host 0.0.0.0 & sleep 1; open http://localhost:8000; wait

# Regenerate songs.json, Markdown songs, and README.md from Guitar Tabs/*.docx
generate:
    python3 convert.py

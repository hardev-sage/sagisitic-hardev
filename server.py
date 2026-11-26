```python
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer

DB_PATH = "sagisitic_hardev.db"
ALLOWED_CATEGORIES = {"builds", "bugs", "cybersec", "memes"}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS feed_posts (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            author TEXT NOT NULL,
            time TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT,
            body TEXT NOT NULL,
            code TEXT,
            image TEXT
        )
    """)
    conn.commit()
    conn.close()


class APIHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/api/feed":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM feed_posts ORDER BY rowid DESC LIMIT 50").fetchall()
            conn.close()

            posts = []
            for r in rows:
                item = dict(r)
                item["reactions"] = {"🚀": 1}
                posts.append(item)
            self._send_json(200, posts)
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        data = json.loads(raw_body)

        if self.path == "/api/auth":
            username = data.get("username", "").strip()
            email = data.get("email", "").strip()
            if not username or not email:
                self._send_json(400, {"error": "Username and email required"})
                return

            conn = sqlite3.connect(DB_PATH)
            conn.execute(
                "INSERT OR IGNORE INTO users (username, email) VALUES (?, ?)",
                (username, email)
            )
            conn.commit()
            conn.close()
            self._send_json(200, {"status": "authenticated", "username": username})
            return

        if self.path == "/api/feed":
            category = data.get("category", "")
            if category not in ALLOWED_CATEGORIES:
                self._send_json(400, {"error": "Invalid feed pillar"})
                return

            conn = sqlite3.connect(DB_PATH)
            conn.execute("""
                INSERT OR REPLACE INTO feed_posts
                (id, category, author, time, title, link, body, code, image)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get("id"),
                category,
                data.get("author", "@Ghost_Engineer"),
                data.get("time", "Just now"),
                data.get("title", ""),
                data.get("link", ""),
                data.get("body", ""),
                data.get("code", ""),
                data.get("image")
            ))
            conn.commit()
            conn.close()
            self._send_json(201, {"status": "published"})
            return

        self._send_json(404, {"error": "Unknown route"})


if __name__ == "__main__":
    init_db()
    server = HTTPServer(("127.0.0.1", 5000), APIHandler)
    print("Python Feed & Auth Server listening on http://127.0.0.1:5000")
    server.serve_forever()
```

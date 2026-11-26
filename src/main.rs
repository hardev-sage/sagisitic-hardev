```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Clone, Debug)]
struct EncryptedPacket {
    raw_json: String,
}

fn handle_client(mut stream: TcpStream, ledger: Arc<Mutex<Vec<EncryptedPacket>>>) {
    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let first_line = request.lines().next().unwrap_or("");

    let cors_headers = "HTTP/1.1 200 OK\r\n\
        Content-Type: application/json\r\n\
        Access-Control-Allow-Origin: *\r\n\
        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
        Access-Control-Allow-Headers: Content-Type\r\n\r\n";

    if first_line.starts_with("OPTIONS") {
        let _ = stream.write_all(cors_headers.as_bytes());
        return;
    }

    if first_line.starts_with("GET /health") {
        let count = ledger.lock().map(|l| l.len()).unwrap_or(0);
        let body = format!("{{\"status\":\"rust_e2ee_relay_online\",\"packets_relayed\":{}}}", count);
        let response = format!("{}{}", cors_headers, body);
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    if first_line.starts_with("POST /relay") {
        if let Some(body_start) = request.find("\r\n\r\n") {
            let payload = request[body_start + 4..].trim().to_string();
            if let Ok(mut store) = ledger.lock() {
                store.push(EncryptedPacket { raw_json: payload });
            }
        }
        let response = format!("{}{{\"relayed\":true}}", cors_headers);
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    let not_found = "HTTP/1.1 404 NOT FOUND\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
    let _ = stream.write_all(not_found.as_bytes());
}

fn main() {
    let addr = "127.0.0.1:8080";
    let listener = TcpListener::bind(addr).expect("Failed to bind Rust relay port 8080");
    let ledger: Arc<Mutex<Vec<EncryptedPacket>>> = Arc::new(Mutex::new(Vec::new()));

    println!("Rust Zero-Knowledge Chat Relay running on http://{}", addr);

    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            let ledger_ref = Arc::clone(&ledger);
            thread::spawn(move || {
                handle_client(stream, ledger_ref);
            });
        }
    }
}
```

---

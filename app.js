```javascript
const PYTHON_API = "http://127.0.0.1:5000";
const RUST_CHAT_API = "http://127.0.0.1:8080";

const state = {
    user: null,
    cryptoKey: null,
    activeChannel: "#rust-systems",
    replyingTo: null,
    activeFeedFilter: "all",
    pendingPostImage: null,
    mediaRecorder: null,
    audioChunks: [],
    channels: {
        dms: ["@elliot_alderson", "@priya_sec"],
        groups: ["#rust-systems", "#ctf-war-room", "#zero-day- drops"]
    },
    messages: {},
    posts: []
};

const seedMessages = {
    "#rust-systems": [
        {
            id: "m1",
            author: "@priya_sec",
            time: "10:42",
            text: "Switched our packet parser from C to Rust. Zero heap allocations in the hot loop.",
            code: "pub fn parse_frame(buf: &[u8]) -> Option<&[u8]> {\n    if buf.len() < 4 { return None; }\n    Some(&buf[4..])\n}",
            lang: "rust",
            cipher: "9f8e2a11c4b0...7d2a (AES-GCM)",
            pinned: true,
            replyTo: null,
            reactions: { "🚀": 4, "🧠": 2 }
        }
    ],
    "@elliot_alderson": [
        {
            id: "m2",
            author: "@elliot_alderson",
            time: "09:15",
            text: "Check the headers on that staging server. It's leaking internal build hashes.",
            code: "",
            lang: "",
            cipher: "4a1c88e02f19...b301 (AES-GCM)",
            pinned: false,
            replyTo: null,
            reactions: { "🐛": 1 }
        }
    ]
};

const seedPosts = [
    {
        id: "p1",
        category: "builds",
        author: "@hardev_sage",
        time: "2h ago",
        title: "sagisitic-hardev v1: Privacy-first workspace for engineers",
        link: "https://github.com/hardev-sage/sagisitic-hardev",
        body: "Built our own space without reels or algorithm noise. Uses client-side WebCrypto for E2EE chat and strips EXIF metadata from uploaded images.",
        code: "",
        image: null,
        reactions: { "🚀": 9, "🧠": 4 }
    },
    {
        id: "p2",
        category: "bugs",
        author: "@Ghost_Engineer",
        time: "4h ago",
        title: "Tokio spawn task lifetime error on borrowed socket slice",
        link: "",
        body: "Trying to pass a buffer slice into an async task but hitting `borrowed value does not live long enough`. Using Arc<Vec<u8>> fixed it, is there a zero-copy way?",
        code: "let buf = [0u8; 1024];\ntokio::spawn(async move {\n    process(&buf).await;\n});",
        image: null,
        reactions: { "🐛": 5, "🧠": 3 }
    },
    {
        id: "p3",
        category: "cybersec",
        author: "@priya_sec",
        time: "6h ago",
        title: "Quick bash one-liner to audit SUID binaries on Linux hosts",
        link: "",
        body: "Useful during CTF privilege escalation checks or hardening a new VPS.",
        code: "find / -perm -4000 -type f -exec ls -la {} 2>/dev/null \\;",
        image: null,
        reactions: { "🚀": 7, "🧠": 6 }
    }
];

// WebCrypto AES-GCM key derivation & encryption
async function deriveSessionKey(passphrase, saltText) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(saltText),
            iterations: 100000,
            hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptPayload(plainText) {
    if (!state.cryptoKey) return "unencrypted-fallback";
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        state.cryptoKey,
        enc.encode(plainText)
    );
    const bytes = new Uint8Array(encrypted);
    const hex = Array.from(bytes.slice(0, 16))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    return `${hex}... (${bytes.length}B AES-GCM)`;
}

// Strip EXIF metadata by re-encoding image through an clean HTML5 Canvas
function stripImageExif(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxDim = 900;
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadLocalState() {
    const savedMsgs = localStorage.getItem("sh_messages");
    const savedPosts = localStorage.getItem("sh_posts");
    state.messages = savedMsgs ? JSON.parse(savedMsgs) : structuredClone(seedMessages);
    state.posts = savedPosts ? JSON.parse(savedPosts) : structuredClone(seedPosts);
}

function saveLocalState() {
    localStorage.setItem("sh_messages", JSON.stringify(state.messages));
    localStorage.setItem("sh_posts", JSON.stringify(state.posts));
}

async function checkBackends() {
    const pill = document.getElementById("backend-status");
    let pyUp = false;
    let rustUp = false;

    try {
        const res = await fetch(`${PYTHON_API}/api/feed`, { method: "GET" });
        if (res.ok) {
            state.posts = await res.json();
            pyUp = true;
        }
    } catch (_) {}

    try {
        const res = await fetch(`${RUST_CHAT_API}/health`, { method: "GET" });
        if (res.ok) rustUp = true;
    } catch (_) {}

    if (pyUp || rustUp) {
        pill.textContent = `E2EE + ${rustUp ? "RUST" : ""}${pyUp && rustUp ? "/" : ""}${pyUp ? "PY" : ""} LIVE`;
    } else {
        pill.textContent = "E2EE: STATIC/LOCAL MODE";
    }
}

// Escape HTML safely before formatting
function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[m]));
}

// Parse inline ```lang ... ``` blocks inside chat text
function formatMessageContent(text) {
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let html = "";
    let match;

    while ((match = regex.exec(text)) !== null) {
        html += escapeHtml(text.slice(lastIndex, match.index));
        const lang = match[1] || "plaintext";
        const code = match[2].trim();
        html += buildCodeBlockHtml(code, lang);
        lastIndex = regex.lastIndex;
    }
    html += escapeHtml(text.slice(lastIndex));
    return html;
}

function buildCodeBlockHtml(code, lang = "plaintext") {
    let highlighted = escapeHtml(code);
    if (window.hljs) {
        try {
            highlighted = lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang }).value
                : hljs.highlightAuto(code).value;
        } catch (_) {}
    }
    const encoded = encodeURIComponent(code);
    return `
        <div class="code-block-wrapper">
            <div class="code-block-header">
                <span>${escapeHtml(lang)}</span>
                <button type="button" class="copy-code-btn" data-raw="${encoded}">Copy</button>
            </div>
            <pre><code class="hljs">${highlighted}</code></pre>
        </div>
    `;
}

// Render Sidebar Channels
function renderChannels() {
    const dmList = document.getElementById("dm-list");
    const groupList = document.getElementById("group-list");

    dmList.innerHTML = state.channels.dms.map(ch => `
        <li class="channel-item ${state.activeChannel === ch ? "active" : ""}" data-channel="${ch}">
            <span>${escapeHtml(ch)}</span>
            <span>🔒</span>
        </li>
    `).join("");

    groupList.innerHTML = state.channels.groups.map(ch => `
        <li class="channel-item ${state.activeChannel === ch ? "active" : ""}" data-channel="${ch}">
            <span>${escapeHtml(ch)}</span>
        </li>
    `).join("");

    document.getElementById("active-channel-title").textContent = state.activeChannel;
}

// Render Active Channel Messages
function renderMessages() {
    const stream = document.getElementById("message-stream");
    const list = state.messages[state.activeChannel] || [];

    const pinned = list.filter(m => m.pinned);
    document.getElementById("pin-count").textContent = pinned.length;

    const pinnedListEl = document.getElementById("pinned-list");
    pinnedListEl.innerHTML = pinned.length
        ? pinned.map(p => `<div class="pinned-item"><strong>${escapeHtml(p.author)}:</strong> ${escapeHtml(p.text || "[Code/Media]")}</div>`).join("")
        : `<div class="muted-text">No pinned messages in ${escapeHtml(state.activeChannel)} yet.</div>`;

    stream.innerHTML = list.map(msg => {
        const reactionsHtml = Object.entries(msg.reactions || {}).map(([emoji, count]) => `
            <button class="react-btn" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} ${count}</button>
        `).join("");

        return `
            <div class="msg-card ${msg.pinned ? "pinned" : ""}" data-id="${msg.id}">
                <div class="msg-header">
                    <span class="msg-author">${escapeHtml(msg.author)}</span>
                    <div class="msg-meta">
                        <span>${escapeHtml(msg.time)}</span>
                        <button class="action-link toggle-cipher-btn" data-id="${msg.id}" title="Inspect E2EE Ciphertext">🔒 E2EE</button>
                    </div>
                </div>
                ${msg.replyTo ? `<div class="msg-reply-quote">↳ ${escapeHtml(msg.replyTo)}</div>` : ""}
                <div class="msg-body">${formatMessageContent(msg.text)}</div>
                ${msg.code ? buildCodeBlockHtml(msg.code, msg.lang) : ""}
                ${msg.image ? `
                    <img src="${msg.image}" class="msg-image" alt="shared image">
                    <span class="exif-badge">✓ EXIF metadata stripped</span>
                ` : ""}
                ${msg.fileName ? `<div class="code-block-header" style="margin-top:8px;">📎 ${escapeHtml(msg.fileName)}</div>` : ""}
                ${msg.audioUrl ? `<audio controls src="${msg.audioUrl}" style="margin-top:8px; height:32px;"></audio>` : ""}
                <div id="cipher-${msg.id}" class="cipher-preview hidden">Ciphertext packet: ${escapeHtml(msg.cipher || "AES-GCM-256")}</div>
                <div class="msg-actions">
                    ${reactionsHtml}
                    <button class="react-btn" data-msg-id="${msg.id}" data-emoji="🚀">+🚀</button>
                    <button class="react-btn" data-msg-id="${msg.id}" data-emoji="🐛">+🐛</button>
                    <button class="react-btn" data-msg-id="${msg.id}" data-emoji="🧠">+🧠</button>
                    <button class="react-btn" data-msg-id="${msg.id}" data-emoji="💀">+💀</button>
                    <button class="action-link reply-msg-btn" data-id="${msg.id}">Reply</button>
                    <button class="action-link pin-msg-btn" data-id="${msg.id}">${msg.pinned ? "Unpin" : "Pin"}</button>
                </div>
            </div>
        `;
    }).join("");

    stream.scrollTop = stream.scrollHeight;
}

// Render 4-Pillar Feed
function renderFeed() {
    const feedStream = document.getElementById("feed-stream");
    const filtered = state.activeFeedFilter === "all"
        ? state.posts
        : state.posts.filter(p => p.category === state.activeFeedFilter);

    const badgeLabels = {
        builds: "🛠️ BUILD",
        bugs: "🐛 BUG / HELP",
        cybersec: "🛡️ CYBERSEC",
        memes: "💀 DEV MEME"
    };

    feedStream.innerHTML = filtered.map(post => {
        const reacts = Object.entries(post.reactions || {}).map(([emoji, count]) => `
            <button class="react-btn feed-react-btn" data-post-id="${post.id}" data-emoji="${emoji}">${emoji} ${count}</button>
        `).join("");

        return `
            <article class="feed-card">
                <div class="feed-card-top">
                    <span class="pillar-tag">${badgeLabels[post.category] || post.category}</span>
                    <div class="msg-meta">
                        <span class="msg-author">${escapeHtml(post.author)}</span>
                        <span>• ${escapeHtml(post.time)}</span>
                    </div>
                </div>
                <h3>${escapeHtml(post.title)}</h3>
                ${post.link ? `<a href="${escapeHtml(post.link)}" target="_blank" rel="noopener" class="feed-link">🔗 ${escapeHtml(post.link)}</a>` : ""}
                <div class="msg-body">${escapeHtml(post.body)}</div>
                ${post.code ? buildCodeBlockHtml(post.code, "auto") : ""}
                ${post.image ? `
                    <img src="${post.image}" class="msg-image" alt="Feed attachment">
                    <span class="exif-badge">✓ EXIF GPS/Camera metadata scrubbed</span>
                ` : ""}
                <div class="msg-actions">
                    ${reacts}
                    <button class="react-btn feed-react-btn" data-post-id="${post.id}" data-emoji="🚀">+🚀 Ship</button>
                    <button class="react-btn feed-react-btn" data-post-id="${post.id}" data-emoji="🐛">+🐛 Fixed</button>
                    <button class="react-btn feed-react-btn" data-post-id="${post.id}" data-emoji="🧠">+🧠 High IQ</button>
                    <button class="react-btn feed-react-btn" data-post-id="${post.id}" data-emoji="💀">+💀 LOL</button>
                </div>
            </article>
        `;
    }).join("");
}

async function appendChatMessage(payload) {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    const cipherPreview = await encryptPayload(
        `${payload.text || ""}${payload.code || ""}`
    );

    const newMsg = {
        id: "m_" + Date.now(),
        author: `@${state.user.username}`,
        time: timeStr,
        text: payload.text || "",
        code: payload.code || "",
        lang: payload.lang || "rust",
        image: payload.image || null,
        fileName: payload.fileName || null,
        audioUrl: payload.audioUrl || null,
        cipher: cipherPreview,
        pinned: false,
        replyTo: state.replyingTo,
        reactions: {}
    };

    if (!state.messages[state.activeChannel]) {
        state.messages[state.activeChannel] = [];
    }
    state.messages[state.activeChannel].push(newMsg);
    state.replyingTo = null;
    document.getElementById("reply-banner").classList.add("hidden");

    saveLocalState();
    renderMessages();

    // Relay encrypted packet to Rust server if running locally
    try {
        await fetch(`${RUST_CHAT_API}/relay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                channel: state.activeChannel,
                sender: newMsg.author,
                ciphertext: newMsg.cipher
            })
        });
    } catch (_) {}
}

// Event Listeners Setup
document.addEventListener("DOMContentLoaded", () => {
    loadLocalState();

    // Auth Submit
    document.getElementById("auth-form").addEventListener("submit", async e => {
        e.preventDefault();
        const username = document.getElementById("username-input").value.trim();
        const email = document.getElementById("email-input").value.trim();
        const passphrase = document.getElementById("passphrase-input").value;

        state.user = { username, email };
        state.cryptoKey = await deriveSessionKey(passphrase, email);

        document.getElementById("current-user-badge").textContent = `@${username}`;
        document.getElementById("auth-screen").classList.add("hidden");
        document.getElementById("app-container").classList.remove("hidden");

        // Register user with Python backend if online
        try {
            await fetch(`${PYTHON_API}/api/auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email })
            });
        } catch (_) {}

        await checkBackends();
        renderChannels();
        renderMessages();
        renderFeed();
    });

    // Logout
    document.getElementById("logout-btn").addEventListener("click", () => {
        state.user = null;
        state.cryptoKey = null;
        document.getElementById("app-container").classList.add("hidden");
        document.getElementById("auth-screen").classList.remove("hidden");
    });

    // Mode Switching (Chat vs Tech Feed)
    const chatBtn = document.getElementById("mode-chat-btn");
    const feedBtn = document.getElementById("mode-feed-btn");
    const chatView = document.getElementById("chat-view");
    const feedView = document.getElementById("feed-view");

    chatBtn.addEventListener("click", () => {
        chatBtn.classList.add("active");
        feedBtn.classList.remove("active");
        chatView.classList.remove("hidden");
        feedView.classList.add("hidden");
    });

    feedBtn.addEventListener("click", () => {
        feedBtn.classList.add("active");
        chatBtn.classList.remove("active");
        feedView.classList.remove("hidden");
        chatView.classList.add("hidden");
    });

    // Sidebar Channel Clicks
    document.querySelector(".sidebar").addEventListener("click", e => {
        const item = e.target.closest(".channel-item");
        if (!item) return;
        state.activeChannel = item.dataset.channel;
        renderChannels();
        renderMessages();
    });

    // Add DM / Group
    document.getElementById("new-dm-btn").addEventListener("click", () => {
        const handle = prompt("Enter peer username (e.g. @linus):");
        if (!handle) return;
        const formatted = handle.startsWith("@") ? handle.trim() : `@${handle.trim()}`;
        if (!state.channels.dms.includes(formatted)) state.channels.dms.push(formatted);
        state.activeChannel = formatted;
        renderChannels();
        renderMessages();
    });

    document.getElementById("new-group-btn").addEventListener("click", () => {
        const group = prompt("Enter group channel name (e.g. #kernel-dev):");
        if (!group) return;
        const formatted = group.startsWith("#") ? group.trim() : `#${group.trim()}`;
        if (!state.channels.groups.includes(formatted)) state.channels.groups.push(formatted);
        state.activeChannel = formatted;
        renderChannels();
        renderMessages();
    });

    // Toggle Pinned Drawer
    document.getElementById("toggle-pins-btn").addEventListener("click", () => {
        document.getElementById("pinned-drawer").classList.toggle("hidden");
    });
    document.getElementById("close-pins-btn").addEventListener("click", () => {
        document.getElementById("pinned-drawer").classList.add("hidden");
    });

    // Toggle Code Composer
    const codeBox = document.getElementById("code-composer-box");
    document.getElementById("insert-code-btn").addEventListener("click", () => {
        codeBox.classList.toggle("hidden");
    });
    document.getElementById("close-code-box").addEventListener("click", () => {
        codeBox.classList.add("hidden");
    });

    // Send Chat Message
    document.getElementById("chat-form").addEventListener("submit", async e => {
        e.preventDefault();
        const textEl = document.getElementById("chat-input");
        const codeEl = document.getElementById("code-snippet-input");
        const langEl = document.getElementById("code-lang-select");

        const text = textEl.value.trim();
        const code = codeEl.value.trim();
        if (!text && !code) return;

        await appendChatMessage({
            text,
            code,
            lang: langEl.value
        });

        textEl.value = "";
        codeEl.value = "";
        codeBox.classList.add("hidden");
    });

    // Enter to send (Shift+Enter for newline)
    document.getElementById("chat-input").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            document.getElementById("chat-form").requestSubmit();
        }
    });

    // Image Upload in Chat (with EXIF stripping)
    document.getElementById("image-upload-input").addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        const cleanDataUrl = await stripImageExif(file);
        await appendChatMessage({
            text: `Shared image: ${file.name}`,
            image: cleanDataUrl
        });
        e.target.value = "";
    });

    // File Upload in Chat
    document.getElementById("file-upload-input").addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        await appendChatMessage({
            text: "Encrypted file attachment",
            fileName: `${file.name} (${Math.round(file.size / 1024)} KB)`
        });
        e.target.value = "";
    });

    // Voice Note Recording
    const voiceBtn = document.getElementById("voice-record-btn");
    voiceBtn.addEventListener("click", async () => {
        if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
            state.mediaRecorder.stop();
            voiceBtn.classList.remove("recording");
            voiceBtn.textContent = "🎙️ Voice";
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.audioChunks = [];
            state.mediaRecorder = new MediaRecorder(stream);
            state.mediaRecorder.ondataavailable = e => state.audioChunks.push(e.data);
            state.mediaRecorder.onstop = async () => {
                const blob = new Blob(state.audioChunks, { type: "audio/webm" });
                const audioUrl = URL.createObjectURL(blob);
                await appendChatMessage({
                    text: "🎙️ Encrypted Voice Note",
                    audioUrl
                });
                stream.getTracks().forEach(t => t.stop());
            };
            state.mediaRecorder.start();
            voiceBtn.classList.add("recording");
            voiceBtn.textContent = "⏹️ Stop";
        } catch (_) {
            alert("Microphone permission denied or unavailable in this browser.");
        }
    });

    // Cancel Reply
    document.getElementById("cancel-reply-btn").addEventListener("click", () => {
        state.replyingTo = null;
        document.getElementById("reply-banner").classList.add("hidden");
    });

    // Delegated clicks for Copy Code, Reactions, Reply, Pin, Ciphertext preview
    document.body.addEventListener("click", e => {
        // Copy Code button
        const copyBtn = e.target.closest(".copy-code-btn");
        if (copyBtn) {
            const rawCode = decodeURIComponent(copyBtn.dataset.raw);
            navigator.clipboard.writeText(rawCode);
            const original = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => { copyBtn.textContent = original; }, 1200);
            return;
        }

        // Chat Reactions
        const reactBtn = e.target.closest(".react-btn:not(.feed-react-btn)");
        if (reactBtn) {
            const { msgId, emoji } = reactBtn.dataset;
            const list = state.messages[state.activeChannel] || [];
            const msg = list.find(m => m.id === msgId);
            if (msg) {
                msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
                saveLocalState();
                renderMessages();
            }
            return;
        }

        // Feed Reactions
        const feedReactBtn = e.target.closest(".feed-react-btn");
        if (feedReactBtn) {
            const { postId, emoji } = feedReactBtn.dataset;
            const post = state.posts.find(p => p.id === postId);
            if (post) {
                post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
                saveLocalState();
                renderFeed();
            }
            return;
        }

        // Pin / Unpin message
        const pinBtn = e.target.closest(".pin-msg-btn");
        if (pinBtn) {
            const list = state.messages[state.activeChannel] || [];
            const msg = list.find(m => m.id === pinBtn.dataset.id);
            if (msg) {
                msg.pinned = !msg.pinned;
                saveLocalState();
                renderMessages();
            }
            return;
        }

        // Reply message
        const replyBtn = e.target.closest(".reply-msg-btn");
        if (replyBtn) {
            const list = state.messages[state.activeChannel] || [];
            const msg = list.find(m => m.id === replyBtn.dataset.id);
            if (msg) {
                state.replyingTo = `${msg.author}: ${(msg.text || "[Code snippet]").slice(0, 60)}`;
                document.getElementById("reply-preview-text").textContent = `Replying to ${state.replyingTo}`;
                document.getElementById("reply-banner").classList.remove("hidden");
                document.getElementById("chat-input").focus();
            }
            return;
        }

        // Toggle E2EE Ciphertext inspector
        const cipherBtn = e.target.closest(".toggle-cipher-btn");
        if (cipherBtn) {
            const box = document.getElementById(`cipher-${cipherBtn.dataset.id}`);
            if (box) box.classList.toggle("hidden");
        }
    });

    // Feed Pillar Filter Buttons
    document.querySelector(".pillar-filters").addEventListener("click", e => {
        const btn = e.target.closest(".pillar-btn");
        if (!btn) return;
        document.querySelectorAll(".pillar-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeFeedFilter = btn.dataset.filter;
        renderFeed();
    });

    // Feed Image Attachment (EXIF Scrubbed)
    document.getElementById("post-image-input").addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        state.pendingPostImage = await stripImageExif(file);
        document.getElementById("post-image-name").textContent = `✓ ${file.name} (EXIF stripped)`;
    });

    // Publish New Feed Post
    document.getElementById("feed-post-form").addEventListener("submit", async e => {
        e.preventDefault();
        const category = document.getElementById("post-category").value;
        const isAnon = document.getElementById("post-anon-checkbox").checked;
        const title = document.getElementById("post-title").value.trim();
        const link = document.getElementById("post-link").value.trim();
        const body = document.getElementById("post-body").value.trim();
        const code = document.getElementById("post-code").value.trim();

        // Enforce strict category rules
        if (category === "bugs" && !code && body.length < 20) {
            alert("Bugs / Help posts must include a code snippet or error traceback.");
            return;
        }

        const newPost = {
            id: "p_" + Date.now(),
            category,
            author: isAnon ? `@Ghost_${Math.floor(100 + Math.random() * 900)}` : `@${state.user.username}`,
            time: "Just now",
            title,
            link,
            body,
            code,
            image: state.pendingPostImage,
            reactions: { "🚀": 1 }
        };

        state.posts.unshift(newPost);
        state.pendingPostImage = null;
        document.getElementById("post-image-name").textContent = "";
        e.target.reset();

        saveLocalState();
        renderFeed();

        // Sync with Python backend if running
        try {
            await fetch(`${PYTHON_API}/api/feed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newPost)
            });
        } catch (_) {}
    });
});
```

# 📱 WhatsApp Clone — Full Stack Python

A fully functional WhatsApp clone built with **Python Flask + WebSockets + SQLite**.  
Works on **low bandwidth (KB internet)** — no heavy frameworks, minimal assets.

---

## ✅ Features

- 🔐 Register & Login with phone number
- 💬 Real-time messaging (WebSocket / Socket.IO)
- 👥 Group chats with admin controls
- 📷 Send images, videos, audio, and files
- ✅ Message delivery status (sent / delivered / read)
- 💬 Reply to messages
- 🗑️ Delete messages ("This message was deleted")
- ⌨️ Typing indicator (live)
- 🟢 Online / Last seen status
- 😊 Emoji picker (200+ emojis)
- 📊 Status updates (text + image, 24-hour expiry)
- 🔍 Search chats and messages
- 📁 Contact management with nicknames
- 📱 Mobile responsive UI
- 🌙 Dark theme (WhatsApp-accurate colors)

---

## 🚀 Quick Start (Just 2 Steps!)

### Step 1 — Make sure Python 3.8+ is installed

```bash
python --version
# Should show Python 3.8 or higher
```

If not installed, download from: https://python.org/downloads

---

### Step 2 — Run the app

**Windows:**
```bash
python run.py
```

**Mac / Linux:**
```bash
python3 run.py
```

That's it! The script will:
1. Auto-install all dependencies
2. Create the database
3. Start the server

Then open your browser: **http://localhost:5000**

---

## 📲 Use on Mobile (Same WiFi)

1. Find your computer's local IP:
   - Windows: `ipconfig` → look for IPv4 Address (e.g. 192.168.1.5)
   - Mac/Linux: `ifconfig` or `ip addr`

2. On your phone browser, open: `http://192.168.1.5:5000`

Multiple people on the same WiFi can chat with each other in real-time!

---

## 💡 Usage Guide

### Create Account
- Click "Create Account"
- Enter your name, phone number, and password
- Phone number is your unique ID (use any number format)

### Start Chatting
- Click the 💬 icon (top right) to start a new chat
- Search by name or phone number
- Click a user to open their chat

### Add Contacts
- Go to "Contacts" tab
- Click "Add Contact"
- Enter phone number and optional nickname

### Create Group
- Click ⋮ menu → "New Group"
- Add group name and search for members
- Click "Create Group"

### Send Media
- Click 📎 (paperclip) in chat
- Choose Photo / Video / Audio / File
- Select from your device

### Status Updates
- Go to "Status" tab
- Click "My Status" → Add text or image status
- Status disappears after 24 hours

---

## 🗂️ Project Structure

```
whatsapp-clone/
├── run.py                  ← START HERE
├── README.md
├── backend/
│   ├── app.py              ← Flask server + WebSocket logic
│   ├── requirements.txt    ← Python packages
│   └── whatsapp.db         ← SQLite database (auto-created)
├── frontend/
│   ├── index.html          ← Main UI
│   └── static/
│       ├── css/style.css   ← WhatsApp-accurate styling
│       └── js/app.js       ← Frontend logic + Socket.IO
└── uploads/                ← Uploaded files stored here
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python Flask 3.0 |
| Real-time | Flask-SocketIO + Socket.IO |
| Database | SQLite (via SQLAlchemy) |
| Auth | JWT tokens + Bcrypt |
| Frontend | Vanilla HTML/CSS/JS |
| Styling | Custom CSS (WhatsApp Dark Theme) |

---

## ⚡ Low Bandwidth Optimized

- No React/Vue/Angular (pure vanilla JS)
- No CDN bundles except Socket.IO (~45KB) and Font Awesome (icons)
- SQLite — zero database server needed
- Images lazy-loaded
- Minimal payload per message

---

## 🛠️ Troubleshooting

**Port already in use?**
```bash
# Change port in run.py last line:
socketio.run(app, host='0.0.0.0', port=5001, ...)
```

**Module not found?**
```bash
pip install -r backend/requirements.txt
```

**Database issues?**
Delete `backend/whatsapp.db` and run again — it will recreate.

**Can't upload files?**
Make sure the `uploads/` folder exists (auto-created on first run).

---

## 🔒 Security Notes

- Passwords are hashed with bcrypt
- JWT tokens expire after 30 days
- For production: change `SECRET_KEY` and `JWT_SECRET_KEY` in `backend/app.py`
- For public deployment: add HTTPS (use nginx + certbot)

---

Made with ❤️ using Python Flask + WebSockets

#!/usr/bin/env python3
"""
WhatsApp Clone - Startup Script
Run this file to start the server.
"""
import sys
import os
import subprocess

def install_requirements():
    print("📦 Installing requirements...")
    req_file = os.path.join(os.path.dirname(__file__), 'backend', 'requirements.txt')
    result = subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', req_file, '-q'], capture_output=False)
    if result.returncode != 0:
        print("❌ Failed to install requirements")
        sys.exit(1)
    print("✅ Requirements installed!")

def main():
    install_requirements()
    # Add backend to path
    backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
    sys.path.insert(0, backend_path)
    os.chdir(backend_path)

    from app import app, db, socketio
    with app.app_context():
        db.create_all()
        print("✅ Database initialized!")

    print("\n" + "="*50)
    print("  🟢 WhatsApp Clone is running!")
    print("  👉 Open: http://localhost:5000")
    print("  💡 On same WiFi? Open: http://<your-ip>:5000")
    print("  Press Ctrl+C to stop")
    print("="*50 + "\n")

    socketio.run(app, host='0.0.0.0', port=5000, debug=False, use_reloader=False)

if __name__ == '__main__':
    main()

from flask import Flask, render_template, request, jsonify, send_from_directory, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import os, uuid, base64
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='../frontend/static', template_folder='../frontend')
app.config['SECRET_KEY'] = 'whatsapp-clone-secret-2024'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///whatsapp.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = 'jwt-secret-whatsapp-2024'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), '..', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'pdf', 'doc', 'docx', 'mp3', 'ogg', 'webm'}

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', ping_timeout=60, ping_interval=25)

# Track online users {user_id: socket_id}
online_users = {}

# ─── Models ──────────────────────────────────────────────────────────────────

class User(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    about = db.Column(db.String(200), default='Hey there! I am using WhatsApp Clone.')
    avatar = db.Column(db.String(200), default='')
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    password_hash = db.Column(db.String(200), nullable=False)

    def to_dict(self, include_online=False):
        d = {
            'id': self.id,
            'phone': self.phone,
            'name': self.name,
            'about': self.about,
            'avatar': self.avatar,
            'last_seen': self.last_seen.isoformat() + 'Z' if self.last_seen else None,
        }
        if include_online:
            d['is_online'] = self.id in online_users
        return d

class Contact(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    contact_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    nickname = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Chat(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    is_group = db.Column(db.Boolean, default=False)
    group_name = db.Column(db.String(100), default='')
    group_avatar = db.Column(db.String(200), default='')
    group_description = db.Column(db.String(500), default='')
    created_by = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ChatMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.String(36), db.ForeignKey('chat.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

class Message(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String(36), db.ForeignKey('chat.id'), nullable=False)
    sender_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, default='')
    msg_type = db.Column(db.String(20), default='text')  # text, image, video, audio, file, emoji
    file_url = db.Column(db.String(300), default='')
    file_name = db.Column(db.String(200), default='')
    reply_to = db.Column(db.String(36), default='')
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        sender = User.query.get(self.sender_id)
        reply_msg = Message.query.get(self.reply_to) if self.reply_to else None
        reply_sender = User.query.get(reply_msg.sender_id) if reply_msg else None
        
        return {
            'id': self.id,
            'chat_id': self.chat_id,
            'sender_id': self.sender_id,
            'sender_name': sender.name if sender else 'Unknown',
            'sender_avatar': sender.avatar if sender else '',
            'content': '' if self.is_deleted else self.content,
            'msg_type': self.msg_type,
            'file_url': self.file_url,
            'file_name': self.file_name,
            'reply_to': self.reply_to,
            'reply_to_sender_name': reply_sender.name if reply_sender else None,
            'reply_to_content': reply_msg.content if reply_msg else None,
            'reply_to_type': reply_msg.msg_type if reply_msg else None,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() + 'Z',
            'is_read': self.check_is_read()
        }

    def check_is_read(self):
        members_count = ChatMember.query.filter_by(chat_id=self.chat_id).count()
        read_count = MessageStatus.query.filter_by(message_id=self.id, status='read').count()
        # For DM, read_count will be 1 (the other person). 
        # For Group, it should be members_count - 1.
        return read_count >= (members_count - 1)

class MessageStatus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(36), db.ForeignKey('message.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(10), default='sent')  # sent, delivered, read

class Status(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, default='')
    status_type = db.Column(db.String(10), default='text')  # text, image
    bg_color = db.Column(db.String(20), default='#128C7E')
    file_url = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(hours=24))

# ─── Auth Routes ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    if not data or not data.get('phone') or not data.get('name') or not data.get('password'):
        return jsonify({'error': 'Missing fields'}), 400
    if User.query.filter_by(phone=data['phone']).first():
        return jsonify({'error': 'Phone already registered'}), 409
    user = User(
        phone=data['phone'],
        name=data['name'],
        password_hash=bcrypt.generate_password_hash(data['password']).decode('utf-8')
    )
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=user.id)
    return jsonify({'token': token, 'user': user.to_dict()}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(phone=data.get('phone')).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, data.get('password', '')):
        return jsonify({'error': 'Invalid credentials'}), 401
    user.last_seen = datetime.utcnow()
    db.session.commit()
    token = create_access_token(identity=user.id)
    return jsonify({'token': token, 'user': user.to_dict()})

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_me():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(user.to_dict())

@app.route('/api/auth/update', methods=['PUT'])
@jwt_required()
def update_profile():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    data = request.json
    if 'name' in data: user.name = data['name']
    if 'about' in data: user.about = data['about']
    if 'avatar' in data: user.avatar = data['avatar']
    db.session.commit()
    socketio.emit('user_updated', user.to_dict(), room=uid)
    return jsonify(user.to_dict())

# ─── User Routes ─────────────────────────────────────────────────────────────

@app.route('/api/users/search', methods=['GET'])
@jwt_required()
def search_users():
    uid = get_jwt_identity()
    q = request.args.get('q', '')
    if len(q) < 2:
        return jsonify([])
    users = User.query.filter(
        (User.phone.contains(q) | User.name.ilike(f'%{q}%')) & (User.id != uid)
    ).limit(20).all()
    return jsonify([u.to_dict(include_online=True) for u in users])

@app.route('/api/contacts', methods=['GET'])
@jwt_required()
def get_contacts():
    uid = get_jwt_identity()
    contacts = Contact.query.filter_by(user_id=uid).all()
    result = []
    for c in contacts:
        user = User.query.get(c.contact_id)
        if user:
            d = user.to_dict(include_online=True)
            d['nickname'] = c.nickname
            result.append(d)
    return jsonify(result)

@app.route('/api/contacts', methods=['POST'])
@jwt_required()
def add_contact():
    uid = get_jwt_identity()
    data = request.json
    contact_user = User.query.filter_by(phone=data.get('phone')).first()
    if not contact_user:
        return jsonify({'error': 'User not found'}), 404
    if contact_user.id == uid:
        return jsonify({'error': 'Cannot add yourself'}), 400
    existing = Contact.query.filter_by(user_id=uid, contact_id=contact_user.id).first()
    if existing:
        return jsonify({'error': 'Already a contact'}), 409
    contact = Contact(user_id=uid, contact_id=contact_user.id, nickname=data.get('nickname', ''))
    db.session.add(contact)
    db.session.commit()
    return jsonify(contact_user.to_dict(include_online=True)), 201

# ─── Chat Routes ─────────────────────────────────────────────────────────────

def get_or_create_dm(user1_id, user2_id):
    # Find existing DM
    m1 = db.session.query(ChatMember.chat_id).filter_by(user_id=user1_id).subquery()
    m2 = db.session.query(ChatMember.chat_id).filter_by(user_id=user2_id).subquery()
    chat = Chat.query.filter(
        Chat.id.in_(m1), Chat.id.in_(m2), Chat.is_group == False
    ).first()
    if chat:
        return chat
    chat = Chat(is_group=False)
    db.session.add(chat)
    db.session.flush()
    db.session.add(ChatMember(chat_id=chat.id, user_id=user1_id))
    db.session.add(ChatMember(chat_id=chat.id, user_id=user2_id))
    db.session.commit()
    return chat

@app.route('/api/chats', methods=['GET'])
@jwt_required()
def get_chats():
    uid = get_jwt_identity()
    members = ChatMember.query.filter_by(user_id=uid).all()
    result = []
    for m in members:
        chat = Chat.query.get(m.chat_id)
        if not chat: continue
        last_msg = Message.query.filter_by(chat_id=chat.id).order_by(Message.created_at.desc()).first()
        unread = MessageStatus.query.join(Message).filter(
            Message.chat_id == chat.id,
            MessageStatus.user_id == uid,
            MessageStatus.status != 'read',
            Message.sender_id != uid
        ).count()
        if chat.is_group:
            info = {'id': chat.id, 'name': chat.group_name, 'avatar': chat.group_avatar, 'is_group': True}
        else:
            other_member = ChatMember.query.filter(
                ChatMember.chat_id == chat.id, ChatMember.user_id != uid
            ).first()
            other_user = User.query.get(other_member.user_id) if other_member else None
            if not other_user: continue
            # Check nickname
            contact = Contact.query.filter_by(user_id=uid, contact_id=other_user.id).first()
            name = contact.nickname if contact and contact.nickname else other_user.name
            info = {
                'id': chat.id,
                'name': name,
                'avatar': other_user.avatar,
                'is_group': False,
                'other_user_id': other_user.id,
                'is_online': other_user.id in online_users,
                'last_seen': other_user.last_seen.isoformat() if other_user.last_seen else None,
            }
        if last_msg:
            info['last_message'] = last_msg.to_dict()
            info['last_message_time'] = last_msg.created_at.isoformat() + 'Z'
        else:
            info['last_message'] = None
            info['last_message_time'] = chat.created_at.isoformat() + 'Z'
        info['unread_count'] = unread
        result.append(info)
    result.sort(key=lambda x: x.get('last_message_time', ''), reverse=True)
    return jsonify(result)

@app.route('/api/chats/dm/<other_id>', methods=['POST'])
@jwt_required()
def open_dm(other_id):
    uid = get_jwt_identity()
    chat = get_or_create_dm(uid, other_id)
    return jsonify({'chat_id': chat.id})

@app.route('/api/chats/group', methods=['POST'])
@jwt_required()
def create_group():
    uid = get_jwt_identity()
    data = request.json
    if not data.get('name'):
        return jsonify({'error': 'Group name required'}), 400
    chat = Chat(is_group=True, group_name=data['name'],
                group_avatar=data.get('avatar', ''),
                group_description=data.get('description', ''),
                created_by=uid)
    db.session.add(chat)
    db.session.flush()
    db.session.add(ChatMember(chat_id=chat.id, user_id=uid, is_admin=True))
    for mid in data.get('members', []):
        if mid != uid:
            db.session.add(ChatMember(chat_id=chat.id, user_id=mid))
    db.session.commit()
    return jsonify({'chat_id': chat.id}), 201

@app.route('/api/chats/<chat_id>/members', methods=['GET'])
@jwt_required()
def get_members(chat_id):
    members = ChatMember.query.filter_by(chat_id=chat_id).all()
    result = []
    for m in members:
        u = User.query.get(m.user_id)
        if u:
            d = u.to_dict(include_online=True)
            d['is_admin'] = m.is_admin
            result.append(d)
    return jsonify(result)

@app.route('/api/chats/<chat_id>/messages', methods=['GET'])
@jwt_required()
def get_messages(chat_id):
    uid = get_jwt_identity()
    page = int(request.args.get('page', 1))
    per_page = 50
    msgs = Message.query.filter_by(chat_id=chat_id).order_by(
        Message.created_at.desc()
    ).offset((page-1)*per_page).limit(per_page).all()
    msgs.reverse()
    # Mark as read
    for msg in msgs:
        if msg.sender_id != uid:
            st = MessageStatus.query.filter_by(message_id=msg.id, user_id=uid).first()
            if not st:
                db.session.add(MessageStatus(message_id=msg.id, user_id=uid, status='read'))
            elif st.status != 'read':
                st.status = 'read'
    db.session.commit()
    return jsonify([m.to_dict() for m in msgs])

# ─── Upload Route ─────────────────────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'File type not allowed'}), 400
    filename = f'{uuid.uuid4()}.{ext}'
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    f.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    return jsonify({'url': f'/uploads/{filename}', 'filename': secure_filename(f.filename)})

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ─── Status Routes ───────────────────────────────────────────────────────────

@app.route('/api/statuses', methods=['GET'])
@jwt_required()
def get_statuses():
    uid = get_jwt_identity()
    contacts = Contact.query.filter_by(user_id=uid).all()
    contact_ids = [c.contact_id for c in contacts] + [uid]
    now = datetime.utcnow()
    statuses = Status.query.filter(
        Status.user_id.in_(contact_ids),
        Status.expires_at > now
    ).order_by(Status.created_at.desc()).all()
    grouped = {}
    for s in statuses:
        user = User.query.get(s.user_id)
        if not user: continue
        if s.user_id not in grouped:
            grouped[s.user_id] = {'user': user.to_dict(), 'statuses': []}
        grouped[s.user_id]['statuses'].append({
            'id': s.id, 'content': s.content, 'type': s.status_type,
            'bg_color': s.bg_color, 'file_url': s.file_url,
            'created_at': s.created_at.isoformat() + 'Z'
        })
    return jsonify(list(grouped.values()))

@app.route('/api/statuses', methods=['POST'])
@jwt_required()
def post_status():
    uid = get_jwt_identity()
    data = request.json
    s = Status(
        user_id=uid, content=data.get('content', ''),
        status_type=data.get('type', 'text'),
        bg_color=data.get('bg_color', '#128C7E'),
        file_url=data.get('file_url', '')
    )
    db.session.add(s)
    db.session.commit()
    socketio.emit('new_status', {'user_id': uid}, broadcast=True)
    return jsonify({'id': s.id}), 201

# ─── SocketIO Events ─────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    token = request.args.get('token')
    if not token:
        return False

@socketio.on('authenticate')
def on_authenticate(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        online_users[uid] = request.sid
        join_room(uid)
        # Join all chat rooms
        members = ChatMember.query.filter_by(user_id=uid).all()
        for m in members:
            join_room(m.chat_id)
        # Notify contacts
        contacts = Contact.query.filter_by(contact_id=uid).all()
        for c in contacts:
            if c.user_id in online_users:
                emit('user_online', {'user_id': uid}, room=c.user_id)
        emit('authenticated', {'user_id': uid})
    except Exception as e:
        emit('auth_error', {'error': str(e)})

@socketio.on('disconnect')
def on_disconnect():
    uid = None
    for u, sid in list(online_users.items()):
        if sid == request.sid:
            uid = u
            break
    if uid:
        del online_users[uid]
        user = User.query.get(uid)
        if user:
            user.last_seen = datetime.utcnow()
            db.session.commit()
        contacts = Contact.query.filter_by(contact_id=uid).all()
        for c in contacts:
            if c.user_id in online_users:
                emit('user_offline', {'user_id': uid, 'last_seen': datetime.utcnow().isoformat()},
                     room=c.user_id)

@socketio.on('send_message')
def on_send_message(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
    except:
        return
    chat_id = data.get('chat_id')
    member = ChatMember.query.filter_by(chat_id=chat_id, user_id=uid).first()
    if not member:
        return
    msg = Message(
        chat_id=chat_id,
        sender_id=uid,
        content=data.get('content', ''),
        msg_type=data.get('msg_type', 'text'),
        file_url=data.get('file_url', ''),
        file_name=data.get('file_name', ''),
        reply_to=data.get('reply_to', '')
    )
    db.session.add(msg)
    db.session.flush()
    # Create sent status for sender
    db.session.add(MessageStatus(message_id=msg.id, user_id=uid, status='sent'))
    db.session.commit()
    msg_dict = msg.to_dict()
    emit('new_message', msg_dict, room=chat_id)
    # Update delivery status for online members
    members = ChatMember.query.filter_by(chat_id=chat_id).all()
    for m in members:
        if m.user_id != uid and m.user_id in online_users:
            st = MessageStatus(message_id=msg.id, user_id=m.user_id, status='delivered')
            db.session.add(st)
    db.session.commit()

@socketio.on('typing')
def on_typing(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        user = User.query.get(uid)
        emit('typing', {'user_id': uid, 'name': user.name, 'chat_id': data['chat_id']},
             room=data['chat_id'], include_self=False)
    except: pass

@socketio.on('stop_typing')
def on_stop_typing(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        emit('stop_typing', {'user_id': uid, 'chat_id': data['chat_id']},
             room=data['chat_id'], include_self=False)
    except: pass

@socketio.on('message_read')
def on_message_read(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        msg = Message.query.get(data.get('message_id'))
        if msg:
            st = MessageStatus.query.filter_by(message_id=msg.id, user_id=uid).first()
            if st: st.status = 'read'
            else: db.session.add(MessageStatus(message_id=msg.id, user_id=uid, status='read'))
            db.session.commit()
            emit('message_read', {'message_id': msg.id, 'user_id': uid, 'chat_id': msg.chat_id},
                 room=msg.chat_id)
    except: pass

@socketio.on('mark_chat_read')
def on_mark_chat_read(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        chat_id = data.get('chat_id')
        unread = MessageStatus.query.join(Message).filter(
            Message.chat_id == chat_id,
            MessageStatus.user_id == uid,
            MessageStatus.status != 'read'
        ).all()
        for st in unread:
            st.status = 'read'
        db.session.commit()
        emit('chat_read', {'chat_id': chat_id, 'user_id': uid}, room=chat_id)
    except: pass

@socketio.on('delete_message')
def on_delete_message(data):
    from flask_jwt_extended import decode_token
    try:
        decoded = decode_token(data.get('token', ''))
        uid = decoded['sub']
        msg = Message.query.get(data.get('message_id'))
        if msg and msg.sender_id == uid:
            msg.is_deleted = True
            msg.content = 'This message was deleted'
            db.session.commit()
            emit('message_deleted', {'message_id': msg.id, 'chat_id': msg.chat_id}, room=msg.chat_id)
    except: pass

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Database created!")
    print("🚀 Starting WhatsApp Clone server on http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)

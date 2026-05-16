from flask import Flask, send_from_directory, request, jsonify, has_request_context
import sqlite3
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import urllib.request
import json as json_lib
import smtplib
import os
import threading
import uuid
import mimetypes
import socket
import shutil
import stat
import secrets
import string
import base64
import re
import io
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import firebase_admin
from firebase_admin import credentials, messaging, db as firebase_db
from werkzeug.utils import secure_filename
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# ============================================================
#  FIREBASE CONFIG
# ============================================================


FIREBASE_RTDB_URL = "https://crowd-ai2-default-rtdb.firebaseio.com"
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"
FIREBASE_ENABLED = False

if firebase_admin._apps:
    FIREBASE_ENABLED = True
elif os.path.exists(SERVICE_ACCOUNT_PATH):
    try:
        _fb_cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(_fb_cred, {"databaseURL": FIREBASE_RTDB_URL})
        FIREBASE_ENABLED = True
    except Exception as e:
        print(f"[Firebase init error] {e}")
else:
    print(f"[Firebase] {SERVICE_ACCOUNT_PATH} not found; Firebase features disabled.")

def firebase_sync(path, data, method='PUT'):
    """Write data to Firebase Realtime Database."""
    if not FIREBASE_ENABLED:
        return
    try:
        ref = firebase_db.reference(path)
        if method == 'PATCH':
            ref.update(data)
        else:
            ref.set(data)
    except Exception as e:
        print(f"[Firebase sync error] {e}")

def firebase_send_notification(title, body, event_id=None, user_ids=None):
    """Send FCM push notification to all registered tokens via HTTP v1 API."""
    if not FIREBASE_ENABLED:
        return
    try:
        allowed_user_ids = set(str(uid) for uid in user_ids) if user_ids is not None else None
        ref = firebase_db.reference('fcm_tokens')
        tokens_data = ref.get()
        if not tokens_data:
            return
        for uid, info in tokens_data.items():
            if allowed_user_ids is not None and str(uid) not in allowed_user_ids:
                continue
            token = info.get('token') if isinstance(info, dict) else info
            if not token:
                continue
            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={"event_id": str(event_id) if event_id else ""},
                token=token
            )
            try:
                messaging.send(message)
            except Exception:
                pass
    except Exception as e:
        print(f"[FCM notification error] {e}")

# ============================================================
#  EMAIL CONFIG
# ============================================================
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USER = os.environ.get('EMAIL_USER', 'analyzingcrowd@gmail.com').strip()
EMAIL_PASS = ''.join(str(os.environ.get('EMAIL_PASS', 'ypej qqxb dshj lcac')).split())
ACCOUNT_ALERT_EMAIL = os.environ.get('ACCOUNT_ALERT_EMAIL', 'danaalmadi41@gmail.com').strip().lower()
REVIEW_ACTION_EMAIL = os.environ.get('REVIEW_ACTION_EMAIL', ACCOUNT_ALERT_EMAIL).strip().lower()


def _send_email_worker(to_list, subject, html_body, attachments=None):
    """Send an HTML email to a list of addresses. Silently skips if not configured."""
    if not EMAIL_USER or not EMAIL_PASS:
        print("[Email] Not configured — skipping send.")
        return
    if not to_list:
        return
    try:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            for recipient in to_list:
                msg = MIMEMultipart('mixed')
                msg['Subject'] = subject
                msg['From'] = EMAIL_USER
                msg['To'] = recipient
                body_part = MIMEMultipart('alternative')
                body_part.attach(MIMEText(html_body, 'html'))
                msg.attach(body_part)

                for attachment in list(attachments or []):
                    file_path = str((attachment or {}).get('path', '')).strip()
                    if not file_path or not os.path.exists(file_path):
                        continue

                    download_name = str((attachment or {}).get('filename', '')).strip() or os.path.basename(file_path)
                    guessed_type = mimetypes.guess_type(download_name)[0] or 'application/octet-stream'
                    main_type, sub_type = guessed_type.split('/', 1)

                    with open(file_path, 'rb') as attachment_file:
                        mime_part = MIMEBase(main_type, sub_type)
                        mime_part.set_payload(attachment_file.read())

                    encoders.encode_base64(mime_part)
                    mime_part.add_header('Content-Disposition', f'attachment; filename="{download_name}"')
                    msg.attach(mime_part)

                server.sendmail(EMAIL_USER, recipient, msg.as_string())
        print(f"[Email] Sent '{subject}' to {len(to_list)} recipient(s).")
    except Exception as e:
        print(f"[Email error] {e}")


def send_email(to_list, subject, html_body, attachments=None):
    """Queue an HTML email in the background so requests return immediately."""
    worker = threading.Thread(
        target=_send_email_worker,
        args=(list(to_list or []), subject, html_body, list(attachments or [])),
        daemon=True
    )
    worker.start()


def build_account_email_recipients(*emails):
    recipients = []
    seen = set()
    for value in emails:
        normalized = str(value or '').strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        recipients.append(normalized)
    return recipients


def get_admin_recipient_emails():
    return build_account_email_recipients(
        ADMIN_EMAIL,
        ACCOUNT_ALERT_EMAIL,
        REVIEW_ACTION_EMAIL
    )


def get_primary_admin_email():
    recipients = get_admin_recipient_emails()
    return recipients[0] if recipients else ADMIN_EMAIL


def build_review_action_recipients():
    return get_admin_recipient_emails()


def get_crowd_alert_ticket_holders(event_id, cur):
    """Return ticket purchasers who allow crowd alerts."""
    cur.execute("""
        SELECT DISTINCT u.id AS user_id, u.email
        FROM ticket_purchases tp
        JOIN users u ON u.id = tp.user_id
        LEFT JOIN notification_preferences np ON np.user_email = u.email
        WHERE tp.event_id = ?
        AND COALESCE(np.crowd_alerts_enabled, 1) = 1
    """, (event_id,))
    return cur.fetchall()


def get_event_ticket_holders(event_id, cur):
    """Return all ticket purchasers for an event, regardless of notification preferences."""
    cur.execute("""
        SELECT DISTINCT tp.user_id, u.email
        FROM ticket_purchases tp
        JOIN users u ON u.id = tp.user_id
        WHERE tp.event_id = ?
    """, (event_id,))
    return cur.fetchall()


def get_ticket_holder_emails(event_id, cur):
    """Return email addresses for ticket purchasers who allow crowd alerts."""
    return [row["email"] for row in get_crowd_alert_ticket_holders(event_id, cur)]


def get_user_email_by_id(cur, user_id):
    """Resolve a user id to the stored email address."""
    cur.execute("SELECT email FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    return row["email"] if row else None


def parse_bool_value(value, default=True):
    """Convert common form and JSON values into a boolean."""
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if normalized in ['1', 'true', 'yes', 'on']:
        return True
    if normalized in ['0', 'false', 'no', 'off']:
        return False
    return bool(default)


def get_notification_preference(cur, user_email=None, user_id=None):
    """Return whether normal customer notifications are enabled."""
    resolved_email = str(user_email or '').strip().lower()

    if not resolved_email and user_id is not None:
        resolved_email = str(get_user_email_by_id(cur, user_id) or '').strip().lower()

    if not resolved_email:
        return True

    cur.execute("""
        SELECT crowd_alerts_enabled
        FROM notification_preferences
        WHERE lower(user_email) = ?
    """, (resolved_email,))
    row = cur.fetchone()
    return bool(row["crowd_alerts_enabled"]) if row else True


def get_ticket_status_label(value):
    normalized = str(value or '').strip().lower()
    return 'Attended' if normalized == 'done' else 'Not Attended'


# ============================================================
#  APP CONFIG
# ============================================================

app = Flask(__name__, static_folder='.', static_url_path='')
PROJECT_DB_PATH = os.path.join(app.root_path, 'crowd_analysis.db')
DB_NAME = os.environ.get('DB_NAME', PROJECT_DB_PATH)
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'Crowdanalyzing@gmail.com').strip().lower()
APP_BASE_URL = os.environ.get('APP_BASE_URL', 'http://127.0.0.1:5001').strip().rstrip('/')
APP_SECRET_KEY = os.environ.get('APP_SECRET_KEY', 'crowd-analyzing-admin-review-secret')
APP_TIMEZONE = os.environ.get('APP_TIMEZONE', 'Asia/Riyadh').strip() or 'Asia/Riyadh'
ORGANIZER_PROOF_DIR = os.path.join(app.root_path, 'uploads', 'organizer_proofs')
ALLOWED_ORGANIZER_PROOF_EXTENSIONS = {
    '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'
}

try:
    APP_TIMEZONE_INFO = ZoneInfo(APP_TIMEZONE)
except Exception:
    APP_TIMEZONE_INFO = ZoneInfo('UTC')

app.config['SECRET_KEY'] = APP_SECRET_KEY
os.makedirs(ORGANIZER_PROOF_DIR, exist_ok=True)

STAFF_WEEKDAY_OPTIONS = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
]

STAFF_WEEKDAY_LABELS = {
    'sunday': 'Sunday',
    'monday': 'Monday',
    'tuesday': 'Tuesday',
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday'
}


@app.after_request
def apply_security_headers(response):
    response.headers.setdefault('Permissions-Policy', 'camera=(self)')
    return response


def ensure_database_path():
    """Always use one canonical writable database path."""
    db_path = os.path.abspath(DB_NAME)
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    if os.path.exists(db_path):
        try:
            os.chmod(db_path, stat.S_IWRITE | stat.S_IREAD)
        except OSError:
            pass

    return db_path


DB_NAME = ensure_database_path()


def get_local_now():
    """Return the current time in the app timezone."""
    return datetime.now(APP_TIMEZONE_INFO)


def get_local_now_naive():
    """Return a naive local datetime for comparisons with stored event times."""
    return get_local_now().replace(tzinfo=None)


def current_timestamp():
    """Return a database-friendly local timestamp string."""
    return get_local_now().strftime('%Y-%m-%d %H:%M:%S')


def get_sqlite_timezone_modifier():
    """Return the SQLite modifier needed to convert UTC timestamps to the app timezone."""
    offset = get_local_now().utcoffset()
    if not offset:
        return None

    total_minutes = int(offset.total_seconds() // 60)
    if total_minutes == 0:
        return None

    sign = '+' if total_minutes >= 0 else '-'
    return f"{sign}{abs(total_minutes)} minutes"


def migrate_legacy_utc_timestamps(cur):
    """Convert older UTC timestamp strings into the app timezone once."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    migration_key = 'timestamps_local_migrated_v1'
    cur.execute("SELECT value FROM app_meta WHERE key = ?", (migration_key,))
    if cur.fetchone():
        return

    modifier = get_sqlite_timezone_modifier()
    timestamp_columns = [
        ('users', 'reviewed_at'),
        ('users', 'created_at'),
        ('notifications', 'created_at'),
        ('entry_staff_profiles', 'created_at'),
        ('entry_staff_profiles', 'status_updated_at'),
        ('attendance', 'entry_time'),
        ('ticket_purchases', 'purchase_time'),
        ('events', 'emergency_started_at'),
        ('events', 'emergency_cleared_at')
    ]

    if modifier:
        for table_name, column_name in timestamp_columns:
            cur.execute(
                f"UPDATE {table_name} SET {column_name} = datetime({column_name}, ?) WHERE {column_name} IS NOT NULL",
                (modifier,)
            )

    cur.execute("""
        INSERT OR REPLACE INTO app_meta (key, value)
        VALUES (?, ?)
    """, (migration_key, current_timestamp()))


def migrate_day_stats_from_actual_scan_dates(cur):
    """Rebuild event_day_stats.attendance_count from actual scan entry_time dates.

    Historical scans were written to event_day_stats using the ticket's
    attendance_date (future date) instead of the real scan date.  This
    migration corrects that by re-counting from the attendance table.
    It runs once, tracked by app_meta key.
    """
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    migration_key = 'day_stats_rebuilt_from_scan_dates_v1'
    cur.execute("SELECT value FROM app_meta WHERE key = ?", (migration_key,))
    if cur.fetchone():
        return

    # Reset all attendance counts — tickets_sold is kept as-is.
    cur.execute("UPDATE event_day_stats SET attendance_count = 0")

    # Re-count from real scan dates recorded in attendance.entry_time.
    cur.execute("""
        INSERT INTO event_day_stats (event_id, event_date, tickets_sold, attendance_count)
        SELECT event_id, DATE(entry_time), 0, COUNT(*)
        FROM attendance
        GROUP BY event_id, DATE(entry_time)
        ON CONFLICT(event_id, event_date) DO UPDATE SET attendance_count = excluded.attendance_count
    """)

    cur.execute("""
        INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)
    """, (migration_key, current_timestamp()))


# ============================================================
#  DATABASE CONNECTION
# ============================================================

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.create_function("app_now", 0, current_timestamp)
    return conn


# ============================================================
#  DATABASE INITIALIZATION
# ============================================================

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    # ============================================================
    #  USERS TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL
    )
    """)

    try:
        cur.execute("ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN organizer_application_reason TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN organizer_proof_path TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN organizer_proof_name TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN reviewed_at TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN reviewed_by_email TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    except sqlite3.OperationalError:
        pass

    cur.execute("""
        UPDATE users
        SET approval_status = COALESCE(NULLIF(TRIM(approval_status), ''), 'approved'),
            created_at = COALESCE(created_at, app_now())
    """)

    cur.execute("PRAGMA table_info(users)")
    user_columns = {row[1] for row in cur.fetchall()}
    if "organizer_review_notes" in user_columns:
        conn.commit()
        conn.close()

        conn = sqlite3.connect(DB_NAME, timeout=10)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        conn.execute("PRAGMA foreign_keys = OFF")
        cur.execute("DROP TABLE IF EXISTS users_new")
        cur.execute("""
        CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            approval_status TEXT NOT NULL DEFAULT 'approved',
            organizer_application_reason TEXT,
            organizer_proof_path TEXT,
            organizer_proof_name TEXT,
            reviewed_at TEXT,
            reviewed_by_email TEXT,
            created_at TEXT
        )
        """)
        cur.execute("""
            INSERT INTO users_new (
                id, full_name, email, password, role, approval_status,
                organizer_application_reason, organizer_proof_path, organizer_proof_name,
                reviewed_at, reviewed_by_email, created_at
            )
            SELECT
                id, full_name, email, password, role, approval_status,
                organizer_application_reason, organizer_proof_path, organizer_proof_name,
                reviewed_at, reviewed_by_email, created_at
            FROM users
        """)
        cur.execute("DROP TABLE users")
        cur.execute("ALTER TABLE users_new RENAME TO users")
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON")

    # ============================================================
    #  EVENTS TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organizer_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        city TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        description TEXT,
        capacity INTEGER NOT NULL,
        ticket_price REAL NOT NULL DEFAULT 0,
        tickets_sold INTEGER NOT NULL DEFAULT 0,
        attendance_count INTEGER NOT NULL DEFAULT 0,
        category TEXT DEFAULT 'event',
        FOREIGN KEY (organizer_id) REFERENCES users(id)
    )
    """)

    # Add missing columns for old databases
    try:
        cur.execute("ALTER TABLE events ADD COLUMN end_date TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN organizer_id INTEGER")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN location TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN city TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN ticket_price REAL NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN tickets_sold INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN emergency_active INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN emergency_type TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN emergency_message TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN emergency_started_at TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN last_hourly_crowd_notification_at TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN last_hourly_crowd_attendance_count INTEGER")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN emergency_cleared_at TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE events ADD COLUMN capacity_per_day INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # Migrate existing multi-day events: capacity_per_day = capacity
    cur.execute("""
        UPDATE events
        SET capacity_per_day = capacity
        WHERE end_date IS NOT NULL
          AND end_date != start_date
          AND capacity_per_day = 0
    """)

    # ============================================================
    #  EVENT DAY STATS TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS event_day_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        event_date TEXT NOT NULL,
        tickets_sold INTEGER NOT NULL DEFAULT 0,
        attendance_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(event_id, event_date),
        FOREIGN KEY (event_id) REFERENCES events(id)
    )
    """)

    # ============================================================
    #  ENTRY STAFF PROFILES TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS entry_staff_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        organizer_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        age INTEGER NOT NULL,
        preferred_hours REAL NOT NULL,
        preferred_days_per_week INTEGER NOT NULL,
        preferred_days_text TEXT NOT NULL DEFAULT '[]',
        generated_password TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (organizer_id) REFERENCES users(id),
        FOREIGN KEY (event_id) REFERENCES events(id)
    )
    """)

    # ============================================================
    #  ATTENDANCE TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        staff_id INTEGER,
        purchase_id INTEGER,
        entry_time TEXT,
        FOREIGN KEY (event_id) REFERENCES events(id),
        FOREIGN KEY (staff_id) REFERENCES users(id),
        FOREIGN KEY (purchase_id) REFERENCES ticket_purchases(id)
    )
    """)

    try:
        cur.execute("ALTER TABLE attendance ADD COLUMN purchase_id INTEGER")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE entry_staff_profiles ADD COLUMN work_status TEXT NOT NULL DEFAULT 'active'")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE entry_staff_profiles ADD COLUMN status_updated_at TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE entry_staff_profiles ADD COLUMN preferred_days_text TEXT NOT NULL DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass

    # ============================================================
    #  TICKET PURCHASES TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS ticket_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        purchase_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (event_id) REFERENCES events(id)
    )
    """)

    cur.execute("PRAGMA table_info(ticket_purchases)")
    ticket_purchase_columns = {row[1] for row in cur.fetchall()}
    if "status" not in ticket_purchase_columns:
        cur.execute("ALTER TABLE ticket_purchases ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'")
        cur.execute("""
            UPDATE ticket_purchases
            SET status = CASE
                WHEN id IN (SELECT purchase_id FROM attendance WHERE purchase_id IS NOT NULL) THEN 'Done'
                ELSE 'Active'
            END
        """)

    if "attendance_date" not in ticket_purchase_columns:
        cur.execute("ALTER TABLE ticket_purchases ADD COLUMN attendance_date TEXT")

    # ============================================================
    #  NOTIFICATION PREFERENCES TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL UNIQUE,
        crowd_alerts_enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (user_email) REFERENCES users(email)
    )
    """)

    cur.execute("PRAGMA table_info(notification_preferences)")
    preference_columns = {row[1] for row in cur.fetchall()}
    if "user_id" in preference_columns:
        conn.execute("PRAGMA foreign_keys = OFF")
        cur.execute("DROP TABLE IF EXISTS notification_preferences_new")
        cur.execute("""
        CREATE TABLE notification_preferences_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL UNIQUE,
            crowd_alerts_enabled INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_email) REFERENCES users(email)
        )
        """)
        cur.execute("""
            INSERT INTO notification_preferences_new (id, user_email, crowd_alerts_enabled)
            SELECT np.id, u.email, np.crowd_alerts_enabled
            FROM notification_preferences np
            JOIN users u ON u.id = np.user_id
            WHERE u.email IS NOT NULL
        """)
        cur.execute("DROP TABLE notification_preferences")
        cur.execute("ALTER TABLE notification_preferences_new RENAME TO notification_preferences")
        conn.execute("PRAGMA foreign_keys = ON")

    # ============================================================
    #  NOTIFICATIONS TABLE
    # ============================================================
    # This table stores:
    # - ticket purchase alerts
    # - attendance updates
    # - emergency announcements
    # - hourly updates
    cur.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_id INTEGER,
        type TEXT,
        title TEXT,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (event_id) REFERENCES events(id)
    )
    """)

    migrate_legacy_utc_timestamps(cur)
    migrate_day_stats_from_actual_scan_dates(cur)

    # ============================================================
    #  CHAT MESSAGES TABLE
    # ============================================================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        from_id INTEGER NOT NULL,
        from_name TEXT NOT NULL,
        from_role TEXT NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_id, id)")
    except sqlite3.OperationalError:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_reads (
        user_id INTEGER NOT NULL,
        room_id TEXT NOT NULL,
        last_read_id INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, room_id)
    )
    """)

    conn.commit()
    conn.close()


# ============================================================
#  HELPERS
# ============================================================

def is_admin_email(email):
    normalized = str(email or '').strip().lower()
    return bool(normalized) and normalized in set(get_admin_recipient_emails())


def get_request_data():
    if request.is_json:
        return request.get_json(silent=True) or {}, {}
    return request.form.to_dict(), request.files


def normalize_staff_preferred_days(value):
    if value is None:
        return []

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json_lib.loads(stripped)
        except Exception:
            parsed = [part.strip() for part in stripped.split(',') if part.strip()]
    elif isinstance(value, (list, tuple, set)):
        parsed = list(value)
    else:
        parsed = [value]

    normalized = []
    seen = set()
    for item in parsed:
        day_value = str(item or '').strip().lower()
        if not day_value:
            continue
        if day_value not in STAFF_WEEKDAY_LABELS:
            return None
        if day_value in seen:
            continue
        seen.add(day_value)
        normalized.append(day_value)

    return normalized


def build_user_response(user, cur=None):
    approval_status = str(user["approval_status"]).strip().lower() if "approval_status" in user.keys() and user["approval_status"] else "approved"
    response = {
        "id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "role": user["role"],
        "approval_status": approval_status,
        "is_admin": is_admin_email(user["email"])
    }
    if str(user["role"]).strip().lower() == 'customer':
        response["notifications_enabled"] = get_notification_preference(cur, user_email=user["email"]) if cur else True
    if str(user["role"]).strip().lower() == 'entry_staff' and cur:
        response["work_status"] = get_staff_work_status(cur, user["id"])
    return response


def get_organizer_access_message(user):
    approval_status = str(user["approval_status"]).strip().lower() if user["approval_status"] else "approved"
    if approval_status == "pending":
        return "Your organizer account is pending admin approval. Please wait for confirmation before signing in."
    if approval_status == "rejected":
        return "Your organizer application was not approved. You can submit a new organizer request from the sign-up page."
    return None


def generate_entry_staff_password(length=8):
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(max(6, int(length))))


def normalize_staff_work_status(value):
    normalized = str(value or '').strip().lower().replace(' ', '_')
    if normalized in ['active', 'extra_work', 'stop_working', 'removed']:
        return normalized
    return 'active'


def get_staff_work_status(cur, user_id):
    cur.execute("""
        SELECT work_status
        FROM entry_staff_profiles
        WHERE user_id = ?
    """, (user_id,))
    row = cur.fetchone()
    return normalize_staff_work_status(row["work_status"]) if row else 'removed'


def get_staff_work_status_meta(status, event_name='this event'):
    normalized = normalize_staff_work_status(status)
    label_map = {
        'active': 'Active',
        'extra_work': 'Extra Work',
        'stop_working': 'Inactive',
        'removed': 'Removed'
    }
    message_map = {
        'active': 'Staff access is active.',
        'extra_work': 'You are marked as extra work for "' + str(event_name) + '". You may continue working as assigned.',
        'stop_working': 'You have been marked as inactive for "' + str(event_name) + '". Scanning and entry actions are disabled. You can still chat with the organizer until you are removed.',
        'removed': 'Your staff assignment for "' + str(event_name) + '" has been removed. You can no longer work this event.'
    }
    return {
        "status": normalized,
        "label": label_map.get(normalized, 'Active'),
        "message": message_map.get(normalized, message_map['active'])
    }


def get_admin_user_ids(cur):
    admin_emails = get_admin_recipient_emails()
    if not admin_emails:
        return []
    placeholders = ', '.join('?' for _ in admin_emails)
    cur.execute(f"SELECT id FROM users WHERE lower(email) IN ({placeholders})", admin_emails)
    return [row["id"] for row in cur.fetchall()]


def allowed_organizer_proof(filename):
    extension = os.path.splitext(filename or "")[1].lower()
    return extension in ALLOWED_ORGANIZER_PROOF_EXTENSIONS


def get_email_token_serializer():
    return URLSafeTimedSerializer(app.config['SECRET_KEY'])


def generate_organizer_review_email_token(user_id, decision):
    serializer = get_email_token_serializer()
    return serializer.dumps({
        "kind": "organizer_review",
        "user_id": int(user_id),
        "decision": str(decision).strip().lower()
    }, salt='organizer-review-email')


def verify_organizer_review_email_token(token, max_age=60 * 60 * 24 * 7):
    serializer = get_email_token_serializer()
    payload = serializer.loads(token, salt='organizer-review-email', max_age=max_age)
    if payload.get("kind") != "organizer_review":
        raise BadSignature("Invalid organizer review token")
    return payload


def generate_organizer_proof_email_token(user_id):
    serializer = get_email_token_serializer()
    return serializer.dumps({
        "kind": "organizer_proof",
        "user_id": int(user_id)
    }, salt='organizer-proof-email')


def verify_organizer_proof_email_token(token, max_age=60 * 60 * 24 * 7):
    serializer = get_email_token_serializer()
    payload = serializer.loads(token, salt='organizer-proof-email', max_age=max_age)
    if payload.get("kind") != "organizer_proof":
        raise BadSignature("Invalid organizer proof token")
    return payload


def generate_organizer_review_page_token(user_id):
    serializer = get_email_token_serializer()
    return serializer.dumps({
        "kind": "organizer_review_page",
        "user_id": int(user_id)
    }, salt='organizer-review-page-email')


def verify_organizer_review_page_token(token, max_age=60 * 60 * 24 * 7):
    serializer = get_email_token_serializer()
    payload = serializer.loads(token, salt='organizer-review-page-email', max_age=max_age)
    if payload.get("kind") != "organizer_review_page":
        raise BadSignature("Invalid organizer review page token")
    return payload


def generate_password_reset_token(user_id):
    serializer = get_email_token_serializer()
    return serializer.dumps({
        "kind": "password_reset",
        "user_id": int(user_id)
    }, salt='password-reset-email')


def verify_password_reset_token(token, max_age=60 * 60):
    serializer = get_email_token_serializer()
    payload = serializer.loads(token, salt='password-reset-email', max_age=max_age)
    if payload.get("kind") != "password_reset":
        raise BadSignature("Invalid password reset token")
    return payload


def is_password_reset_allowed_role(role):
    return str(role or '').strip().lower() in ['customer', 'organizer']


def mask_email_address(email):
    normalized = str(email or '').strip()
    if not normalized or '@' not in normalized:
        return normalized
    local_part, domain = normalized.split('@', 1)
    if len(local_part) <= 2:
        masked_local = local_part[:1] + '*'
    else:
        masked_local = local_part[:2] + '*' * max(1, len(local_part) - 2)
    return masked_local + '@' + domain


def get_local_network_ip():
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return None
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass


def get_active_ngrok_public_url():
    try:
        with urllib.request.urlopen('http://127.0.0.1:4040/api/tunnels', timeout=2) as response:
            payload = json_lib.loads(response.read().decode('utf-8'))
        tunnels = payload.get('tunnels') if isinstance(payload, dict) else None
        if not isinstance(tunnels, list):
            return None
        for tunnel in tunnels:
            public_url = str((tunnel or {}).get('public_url', '')).strip().rstrip('/')
            proto = str((tunnel or {}).get('proto', '')).strip().lower()
            if public_url and proto == 'https':
                return public_url
        for tunnel in tunnels:
            public_url = str((tunnel or {}).get('public_url', '')).strip().rstrip('/')
            if public_url:
                return public_url
    except Exception:
        return None
    return None


def get_effective_base_url(base_url=None):
    candidate = str(base_url or APP_BASE_URL).strip().rstrip('/')
    if not candidate:
        candidate = APP_BASE_URL

    lowered = candidate.lower()
    if '127.0.0.1' in lowered or 'localhost' in lowered or '0.0.0.0' in lowered:
        local_ip = get_local_network_ip()
        if local_ip:
            if '127.0.0.1' in candidate:
                candidate = candidate.replace('127.0.0.1', local_ip)
            elif 'localhost' in candidate:
                candidate = candidate.replace('localhost', local_ip)
            elif '0.0.0.0' in candidate:
                candidate = candidate.replace('0.0.0.0', local_ip)
    return candidate


def build_absolute_url(path, base_url=None):
    return get_effective_base_url(base_url=base_url) + path


def get_admin_email_base_url():
    """Prefer a public configured URL, otherwise fall back to the current request URL."""
    configured_base = str(APP_BASE_URL or '').strip().rstrip('/')
    configured_lower = configured_base.lower()
    if configured_base and all(token not in configured_lower for token in ['127.0.0.1', 'localhost', '0.0.0.0']):
        return configured_base
    ngrok_url = get_active_ngrok_public_url()
    if ngrok_url:
        return ngrok_url
    if has_request_context():
        request_base = str(request.url_root or '').strip().rstrip('/')
        if request_base:
            return request_base
    return configured_base or None


def build_organizer_review_email_links(user_id, base_url=None):
    approve_token = generate_organizer_review_email_token(user_id, 'approved')
    reject_token = generate_organizer_review_email_token(user_id, 'rejected')
    proof_token = generate_organizer_proof_email_token(user_id)
    review_token = generate_organizer_review_page_token(user_id)
    return {
        "review_url": build_absolute_url('/admin/email-review-panel?token=' + review_token, base_url=base_url),
        "approve_url": build_absolute_url('/admin/email-review?token=' + approve_token, base_url=base_url),
        "reject_url": build_absolute_url('/admin/email-review?token=' + reject_token, base_url=base_url),
        "proof_url": build_absolute_url(f'/admin/email-proof/{int(user_id)}?token={proof_token}', base_url=base_url),
        "proof_download_url": build_absolute_url(f'/admin/email-proof/{int(user_id)}?token={proof_token}&download=1', base_url=base_url)
    }


def build_organizer_review_customer_email(full_name, title, message, decision, base_url=None):
    website_url = build_absolute_url('/', base_url=base_url or get_admin_email_base_url())
    reapply_block = ''

    if str(decision or '').strip().lower() == 'rejected':
        reapply_block = f"""
        <div style="margin-top:22px;padding:18px;border-radius:14px;background:#fff7fb;border:1px solid #f3d7e4;">
          <h3 style="margin:0 0 10px 0;color:#9B1040;">How to apply again</h3>
          <p style="margin:0 0 10px 0;">You can submit a new organizer registration request after preparing updated proof documents.</p>
          <ol style="margin:0 0 14px 18px;padding:0;line-height:1.8;color:#374151;">
            <li>Open the Crowd Analyzing website using the button below.</li>
            <li>Choose <strong>Sign Up</strong> and select <strong>Event Organizer</strong>.</li>
            <li>Fill in your updated information, explain your event experience, and upload stronger proof if needed.</li>
            <li>Submit the new request and wait for the next admin review.</li>
          </ol>
          <a href="{website_url}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#9B1040;color:#ffffff;text-decoration:none;font-weight:800;">Open Crowd Analyzing</a>
          <p style="margin:12px 0 0 0;font-size:12px;color:#6b7280;word-break:break-all;">Website link: <a href="{website_url}">{website_url}</a></p>
        </div>
        """

    return f"""
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
      <h2 style="color:#9B1040;margin-top:0;">{title}</h2>
      <p>Hi {full_name},</p>
      <p>{message}</p>
      {reapply_block}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#6b7280;font-size:0.85em;">Crowd Analyzing admin review</p>
    </div>
    """


def save_organizer_proof(file_storage):
    if not file_storage or not getattr(file_storage, "filename", ""):
        raise ValueError("Please upload a proof file for organizer approval.")

    original_name = secure_filename(file_storage.filename)
    if not original_name:
        raise ValueError("The uploaded proof file is not valid.")

    if not allowed_organizer_proof(original_name):
        raise ValueError("Proof file must be a PDF, image, DOC, or DOCX file.")

    extension = os.path.splitext(original_name)[1].lower()
    saved_name = f"{uuid.uuid4().hex}{extension}"
    absolute_path = os.path.join(ORGANIZER_PROOF_DIR, saved_name)
    file_storage.save(absolute_path)
    return absolute_path, original_name


def get_admin_user(cur, user_id):
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None

    cur.execute("""
        SELECT id, full_name, email, role, approval_status
        FROM users
        WHERE id = ?
    """, (user_id,))
    user = cur.fetchone()
    if not user or not is_admin_email(user["email"]):
        return None
    return user


def apply_organizer_review(cur, user_id, decision, reviewed_by_email):
    decision = str(decision).strip().lower()

    if decision not in ['approved', 'rejected']:
        raise ValueError("Decision must be approved or rejected")

    cur.execute("""
        SELECT id, full_name, email, approval_status
        FROM users
        WHERE id = ? AND role = 'organizer'
    """, (user_id,))
    organizer = cur.fetchone()

    if not organizer:
        return None, None, None

    cur.execute("""
        UPDATE users
        SET approval_status = ?,
            reviewed_at = app_now(),
            reviewed_by_email = ?
        WHERE id = ?
    """, (decision, reviewed_by_email, user_id))

    title = 'Organizer application approved' if decision == 'approved' else 'Organizer application rejected'
    message = (
        'Your organizer account has been approved. You can now sign in and create events.'
        if decision == 'approved'
        else 'Your organizer application was not approved.'
    )

    cur.execute("""
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES (?, NULL, 'update', ?, ?, 0, app_now())
    """, (user_id, title, message))

    return organizer, title, message


def ensure_approved_organizer(cur, organizer_id):
    cur.execute("""
        SELECT id, role, approval_status
        FROM users
        WHERE id = ?
    """, (organizer_id,))
    organizer = cur.fetchone()

    if not organizer:
        return None, ("Organizer account not found. Please sign in again.", 404)

    if organizer["role"] != "organizer":
        return None, ("Only organizer accounts can publish events.", 403)

    blocker_message = get_organizer_access_message(organizer)
    if blocker_message:
        return None, (blocker_message, 403)

    return organizer, None

def calculate_crowd_level(attendance_count, capacity):
    if capacity <= 0:
        return "Unknown"

    percentage = (attendance_count / capacity) * 100

    if percentage >= 80:
        return "High"
    elif percentage >= 40:
        return "Medium"
    else:
        return "Low"


def calculate_capacity_percentage(attendance_count, capacity):
    if capacity <= 0:
        return 0
    return (attendance_count / capacity) * 100


def parse_app_datetime(value):
    if not value:
        return None
    normalized = str(value).strip().replace(' ', 'T')
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def build_organizer_hourly_crowd_message(event_row, previous_attendance_count=None):
    event_name = str(event_row["name"] or 'the event').strip()
    attendance_count = int(event_row["attendance_count"] or 0)
    capacity = int(event_row["capacity"] or 0)
    crowd_level = calculate_crowd_level(attendance_count, capacity)
    percentage = round(calculate_capacity_percentage(attendance_count, capacity), 2) if capacity > 0 else 0
    previous_count = None if previous_attendance_count is None else int(previous_attendance_count)

    if crowd_level == 'High':
        status_line = 'Attendance is now high.'
    elif crowd_level == 'Medium':
        status_line = 'Attendance is now medium.'
    else:
        status_line = 'Attendance is currently low.'

    trend_line = 'Attendance is mostly unchanged since the last update.'
    if previous_count is not None:
        difference = attendance_count - previous_count
        if difference > 0:
            trend_line = 'Attendance increased by ' + str(difference) + ' since the last hourly update.'
        elif difference < 0:
            trend_line = 'Attendance decreased by ' + str(abs(difference)) + ' since the last hourly update.'

    level_label_map = {
        'High': 'High',
        'Medium': 'Medium',
        'Low': 'Low',
        'Unknown': 'Unknown'
    }
    level_label = level_label_map.get(crowd_level, crowd_level)

    message = (
        status_line + '\n' +
        trend_line + '\n' +
        'Current attendance for "' + event_name + '" is ' + str(attendance_count) +
        ' out of ' + str(capacity) + ' (' + str(percentage) + '%).' + '\n' +
        'Current crowd level: ' + level_label + '.'
    )

    return 'Hourly Crowd Update', message


def normalize_notification_copy(notif_type, title, message):
    normalized_type = str(notif_type or '').strip().lower()
    normalized_title = str(title or '')
    normalized_message = str(message or '')

    if normalized_type != 'crowd':
        return normalized_title, normalized_message

    if normalized_title == 'تحديث الزحام كل ساعة':
        normalized_title = 'Hourly Crowd Update'

    replacements = [
        ('ترا الحضور صار مرتفع', 'Attendance is now high.'),
        ('ترا الحضور صار ميديم', 'Attendance is now medium.'),
        ('ترا الحضور قليل', 'Attendance is currently low.'),
        ('الحضور ثابت تقريبًا من آخر تحديث.', 'Attendance is mostly unchanged since the last update.'),
    ]
    for arabic_text, english_text in replacements:
        normalized_message = normalized_message.replace(arabic_text, english_text)

    normalized_message = re.sub(
        r'ترا الحضور زاد بمقدار\s+(\d+)\s+من آخر ساعة\.',
        r'Attendance increased by \1 since the last hourly update.',
        normalized_message
    )
    normalized_message = re.sub(
        r'الحضور قل بمقدار\s+(\d+)\s+من آخر ساعة\.',
        r'Attendance decreased by \1 since the last hourly update.',
        normalized_message
    )
    normalized_message = re.sub(
        r'الحضور الحالي في\s+"([^"]+)"\s+هو\s+(\d+)\s+من\s+(\d+)\s+\(([\d.]+)%\)\.',
        r'Current attendance for "\1" is \2 out of \3 (\4%).',
        normalized_message
    )
    normalized_message = normalized_message.replace('مستوى الزحام الحالي: مرتفع.', 'Current crowd level: High.')
    normalized_message = normalized_message.replace('مستوى الزحام الحالي: ميديم.', 'Current crowd level: Medium.')
    normalized_message = normalized_message.replace('مستوى الزحام الحالي: قليل.', 'Current crowd level: Low.')
    normalized_message = normalized_message.replace('مستوى الزحام الحالي: غير واضح.', 'Current crowd level: Unknown.')

    return normalized_title, normalized_message


def build_customer_crowd_alert(event_name, attendance_count, capacity):
    if capacity <= 0:
        return None

    current_count = int(attendance_count or 0)
    max_capacity = int(capacity or 0)
    percentage = calculate_capacity_percentage(current_count, max_capacity)
    attendance_summary = f'{current_count} / {max_capacity}'

    if current_count >= max_capacity:
        return {
            "stage": "full",
            "title": "Event is Full",
            "message": 'The event "' + str(event_name or 'Event') + '" is now at full capacity.\nCurrent attendance: ' + attendance_summary + '.'
        }

    if percentage >= 80:
        return {
            "stage": "near_full",
            "title": "Almost Full",
            "message": 'The event "' + str(event_name or 'Event') + '" is getting very crowded.\nCurrent attendance: ' + attendance_summary + '.'
        }

    if percentage >= 50:
        return {
            "stage": "busy",
            "title": "Getting Busy",
            "message": 'The event "' + str(event_name or 'Event') + '" is starting to get crowded.\nCurrent attendance: ' + attendance_summary + '.'
        }

    return None


def get_today_event_stats(event_id, event_row, cur):
    """Return today's real scan count from event_day_stats for any event type."""
    today_str = get_local_now_naive().strftime('%Y-%m-%d')
    capacity_per_day = int(event_row["capacity_per_day"] or 0) if "capacity_per_day" in event_row.keys() else 0
    # Always query event_day_stats for today — never fall back to global attendance_count
    cur.execute(
        "SELECT attendance_count FROM event_day_stats WHERE event_id = ? AND event_date = ?",
        (event_id, today_str)
    )
    day_row = cur.fetchone()
    today_attendance = int(day_row["attendance_count"] or 0) if day_row else 0
    today_capacity = capacity_per_day if capacity_per_day > 0 else int(event_row["capacity"] or 0)
    return {
        "today_date": today_str,
        "today_attendance": today_attendance,
        "today_capacity": today_capacity,
        "is_multi_day": capacity_per_day > 0
    }


def build_staff_alert_state(event_row, today_attendance=None, today_capacity=None):
    attendance_count = today_attendance if today_attendance is not None else int(event_row["attendance_count"] or 0)
    capacity = today_capacity if today_capacity is not None else int(event_row["capacity"] or 0)
    crowd_level = calculate_crowd_level(attendance_count, capacity)
    emergency_active = bool(event_row["emergency_active"]) if "emergency_active" in event_row.keys() else False
    emergency_type = str(event_row["emergency_type"] or "").strip().lower() if "emergency_type" in event_row.keys() else ""
    emergency_message = str(event_row["emergency_message"] or "").strip() if "emergency_message" in event_row.keys() else ""

    if emergency_active:
        return {
            "active": True,
            "type": "emergency",
            "severity": "critical",
            "title": "Emergency Alert",
            "message": build_staff_emergency_message(emergency_type, emergency_message),
            "entry_locked": True,
            "entry_lock_reason": "Emergency active",
            "emergency_type": emergency_type or "other"
        }

    if capacity > 0 and attendance_count >= capacity:
        return {
            "active": True,
            "type": "full",
            "severity": "critical",
            "title": "Event Full Warning",
            "message": "This event is full. No more attendees should be allowed to enter.",
            "entry_locked": True,
            "entry_lock_reason": "Event full",
            "emergency_type": ""
        }

    if crowd_level == "High":
        return {
            "active": True,
            "type": "crowd",
            "severity": "warning",
            "title": "Crowd Warning",
            "message": "This event is crowded and close to full capacity. Prepare to stop entry. Once full, no more attendees should be allowed to enter.",
            "entry_locked": False,
            "entry_lock_reason": "",
            "emergency_type": ""
        }

    return {
        "active": False,
        "type": "",
        "severity": "",
        "title": "",
        "message": "",
        "entry_locked": False,
        "entry_lock_reason": "",
        "emergency_type": ""
    }


def build_staff_emergency_message(emergency_type, emergency_message=''):
    normalized_type = str(emergency_type or '').strip().lower()
    details = str(emergency_message or '').strip()

    if normalized_type == 'stop_event':
        return (
            "This event has been stopped by the organizer due to an emergency.\n"
            "Please exit the venue immediately and follow all staff instructions.\n\n"
            "All system actions (including scanning) are currently disabled."
        )

    if details:
        return (
            "There is an active emergency situation.\n"
            + details +
            "\n\nAll system actions (including scanning) are currently disabled."
        )

    return (
        "There is an active emergency situation.\n"
        "Please follow all organizer instructions immediately.\n\n"
        "All system actions (including scanning) are currently disabled."
    )


def format_ticket_code(purchase_id):
    return "TKT-" + str(purchase_id).zfill(4)


def normalize_ticket_code_value(value):
    normalized = str(value or '').strip().upper()
    normalized = normalized.strip('*')
    normalized = re.sub(r'\s+', '', normalized)
    return normalized


def parse_purchase_id_from_ticket_code(value):
    normalized = normalize_ticket_code_value(value)
    if not normalized:
        return None

    digits = ''
    if normalized.startswith('TKT'):
        digits = re.sub(r'[^0-9]', '', normalized[3:])
    elif re.fullmatch(r'\d+', normalized):
        digits = normalized
    else:
        compact = re.sub(r'[^0-9]', '', normalized)
        if compact:
            digits = compact

    if not digits:
        return None

    try:
        return int(digits)
    except (TypeError, ValueError):
        return None


def clamp(value, minimum, maximum):
    return max(minimum, min(value, maximum))


def parse_event_datetime(date_value, time_value):
    if not date_value or not time_value:
        return None

    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p"):
        try:
            return datetime.strptime(str(date_value) + " " + str(time_value), fmt)
        except ValueError:
            continue

    return None


def validate_event_schedule(start_date, end_date, start_time, end_time, require_future_start=False):
    start_dt = parse_event_datetime(start_date, start_time)
    end_dt = parse_event_datetime(end_date or start_date, end_time)

    if not start_dt or not end_dt:
        return None, None, "Invalid event date or time"

    if end_dt <= start_dt:
        return None, None, "Event end time must be after the start time"

    if require_future_start and start_dt <= get_local_now_naive():
        return None, None, "Event date and time must be in the future"

    return start_dt, end_dt, None


def get_event_runtime_status(event_row, now=None, all_days_sold_out=False):
    from datetime import date as date_cls
    now = now or get_local_now_naive()
    start_dt = parse_event_datetime(event_row["start_date"], event_row["start_time"])
    end_dt = parse_event_datetime(event_row["end_date"] or event_row["start_date"], event_row["end_time"])

    is_upcoming = bool(start_dt and now < start_dt)
    is_ended = bool(end_dt and now > end_dt)
    is_live = bool(start_dt and end_dt and start_dt <= now <= end_dt)

    capacity_per_day = int(event_row["capacity_per_day"] or 0) if "capacity_per_day" in event_row.keys() else 0
    if capacity_per_day > 0:
        try:
            sd = date_cls.fromisoformat(event_row["start_date"])
            ed = date_cls.fromisoformat(event_row["end_date"] or event_row["start_date"])
            num_days = max((ed - sd).days + 1, 1)
        except Exception:
            num_days = 1
        total_capacity = capacity_per_day * num_days
    else:
        total_capacity = int(event_row["capacity"] or 0)

    remaining_tickets = max(total_capacity - int(event_row["tickets_sold"] or 0), 0) if total_capacity > 0 else None
    is_sold_out = (total_capacity > 0 and remaining_tickets <= 0) or (capacity_per_day > 0 and all_days_sold_out)
    next_available_date = event_row["start_date"] or event_row["end_date"] or "TBA"

    home_status_message = ""
    if is_ended:
        home_status_message = "Event is ended"
    elif capacity_per_day > 0 and all_days_sold_out:
        home_status_message = "All attendance dates are sold out"

    return {
        "start_dt": start_dt,
        "end_dt": end_dt,
        "is_upcoming": is_upcoming,
        "is_live": is_live,
        "is_ended": is_ended,
        "is_sold_out": is_sold_out,
        "all_days_sold_out": all_days_sold_out,
        "remaining_tickets": remaining_tickets,
        "status": "ended" if is_ended else ("live" if is_live else "upcoming"),
        "home_status_message": home_status_message,
        "next_available_date": next_available_date
    }


def serialize_event_row(row, all_days_sold_out=False):
    prediction = build_crowd_prediction(row)
    timing = get_event_runtime_status(row, all_days_sold_out=all_days_sold_out)
    staff_alert = build_staff_alert_state(row)
    return {
        "id": row["id"],
        "organizer_id": row["organizer_id"],
        "organizer_name": row["organizer_name"] if "organizer_name" in row.keys() else "",
        "name": row["name"],
        "location": row["location"],
        "city": row["city"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "description": row["description"],
        "capacity": row["capacity"],
        "capacity_per_day": int(row["capacity_per_day"]) if "capacity_per_day" in row.keys() else 0,
        "ticket_price": row["ticket_price"],
        "tickets_sold": row["tickets_sold"],
        "attendance_count": row["attendance_count"],
        "category": row["category"],
        "crowd_level": calculate_crowd_level(row["attendance_count"], row["capacity"]),
        "prediction": prediction,
        "remaining_tickets": timing["remaining_tickets"],
        "time_status": timing["status"],
        "is_upcoming": timing["is_upcoming"],
        "is_live": timing["is_live"],
        "is_ended": timing["is_ended"],
        "is_sold_out": timing["is_sold_out"],
        "all_days_sold_out": timing["all_days_sold_out"],
        "home_status_message": timing["home_status_message"],
        "next_available_date": timing["next_available_date"],
        "emergency_active": bool(row["emergency_active"]) if "emergency_active" in row.keys() else False,
        "emergency_type": row["emergency_type"] if "emergency_type" in row.keys() else "",
        "emergency_message": row["emergency_message"] if "emergency_message" in row.keys() else "",
        "emergency_started_at": row["emergency_started_at"] if "emergency_started_at" in row.keys() else "",
        "emergency_cleared_at": row["emergency_cleared_at"] if "emergency_cleared_at" in row.keys() else "",
        "staff_alert_active": staff_alert["active"],
        "staff_alert_type": staff_alert["type"],
        "staff_alert_severity": staff_alert["severity"],
        "staff_alert_title": staff_alert["title"],
        "staff_alert_message": staff_alert["message"],
        "entry_locked": staff_alert["entry_locked"],
        "entry_lock_reason": staff_alert["entry_lock_reason"]
    }


CODE39_PATTERNS = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    "A": "wnnnnwnnw",
    "B": "nnwnnwnnw",
    "C": "wnwnnwnnn",
    "D": "nnnnwwnnw",
    "E": "wnnnwwnnn",
    "F": "nnwnwwnnn",
    "G": "nnnnnwwnw",
    "H": "wnnnnwwnn",
    "I": "nnwnnwwnn",
    "J": "nnnnwwwnn",
    "K": "wnnnnnnww",
    "L": "nnwnnnnww",
    "M": "wnwnnnnwn",
    "N": "nnnnwnnww",
    "O": "wnnnwnnwn",
    "P": "nnwnwnnwn",
    "Q": "nnnnnnwww",
    "R": "wnnnnnwwn",
    "S": "nnwnnnwwn",
    "T": "nnnnwnwwn",
    "U": "wwnnnnnnw",
    "V": "nwwnnnnnw",
    "W": "wwwnnnnnn",
    "X": "nwnnwnnnw",
    "Y": "wwnnwnnnn",
    "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    "$": "nwnwnwnnn",
    "/": "nwnwnnnwn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn"
}


def escape_xml(value):
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def escape_pdf_text(value):
    return str(value or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_code39_barcode_svg(value, height=86, narrow=3):
    normalized = str(value or "").strip().upper()
    if not normalized:
        return ""

    encoded = "*" + normalized + "*"
    if any(char not in CODE39_PATTERNS for char in encoded):
        return ""

    quiet_zone = narrow * 8
    wide = narrow * 3
    text_height = 26
    x = quiet_zone
    rects = []

    for char in encoded:
        pattern = CODE39_PATTERNS[char]
        for index, width_key in enumerate(pattern):
            bar_width = wide if width_key == "w" else narrow
            if index % 2 == 0:
                rects.append(
                    f'<rect x="{x}" y="0" width="{bar_width}" height="{height}" fill="#111827" />'
                )
            x += bar_width
        x += narrow

    total_width = x + quiet_zone
    label_y = height + 18

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="{height + text_height}" '
        f'viewBox="0 0 {total_width} {height + text_height}" role="img" aria-label="Barcode for {escape_xml(normalized)}">'
        '<rect width="100%" height="100%" fill="#ffffff" />'
        + "".join(rects) +
        f'<text x="{total_width / 2}" y="{label_y}" text-anchor="middle" '
        'font-family="Arial, sans-serif" font-size="15" letter-spacing="2" fill="#111827">'
        f'{escape_xml(normalized)}</text></svg>'
    )


def build_barcode_data_uri(value):
    svg = build_code39_barcode_svg(value)
    if not svg:
        return ""
    encoded_svg = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return "data:image/svg+xml;base64," + encoded_svg


def build_code39_barcode_email_html(value, height=82, narrow=3):
    normalized = str(value or "").strip().upper()
    if not normalized:
        return ""

    encoded = "*" + normalized + "*"
    if any(char not in CODE39_PATTERNS for char in encoded):
        return ""

    wide = narrow * 3
    quiet_zone = narrow * 8
    cells = []

    def append_cell(width, is_bar):
        pixel_width = max(1, int(round(width)))
        background = "#111827" if is_bar else "#ffffff"
        cells.append(
            f'<td aria-hidden="true" style="padding:0;margin:0;width:{pixel_width}px;min-width:{pixel_width}px;'
            f'height:{int(height)}px;line-height:0;font-size:0;background:{background};">&nbsp;</td>'
        )

    append_cell(quiet_zone, False)
    for char in encoded:
        pattern = CODE39_PATTERNS[char]
        for index, width_key in enumerate(pattern):
            append_cell(wide if width_key == "w" else narrow, index % 2 == 0)
        append_cell(narrow, False)
    append_cell(quiet_zone, False)

    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:0 auto;border-collapse:collapse;background:#ffffff;">'
        '<tr>'
        + "".join(cells) +
        '</tr>'
        + f'<tr><td colspan="{len(cells)}" align="center" '
        'style="padding:12px 0 0 0;font-family:Arial,sans-serif;font-size:15px;letter-spacing:2px;color:#111827;">'
        f'{escape_xml(normalized)}</td></tr></table>'
    )


def build_code39_barcode_pdf_bytes(value, height=128, narrow=2.4):
    normalized = str(value or "").strip().upper()
    if not normalized:
        return b""

    encoded = "*" + normalized + "*"
    if any(char not in CODE39_PATTERNS for char in encoded):
        return b""

    wide = narrow * 3
    quiet_zone = narrow * 12
    padding = 36
    label_y = 28
    bar_y = 62
    x = padding + quiet_zone
    rect_commands = []

    for char in encoded:
        pattern = CODE39_PATTERNS[char]
        for index, width_key in enumerate(pattern):
            bar_width = wide if width_key == "w" else narrow
            if index % 2 == 0:
                rect_commands.append(f"{x:.2f} {bar_y:.2f} {bar_width:.2f} {height:.2f} re f")
            x += bar_width
        x += narrow

    content_width = x + quiet_zone + padding
    page_width = max(420, int(content_width))
    page_height = int(bar_y + height + 54)
    text_x = padding + quiet_zone

    content_stream = (
        "1 1 1 rg\n"
        f"0 0 {page_width} {page_height} re f\n"
        "0 0 0 rg\n"
        + "\n".join(rect_commands) + "\n"
        + f"BT /F1 18 Tf {text_x:.2f} {label_y:.2f} Td ({escape_pdf_text(normalized)}) Tj ET\n"
    ).encode("utf-8")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ).encode("utf-8"),
        b"<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
    ]

    pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]

    for index, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n"

    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF"
    ).encode("ascii")
    return pdf


def build_barcode_attachment(value, filename_prefix="ticket"):
    pdf_bytes = build_code39_barcode_pdf_bytes(value)
    if not pdf_bytes:
        return None

    barcode_dir = os.path.join(app.root_path, 'uploads', 'ticket_barcodes')
    os.makedirs(barcode_dir, exist_ok=True)
    safe_code = ''.join(char if char.isalnum() else '-' for char in str(value or '').upper()).strip('-') or 'ticket'
    filename = f"{filename_prefix}-{safe_code}-{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(barcode_dir, filename)

    with open(file_path, 'wb') as pdf_file:
        pdf_file.write(pdf_bytes)

    return {
        "path": file_path,
        "filename": filename
    }


def build_qr_code_img_tag(value, size=180):
    """Return an <img> tag with an inline base64-encoded SVG QR code."""
    try:
        import qrcode
        import qrcode.image.svg
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=5,
            border=2,
        )
        qr.add_data(str(value))
        qr.make(fit=True)
        img = qr.make_image(image_factory=qrcode.image.svg.SvgFillImage)
        buf = io.BytesIO()
        img.save(buf)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return (
            f'<img src="data:image/svg+xml;base64,{b64}" '
            f'width="{size}" height="{size}" alt="{value}" '
            f'style="display:block;margin:0 auto;" />'
        )
    except Exception as e:
        print(f"[QR] fallback to barcode: {e}")
        return build_code39_barcode_email_html(value)


def build_ticket_card_html(index, total, code, event_name):
    """Return a square ticket card for use inside a purchase confirmation email."""
    qr_img = build_qr_code_img_tag(code, size=180)
    label = f"TICKET {index + 1}"
    if total > 1:
        label += f" / {total}"
    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
      style="width:100%;max-width:260px;margin:0 auto 24px auto;
             border:1.5px solid #e2d0d8;border-radius:18px;
             background:#ffffff;overflow:hidden;">
      <tr>
        <td style="background:#9B1040;padding:10px 16px;text-align:center;">
          <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                       color:#ffffff;letter-spacing:0.14em;">{label}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px 8px 20px;text-align:center;">
          <div style="background:#f9fafb;border-radius:12px;padding:12px;display:inline-block;">
            {qr_img}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 16px 4px 16px;text-align:center;">
          <span style="font-family:Courier New,monospace;font-size:14px;font-weight:700;
                       color:#111827;letter-spacing:0.1em;">{code}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 16px 14px 16px;text-align:center;">
          <span style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280;">
            {event_name} &mdash; Scan at entrance
          </span>
        </td>
      </tr>
    </table>
    """


def build_crowd_prediction(event_row, today_attendance=None, today_capacity=None, today_tickets_sold=None):
    capacity_per_day = int(event_row["capacity_per_day"] or 0) if "capacity_per_day" in event_row.keys() else 0
    if today_attendance is not None:
        # Use today-scoped data for all events so predictions respect the current day
        attendance_count = today_attendance
        capacity = today_capacity if today_capacity is not None else (capacity_per_day if capacity_per_day > 0 else int(event_row["capacity"] or 0))
        tickets_sold = today_tickets_sold if today_tickets_sold is not None else int(event_row["tickets_sold"] or 0)
    else:
        capacity = int(event_row["capacity"] or 0)
        tickets_sold = int(event_row["tickets_sold"] or 0)
        attendance_count = int(event_row["attendance_count"] or 0)
    start_dt = parse_event_datetime(event_row["start_date"], event_row["start_time"])
    end_dt = parse_event_datetime(event_row["end_date"] or event_row["start_date"], event_row["end_time"])
    now = get_local_now_naive()

    if capacity <= 0:
        return {
            "predicted_final_attendance": attendance_count,
            "predicted_peak_attendance": attendance_count,
            "predicted_peak_percent": 0,
            "predicted_crowd_level": "Unknown",
            "forecast_confidence": "Low",
            "forecast_summary": "Not enough capacity data to generate a forecast.",
            "next_hour_expected_entries": 0,
            "hourly_forecast": []
        }

    sell_through = tickets_sold / capacity if capacity else 0
    check_in_rate = (attendance_count / tickets_sold) if tickets_sold > 0 else 0

    is_live = bool(start_dt and end_dt and start_dt <= now <= end_dt)
    is_upcoming = bool(start_dt and now < start_dt)
    is_finished = bool(end_dt and now > end_dt)

    default_show_rate = 0.78
    if sell_through >= 0.9:
        default_show_rate = 0.92
    elif sell_through >= 0.7:
        default_show_rate = 0.86
    elif sell_through >= 0.4:
        default_show_rate = 0.8

    expected_show_rate = max(default_show_rate, check_in_rate if tickets_sold > 0 else 0)
    projected_from_sales = tickets_sold * expected_show_rate

    projected_from_live_pace = attendance_count
    progress_ratio = 0
    if is_live and start_dt and end_dt and end_dt > start_dt:
        elapsed = (now - start_dt).total_seconds()
        duration = (end_dt - start_dt).total_seconds()
        progress_ratio = clamp(elapsed / duration, 0.05, 1)
        projected_from_live_pace = attendance_count / progress_ratio

    if is_finished:
        predicted_final_attendance = attendance_count
    elif is_live:
        blended_projection = (projected_from_sales * 0.55) + (projected_from_live_pace * 0.45)
        predicted_final_attendance = round(max(attendance_count, blended_projection))
    else:
        urgency_bonus = 0
        if start_dt:
            hours_until_start = max((start_dt - now).total_seconds() / 3600, 0)
            if hours_until_start <= 6:
                urgency_bonus = tickets_sold * 0.08
            elif hours_until_start <= 24:
                urgency_bonus = tickets_sold * 0.04
        predicted_final_attendance = round(max(attendance_count, projected_from_sales + urgency_bonus))

    predicted_final_attendance = int(clamp(predicted_final_attendance, attendance_count, capacity))

    rush_factor = 0
    if is_live:
        rush_factor = 0.08 if progress_ratio < 0.35 else 0.12 if progress_ratio < 0.75 else 0.04
    elif is_upcoming:
        rush_factor = 0.1 if sell_through >= 0.7 else 0.05

    predicted_peak_attendance = int(clamp(round(predicted_final_attendance * (1 + rush_factor)), attendance_count, capacity))
    predicted_peak_percent = int(round((predicted_peak_attendance / capacity) * 100)) if capacity else 0
    predicted_crowd_level = calculate_crowd_level(predicted_peak_attendance, capacity)

    confidence_score = 0.35
    if tickets_sold > 0:
        confidence_score += 0.25
    if attendance_count > 0:
        confidence_score += 0.2
    if is_live:
        confidence_score += 0.15
    if start_dt and end_dt:
        confidence_score += 0.05

    confidence_score = clamp(confidence_score, 0, 0.95)
    if confidence_score >= 0.75:
        forecast_confidence = "High"
    elif confidence_score >= 0.5:
        forecast_confidence = "Medium"
    else:
        forecast_confidence = "Low"

    next_hour_expected_entries = 0
    if is_live and end_dt and start_dt and end_dt > now:
        hours_left = max((end_dt - now).total_seconds() / 3600, 1)
        remaining_attendance = max(predicted_final_attendance - attendance_count, 0)
        next_hour_expected_entries = int(round(min(remaining_attendance, remaining_attendance / hours_left)))
    elif is_upcoming and start_dt:
        hours_until_start = max((start_dt - now).total_seconds() / 3600, 1)
        next_hour_expected_entries = int(round(max(predicted_final_attendance - attendance_count, 0) / max(hours_until_start, 6)))

    forecast_summary = (
        "Expected peak crowd is " + str(predicted_peak_percent) + "% of capacity, with about " +
        str(predicted_final_attendance) + " attendees likely to arrive overall."
    )

    hourly_forecast = []
    forecast_base = attendance_count
    future_total = max(predicted_final_attendance, attendance_count)
    forecast_points = []

    if start_dt and end_dt and end_dt >= start_dt:
        point_time = start_dt

        while point_time <= end_dt:
            if not is_live or point_time >= now:
                forecast_points.append(point_time)
            point_time += timedelta(hours=1)
            if len(forecast_points) >= 6:
                break

        if is_live and not forecast_points:
            forecast_points.append(end_dt)

    if not forecast_points:
        for step in range(1, 7):
            forecast_points.append(now + timedelta(hours=step))

    total_points = max(len(forecast_points), 1)

    for index, point_time in enumerate(forecast_points):
        label = point_time.strftime("%I:%M %p").lstrip("0")

        if is_finished:
            predicted_attendance = attendance_count
        elif is_live:
            progress = clamp((index + 1) / total_points, 0, 1)
            predicted_attendance = round(forecast_base + ((future_total - forecast_base) * progress))
        elif is_upcoming:
            progress = clamp((index + 1) / total_points, 0, 1)
            predicted_attendance = round(attendance_count + ((future_total - attendance_count) * progress * 0.75))
        else:
            predicted_attendance = attendance_count

        predicted_attendance = int(clamp(predicted_attendance, attendance_count, capacity))
        hourly_forecast.append({
            "label": label,
            "attendance": predicted_attendance,
            "percent": int(round((predicted_attendance / capacity) * 100)) if capacity else 0
        })

    return {
        "predicted_final_attendance": predicted_final_attendance,
        "predicted_peak_attendance": predicted_peak_attendance,
        "predicted_peak_percent": predicted_peak_percent,
        "predicted_crowd_level": predicted_crowd_level,
        "forecast_confidence": forecast_confidence,
        "forecast_summary": forecast_summary,
        "next_hour_expected_entries": next_hour_expected_entries,
        "hourly_forecast": hourly_forecast
    }


def create_notification(user_id, event_id, notif_type, title, message, send_email_copy=True):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT email, role FROM users WHERE id = ?", (user_id,))
    recipient_user = cur.fetchone()
    recipient_email = recipient_user["email"] if recipient_user else None
    recipient_role = str(recipient_user["role"]).strip().lower() if recipient_user and recipient_user["role"] else ''
    notifications_enabled = True

    if recipient_role == 'customer':
        notifications_enabled = get_notification_preference(cur, user_email=recipient_email, user_id=user_id)

    # Customer notification settings control normal notifications only.
    if recipient_role == 'customer' and str(notif_type or '').strip().lower() != 'emergency' and not notifications_enabled:
        conn.close()
        return

    cur.execute("""
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, app_now())
    """, (user_id, event_id, notif_type, title, message))

    event_name = None
    if event_id:
        cur.execute("SELECT name FROM events WHERE id = ?", (event_id,))
        event_row = cur.fetchone()
        event_name = event_row["name"] if event_row else None

    conn.commit()
    conn.close()

    if send_email_copy and recipient_email and not str(recipient_email).strip().lower().endswith('@crowdanalyzing.local'):
        heading = str(title or 'Notification').strip() or 'Notification'
        detail = str(message or '').strip() or 'A new update is available in Crowd Analyzing.'
        event_html = f'<p><strong>Event:</strong> {event_name}</p>' if event_name else ''
        send_email(
            to_list=[recipient_email],
            subject=heading,
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">{heading}</h2>
              {event_html}
              <p>{detail}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#6b7280;font-size:0.85em;">This email was sent automatically from Crowd Analyzing because a new notification was created for your account.</p>
            </div>
            """
        )


def mark_notifications_as_read(user_id, notif_type=None):
    conn = get_db_connection()
    cur = conn.cursor()

    params = [user_id]
    sql = "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0"

    if notif_type:
        sql += " AND type = ?"
        params.append(notif_type)

    cur.execute(sql, tuple(params))
    updated_count = cur.rowcount or 0
    conn.commit()
    conn.close()
    return updated_count


# ============================================================
#  FRONTEND
# ============================================================

@app.route('/')
def home():
    return send_from_directory('templates', 'index.html')

@app.route('/password-reset')
def password_reset_page():
    return send_from_directory('templates', 'password-reset.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)


# ============================================================
#  USERS
# ============================================================

@app.route('/api/signup', methods=['POST'])
def signup():
    data, files = get_request_data()

    full_name = str(data.get('full_name', '')).strip()
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', ''))
    role = str(data.get('role', '')).strip().lower()
    organizer_reason = str(data.get('organizer_reason', '')).strip()
    notifications_enabled = parse_bool_value(data.get('notifications_enabled'), True)

    if not full_name or not email or not password or not role:
        return jsonify({"message": "Missing fields"}), 400

    if role not in ['customer', 'organizer']:
        return jsonify({"message": "Create account is only available for attendees and event organizers."}), 400

    if len(password) < 8:
        return jsonify({"message": "Password must be at least 8 characters long."}), 400

    conn = None
    proof_path = None
    proof_name = None
    previous_proof_path = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                id,
                role,
                approval_status,
                organizer_proof_path
            FROM users
            WHERE lower(email) = ?
        """, (email,))
        existing_user = cur.fetchone()
        is_reapplication = False

        if existing_user:
            existing_role = str(existing_user["role"] or '').strip().lower()
            existing_approval_status = str(existing_user["approval_status"] or 'approved').strip().lower()
            is_reapplication = (
                role == 'organizer' and
                existing_role == 'organizer' and
                existing_approval_status == 'rejected'
            )
            if not is_reapplication:
                return jsonify({"message": "Email already exists"}), 409

        approval_status = 'approved'
        user_message = 'Your account has been created. Explore events and buy tickets to receive real-time crowd alerts.'

        if role == 'organizer':
            if not organizer_reason:
                return jsonify({"message": "Please explain why you want to become an organizer."}), 400

            try:
                proof_path, proof_name = save_organizer_proof(files.get('organizer_proof') if files else None)
            except ValueError as proof_error:
                return jsonify({"message": str(proof_error)}), 400

            approval_status = 'pending'
            user_message = 'Your organizer application is pending admin review. We will notify you after approval.'

        if is_reapplication:
            user_id = existing_user["id"]
            previous_proof_path = str(existing_user["organizer_proof_path"] or '').strip()
            cur.execute("""
                UPDATE users
                SET
                    full_name = ?,
                    password = ?,
                    approval_status = 'pending',
                    organizer_application_reason = ?,
                    organizer_proof_path = ?,
                    organizer_proof_name = ?,
                    reviewed_at = NULL,
                    reviewed_by_email = NULL,
                    created_at = app_now()
                WHERE id = ?
            """, (
                full_name,
                password,
                organizer_reason,
                proof_path,
                proof_name,
                user_id
            ))
        else:
            cur.execute("""
                INSERT INTO users (
                    full_name, email, password, role, approval_status,
                    organizer_application_reason, organizer_proof_path, organizer_proof_name, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, app_now())
            """, (
                full_name,
                email,
                password,
                role,
                approval_status,
                organizer_reason if role == 'organizer' else None,
                proof_path if role == 'organizer' else None,
                proof_name if role == 'organizer' else None
            ))

            user_id = cur.lastrowid

        cur.execute("""
            INSERT OR IGNORE INTO notification_preferences (user_email, crowd_alerts_enabled)
            VALUES (?, ?)
        """, (email, 1 if notifications_enabled else 0))

        if role != 'customer' or notifications_enabled:
            cur.execute("""
                INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
                VALUES (?, NULL, 'update', ?, ?, 0, app_now())
            """, (
                user_id,
                (
                    'Organizer application resubmitted'
                    if is_reapplication
                    else ('Organizer application received' if role == 'organizer' else 'Welcome to Crowd Analyzing!')
                ),
                user_message
            ))

        if role == 'organizer':
            for admin_user_id in get_admin_user_ids(cur):
                cur.execute("""
                    INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
                    VALUES (?, NULL, 'update', 'New organizer application', ?, 0, app_now())
                """, (
                    admin_user_id,
                    full_name + (
                        ' submitted a new organizer application after a previous rejection and is waiting for your review.'
                        if is_reapplication
                        else ' applied to become an event organizer and is waiting for your review.'
                    )
                ))

        conn.commit()

        if previous_proof_path and previous_proof_path != proof_path and os.path.exists(previous_proof_path):
            try:
                os.remove(previous_proof_path)
            except OSError:
                pass

        if role == 'organizer':
            send_email(
                to_list=build_account_email_recipients(email),
                subject="Organizer application resubmitted" if is_reapplication else "Organizer application received",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#9B1040;margin-top:0;">{"Organizer application resubmitted" if is_reapplication else "Organizer application submitted"}</h2>
                  <p>Hi {full_name}, your organizer application has been received and is now <strong>pending admin review</strong>.</p>
                  {"<p>Your previous request had been rejected, and this new application will now be reviewed again.</p>" if is_reapplication else ""}
                  <p>We will notify you when the admin approves or rejects your request.</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                  <p style="color:#6b7280;font-size:0.85em;">If you did not submit this application, please ignore this email.</p>
                </div>
                """
            )

            review_recipients = build_review_action_recipients()
            if review_recipients:
                email_links = build_organizer_review_email_links(user_id, base_url=get_admin_email_base_url())
                send_email(
                    to_list=review_recipients,
                    subject="New organizer application awaiting approval",
                    html_body=f"""
                    <div style="font-family:sans-serif;max-width:650px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                      <h2 style="color:#9B1040;margin-top:0;">{"Organizer application resubmitted" if is_reapplication else "New organizer application"}</h2>
                      <p><strong>Name:</strong> {full_name}</p>
                      <p><strong>Email:</strong> {email}</p>
                      <p><strong>Reason:</strong><br>{organizer_reason}</p>
                      <p><strong>Proof file:</strong> {proof_name}</p>
                      {"<p><strong>Previous status:</strong> Rejected organizer is reapplying.</p>" if is_reapplication else ""}
                      <div style="margin:24px 0;display:flex;gap:12px;flex-wrap:wrap;">
                        <a href="{email_links['review_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#9B1040;color:#ffffff;text-decoration:none;font-weight:800;">Review Application</a>
                        <a href="{email_links['proof_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;font-weight:800;">Open Proof File</a>
                        <a href="{email_links['proof_download_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#475569;color:#ffffff;text-decoration:none;font-weight:800;">Download Proof File</a>
                      </div>
                      <div style="margin:24px 0;display:flex;gap:12px;flex-wrap:wrap;">
                        <a href="{email_links['approve_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;">Approve Organizer</a>
                        <a href="{email_links['reject_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:800;">Reject Organizer</a>
                      </div>
                      <div style="margin-top:18px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
                        <p style="margin:0 0 10px 0;font-weight:700;color:#111827;">Direct links</p>
                        <p style="margin:0 0 8px 0;font-size:13px;word-break:break-all;"><strong>Review:</strong> <a href="{email_links['review_url']}">{email_links['review_url']}</a></p>
                        <p style="margin:0 0 8px 0;font-size:13px;word-break:break-all;"><strong>Approve:</strong> <a href="{email_links['approve_url']}">{email_links['approve_url']}</a></p>
                        <p style="margin:0 0 8px 0;font-size:13px;word-break:break-all;"><strong>Reject:</strong> <a href="{email_links['reject_url']}">{email_links['reject_url']}</a></p>
                        <p style="margin:0 0 8px 0;font-size:13px;word-break:break-all;"><strong>Proof:</strong> <a href="{email_links['proof_url']}">{email_links['proof_url']}</a></p>
                        <p style="margin:0;font-size:13px;word-break:break-all;"><strong>Download proof:</strong> <a href="{email_links['proof_download_url']}">{email_links['proof_download_url']}</a></p>
                      </div>
                      <p style="color:#6b7280;font-size:0.9em;">The proof file is also attached to this email. These action links are valid for 7 days. The app must be running, and the link must point to an address reachable from your device.</p>
                    </div>
                    """
                    ,
                    attachments=[{
                        "path": proof_path,
                        "filename": proof_name
                    }]
                )

            return jsonify({
                "message": (
                    "Your previous organizer request was rejected. A new request has been submitted and you can try again after admin review."
                    if is_reapplication
                    else "Organizer application submitted successfully. It is now pending admin approval."
                ),
                "requires_approval": True,
                "was_reapplication": is_reapplication,
                "redirect_home": is_reapplication,
                "approval_status": "pending",
                "user": {
                    "id": user_id,
                "full_name": full_name,
                "email": email,
                "role": role,
                "approval_status": "pending",
                "is_admin": is_admin_email(email),
                "notifications_enabled": notifications_enabled
            }
        }), 201

        send_email(
            to_list=build_account_email_recipients(email),
            subject="Welcome to Crowd Analyzing!",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">Welcome, {full_name}!</h2>
              <p>Your account has been created successfully on <strong>Crowd Analyzing</strong>.</p>
              <p>You can now:</p>
              <ul>
                <li>Browse and discover events</li>
                <li>Purchase tickets and get instant confirmations</li>
                <li>Receive real-time crowd level alerts for events you attend</li>
              </ul>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#6b7280;font-size:0.85em;">If you did not create this account, please ignore this email.</p>
            </div>
            """
        )

        return jsonify({
            "message": "User registered successfully",
            "user": {
                "id": user_id,
                "full_name": full_name,
                "email": email,
                "role": role,
                "approval_status": approval_status,
                "is_admin": is_admin_email(email),
                "notifications_enabled": notifications_enabled
            }
        }), 201

    except Exception as e:
        if conn:
            conn.rollback()
        if proof_path and os.path.exists(proof_path):
            try:
                os.remove(proof_path)
            except OSError:
                pass
        print("SIGNUP ERROR:", e)
        return jsonify({"message": "Server error"}), 500

    finally:
        if conn:
            conn.close()

    full_name = str(data.get('full_name', '')).strip()
    email = str(data.get('email', '')).strip().lower()
    password = data.get('password')
    role = data.get('role')

    if not full_name or not email or not password or not role:
        return jsonify({"message": "Missing fields"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO users (full_name, email, password, role)
            VALUES (?, ?, ?, ?)
        """, (full_name, email, password, role))

        user_id = cur.lastrowid

        cur.execute("""
            INSERT OR IGNORE INTO notification_preferences (user_email, crowd_alerts_enabled)
            VALUES (?, 1)
        """, (email,))

        cur.execute("""
            INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
            VALUES (?, NULL, 'update', 'Welcome to Crowd Analyzing!', ?, 0, app_now())
        """, (user_id, 'Your account has been created. Explore events and buy tickets to receive real-time crowd alerts.'))

        conn.commit()

        send_email(
            to_list=[email],
            subject="Welcome to Crowd Analyzing!",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">Welcome, {full_name}! 🎉</h2>
              <p>Your account has been created successfully on <strong>Crowd Analyzing</strong>.</p>
              <p>You can now:</p>
              <ul>
                <li>Browse and discover events</li>
                <li>Purchase tickets and get instant confirmations</li>
                <li>Receive real-time crowd level alerts for events you attend</li>
              </ul>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#6b7280;font-size:0.85em;">If you did not create this account, please ignore this email.</p>
            </div>
            """
        )

        return jsonify({"message": "User registered successfully", "user": {"id": user_id, "full_name": full_name, "email": email, "role": role}}), 201

    except sqlite3.IntegrityError:
        if conn:
            conn.rollback()
        return jsonify({"message": "Email already exists"}), 409

    except Exception as e:
        if conn:
            conn.rollback()
        print("SIGNUP ERROR:", e)
        return jsonify({"message": "Server error"}), 500

    finally:
        if conn:
            conn.close()


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}

    identifier = str(data.get('email', '')).strip()
    email = identifier.lower()
    password = data.get('password')
    role = str(data.get('role', '')).strip().lower()

    if not identifier or not password:
        return jsonify({"message": "Missing fields"}), 400

    if role not in ['customer', 'organizer', 'entry_staff']:
        return jsonify({"message": "Please choose a valid account type"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT * FROM users
        WHERE lower(email) = ? AND password = ? AND lower(role) = ?
    """, (email, password, role))

    user = cur.fetchone()

    if not user and role == 'entry_staff' and identifier.isdigit():
        cur.execute("""
            SELECT * FROM users
            WHERE id = ? AND password = ? AND lower(role) = 'entry_staff'
        """, (int(identifier), password))
        user = cur.fetchone()

    if not user:
        role_mismatch_user = None

        cur.execute("""
            SELECT role FROM users
            WHERE lower(email) = ? AND password = ?
        """, (email, password))
        role_mismatch_user = cur.fetchone()

        if not role_mismatch_user and identifier.isdigit():
            cur.execute("""
                SELECT role FROM users
                WHERE id = ? AND password = ?
            """, (int(identifier), password))
            role_mismatch_user = cur.fetchone()

        conn.close()

        if role_mismatch_user:
            actual_role = str(role_mismatch_user["role"]).strip().lower()
            return jsonify({
                "message": f'This account is registered as "{actual_role}", not "{role}". Please choose the correct role.'
            }), 403

        return jsonify({"message": "Invalid email, staff ID, or password"}), 401

    organizer_block_message = None
    if str(user["role"]).strip().lower() == 'organizer':
        organizer_block_message = get_organizer_access_message(user)

    if str(user["role"]).strip().lower() == 'entry_staff':
        staff_status = get_staff_work_status(cur, user["id"])
        if staff_status == 'removed':
            conn.close()
            return jsonify({
                "message": 'This staff account has been removed from its assigned event.',
                "work_status": staff_status
            }), 403

    if organizer_block_message:
        conn.close()
        return jsonify({
            "message": organizer_block_message,
            "approval_status": str(user["approval_status"]).strip().lower() if user["approval_status"] else "pending"
        }), 403

    user_response = build_user_response(user, cur)
    conn.close()

    return jsonify({
        "message": "Login successful",
        "user": user_response
    })


@app.route('/api/password-reset/request', methods=['POST'])
def request_password_reset():
    data = request.get_json() or {}

    email = str(data.get('email', '')).strip().lower()
    role = str(data.get('role', '')).strip().lower()

    if not email or role not in ['customer', 'organizer', 'entry_staff']:
        return jsonify({"message": "Please provide a valid email and account type"}), 400

    if role == 'entry_staff':
        return jsonify({"message": "Password reset is not available for staff accounts. Please contact the organizer who created the staff login."}), 403

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, full_name, email, role
            FROM users
            WHERE lower(email) = ? AND lower(role) = ?
            LIMIT 1
        """, (email, role))
        user = cur.fetchone()

        if user and is_password_reset_allowed_role(user["role"]):
            reset_token = generate_password_reset_token(user["id"])
            reset_url = build_absolute_url('/password-reset?token=' + reset_token, base_url=request.url_root)
            send_email(
                to_list=[user["email"]],
                subject="Reset your Crowd Analyzing password",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#9B1040;margin-top:0;">Reset your password</h2>
                  <p>Hi {user['full_name']}, we received a request to reset the password for your Crowd Analyzing account.</p>
                  <p style="margin:20px 0;">
                    <a href="{reset_url}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#9B1040;color:#ffffff;text-decoration:none;font-weight:800;">Create a new password</a>
                  </p>
                  <p>If the button does not open, use this link:</p>
                  <p style="font-size:13px;word-break:break-all;"><a href="{reset_url}">{reset_url}</a></p>
                  <p style="color:#6b7280;font-size:0.9em;">This reset link stays valid for 1 hour. If you did not request this change, you can ignore this email.</p>
                </div>
                """
            )
            create_notification(
                user_id=user["id"],
                event_id=None,
                notif_type='update',
                title='Password Reset Requested',
                message='We emailed a secure password reset link to ' + user["email"] + '.',
                send_email_copy=False
            )

        return jsonify({
            "message": "If an eligible account exists, a password reset link has been sent to that email."
        }), 200
    except Exception as e:
        print("PASSWORD RESET REQUEST ERROR:", e)
        return jsonify({"message": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/password-reset/verify', methods=['GET'])
def verify_password_reset_request():
    token = str(request.args.get('token', '')).strip()
    if not token:
        return jsonify({"message": "Missing reset token"}), 400

    conn = None
    try:
        payload = verify_password_reset_token(token)
        user_id = int(payload.get("user_id"))

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, full_name, email, role
            FROM users
            WHERE id = ?
        """, (user_id,))
        user = cur.fetchone()

        if not user or not is_password_reset_allowed_role(user["role"]):
            return jsonify({"message": "This password reset link is not valid for that account"}), 404

        return jsonify({
            "message": "Reset link is valid",
            "email": mask_email_address(user["email"]),
            "role": user["role"],
            "full_name": user["full_name"]
        }), 200
    except SignatureExpired:
        return jsonify({"message": "This password reset link has expired. Please request a new one."}), 410
    except BadSignature:
        return jsonify({"message": "This password reset link is invalid. Please request a new one."}), 400
    except Exception as e:
        print("PASSWORD RESET VERIFY ERROR:", e)
        return jsonify({"message": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/password-reset/confirm', methods=['POST'])
def confirm_password_reset():
    data = request.get_json() or {}

    token = str(data.get('token', '')).strip()
    password = str(data.get('password', ''))
    confirm_password = str(data.get('confirm_password', ''))

    if not token or not password or not confirm_password:
        return jsonify({"message": "Missing fields"}), 400

    if len(password) < 8:
        return jsonify({"message": "Password must be at least 8 characters long."}), 400

    if password != confirm_password:
        return jsonify({"message": "Passwords do not match"}), 400

    conn = None
    try:
        payload = verify_password_reset_token(token)
        user_id = int(payload.get("user_id"))

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, full_name, email, role
            FROM users
            WHERE id = ?
        """, (user_id,))
        user = cur.fetchone()

        if not user or not is_password_reset_allowed_role(user["role"]):
            return jsonify({"message": "This password reset link is not valid for that account"}), 404

        cur.execute("""
            UPDATE users
            SET password = ?
            WHERE id = ?
        """, (password, user_id))
        conn.commit()

        create_notification(
            user_id=user_id,
            event_id=None,
            notif_type='update',
            title='Password Updated',
            message='Your Crowd Analyzing password was updated successfully.',
            send_email_copy=False
        )

        send_email(
            to_list=[user["email"]],
            subject="Your Crowd Analyzing password was changed",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">Password updated</h2>
              <p>Hi {user['full_name']}, your Crowd Analyzing password has been changed successfully.</p>
              <p>If you did not make this change, please request another password reset immediately.</p>
            </div>
            """
        )

        return jsonify({
            "message": "Password reset successful. You can now sign in with your new password."
        }), 200
    except SignatureExpired:
        return jsonify({"message": "This password reset link has expired. Please request a new one."}), 410
    except BadSignature:
        return jsonify({"message": "This password reset link is invalid. Please request a new one."}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        print("PASSWORD RESET CONFIRM ERROR:", e)
        return jsonify({"message": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/auth/validate', methods=['POST'])
def validate_auth():
    data = request.get_json() or {}

    user_id = data.get('user_id')
    role = str(data.get('role', '')).strip().lower()

    if not user_id:
        return jsonify({"message": "Missing user_id"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, full_name, email, role, approval_status
            FROM users
            WHERE id = ?
        """, (int(user_id),))
        user = cur.fetchone()

        if not user:
            return jsonify({"message": "Saved session not found. Please sign in again."}), 404

        if role and str(user["role"]).strip().lower() != role:
            return jsonify({"message": "Saved session role does not match. Please sign in again."}), 409

        organizer_block_message = None
        if str(user["role"]).strip().lower() == 'organizer':
            organizer_block_message = get_organizer_access_message(user)

        if str(user["role"]).strip().lower() == 'entry_staff':
            staff_status = get_staff_work_status(cur, user["id"])
            if staff_status == 'removed':
                return jsonify({
                    "message": "This staff account has been removed from its assigned event.",
                    "work_status": staff_status
                }), 403

        if organizer_block_message:
            return jsonify({
                "message": organizer_block_message,
                "approval_status": str(user["approval_status"]).strip().lower() if user["approval_status"] else "pending"
            }), 403

        return jsonify({
            "message": "Session is valid",
            "user": build_user_response(user, cur)
        }), 200

    except (TypeError, ValueError):
        return jsonify({"message": "Invalid user_id"}), 400

    except Exception as e:
        print("AUTH VALIDATE ERROR:", e)
        return jsonify({"message": "Server error"}), 500

    finally:
        if conn:
            conn.close()


@app.route('/api/profile/name', methods=['POST'])
def update_profile_name():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    full_name = str(data.get('full_name', '')).strip()

    if not user_id or not full_name:
        return jsonify({"message": "Missing fields"}), 400

    if len(full_name) < 2:
        return jsonify({"message": "Name must be at least 2 characters long"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            UPDATE users
            SET full_name = ?
            WHERE id = ?
        """, (full_name, int(user_id)))

        if cur.rowcount < 1:
            return jsonify({"message": "User not found"}), 404

        cur.execute("""
            SELECT id, full_name, email, role, approval_status
            FROM users
            WHERE id = ?
        """, (int(user_id),))
        user = cur.fetchone()
        conn.commit()

        return jsonify({
            "message": "Name updated successfully",
            "user": build_user_response(user, cur)
        }), 200
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid user"}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        print("PROFILE NAME UPDATE ERROR:", e)
        return jsonify({"message": "Server error"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/customer/history/<int:user_id>', methods=['GET'])
def get_customer_event_history(user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, role
        FROM users
        WHERE id = ?
    """, (user_id,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "User not found"}), 404

    if str(user["role"] or '').strip().lower() != 'customer':
        conn.close()
        return jsonify({"message": "Only customer accounts have event history"}), 403

    cur.execute("""
        SELECT
            tp.id AS purchase_id,
            tp.purchase_time,
            tp.status,
            e.id AS event_id,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            e.start_time,
            e.end_time,
            e.location,
            e.city
        FROM ticket_purchases tp
        JOIN events e ON e.id = tp.event_id
        WHERE tp.user_id = ?
        ORDER BY e.start_date DESC, e.start_time DESC, tp.id DESC
    """, (user_id,))
    rows = cur.fetchall()
    conn.close()

    history = []
    for row in rows:
        history.append({
            "purchase_id": row["purchase_id"],
            "event_id": row["event_id"],
            "event_name": row["event_name"],
            "event_date": row["start_date"],
            "event_end_date": row["end_date"],
            "event_time": row["start_time"],
            "event_end_time": row["end_time"],
            "location": row["location"],
            "city": row["city"],
            "purchase_time": row["purchase_time"],
            "status": get_ticket_status_label(row["status"]),
            "attended": str(row["status"] or '').strip().lower() == 'done'
        })

    return jsonify(history)


# ============================================================
#  ADMIN ORGANIZER REVIEW
# ============================================================

@app.route('/api/admin/organizer-applications', methods=['GET'])
def get_admin_organizer_applications():
    admin_user_id = request.args.get('admin_user_id')

    conn = get_db_connection()
    cur = conn.cursor()

    admin_user = get_admin_user(cur, admin_user_id)
    if not admin_user:
        conn.close()
        return jsonify({"message": "Admin access required"}), 403

    cur.execute("""
        SELECT
            id,
            full_name,
            email,
            role,
            approval_status,
            organizer_application_reason,
            organizer_proof_name,
            reviewed_at,
            reviewed_by_email,
            created_at
        FROM users
        WHERE role = 'organizer'
        ORDER BY
            CASE lower(COALESCE(approval_status, 'approved'))
                WHEN 'pending' THEN 0
                WHEN 'rejected' THEN 1
                ELSE 2
            END,
            datetime(COALESCE(created_at, app_now())) DESC,
            id DESC
    """)

    rows = cur.fetchall()
    conn.close()

    applications = []
    for row in rows:
        applications.append({
            "id": row["id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "role": row["role"],
            "approval_status": row["approval_status"] or "approved",
            "organizer_application_reason": row["organizer_application_reason"] or "",
            "organizer_proof_name": row["organizer_proof_name"] or "",
            "reviewed_at": row["reviewed_at"],
            "reviewed_by_email": row["reviewed_by_email"],
            "created_at": row["created_at"]
        })

    return jsonify(applications)


@app.route('/api/admin/organizer-applications/<int:user_id>/proof', methods=['GET'])
def get_admin_organizer_proof(user_id):
    admin_user_id = request.args.get('admin_user_id')

    conn = get_db_connection()
    cur = conn.cursor()

    admin_user = get_admin_user(cur, admin_user_id)
    if not admin_user:
        conn.close()
        return jsonify({"message": "Admin access required"}), 403

    cur.execute("""
        SELECT organizer_proof_path, organizer_proof_name
        FROM users
        WHERE id = ? AND role = 'organizer'
    """, (user_id,))
    organizer = cur.fetchone()
    conn.close()

    if not organizer or not organizer["organizer_proof_path"]:
        return jsonify({"message": "Proof file not found"}), 404

    proof_path = organizer["organizer_proof_path"]
    if not os.path.exists(proof_path):
        return jsonify({"message": "Proof file is missing from storage"}), 404

    return send_from_directory(
        os.path.dirname(proof_path),
        os.path.basename(proof_path),
        download_name=organizer["organizer_proof_name"] or os.path.basename(proof_path),
        as_attachment=False
    )


@app.route('/api/admin/organizer-applications/<int:user_id>/review', methods=['POST'])
def review_organizer_application(user_id):
    data = request.get_json() or {}
    admin_user_id = data.get('admin_user_id')
    decision = str(data.get('decision', '')).strip().lower()

    if decision not in ['approved', 'rejected']:
        return jsonify({"message": "Decision must be approved or rejected"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    admin_user = get_admin_user(cur, admin_user_id)
    if not admin_user:
        conn.close()
        return jsonify({"message": "Admin access required"}), 403

    organizer, title, message = apply_organizer_review(
        cur=cur,
        user_id=user_id,
        decision=decision,
        reviewed_by_email=admin_user["email"]
    )

    if not organizer:
        conn.close()
        return jsonify({"message": "Organizer application not found"}), 404

    conn.commit()
    conn.close()

    # Send email notification to admin
    send_email(
        to_list=get_admin_recipient_emails(),
        subject=f"Organizer application {decision}",
        html_body=f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="color:#9B1040;margin-top:0;">Organizer application {decision}</h2>
          <p>An organizer application has been {decision} by admin {admin_user["full_name"]} ({admin_user["email"]}).</p>
          <p><strong>Name:</strong> {organizer["full_name"]}</p>
          <p><strong>Email:</strong> {organizer["email"]}</p>
          <p><strong>Decision:</strong> {decision.title()}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
          <p style="color:#6b7280;font-size:0.85em;">This is an automated notification from Crowd Analyzing.</p>
        </div>
        """
    )

    send_email(
        to_list=build_account_email_recipients(organizer["email"]),
        subject=title,
        html_body=build_organizer_review_customer_email(
            full_name=organizer["full_name"],
            title=title,
            message=message,
            decision=decision,
            base_url=request.url_root
        )
    )

    return jsonify({"message": title})


@app.route('/admin/email-proof/<int:user_id>', methods=['GET'])
def get_email_organizer_proof(user_id):
    token = str(request.args.get('token', '')).strip()
    download_requested = str(request.args.get('download', '')).strip().lower() in ['1', 'true', 'yes']
    if not token:
        return '<h2>Missing proof token.</h2>', 400

    try:
        payload = verify_organizer_proof_email_token(token)
    except SignatureExpired:
        return '<h2>This proof link has expired.</h2>', 403
    except BadSignature:
        return '<h2>Invalid proof link.</h2>', 403

    if int(payload.get('user_id', 0)) != int(user_id):
        return '<h2>Proof link does not match this application.</h2>', 403

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT organizer_proof_path, organizer_proof_name
        FROM users
        WHERE id = ? AND role = 'organizer'
    """, (user_id,))
    organizer = cur.fetchone()
    conn.close()

    if not organizer or not organizer["organizer_proof_path"]:
        return '<h2>Proof file not found.</h2>', 404

    proof_path = organizer["organizer_proof_path"]
    if not os.path.exists(proof_path):
        return '<h2>Proof file is missing from storage.</h2>', 404

    return send_from_directory(
        os.path.dirname(proof_path),
        os.path.basename(proof_path),
        download_name=organizer["organizer_proof_name"] or os.path.basename(proof_path),
        as_attachment=download_requested
    )


@app.route('/admin/email-review-panel', methods=['GET'])
def organizer_email_review_panel():
    token = str(request.args.get('token', '')).strip()
    if not token:
        return '<h2>Missing review page token.</h2>', 400

    try:
        payload = verify_organizer_review_page_token(token)
    except SignatureExpired:
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Review page expired</h2>
          <p>This admin review page is no longer valid. Please request a fresh organizer review email.</p>
        </div>
        """, 403
    except BadSignature:
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Invalid review page</h2>
          <p>This review link is not valid.</p>
        </div>
        """, 403

    user_id = int(payload.get('user_id', 0))

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            id,
            full_name,
            email,
            approval_status,
            organizer_application_reason,
            organizer_proof_name,
            organizer_proof_path,
            reviewed_at,
            reviewed_by_email
        FROM users
        WHERE id = ? AND role = 'organizer'
    """, (user_id,))
    organizer = cur.fetchone()
    conn.close()

    if not organizer:
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Application not found</h2>
          <p>The organizer application could not be found.</p>
        </div>
        """, 404

    email_links = build_organizer_review_email_links(user_id, base_url=request.url_root)
    approval_status = str(organizer["approval_status"] or "pending").strip().lower()
    proof_name = organizer["organizer_proof_name"] or "Uploaded proof"
    proof_path = str(organizer["organizer_proof_path"] or "").strip()
    proof_extension = os.path.splitext(proof_path)[1].lower()

    preview_html = """
    <div style="padding:18px;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb;color:#475569;">
      Preview is not available for this file type in the browser. Use the buttons above to open or download the proof file.
    </div>
    """
    if proof_path and os.path.exists(proof_path):
        if proof_extension in ['.png', '.jpg', '.jpeg']:
            preview_html = f"""
            <img src="{email_links['proof_url']}" alt="Organizer proof preview" style="width:100%;max-height:720px;object-fit:contain;border:1px solid #e5e7eb;border-radius:14px;background:#fff;" />
            """
        elif proof_extension == '.pdf':
            preview_html = f"""
            <iframe src="{email_links['proof_url']}" title="Organizer proof preview" style="width:100%;height:720px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;"></iframe>
            """

    status_color = '#d97706'
    status_label = 'Pending review'
    if approval_status == 'approved':
        status_color = '#16a34a'
        status_label = 'Approved'
    elif approval_status == 'rejected':
        status_color = '#dc2626'
        status_label = 'Rejected'

    reviewed_meta_html = ''
    if organizer["reviewed_at"] or organizer["reviewed_by_email"]:
        reviewed_meta_html = f"""
        <div style="margin-top:18px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;">
          <p style="margin:0;"><strong>Reviewed by:</strong> {organizer["reviewed_by_email"] or get_primary_admin_email()}</p>
          <p style="margin:8px 0 0 0;"><strong>Reviewed at:</strong> {organizer["reviewed_at"] or 'Unknown'}</p>
        </div>
        """

    action_section_html = f"""
    <div style="margin:24px 0;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="{email_links['approve_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;">Approve Organizer</a>
      <a href="{email_links['reject_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:800;">Reject Organizer</a>
    </div>
    """
    if approval_status in ['approved', 'rejected']:
        action_section_html = f"""
        <div style="margin:24px 0;padding:18px;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb;">
          <p style="margin:0;color:#111827;">This application has already been <strong style="color:{status_color};">{status_label.lower()}</strong>.</p>
        </div>
        """

    return f"""
    <div style="font-family:sans-serif;max-width:960px;margin:32px auto;padding:32px;border:1px solid #e5e7eb;border-radius:20px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 10px 0;color:#9B1040;">Organizer Application Review</h2>
          <p style="margin:0;color:#475569;">Open the proof file, review the request, then approve or reject.</p>
        </div>
        <span style="display:inline-block;padding:10px 14px;border-radius:999px;background:{status_color}15;color:{status_color};font-weight:800;border:1px solid {status_color}33;">{status_label}</span>
      </div>

      <div style="margin-top:24px;padding:20px;border-radius:16px;background:#fff7fb;border:1px solid #f3d7e4;">
        <p style="margin:0 0 10px 0;"><strong>Name:</strong> {organizer["full_name"]}</p>
        <p style="margin:0 0 10px 0;"><strong>Email:</strong> {organizer["email"]}</p>
        <p style="margin:0 0 10px 0;"><strong>Proof file:</strong> {proof_name}</p>
        <p style="margin:0;"><strong>Reason:</strong><br>{organizer["organizer_application_reason"] or 'No reason provided.'}</p>
      </div>

      <div style="margin:24px 0;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="{email_links['proof_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#111827;color:#ffffff;text-decoration:none;font-weight:800;">Open Proof File</a>
        <a href="{email_links['proof_download_url']}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#475569;color:#ffffff;text-decoration:none;font-weight:800;">Download Proof File</a>
      </div>

      {action_section_html}
      {reviewed_meta_html}

      <div style="margin-top:24px;">
        <h3 style="margin:0 0 12px 0;color:#111827;">Proof Preview</h3>
        {preview_html}
      </div>
    </div>
    """


@app.route('/admin/email-review', methods=['GET'])
def review_organizer_application_from_email():
    token = str(request.args.get('token', '')).strip()
    if not token:
        return '<h2>Missing review token.</h2>', 400

    try:
        payload = verify_organizer_review_email_token(token)
    except SignatureExpired:
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Review link expired</h2>
          <p>This approve/reject link is no longer valid. Please open the admin panel in Crowd Analyzing to review the organizer manually.</p>
        </div>
        """, 403
    except BadSignature:
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Invalid review link</h2>
          <p>This email review link is not valid.</p>
        </div>
        """, 403

    user_id = int(payload.get('user_id', 0))
    decision = str(payload.get('decision', '')).strip().lower()

    conn = get_db_connection()
    cur = conn.cursor()
    organizer, title, message = apply_organizer_review(
        cur=cur,
        user_id=user_id,
        decision=decision,
        reviewed_by_email=get_primary_admin_email()
    )

    if not organizer:
        conn.close()
        return """
        <div style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
          <h2 style="margin-top:0;color:#9B1040;">Application not found</h2>
          <p>The organizer application could not be found.</p>
        </div>
        """, 404

    conn.commit()
    conn.close()

    # Send email notification to admin
    send_email(
        to_list=get_admin_recipient_emails(),
        subject=f"Organizer application {decision}",
        html_body=f"""
        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="color:#9B1040;margin-top:0;">Organizer application {decision}</h2>
          <p>An organizer application has been {decision} via email review.</p>
          <p><strong>Name:</strong> {organizer["full_name"]}</p>
          <p><strong>Email:</strong> {organizer["email"]}</p>
          <p><strong>Decision:</strong> {decision.title()}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
          <p style="color:#6b7280;font-size:0.85em;">This is an automated notification from Crowd Analyzing.</p>
        </div>
        """
    )

    send_email(
        to_list=build_account_email_recipients(organizer["email"]),
        subject=title,
        html_body=build_organizer_review_customer_email(
            full_name=organizer["full_name"],
            title=title,
            message=message,
            decision=decision,
            base_url=request.url_root
        )
    )

    action_label = 'approved' if decision == 'approved' else 'rejected'
    action_color = '#16a34a' if decision == 'approved' else '#dc2626'

    return f"""
    <div style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;">
      <h2 style="margin-top:0;color:{action_color};">Organizer {action_label}</h2>
      <p><strong>Name:</strong> {organizer["full_name"]}</p>
      <p><strong>Email:</strong> {organizer["email"]}</p>
      <p>{message}</p>
      <p style="color:#6b7280;">You can close this page now.</p>
    </div>
    """


# ============================================================
#  EVENTS
# ============================================================

@app.route('/api/events', methods=['GET'])
def get_events():
    try:
        from datetime import date as date_cls, timedelta
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                e.*,
                u.full_name AS organizer_name
            FROM events e
            LEFT JOIN users u ON u.id = e.organizer_id
            ORDER BY e.id DESC
        """)
        rows = cur.fetchall()

        today_str = get_local_now_naive().strftime('%Y-%m-%d')
        cur.execute("SELECT event_id, event_date, tickets_sold, attendance_count FROM event_day_stats")
        day_stats_map = {}
        day_stats_full = {}
        today_att_map = {}
        for r in cur.fetchall():
            eid = int(r["event_id"])
            day_stats_map.setdefault(eid, {})[r["event_date"]] = int(r["tickets_sold"] or 0)
            day_stats_full.setdefault(eid, {})[r["event_date"]] = {
                "tickets_sold": int(r["tickets_sold"] or 0),
                "attendance_count": int(r["attendance_count"] or 0)
            }
            if r["event_date"] == today_str:
                today_att_map[eid] = int(r["attendance_count"] or 0)

        conn.close()

        all_days_sold_out_map = {}
        for row in rows:
            cpd = int(row["capacity_per_day"] or 0)
            if cpd > 0 and row["start_date"] and row["end_date"] and row["start_date"] != row["end_date"]:
                try:
                    sd = date_cls.fromisoformat(row["start_date"])
                    ed = date_cls.fromisoformat(row["end_date"])
                    day_map = day_stats_map.get(row["id"], {})
                    current = sd
                    all_sold = True
                    while current <= ed:
                        if day_map.get(current.isoformat(), 0) < cpd:
                            all_sold = False
                            break
                        current += timedelta(days=1)
                    all_days_sold_out_map[row["id"]] = all_sold
                except Exception:
                    all_days_sold_out_map[row["id"]] = False

        events = []
        for row in rows:
            cpd = int(row["capacity_per_day"] or 0) if "capacity_per_day" in row.keys() else 0
            # Always use event_day_stats for today's count — never global attendance_count
            today_att = today_att_map.get(int(row["id"]), 0)
            today_cap = cpd if cpd > 0 else int(row["capacity"] or 0)
            today_ts = day_stats_full.get(int(row["id"]), {}).get(today_str, {}).get("tickets_sold", 0)
            event_data = serialize_event_row(row, all_days_sold_out=all_days_sold_out_map.get(row["id"], False))
            event_data["today_attendance_count"] = today_att
            event_data["today_capacity"] = today_cap
            event_data["today_date"] = today_str
            event_data["day_stats"] = day_stats_full.get(int(row["id"]), {})
            event_data["prediction"] = build_crowd_prediction(row, today_attendance=today_att, today_capacity=today_cap, today_tickets_sold=today_ts)
            event_data["crowd_level"] = calculate_crowd_level(today_att, today_cap)
            events.append(event_data)

        return jsonify(events)

    except Exception as e:
        print("GET EVENTS ERROR:", e)
        return jsonify({"message": "Server error loading events"}), 500

@app.route('/api/organizer/events/<int:user_id>', methods=['GET'])
def get_organizer_events(user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    organizer, organizer_error = ensure_approved_organizer(cur, user_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("""
        SELECT
            e.*,
            u.full_name AS organizer_name
        FROM events e
        LEFT JOIN users u ON u.id = e.organizer_id
        WHERE e.organizer_id = ?
        ORDER BY e.id DESC
    """, (user_id,))

    rows = cur.fetchall()

    today_str = get_local_now_naive().strftime('%Y-%m-%d')
    event_ids = [row["id"] for row in rows]
    today_att_map = {}
    day_stats_full = {}
    if event_ids:
        placeholders = ','.join('?' * len(event_ids))
        cur.execute(
            f"SELECT event_id, event_date, tickets_sold, attendance_count FROM event_day_stats WHERE event_id IN ({placeholders})",
            event_ids
        )
        for r in cur.fetchall():
            eid = int(r["event_id"])
            day_stats_full.setdefault(eid, {})[r["event_date"]] = {
                "tickets_sold": int(r["tickets_sold"] or 0),
                "attendance_count": int(r["attendance_count"] or 0)
            }
            if r["event_date"] == today_str:
                today_att_map[eid] = int(r["attendance_count"] or 0)

    conn.close()

    events = []
    for row in rows:
        cpd = int(row["capacity_per_day"] or 0) if "capacity_per_day" in row.keys() else 0
        # Always use event_day_stats for today's count — never global attendance_count
        today_att = today_att_map.get(int(row["id"]), 0)
        today_cap = cpd if cpd > 0 else int(row["capacity"] or 0)
        today_ts = day_stats_full.get(int(row["id"]), {}).get(today_str, {}).get("tickets_sold", 0)
        event_data = serialize_event_row(row)
        event_data["today_attendance_count"] = today_att
        event_data["today_capacity"] = today_cap
        event_data["today_date"] = today_str
        event_data["day_stats"] = day_stats_full.get(int(row["id"]), {})
        event_data["prediction"] = build_crowd_prediction(row, today_attendance=today_att, today_capacity=today_cap, today_tickets_sold=today_ts)
        event_data["crowd_level"] = calculate_crowd_level(today_att, today_cap)
        today_alert = build_staff_alert_state(row, today_attendance=today_att, today_capacity=today_cap)
        event_data["staff_alert_active"] = today_alert["active"]
        event_data["staff_alert_type"] = today_alert["type"]
        event_data["staff_alert_severity"] = today_alert["severity"]
        event_data["staff_alert_title"] = today_alert["title"]
        event_data["staff_alert_message"] = today_alert["message"]
        event_data["entry_locked"] = today_alert["entry_locked"]
        event_data["entry_lock_reason"] = today_alert["entry_lock_reason"]
        events.append(event_data)

    return jsonify(events)


@app.route('/api/organizer/staff', methods=['GET'])
def get_organizer_staff():
    organizer_id = request.args.get('organizer_id')

    if not organizer_id:
        return jsonify({"message": "Missing organizer_id"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        organizer_id = int(organizer_id)
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"message": "Invalid organizer_id"}), 400

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("""
        SELECT
            esp.user_id,
            esp.first_name,
            esp.last_name,
            esp.age,
            esp.preferred_hours,
            esp.preferred_days_per_week,
            esp.preferred_days_text,
            esp.work_status,
            esp.status_updated_at,
            esp.generated_password,
            esp.created_at,
            e.id AS event_id,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            e.start_time,
            e.end_time
        FROM entry_staff_profiles esp
        JOIN events e ON e.id = esp.event_id
        WHERE esp.organizer_id = ?
          AND COALESCE(esp.work_status, 'active') != 'removed'
        ORDER BY esp.created_at DESC, esp.user_id DESC
    """, (organizer_id,))
    rows = cur.fetchall()
    conn.close()

    staff = []
    for row in rows:
        full_name = (str(row["first_name"]).strip() + ' ' + str(row["last_name"]).strip()).strip()
        staff.append({
            "staff_id": row["user_id"],
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "full_name": full_name,
            "age": row["age"],
            "preferred_hours": row["preferred_hours"],
            "preferred_days_per_week": row["preferred_days_per_week"],
            "preferred_days": normalize_staff_preferred_days(row["preferred_days_text"]) or [],
            "work_status": normalize_staff_work_status(row["work_status"]),
            "status_updated_at": row["status_updated_at"],
            "password": row["generated_password"],
            "created_at": row["created_at"],
            "event": {
                "id": row["event_id"],
                "name": row["event_name"],
                "start_date": row["start_date"],
                "end_date": row["end_date"],
                "start_time": row["start_time"],
                "end_time": row["end_time"]
            }
        })

    return jsonify(staff)


@app.route('/api/organizer/staff', methods=['POST'])
def create_organizer_staff():
    data = request.get_json() or {}

    organizer_id = data.get('organizer_id')
    event_id = data.get('event_id')
    first_name = str(data.get('first_name', '')).strip()
    last_name = str(data.get('last_name', '')).strip()
    age = data.get('age')
    preferred_hours = data.get('preferred_hours')
    preferred_days_per_week = data.get('preferred_days_per_week')
    preferred_days = normalize_staff_preferred_days(data.get('preferred_days'))

    if not organizer_id or not event_id or not first_name or not last_name:
        return jsonify({"message": "Missing staff details"}), 400

    try:
        organizer_id = int(organizer_id)
        event_id = int(event_id)
        age = int(age)
        preferred_hours = float(preferred_hours)
        preferred_days_per_week = int(preferred_days_per_week)
    except (TypeError, ValueError):
        return jsonify({"message": "Please enter valid staff details"}), 400

    if age < 16 or age > 100:
        return jsonify({"message": "Staff age must be between 16 and 100"}), 400

    if preferred_hours <= 0 or preferred_hours > 24:
        return jsonify({"message": "Working hours must be between 1 and 24"}), 400

    if preferred_days_per_week <= 0 or preferred_days_per_week > 7:
        return jsonify({"message": "Days per week must be between 1 and 7"}), 400

    if preferred_days is None:
        return jsonify({"message": "Please choose valid working days"}), 400

    if len(preferred_days) != preferred_days_per_week:
        return jsonify({"message": "Please choose exactly the same number of working days as Days Per Week"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("""
        SELECT id, name, start_date, end_date, start_time, end_time
        FROM events
        WHERE id = ? AND organizer_id = ?
    """, (event_id, organizer_id))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Please choose one of your events for this staff account"}), 404

    full_name = (first_name + ' ' + last_name).strip()
    generated_password = generate_entry_staff_password()
    synthetic_email = 'staff-' + uuid.uuid4().hex[:12] + '@crowdanalyzing.local'

    try:
        cur.execute("""
            INSERT INTO users (
                full_name, email, password, role, approval_status, created_at
            )
            VALUES (?, ?, ?, 'entry_staff', 'approved', app_now())
        """, (full_name, synthetic_email, generated_password))
        staff_user_id = cur.lastrowid

        cur.execute("""
            INSERT INTO entry_staff_profiles (
                user_id, organizer_id, event_id, first_name, last_name, age,
                preferred_hours, preferred_days_per_week, preferred_days_text, generated_password, created_at, work_status, status_updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, app_now(), 'active', app_now())
        """, (
            staff_user_id,
            organizer_id,
            event_id,
            first_name,
            last_name,
            age,
            preferred_hours,
            preferred_days_per_week,
            json_lib.dumps(preferred_days),
            generated_password
        ))

        cur.execute("""
            INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
            VALUES (?, ?, 'update', 'Staff account created', ?, 0, app_now())
        """, (
            organizer_id,
            event_id,
            full_name + ' was added as entry staff for "' + event["name"] + '".'
        ))

        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        conn.close()
        return jsonify({"message": "Could not create the staff account"}), 409
    except Exception as e:
        conn.rollback()
        conn.close()
        print("CREATE STAFF ERROR:", e)
        return jsonify({"message": "Server error"}), 500

    conn.close()

    return jsonify({
        "message": "Staff account created successfully",
        "staff": {
            "staff_id": staff_user_id,
            "first_name": first_name,
            "last_name": last_name,
            "full_name": full_name,
            "age": age,
            "preferred_hours": preferred_hours,
            "preferred_days_per_week": preferred_days_per_week,
            "preferred_days": preferred_days,
            "work_status": "active",
            "password": generated_password,
            "event": {
                "id": event["id"],
                "name": event["name"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "start_time": event["start_time"],
                "end_time": event["end_time"]
            }
        }
    }), 201


@app.route('/api/organizer/staff/<int:staff_user_id>/status', methods=['PATCH'])
def update_organizer_staff_status(staff_user_id):
    data = request.get_json() or {}
    organizer_id = data.get('organizer_id')
    work_status = normalize_staff_work_status(data.get('work_status'))

    if not organizer_id:
        return jsonify({"message": "Missing organizer_id"}), 400

    if work_status not in ['active', 'extra_work', 'stop_working', 'removed']:
        return jsonify({"message": "Invalid staff status"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        organizer_id = int(organizer_id)
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"message": "Invalid organizer_id"}), 400

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("""
        SELECT
            esp.user_id,
            esp.first_name,
            esp.last_name,
            esp.work_status,
            esp.event_id,
            e.name AS event_name
        FROM entry_staff_profiles esp
        JOIN events e ON e.id = esp.event_id
        WHERE esp.user_id = ?
          AND esp.organizer_id = ?
    """, (staff_user_id, organizer_id))
    staff_profile = cur.fetchone()

    if not staff_profile:
        conn.close()
        return jsonify({"message": "Staff account not found"}), 404

    previous_status = normalize_staff_work_status(staff_profile["work_status"])
    if previous_status in ['stop_working', 'removed']:
        conn.close()
        return jsonify({
            "message": 'Inactive staff cannot be edited. Open Staff Chat to communicate, then use Kick / Remove there if needed.'
        }), 403

    if previous_status == work_status:
        conn.close()
        return jsonify({"message": "Staff status is already set to " + work_status.replace('_', ' ')}), 200

    cur.execute("""
        UPDATE entry_staff_profiles
        SET work_status = ?,
            status_updated_at = app_now()
        WHERE user_id = ?
          AND organizer_id = ?
    """, (work_status, staff_user_id, organizer_id))

    full_name = (str(staff_profile["first_name"]).strip() + ' ' + str(staff_profile["last_name"]).strip()).strip()
    status_meta = get_staff_work_status_meta(work_status, staff_profile["event_name"])

    cur.execute("""
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES (?, ?, 'update', ?, ?, 0, app_now())
    """, (
        staff_user_id,
        staff_profile["event_id"],
        'Staff Status Updated',
        status_meta["message"]
    ))

    cur.execute("""
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES (?, ?, 'update', ?, ?, 0, app_now())
    """, (
        organizer_id,
        staff_profile["event_id"],
        'Staff Status Updated',
        full_name + ' is now marked as ' + status_meta["label"] + ' for "' + staff_profile["event_name"] + '".'
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Staff status updated successfully",
        "staff_id": staff_user_id,
        "work_status": work_status,
        "work_status_label": status_meta["label"]
    })


@app.route('/api/organizer/staff/<int:staff_user_id>', methods=['DELETE'])
def remove_organizer_staff(staff_user_id):
    organizer_id = request.args.get('organizer_id')

    if not organizer_id:
        return jsonify({"message": "Missing organizer_id"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        organizer_id = int(organizer_id)
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"message": "Invalid organizer_id"}), 400

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("""
        SELECT
            esp.user_id,
            esp.first_name,
            esp.last_name,
            esp.work_status,
            esp.event_id,
            e.name AS event_name
        FROM entry_staff_profiles esp
        JOIN events e ON e.id = esp.event_id
        WHERE esp.user_id = ?
          AND esp.organizer_id = ?
    """, (staff_user_id, organizer_id))
    staff_profile = cur.fetchone()

    if not staff_profile:
        conn.close()
        return jsonify({"message": "Staff account not found"}), 404

    previous_status = normalize_staff_work_status(staff_profile["work_status"])
    if previous_status != 'stop_working':
        conn.close()
        return jsonify({
            "message": "Only inactive staff can be removed from chat."
        }), 403

    cur.execute("""
        UPDATE entry_staff_profiles
        SET work_status = 'removed',
            status_updated_at = app_now()
        WHERE user_id = ?
          AND organizer_id = ?
    """, (staff_user_id, organizer_id))

    full_name = (str(staff_profile["first_name"]).strip() + ' ' + str(staff_profile["last_name"]).strip()).strip()
    if not full_name:
        full_name = f'Staff #{staff_user_id}'

    status_meta = get_staff_work_status_meta('removed', staff_profile["event_name"])

    cur.execute("""
        INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
        VALUES (?, ?, 'update', ?, ?, 0, app_now())
    """, (
        staff_user_id,
        staff_profile["event_id"],
        'Staff Assignment Removed',
        status_meta["message"]
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": full_name + ' was removed successfully.',
        "staff_id": staff_user_id,
        "work_status": 'removed',
        "work_status_label": status_meta["label"]
    })


@app.route('/api/staff/events/<int:staff_user_id>', methods=['GET'])
def get_staff_events(staff_user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            e.*,
            u.full_name AS organizer_name,
            esp.work_status,
            esp.status_updated_at
        FROM entry_staff_profiles esp
        JOIN events e ON e.id = esp.event_id
        LEFT JOIN users u ON u.id = e.organizer_id
        WHERE esp.user_id = ?
        ORDER BY e.id DESC
    """, (staff_user_id,))
    rows = cur.fetchall()

    today_str_staff = get_local_now_naive().strftime('%Y-%m-%d')
    events = []
    for row in rows:
        event_data = serialize_event_row(row)
        today_stats = get_today_event_stats(row["id"], row, cur)
        event_data["today_attendance_count"] = today_stats["today_attendance"]
        event_data["today_capacity"] = today_stats["today_capacity"]
        event_data["today_date"] = today_stats["today_date"]
        # Crowd level and prediction always reflect today's real scan count
        event_data["crowd_level"] = calculate_crowd_level(today_stats["today_attendance"], today_stats["today_capacity"])
        cur.execute("SELECT tickets_sold FROM event_day_stats WHERE event_id = ? AND event_date = ?", (row["id"], today_str_staff))
        ts_row = cur.fetchone()
        today_ts_staff = int(ts_row["tickets_sold"] or 0) if ts_row else 0
        event_data["prediction"] = build_crowd_prediction(row, today_attendance=today_stats["today_attendance"], today_capacity=today_stats["today_capacity"], today_tickets_sold=today_ts_staff)

        staff_status_meta = get_staff_work_status_meta(row["work_status"], row["name"])
        event_data["staff_work_status"] = staff_status_meta["status"]
        event_data["staff_work_status_label"] = staff_status_meta["label"]
        event_data["staff_status_updated_at"] = row["status_updated_at"]

        if staff_status_meta["status"] == 'extra_work':
            event_data["staff_alert_active"] = True
            event_data["staff_alert_type"] = 'staff_status'
            event_data["staff_alert_severity"] = 'warning'
            event_data["staff_alert_title"] = 'Staff Status Updated'
            event_data["staff_alert_message"] = staff_status_meta["message"]
        elif staff_status_meta["status"] in ['stop_working', 'removed']:
            event_data["staff_alert_active"] = True
            event_data["staff_alert_type"] = 'staff_status'
            event_data["staff_alert_severity"] = 'critical'
            event_data["staff_alert_title"] = 'Staff Access Restricted'
            event_data["staff_alert_message"] = staff_status_meta["message"]
            event_data["entry_locked"] = True
            event_data["entry_lock_reason"] = staff_status_meta["status"]
        else:
            today_alert = build_staff_alert_state(
                row,
                today_attendance=today_stats["today_attendance"],
                today_capacity=today_stats["today_capacity"]
            )
            event_data["staff_alert_active"] = today_alert["active"]
            event_data["staff_alert_type"] = today_alert["type"]
            event_data["staff_alert_severity"] = today_alert["severity"]
            event_data["staff_alert_title"] = today_alert["title"]
            event_data["staff_alert_message"] = today_alert["message"]
            event_data["entry_locked"] = today_alert["entry_locked"]
            event_data["entry_lock_reason"] = today_alert["entry_lock_reason"]

        events.append(event_data)

    conn.close()
    return jsonify(events)


@app.route('/api/staff/self/work-status', methods=['POST'])
def staff_self_update_work_status():
    data = request.get_json() or {}
    staff_user_id = data.get('staff_user_id')
    new_status = data.get('work_status')

    if not staff_user_id or new_status not in ('active', 'stop_working'):
        return jsonify({'message': 'Invalid request'}), 400

    try:
        staff_user_id = int(staff_user_id)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid staff_user_id'}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    user = cur.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'entry_staff'",
        (staff_user_id,)
    ).fetchone()

    if not user:
        conn.close()
        return jsonify({'message': 'Staff not found'}), 404

    assignment = cur.execute("""
        SELECT
            esp.event_id,
            esp.organizer_id,
            esp.first_name,
            esp.last_name,
            esp.work_status,
            e.name AS event_name
        FROM entry_staff_profiles esp
        LEFT JOIN events e ON e.id = esp.event_id
        WHERE esp.user_id = ?
    """, (staff_user_id,)).fetchone()

    if not assignment:
        conn.close()
        return jsonify({'message': 'Staff assignment not found'}), 404

    previous_status = normalize_staff_work_status(assignment["work_status"])

    cur.execute("""
        UPDATE entry_staff_profiles
        SET work_status = ?, status_updated_at = app_now()
        WHERE user_id = ?
    """, (new_status, staff_user_id))

    conn.commit()
    conn.close()

    if new_status == 'stop_working' and previous_status != 'stop_working':
        staff_name = (str(assignment["first_name"] or '').strip() + ' ' + str(assignment["last_name"] or '').strip()).strip()
        if not staff_name:
            staff_name = f'Staff #{staff_user_id}'
        event_name = str(assignment["event_name"] or 'the assigned event').strip()
        organizer_id = assignment["organizer_id"]
        event_id = assignment["event_id"]
        alert_title = 'Staff stopped working'
        alert_message = f'{staff_name} (ID: {staff_user_id}) stopped working for "{event_name}". Review staff coverage in the organizer dashboard.'

        if organizer_id:
            create_notification(
                organizer_id,
                event_id,
                'staff_status',
                alert_title,
                alert_message,
                send_email_copy=False
            )
            firebase_send_notification(
                alert_title,
                alert_message,
                event_id=event_id,
                user_ids=[organizer_id]
            )

    return jsonify({'work_status': new_status, 'message': 'Status updated'})


@app.route('/api/customer/chat-contacts/<int:customer_id>', methods=['GET'])
def get_customer_chat_contacts(customer_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT e.id AS event_id, e.name AS event_name,
            e.organizer_id, u.full_name AS organizer_name
        FROM ticket_purchases tp
        JOIN events e ON e.id = tp.event_id
        LEFT JOIN users u ON u.id = e.organizer_id
        WHERE tp.user_id = ?
        ORDER BY tp.purchase_time DESC
        LIMIT 10
    """, (customer_id,))
    events = cur.fetchall()

    result = []
    for ev in events:
        cur.execute("""
            SELECT u.id,
                (esp.first_name || ' ' || esp.last_name) AS name,
                esp.work_status
            FROM entry_staff_profiles esp
            JOIN users u ON u.id = esp.user_id
            WHERE esp.event_id = ?
              AND esp.work_status NOT IN ('removed')
        """, (ev['event_id'],))
        staff_rows = cur.fetchall()
        result.append({
            'event_id': ev['event_id'],
            'event_name': ev['event_name'],
            'organizer_id': ev['organizer_id'],
            'organizer_name': ev['organizer_name'] or 'Organizer',
            'staff': [{'id': s['id'], 'name': str(s['name']).strip(), 'work_status': s['work_status'] or 'inactive'} for s in staff_rows]
        })

    conn.close()
    return jsonify(result)


@app.route('/api/chat/rooms/staff/<int:staff_id>', methods=['GET'])
def get_staff_customer_rooms(staff_id):
    """Return all customer-initiated chat rooms for a staff member."""
    conn = get_db_connection()
    cur = conn.cursor()
    pattern = 'cust_%_staff_' + str(staff_id)
    cur.execute("""
        SELECT room_id,
               MAX(id)         AS last_msg_id,
               MAX(created_at) AS last_time
        FROM chat_messages
        WHERE room_id LIKE ?
        GROUP BY room_id
        ORDER BY last_msg_id DESC
    """, (pattern,))
    rooms = cur.fetchall()

    result = []
    for room in rooms:
        room_id = room['room_id']
        cust_id = None
        try:
            cust_id = int(room_id.split('_')[1])
        except Exception:
            pass

        customer_name  = 'Customer'
        customer_email = ''
        if cust_id:
            row = cur.execute(
                "SELECT id, full_name, email FROM users WHERE id = ?", (cust_id,)
            ).fetchone()
            if row:
                customer_name  = row['full_name'] or ('Customer #' + str(cust_id))
                customer_email = row['email'] or ''

        result.append({
            'room_id':        room_id,
            'customer_id':    cust_id,
            'customer_name':  customer_name,
            'customer_email': customer_email,
            'last_time':      room['last_time']
        })

    conn.close()
    return jsonify(result)


@app.route('/api/chat/send', methods=['POST'])
def chat_send():
    data = request.get_json() or {}
    room_id   = str(data.get('room_id', '')).strip()
    from_id   = data.get('from_id')
    from_name = str(data.get('from_name', 'User')).strip()
    from_role = str(data.get('from_role', 'user')).strip()
    message   = str(data.get('message', '')).strip()

    if not room_id or not from_id or not message:
        return jsonify({'message': 'Missing fields'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    now = datetime.now(ZoneInfo('UTC')).isoformat()
    cur.execute("""
        INSERT INTO chat_messages (room_id, from_id, from_name, from_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (room_id, int(from_id), from_name, from_role, message, now))
    msg_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': msg_id, 'created_at': now})


@app.route('/api/chat/messages/<path:room_id>', methods=['GET'])
def chat_get_messages(room_id):
    since_id = request.args.get('since', 0, type=int)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, from_id, from_name, from_role, message, created_at
        FROM chat_messages
        WHERE room_id = ? AND id > ?
        ORDER BY id ASC
        LIMIT 100
    """, (room_id, since_id))
    rows = cur.fetchall()
    conn.close()
    return jsonify([{
        'id': r['id'],
        'from_id': r['from_id'],
        'from_name': r['from_name'],
        'from_role': r['from_role'],
        'text': r['message'],
        'created_at': r['created_at']
    } for r in rows])


@app.route('/api/chat/unread-count', methods=['GET'])
def chat_unread_count():
    user_id = request.args.get('user_id', type=int)
    role    = request.args.get('role', '')
    if not user_id:
        return jsonify({'count': 0})

    conn = get_db_connection()
    cur  = conn.cursor()

    if role == 'entry_staff':
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM chat_messages cm
            LEFT JOIN chat_reads cr
                   ON cr.room_id = cm.room_id AND cr.user_id = ?
            WHERE (cm.room_id = ? OR cm.room_id LIKE ?)
              AND cm.from_id != ?
              AND cm.id > COALESCE(cr.last_read_id, 0)
        """, (user_id,
              'staff_' + str(user_id),
              'cust_%_staff_' + str(user_id),
              user_id))

    elif role == 'organizer':
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM chat_messages cm
            LEFT JOIN chat_reads cr
                   ON cr.room_id = cm.room_id AND cr.user_id = ?
            WHERE cm.room_id IN (
                SELECT 'staff_' || CAST(esp.user_id AS TEXT)
                FROM entry_staff_profiles esp
                JOIN events e ON esp.event_id = e.id
                WHERE e.organizer_id = ?
                  AND esp.work_status NOT IN ('removed')
            )
              AND cm.from_id != ?
              AND cm.id > COALESCE(cr.last_read_id, 0)
        """, (user_id, user_id, user_id))

    else:
        conn.close()
        return jsonify({'count': 0})

    row   = cur.fetchone()
    count = row['cnt'] if row else 0
    conn.close()
    return jsonify({'count': count})


@app.route('/api/chat/mark-read', methods=['POST'])
def chat_mark_read():
    data    = request.get_json() or {}
    user_id = data.get('user_id')
    room_id = str(data.get('room_id', '')).strip()
    if not user_id or not room_id:
        return jsonify({'ok': False})

    conn = get_db_connection()
    cur  = conn.cursor()
    cur.execute("SELECT MAX(id) AS max_id FROM chat_messages WHERE room_id = ?", (room_id,))
    row    = cur.fetchone()
    max_id = row['max_id'] if row and row['max_id'] else 0
    cur.execute("""
        INSERT INTO chat_reads (user_id, room_id, last_read_id)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_id = excluded.last_read_id
    """, (user_id, room_id, max_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/chat/messages/<path:room_id>', methods=['DELETE'])
def chat_delete_messages(room_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM chat_messages WHERE room_id = ?", (room_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    return jsonify({'deleted': deleted})


@app.route('/api/events', methods=['POST'])
def create_event():
    from datetime import date as date_cls
    data = request.get_json() or {}

    category = data.get('category', 'event')

    organizer_id = data.get('organizer_id')
    name = data.get('name')
    location = data.get('location', '')
    city = data.get('city', '')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    description = data.get('description', '')
    capacity = data.get('capacity')
    ticket_price = data.get('ticket_price', 0)

    if not end_date:
        end_date = start_date

    if not organizer_id or not name or not location or not city or not start_date or not start_time or not end_time or capacity is None:
        return jsonify({"message": "Missing fields"}), 400

    conn = None
    try:
        organizer_id = int(organizer_id)
        capacity = int(capacity)
        ticket_price = float(ticket_price or 0)
        _, _, schedule_error = validate_event_schedule(
            start_date,
            end_date,
            start_time,
            end_time,
            require_future_start=True
        )

        if schedule_error:
            return jsonify({"message": schedule_error}), 400

        if capacity < 1:
            return jsonify({"message": "Capacity must be at least 1"}), 400

        if ticket_price < 0:
            return jsonify({"message": "Ticket price cannot be negative"}), 400

        # For multi-day events, capacity means per-day; track it in capacity_per_day
        is_multi_day = end_date and end_date != start_date
        capacity_per_day = capacity if is_multi_day else 0

        conn = get_db_connection()
        cur = conn.cursor()

        organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
        if organizer_error:
            return jsonify({"message": organizer_error[0]}), organizer_error[1]

        cur.execute("""
            INSERT INTO events (
                organizer_id, name, location, city, start_date, end_date,
                start_time, end_time, description, capacity, ticket_price, category,
                capacity_per_day
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            organizer_id,
            name,
            location,
            city,
            start_date,
            end_date,
            start_time,
            end_time,
            description,
            capacity,
            ticket_price,
            category,
            capacity_per_day
        ))

        event_id = cur.lastrowid
        conn.commit()

        cur.execute("""
            SELECT u.id
            FROM users u
            LEFT JOIN notification_preferences np ON lower(np.user_email) = lower(u.email)
            WHERE lower(u.role) = 'customer'
              AND COALESCE(np.crowd_alerts_enabled, 1) = 1
        """)
        customer_notification_user_ids = [row["id"] for row in cur.fetchall()]

        firebase_sync(f'events/{event_id}', {
            'id': event_id, 'name': name, 'category': category,
            'location': location, 'city': city,
            'start_date': start_date, 'start_time': start_time,
            'capacity': capacity, 'attendance_count': 0, 'crowd_level': 'low',
            'emergency_active': False,
            'emergency_type': '',
            'emergency_message': '',
            'staff_alert_active': False,
            'entry_locked': False
        })

        for customer_user_id in customer_notification_user_ids:
            create_notification(
                user_id=customer_user_id,
                event_id=event_id,
                notif_type='update',
                title='New Event Added',
                message='"' + str(name) + '" has been added. Check the latest event details now.',
                send_email_copy=False
            )

        if customer_notification_user_ids:
            firebase_send_notification(
                'New Event',
                f'"{name}" has been added!',
                event_id,
                user_ids=customer_notification_user_ids
            )

        return jsonify({"message": "Event created"}), 201

    except sqlite3.IntegrityError as e:
        if conn:
            conn.rollback()
        print(f"[Event creation] Integrity error: {e}")
        return jsonify({"message": "Database constraint error: Event creation failed"}), 400

    except (TypeError, ValueError):
        return jsonify({"message": "Invalid event data"}), 400

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[Event creation] Error: {e}")
        return jsonify({"message": f"Error creating event: {str(e)}"}), 500

    finally:
        if conn:
            conn.close()


@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    data = request.get_json() or {}

    organizer_id = data.get('organizer_id')
    name = data.get('name')
    category = data.get('category', 'event')
    description = data.get('description', '')
    location = data.get('location', '')
    city = data.get('city', '')
    start_date = data.get('start_date')
    end_date = data.get('end_date') or start_date
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    capacity = data.get('capacity')
    ticket_price = data.get('ticket_price', 0)

    if not organizer_id or not name or not location or not city or not start_date or not start_time or not end_time or capacity is None:
        return jsonify({"message": "Missing fields"}), 400

    conn = None
    try:
        organizer_id = int(organizer_id)
        capacity = int(capacity)
        ticket_price = float(ticket_price or 0)

        is_multi_day = end_date and end_date != start_date
        capacity_per_day = capacity if is_multi_day else 0
        _, _, schedule_error = validate_event_schedule(
            start_date,
            end_date,
            start_time,
            end_time,
            require_future_start=True
        )

        if schedule_error:
            return jsonify({"message": schedule_error}), 400

        if capacity < 1:
            return jsonify({"message": "Capacity must be at least 1"}), 400

        if ticket_price < 0:
            return jsonify({"message": "Ticket price cannot be negative"}), 400

        conn = get_db_connection()
        cur = conn.cursor()

        organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
        if organizer_error:
            conn.close()
            return jsonify({"message": organizer_error[0]}), organizer_error[1]

        cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
        event = cur.fetchone()

        if not event:
            conn.close()
            return jsonify({"message": "Event not found"}), 404

        if event["organizer_id"] != organizer_id:
            conn.close()
            return jsonify({"message": "You can only edit your own events"}), 403

        if is_multi_day:
            from datetime import date as date_cls
            try:
                sd = date_cls.fromisoformat(start_date)
                ed = date_cls.fromisoformat(end_date)
                total_capacity = capacity * max((ed - sd).days + 1, 1)
            except Exception:
                total_capacity = capacity
        else:
            total_capacity = capacity

        if total_capacity < int(event["tickets_sold"] or 0):
            conn.close()
            return jsonify({"message": "Capacity cannot be lower than tickets already sold"}), 400

        if total_capacity < int(event["attendance_count"] or 0):
            conn.close()
            return jsonify({"message": "Capacity cannot be lower than recorded attendance"}), 400

        cur.execute("""
            UPDATE events
            SET
                name = ?,
                category = ?,
                description = ?,
                location = ?,
                city = ?,
                start_date = ?,
                end_date = ?,
                start_time = ?,
                end_time = ?,
                capacity = ?,
                ticket_price = ?,
                capacity_per_day = ?
            WHERE id = ?
        """, (
            name,
            category,
            description,
            location,
            city,
            start_date,
            end_date,
            start_time,
            end_time,
            capacity,
            ticket_price,
            capacity_per_day,
            event_id
        ))

        conn.commit()
        conn.close()

        firebase_sync(f'events/{event_id}', {
            'id': event_id, 'name': name, 'category': category,
            'location': location, 'city': city,
            'start_date': start_date, 'start_time': start_time,
            'capacity': int(capacity)
        }, method='PATCH')

        return jsonify({"message": "Event updated"})

    except sqlite3.IntegrityError as e:
        if conn:
            conn.close()
        print(f"[Event update] Integrity error: {e}")
        return jsonify({"message": "Database constraint error: Event update failed"}), 400

    except Exception as e:
        if conn:
            conn.close()
        print(f"[Event update] Error: {e}")
        return jsonify({"message": f"Error updating event: {str(e)}"}), 500


# ============================================================
#  EVENT DAYS (per-day capacity breakdown)
# ============================================================

@app.route('/api/events/<int:event_id>/days', methods=['GET'])
def get_event_days(event_id):
    from datetime import date as date_cls, timedelta
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()
    if not event:
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    capacity_per_day = int(event["capacity_per_day"] or 0) if "capacity_per_day" in event.keys() else 0
    if capacity_per_day <= 0:
        conn.close()
        return jsonify({"capacity_per_day": 0, "days": []}), 200

    start = date_cls.fromisoformat(event["start_date"])
    end = date_cls.fromisoformat(event["end_date"] or event["start_date"])

    cur.execute("""
        SELECT event_date, tickets_sold, attendance_count
        FROM event_day_stats WHERE event_id = ?
    """, (event_id,))
    day_map = {row["event_date"]: row for row in cur.fetchall()}
    conn.close()

    days = []
    current = start
    while current <= end:
        date_str = current.isoformat()
        row = day_map.get(date_str)
        sold = int(row["tickets_sold"] if row else 0)
        attended = int(row["attendance_count"] if row else 0)
        remaining = max(capacity_per_day - sold, 0)
        days.append({
            "date": date_str,
            "day_name": current.strftime("%A"),
            "date_display": current.strftime("%d/%m/%Y"),
            "tickets_sold": sold,
            "attendance_count": attended,
            "remaining": remaining,
            "is_sold_out": remaining <= 0
        })
        current += timedelta(days=1)

    return jsonify({"capacity_per_day": capacity_per_day, "days": days})


# ============================================================
#  SCAN ENTRY
# ============================================================

@app.route('/api/events/<int:event_id>/scan', methods=['POST'])
def scan_entry(event_id):
    data = request.get_json()
    staff_id = data.get('staff_id')
    ticket_code = normalize_ticket_code_value(data.get('ticket_code', ''))

    if not staff_id or not ticket_code:
        return jsonify({"message": "Missing scan data", "reason_code": "missing_scan_data"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # verify staff role
    cur.execute("SELECT role FROM users WHERE id = ?", (staff_id,))
    staff_user = cur.fetchone()

    if not staff_user or staff_user["role"] != "entry_staff":
        conn.close()
        return jsonify({"message": "Only entry staff can scan tickets", "reason_code": "invalid_staff_role"}), 403

    cur.execute("""
        SELECT event_id, work_status FROM entry_staff_profiles
        WHERE user_id = ?
    """, (staff_id,))
    staff_profile = cur.fetchone()

    if not staff_profile:
        conn.close()
        return jsonify({"message": "Staff profile not found", "reason_code": "staff_profile_not_found"}), 404

    staff_work_status = normalize_staff_work_status(staff_profile["work_status"])
    if staff_work_status == 'removed':
        conn.close()
        return jsonify({"message": "This staff account has been removed from the assigned event", "reason_code": "staff_removed"}), 403

    if staff_work_status == 'stop_working':
        conn.close()
        return jsonify({
            "message": "You are marked as stop working. Scanning is disabled until the organizer changes your status.",
            "reason_code": "staff_stop_working"
        }), 423

    # get event
    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Event not found", "reason_code": "event_not_found"}), 404

    if int(staff_profile["event_id"]) != int(event_id):
        conn.close()
        return jsonify({"message": "This staff account is not assigned to that event", "reason_code": "staff_wrong_event"}), 403

    event_timing = get_event_runtime_status(event)
    if event_timing["is_upcoming"]:
        conn.close()
        return jsonify({"message": "Event has not started yet", "reason_code": "event_not_started"}), 400

    if event_timing["is_ended"]:
        conn.close()
        return jsonify({"message": "Event has ended", "reason_code": "event_ended"}), 400

    if bool(event["emergency_active"]):
        emergency_message = str(event["emergency_message"] or "").strip()
        conn.close()
        return jsonify({
            "message": emergency_message or "There is an active emergency situation. Entry actions are disabled until the organizer clears this notice.",
            "reason_code": "emergency_active"
        }), 423

    capacity_per_day = int(event["capacity_per_day"] or 0) if "capacity_per_day" in event.keys() else 0
    today_str = get_local_now_naive().strftime('%Y-%m-%d')
    effective_today_capacity = capacity_per_day if capacity_per_day > 0 else int(event["capacity"] or 0)

    # Always read today's real scan count from event_day_stats so Current View is per-day accurate
    cur.execute(
        "SELECT attendance_count FROM event_day_stats WHERE event_id = ? AND event_date = ?",
        (event_id, today_str)
    )
    today_day_row = cur.fetchone()
    today_att_before = int(today_day_row["attendance_count"] or 0) if today_day_row else 0

    if effective_today_capacity > 0 and today_att_before >= effective_today_capacity:
        conn.close()
        return jsonify({
            "message": "Today's session is full. No more attendees should be allowed to enter today." if capacity_per_day > 0 else "This event is full. No more attendees should be allowed to enter.",
            "reason_code": "event_full"
        }), 423

    prev_today_att_for_crowd = today_att_before
    prev_effective_cap = effective_today_capacity
    prev_crowd = calculate_crowd_level(today_att_before, effective_today_capacity)

    cur.execute("SELECT full_name, email FROM users WHERE id = ?", (event["organizer_id"],))
    organizer_contact = cur.fetchone()

    purchase = None
    parsed_purchase_id = parse_purchase_id_from_ticket_code(ticket_code)

    if parsed_purchase_id is not None:
        cur.execute("""
            SELECT tp.*, u.full_name
            FROM ticket_purchases tp
            JOIN users u ON u.id = tp.user_id
            WHERE tp.event_id = ? AND tp.id = ?
        """, (event_id, parsed_purchase_id))
        purchase = cur.fetchone()

        if not purchase:
            cur.execute("""
                SELECT tp.id
                FROM ticket_purchases tp
                WHERE tp.id = ?
            """, (parsed_purchase_id,))
            purchase_any_event = cur.fetchone()
            if purchase_any_event:
                conn.close()
                return jsonify({
                    "message": "Ticket not for this event",
                    "reason_code": "ticket_wrong_event"
                }), 404

    if not purchase:
        cur.execute("""
            SELECT tp.*, u.full_name
            FROM ticket_purchases tp
            JOIN users u ON u.id = tp.user_id
            WHERE tp.event_id = ?
            ORDER BY tp.id ASC
        """, (event_id,))
        purchases = cur.fetchall()

        for row in purchases:
            if normalize_ticket_code_value(format_ticket_code(row["id"])) == ticket_code:
                purchase = row
                break

    if not purchase:
        conn.close()
        return jsonify({"message": "Ticket not found", "reason_code": "ticket_not_found"}), 404

    # Reject the scan when the ticket's booked attendance date does not match today
    ticket_booked_date = purchase["attendance_date"] if "attendance_date" in purchase.keys() else None
    if ticket_booked_date and ticket_booked_date != today_str:
        conn.close()
        return jsonify({
            "message": f"This ticket is not valid for today. It is booked for {ticket_booked_date}.",
            "reason_code": "ticket_wrong_date"
        }), 400

    # Definitive per-day capacity check using the ticket's own attendance_date
    ticket_att_date_check = purchase["attendance_date"] if "attendance_date" in purchase.keys() else None
    if ticket_att_date_check and capacity_per_day > 0:
        cur.execute(
            "SELECT attendance_count FROM event_day_stats WHERE event_id = ? AND event_date = ?",
            (event_id, ticket_att_date_check)
        )
        ticket_day_row = cur.fetchone()
        ticket_day_att = int(ticket_day_row["attendance_count"] or 0) if ticket_day_row else 0
        if ticket_day_att >= capacity_per_day:
            conn.close()
            return jsonify({
                "message": "The session for this ticket date is full. No more attendees should be allowed to enter.",
                "reason_code": "event_full"
            }), 423

    cur.execute("""
        SELECT id FROM attendance
        WHERE event_id = ? AND purchase_id = ?
    """, (event_id, purchase["id"]))
    existing_scan = cur.fetchone()

    if existing_scan:
        conn.close()
        return jsonify({"message": "Ticket already used", "reason_code": "ticket_already_used"}), 409

    # save attendance record
    cur.execute("""
        INSERT INTO attendance (event_id, staff_id, purchase_id, entry_time)
        VALUES (?, ?, ?, app_now())
    """, (event_id, staff_id, purchase["id"]))

    cur.execute("""
        UPDATE ticket_purchases
        SET status = 'Done'
        WHERE id = ?
    """, (purchase["id"],))

    # Always record scan for today's date so every day has its own independent count
    ticket_att_date = purchase["attendance_date"] if "attendance_date" in purchase.keys() else None
    cur.execute("""
        INSERT INTO event_day_stats (event_id, event_date, tickets_sold, attendance_count)
        VALUES (?, ?, 0, 1)
        ON CONFLICT(event_id, event_date) DO UPDATE SET attendance_count = attendance_count + 1
    """, (event_id, today_str))

    # update attendance count
    prev_customer_alert = build_customer_crowd_alert(event["name"], prev_today_att_for_crowd, prev_effective_cap)
    new_count = event["attendance_count"] + 1

    cur.execute("""
        UPDATE events
        SET attendance_count = ?
        WHERE id = ?
    """, (new_count, event_id))

    conn.commit()

    # Always read today's count from event_day_stats so the response matches the real scan count
    cur.execute(
        "SELECT attendance_count, tickets_sold FROM event_day_stats WHERE event_id = ? AND event_date = ?",
        (event_id, today_str)
    )
    after_day_row = cur.fetchone()
    today_att_count = int(after_day_row["attendance_count"] or 0) if after_day_row else 1
    today_tickets_sold = int(after_day_row["tickets_sold"] or 0) if after_day_row else 0
    crowd = calculate_crowd_level(today_att_count, effective_today_capacity)

    updated_event = dict(event)
    updated_event["attendance_count"] = new_count
    updated_event["crowd_level"] = crowd
    prediction = build_crowd_prediction(
        updated_event,
        today_attendance=today_att_count,
        today_capacity=effective_today_capacity,
        today_tickets_sold=today_tickets_sold
    )
    staff_alert = build_staff_alert_state(
        updated_event,
        today_attendance=today_att_count,
        today_capacity=effective_today_capacity
    )
    conn.close()

    firebase_sync(f'events/{event_id}', {
        'attendance_count': new_count,
        'today_attendance_count': today_att_count,
        'today_capacity': effective_today_capacity,
        'today_date': today_str,
        'crowd_level': crowd,
        'capacity': event['capacity'],
        'capacity_per_day': capacity_per_day,
        'prediction': prediction,
        'staff_alert_active': staff_alert["active"],
        'staff_alert_type': staff_alert["type"],
        'staff_alert_severity': staff_alert["severity"],
        'staff_alert_title': staff_alert["title"],
        'staff_alert_message': staff_alert["message"],
        'entry_locked': staff_alert["entry_locked"],
        'entry_lock_reason': staff_alert["entry_lock_reason"],
        'emergency_active': bool(event["emergency_active"]) if "emergency_active" in event.keys() else False,
        'emergency_type': event["emergency_type"] if "emergency_type" in event.keys() else '',
        'emergency_message': event["emergency_message"] if "emergency_message" in event.keys() else ''
    }, method='PATCH')

    customer_alert = build_customer_crowd_alert(event["name"], today_att_count, effective_today_capacity)
    if customer_alert and (not prev_customer_alert or customer_alert["stage"] != prev_customer_alert["stage"]):
        conn2 = get_db_connection()
        cur2 = conn2.cursor()
        alert_holders = get_crowd_alert_ticket_holders(event_id, cur2)
        alert_user_ids = [row["user_id"] for row in alert_holders]
        emails = [row["email"] for row in alert_holders if row["email"]]

        for user_id in alert_user_ids:
            cur2.execute("""
                INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, 0, app_now())
            """, (
                user_id,
                event_id,
                'crowd',
                customer_alert["title"],
                customer_alert["message"]
            ))

        conn2.commit()
        conn2.close()

        if alert_user_ids:
            firebase_send_notification(
                customer_alert["title"],
                customer_alert["message"],
                event_id,
                user_ids=alert_user_ids
            )

        if emails:
            send_email(
                to_list=list(dict.fromkeys(emails)),
                subject=customer_alert["title"] + ' - ' + event["name"],
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#dc2626;margin-top:0;">{customer_alert["title"]}</h2>
                  <p style="white-space:pre-line;">{customer_alert["message"]}</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                  <p style="color:#6b7280;font-size:0.85em;">You received this because you purchased a ticket for this event and crowd alerts are enabled.</p>
                </div>
                """
            )

    if crowd == 'High' and prev_crowd != 'High' and today_att_count < effective_today_capacity:
        conn2 = get_db_connection()
        cur2 = conn2.cursor()
        cur2.execute("""
            SELECT DISTINCT u.id AS user_id
            FROM entry_staff_profiles esp
            JOIN users u ON u.id = esp.user_id
            WHERE esp.event_id = ?
              AND u.role = 'entry_staff'
        """, (event_id,))
        staff_rows = cur2.fetchall()

        for staff_row in staff_rows:
            cur2.execute("""
                INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, 0, app_now())
            """, (
                staff_row["user_id"],
                event_id,
                'crowd',
                'Crowd Warning',
                'The crowd at "' + event["name"] + '" is now high. Prepare to stop entry as the venue approaches full capacity.'
            ))

        conn2.commit()
        conn2.close()

    # notify organizer about every new attendee entry
    organizer_attendance_title = 'New attendee checked in'
    organizer_attendance_message = (
        str(purchase["full_name"] or 'An attendee') +
        ' entered "' + str(event["name"]) +
        '". Current attendance is ' + str(new_count) + '.'
    )
    create_notification(
        user_id=event["organizer_id"],
        event_id=event_id,
        notif_type='attendance',
        title=organizer_attendance_title,
        message=organizer_attendance_message,
        send_email_copy=False
    )
    firebase_send_notification(
        organizer_attendance_title,
        organizer_attendance_message,
        event_id=event_id,
        user_ids=[event["organizer_id"]]
    )

    if crowd != prev_crowd:
        create_notification(
            user_id=event["organizer_id"],
            event_id=event_id,
            notif_type='crowd',
            title='Crowd Level Updated',
            message='Crowd level for "' + event["name"] + '" changed from ' + prev_crowd + ' to ' + crowd + '.',
            send_email_copy=False
        )

        if organizer_contact and organizer_contact["email"]:
            send_email(
                to_list=[organizer_contact["email"]],
                subject=f"Crowd level update for {event['name']}",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#9B1040;margin-top:0;">Crowd level updated</h2>
                  <p>The crowd level for <strong>{event['name']}</strong> changed from <strong>{prev_crowd}</strong> to <strong>{crowd}</strong>.</p>
                  <p>Current attendance: <strong>{today_att_count} / {effective_today_capacity}</strong></p>
                </div>
                """
            )

    if effective_today_capacity > 0 and today_att_count >= effective_today_capacity and prev_today_att_for_crowd < effective_today_capacity:
        conn3 = get_db_connection()
        cur3 = conn3.cursor()
        cur3.execute("""
            SELECT DISTINCT u.id AS user_id
            FROM entry_staff_profiles esp
            JOIN users u ON u.id = esp.user_id
            WHERE esp.event_id = ?
              AND u.role = 'entry_staff'
        """, (event_id,))
        staff_rows = cur3.fetchall()

        for staff_row in staff_rows:
            cur3.execute("""
                INSERT INTO notifications (user_id, event_id, type, title, message, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, 0, app_now())
            """, (
                staff_row["user_id"],
                event_id,
                'crowd',
                'Event Full Warning',
                'This event is full. No more attendees should be allowed to enter.'
            ))

        conn3.commit()
        conn3.close()

    return jsonify({
        "message": "Entry recorded",
        "reason_code": "ticket_verified",
        "ticket_code": ticket_code,
        "ticket_status": "Done",
        "customer_name": purchase["full_name"],
        "attendance_count": new_count,
        "today_attendance_count": today_att_count,
        "today_capacity": effective_today_capacity,
        "crowd_level": crowd,
        "prediction": prediction,
        "tickets_sold": event["tickets_sold"],
        "remaining_entries": max(effective_today_capacity - today_att_count, 0) if effective_today_capacity > 0 else 0,
        "staff_alert_active": staff_alert["active"],
        "staff_alert_type": staff_alert["type"],
        "staff_alert_severity": staff_alert["severity"],
        "staff_alert_title": staff_alert["title"],
        "staff_alert_message": staff_alert["message"],
        "entry_locked": staff_alert["entry_locked"],
        "entry_lock_reason": staff_alert["entry_lock_reason"],
        "emergency_active": bool(event["emergency_active"]) if "emergency_active" in event.keys() else False,
        "emergency_message": event["emergency_message"] if "emergency_message" in event.keys() else ''
    })


# ============================================================
#  ML: BEST TIME TO VISIT
# ============================================================

@app.route('/api/events/<int:event_id>/best-visit-time', methods=['GET'])
def best_visit_time(event_id):
    try:
        from ml_prediction import predict_best_visit_time
        target_date = request.args.get('date') or None
        result = predict_best_visit_time(event_id, target_date=target_date)
        if not result:
            return jsonify({"message": "Event not found"}), 404
        return jsonify(result)
    except Exception as e:
        print(f"[ML prediction error] {e}")
        return jsonify({"message": "Prediction unavailable", "error": str(e)}), 500


# ============================================================
#  TICKET PURCHASES
# ============================================================

@app.route('/api/events/<int:event_id>/buy', methods=['POST'])
def buy_ticket(event_id):
    from datetime import date as date_cls
    data = request.get_json() or {}
    user_id = data.get('user_id')
    quantity = data.get('quantity', 1)
    crowd_alerts_enabled = data.get('crowd_alerts_enabled', True)
    attendance_date = data.get('attendance_date')

    if not user_id:
        return jsonify({"message": "You must sign in as a customer to purchase a ticket"}), 401

    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid ticket quantity"}), 400

    if quantity < 1:
        return jsonify({"message": "You must buy at least one ticket"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    buyer = cur.fetchone()

    if not buyer:
        conn.close()
        return jsonify({"message": "Customer account not found"}), 404

    if buyer["role"] != "customer":
        conn.close()
        return jsonify({"message": "Only customer accounts can purchase tickets"}), 403

    # get event
    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    event_timing = get_event_runtime_status(event)
    if event_timing["is_ended"]:
        conn.close()
        return jsonify({"message": "Event has ended"}), 400

    cur.execute("SELECT full_name, email FROM users WHERE id = ?", (event["organizer_id"],))
    organizer_contact = cur.fetchone()

    capacity_per_day = int(event["capacity_per_day"] or 0) if "capacity_per_day" in event.keys() else 0

    if capacity_per_day > 0:
        # Per-day capacity mode: require attendance_date
        if not attendance_date:
            conn.close()
            return jsonify({"message": "Please select your attendance date before purchasing"}), 400
        try:
            att_d = date_cls.fromisoformat(attendance_date)
            ev_start = date_cls.fromisoformat(event["start_date"])
            ev_end = date_cls.fromisoformat(event["end_date"] or event["start_date"])
            if att_d < ev_start or att_d > ev_end:
                conn.close()
                return jsonify({"message": "Selected date is outside the event range"}), 400
        except Exception:
            conn.close()
            return jsonify({"message": "Invalid attendance date"}), 400

        cur.execute("""
            SELECT tickets_sold FROM event_day_stats
            WHERE event_id = ? AND event_date = ?
        """, (event_id, attendance_date))
        day_row = cur.fetchone()
        day_sold = int(day_row["tickets_sold"] if day_row else 0)
        day_remaining = max(capacity_per_day - day_sold, 0)

        if day_remaining <= 0:
            conn.close()
            return jsonify({"message": "No tickets available for the selected date"}), 400
        if quantity > day_remaining:
            conn.close()
            return jsonify({"message": f"Only {day_remaining} ticket(s) available for the selected date"}), 400
    else:
        # Standard total-capacity mode
        remaining_tickets = max(int(event["capacity"] or 0) - int(event["tickets_sold"] or 0), 0)
        if remaining_tickets <= 0:
            conn.close()
            return jsonify({"message": "Tickets are sold out"}), 400
        if quantity > remaining_tickets:
            conn.close()
            return jsonify({"message": f"Only {remaining_tickets} ticket(s) are still available"}), 400

    purchase_ids = []
    for _ in range(quantity):
        cur.execute("""
            INSERT INTO ticket_purchases (user_id, event_id, purchase_time, status, attendance_date)
            VALUES (?, ?, app_now(), 'Active', ?)
        """, (user_id, event_id, attendance_date))
        purchase_ids.append(cur.lastrowid)

    # update total tickets sold
    new_tickets_sold = int(event["tickets_sold"] or 0) + quantity

    cur.execute("""
        UPDATE events
        SET tickets_sold = ?
        WHERE id = ?
    """, (new_tickets_sold, event_id))

    # update per-day stats if applicable
    if capacity_per_day > 0 and attendance_date:
        cur.execute("""
            INSERT INTO event_day_stats (event_id, event_date, tickets_sold, attendance_count)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(event_id, event_date) DO UPDATE SET tickets_sold = tickets_sold + ?
        """, (event_id, attendance_date, quantity, quantity))

    cur.execute("""
        INSERT INTO notification_preferences (user_email, crowd_alerts_enabled)
        VALUES (?, ?)
        ON CONFLICT(user_email) DO UPDATE SET crowd_alerts_enabled = excluded.crowd_alerts_enabled
    """, (buyer["email"], 1 if crowd_alerts_enabled else 0))

    conn.commit()
    conn.close()

    ticket_codes = [format_ticket_code(purchase_id) for purchase_id in purchase_ids]
    quantity_label = str(quantity) + " ticket" + ("" if quantity == 1 else "s")
    quantity_verb = "has" if quantity == 1 else "have"

    if capacity_per_day > 0 and event["start_date"] and event["end_date"]:
        try:
            _sd = date_cls.fromisoformat(event["start_date"])
            _ed = date_cls.fromisoformat(event["end_date"])
            _num_days = max((_ed - _sd).days + 1, 1)
            _total_cap = capacity_per_day * _num_days
        except Exception:
            _total_cap = int(event["capacity"] or 0)
    else:
        _total_cap = int(event["capacity"] or 0)

    sold_out_after_purchase = _total_cap > 0 and new_tickets_sold >= _total_cap

    # notify customer
    create_notification(
        user_id=user_id,
        event_id=event_id,
        notif_type='ticket',
        title='Ticket Purchased Successfully',
        message='Your ' + quantity_label + ' for "' + event["name"] + '" ' + quantity_verb + ' been confirmed.',
        send_email_copy=False
    )

    # notify organizer
    create_notification(
        user_id=event["organizer_id"],
        event_id=event_id,
        notif_type='update',
        title='New Ticket Purchased',
        message=(buyer["full_name"] if buyer else 'A customer') + ' purchased ' + quantity_label + ' for "' + event["name"] + '".',
        send_email_copy=False
    )

    create_notification(
        user_id=event["organizer_id"],
        event_id=event_id,
        notif_type='ticket',
        title='Tickets Updated',
        message='Ticket sales changed for "' + event["name"] + '". Total sold: ' + str(new_tickets_sold) + ' / ' + str(event["capacity"]) + '.',
        send_email_copy=False
    )

    firebase_send_notification(
        'New Ticket Purchased',
        (buyer["full_name"] if buyer else 'A customer') + ' purchased ' + quantity_label + ' for "' + event["name"] + '".',
        event_id,
        user_ids=[event["organizer_id"]]
    )

    if buyer:
        ticket_code = ticket_codes[0] if ticket_codes else ''
        barcode_attachments = [attachment for attachment in [
            build_barcode_attachment(code, filename_prefix='barcode')
            for code in ticket_codes
        ] if attachment]
        ticket_barcode_cards_html = ''.join(
            build_ticket_card_html(index, len(ticket_codes), code, event['name'])
            for index, code in enumerate(ticket_codes)
        )
        ticket_rows_html = ''.join(
            f'<tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">Ticket Code {index + 1}</td><td style="padding:10px;border:1px solid #e5e7eb;font-family:monospace;font-size:1.1em;color:#9B1040;">{code}</td></tr>'
            for index, code in enumerate(ticket_codes)
        )
        send_email(
            to_list=[buyer["email"]],
            subject=f"Your Ticket Purchase for {event['name']} is Confirmed!",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">🎟️ Ticket Confirmed</h2>
              <p>Hi <strong>{buyer['full_name']}</strong>, your {quantity_label} {quantity_verb} been booked successfully!</p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                <tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">Event</td><td style="padding:10px;border:1px solid #e5e7eb;">{event['name']}</td></tr>
                <tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">Date</td><td style="padding:10px;border:1px solid #e5e7eb;">{attendance_date or event['start_date']} at {event['start_time']}</td></tr>
                <tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">Location</td><td style="padding:10px;border:1px solid #e5e7eb;">{event["location"] or 'TBA'}</td></tr>
                <tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">Quantity</td><td style="padding:10px;border:1px solid #e5e7eb;">{quantity}</td></tr>
                {ticket_rows_html}
              </table>
              <p style="margin:20px 0 14px 0;">Show the barcode below at the entrance. The staff can scan it directly.</p>
              {ticket_barcode_cards_html}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#6b7280;font-size:0.85em;">You received this because you purchased a ticket on Crowd Analyzing.</p>
            </div>
            """,
            attachments=barcode_attachments
        )

    if organizer_contact and organizer_contact["email"]:
        send_email(
            to_list=[organizer_contact["email"]],
            subject=f"New ticket purchase for {event['name']}",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#9B1040;margin-top:0;">New ticket purchase</h2>
              <p><strong>{buyer['full_name'] if buyer else 'A customer'}</strong> purchased {quantity_label} for <strong>{event['name']}</strong>.</p>
              <p>Tickets sold: <strong>{new_tickets_sold} / {event['capacity']}</strong></p>
            </div>
            """
        )

    if sold_out_after_purchase:
        create_notification(
            user_id=event["organizer_id"],
            event_id=event_id,
            notif_type='ticket',
            title='Event Sold Out',
            message='"' + event["name"] + '" is now sold out.',
            send_email_copy=False
        )

        if organizer_contact and organizer_contact["email"]:
            send_email(
                to_list=[organizer_contact["email"]],
                subject=f"{event['name']} is now sold out",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#9B1040;margin-top:0;">Event sold out</h2>
                  <p>Your event <strong>{event['name']}</strong> is now fully booked.</p>
                  <p>Tickets sold: <strong>{new_tickets_sold} / {_total_cap}</strong></p>
                </div>
                """
            )

        _conn2 = get_db_connection()
        _cur2 = _conn2.cursor()
        _holders = get_crowd_alert_ticket_holders(event_id, _cur2)
        _customer_emails = list(dict.fromkeys([r["email"] for r in _holders if r["email"]]))
        _conn2.close()

        if _customer_emails:
            send_email(
                to_list=_customer_emails,
                subject=f"Sold Out - {event['name']}",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#dc2626;margin-top:0;">This event is now sold out</h2>
                  <p>All tickets for <strong>{event['name']}</strong> have been sold.</p>
                  <p style="color:#6b7280;font-size:13px;">You received this because you have a ticket for this event.</p>
                </div>
                """
            )

    # For multi-day events: notify organizer when every attendance date reaches capacity
    if capacity_per_day > 0 and attendance_date:
        try:
            from datetime import date as date_cls, timedelta
            _sd = date_cls.fromisoformat(event["start_date"])
            _ed = date_cls.fromisoformat(event["end_date"] or event["start_date"])

            _ds_conn = get_db_connection()
            _ds_cur = _ds_conn.cursor()
            _ds_cur.execute(
                "SELECT event_date, tickets_sold FROM event_day_stats WHERE event_id = ?",
                (event_id,)
            )
            _day_map = {r["event_date"]: int(r["tickets_sold"] or 0) for r in _ds_cur.fetchall()}
            _ds_conn.close()

            _current = _sd
            _all_days_full = True
            while _current <= _ed:
                if _day_map.get(_current.isoformat(), 0) < capacity_per_day:
                    _all_days_full = False
                    break
                _current += timedelta(days=1)

            # Only fire once — when this purchase was the one that tipped the last day
            _day_just_tipped = (day_sold + quantity) >= capacity_per_day and day_sold < capacity_per_day

            if _all_days_full and _day_just_tipped:
                create_notification(
                    user_id=event["organizer_id"],
                    event_id=event_id,
                    notif_type='ticket',
                    title='All Days Sold Out',
                    message='"' + event["name"] + '" is now sold out for all available days.',
                    send_email_copy=False
                )
                firebase_send_notification(
                    'All Days Sold Out',
                    '"' + event["name"] + '" is now sold out for all available days.',
                    event_id,
                    user_ids=[event["organizer_id"]]
                )
                if organizer_contact and organizer_contact["email"]:
                    send_email(
                        to_list=[organizer_contact["email"]],
                        subject=f"{event['name']} — All dates are now sold out",
                        html_body=f"""
                        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                          <h2 style="color:#9B1040;margin-top:0;">All Dates Sold Out</h2>
                          <p>Your event <strong>{event['name']}</strong> is now sold out for all available attendance dates.</p>
                          <p>Every scheduled day has reached full capacity. No more tickets can be purchased.</p>
                        </div>
                        """
                    )
                _holders_conn = get_db_connection()
                _holders_cur = _holders_conn.cursor()
                _holders = get_crowd_alert_ticket_holders(event_id, _holders_cur)
                _holders_conn.close()
                _customer_emails = list(dict.fromkeys([
                    r["email"] for r in _holders if r["email"] and r["email"] != (organizer_contact["email"] if organizer_contact else None)
                ]))
                if _customer_emails:
                    send_email(
                        to_list=_customer_emails,
                        subject=f"All dates sold out — {event['name']}",
                        html_body=f"""
                        <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                          <h2 style="color:#dc2626;margin-top:0;">All Dates Are Now Sold Out</h2>
                          <p>All attendance dates for <strong>{event['name']}</strong> have reached full capacity.</p>
                          <p>No more tickets are available for any date. Your existing ticket is still valid.</p>
                          <p style="color:#6b7280;font-size:13px;">You received this because you have a ticket for this event.</p>
                        </div>
                        """
                    )
        except Exception as e:
            print("Error in all-days-sold-out notification:", e)

    return jsonify({
        "message": quantity_label + " purchased successfully",
        "ticket_code": ticket_codes[0] if ticket_codes else None,
        "ticket_codes": ticket_codes,
        "ticket_barcodes": [build_barcode_data_uri(code) for code in ticket_codes],
        "quantity": quantity,
        "event_name": event["name"],
        "tickets_sold": new_tickets_sold,
        "attendance_date": attendance_date,
        "crowd_alerts_enabled": bool(crowd_alerts_enabled)
    })


# ============================================================
#  REPORTS
# ============================================================

@app.route('/api/reports/<int:event_id>', methods=['GET'])
def get_event_report(event_id):
    start = request.args.get('start')
    end = request.args.get('end')

    conn = get_db_connection()
    cur = conn.cursor()

    # get event
    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    # get customer purchases for this event
    cur.execute("""
        SELECT
            tp.id AS purchase_id,
            tp.purchase_time,
            tp.status,
            u.full_name,
            u.email
        FROM ticket_purchases tp
        JOIN users u ON tp.user_id = u.id
        WHERE tp.event_id = ?
        ORDER BY tp.id ASC
    """, (event_id,))
    purchase_rows = cur.fetchall()

    # get staff assigned to this event
    cur.execute("""
        SELECT
            esp.user_id AS staff_id,
            u.full_name,
            e.name AS event_name
        FROM entry_staff_profiles esp
        JOIN users u ON esp.user_id = u.id
        JOIN events e ON esp.event_id = e.id
        WHERE esp.event_id = ?
        ORDER BY u.full_name ASC
    """, (event_id,))
    staff_rows = cur.fetchall()

    tickets_sold = event["tickets_sold"]
    attendance_count = event["attendance_count"]
    capacity = event["capacity"]
    ticket_price = event["ticket_price"]

    revenue = tickets_sold * ticket_price
    purchase_rate = round((tickets_sold / capacity) * 100, 2) if capacity > 0 else 0
    attendance_rate = round((attendance_count / tickets_sold) * 100, 2) if tickets_sold > 0 else 0
    capacity_attendance_rate = round((attendance_count / capacity) * 100, 2) if capacity > 0 else 0
    sold_out = tickets_sold >= capacity if capacity > 0 else False
    crowd_level = calculate_crowd_level(attendance_count, capacity)

    purchases = []
    for row in purchase_rows:
        purchases.append({
            "ticket_code": format_ticket_code(row["purchase_id"]),
            "customer_name": row["full_name"],
            "customer_email": row["email"],
            "ticket_price": ticket_price,
            "purchase_time": row["purchase_time"],
            "status": row["status"] or "Active"
        })

    staff = []
    for row in staff_rows:
        staff.append({
            "staff_id": row["staff_id"],
            "staff_name": row["full_name"],
            "event_name": row["event_name"]
        })

    report = {
        "event_id": event["id"],
        "event_name": event["name"],
        "start_date": event["start_date"],
        "end_date": event["end_date"],
        "filter_start": start,
        "filter_end": end,
        "capacity": capacity,
        "ticket_price": ticket_price,
        "tickets_sold": tickets_sold,
        "attendance_count": attendance_count,
        "revenue": revenue,
        "purchase_rate": purchase_rate,
        "attendance_rate": attendance_rate,
        "capacity_attendance_rate": capacity_attendance_rate,
        "sold_out": sold_out,
        "crowd_level": crowd_level,
        "customers": purchases,
        "staff": staff
    }

    conn.close()
    return jsonify(report)


# ============================================================
#  NOTIFICATIONS
# ============================================================

@app.route('/api/notification-preference/<int:user_id>', methods=['GET'])
def get_notification_preference_value(user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id, role, email FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    if not user:
        conn.close()
        return jsonify({"message": "User not found"}), 404

    enabled = get_notification_preference(cur, user_email=user["email"], user_id=user_id)
    conn.close()

    return jsonify({
        "user_id": user_id,
        "role": user["role"],
        "enabled": bool(enabled)
    })


@app.route('/api/notification-preference', methods=['POST'])
def save_notification_preference():
    data = request.get_json() or {}

    user_id = data.get('user_id')
    enabled = data.get('enabled')

    if user_id is None or enabled is None:
        return jsonify({"message": "Missing fields"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    user_email = get_user_email_by_id(cur, user_id)
    if not user_email:
        conn.close()
        return jsonify({"message": "User not found"}), 404

    enabled_value = 1 if parse_bool_value(enabled, True) else 0

    cur.execute("""
        INSERT INTO notification_preferences (user_email, crowd_alerts_enabled)
        VALUES (?, ?)
        ON CONFLICT(user_email) DO UPDATE SET crowd_alerts_enabled = excluded.crowd_alerts_enabled
    """, (user_email, enabled_value))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Preference saved successfully",
        "enabled": bool(enabled_value)
    })


@app.route('/api/notifications/<int:user_id>', methods=['GET'])
def get_notifications(user_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            n.*,
            e.name AS event_name
        FROM notifications n
        LEFT JOIN events e ON e.id = n.event_id
        WHERE n.user_id = ?
        ORDER BY n.id DESC
    """, (user_id,))

    rows = cur.fetchall()
    conn.close()

    notifications = []

    for row in rows:
        title, message = normalize_notification_copy(row["type"], row["title"], row["message"])
        notifications.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "event_id": row["event_id"],
            "event_name": row["event_name"],
            "type": row["type"],
            "title": title,
            "message": message,
            "is_read": bool(row["is_read"]),
            "created_at": row["created_at"]
        })

    return jsonify(notifications)


@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    notif_type = str(data.get('type') or '').strip().lower() or None

    if not user_id:
        return jsonify({"message": "Missing user_id"}), 400

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid user_id"}), 400

    updated_count = mark_notifications_as_read(user_id, notif_type)

    return jsonify({
        "message": "Notifications marked as read",
        "updated_count": updated_count
    })


# ============================================================
#  EMERGENCY NOTIFICATION ROUTE
# ============================================================

@app.route('/api/events/<int:event_id>/emergency', methods=['POST'])
def send_emergency(event_id):
    data = request.get_json() or {}

    organizer_id = data.get('organizer_id')
    message = str(data.get('message', '')).strip()
    reassurance_message = str(data.get('reassurance_message', '')).strip()
    emergency_type = str(data.get('emergency_type', 'other')).strip().lower()
    clear_emergency = parse_bool_value(data.get('clear_emergency'), False)

    if not organizer_id:
        return jsonify({"message": "Missing fields"}), 400

    if not clear_emergency and not message:
        return jsonify({"message": "Missing fields"}), 400

    try:
        organizer_id = int(organizer_id)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid organizer"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    if event["organizer_id"] != organizer_id:
        conn.close()
        return jsonify({"message": "Access denied"}), 403

    cur.execute("""
        SELECT DISTINCT u.id AS user_id, u.email
        FROM entry_staff_profiles esp
        JOIN users u ON u.id = esp.user_id
        WHERE esp.event_id = ?
          AND u.role = 'entry_staff'
    """, (event_id,))
    staff_rows = cur.fetchall()

    if clear_emergency:
        if not reassurance_message:
            conn.close()
            return jsonify({"message": "Please write a reassurance message before clearing the emergency alert"}), 400

        customer_rows = get_event_ticket_holders(event_id, cur)

        cur.execute("""
            UPDATE events
            SET emergency_active = 0,
                emergency_type = NULL,
                emergency_message = NULL,
                emergency_cleared_at = app_now()
            WHERE id = ?
        """, (event_id,))
        conn.commit()

        reassurance_notice = 'Emergency cleared for "' + event["name"] + '".\n\n' + reassurance_message
        recipient_emails = []
        recipient_user_ids = []

        for row in list(customer_rows) + list(staff_rows):
            create_notification(
                user_id=row["user_id"],
                event_id=event_id,
                notif_type='update',
                title='Emergency Cleared',
                message=reassurance_notice,
                send_email_copy=False
            )
            recipient_user_ids.append(row["user_id"])
            if row["email"]:
                recipient_emails.append(row["email"])

        recipient_emails = list(dict.fromkeys(recipient_emails))
        recipient_user_ids = list(dict.fromkeys(recipient_user_ids))

        if recipient_user_ids:
            firebase_send_notification(
                'Emergency Cleared',
                reassurance_message,
                event_id,
                user_ids=recipient_user_ids
            )

        if recipient_emails:
            send_email(
                to_list=recipient_emails,
                subject=f"Emergency Cleared - {event['name']}",
                html_body=f"""
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
                  <h2 style="color:#16a34a;margin-top:0;">Emergency Cleared</h2>
                  <p>The emergency alert for <strong>{event['name']}</strong> has been removed.</p>
                  <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:6px;margin:16px 0;">
                    <p style="margin:0;color:#1f2937;white-space:pre-line;">{reassurance_message}</p>
                  </div>
                  <p style="color:#6b7280;font-size:0.9em;">Event: {event['name']}<br>Date: {event['start_date']} at {event['start_time']}</p>
                </div>
                """
            )

        create_notification(
            user_id=organizer_id,
            event_id=event_id,
            notif_type='update',
            title='Emergency Cleared',
            message='You cleared the emergency alert for "' + event["name"] + '".\n\nReassurance message sent:\n' + reassurance_message,
            send_email_copy=False
        )

        updated_event = dict(event)
        updated_event["emergency_active"] = 0
        updated_event["emergency_type"] = None
        updated_event["emergency_message"] = None
        updated_event["emergency_cleared_at"] = current_timestamp()
        staff_alert = build_staff_alert_state(updated_event)

        firebase_sync(f'events/{event_id}', {
            'emergency_active': False,
            'emergency_type': '',
            'emergency_message': '',
            'staff_alert_active': staff_alert["active"],
            'staff_alert_type': staff_alert["type"],
            'staff_alert_severity': staff_alert["severity"],
            'staff_alert_title': staff_alert["title"],
            'staff_alert_message': staff_alert["message"],
            'entry_locked': staff_alert["entry_locked"],
            'entry_lock_reason': staff_alert["entry_lock_reason"]
        }, method='PATCH')

        conn.close()
        return jsonify({
            "message": "Emergency notice cleared",
            "event": serialize_event_row(updated_event)
        })

    emergency_title_map = {
        "stop_event": "Stop Event",
        "weather_warning": "Weather Warning",
        "evacuation": "Evacuation",
        "safety_issue": "Safety Issue",
        "other": "Other",
        "custom": "Other"
    }
    emergency_prefix_map = {
        "stop_event": "The organizer has stopped the event. Please leave the venue immediately and follow staff instructions.",
        "weather_warning": "There is a weather warning for this event. Please leave the venue safely and follow staff instructions.",
        "evacuation": "An evacuation is required. Please leave the venue immediately using the nearest safe exit.",
        "safety_issue": "A safety issue has been reported. Please stay calm and follow organizer and staff instructions.",
        "other": "",
        "custom": ""
    }

    title = emergency_title_map.get(emergency_type, "Other")
    prefix = emergency_prefix_map.get(emergency_type, "")
    full_message = (prefix + "\n\n" + message).strip() if prefix else message
    staff_message = build_staff_emergency_message(emergency_type, full_message)
    customer_rows = get_event_ticket_holders(event_id, cur)

    cur.execute("""
        UPDATE events
        SET emergency_active = 1,
            emergency_type = ?,
            emergency_message = ?,
            emergency_started_at = app_now(),
            emergency_cleared_at = NULL
        WHERE id = ?
    """, (emergency_type, staff_message, event_id))
    conn.commit()

    customer_recipient_emails = []
    staff_recipient_emails = []
    push_recipient_user_ids = []
    notified_user_ids = set()
    for row in list(customer_rows):
        if row["user_id"] in notified_user_ids:
            continue
        notified_user_ids.add(row["user_id"])
        create_notification(
            user_id=row["user_id"],
            event_id=event_id,
            notif_type='emergency',
            title='Emergency Alert',
            message=full_message,
            send_email_copy=False
        )
        push_recipient_user_ids.append(row["user_id"])
        if row["email"]:
            customer_recipient_emails.append(row["email"])

    for row in list(staff_rows):
        if row["user_id"] in notified_user_ids:
            continue
        notified_user_ids.add(row["user_id"])
        create_notification(
            user_id=row["user_id"],
            event_id=event_id,
            notif_type='emergency',
            title='Emergency Alert',
            message=staff_message,
            send_email_copy=False
        )
        push_recipient_user_ids.append(row["user_id"])
        if row["email"]:
            staff_recipient_emails.append(row["email"])

    customer_recipient_emails = list(dict.fromkeys(customer_recipient_emails))
    staff_recipient_emails = list(dict.fromkeys(staff_recipient_emails))
    push_recipient_user_ids = list(dict.fromkeys(push_recipient_user_ids))
    updated_event = dict(event)
    updated_event["emergency_active"] = 1
    updated_event["emergency_type"] = emergency_type
    updated_event["emergency_message"] = staff_message
    updated_event["emergency_started_at"] = current_timestamp()
    staff_alert = build_staff_alert_state(updated_event)

    firebase_sync(f'events/{event_id}', {
        'emergency_active': True,
        'emergency_type': emergency_type,
        'emergency_message': staff_message,
        'staff_alert_active': staff_alert["active"],
        'staff_alert_type': staff_alert["type"],
        'staff_alert_severity': staff_alert["severity"],
        'staff_alert_title': staff_alert["title"],
        'staff_alert_message': staff_alert["message"],
        'entry_locked': staff_alert["entry_locked"],
        'entry_lock_reason': staff_alert["entry_lock_reason"]
    }, method='PATCH')

    if push_recipient_user_ids:
        firebase_send_notification(
            'Emergency Alert',
            full_message,
            event_id,
            user_ids=push_recipient_user_ids
        )

    if customer_recipient_emails:
        send_email(
            to_list=customer_recipient_emails,
            subject=f"Emergency Alert - {event['name']}",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#dc2626;margin-top:0;">Emergency Alert</h2>
              <p>An emergency alert is active for <strong>{event['name']}</strong>.</p>
              <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:16px 0;">
                <p style="margin:0;color:#1f2937;white-space:pre-line;">{full_message}</p>
              </div>
              <p style="color:#6b7280;font-size:0.9em;">Event: {event['name']}<br>Date: {event['start_date']} at {event['start_time']}</p>
            </div>
            """
        )

    if staff_recipient_emails:
        send_email(
            to_list=staff_recipient_emails,
            subject=f"Emergency Alert - {event['name']}",
            html_body=f"""
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;">
              <h2 style="color:#dc2626;margin-top:0;">Emergency Alert</h2>
              <p>An emergency alert is active for staff working at <strong>{event['name']}</strong>.</p>
              <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:16px 0;">
                <p style="margin:0;color:#1f2937;white-space:pre-line;">{staff_message}</p>
              </div>
              <p style="color:#6b7280;font-size:0.9em;">Event: {event['name']}<br>Date: {event['start_date']} at {event['start_time']}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
              <p style="color:#6b7280;font-size:0.85em;">This emergency email was sent only to staff linked to this event.</p>
            </div>
            """
        )

    create_notification(
        user_id=organizer_id,
        event_id=event_id,
        notif_type='emergency',
        title=title,
        message='You sent an emergency alert for "' + event["name"] + '".\n\n' + full_message,
        send_email_copy=False
    )

    conn.close()
    return jsonify({
        "message": "Emergency notification sent!",
        "event": serialize_event_row(updated_event)
    })


# ============================================================
#  HOURLY UPDATE ROUTE
# ============================================================

@app.route('/api/events/<int:event_id>/hourly-update', methods=['POST'])
def hourly_update(event_id):
    data = request.get_json()
    organizer_id = data.get('organizer_id')

    if not organizer_id:
        return jsonify({"message": "Missing organizer_id"}), 400

    try:
        organizer_id = int(organizer_id)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid organizer_id"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    organizer, organizer_error = ensure_approved_organizer(cur, organizer_id)
    if organizer_error:
        conn.close()
        return jsonify({"message": organizer_error[0]}), organizer_error[1]

    cur.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cur.fetchone()

    if not event:
        conn.close()
        return jsonify({"message": "Event not found"}), 404

    if event["organizer_id"] != organizer_id:
        conn.close()
        return jsonify({"message": "Access denied"}), 403

    event_timing = get_event_runtime_status(event)
    if event_timing["is_upcoming"] or event_timing["is_ended"]:
        conn.close()
        return jsonify({"message": "Event is not live right now", "sent": False}), 200

    now = datetime.now()
    last_sent_at = parse_app_datetime(event["last_hourly_crowd_notification_at"]) if "last_hourly_crowd_notification_at" in event.keys() else None
    if last_sent_at and (now - last_sent_at) < timedelta(hours=1):
        conn.close()
        return jsonify({"message": "Hourly crowd update already sent recently", "sent": False}), 200

    previous_attendance_count = event["last_hourly_crowd_attendance_count"] if "last_hourly_crowd_attendance_count" in event.keys() else None
    title, update_message = build_organizer_hourly_crowd_message(event, previous_attendance_count)

    cur.execute("""
        UPDATE events
        SET last_hourly_crowd_notification_at = app_now(),
            last_hourly_crowd_attendance_count = ?
        WHERE id = ?
    """, (int(event["attendance_count"] or 0), event_id))
    conn.commit()
    conn.close()

    create_notification(
        user_id=organizer_id,
        event_id=event_id,
        notif_type='crowd',
        title=title,
        message=update_message,
        send_email_copy=False
    )
    firebase_send_notification(
        title,
        update_message,
        event_id=event_id,
        user_ids=[organizer_id]
    )

    return jsonify({"message": "Hourly crowd update sent!", "sent": True})


# ============================================================
#  RUN APP
# ============================================================

if __name__ == '__main__':
    init_db()
    app.run(
        debug=True,
        host=os.environ.get('HOST', '0.0.0.0'),
        port=int(os.environ.get('PORT', '5001'))
    )

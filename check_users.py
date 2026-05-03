import sqlite3

conn = sqlite3.connect('crowd_analysis.db')
cur = conn.cursor()
cur.execute('SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC LIMIT 5')
rows = cur.fetchall()
print('Last 5 users by ID:')
for row in rows:
    print(f'{row[0]}: {row[1]} ({row[2]}) - {row[3]} - {row[4]}')
conn.close()
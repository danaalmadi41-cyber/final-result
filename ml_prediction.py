import sqlite3
import math
from datetime import datetime, timedelta, date as date_cls
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import Ridge

DB_PATH = 'crowd_analysis.db'

# Arrival timing profiles per event category.
# peak_pct  – fraction into operating hours when crowd peaks (0=open, 1=close)
# sigma_pct – spread of arrivals as fraction of operating hours
# tail_start – fraction of operating hours when departures begin
CATEGORY_PROFILES = {
    'music':         {'peak_pct': 0.12, 'sigma_pct': 0.18, 'tail_start': 0.85},
    'sports':        {'peak_pct': 0.10, 'sigma_pct': 0.22, 'tail_start': 0.80},
    'entertainment': {'peak_pct': 0.20, 'sigma_pct': 0.28, 'tail_start': 0.82},
    'technology':    {'peak_pct': 0.38, 'sigma_pct': 0.32, 'tail_start': 0.88},
    'conference':    {'peak_pct': 0.38, 'sigma_pct': 0.32, 'tail_start': 0.88},
    'art':           {'peak_pct': 0.30, 'sigma_pct': 0.35, 'tail_start': 0.85},
    'food':          {'peak_pct': 0.25, 'sigma_pct': 0.30, 'tail_start': 0.83},
    'default':       {'peak_pct': 0.22, 'sigma_pct': 0.28, 'tail_start': 0.82},
}

# Fraction of ticket holders expected to actually show up
DEFAULT_SHOW_RATE = 0.80
# Conservative fill estimate when there is no ticket or scan data for a day
NO_DATA_FILL_ESTIMATE = 0.35


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_time(time_str):
    """Return (hour, minute) from 'HH:MM', defaulting to (9, 0)."""
    try:
        parts = str(time_str or '').split(':')
        return int(parts[0]), int(parts[1])
    except Exception:
        return 9, 0


def _crowd_label(pct):
    if pct < 25:
        return 'low'
    if pct < 55:
        return 'moderate'
    if pct < 80:
        return 'high'
    return 'very_high'


def _crowd_color(label):
    return {
        'low':       '#22C55E',
        'moderate':  '#F59E0B',
        'high':      '#EF4444',
        'very_high': '#991B1B',
    }.get(label, '#94A3B8')


def _gaussian_cdf(t, mu, sigma):
    if sigma <= 0:
        return 1.0 if t >= mu else 0.0
    return 0.5 * (1.0 + math.erf((t - mu) / (sigma * math.sqrt(2))))


def _departure_fraction(t, tail_start, total):
    if total <= 0 or t <= tail_start * total:
        return 0.0
    x = (t - tail_start * total) / max((1.0 - tail_start) * total, 0.001)
    return min(1.0, x * x)


def _synthetic_crowd_curve(profile, total_hours, n_points=50):
    """
    Generate (t, crowd_fraction) points using the category Gaussian profile.
    crowd_fraction is in [0, 1] where 1 = all expected attendees present.
    """
    ts = np.linspace(0, total_hours, n_points)
    mu = profile['peak_pct'] * total_hours
    sigma = profile['sigma_pct'] * total_hours
    tail = profile['tail_start']
    ys = []
    for t in ts:
        arrived = _gaussian_cdf(t, mu, sigma)
        dep = _departure_fraction(t, tail, total_hours)
        ys.append(max(0.0, arrived * (1.0 - dep)))
    return ts, np.array(ys)


def _fit_model(t_train, y_train):
    model = Pipeline([
        ('poly', PolynomialFeatures(degree=3, include_bias=False)),
        ('reg',  Ridge(alpha=1.0)),
    ])
    model.fit(t_train.reshape(-1, 1), y_train)
    return model


def _build_day_model(profile, day_hours, real_offsets, expected_max):
    """
    Fit a crowd model for a single operating day.

    real_offsets  – hour offsets of actual scans from day_start (may be empty)
    expected_max  – estimated total attendees for this day (≤ capacity)

    Returns (fitted_model, confidence_string).
    The model outputs crowd fraction in [0, 1] where 1 = expected_max people present.
    """
    t_synth, y_synth = _synthetic_crowd_curve(profile, day_hours, n_points=50)
    confidence = 'category-prior'

    if len(real_offsets) >= 3:
        # Calibrate the arrival peak timing from observed scans
        obs_mean = float(np.mean(real_offsets))
        obs_sigma = max(float(np.std(real_offsets)) if len(real_offsets) > 1
                        else profile['sigma_pct'] * day_hours, 0.1)
        cal_peak = min(max(obs_mean / day_hours, 0.05), 0.95)
        cal_sigma = min(max(obs_sigma / day_hours, 0.05), 0.50)
        cal_profile = dict(profile, peak_pct=cal_peak, sigma_pct=cal_sigma)
        t_cal, y_cal = _synthetic_crowd_curve(cal_profile, day_hours, n_points=50)

        # Build cumulative arrival fraction at each scan time.
        # This teaches the model the actual observed arrival rate for this day.
        sorted_offs = sorted(real_offsets)
        cum_y = np.array([min(1.0, (i + 1) / expected_max) for i, _ in enumerate(sorted_offs)])

        t_train = np.concatenate([t_cal, np.array(sorted_offs)])
        y_train = np.concatenate([y_cal, cum_y])
        confidence = 'data-driven'
    elif len(real_offsets) >= 1:
        # A handful of scans: trust the category prior but note partial data
        t_train, y_train = t_synth, y_synth
        confidence = 'low'
    else:
        t_train, y_train = t_synth, y_synth

    return _fit_model(t_train, y_train), confidence


def _slots_for_day(day_start_dt, day_hours, capacity, expected_max,
                   real_offsets, profile, now, step, is_whole_day_past):
    """
    Generate prediction slots for one operating day window.
    Returns (list[slot_dict], confidence_str).
    """
    model, confidence = _build_day_model(profile, day_hours, real_offsets, expected_max)

    # Fill-rate ceiling for this day: expected_max / capacity ≤ 1.0
    fill_ceiling = min(expected_max / max(capacity, 1), 1.0)

    slots = []
    t = 0.0
    while t <= day_hours + step * 0.5:
        slot_dt = day_start_dt + timedelta(hours=t)

        raw_frac = float(model.predict([[t]])[0])
        crowd_frac = min(max(raw_frac, 0.0), 1.0) * fill_ceiling
        predicted_pct = max(0, min(100, int(round(crowd_frac * 100))))

        is_past = is_whole_day_past or slot_dt < now - timedelta(minutes=15)
        is_now = (not is_past) and abs((slot_dt - now).total_seconds()) < (step * 3600 * 0.6)
        label = _crowd_label(predicted_pct)

        _h = slot_dt.hour % 12 or 12
        time_label = f"{_h}:{slot_dt.strftime('%M')} {'AM' if slot_dt.hour < 12 else 'PM'}"

        slots.append({
            'time_label':    time_label,
            'date_label':    slot_dt.strftime('%a %d %b'),
            'predicted_pct': predicted_pct,
            'crowd_label':   label,
            'crowd_color':   _crowd_color(label),
            'is_past':       is_past,
            'is_now':        is_now,
        })
        t = round(t + step, 1)

    return slots, confidence


def _pick_recommendation(slots):
    """
    Return the single slot that best balances low crowd with some activity.
    Always picks the LEAST crowded future slot, never a "near-peak" suggestion.
    """
    future = [s for s in slots if not s['is_past']]

    if not future:
        # All slots are past — pick quietest overall
        quiet = [s for s in slots if s['predicted_pct'] < 55]
        return min(quiet, key=lambda s: s['predicted_pct']) if quiet else (slots[0] if slots else None)

    # Prefer a slot with some crowd presence (≥5%) to avoid suggesting before doors open
    active = [s for s in future if s['predicted_pct'] >= 5]
    pool = active if active else future

    # Ideal window: comfortable but lively (15–54%)
    comfortable = [s for s in pool if 15 <= s['predicted_pct'] <= 54]
    if comfortable:
        return min(comfortable, key=lambda s: s['predicted_pct'])

    # All slots are very quiet (<15%) or very busy (≥55%) — pick the least crowded
    return min(pool, key=lambda s: s['predicted_pct'])


def _build_reason(recommended):
    if not recommended:
        return ''
    pct = recommended['predicted_pct']
    if pct < 25:
        return f"Crowd expected at only {pct}% — quiet and relaxed."
    if pct < 55:
        return f"Crowd expected at {pct}% — good atmosphere without heavy crowding."
    if pct < 80:
        return f"This is the least busy upcoming slot at {pct}% — arrive early if possible."
    return f"The event is expected to be busy ({pct}%). Plan accordingly."


def predict_best_visit_time(event_id, target_date=None):
    """
    Main entry point.
    Returns a dict with hourly slots, a recommended visit slot, and metadata.
    Returns None if the event is not found.

    For multi-day events each calendar day gets its own independent crowd model
    using that day's specific capacity and attendance data from event_day_stats,
    so predictions per day are realistic and not inflated by cumulative totals.
    """
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute('SELECT * FROM events WHERE id = ?', (event_id,))
    ev = cur.fetchone()
    if not ev:
        conn.close()
        return None

    capacity_per_day = int(ev['capacity_per_day'] or 0) if 'capacity_per_day' in ev.keys() else 0
    start_date_str = ev['start_date']
    end_date_str = ev['end_date'] or ev['start_date']
    is_multi_day = capacity_per_day > 0 and start_date_str != end_date_str

    now = datetime.now()
    category = str(ev['category'] or 'default').lower()
    profile = CATEGORY_PROFILES.get(category, CATEGORY_PROFILES['default'])
    start_h, start_m = _parse_time(ev['start_time'])
    end_h, end_m = _parse_time(ev['end_time'])

    # Operating hours per day (or total for single-day event)
    day_hours = (end_h + end_m / 60.0) - (start_h + start_m / 60.0)
    if day_hours <= 0:
        day_hours += 24
    if day_hours < 0.5:
        day_hours = 0.5

    step = 0.5 if day_hours <= 6 else 1.0

    # ---------------------------------------------------------------
    #  MULTI-DAY: one independent model per calendar day
    # ---------------------------------------------------------------
    if is_multi_day:
        cur.execute(
            'SELECT event_date, attendance_count, tickets_sold '
            'FROM event_day_stats WHERE event_id = ?',
            (event_id,)
        )
        day_stats_map = {
            r['event_date']: {
                'attendance': int(r['attendance_count'] or 0),
                'tickets':    int(r['tickets_sold'] or 0),
            }
            for r in cur.fetchall()
        }

        cur.execute('SELECT entry_time FROM attendance WHERE event_id = ?', (event_id,))
        all_entries = [r['entry_time'] for r in cur.fetchall()]
        conn.close()

        # Group scan times by calendar date
        entries_by_date = {}
        for et_str in all_entries:
            try:
                et = datetime.strptime(et_str, '%Y-%m-%d %H:%M:%S')
                entries_by_date.setdefault(et.strftime('%Y-%m-%d'), []).append(et)
            except ValueError:
                pass

        start_d = date_cls.fromisoformat(start_date_str)
        end_d = date_cls.fromisoformat(end_date_str)

        all_slots = []
        best_confidence = 'category-prior'

        current_date = start_d
        while current_date <= end_d:
            d_str = current_date.strftime('%Y-%m-%d')
            day_start_dt = datetime(current_date.year, current_date.month, current_date.day,
                                    start_h, start_m)
            day_end_dt = day_start_dt + timedelta(hours=day_hours)
            is_whole_day_past = day_end_dt < now - timedelta(minutes=15)

            stats = day_stats_map.get(d_str, {})
            attendance_day = stats.get('attendance', 0)
            tickets_day = stats.get('tickets', 0)

            # Estimate how many people will actually attend this day
            if tickets_day > 0:
                # Scale ticket sales by show-up rate, cap at daily capacity
                expected_max = min(int(round(tickets_day * DEFAULT_SHOW_RATE)), capacity_per_day)
            elif attendance_day > 0:
                # Already scanning but no per-day ticket record — project from current progress
                elapsed_frac = min((now - day_start_dt).total_seconds() / (day_hours * 3600), 1.0)
                elapsed_frac = max(elapsed_frac, 0.05)
                expected_max = min(int(round(attendance_day / elapsed_frac)), capacity_per_day)
            else:
                # No data at all — conservative estimate
                expected_max = max(int(capacity_per_day * NO_DATA_FILL_ESTIMATE), 1)
            # Never let expected_max fall below what has already scanned in
            expected_max = max(expected_max, attendance_day, 1)

            # Scan offsets for this specific day only
            real_offsets = []
            for et in entries_by_date.get(d_str, []):
                offset = (et - day_start_dt).total_seconds() / 3600
                if -0.5 <= offset <= day_hours + 0.5:
                    real_offsets.append(max(0.0, offset))

            day_slots, day_conf = _slots_for_day(
                day_start_dt, day_hours, capacity_per_day, expected_max,
                real_offsets, profile, now, step, is_whole_day_past
            )
            all_slots.extend(day_slots)

            if day_conf == 'data-driven':
                best_confidence = 'data-driven'
            elif day_conf == 'low' and best_confidence == 'category-prior':
                best_confidence = 'low'

            current_date += timedelta(days=1)

        slots = all_slots
        model_confidence = best_confidence
        total_hours = day_hours * ((end_d - start_d).days + 1)

    # ---------------------------------------------------------------
    #  SINGLE-DAY EVENT
    # ---------------------------------------------------------------
    else:
        single_capacity = max(int(ev['capacity'] or 1), 1)
        event_start_dt = datetime(
            *[int(x) for x in start_date_str.split('-')], start_h, start_m
        )
        event_end_date_str = end_date_str
        event_end_dt = datetime(
            *[int(x) for x in event_end_date_str.split('-')], end_h, end_m
        )
        if event_end_dt <= event_start_dt:
            event_end_dt += timedelta(days=1)

        actual_hours = (event_end_dt - event_start_dt).total_seconds() / 3600
        if actual_hours < 0.5:
            actual_hours = 0.5

        # Use today-scoped attendance from event_day_stats
        today_str = now.strftime('%Y-%m-%d')
        cur.execute(
            'SELECT attendance_count, tickets_sold FROM event_day_stats '
            'WHERE event_id = ? AND event_date = ?',
            (event_id, today_str)
        )
        day_row = cur.fetchone()
        attendance_today = (
            int(day_row['attendance_count'] or 0) if day_row
            else int(ev['attendance_count'] or 0)
        )
        tickets_sold = int(ev['tickets_sold'] or 0)

        cur.execute('SELECT entry_time FROM attendance WHERE event_id = ?', (event_id,))
        all_entries = [r['entry_time'] for r in cur.fetchall()]
        conn.close()

        if tickets_sold > 0:
            expected_max = min(int(round(tickets_sold * DEFAULT_SHOW_RATE)), single_capacity)
        else:
            expected_max = max(int(single_capacity * NO_DATA_FILL_ESTIMATE), 1)
        expected_max = max(expected_max, attendance_today, 1)

        real_offsets = []
        for et_str in all_entries:
            try:
                et = datetime.strptime(et_str, '%Y-%m-%d %H:%M:%S')
                offset = (et - event_start_dt).total_seconds() / 3600
                if -0.5 <= offset <= actual_hours + 0.5:
                    real_offsets.append(max(0.0, offset))
            except ValueError:
                pass

        is_whole_day_past = event_end_dt < now - timedelta(minutes=15)
        slots, model_confidence = _slots_for_day(
            event_start_dt, actual_hours, single_capacity, expected_max,
            real_offsets, profile, now, step, is_whole_day_past
        )
        total_hours = actual_hours

    # ---------------------------------------------------------------
    #  RECOMMENDATION
    # ---------------------------------------------------------------
    recommended = _pick_recommendation(slots)
    reason = _build_reason(recommended)

    return {
        'event_name':       ev['name'],
        'total_hours':      round(total_hours, 1),
        'hourly':           slots,
        'recommended':      recommended,
        'reason':           reason,
        'model_confidence': model_confidence,
    }

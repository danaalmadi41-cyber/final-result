import sqlite3
import math
from datetime import datetime, timedelta
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import Ridge

DB_PATH = 'crowd_analysis.db'

# Category-based arrival profiles:
#   peak_pct  – fraction of event duration when peak crowd occurs (0=start, 1=end)
#   sigma_pct – spread of arrivals as fraction of event duration
#   tail_start – fraction of event when people begin leaving
CATEGORY_PROFILES = {
    'music':         {'peak_pct': 0.12, 'sigma_pct': 0.18, 'tail_start': 0.85},
    'sports':        {'peak_pct': 0.10, 'sigma_pct': 0.22, 'tail_start': 0.80},
    'entertainment': {'peak_pct': 0.20, 'sigma_pct': 0.28, 'tail_start': 0.82},
    'technology':    {'peak_pct': 0.38, 'sigma_pct': 0.32, 'tail_start': 0.88},
    'conference':    {'peak_pct': 0.38, 'sigma_pct': 0.32, 'tail_start': 0.88},
    'default':       {'peak_pct': 0.22, 'sigma_pct': 0.28, 'tail_start': 0.82},
}


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _parse_dt(date_str, time_str):
    if not date_str or not time_str:
        return None
    try:
        return datetime.strptime(f'{date_str} {time_str}', '%Y-%m-%d %H:%M')
    except ValueError:
        return None


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
    """Cumulative Gaussian: fraction of crowd that has arrived by time t."""
    if sigma <= 0:
        return 1.0 if t >= mu else 0.0
    return 0.5 * (1.0 + math.erf((t - mu) / (sigma * math.sqrt(2))))


def _departure_fraction(t, tail_start, total):
    """Quadratic ramp-up of departures after tail_start."""
    if total <= 0 or t <= tail_start * total:
        return 0.0
    x = (t - tail_start * total) / max((1.0 - tail_start) * total, 0.001)
    return min(1.0, x * x)


def _synthetic_training_data(profile, total_hours, n_points=40):
    """
    Generate (t, crowd_fraction) pairs using the category profile.
    Used as prior training data when real entries are scarce.
    """
    ts = np.linspace(0, total_hours, n_points)
    mu = profile['peak_pct'] * total_hours
    sigma = profile['sigma_pct'] * total_hours
    tail = profile['tail_start']
    ys = []
    for t in ts:
        arrived = _gaussian_cdf(t, mu, sigma)
        dep = _departure_fraction(t, tail, total_hours)
        crowd = max(0.0, arrived * (1.0 - dep))
        ys.append(crowd)
    return ts, np.array(ys)


def _fit_model(t_train, y_train):
    """Fit a degree-3 polynomial Ridge regression on normalised time."""
    model = Pipeline([
        ('poly', PolynomialFeatures(degree=3, include_bias=False)),
        ('reg',  Ridge(alpha=1.0)),
    ])
    model.fit(t_train.reshape(-1, 1), y_train)
    return model


def predict_best_visit_time(event_id):
    """
    Main entry point.  Returns a dict with:
      - hourly: list of {hour_offset, time_label, date_label, predicted_pct,
                         crowd_label, crowd_color, is_past, is_now}
      - recommended: the single best slot dict (or None)
      - reason: human-readable explanation
      - model_confidence: 'data-driven' | 'category-prior' | 'low'
      - event_name, total_hours
    Returns None if event not found.
    """
    conn = _get_conn()
    cur = conn.cursor()

    cur.execute('SELECT * FROM events WHERE id = ?', (event_id,))
    ev = cur.fetchone()
    if not ev:
        conn.close()
        return None

    cur.execute(
        'SELECT entry_time FROM attendance WHERE event_id = ?',
        (event_id,)
    )
    raw_entries = [r['entry_time'] for r in cur.fetchall()]
    conn.close()

    start_dt = _parse_dt(ev['start_date'], ev['start_time'])
    end_date  = ev['end_date'] or ev['start_date']
    end_dt    = _parse_dt(end_date, ev['end_time'])

    if not start_dt or not end_dt:
        return None

    if end_dt <= start_dt:
        end_dt += timedelta(days=1)

    total_hours = (end_dt - start_dt).total_seconds() / 3600
    if total_hours < 0.5:
        total_hours = 0.5

    category = str(ev['category'] or 'default').lower()
    profile   = CATEGORY_PROFILES.get(category, CATEGORY_PROFILES['default'])

    capacity       = max(int(ev['capacity'] or 1), 1)
    tickets_sold   = int(ev['tickets_sold'] or 0)
    attendance_now = int(ev['attendance_count'] or 0)
    expected_max   = max(tickets_sold, attendance_now) or capacity

    # --- parse actual entry times into hour offsets ---
    real_offsets = []
    for et_str in raw_entries:
        try:
            et = datetime.strptime(et_str, '%Y-%m-%d %H:%M:%S')
            offset = (et - start_dt).total_seconds() / 3600
            if 0 <= offset <= total_hours + 0.5:
                real_offsets.append(offset)
        except ValueError:
            pass

    # --- build training data ---
    t_synth, y_synth = _synthetic_training_data(profile, total_hours, n_points=60)

    model_confidence = 'category-prior'
    if len(real_offsets) >= 3:
        # Calibrate: shift synthetic peak to match observed mean
        obs_mean  = float(np.mean(real_offsets))
        obs_sigma = float(np.std(real_offsets)) if len(real_offsets) > 1 else profile['sigma_pct'] * total_hours
        obs_sigma = max(obs_sigma, 0.1)

        cal_peak_pct  = min(max(obs_mean / total_hours, 0.05), 0.95)
        cal_sigma_pct = min(max(obs_sigma / total_hours, 0.05), 0.50)
        cal_profile   = dict(profile, peak_pct=cal_peak_pct, sigma_pct=cal_sigma_pct)

        t_synth, y_synth = _synthetic_training_data(cal_profile, total_hours, n_points=60)

        # Add real observations (each real entry = +1/expected_max crowd fraction at that time)
        real_arr = np.array(real_offsets)
        real_y   = np.ones(len(real_arr)) * (attendance_now / expected_max)
        t_train  = np.concatenate([t_synth, real_arr])
        y_train  = np.concatenate([y_synth, real_y])
        model_confidence = 'data-driven'
    else:
        t_train = t_synth
        y_train = y_synth
        if len(real_offsets) > 0:
            model_confidence = 'low'

    model = _fit_model(t_train, y_train)

    # --- generate hourly predictions ---
    now = datetime.now()
    step = 0.5 if total_hours <= 6 else 1.0

    # For multi-day events, track daily operating hours to skip overnight gaps
    start_tod = start_dt.hour * 3600 + start_dt.minute * 60  # seconds since midnight
    end_tod   = end_dt.hour * 3600 + end_dt.minute * 60
    multi_day = total_hours > 24
    overnight_event = start_tod > end_tod  # operating hours span midnight (e.g. 22:00–04:00)

    slots = []
    t = 0.0
    while t <= total_hours + step * 0.5:
        raw_frac = float(model.predict([[t]])[0])
        crowd_frac = min(max(raw_frac, 0.0), 1.0)
        crowd_frac *= expected_max / capacity  # scale to fill-rate
        predicted_pct = int(round(min(100.0, crowd_frac * 100)))

        slot_dt = start_dt + timedelta(hours=t)

        # Skip slots outside daily operating hours for multi-day events.
        # Only filter when start_tod != end_tod (i.e. event has defined off-hours).
        # If they're equal the event runs continuously — show all hourly slots.
        if multi_day and start_tod != end_tod:
            slot_tod = slot_dt.hour * 3600 + slot_dt.minute * 60
            if overnight_event:
                in_hours = slot_tod >= start_tod or slot_tod <= end_tod
            else:
                in_hours = start_tod <= slot_tod <= end_tod
            if not in_hours:
                t += step
                continue

        is_past = slot_dt < now - timedelta(minutes=15)
        is_now  = abs((slot_dt - now).total_seconds()) < (step * 3600 * 0.6)
        label   = _crowd_label(predicted_pct)

        _h = slot_dt.hour % 12 or 12
        _time_label = f"{_h}:{slot_dt.strftime('%M')} {'AM' if slot_dt.hour < 12 else 'PM'}"

        slots.append({
            'hour_offset':   round(t, 1),
            'time_label':    _time_label,
            'date_label':    slot_dt.strftime('%a %d %b'),
            'predicted_pct': predicted_pct,
            'crowd_label':   label,
            'crowd_color':   _crowd_color(label),
            'is_past':       is_past,
            'is_now':        is_now,
        })
        t += step

    # --- pick recommended slot ---
    future_slots = [s for s in slots if not s['is_past']]

    # Strategy: prefer the earliest "active but comfortable" window
    # Active means crowd > 15%, comfortable means crowd < 55%
    ideal = [s for s in future_slots if 15 <= s['predicted_pct'] <= 54]
    if ideal:
        recommended = min(ideal, key=lambda s: s['predicted_pct'])
    elif future_slots:
        # Fall back: near-peak (best atmosphere for sparse events)
        recommended = max(future_slots, key=lambda s: s['predicted_pct'])
    else:
        # Event is entirely past
        ideal_past = [s for s in slots if 15 <= s['predicted_pct'] <= 54]
        recommended = min(ideal_past, key=lambda s: s['predicted_pct']) if ideal_past else (slots[0] if slots else None)

    # --- build reason string ---
    reason = ''
    if recommended:
        pct = recommended['predicted_pct']
        t_label = recommended['time_label']
        if pct < 25:
            reason = f"Crowd expected at only {pct}% capacity — quiet and relaxed."
        elif pct < 55:
            reason = f"Crowd expected at {pct}% capacity — good atmosphere without heavy crowding."
        elif pct < 80:
            reason = f"This is the least busy upcoming slot at {pct}% — arrive early if possible."
        else:
            reason = f"The event is expected to be busy ({pct}%). Plan accordingly."

    return {
        'event_name':        ev['name'],
        'total_hours':       round(total_hours, 1),
        'hourly':            slots,
        'recommended':       recommended,
        'reason':            reason,
        'model_confidence':  model_confidence,
    }

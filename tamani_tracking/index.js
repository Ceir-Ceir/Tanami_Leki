const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

/* CORS: add headers you might use later */
app.use(cors({
  origin: ['https://www.lekielectric.com', 'https://lekielectric.com'],
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey']
}));

app.use(express.json());

/* Supabase (service role for server-side writes) */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* Klaviyo */
const KLAVIYO_PRIVATE_API_KEY = process.env.KLAVIYO_PRIVATE_API_KEY;
const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2023-10-15';
const STAGE_TAGS = {
  VISITOR: 'LEKI_STAGE_VISITOR',
  MQL: 'LEKI_STAGE_MQL',
  SQL: 'LEKI_STAGE_SQL',
  HVP: 'LEKI_STAGE_HVP'
};
const klaviyoTagCache = new Map();

if (!KLAVIYO_PRIVATE_API_KEY) {
  console.warn('[Warn] KLAVIYO_PRIVATE_API_KEY is not set; Klaviyo sync disabled.');
}

/* Utils */
const nowIso = () => new Date().toISOString();
const compactObject = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, value]) => value !== undefined && value !== null)
);

/* ---------- Klaviyo Helpers ---------- */
const klaviyoHeaders = () => ({
  accept: 'application/json',
  'content-type': 'application/json',
  revision: KLAVIYO_REVISION,
  authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`
});

async function klaviyoRequest(path, options = {}) {
  if (!KLAVIYO_PRIVATE_API_KEY) return null;
  const response = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    ...options,
    headers: { ...klaviyoHeaders(), ...(options.headers || {}) }
  });

  if (response.status === 204) return null;

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Klaviyo ${response.status}: ${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getKlaviyoProfileByEmail(email) {
  const filter = encodeURIComponent(`equals(email,"${email}")`);
  const result = await klaviyoRequest(`/profiles/?filter=${filter}`, { method: 'GET' });
  return result?.data?.[0] ?? null;
}

async function ensureKlaviyoTagId(tagName) {
  if (!tagName) return null;
  if (klaviyoTagCache.has(tagName)) return klaviyoTagCache.get(tagName);

  const filter = encodeURIComponent(`equals(name,"${tagName}")`);
  const existing = await klaviyoRequest(`/tags/?filter=${filter}`, { method: 'GET' });
  const existingId = existing?.data?.[0]?.id;
  if (existingId) {
    klaviyoTagCache.set(tagName, existingId);
    return existingId;
  }

  const created = await klaviyoRequest('/tags/', {
    method: 'POST',
    body: JSON.stringify({ data: { type: 'tag', attributes: { name: tagName } } })
  });
  const createdId = created?.data?.id ?? null;
  if (createdId) klaviyoTagCache.set(tagName, createdId);
  return createdId;
}

async function applyKlaviyoStageTag(profileId, stage, previousStage) {
  const tagName = STAGE_TAGS[stage];
  if (!profileId || !tagName) return;

  const tagId = await ensureKlaviyoTagId(tagName);
  if (!tagId) return;

  await klaviyoRequest(`/tags/${tagId}/relationships/profiles/`, {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'profile', id: profileId }] })
  });

  if (previousStage && previousStage !== stage) {
    const oldTagName = STAGE_TAGS[previousStage];
    if (!oldTagName) return;
    const oldTagId = await ensureKlaviyoTagId(oldTagName);
    if (!oldTagId) return;
    try {
      await klaviyoRequest(`/tags/${oldTagId}/relationships/profiles/`, {
        method: 'DELETE',
        body: JSON.stringify({ data: [{ type: 'profile', id: profileId }] })
      });
    } catch (err) {
      console.warn('Klaviyo tag removal failed:', err.message);
    }
  }
}

async function upsertKlaviyoProfile({
  email,
  anonymous_id,
  lead_score,
  stage,
  utm_source,
  utm_medium,
  utm_campaign,
  referrer,
  first_seen,
  last_seen,
  duration_ms
}) {
  if (!email || !KLAVIYO_PRIVATE_API_KEY) return null;

  const properties = compactObject({
    leki_stage: stage,
    leki_lead_score: lead_score,
    leki_anonymous_id: anonymous_id,
    leki_utm_source: utm_source,
    leki_utm_medium: utm_medium,
    leki_utm_campaign: utm_campaign,
    leki_referrer: referrer,
    leki_last_seen: last_seen || nowIso(),
    leki_first_seen: first_seen,
    leki_duration_ms: duration_ms
  });

  const attributes = { email, properties };
  const existing = await getKlaviyoProfileByEmail(email);

  if (existing?.id) {
    await klaviyoRequest(`/profiles/${existing.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'profile', id: existing.id, attributes } })
    });
    return existing.id;
  }

  const created = await klaviyoRequest('/profiles/', {
    method: 'POST',
    body: JSON.stringify({ data: { type: 'profile', attributes } })
  });
  return created?.data?.id ?? null;
}

async function sendKlaviyoHvpEvent({ profileId, properties }) {
  if (!profileId || !KLAVIYO_PRIVATE_API_KEY) return;

  await klaviyoRequest('/events/', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          profile: { data: { type: 'profile', id: profileId } },
          metric: { data: { type: 'metric', attributes: { name: 'leki_hvp' } } },
          properties: properties || {},
          time: nowIso()
        }
      }
    })
  });
}

/* Health */
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Leki Scoring API is Live' });
});

/* ---------- Frequency Cap Helper ---------- */
async function checkFrequencyCap(anonymous_id, event_type) {
  const dailyLimits = [
    'view_calculator',
    'view_contact',
    'view_far_page',
    'click_15_day_ride'
  ];
  if (!dailyLimits.includes(event_type)) return true;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const { data: existingEvents, error } = await supabase
    .from('events')
    .select('created_at')
    .eq('anonymous_id', anonymous_id)
    .eq('event_type', event_type)
    .gte('created_at', today);

  if (error) {
    console.error('Freq cap query error:', error);
    return true; // fail-open
  }
  return !(existingEvents && existingEvents.length >= 1);
}

/* ---------- Sessions: Upsert (attribution) ---------- */
app.post('/sessions/upsert', async (req, res) => {
  try {
    const {
      session_id,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      email
    } = req.body;

    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const { error } = await supabase
      .from('sessions')
      .upsert({
        session_id,
        last_seen: nowIso(),
        referrer: referrer ?? null,
        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        utm_term: utm_term ?? null,
        utm_content: utm_content ?? null,
        email: email ?? null
      }, { onConflict: 'session_id' });

    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    console.error('sessions/upsert error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------- Sessions: Ping (heartbeat for duration) ---------- */
app.post('/sessions/ping', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const { data: s, error: selErr } = await supabase
      .from('sessions')
      .select('first_seen')
      .eq('session_id', session_id)
      .single();

    if (selErr && selErr.code !== 'PGRST116') throw selErr; // ignore "not found"

    const now = new Date();
    const first = s?.first_seen ? new Date(s.first_seen) : now;
    const duration_ms = Math.max(0, now - first);

    const { error: upErr } = await supabase
      .from('sessions')
      .upsert({
        session_id,
        first_seen: s?.first_seen ?? nowIso(),
        last_seen: nowIso(),
        duration_ms
      }, { onConflict: 'session_id' });

    if (upErr) throw upErr;

    res.json({ ok: true, duration_ms });
  } catch (e) {
    console.error('sessions/ping error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------- Main Events Endpoint ---------- */
app.post('/event', async (req, res) => {
  try {
    const { anonymous_id, email, event_type, points, metadata } = req.body;
    if (!anonymous_id) return res.status(400).json({ error: 'Missing anonymous_id' });

    // 1) Frequency check
    const isAllowed = await checkFrequencyCap(anonymous_id, event_type);
    if (!isAllowed) {
      return res.json({ success: true, message: 'Points capped for this action today', skipped: true });
    }

    // 2) Find or create lead
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('anonymous_id', anonymous_id)
      .maybeSingle();

    if (!lead) {
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          anonymous_id,
          email: email || null,
          lead_score: 0,
          stage: 'VISITOR'
        })
        .select()
        .single();
      if (createError) throw createError;
      lead = newLead;
    }

    // 3) Insert event (flatten key metadata fields for analytics)
    const flat = {
      page_url: metadata?.page_url || null,
      page_path: metadata?.page_path || null,
      referrer: metadata?.referrer || null,
      utm_source: metadata?.utm_source || null,
      utm_medium: metadata?.utm_medium || null,
      utm_campaign: metadata?.utm_campaign || null,
      utm_term: metadata?.utm_term || null,
      utm_content: metadata?.utm_content || null
    };

    const { error: eventError } = await supabase.from('events').insert({
      anonymous_id,
      email: email || null,
      event_type,
      points,
      ...flat,
      metadata: metadata || {}
    });
    if (eventError) throw eventError;

    // 3.5) ALSO upsert attribution to sessions so source is retained
    await supabase
      .from('sessions')
      .upsert({
        session_id: anonymous_id,               // using same id as session_id
        last_seen: nowIso(),
        ...flat,
        email: email || null
      }, { onConflict: 'session_id' });

    // 4) Score calc
    const newScore = (lead.lead_score || 0) + (points || 0);

    // 5) Stage
    let newStage = lead.stage;
    if (newScore >= 150) newStage = 'HVP';
    else if (newScore >= 100) newStage = 'SQL';
    else if (newScore >= 50) newStage = 'MQL';

    // 6) Identity resolution
    let emailToUpdate = lead.email;
    if (email && email !== lead.email) emailToUpdate = email;
    const stageChanged = newStage !== lead.stage;
    const emailJustAdded = !lead.email && emailToUpdate;
    const shouldSyncKlaviyo = Boolean(emailToUpdate) && (
  stageChanged || emailJustAdded || event_type === 'identify'
);


    // 7) Update lead if changed
    if (newScore !== lead.lead_score || newStage !== lead.stage || emailToUpdate !== lead.email) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          lead_score: newScore,
          stage: newStage,
          email: emailToUpdate,
          last_seen: nowIso()
        })
        .eq('id', lead.id);
      if (updateError) throw updateError;
    }

    // 8) Klaviyo sync (non-blocking for /event)
    if (shouldSyncKlaviyo) {
      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('first_seen, last_seen, duration_ms, utm_source, utm_medium, utm_campaign, referrer')
          .eq('session_id', anonymous_id)
          .maybeSingle();

        if (sessionError && sessionError.code !== 'PGRST116') {
          console.warn('Klaviyo session lookup error:', sessionError);
        }

        const profileId = await upsertKlaviyoProfile({
          email: emailToUpdate,
          anonymous_id,
          lead_score: newScore,
          stage: newStage,
          utm_source: flat.utm_source ?? sessionData?.utm_source ?? null,
          utm_medium: flat.utm_medium ?? sessionData?.utm_medium ?? null,
          utm_campaign: flat.utm_campaign ?? sessionData?.utm_campaign ?? null,
          referrer: flat.referrer ?? sessionData?.referrer ?? null,
          first_seen: sessionData?.first_seen ?? null,
          last_seen: sessionData?.last_seen ?? nowIso(),
          duration_ms: sessionData?.duration_ms ?? null
        });

        if (profileId && stageChanged && newStage === 'HVP') {
          await sendKlaviyoHvpEvent({
            profileId,
            properties: compactObject({
              score: newScore,
              page_url: flat.page_url,
              page_path: flat.page_path,
              utm_source: flat.utm_source,
              utm_medium: flat.utm_medium,
              utm_campaign: flat.utm_campaign,
              referrer: flat.referrer,
              event_type,
              anonymous_id
            })
          });
        }
      } catch (klaviyoError) {
        console.error('Klaviyo sync error:', klaviyoError);
      }
    }

    console.log(`[Success] User: ${anonymous_id} | Score: ${newScore} | Stage: ${newStage}`);
    res.json({ success: true, newScore, stage: newStage });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LEKI scoring API listening on port ${port}`);
});

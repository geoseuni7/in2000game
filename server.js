'use strict';
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && !jwtSecret) throw new Error('JWT_SECRET 환경변수가 필요합니다.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false });
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, username VARCHAR(20) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS game_states (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    month CHAR(7) NOT NULL DEFAULT '2000-01', cash NUMERIC(24,6) NOT NULL DEFAULT 100000,
    holdings JSONB NOT NULL DEFAULT '{}'::jsonb, history JSONB NOT NULL DEFAULT '[]'::jsonb,
    equity NUMERIC(24,6) NOT NULL DEFAULT 100000, return_pct NUMERIC(16,6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE game_states ADD COLUMN IF NOT EXISTS finished BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query(`CREATE TABLE IF NOT EXISTS game_rooms (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(40) NOT NULL, owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_name VARCHAR(20) NOT NULL, password_hash TEXT, max_players INTEGER NOT NULL DEFAULT 8 CHECK(max_players BETWEEN 2 AND 50),
    status VARCHAR(12) NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS room_members (
    room_id BIGINT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(20) NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(room_id,user_id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS room_members_seen_idx ON room_members(room_id,last_seen)');
  await pool.query(`CREATE TABLE IF NOT EXISTS daytrade_events (
    id BIGSERIAL PRIMARY KEY, status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK(status IN ('active','settled','cancelled')),
    asset_name VARCHAR(80) NOT NULL DEFAULT 'RETRO COIN', start_price NUMERIC(24,8) NOT NULL DEFAULT 1000,
    token_grant NUMERIC(24,8) NOT NULL DEFAULT 10000, starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL, prize_pool NUMERIC(24,6) NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ, created_by VARCHAR(20) NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS daytrade_entries (
    event_id BIGINT NOT NULL REFERENCES daytrade_events(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(20) NOT NULL, start_total_assets NUMERIC(24,6) NOT NULL DEFAULT 0,
    token_cash NUMERIC(24,8) NOT NULL DEFAULT 10000, shares NUMERIC(24,12) NOT NULL DEFAULT 0,
    final_value NUMERIC(24,8), return_pct NUMERIC(16,8), reward_cash NUMERIC(24,6) NOT NULL DEFAULT 0,
    last_action VARCHAR(12) NOT NULL DEFAULT 'cash', joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id,user_id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS daytrade_event_status_idx ON daytrade_events(status,ends_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS game_finishes (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(20) NOT NULL, month CHAR(7) NOT NULL, cash NUMERIC(24,6) NOT NULL,
    equity NUMERIC(24,6) NOT NULL, return_pct NUMERIC(16,6) NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS leaderboard (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(20) NOT NULL, month CHAR(7) NOT NULL, equity NUMERIC(24,6) NOT NULL,
    return_pct NUMERIC(16,6) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_presence (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen)');
}
function tokenFor(user) { return jwt.sign({ sub: String(user.id), username: user.username }, jwtSecret || 'development-only-secret-change-me', { expiresIn: '14d' }); }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { if (!token) throw new Error('missing'); req.user = jwt.verify(token, jwtSecret || 'development-only-secret-change-me'); next(); }
  catch { res.status(401).json({ error: '로그인이 필요하거나 세션이 만료되었습니다.' }); }
}
function validUsername(s) { return typeof s === 'string' && /^[a-zA-Z0-9가-힣_-]{3,20}$/.test(s); }
app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); } catch { res.status(503).json({ ok: false, database: 'unavailable' }); } });
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: '아이디는 한글/영문/숫자/_/- 조합 3~20자여야 합니다.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ error: '비밀번호는 8~72자여야 합니다.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username', [username, hash]);
    const user = result.rows[0];
    await pool.query('INSERT INTO game_states(user_id) VALUES($1)', [user.id]);
    return res.status(201).json({ token: tokenFor(user), user: { id: user.id, username: user.username } });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' }); console.error(e); return res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
  try {
    const r = await pool.query('SELECT id,username,password_hash FROM users WHERE username=$1', [username]);
    if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash))) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    res.json({ token: tokenFor(r.rows[0]), user: { id: r.rows[0].id, username: r.rows[0].username } });
  } catch (e) { console.error(e); res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' }); }
});
app.get('/api/me', auth, async (req, res) => res.json({ user: { id: req.user.sub, username: req.user.username } }));
app.post('/api/presence/heartbeat', auth, async (req,res) => { try { await pool.query('INSERT INTO user_presence(user_id,last_seen) VALUES($1,NOW()) ON CONFLICT(user_id) DO UPDATE SET last_seen=NOW()', [req.user.sub]); res.json({ok:true}); } catch(e) { console.error(e); res.status(500).json({error:'접속 상태 갱신 실패'}); } });
app.get('/api/state', auth, async (req, res) => {
  try { const r = await pool.query('SELECT month,cash,holdings,history,equity,return_pct,finished,updated_at FROM game_states WHERE user_id=$1', [req.user.sub]); res.json({ state: r.rows[0] || null }); }
  catch (e) { console.error(e); res.status(500).json({ error: '저장된 게임을 불러오지 못했습니다.' }); }
});
app.put('/api/state', auth, async (req, res) => {
  const b = req.body || {};
  const month = typeof b.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) && b.month >= '2000-01' && b.month <= '2026-09' ? b.month : null;
  const cash = Number(b.cash), equity = Number(b.equity), returnPct = Number(b.returnPct), finished = b.finished === true;
  if (!month || !Number.isFinite(cash) || cash < 0 || cash > 1e18 || !Number.isFinite(equity) || equity < 0 || equity > 1e18 || !Number.isFinite(returnPct) || Math.abs(returnPct) > 1e8 || !b.holdings || typeof b.holdings !== 'object' || Array.isArray(b.holdings) || !Array.isArray(b.history)) return res.status(400).json({ error: '게임 상태 데이터 형식이 올바르지 않습니다.' });
  if (Object.keys(b.holdings).length > 20000 || b.history.length > 5000) return res.status(413).json({ error: '보유 종목 또는 거래 기록이 너무 많습니다.' });
  try {
    const holdings = JSON.stringify(b.holdings), history = JSON.stringify(b.history.slice(0, 500));
    await pool.query(`INSERT INTO game_states(user_id,month,cash,holdings,history,equity,return_pct,finished,updated_at)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,NOW()) ON CONFLICT(user_id) DO UPDATE SET
      month=EXCLUDED.month,cash=EXCLUDED.cash,holdings=EXCLUDED.holdings,history=EXCLUDED.history,
      equity=EXCLUDED.equity,return_pct=EXCLUDED.return_pct,finished=EXCLUDED.finished,updated_at=NOW()`, [req.user.sub, month, cash, holdings, history, equity, returnPct, finished]);
    await pool.query(`INSERT INTO leaderboard(user_id,username,month,equity,return_pct,updated_at)
      VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,
      month=EXCLUDED.month,equity=EXCLUDED.equity,return_pct=EXCLUDED.return_pct,updated_at=NOW()`, [req.user.sub, req.user.username, month, equity, returnPct]);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ error: '게임 상태 저장에 실패했습니다.' }); }
});
// Room/lobby APIs. Clients heartbeat every 5 seconds; members unseen for 20 seconds are considered disconnected.
async function roomSnapshot(roomId) {
  const roomQ = await pool.query(`SELECT r.id,r.name,r.owner_id,r.owner_name,r.max_players,r.status,r.created_at,(r.password_hash IS NOT NULL) AS has_password,
    (SELECT COUNT(*) FROM room_members m WHERE m.room_id=r.id AND m.last_seen > NOW()-INTERVAL '60 seconds')::int AS player_count
    FROM game_rooms r WHERE r.id=$1 AND r.status <> 'closed'`, [roomId]);
  if (!roomQ.rowCount) return null;
  const room = roomQ.rows[0];
  const membersQ = await pool.query(`SELECT user_id,username,joined_at FROM room_members WHERE room_id=$1 AND last_seen > NOW()-INTERVAL '60 seconds' ORDER BY joined_at ASC`, [roomId]);
  room.members = membersQ.rows.map(m => ({ userId: String(m.user_id), username: m.username, joinedAt: m.joined_at }));
  room.player_count = room.members.length;
  return room;
}
app.get('/api/rooms', auth, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT r.id,r.name,r.owner_name,r.max_players,r.status,(r.password_hash IS NOT NULL) AS has_password,
      (SELECT COUNT(*) FROM room_members m WHERE m.room_id=r.id AND m.last_seen > NOW()-INTERVAL '60 seconds')::int AS player_count
      FROM game_rooms r WHERE r.status='lobby' ORDER BY r.created_at DESC LIMIT 100`);
    res.json({ rooms: r.rows.map(x => ({...x,id:String(x.id),playerCount:x.player_count,hasPassword:x.has_password})) });
  } catch(e) { console.error(e); res.status(500).json({error:'방 목록을 불러오지 못했습니다.'}); }
});
app.post('/api/rooms', auth, async (req,res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = req.body?.password;
  const maxPlayers = Number(req.body?.maxPlayers ?? 8);
  if (name.length < 2 || name.length > 40) return res.status(400).json({error:'방 이름은 2~40자여야 합니다.'});
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 50) return res.status(400).json({error:'정원은 2~50명으로 설정하세요.'});
  if (password !== undefined && password !== '' && (typeof password !== 'string' || password.length < 4 || password.length > 72)) return res.status(400).json({error:'방 비밀번호는 4~72자여야 합니다.'});
  try {
    const hash = password ? await bcrypt.hash(password,10) : null;
    const r = await pool.query('INSERT INTO game_rooms(name,owner_id,owner_name,password_hash,max_players) VALUES($1,$2,$3,$4,$5) RETURNING id', [name,req.user.sub,req.user.username,hash,maxPlayers]);
    await pool.query('INSERT INTO room_members(room_id,user_id,username) VALUES($1,$2,$3)', [r.rows[0].id,req.user.sub,req.user.username]);
    const room = await roomSnapshot(r.rows[0].id);
    res.status(201).json({room});
  } catch(e) { console.error(e); res.status(500).json({error:'방을 생성하지 못했습니다.'}); }
});
app.post('/api/rooms/:id/join', auth, async (req,res) => {
  const roomId = req.params.id;
  if (!/^\d+$/.test(roomId)) return res.status(400).json({error:'방 번호가 올바르지 않습니다.'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query("SELECT * FROM game_rooms WHERE id=$1 AND status='lobby' FOR UPDATE",[roomId]);
    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({error:'방이 없거나 이미 게임이 시작됐습니다.'}); }
    if (r.rows[0].password_hash && !(typeof req.body?.password==='string' && await bcrypt.compare(req.body.password,r.rows[0].password_hash))) { await client.query('ROLLBACK'); return res.status(403).json({error:'방 비밀번호가 틀렸습니다.'}); }
    const count = await client.query("SELECT COUNT(*)::int AS n FROM room_members WHERE room_id=$1 AND last_seen > NOW()-INTERVAL '60 seconds'",[roomId]);
    const already = await client.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2',[roomId,req.user.sub]);
    if (!already.rowCount && count.rows[0].n >= r.rows[0].max_players) { await client.query('ROLLBACK'); return res.status(409).json({error:'방 정원이 가득 찼습니다.'}); }
    await client.query('DELETE FROM room_members WHERE user_id=$1 AND room_id<>$2',[req.user.sub,roomId]);
    await client.query(`INSERT INTO room_members(room_id,user_id,username,last_seen) VALUES($1,$2,$3,NOW())
      ON CONFLICT(room_id,user_id) DO UPDATE SET username=EXCLUDED.username,last_seen=NOW()`,[roomId,req.user.sub,req.user.username]);
    await client.query('COMMIT');
    res.json({room:await roomSnapshot(roomId)});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({error:'방 참가에 실패했습니다.'}); }
  finally { client.release(); }
});
app.post('/api/rooms/:id/heartbeat', auth, async (req,res) => {
  try {
    const r=await pool.query('UPDATE room_members SET last_seen=NOW() WHERE room_id=$1 AND user_id=$2 RETURNING room_id',[req.params.id,req.user.sub]);
    if (!r.rowCount) return res.status(404).json({error:'현재 참가 중인 방이 없습니다.'});
    const room=await roomSnapshot(req.params.id); if (!room) return res.status(404).json({error:'방이 종료되었습니다.'});
    res.json({room});
  } catch(e) { console.error(e); res.status(500).json({error:'방 상태를 확인하지 못했습니다.'}); }
});
app.post('/api/rooms/:id/leave', auth, async (req,res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[req.params.id,req.user.sub]);
    const remaining = await client.query("SELECT user_id,username FROM room_members WHERE room_id=$1 AND last_seen > NOW()-INTERVAL '60 seconds' ORDER BY joined_at ASC",[req.params.id]);
    if (remaining.rowCount === 0) await client.query('DELETE FROM game_rooms WHERE id=$1',[req.params.id]);
    else await client.query('UPDATE game_rooms SET owner_id=$2,owner_name=$3,updated_at=NOW() WHERE id=$1 AND owner_id=$4',[req.params.id,remaining.rows[0].user_id,remaining.rows[0].username,req.user.sub]);
    await client.query('COMMIT');
    res.json({ok:true,room:remaining.rowCount ? await roomSnapshot(req.params.id) : null});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({error:'방 나가기에 실패했습니다.'}); }
  finally { client.release(); }
});
app.post('/api/rooms/:id/start', auth, async (req,res) => {
  try {
    const r = await pool.query("UPDATE game_rooms SET status='playing',updated_at=NOW() WHERE id=$1 AND owner_id=$2 AND status='lobby' RETURNING id", [req.params.id, req.user.sub]);
    if (!r.rowCount) return res.status(403).json({error:'방장만 대기 중인 방의 게임을 시작할 수 있습니다.'});
    res.json({room:await roomSnapshot(req.params.id)});
  } catch(e) { console.error(e); res.status(500).json({error:'게임을 시작하지 못했습니다.'}); }
});
app.post('/api/rooms/:id/destroy', auth, async (req,res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT owner_id FROM game_rooms WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({error:'이미 종료된 방입니다.'}); }
    if (String(r.rows[0].owner_id) !== String(req.user.sub)) { await client.query('ROLLBACK'); return res.status(403).json({error:'방장만 방을 폭파할 수 있습니다.'}); }
    await client.query('DELETE FROM game_rooms WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ok:true});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({error:'방을 종료하지 못했습니다.'}); }
  finally { client.release(); }
});
app.get('/api/rooms/:id', auth, async (req,res) => {
  try { const room=await roomSnapshot(req.params.id); if(!room) return res.status(404).json({error:'방을 찾을 수 없습니다.'}); res.json({room}); }
  catch(e) { console.error(e); res.status(500).json({error:'방 상태를 불러오지 못했습니다.'}); }
});


// Day-trading duel: isolated event tokens, server-priced virtual asset, and cash rewards.
function daytradePrice(event, at = new Date()) {
  const start = new Date(event.starts_at).getTime();
  const elapsed = Math.max(0, Math.floor((at.getTime() - start) / 5000));
  const eventId = Number(event.id);
  let price = Number(event.start_price);
  // Deterministic 5-second price steps: all participants receive the exact same path.
  for (let i = 1; i <= Math.min(elapsed, 10080); i++) {
    let x = (eventId * 9301 + i * 49297 + 233280) % 233280;
    x = (x * 9301 + 49297) % 233280;
    const pct = ((x / 233280) - 0.5) * 0.06; // +/- 3% per 5 seconds
    price = Math.max(1, price * (1 + pct));
  }
  return Number(price.toFixed(6));
}
async function settleDaytrade(eventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const er = await client.query("SELECT * FROM daytrade_events WHERE id=$1 FOR UPDATE", [eventId]);
    if (!er.rowCount || er.rows[0].status !== 'active' || new Date(er.rows[0].ends_at).getTime() > Date.now()) { await client.query('COMMIT'); return; }
    const event = er.rows[0]; const price = daytradePrice(event, new Date(event.ends_at));
    const entries = await client.query('SELECT * FROM daytrade_entries WHERE event_id=$1 FOR UPDATE', [eventId]);
    const values = entries.rows.map(e => ({...e, value: Number(e.token_cash) + Number(e.shares) * price,
      ret: (Number(e.token_cash) + Number(e.shares) * price - Number(event.token_grant)) / Number(event.token_grant) * 100}));
    const best = values.length ? Math.max(...values.map(x => x.ret)) : null;
    const winners = values.filter(x => x.ret === best);
    const prizePool = values.reduce((sum, e) => sum + Number(e.start_total_assets) * 0.5, 0);
    // User's rule: every co-winner independently receives 50% of their own pre-event total assets.
    for (const e of values) {
      const isWinner = e.ret === best && best !== null;
      const reward = isWinner ? Number(e.start_total_assets) * 0.5 : 0;
      await client.query(`UPDATE daytrade_entries SET final_value=$3,return_pct=$4,reward_cash=$5,token_cash=0,shares=0 WHERE event_id=$1 AND user_id=$2`, [eventId,e.user_id,e.value,e.ret,reward]);
      if (reward > 0) await client.query('UPDATE game_states SET cash=cash+$2,equity=equity+$2,updated_at=NOW() WHERE user_id=$1', [e.user_id,reward]);
      await client.query('UPDATE leaderboard SET equity=equity+$2,updated_at=NOW() WHERE user_id=$1', [e.user_id,reward]);
    }
    await client.query("UPDATE daytrade_events SET status='settled',settled_at=NOW(),prize_pool=$2 WHERE id=$1", [eventId, winners.reduce((sum,w)=>sum+Number(w.start_total_assets)*0.5,0)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
}
async function maybeSettleDaytrade(event) {
  if (event && event.status === 'active' && new Date(event.ends_at).getTime() <= Date.now()) await settleDaytrade(event.id);
}
app.get('/api/daytrade/current', auth, async (req,res) => {
  try {
    let q = await pool.query("SELECT * FROM daytrade_events WHERE status IN ('active','settled') ORDER BY id DESC LIMIT 1");
    if (!q.rowCount) return res.json({event:null});
    let event=q.rows[0]; await maybeSettleDaytrade(event);
    q=await pool.query('SELECT * FROM daytrade_events WHERE id=$1',[event.id]); event=q.rows[0];
    const price=daytradePrice(event, event.status==='settled'?new Date(event.ends_at):new Date());
    const er=await pool.query('SELECT * FROM daytrade_entries WHERE event_id=$1 AND user_id=$2',[event.id,req.user.sub]);
    const board=await pool.query(`SELECT username,final_value,return_pct,reward_cash,last_action,token_cash,shares FROM daytrade_entries WHERE event_id=$1 ORDER BY COALESCE(return_pct,((token_cash+shares*$2-$3)/$3*100)) DESC,username ASC LIMIT 50`,[event.id,price,event.token_grant]);
    res.json({event:{id:String(event.id),status:event.status,assetName:event.asset_name,startPrice:Number(event.start_price),tokenGrant:Number(event.token_grant),price,startsAt:event.starts_at,endsAt:event.ends_at,prizePool:Number(event.prize_pool),myEntry:er.rowCount?{tokenCash:Number(er.rows[0].token_cash),shares:Number(er.rows[0].shares),finalValue:er.rows[0].final_value===null?null:Number(er.rows[0].final_value),returnPct:er.rows[0].return_pct===null?null:Number(er.rows[0].return_pct),rewardCash:Number(er.rows[0].reward_cash),lastAction:er.rows[0].last_action}:null,leaderboard:board.rows.map((x,i)=>({rank:i+1,username:x.username,finalValue:x.final_value===null?Number(x.token_cash)+Number(x.shares)*price:Number(x.final_value),returnPct:x.return_pct===null?((Number(x.token_cash)+Number(x.shares)*price-Number(event.token_grant))/Number(event.token_grant))*100:Number(x.return_pct),rewardCash:Number(x.reward_cash),lastAction:x.last_action}))}});
  } catch(e){console.error(e);res.status(500).json({error:'단타 이벤트 상태를 불러오지 못했습니다.'});}
});
app.post('/api/daytrade/admin/start', async (req,res) => {
  const key=process.env.EVENT_ADMIN_KEY;
  if(!key || req.get('x-event-admin-key')!==key) return res.status(403).json({error:'이벤트 관리자 키가 올바르지 않습니다. Render의 EVENT_ADMIN_KEY를 설정하세요.'});
  const durationSeconds = req.body?.durationSeconds !== undefined ? Number(req.body.durationSeconds) : (req.body?.durationMinutes !== undefined ? Number(req.body.durationMinutes) * 60 : 30), tokenGrant=Number(req.body?.tokenGrant ?? 10000), assetName=typeof req.body?.assetName==='string'?req.body.assetName.slice(0,80):'RETRO COIN';
  if(!Number.isInteger(durationSeconds)||durationSeconds<5||durationSeconds>86400||!Number.isFinite(tokenGrant)||tokenGrant<=0||tokenGrant>1e12) return res.status(400).json({error:'진행 시간은 5~86400초, 토큰은 양수여야 합니다.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const active=await client.query("SELECT id FROM daytrade_events WHERE status='active' FOR UPDATE");
    if(active.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'이미 진행 중인 단타 이벤트가 있습니다.'});}
    const users=await client.query(`SELECT u.id,u.username,COALESCE(g.equity,100000) AS total_assets FROM users u LEFT JOIN game_states g ON g.user_id=u.id ORDER BY u.id`);
    if(!users.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'참가할 계정이 없습니다.'});}
    const starts=new Date(), ends=new Date(starts.getTime()+durationSeconds*1000);
    const created=await client.query(`INSERT INTO daytrade_events(asset_name,start_price,token_grant,starts_at,ends_at,created_by) VALUES($1,1000,$2,$3,$4,'admin') RETURNING *`,[assetName,tokenGrant,starts,ends]);
    const ev=created.rows[0];
    for(const u of users.rows) await client.query('INSERT INTO daytrade_entries(event_id,user_id,username,start_total_assets,token_cash) VALUES($1,$2,$3,$4,$5)',[ev.id,u.id,u.username,Math.max(0,Number(u.total_assets)),tokenGrant]);
    await client.query('COMMIT'); res.status(201).json({ok:true,eventId:String(ev.id),participants:users.rowCount,startsAt:starts,endsAt:ends,durationSeconds,tokenGrant});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({error:'단타 이벤트 시작에 실패했습니다.'});}finally{client.release();}
});
app.post('/api/daytrade/order', auth, async (req,res) => {
  const action=req.body?.action; if(!['buy','sell'].includes(action)) return res.status(400).json({error:'풀매수 또는 풀매도만 가능합니다.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const er=await client.query("SELECT * FROM daytrade_events WHERE status='active' ORDER BY id DESC LIMIT 1 FOR UPDATE");
    if(!er.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'진행 중인 단타 이벤트가 없습니다.'});}
    const event=er.rows[0]; if(new Date(event.ends_at).getTime()<=Date.now()){await client.query('ROLLBACK');await settleDaytrade(event.id);return res.status(409).json({error:'이벤트가 종료되어 주문할 수 없습니다.'});}
    const entryQ=await client.query('SELECT * FROM daytrade_entries WHERE event_id=$1 AND user_id=$2 FOR UPDATE',[event.id,req.user.sub]);
    if(!entryQ.rowCount){await client.query('ROLLBACK');return res.status(403).json({error:'이번 이벤트 참가자로 등록되지 않았습니다.'});}
    const e=entryQ.rows[0], price=daytradePrice(event,new Date()); let cash=Number(e.token_cash),shares=Number(e.shares),last=e.last_action;
    if(action==='buy') {if(cash<=0){await client.query('ROLLBACK');return res.status(409).json({error:'이미 풀매수 상태입니다.'});} shares=cash/price;cash=0;last='buy';}
    else {if(shares<=0){await client.query('ROLLBACK');return res.status(409).json({error:'매도할 보유 종목이 없습니다.'});}cash=shares*price;shares=0;last='sell';}
    await client.query('UPDATE daytrade_entries SET token_cash=$3,shares=$4,last_action=$5 WHERE event_id=$1 AND user_id=$2',[event.id,req.user.sub,cash,shares,last]);
    await client.query('COMMIT');res.json({ok:true,action,price,tokenCash:cash,shares,positionValue:cash+shares*price});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({error:'주문 처리에 실패했습니다.'});}finally{client.release();}
});
// Final-turn settlement: the browser submits the already-liquidated final portfolio in this MVP.
// Official anti-cheat scoring should move the complete price/portfolio calculation to the server.
app.post('/api/game/finish', auth, async (req, res) => {
  const { month, cash, equity, returnPct } = req.body || {};
  if (month !== '2026-09' || ![cash,equity,returnPct].every(v => Number.isFinite(Number(v))) || Number(cash)<0 || Number(equity)<0 || Math.abs(Number(returnPct))>1e8) {
    return res.status(400).json({error:'최종 월(2026-09)과 유효한 정산값이 필요합니다.'});
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = await client.query('SELECT user_id FROM game_states WHERE user_id=$1 FOR UPDATE',[req.user.sub]);
    if (!state.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({error:'저장된 게임 상태가 없습니다.'}); }
    const already = await client.query('SELECT user_id FROM game_finishes WHERE user_id=$1',[req.user.sub]);
    if (already.rowCount) { await client.query('COMMIT'); return res.json({ok:true,alreadyFinished:true}); }
    await client.query(`INSERT INTO game_finishes(user_id,username,month,cash,equity,return_pct,finished_at)
      VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,month=EXCLUDED.month,cash=EXCLUDED.cash,equity=EXCLUDED.equity,return_pct=EXCLUDED.return_pct,finished_at=NOW()`,
      [req.user.sub,req.user.username,month,Number(cash),Number(equity),Number(returnPct)]);
    await client.query('UPDATE game_states SET finished=TRUE WHERE user_id=$1',[req.user.sub]);
    await client.query('COMMIT'); res.json({ok:true});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({error:'최종 정산 저장에 실패했습니다.'}); }
  finally { client.release(); }
});
app.get('/api/game/final-leaderboard', async (_req,res) => {
  try {
    const r = await pool.query('SELECT username,month,cash,equity,return_pct,finished_at FROM game_finishes ORDER BY return_pct DESC,equity DESC,finished_at ASC,username ASC LIMIT 500');
    res.json({leaderboard:r.rows.map((x,i)=>({rank:i+1,username:x.username,month:x.month,cash:Number(x.cash),equity:Number(x.equity),returnPct:Number(x.return_pct),finishedAt:x.finished_at}))});
  } catch(e) { console.error(e); res.status(500).json({error:'최종 순위표를 불러오지 못했습니다.'}); }
});
app.delete('/api/game/finish', auth, async (req,res) => {
  try { await pool.query('DELETE FROM game_finishes WHERE user_id=$1',[req.user.sub]); await pool.query('UPDATE game_states SET finished=FALSE WHERE user_id=$1',[req.user.sub]); res.json({ok:true}); }
  catch(e) { console.error(e); res.status(500).json({error:'최종 기록 초기화에 실패했습니다.'}); }
});
app.get('/api/leaderboard', async (req, res) => {
  const month = typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month) ? req.query.month : null;
  try {
    const args = []; let where = '';
    if (month) { args.push(month); where = 'WHERE month=$1'; }
    const r = await pool.query(`SELECT username,month,equity,return_pct,updated_at FROM leaderboard ${where} ORDER BY return_pct DESC,equity DESC,updated_at ASC LIMIT 100`, args);
    res.json({ leaderboard: r.rows.map((x,i)=>({ rank:i+1, username:x.username, month:x.month, equity:Number(x.equity), returnPct:Number(x.return_pct), updatedAt:x.updated_at })) });
  } catch (e) { console.error(e); res.status(500).json({ error: '리더보드를 불러오지 못했습니다.' }); }
});
// After 60 seconds without a global heartbeat, purge competitive records and room membership.
// User account and saved portfolio are retained; only leaderboard/results/daytrade participation are removed.
async function cleanupOfflineUsers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stale = await client.query("SELECT user_id FROM user_presence WHERE last_seen <= NOW()-INTERVAL '60 seconds' ORDER BY last_seen LIMIT 200 FOR UPDATE SKIP LOCKED");
    for (const row of stale.rows) {
      const uid = row.user_id;
      const stillStale = await client.query("SELECT 1 FROM user_presence WHERE user_id=$1 AND last_seen <= NOW()-INTERVAL '60 seconds'", [uid]);
      if (!stillStale.rowCount) continue;
      await client.query('DELETE FROM leaderboard WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM game_finishes WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM daytrade_entries WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM room_members WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM user_presence WHERE user_id=$1', [uid]);
    }
    await client.query("DELETE FROM room_members WHERE last_seen <= NOW()-INTERVAL '60 seconds'");
    await client.query(`DELETE FROM game_rooms r WHERE NOT EXISTS (SELECT 1 FROM room_members m WHERE m.room_id=r.id AND m.last_seen > NOW()-INTERVAL '60 seconds')`);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); console.error('Offline user cleanup failed',e); }
  finally { client.release(); }
}

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
initDb().then(() => {
  app.listen(port, () => console.log(`Retro Stock Game listening on ${port}`));
  // Server-side settlement sweep: expiry is processed even if no player opens the event page.
  setInterval(async () => {
    try { const expired = await pool.query("SELECT id FROM daytrade_events WHERE status='active' AND ends_at<=NOW() ORDER BY id LIMIT 20");
      for (const row of expired.rows) await settleDaytrade(row.id);
    } catch (e) { console.error('Daytrade settlement sweep failed', e); }
  }, 1000).unref();
  setInterval(() => cleanupOfflineUsers().catch(e => console.error('Presence cleanup failed',e)), 5000).unref();
}).catch(e => { console.error('DB initialization failed', e); process.exit(1); });

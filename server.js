'use strict';
/* InGage WorkTrack – backend server (no external dependencies, Node 18+) */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const seed = require('./seed');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- secrets, passwords, sessions ---------- */
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  const f = path.join(DATA_DIR, 'secret.key');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch (e) {
    SECRET = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}
const nid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
function hashPw(pw) { const s = crypto.randomBytes(16); return 's1$' + s.toString('hex') + '$' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, st) {
  try { const p = st.split('$'); const h = crypto.scryptSync(pw, Buffer.from(p[1], 'hex'), 64); return crypto.timingSafeEqual(h, Buffer.from(p[2], 'hex')); } catch (e) { return false; }
}
function sign(o) { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); }
function verify(t) {
  if (!t) return null; const p = t.split('.'); if (p.length !== 2) return null;
  const e = crypto.createHmac('sha256', SECRET).update(p[0]).digest('base64url');
  if (p[1].length !== e.length || !crypto.timingSafeEqual(Buffer.from(p[1]), Buffer.from(e))) return null;
  try { const o = JSON.parse(Buffer.from(p[0], 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (x) { return null; }
}

/* ---------- date helpers ---------- */
const pad = n => ('0' + n).slice(-2);
const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = (n) => { const d = new Date(); d.setDate(d.getDate() + (n || 0)); return ds(d); };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const tmin = t => +t.slice(0, 2) * 60 + +t.slice(3);
const dow = s => new Date(s + 'T00:00:00').getDay();
function wdays(f, t) { let d = new Date(f + 'T00:00:00'), e = new Date(t + 'T00:00:00'), n = 0; while (d <= e) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n; } /* Mon–Sat */

/* ---------- database ---------- */
let db;
function writeDb() { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); }
let ptimer = null;
function persist() { clearTimeout(ptimer); ptimer = setTimeout(writeDb, 120); }
function initDb() {
  if (fs.existsSync(DB_FILE)) { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return; }
  const S = seed(process.env.SEED_DEMO === '1'), users = {}, ap = process.env.ADMIN_PASSWORD;
  S.E.forEach(e => { const own = e.role === 'Admin' && ap; users[e.id] = { h: hashPw(own ? ap : e.pw), def: !own, sv: 1 }; delete e.pw; });
  const admin = S.E.find(e => e.role === 'Admin'), t = Date.now();
  S.P = []; S.N = [];
  S.C = [{ id: 'g_all', t: 'group', n: 'InGage Team', m: S.E.map(e => e.id), by: admin.id, locked: 1, msgs: [{ id: nid(), by: admin.id, tx: 'Welcome to the InGage team chat! Use this group for company-wide updates. You can also message anyone privately or create your own groups.', at: t }], rd: {}, lat: t, at: t }];
  db = { v: 1, users, state: S };
  writeDb();
  console.log('Created a new database with the starting accounts (see README).');
}
function backup() {
  try {
    const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'db-' + today() + '.json');
    if (fs.existsSync(DB_FILE) && !fs.existsSync(f)) { writeDb(); fs.copyFileSync(DB_FILE, f); }
    fs.readdirSync(dir).filter(x => /^db-.*\.json$/.test(x)).sort().slice(0, -14).forEach(x => fs.unlinkSync(path.join(dir, x)));
  } catch (e) { console.error('backup failed', e.message); }
}

/* ---------- helpers ---------- */
const byId = (arr, id) => arr.find(x => String(x.id) === String(id));
const str = (x, n) => String(x == null ? '' : x).slice(0, n);
const num = x => (typeof x === 'number' && isFinite(x)) ? x : (+x || 0);
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function subsOf(S, id) {
  const out = [], q = [+id];
  while (q.length) { const x = q.shift(); S.E.forEach(e => { if (e.mgr == x && e.role !== 'Admin' && out.indexOf(e.id) < 0) { out.push(e.id); q.push(e.id); } }); }
  return out;
}
const ROLES = ['Manager', 'Program Manager', 'Team Lead', 'Employee'];
const STATES = ['Pending', 'Accepted', 'In Progress', 'Completed', 'Rejected'];

/* ---------- what each person is allowed to see ---------- */
function view(uid) {
  const S = db.state, me = byId(S.E, uid), adm = me.role === 'Admin', appr = adm || me.role === 'Manager', boss = me.role !== 'Employee';
  let A = S.A;
  if (!boss) { A = {}; Object.keys(S.A).forEach(d => { if (S.A[d][uid]) A[d] = { [uid]: S.A[d][uid] }; }); }
  return {
    E: S.E, T: S.T, A, PJ: S.PJ, pol: S.pol,
    L: appr ? S.L : S.L.map(l => (l.emp == uid || l.alt == uid) ? l : Object.assign({}, l, { reason: '', note: '' })),
    P: appr ? S.P : S.P.filter(p => p.emp == uid),
    N: S.N.filter(n => n.to == uid),
    C: S.C.filter(c => c.m.indexOf(uid) > -1)
  };
}

/* ---------- applying a patch from a client, with permission checks ---------- */
function applyPatch(uid, patch) {
  const S = db.state, me = byId(S.E, uid), adm = me.role === 'Admin', mgrRole = me.role === 'Manager', boss = me.role !== 'Employee';
  const appr = adm || mgrRole;
  const subs = subsOf(S, uid);
  const canMk = id => adm || subs.indexOf(+id) > -1;
  const msgs = []; let rejected = 0, changed = 0;
  const rej = m => { rejected++; if (m && msgs.indexOf(m) < 0) msgs.push(m); };
  const ok = () => { changed++; };
  const list = (c) => (patch[c] && Array.isArray(patch[c].up)) ? patch[c].up : [];
  const dels = (c) => (patch[c] && Array.isArray(patch[c].del)) ? patch[c].del : [];
  const uname = (u, exceptId) => S.E.some(e => e.u === u && e.id !== exceptId);

  /* ---- people ---- */
  list('E').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.E, r.id), pw = r._pw ? String(r._pw) : '';
    if (!ex) {
      if (!adm) return rej('Only the admin can add people.');
      const u = str(r.u, 40).toLowerCase().replace(/\s+/g, '');
      if (!str(r.name, 80).trim() || !u) return rej('Name and username are required.');
      if (uname(u, 0)) return rej('That username is already taken.');
      if (ROLES.indexOf(r.role) < 0) return rej('Invalid role.');
      if (!byId(S.E, r.mgr)) return rej('Choose who this person reports to.');
      if (pw.length < 6) return rej('Password must be at least 6 characters.');
      let id = +r.id; if (!id || byId(S.E, id)) id = Date.now();
      const e = { id, name: str(r.name, 80).trim(), dept: str(r.dept, 40), desig: str(r.desig, 60), email: str(r.email, 120), phone: str(r.phone, 30), u, role: r.role, mgr: +r.mgr, work: str(r.work, 160), mode: r.mode === 'Remote' ? 'Remote' : 'Onsite', status: 'Active', joined: today() };
      S.E.push(e); db.users[id] = { h: hashPw(pw), def: true, sv: 1 };
      const g = byId(S.C, 'g_all'); if (g && g.m.indexOf(id) < 0) g.m.push(id);
      return ok();
    }
    const keys = Object.keys(r).filter(k => k !== '_pw' && k !== '_cur' && !same(r[k], ex[k]));
    let allowed;
    if (adm) allowed = ['name', 'dept', 'desig', 'email', 'phone', 'u', 'role', 'mgr', 'work', 'mode', 'status', 'joined'];
    else { allowed = []; if (ex.id === uid) allowed.push('phone'); if (canMk(ex.id) && ex.id !== uid) allowed.push('work', 'mode'); }
    if (keys.some(k => allowed.indexOf(k) < 0)) return rej('You are not allowed to change that.');
    if (adm) {
      if (r.u !== undefined && r.u !== ex.u) { const u = str(r.u, 40).toLowerCase().replace(/\s+/g, ''); if (!u || uname(u, ex.id)) return rej('That username is already taken.'); }
      if (r.role !== undefined && r.role !== ex.role) { if (ex.role === 'Admin' || ROLES.indexOf(r.role) < 0) return rej('Invalid role change.'); }
      if (r.mgr !== undefined && +r.mgr !== ex.mgr && (!byId(S.E, r.mgr) || +r.mgr === ex.id)) return rej('Invalid reporting line.');
      if (ex.id === uid && r.status !== undefined && r.status !== 'Active') return rej('You cannot deactivate yourself.');
      if (r.status !== undefined && ['Active', 'Inactive'].indexOf(r.status) < 0) return rej('Invalid status.');
    }
    if (pw) {
      if (pw.length < 6) return rej('Password must be at least 6 characters.');
      if (ex.id === uid) { if (!r._cur || !checkPw(String(r._cur), db.users[ex.id].h)) return rej('Current password is wrong.'); }
      else if (!adm) return rej('You cannot change that password.');
    }
    keys.forEach(k => {
      let v = r[k];
      if (k === 'u') v = str(v, 40).toLowerCase().replace(/\s+/g, '');
      else if (k === 'mgr') v = +v;
      else if (k === 'mode') v = v === 'Remote' ? 'Remote' : 'Onsite';
      else v = str(v, k === 'work' ? 160 : 120);
      ex[k] = v;
    });
    if (pw) { db.users[ex.id].h = hashPw(pw); db.users[ex.id].def = false; db.users[ex.id].sv++; }
    ok();
  });
  dels('E').forEach(id => {
    const ex = byId(S.E, id);
    if (!ex) return; if (!adm) return rej('Only the admin can delete people.');
    if (ex.role === 'Admin' || ex.id === uid) return rej('That account cannot be deleted.');
    if (S.E.some(e => e.mgr === ex.id)) return rej('Move this person\'s team to someone else first.');
    S.E = S.E.filter(e => e.id !== ex.id); delete db.users[ex.id];
    S.T = S.T.filter(t => t.emp !== ex.id); S.L = S.L.filter(l => l.emp !== ex.id); S.L.forEach(l => { if (l.alt === ex.id) l.alt = 0; });
    S.P = S.P.filter(p => p.emp !== ex.id); S.N = S.N.filter(n => n.to !== ex.id);
    Object.keys(S.A).forEach(d => { delete S.A[d][ex.id]; });
    S.C.forEach(c => { c.m = c.m.filter(x => x !== ex.id); if (c.by === ex.id) c.by = c.m[0]; });
    S.C = S.C.filter(c => c.m.length > 1 || c.locked);
    ok();
  });

  /* ---- tasks ---- */
  const EMPK = ['st', 'pr', 'note', 'ev', 'rej', 'rr'];
  const cleanEv = ev => { const o = {}; if (ev && typeof ev === 'object') ['as', 'ac', 'rj', 'st', 'dn'].forEach(k => { if (typeof ev[k] === 'string') o[k] = ev[k].slice(0, 20); }); return o; };
  const taskFields = r => ({ title: str(r.title, 200), project: str(r.project, 80), emp: +r.emp, by: +r.by, pri: ['High', 'Medium', 'Low'].indexOf(r.pri) > -1 ? r.pri : 'Medium', due: isDate(r.due) ? r.due : '', st: STATES.indexOf(r.st) > -1 ? r.st : 'Pending', pr: Math.max(0, Math.min(100, num(r.pr))), hrs: Math.max(0, Math.min(1000, num(r.hrs))), inst: str(r.inst, 2000), note: str(r.note, 2000), rr: str(r.rr, 500), rej: str(r.rej, 500), ev: cleanEv(r.ev) });
  list('T').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.T, r.id);
    if (!ex) {
      if (!boss) return rej('Only managers and leads can assign tasks.');
      const f = taskFields(r);
      if (!f.title.trim()) return rej('A task needs a title.'); if (!f.due) return rej('A task needs a due date.');
      if (!(adm || subs.indexOf(f.emp) > -1)) return rej('You can only assign to your own team.');
      if (f.by !== uid) return rej('Invalid assigner.');
      f.st = 'Pending'; let id = +r.id; if (!id || byId(S.T, id)) id = Date.now() + Math.floor(Math.random() * 1000);
      S.T.unshift(Object.assign({ id }, f)); return ok();
    }
    const full = adm || subs.indexOf(ex.emp) > -1;
    if (full) {
      const f = taskFields(r);
      if (f.emp !== ex.emp && !(adm || subs.indexOf(f.emp) > -1)) return rej('You can only assign to your own team.');
      if (!f.title.trim()) return;
      Object.assign(ex, f); return ok();
    }
    if (ex.emp === uid) {
      const keys = Object.keys(r).filter(k => k !== 'id' && !same(r[k], ex[k]));
      if (keys.some(k => EMPK.indexOf(k) < 0)) return rej('You can only update your own progress on a task.');
      const f = taskFields(r); keys.forEach(k => { ex[k] = f[k]; }); return ok();
    }
    rej('You cannot change that task.');
  });
  dels('T').forEach(id => { const ex = byId(S.T, id); if (!ex) return; if (!(adm || subs.indexOf(ex.emp) > -1)) return rej('You cannot delete that task.'); S.T = S.T.filter(t => t !== ex); ok(); });

  /* ---- leave ---- */
  list('L').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.L, r.id), P = S.pol;
    if (!ex) {
      if (+r.emp !== uid || me.role === 'Admin') return rej('Invalid leave request.');
      const ty = P.types.find(t => t.n === r.type); if (!ty) return rej('Unknown leave type.');
      if (!isDate(r.from) || !isDate(r.to) || r.to < r.from) return rej('Invalid leave dates.');
      if (r.from < today(-1)) return rej('Leave cannot start in the past.');
      const d = wdays(r.from, r.to); if (!d) return rej('Those dates are all Sundays.');
      if (S.L.some(l => l.emp === uid && l.st !== 'Rejected' && !(r.to < l.from || r.from > l.to))) return rej('You already have leave on these dates.');
      const al = byId(S.E, r.alt); if (!al || al.id === uid || al.status !== 'Active' || al.role === 'Admin') return rej('Choose a valid alternative employee.');
      if (S.L.some(l => l.emp === al.id && l.st !== 'Rejected' && !(r.to < l.from || r.from > l.to))) return rej('Your alternative is on leave on these dates.');
      if (ty.q) { let used = 0; S.L.forEach(l => { if (l.emp === uid && l.type === ty.n && l.st !== 'Rejected') used += l.days; }); if (used + d > ty.q) return rej('Not enough ' + ty.n + ' balance.'); }
      if (ty.n === 'Casual Leave') { if (r.from < today(P.notice)) return rej('Casual leave needs ' + P.notice + ' day(s) notice.'); if (d > P.maxConsec) return rej('Casual leave is limited to ' + P.maxConsec + ' consecutive days.'); }
      if (ty.n === 'Earned Leave' && r.from < today(7)) return rej('Earned leave needs 7 days notice.');
      let id = +r.id; if (!id || byId(S.L, id)) id = Date.now() + Math.floor(Math.random() * 1000);
      S.L.unshift({ id, emp: uid, type: ty.n, from: r.from, to: r.to, days: d, reason: str(r.reason, 500), st: 'Pending', at: today(), by: 0, dat: '', note: '', alt: al.id, aS: 0, dS: 0 });
      return ok();
    }
    if (ex.st !== 'Pending') return;
    const isAlt = ex.alt === uid && !ex.aS, isAppr = appr && ex.emp !== uid && !ex.dS;
    if (!isAlt && !isAppr) return rej('You cannot decide this leave request.');
    const AK = ['aS', 'aBy', 'aNote'], DK = ['dS', 'dBy', 'dNote'], CK = ['st', 'by', 'dat', 'note'];
    const allowed = CK.concat(isAlt ? AK : [], isAppr ? DK : []);
    const keys = Object.keys(r).filter(k => k !== 'id' && !same(r[k], ex[k]));
    if (keys.some(k => allowed.indexOf(k) < 0)) return rej('You are not allowed to change that.');
    const note = str(r.note, 500);
    if (isAlt && keys.some(k => k === 'aS')) { if (r.aS !== 1 && r.aS !== -1) return rej('Invalid decision.'); ex.aS = r.aS; ex.aBy = uid; ex.aNote = str(r.aNote, 500); }
    if (isAppr && keys.some(k => k === 'dS')) { if (r.dS !== 1 && r.dS !== -1) return rej('Invalid decision.'); ex.dS = r.dS; ex.dBy = uid; ex.dNote = str(r.dNote, 500); }
    ex.by = uid; ex.dat = today(); ex.note = note;
    const was = ex.st;
    ex.st = (ex.aS === -1 || ex.dS === -1) ? 'Rejected' : (ex.aS === 1 && ex.dS === 1) ? 'Approved' : 'Pending';
    if (ex.st === 'Approved' && was !== 'Approved') {
      let d = new Date(ex.from + 'T00:00:00'); const e = new Date(ex.to + 'T00:00:00');
      while (d <= e) { if (d.getDay() !== 0) { const k = ds(d); (S.A[k] = S.A[k] || {})[ex.emp] = { s: 'L' }; } d.setDate(d.getDate() + 1); }
    }
    ok();
  });
  dels('L').forEach(id => { const ex = byId(S.L, id); if (!ex) return; if (ex.emp !== uid || ex.st !== 'Pending') return rej('Only your own pending request can be cancelled.'); S.L = S.L.filter(l => l !== ex); ok(); });

  /* ---- permission (2 per month, max 2 hours) ---- */
  list('P').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.P, r.id);
    if (!ex) {
      if (+r.emp !== uid || me.role === 'Admin') return rej('Invalid permission request.');
      if (!isDate(r.date) || !isTime(r.from) || !isTime(r.to)) return rej('Invalid permission date or time.');
      if (r.date < today(-1)) return rej('Permission cannot be in the past.');
      if (dow(r.date) === 0) return rej('Sunday is a weekly off.');
      const x = tmin(r.to) - tmin(r.from);
      if (x <= 0) return rej('End time must be after start time.'); if (x > 120) return rej('Permission can be at most 2 hours.');
      if (S.P.filter(p => p.emp === uid && p.st !== 'Rejected' && p.date.slice(0, 7) === r.date.slice(0, 7)).length >= 2) return rej('You have already used 2 permissions in that month.');
      if (S.P.some(p => p.emp === uid && p.st !== 'Rejected' && p.date === r.date && !(r.to <= p.from || r.from >= p.to))) return rej('You already have a permission overlapping this time.');
      if (S.L.some(l => l.emp === uid && l.st !== 'Rejected' && r.date >= l.from && r.date <= l.to)) return rej('You have a leave request on this date.');
      let id = +r.id; if (!id || byId(S.P, id)) id = Date.now() + Math.floor(Math.random() * 1000);
      S.P.unshift({ id, emp: uid, date: r.date, from: r.from, to: r.to, mins: x, reason: str(r.reason, 500), st: 'Pending', at: today(), by: 0, dat: '', note: '' });
      return ok();
    }
    if (ex.st !== 'Pending') return;
    if (!appr || ex.emp === uid) return rej('You cannot decide this permission.');
    if (r.st !== 'Approved' && r.st !== 'Rejected') return rej('Invalid decision.');
    const keys = Object.keys(r).filter(k => k !== 'id' && !same(r[k], ex[k]));
    if (keys.some(k => ['st', 'by', 'dat', 'note'].indexOf(k) < 0)) return rej('You are not allowed to change that.');
    ex.st = r.st; ex.by = uid; ex.dat = today(); ex.note = str(r.note, 500); ok();
  });
  dels('P').forEach(id => { const ex = byId(S.P, id); if (!ex) return; if (ex.emp !== uid || ex.st !== 'Pending') return rej('Only your own pending request can be cancelled.'); S.P = S.P.filter(p => p !== ex); ok(); });

  /* ---- attendance ---- */
  if (patch.A && Array.isArray(patch.A.up)) patch.A.up.forEach(x => {
    if (!x || !isDate(x.d) || !x.r || typeof x.r !== 'object') return;
    const eid = +x.e, tgt = byId(S.E, eid); if (!tgt || tgt.role === 'Admin') return;
    const rec = { s: x.r.s };
    if (['P', 'A', 'L'].indexOf(rec.s) < 0) return rej('Invalid attendance.');
    if (rec.s === 'P') { if (x.r.in && isTime(x.r.in)) rec.in = x.r.in; if (x.r.out && isTime(x.r.out)) rec.out = x.r.out; rec.late = !!x.r.late; }
    const cur = (S.A[x.d] || {})[eid];
    if (eid === uid) {
      if (rec.s !== 'P') return rej('You can only check yourself in.');
      if (x.d < today(-1) || x.d > today(1)) return rej('You can only check in for today.');
      if (cur && cur.s === 'L') return rej('You are on approved leave.');
    } else if (!canMk(eid)) return rej('You can only mark your own team.');
    (S.A[x.d] = S.A[x.d] || {})[eid] = rec; ok();
  });

  /* ---- projects, policy ---- */
  list('PJ').forEach(r => {
    if (!r || !boss) return rej('Only managers and leads can create projects.');
    const n = str(r.n, 80).trim(); if (!n) return;
    if (S.PJ.some(p => p.n.toLowerCase() === n.toLowerCase())) return;
    S.PJ.push({ n, d: str(r.d, 200) || '—' }); ok();
  });
  if (dels('PJ').length) rej('Projects cannot be deleted.');
  if (patch.pol) {
    if (!adm) rej('Only the admin can change the leave policy.');
    else {
      const p = patch.pol;
      if (Array.isArray(p.types) && p.types.length && [p.notice, p.maxConsec, p.sickCert].every(v => typeof v === 'number' && v >= 0)) {
        S.pol = { types: p.types.map(t => ({ n: str(t.n, 40), q: Math.max(0, num(t.q)), d: str(t.d, 200) })), notice: p.notice, maxConsec: Math.max(1, p.maxConsec), sickCert: Math.max(1, p.sickCert) }; ok();
      } else rej('Invalid policy.');
    }
  }

  /* ---- notifications ---- */
  list('N').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.N, r.id);
    if (!ex) {
      const to = byId(S.E, r.to); if (!to) return;
      const k = str(r.k, 60);
      if (k && S.N.some(n => n.k === k && n.to === to.id)) return;
      S.N.unshift({ id: str(r.id, 40) || nid(), to: to.id, tx: str(r.tx, 500), at: Math.min(num(r.at) || Date.now(), Date.now()), rd: 0, p: str(r.p, 20), s: str(r.s, 60), ty: str(r.ty, 10) || 'info', k });
      const mine = S.N.filter(n => n.to === to.id); if (mine.length > 300) { const drop = mine.slice(300); S.N = S.N.filter(n => drop.indexOf(n) < 0); }
      return ok();
    }
    if (ex.to !== uid) return rej('Not allowed.');
    ex.rd = r.rd ? 1 : 0; ok();
  });
  dels('N').forEach(id => { const ex = byId(S.N, id); if (ex && ex.to === uid) { S.N = S.N.filter(n => n !== ex); ok(); } });

  /* ---- chat ---- */
  const goodMembers = m => Array.isArray(m) ? Array.from(new Set(m.map(Number))).filter(i => byId(S.E, i)) : [];
  const cleanMsgs = (arr, have) => (Array.isArray(arr) ? arr : []).filter(m => m && typeof m === 'object' && !have[m.id] && +m.by === uid && typeof m.tx === 'string' && m.tx.trim()).map(m => ({ id: str(m.id, 40) || nid(), by: uid, tx: str(m.tx, 2000), at: Math.min(num(m.at) || Date.now(), Date.now() + 60000), sys: m.sys ? 1 : undefined })).map(m => { if (!m.sys) delete m.sys; return m; });
  list('C').forEach(r => {
    if (!r || typeof r !== 'object') return;
    const ex = byId(S.C, r.id);
    if (!ex) {
      if (r.id === 'g_all') return;
      const m = goodMembers(r.m); if (m.indexOf(uid) < 0 || m.length < 2) return rej('Invalid chat.');
      if (r.t === 'dm') {
        const a = Math.min(m[0], m[1]), b = Math.max(m[0], m[1]); if (m.length !== 2 || r.id !== 'dm' + a + '_' + b) return rej('Invalid chat.');
      } else if (r.t === 'group') { if (!str(r.n, 40).trim() || +r.by !== uid) return rej('Invalid group.'); } else return;
      const msgs = cleanMsgs(r.msgs, {}), t = Date.now();
      S.C.push({ id: str(r.id, 60), t: r.t, n: r.t === 'group' ? str(r.n, 40).trim() : undefined, m, by: uid, msgs, rd: {}, lat: msgs.length ? msgs[msgs.length - 1].at : t, at: t });
      if (r.t === 'dm') delete S.C[S.C.length - 1].n;
      return ok();
    }
    if (ex.m.indexOf(uid) < 0) return rej('Not allowed.');
    const have = {}; ex.msgs.forEach(m => { have[m.id] = 1; });
    const add = cleanMsgs(r.msgs, have);
    if (add.length) { ex.msgs = ex.msgs.concat(add).sort((a, b) => a.at - b.at); if (ex.msgs.length > 500) ex.msgs.splice(0, ex.msgs.length - 500); ex.lat = ex.msgs[ex.msgs.length - 1].at; }
    if (r.rd && typeof r.rd[uid] === 'number') { ex.rd = ex.rd || {}; ex.rd[uid] = Math.min(r.rd[uid], Date.now() + 60000); }
    if (!ex.locked && ex.t === 'group' && Array.isArray(r.m)) {
      const nm = goodMembers(r.m), added = nm.filter(x => ex.m.indexOf(x) < 0), removed = ex.m.filter(x => nm.indexOf(x) < 0);
      if (added.length || removed.length) {
        const leaving = !added.length && removed.length === 1 && removed[0] === uid;
        if (leaving) ex.m = nm;
        else if ((ex.by === uid || adm) && nm.indexOf(ex.by) > -1 && nm.length >= 2) ex.m = nm;
        else rej('You cannot change the members of this group.');
      }
    }
    ok();
  });
  dels('C').forEach(id => {
    const ex = byId(S.C, id); if (!ex) return;
    if (ex.locked) return rej('That group cannot be deleted.');
    if (!(adm || (ex.t === 'group' && ex.by === uid && ex.m.indexOf(uid) > -1))) return rej('You cannot delete that chat.');
    S.C = S.C.filter(c => c !== ex); ok();
  });

  if (changed) { db.v++; persist(); }
  return { rejected, msgs };
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function secHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
}
function send(res, code, obj, extra) { const b = JSON.stringify(obj); res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {})); res.end(b); }
function readBody(req) {
  return new Promise((ok, bad) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > 3e6) { bad(new Error('too big')); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}); } catch (e) { bad(new Error('bad json')); } });
    req.on('error', bad);
  });
}
const fails = new Map();
const limited = k => { const x = fails.get(k); return x && x.n >= 8 && Date.now() - x.t < 15 * 60e3; };
const failed = k => { const x = fails.get(k); if (!x || Date.now() - x.t > 15 * 60e3) fails.set(k, { n: 1, t: Date.now() }); else { x.n++; x.t = Date.now(); } };
const clientIp = req => (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
const isHttps = req => !!req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
function sessionUser(req) {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('wt='));
  const o = c && verify(c.slice(3)); if (!o) return null;
  const e = byId(db.state.E, o.u), us = db.users[o.u];
  return (e && us && e.status === 'Active' && us.sv === o.sv) ? e : null;
}
function cookie(req, val, maxAge) { return 'wt=' + val + '; HttpOnly; SameSite=Lax; Path=/' + (maxAge != null ? '; Max-Age=' + maxAge : '') + (isHttps(req) ? '; Secure' : ''); }

async function api(req, res, u) {
  const p = u.pathname, post = req.method === 'POST';
  if (post) { const o = req.headers.origin; if (o) { try { if (new URL(o).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' }); } catch (e) { return send(res, 403, { error: 'Bad origin' }); } } }
  if (p === '/api/health') return send(res, 200, { ok: true });
  if (p === '/api/login' && post) {
    const b = await readBody(req), un = str(b.u, 60).trim().toLowerCase(), key = clientIp(req) + '|' + un;
    if (limited(key)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const e = db.state.E.find(x => x.u === un), us = e && db.users[e.id];
    if (!e || !us || !checkPw(String(b.p || ''), us.h)) { failed(key); return send(res, 401, { error: 'Invalid username or password.' }); }
    if (e.status !== 'Active') return send(res, 403, { error: 'This account is inactive. Contact your admin.' });
    fails.delete(key);
    const age = b.remember ? 30 * 86400 : 12 * 3600;
    const tok = sign({ u: e.id, sv: us.sv, exp: Date.now() + age * 1000 });
    return send(res, 200, { id: e.id, def: !!us.def }, { 'Set-Cookie': cookie(req, tok, b.remember ? age : null) });
  }
  if (p === '/api/logout' && post) return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  const me = sessionUser(req);
  if (p === '/api/me') return send(res, 200, me ? { id: me.id, def: !!db.users[me.id].def } : {});
  if (!me) return send(res, 401, { error: 'Please sign in.' });
  if (p === '/api/state' && req.method === 'GET') {
    if (u.searchParams.get('v') === String(db.v)) return send(res, 200, { same: true, v: db.v });
    return send(res, 200, { v: db.v, state: view(me.id) });
  }
  if (p === '/api/sync' && post) {
    const b = await readBody(req);
    const r = applyPatch(me.id, (b && b.patch) || {});
    return send(res, 200, { v: db.v, state: view(me.id), rejected: r.rejected, msgs: r.msgs });
  }
  send(res, 404, { error: 'Not found' });
}
function serveStatic(req, res, u) {
  let f = decodeURIComponent(u.pathname); if (f === '/') f = '/index.html';
  const full = path.normalize(path.join(PUB, f));
  if (!full.startsWith(PUB + path.sep) && full !== PUB) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  });
}

initDb(); backup(); setInterval(backup, 6 * 3600e3).unref();
const server = http.createServer(async (req, res) => {
  secHeaders(res);
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, u);
  } catch (e) {
    console.error(e.message);
    if (!res.headersSent) send(res, e.message === 'bad json' ? 400 : 500, { error: e.message === 'bad json' ? 'Bad request' : 'Server error' });
  }
});
server.listen(PORT, () => console.log('InGage WorkTrack running on http://localhost:' + PORT));
function bye() { try { clearTimeout(ptimer); writeDb(); } catch (e) {} process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
module.exports = { server };

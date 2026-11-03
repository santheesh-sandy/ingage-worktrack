'use strict';
/* Starts the server on a temp database and checks login, roles and the leave/permission rules. */
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), PORT = 3900 + Math.floor(Math.random() * 90);
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, SEED_DEMO: '0' }), stdio: 'pipe' });
const B = 'http://localhost:' + PORT;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
const workday = n => { let k = n; while (new Date(day(k) + 'T00:00:00').getDay() === 0) k++; return day(k); };
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log('  ok  ' + m); };
async function client(u, p) {
  let ck = '';
  const call = async (m, url, body) => { const r = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return { s: r.status, j: await r.json() }; };
  const l = await call('POST', '/api/login', { u, p }); if (l.s !== 200) return { fail: l };
  const c = { id: l.j.id, call, sync: patch => call('POST', '/api/sync', { patch }), state: async () => (await call('GET', '/api/state')).j.state };
  return c;
}
(async () => {
  await new Promise(r => setTimeout(r, 900));
  try {
    console.log('Login');
    ok((await client('admin', 'wrong')).fail.s === 401, 'wrong password rejected');
    const adm = await client('admin', 'admin123'), babu = await client('babu', 'manager123'), jey = await client('jeyaram', 'lead123'), abi = await client('abishek', 'lead123'), emp = await client('abinesh', 'emp123'), emp2 = await client('madhan', 'emp123');
    ok(adm.id && babu.id && jey.id && abi.id && emp.id, 'all roles can sign in');
    const st = await emp.state();
    ok(!JSON.stringify(st).includes('"pw"') && !JSON.stringify(st).includes('$'), 'no passwords or hashes sent to the browser');
    ok((await emp.call('GET', '/api/state')).s === 200 && (await (await fetch(B + '/api/state')).status) === 401, 'state needs a session');

    console.log('Tasks');
    const aS = await abi.state(), me = aS.E.find(e => e.u === 'abinesh');
    const t = { id: 111, title: 'Prepare report', project: 'General Operations', emp: me.id, by: abi.id, pri: 'High', due: day(3), st: 'Pending', pr: 0, hrs: 4, inst: '', note: '', rr: '', rej: '', ev: { as: 'x' } };
    ok((await abi.sync({ T: { up: [t], del: [] } })).j.rejected === 0, 'team lead can assign a task to a team member');
    ok((await emp2.sync({ T: { up: [Object.assign({}, t, { st: 'Completed' })], del: [] } })).j.rejected === 1, 'another employee cannot touch that task');
    ok((await emp.sync({ T: { up: [Object.assign({}, t, { title: 'Hacked' })], del: [] } })).j.rejected === 1, 'assignee cannot rename the task');
    ok((await emp.sync({ T: { up: [Object.assign({}, t, { st: 'Accepted' })], del: [] } })).j.rejected === 0, 'assignee can accept it');
    ok((await emp.sync({ T: { up: [{ id: 222, title: 'x', emp: me.id, by: me.id, due: day(1) }], del: [] } })).j.rejected === 1, 'employee cannot create tasks');

    console.log('Leave');
    const f = workday(10), tt = workday(10), al = aS.E.find(e => e.u === 'madhan').id;
    const lv = { id: 501, emp: me.id, type: 'Casual Leave', from: f, to: tt, days: 1, reason: 'family', st: 'Pending', alt: al, aS: 0, dS: 0 };
    ok((await emp.sync({ L: { up: [lv], del: [] } })).j.rejected === 0, 'employee can apply for leave');
    ok((await emp.sync({ L: { up: [Object.assign({}, lv, { id: 502 })], del: [] } })).j.rejected === 1, 'overlapping leave is rejected');
    ok((await emp.sync({ L: { up: [Object.assign({}, lv, { st: 'Approved', aS: 1, dS: 1 })], del: [] } })).j.rejected === 1, 'employee cannot approve own leave');
    const sat = (() => { let k = 12; while (new Date(day(k) + 'T00:00:00').getDay() !== 6) k++; return day(k); })();
    ok((await emp.sync({ L: { up: [Object.assign({}, lv, { id: 503, from: sat, to: sat })], del: [] } })).j.rejected === 0, 'Saturday counts as a working day for leave');
    ok((await abi.sync({ L: { up: [Object.assign({}, lv, { aS: 1, dS: 1, st: 'Approved', dBy: abi.id })], del: [] } })).j.rejected === 1, 'team lead cannot approve leave');
    const dec = (u, extra) => ({ L: { up: [Object.assign({}, lv, extra)], del: [] } });
    ok((await emp2.sync(dec(0, { aS: 1, aBy: al, st: 'Pending', by: al, dat: day(0) }))).j.rejected === 0, 'alternative can accept');
    let L1 = (await adm.state()).L.find(l => l.id === 501);
    ok(L1.st === 'Pending' && L1.aS === 1, 'still pending after only the alternative accepts');
    ok((await emp2.sync(dec(0, { aS: 1, aBy: al, dS: 1, dBy: al, st: 'Approved' }))).j.rejected === 1, 'alternative cannot give the admin approval');
    ok((await babu.sync(dec(0, { aS: 1, aBy: al, dS: 1, dBy: babu.id, st: 'Approved', by: babu.id, dat: day(0) }))).j.rejected === 0, 'Babu can approve');
    const as = await adm.state(); L1 = as.L.find(l => l.id === 501);
    ok(L1.st === 'Approved' && (as.A[f] || {})[me.id] && as.A[f][me.id].s === 'L', 'leave approved and attendance marked as leave by the server');

    console.log('Permission');
    const pm = (id, date, from, to) => ({ P: { up: [{ id, emp: me.id, date, from, to, mins: 0, reason: 'x', st: 'Pending' }], del: [] } });
    const d1 = workday(2);
    ok((await emp.sync(pm(601, d1, '10:00', '13:00'))).j.rejected === 1, '3-hour permission rejected (max 2 hours)');
    ok((await emp.sync(pm(602, d1, '10:00', '12:00'))).j.rejected === 0, '2-hour permission accepted');
    ok((await emp.sync(pm(603, d1, '15:00', '16:00'))).j.rejected === 0, 'second permission accepted');
    ok((await emp.sync(pm(604, d1, '17:00', '17:30'))).j.rejected === 1, 'third permission in the month rejected');
    const sun = (() => { let k = 1; while (new Date(day(k) + 'T00:00:00').getDay() !== 0) k++; return day(k); })();
    ok((await emp2.sync({ P: { up: [{ id: 700, emp: al, date: sun, from: '10:00', to: '11:00', reason: 'x' }], del: [] } })).j.rejected === 1, 'Sunday permission rejected');
    const ps = (await emp.state()).P.find(p => p.id === 602);
    ok((await abi.sync({ P: { up: [Object.assign({}, ps, { st: 'Approved' })], del: [] } })).j.rejected === 1, 'team lead cannot approve permission');
    ok((await adm.sync({ P: { up: [Object.assign({}, ps, { st: 'Approved', by: adm.id })], del: [] } })).j.rejected === 0, 'admin can approve permission');

    console.log('People, attendance, chat');
    const np = { id: 9001, name: 'New Person', u: 'newp', role: 'Employee', mgr: abi.id, dept: 'QA', desig: 'Tester', _pw: 'abc123' };
    ok((await babu.sync({ E: { up: [np], del: [] } })).j.rejected === 1, 'only admin can add people');
    ok((await adm.sync({ E: { up: [np], del: [] } })).j.rejected === 0, 'admin can add a person');
    ok((await client('newp', 'abc123')).id, 'new person can sign in with the password set');
    ok((await emp.sync({ E: { up: [Object.assign({}, me, { role: 'Manager' })], del: [] } })).j.rejected === 1, 'employee cannot promote self');
    ok((await emp.sync({ E: { up: [Object.assign({}, me, { _pw: 'newpass1', _cur: 'bad' })], del: [] } })).j.rejected === 1, 'password change needs the current password');
    ok((await emp.sync({ E: { up: [Object.assign({}, me, { _pw: 'newpass1', _cur: 'emp123' })], del: [] } })).j.rejected === 0, 'password change works with the current password');
    ok((await client('abinesh', 'newpass1')).id && (await client('abinesh', 'emp123')).fail, 'old password stops working');
    const e2 = await client('abinesh', 'newpass1');
    ok((await e2.sync({ A: { up: [{ d: day(0), e: me.id, r: { s: 'P', in: '09:10', late: false } }] } })).j.rejected === 0, 'employee can check in');
    ok((await e2.sync({ A: { up: [{ d: day(0), e: al, r: { s: 'P', in: '09:10' } }] } })).j.rejected === 1, 'employee cannot mark someone else');
    ok((await jey.sync({ A: { up: [{ d: day(0), e: al, r: { s: 'A' } }] } })).j.rejected === 0, 'program manager can mark their team');
    const dm = { id: 'dm' + Math.min(me.id, al) + '_' + Math.max(me.id, al), t: 'dm', m: [me.id, al], by: me.id, msgs: [{ id: 'm1', by: me.id, tx: 'hello', at: Date.now() }], rd: {}, lat: Date.now(), at: Date.now() };
    ok((await e2.sync({ C: { up: [dm], del: [] } })).j.rejected === 0, 'private chat created');
    ok((await emp2.state()).C.some(c => c.id === dm.id && c.msgs.length === 1), 'recipient receives the message');
    ok(!(await abi.state()).C.some(c => c.id === dm.id), 'other people cannot see a private chat');
    ok((await adm.state()).N.length >= 0, 'admin state loads');
    ok((await abi.sync({ pol: { types: [], notice: 1, maxConsec: 1, sickCert: 1 } })).j.rejected === 1, 'only admin can change the policy');
    console.log('\nAll ' + pass + ' checks passed.');
  } catch (e) { console.error('\nFAILED:', e.message); process.exitCode = 1; }
  srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
})();

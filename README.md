# InGage WorkTrack

Tasks, projects, attendance, leave, permission and team chat for InGage Technologies.
A real website with a backend: logins, role-based access, a database file, live updates and daily backups.
**No packages to install** – it only needs Node.js 18 or newer.

## Run it

```bash
node server.js          # then open http://localhost:3000
```

Use `SEED_DEMO=1 node server.js` the first time if you want sample tasks, attendance and leave to look around with.

## First sign-in

| Role | Username | Password |
|---|---|---|
| Admin (Sri Harsha) | `admin` | `admin123` |
| Manager (Babu) | `babu` | `manager123` |
| Program Manager (Jeyaram) | `jeyaram` | `lead123` |
| Team Lead (Abishek V) | `abishek` | `lead123` |
| Team members | `abinesh`, `madhan`, `silambarasan`, `deepika`, `dhivya`, `divya`, `gunaseelan`, `pooja`, `rajashree`, `santheesh`, `pavithra` | `emp123` |

**Change these straight away** (My Profile → Update profile). The app reminds anyone still on a default password.
To set the admin password before the first start: `ADMIN_PASSWORD=YourStrongPassword node server.js`.
New people are added by the Admin under Team Members. Passwords are at least 6 characters.

## Who can do what

- **Reporting line:** Admin → Manager (Babu) → Program Manager (Jeyaram) → Team Lead (Abishek V) → team members.
- **Tasks:** managers and leads assign to their own team; the assignee accepts, rejects, starts and completes.
- **Leave:** apply Monday to Saturday (Sunday is off). The chosen **alternative employee accepts or rejects**, then **Sri Harsha or Babu approves**. Approved leave is marked in attendance by the server.
- **Permission:** 2 per month, each at most 2 hours; approved by Sri Harsha or Babu.
- **Attendance:** everyone checks in and out; managers mark their own team.
- **Chat:** private chats and groups; people only ever receive the chats they are in.
- All of this is enforced on the **server**, not only in the browser.

## Putting it on the internet

1. **Any server / VPS:** copy this folder, run `node server.js` under `pm2` or `systemd`, and put Nginx or Caddy in front for HTTPS. Set `TRUST_PROXY=1`.
2. **Render / Railway / Fly.io:** create a Node web service from this folder, start command `node server.js`, and **attach a persistent disk** mounted at `/data` with the environment variable `DATA_DIR=/data`. Without a disk the database is wiped on every deploy.
3. **Docker:** `docker build -t worktrack .` then `docker run -p 3000:3000 -v worktrack-data:/data -e ADMIN_PASSWORD=... worktrack`.

Always serve it over HTTPS in production (the login cookie is marked `Secure` automatically behind HTTPS).

## Your data

Everything lives in `DATA_DIR/db.json` (default `./data`). A copy is saved daily to `DATA_DIR/backups/` (last 14 kept).
To move or restore, copy that folder. To start fresh, stop the server and delete `db.json`.

## Settings (environment variables)

| Name | Purpose | Default |
|---|---|---|
| `PORT` | Port to listen on | 3000 |
| `DATA_DIR` | Where the database and backups live | `./data` |
| `SESSION_SECRET` | Signs login cookies (auto-created if empty) | auto |
| `ADMIN_PASSWORD` | Admin password on first run | `admin123` |
| `SEED_DEMO` | `1` = add sample data on first run | 0 |
| `TRUST_PROXY` | `1` when behind Nginx/Render/Railway | 0 |
| `TZ` | Time zone for dates | Asia/Kolkata |

## Files

- `server.js` – the backend (login, permissions, storage, API)
- `seed.js` – starting people, projects and leave policy
- `public/index.html` – the website
- `test/api.test.js` – `npm test` checks logins, roles and the leave/permission rules

## Notes

- Built for a team of this size (dozens of people). The database is one file, held in memory and saved after every change.
- The browser refreshes every 3 seconds, so tasks, approvals, notifications and chat appear live for everyone.
- Passwords are stored hashed (scrypt); logins are rate-limited after repeated wrong attempts.
- Forgotten password: the Admin sets a new one in Team Members → Edit.

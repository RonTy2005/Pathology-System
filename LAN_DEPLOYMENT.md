# LAN deployment

Lab LMS uses one central server and any number of staff clients. The server computer owns the only `lab-lms.db`; every other PC connects to it over the local network. Do not run a database server or copy the database onto client PCs.

## Recommended desktop installation

Build the two Windows installers from this project:

```powershell
.\build-windows-installers.ps1
```

The installers are created in `release`. The build script automatically uses a temporary no-space path, which Windows needs to rebuild the SQLite component for Electron.

1. Install **Lab LMS Server** on the one computer selected as the central server. Its installer opens the required Windows Firewall rules for the **Private** network only. Start it once; it opens the normal Lab LMS login page and keeps the shared database in the server app's Windows data folder.
2. Install **Lab LMS** on every reception, admin, or technician computer. On every launch it first checks its remembered server, then broadcasts a LAN discovery request if necessary. Once found, it saves the server address and opens the normal login page automatically.

No server IP entry is required when exactly one Lab LMS Server is available on the same LAN. If two servers answer, the client shows a one-time choice. If network equipment blocks broadcasts, the client offers a manual address entry and remembers it afterwards.

The server app and every client app use the same centrally managed user accounts, permissions, data, reports, and bills concurrently.

## Node-based server alternative

1. Connect the server computer to the clinic's private LAN and give it a stable IP address or a fixed network name.
2. Install the project dependencies once with `npm install`.
3. Run `setup-lan-server.ps1` once as Administrator. It opens TCP 3000 and the LAN discovery port only for **Private** networks.
4. Start `start-lan-server.cmd` (or run `npm run start:lan`). Keep that window running.

The server starts on `0.0.0.0`, so it accepts connections from the LAN. It responds to the same local UDP discovery request on port 32480. It does not create separate databases for individual staff computers.

### Patient QR report links

Bills and pathology reports include private QR links for the patient portal and digital report page. When the server prints from `localhost`, Lab LMS automatically uses a private LAN address so phones on the same Wi-Fi can open the link. To make every printed QR use one fixed LAN or public address, set `PATIENT_PORTAL_BASE_URL` before starting the server, for example:

```powershell
$env:PATIENT_PORTAL_BASE_URL = "http://192.168.1.20:3000"
npm run start:lan
```

For a LAN-only server, the patient's phone must be connected to that same Wi-Fi network to open the QR link. Access from outside the clinic needs a secure public HTTPS address and should be set up separately.

## PowerShell client alternative

Copy `open-lab-lan-client.ps1` to each client PC and run it. It automatically finds the Lab LMS server on the same LAN, saves the connection for that Windows user, and opens the login page. Staff only need their own login ID and password.

If the network blocks automatic discovery, the launcher asks for the server address once and then remembers it. To choose a different server later, run:

```powershell
.\open-lab-lan-client.ps1 -ResetConnection
```

Each person signs in with their own centrally managed account. Existing role-based portals—super admin, admin, reception, and technician roles—automatically load the appropriate portal on whichever PC they use.

## Operating notes

- Keep the server PC powered on and connected while the lab is operating.
- Use the app's local backup function regularly and store a copy away from the server PC.
- Keep the server address inside a trusted private LAN; do not expose port 3000 directly to the public internet.
- If the server IP changes, run the client launcher again; it searches automatically and updates its saved connection.

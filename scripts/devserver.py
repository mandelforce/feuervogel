#!/usr/bin/env python3
"""Local test server with an address that never changes.

    python3 scripts/devserver.py [folder] [port]

Serves the folder (default: the current one) on port 8080, on every network interface, so a phone on the same Wi-Fi can open it.
If an earlier run of this script is still serving, it is stopped first, so the address stays the same whichever branch or
worktree you test. Pages are sent with no-store headers, so a phone never shows an old copy.

The game recognises these addresses as a test build: scores stay on the device and nothing is sent to the live leaderboard.
"""
import http.server, os, signal, socket, socketserver, subprocess, sys, time

folder = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
pidfile = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'starfall-devserver-%d.pid' % port)


def stop_previous():
    try:
        pid = int(open(pidfile).read())
    except (OSError, ValueError):
        return
    try:
        cmd = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
        if 'devserver.py' in cmd:  # only ever stop our own earlier run
            os.kill(pid, signal.SIGTERM)
            for _ in range(30):
                time.sleep(0.1)
                if subprocess.run(['ps', '-p', str(pid)], capture_output=True).returncode != 0:
                    break
    except OSError:
        pass


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=folder, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


stop_previous()
with Server(('', port), Handler) as srv:
    open(pidfile, 'w').write(str(os.getpid()))
    signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(SystemExit(0)))
    host = subprocess.run(['scutil', '--get', 'LocalHostName'], capture_output=True, text=True).stdout.strip()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close()
    except OSError:
        ip = ''
    print('Serving %s' % folder, flush=True)
    print('  This computer:   http://localhost:%d/' % port, flush=True)
    if host:
        print('  Phone (stable):  http://%s.local:%d/' % (host, port), flush=True)
    if ip:
        print('  Phone (by IP):   http://%s:%d/' % (ip, port), flush=True)
    try:
        srv.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        try:
            os.remove(pidfile)
        except OSError:
            pass

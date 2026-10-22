"""Install the native theme in real Chromium; capture its own English-only New Tab UI."""
import json
import shutil
import subprocess
import time

GRAPHICAL = True


def window(c, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            windows = c.run(['xdotool', 'search', '--onlyvisible', '--class', 'chromium']).split()
            for candidate in windows:
                geometry = c.run(['xdotool', 'getwindowgeometry', '--shell', candidate])
                if any(line.startswith('WIDTH=') and int(line.split('=')[1]) > 600 for line in geometry.splitlines()):
                    c.run(['xdotool', 'windowsize', candidate, '2560', '1600'])
                    c.run(['xdotool', 'windowmove', candidate, '0', '0'])
                    return candidate
        except subprocess.CalledProcessError:
            pass
        time.sleep(0.2)
    raise RuntimeError('Chromium did not create its native browser window')


def prepare(c):
    theme = c.home / 'theme'
    theme.mkdir()
    manifest = json.loads((c.root / 'port.json').read_text())
    prefix = f'{c.slug}/'
    for name in manifest['files']:
        if name.startswith(prefix):
            destination = theme / name[len(prefix):]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(c.root / name, destination)
    profile = c.home / 'profile'
    c.profile = profile
    # Environment language does not control remotely localized Google promotions: block remote hosts too.
    c.env.update(LANG='C.UTF-8', LC_ALL='C.UTF-8', LANGUAGE='en_US:en')
    preferences = {'intl': {'accept_languages': 'en-US,en', 'selected_languages': 'en-US,en'},
                   'browser': {'check_default_browser': False}, 'search': {'suggest_enabled': False},
                   'ntp': {'modules_visible': False}}
    c.write('profile/Default/Preferences', json.dumps(preferences))
    c.write('profile/Local State', json.dumps({'intl': {'app_locale': 'en-US'}}))
    c.arguments = ['chromium', f'--user-data-dir={profile}', '--lang=en-US', '--accept-lang=en-US,en',
                   '--no-first-run', '--no-default-browser-check', '--disable-sync', '--password-store=basic',
                   '--disable-gpu', '--no-sandbox', '--test-type', '--disable-background-networking',
                   '--disable-default-apps', '--disable-search-engine-choice-screen',
                   '--disable-features=Translate,OptimizationHints,MediaRouter',
                   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
                   '--ozone-platform=x11', '--force-device-scale-factor=2', '--window-size=1280,800',
                   '--remote-debugging-port=0', f'--load-extension={theme}']
    # First launch installs the theme and its Undo infobar; a graceful restart saves it without a promo bar.
    first = c.spawn(c.arguments + ['about:blank'])
    window(c)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if (theme / 'Cached Theme.pak').exists():
            break
        if first.poll() is not None:
            raise RuntimeError('Chromium exited before installing the native theme')
        time.sleep(0.2)
    else:
        raise RuntimeError('Chromium did not compile the unpacked native theme')
    first.terminate()
    first.wait(timeout=15)
    time.sleep(0.3)
    start = c.copy('capture/fixtures/start.html', 'pages/start.html')
    docs = c.copy('capture/fixtures/docs.html', 'pages/docs.html')
    return c.arguments + [start.as_uri(), docs.as_uri()]


def drive(c):
    win = window(c)
    c.run(['xdotool', 'windowfocus', '--sync', win, 'key', '--clearmodifiers', 'ctrl+t'])
    # Remove omnibox focus naturally: don't fake a ring color that Chrome's theme API cannot set.
    c.run(['xdotool', 'mousemove', '2400', '1000', 'click', '1'])
    c.run(['xdotool', 'mousemove', '2559', '1599'])
    deadline, diagnostics = time.monotonic() + 25, ''
    while time.monotonic() < deadline:
        try:
            evidence = json.loads(c.run(['node', c.root / 'capture/inspect.mjs', c.profile]))
            print(f'Native browser language: {evidence["language"]}; title: {evidence["title"]}', flush=True)
            return
        except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
            diagnostics = getattr(error, 'stderr', '') or str(error)
            time.sleep(0.5)
    raise RuntimeError(f'Chromium New Tab did not reach the verified English scene: {diagnostics}')

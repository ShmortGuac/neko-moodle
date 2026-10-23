// Browser / SSO sign-in, the same flow the official Moodle app uses:
// open launch.php, let the user sign in (Microsoft, CAS, etc.), then catch the
// moodlemobile://token=... redirect that Moodle sends at the end.

const { BrowserWindow } = require('electron');
const { SERVICE, MoodleError } = require('./moodle');

const SCHEME = 'moodlemobile';

function ssoLogin(parent, site, launchUrl) {
  return new Promise((resolve, reject) => {
    const passport = String(Math.floor(Math.random() * 1e9));
    const url = new URL(launchUrl || `${site}/admin/tool/mobile/launch.php`);
    url.searchParams.set('service', SERVICE);
    url.searchParams.set('passport', passport);
    url.searchParams.set('urlscheme', SCHEME);

    const authWin = new BrowserWindow({
      parent,
      modal: true,
      width: 560,
      height: 760,
      title: 'Sign in to i-Taleem',
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        // Fresh, in-memory session each time so a stale login never gets reused.
        partition: `sso-${Date.now()}`,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    let done = false;
    const finish = (err, token) => {
      if (done) return;
      done = true;
      if (!authWin.isDestroyed()) authWin.destroy();
      if (err) reject(err);
      else resolve(token);
    };

    const tryCapture = (target) => {
      if (!target || !target.startsWith(`${SCHEME}://`)) return false;
      try {
        const payload = decodeURIComponent(target.slice(`${SCHEME}://`.length).replace(/^token=/, ''));
        // Format: base64("signature:::token:::privatetoken")
        const [, token] = Buffer.from(payload, 'base64').toString('utf8').split(':::');
        if (!token) throw new MoodleError('i-Taleem did not return a login token.');
        finish(null, token);
      } catch (e) {
        finish(e);
      }
      return true;
    };

    const wc = authWin.webContents;
    // Moodle's launch.php trusts clients whose user agent says "MoodleMobile" (the official
    // Moodle Desktop app was Electron too and did the same).
    wc.setUserAgent(`${wc.getUserAgent()} MoodleMobile`);
    wc.on('will-redirect', (e, u) => tryCapture(u) && e.preventDefault());
    wc.on('will-navigate', (e, u) => tryCapture(u) && e.preventDefault());
    wc.on('did-fail-load', (_e, _code, _desc, u) => tryCapture(u));
    wc.setWindowOpenHandler(({ url: u }) => (tryCapture(u) ? { action: 'deny' } : { action: 'allow' }));
    authWin.on('closed', () => finish(new MoodleError('Sign-in window was closed.', 'cancelled')));

    authWin.loadURL(url.toString());
  });
}

module.exports = { ssoLogin };

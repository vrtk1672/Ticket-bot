/**
 * ╔══════════════════════════════════════╗
 * ║         TICKET-BOT  v2.0             ║
 * ║   Interactive CLI Launcher & Menu    ║
 * ╚══════════════════════════════════════╝
 */

const readline = require('readline');
const { spawn }    = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── ANSI colour helpers ───────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  magenta:'\x1b[35m',
  blue:   '\x1b[34m',
  white:  '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

const c = (color, text) => `${color}${text}${C.reset}`;

// ─── Session-state file ────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '..', '.bot_session.json');

function loadSession() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveSession(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function printBanner() {
  console.clear();
  console.log(c(C.cyan + C.bold, `
  ████████╗██╗ ██████╗██╗  ██╗███████╗████████╗
     ██╔══╝██║██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝
     ██║   ██║██║     █████╔╝ █████╗     ██║
     ██║   ██║██║     ██╔═██╗ ██╔══╝     ██║
     ██║   ██║╚██████╗██║  ██╗███████╗   ██║
     ╚═╝   ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝
              ██████╗  ██████╗ ████████╗
              ██╔══██╗██╔═══██╗╚══██╔══╝
              ██████╔╝██║   ██║   ██║
              ██╔══██╗██║   ██║   ██║
              ██████╔╝╚██████╔╝   ██║
              ╚═════╝  ╚═════╝    ╚═╝  `));

  console.log(c(C.dim + C.white, '  ─────────────────────────────────────────────────────'));
  console.log(c(C.yellow,        '   🎟️  Automated Seat Hunter  |  30s Scan  |  8min Hold'));
  console.log(c(C.dim + C.white, '  ─────────────────────────────────────────────────────\n'));
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
function printMenu(url) {
  const urlDisplay = url
    ? c(C.green, url.length > 60 ? url.slice(0, 57) + '...' : url)
    : c(C.red, 'Not set — please choose option 1');

  console.log(c(C.bold + C.cyan,  '  ┌─────────────────────────────────────────┐'));
  console.log(c(C.bold + C.cyan,  '  │           MAIN MENU                     │'));
  console.log(c(C.bold + C.cyan,  '  └─────────────────────────────────────────┘\n'));
  console.log(`  ${c(C.yellow, '🔗 Active URL:')} ${urlDisplay}\n`);

  const items = [
    ['1', '🔗', 'Set ticket page URL',          C.cyan],
    ['2', '🚀', 'START bot (hunt all seats)',    C.green],
    ['3', '🔍', 'Test Mode — Scan only',         C.blue],
    ['4', '🧪', 'Test Mode — Sample 3 seats',    C.magenta],
    ['5', '📋', 'Show current config',           C.white],
    ['6', '❌', 'Exit',                          C.red],
  ];

  for (const [num, icon, label, color] of items) {
    console.log(`  ${c(C.bold + color, `[${num}]`)} ${icon}  ${c(color, label)}`);
  }
  console.log('');
}

// ─── Ask helper ───────────────────────────────────────────────────────────────
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// ─── URL validation (basic) ───────────────────────────────────────────────────
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

// ─── Config patcher ───────────────────────────────────────────────────────────
function patchConfig(patches) {
  const configPath = path.join(__dirname, 'config.js');
  let src = fs.readFileSync(configPath, 'utf8');

  for (const [key, value] of Object.entries(patches)) {
    const valStr = typeof value === 'string' ? `"${value}"` : String(value);

    // Match:  key: <anything>,   OR   key: <anything>\n
    const re = new RegExp(`(\\b${key}\\s*:\\s*)([^,\\n]+)`, 'g');
    if (re.test(src)) {
      src = src.replace(new RegExp(`(\\b${key}\\s*:\\s*)([^,\\n]+)`, 'g'), `$1${valStr}`);
    }
  }

  fs.writeFileSync(configPath, src, 'utf8');
}

// ─── Show config ──────────────────────────────────────────────────────────────
function showConfig() {
  // Always read fresh from disk (never from Node require-cache)
  const src = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const cfg = {};
  // Quick-parse key: value pairs from the module.exports object
  const pairs = src.match(/(?<=\s)(\w+)\s*:\s*([^,\n]+)/g) || [];
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split(/\s*:\s*/);
    try { cfg[k.trim()] = JSON.parse(rest.join(':').trim()); } catch { cfg[k.trim()] = rest.join(':').trim(); }
  }
  console.log('\n' + c(C.bold + C.cyan, '  ── Current Config ─────────────────────────────────'));
  console.log(c(C.yellow, `  url:                  `) + c(C.white, cfg.url));
  console.log(c(C.yellow, `  seats:                `) + c(C.white, JSON.stringify(cfg.seats)));
  console.log(c(C.yellow, `  watcherRefreshSec:    `) + c(C.white, cfg.watcherRefreshIntervalSec));
  console.log(c(C.yellow, `  holdTimerMinutes:     `) + c(C.white, cfg.holdTimerMinutes));
  console.log(c(C.yellow, `  maxSeatsPerSession:   `) + c(C.white, cfg.maxSeatsPerSession));
  console.log(c(C.yellow, `  testMode:             `) + c(C.white, cfg.testMode));
  console.log(c(C.cyan,   '  ─────────────────────────────────────────────────\n'));
}

// ─── Spawn bot as a FRESH child process (no require-cache issues) ────────────
function spawnBot(rl) {
  rl.close();
  const botPath = path.join(__dirname, 'bot.js');
  const child = spawn(process.execPath, [botPath], {
    stdio: 'inherit',   // share stdin/stdout/stderr with this terminal
    cwd: path.join(__dirname, '..')
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  const session = loadSession();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  // If URL was never set, ask immediately on first run
  if (!session.url) {
    printBanner();
    console.log(c(C.yellow + C.bold, '  👋 First run! Please enter the ticket page URL to get started.\n'));
    let inputUrl = '';
    while (!isValidUrl(inputUrl)) {
      inputUrl = (await ask(rl, c(C.cyan, '  🔗 Paste URL: '))).trim();
      if (!isValidUrl(inputUrl)) console.log(c(C.red, '  ❌ Invalid URL. Try again.\n'));
    }
    session.url = inputUrl;
    saveSession(session);
    patchConfig({ url: session.url });
    console.log(c(C.green, `\n  ✅ URL saved!\n`));
  }

  // Main menu loop
  while (true) {
    printBanner();
    printMenu(session.url);

    const choice = (await ask(rl, c(C.bold + C.white, '  › Choose an option: '))).trim();

    switch (choice) {
      // ── Set URL ─────────────────────────────────────────────────────────────
      case '1': {
        console.log('');
        let inputUrl = '';
        while (!isValidUrl(inputUrl)) {
          inputUrl = (await ask(rl, c(C.cyan, '  🔗 Paste new URL: '))).trim();
          if (!isValidUrl(inputUrl)) console.log(c(C.red, '  ❌ Invalid URL.\n'));
        }
        session.url = inputUrl;
        saveSession(session);
        patchConfig({ url: session.url });
        console.log(c(C.green, `\n  ✅ URL updated & saved to config!\n`));
        await ask(rl, c(C.dim, '  Press ENTER to continue...'));
        break;
      }

      // ── START (production watcher) ───────────────────────────────────────
      case '2': {
        patchConfig({ testMode: false });
        console.log(c(C.green + C.bold, `\n  🚀 Launching bot on ${session.url} ...\n`));
        console.log(c(C.dim, '  Type "cancel" at any time to stop and release all seats.\n'));
        await new Promise(r => setTimeout(r, 1200));
        spawnBot(rl);
        return; // hand off to bot
      }

      // ── Scan-only test ───────────────────────────────────────────────────
      case '3': {
        patchConfig({ testMode: true, testModeBehavior: '"scan-only"' });
        console.log(c(C.blue + C.bold, `\n  🔍 Running scan-only test...\n`));
        await new Promise(r => setTimeout(r, 800));
        spawnBot(rl);
        return;
      }

      // ── Sample test ──────────────────────────────────────────────────────
      case '4': {
        patchConfig({ testMode: true, testModeBehavior: '"scan-and-sample"', sampleSeatsLimit: 3 });
        console.log(c(C.magenta + C.bold, `\n  🧪 Running sample test (3 seats)...\n`));
        await new Promise(r => setTimeout(r, 800));
        spawnBot(rl);
        return;
      }

      // ── Show config ──────────────────────────────────────────────────────
      case '5': {
        showConfig();
        await ask(rl, c(C.dim, '  Press ENTER to go back...'));
        break;
      }

      // ── Exit ─────────────────────────────────────────────────────────────
      case '6':
      case 'exit':
      case 'quit': {
        console.log(c(C.red, '\n  👋 Goodbye!\n'));
        rl.close();
        process.exit(0);
      }

      default:
        console.log(c(C.red, `\n  ❌ Invalid option "${choice}". Try 1–6.\n`));
        await ask(rl, c(C.dim, '  Press ENTER to continue...'));
    }
  }
}

main().catch(err => {
  console.error('Menu error:', err);
  process.exit(1);
});

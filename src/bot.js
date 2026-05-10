const readline = require('readline');
const { chromium } = require('playwright');
const config = require('./config');
const path = require('path');
const fs = require('fs');

const DEBUG_DIR = path.join(__dirname, '..', 'debug');
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Scans the page to detect all available/selectable seats
async function scanAvailableSeats(page) {
  console.log('\n--- Scanning for available seats ---');
  const seatsInfo = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const foundSeats = [];
    
    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      const dataSeat = el.getAttribute('data-seat') || '';
      const className = (el.className || '').toString();
      const role = el.getAttribute('role') || '';
      const id = el.getAttribute('id') || '';
      
      // Look for disabled state
      let disabled = el.disabled || 
                       el.getAttribute('aria-disabled') === 'true' || 
                       className.toLowerCase().includes('disabled') || 
                       className.toLowerCase().includes('unavailable') || 
                       className.toLowerCase().includes('taken');
                       
      // Check if SVG child is unavailable (common in SVG maps)
      const svgChild = el.querySelector('svg');
      if (svgChild) {
        const svgClass = svgChild.getAttribute('class') || '';
        if (svgClass.includes('unavailable')) {
          disabled = true;
        }
      }
      
      const isPossibleSeat = 
        ariaLabel.toLowerCase().includes('seat') ||
        ariaLabel.includes('מושב') ||
        title.toLowerCase().includes('seat') ||
        title.includes('מושב') ||
        className.toLowerCase().includes('seat') ||
        dataSeat ||
        (role === 'checkbox' && (ariaLabel.includes('שורה') || ariaLabel.includes('מושב'))) ||
        (text.length > 0 && text.length <= 4 && /\d/.test(text) && !role); // narrow down text heuristic

      if (isPossibleSeat && !el.children.length || (isPossibleSeat && role === 'checkbox')) { // allow checkbox with SVG child
        const seatName = dataSeat || title || ariaLabel || text || 'Unknown';
        
        let strategy = 'unknown';
        if (dataSeat) strategy = 'data-seat';
        else if (title) strategy = 'title';
        else if (ariaLabel) strategy = 'aria-label';
        else if (text) strategy = 'textContent';

        foundSeats.push({
          name: seatName,
          strategy: strategy,
          'aria-label': ariaLabel,
          title: title,
          'data-seat': dataSeat,
          id: id,
          textContent: text,
          selectable: !disabled
        });
      }
    }
    return foundSeats;
  });
  
  // Filter for unique names to avoid logging same seat 5 times if structured deeply
  const uniqueMap = new Map();
  for (const s of seatsInfo) {
    if (!uniqueMap.has(s.name) || (!uniqueMap.get(s.name).selectable && s.selectable)) {
      uniqueMap.set(s.name, s);
    }
  }
  const uniqueSeatsInfo = Array.from(uniqueMap.values());
  const selectableSeats = uniqueSeatsInfo.filter(s => s.selectable);
  
  console.log(`Detected ${selectableSeats.length} selectable seats out of ${uniqueSeatsInfo.length} unique possible seats.`);
  selectableSeats.slice(0, 20).forEach((s, i) => {
    console.log(`[${i}] Name: "${s.name}" | Strategy: ${s.strategy} | text:"${s.textContent}" | aria-label:"${s['aria-label']}" | title:"${s.title}" | data-seat:"${s['data-seat']}" | Selectable: ${s.selectable}`);
  });
  if (selectableSeats.length > 20) {
    console.log(`... and ${selectableSeats.length - 20} more (omitted from logs for brevity).`);
  }
  
  return selectableSeats;
}

// Attempt to select a seat via different locators
async function trySelectSeat(page, seatNameOrObj) {
  let name = typeof seatNameOrObj === 'string' ? seatNameOrObj : seatNameOrObj.name;
  
  const locators = [];
  
  // If we have an object from scanAvailableSeats, use exact match strategies
  if (typeof seatNameOrObj === 'object') {
    if (seatNameOrObj.id) locators.push(page.locator(`#${seatNameOrObj.id.replace(/:/g, '\\\\:')}`));
    if (seatNameOrObj['data-seat']) locators.push(page.locator(`[data-seat="${seatNameOrObj['data-seat']}"]`));
    if (seatNameOrObj.title) locators.push(page.getByTitle(seatNameOrObj.title, { exact: true }));
    if (seatNameOrObj['aria-label']) locators.push(page.getByLabel(seatNameOrObj['aria-label'], { exact: true }));
    if (seatNameOrObj.textContent) locators.push(page.getByText(seatNameOrObj.textContent, { exact: true }));
  }
  
  // General Fallbacks
  locators.push(page.getByRole('button', { name: name, exact: true }));
  locators.push(page.getByLabel(name, { exact: true }));
  locators.push(page.getByTitle(name, { exact: true }));
  locators.push(page.locator(`[data-seat="${name}"]`));
  locators.push(page.locator(`text="${name}"`));

  for (const locator of locators) {
    try {
      if (await locator.count() > 0) {
        const el = locator.first();
        // Use native DOM click to completely bypass Playwright's visibility/size checks
        await el.evaluate(node => node.click());
        console.log(`✅ Clicked seat ${name} using locator strategy.`);
        return true;
      }
    } catch (e) {
      console.log(`[Debug] Click failed for locator: ${e.message.split('\n')[0]}`);
    }
  }
  return false;
}


const currentlyHeldSeats = new Set(); // Global Set to track seats we currently own
let watcherWorkerCounter = 0;

// Utility to clear popups (like "בחירת כסאות לא מאושרת!")
async function squashPopups(page) {
  try {
    const popupButtons = [
      page.getByRole('button', { name: 'אישור', exact: true }),
      page.locator('text="אישור"'),
      page.locator('button:has-text("אישור")')
    ];
    
    for (const btn of popupButtons) {
      if (await btn.count() > 0 && await btn.first().isVisible()) {
        console.log('[SQUASH] 🐛 Found popup! Clicking "אישור" to close it.');
        await btn.first().click({ force: true, timeout: 500 });
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    // Ignore errors, popup might have disappeared or doesn't exist
  }
}

function chunkSeats(seats, limit) {
  const chunks = [];
  for (let i = 0; i < seats.length; i += limit) {
    chunks.push(seats.slice(i, i + limit));
  }
  return chunks;
}

// A single worker lifecycle: Open -> Select -> Hold 8 Mins -> Close (Release)
async function runWorker(browser, chunk) {
  watcherWorkerCounter++;
  const workerId = watcherWorkerCounter;
  
  console.log(`\n[WORKER ${workerId}] Launching fresh session for ${chunk.length} seats...`);
  
  // Mark seats as held so Watcher ignores them
  chunk.forEach(s => currentlyHeldSeats.add(s.name || s));

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);

  try {
    await page.goto(config.url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    if (global.stopRequested) {
      await context.close();
      return;
    }

    let allSelected = true;
    for (const seat of chunk) {
      const seatName = typeof seat === 'string' ? seat : seat.name;
      const success = await trySelectSeat(page, seat);
      if (!success) {
        console.error(`[WORKER ${workerId}] ❌ ERROR: Seat ${seatName} could not be selected!`);
        allSelected = false;
      }
      
      await squashPopups(page); // Clear any popup that appears right after clicking a seat
      await page.waitForTimeout(150);
    }

    if (config.autoContinue) {
      await squashPopups(page); // Extra check before continue
      
      const continueLocators = [
        page.getByRole('button', { name: /המשך לתשלום/i }),
        page.getByRole('button', { name: /המשך/i }),
        page.getByText(/המשך לתשלום/i),
        page.getByText(/המשך/i),
        page.locator('button:has-text("המשך לתשלום")'),
        page.locator('button:has-text("המשך")'),
        page.locator('.continue-btn')
      ];

      let continueFound = false;
      for (const locator of continueLocators) {
        try {
          if (await locator.count() > 0 && await locator.first().isVisible()) {
            await locator.first().click();
            continueFound = true;
            break;
          }
        } catch (e) {}
      }

      if (continueFound) {
         console.log(`[WORKER ${workerId}] ✅ Locked tickets. Checkout page reached.`);
      }
      
      await squashPopups(page); // Check if continue threw a popup
    }

    console.log(`[WORKER ${workerId}] ⏱️ Holding tickets for ${config.holdTimerMinutes} minutes...`);
    
    // Hold Timer Loop
    const waitMs = config.holdTimerMinutes * 60 * 1000;
    const intervalMs = 1000; 
    for (let i = 0; i < waitMs; i += intervalMs) {
      if (global.stopRequested) break;
      await page.waitForTimeout(intervalMs);
    }

    // After timer expires or cancel requested: CLOSE context to release tickets
    console.log(`[WORKER ${workerId}] 🧹 Timer finished or Cancelled! Releasing ${chunk.length} seats back to the wild.`);
    chunk.forEach(s => currentlyHeldSeats.delete(s.name || s));
    await context.close();

  } catch (err) {
    console.error(`[WORKER ${workerId}] Unexpected error:`, err);
    // On crash, free the seats so Watcher can try again
    chunk.forEach(s => currentlyHeldSeats.delete(s.name || s));
    await context.close();
  }
}

// The continuous background watcher that looks for newly freed seats
async function startWatcher(masterBrowser) {
  console.log('\n👀 Watcher is awake! Setting up monitoring post...');
  const watcherContext = await masterBrowser.newContext();
  const watcherPage = await watcherContext.newPage();
  watcherPage.setDefaultTimeout(config.timeoutMs);

  while (!global.stopRequested) {
    try {
      // 1. Refresh Map
      await watcherPage.goto(config.url);
      await watcherPage.waitForLoadState('networkidle');
      await watcherPage.waitForTimeout(2000); // Give it time to render
      
      if (global.stopRequested) break;

      // 2. Scan all available seats
      const availableSeats = await scanAvailableSeats(watcherPage);
      
      // 3. Filter out seats we already hold in workers
      let newSeats = [];
      if (config.seats === "all") {
        newSeats = availableSeats.filter(s => !currentlyHeldSeats.has(s.name));
      } else {
        // If user provided a specific list, only grab those if they are available
        const userTargetNames = config.seats.map(s => typeof s === 'string' ? s : s.name);
        newSeats = availableSeats.filter(s => userTargetNames.includes(s.name) && !currentlyHeldSeats.has(s.name));
      }

      // 4. If we found new seats that we don't own, snatch them!
      if (newSeats.length > 0) {
        console.log(`\n👀 WATCHER: Discovered ${newSeats.length} UNCLAIMED SEATS! Sending workers to grab them...`);
        
        const limit = config.maxSeatsPerSession || 10;
        const chunks = chunkSeats(newSeats, limit);
        
        for (let i = 0; i < chunks.length; i++) {
          if (global.stopRequested) break;
          const chunk = chunks[i];
          
          runWorker(masterBrowser, chunk).catch(err => console.error(`Worker error:`, err));
          
          if (i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, config.workerStaggerDelayMs || 2500));
          }
        }
      } else {
        process.stdout.write('.'); // Just print a dot to show watcher is alive
      }

    } catch (e) {
      console.log('\n👀 WATCHER Error (Will retry):', e.message.split('\n')[0]);
    }

    // Sleep before next scan
    const sleepMs = (config.watcherRefreshIntervalSec || 30) * 1000;
    for (let i = 0; i < sleepMs; i += 1000) {
      if (global.stopRequested) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n👀 WATCHER shutting down.');
  await watcherContext.close();
}

async function runAll() {
  global.stopRequested = false;

  if (config.testMode) {
    console.log('🚨 Please turn off testMode in config.js for the Watcher architecture!');
    return;
  }

  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.on('line', (input) => {
    if (input.trim().toLowerCase() === 'cancel' || input.trim() === 'ביטול') {
      console.log('\n🚨 CANCEL COMMAND RECEIVED! 🚨');
      console.log('Stopping watcher and telling all workers to release their tickets...');
      global.stopRequested = true;
      rl.close();
    }
  });

  console.log('=== CONTINUOUS WATCHER ARCHITECTURE ===');
  console.log('Launching MASTER browser...');
  const masterBrowser = await chromium.launch({ headless: false, slowMo: 100 });

  // Start the infinite watcher loop (blocks until cancel)
  await startWatcher(masterBrowser);

  console.log('\nAll windows are closing. Bot completely stopped.');
  await masterBrowser.close();
}

runAll().catch(console.error);

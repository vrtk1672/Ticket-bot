module.exports = {
  // Paste the ticket page link here
  url: "https://ecom.biggerpicture.ai/site/1292/seats",

  // Write the seat names exactly as they appear on the website, or use "all" to select every available seat
  seats: "all",

  // Maximum time to wait for elements
  timeoutMs: 60000,

  // Keep true so the bot stops before payment
  stopBeforePayment: true,

  // --- SCALING & CHUNKING (For 10-seat limits) ---
  maxSeatsPerSession: 10,
  workerStaggerDelayMs: 2500, // wait 2.5 seconds between launching workers
  autoContinue: true, // click the continue button after selecting seats

  // --- CONTINUOUS WATCHER SYSTEM ---
  watcherRefreshIntervalSec: 30, // Scan the map every 30 seconds for released seats
  holdTimerMinutes: 8, // Worker holds seats for 8 mins, then closes to let watcher recapture

  // --- SAFE SEAT-CONTROL TEST MODE ---
  testMode: false,

  // "scan-only", "s=דcan-and-sample", "click-and-deselect-each"
  testModeBehavior: "scan-and-sample",

  // Max seats to test (hard limited to 20 for safety)
  sampleSeatsLimit: 3,

  continueAfterSelection: false
};

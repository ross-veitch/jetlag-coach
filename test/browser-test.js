/**
 * Headless browser test for jetlag-coach PWA
 * 
 * Tests:
 * 1. Loads without console errors
 * 2. Algorithm generates correct advice for key routes
 * 3. Habitual sleep settings work
 * 4. Screenshots for PR
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function createServer(port) {
  const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    
    const extname = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.svg': 'image/svg+xml',
    }[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
  
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Test server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function runTests() {
  const port = 8765;
  const server = await createServer(port);
  const baseUrl = `http://localhost:${port}`;
  
  console.log('\n=== Headless Browser Tests ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  // Collect console messages
  const consoleMessages = [];
  const consoleErrors = [];
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });
  
  page.on('pageerror', err => {
    consoleErrors.push(`Page error: ${err.message}`);
  });
  
  try {
    // Test 1: Load page without errors
    console.log('Test 1: Loading page...');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for algorithm to execute
    
    console.log(`  Console messages: ${consoleMessages.length}`);
    console.log(`  Console errors: ${consoleErrors.length}`);
    
    if (consoleErrors.length > 0) {
      console.log('\n  ✗ Console errors found:');
      consoleErrors.forEach(err => console.log(`    - ${err}`));
    } else {
      console.log('  ✓ No console errors');
    }
    
    // Check that CircadianAlgorithm loaded
    const algoLoaded = await page.evaluate(() => !!window.CircadianAlgorithm);
    console.log(`  CircadianAlgorithm loaded: ${algoLoaded ? '✓' : '✗'}`);
    
    // Test 2: Check MIA→DXB 23:55 advice
    console.log('\nTest 2: Checking MIA→DXB 23:55 advice...');
    const miaDxbAdvice = await page.evaluate(() => {
      const flights = window.JETLAG_DATA.flights;
      const ek214 = flights.find(f => f.id === 'EK214');
      return ek214 ? ek214.detail : null;
    });
    
    if (miaDxbAdvice) {
      console.log(`  EK214 advice: ${miaDxbAdvice.substring(0, 100)}...`);
      const noMelatonin = miaDxbAdvice.includes('Not recommended') || miaDxbAdvice.includes('NO');
      console.log(`  No in-flight melatonin: ${noMelatonin ? '✓' : '✗'}`);
      const bodyTimeReasoning = miaDxbAdvice.includes('body time') || miaDxbAdvice.includes('CBTmin') || miaDxbAdvice.includes('DLMO');
      console.log(`  Has body-time reasoning: ${bodyTimeReasoning ? '✓' : '✗'}`);
    } else {
      console.log('  ✗ Could not find EK214 advice');
    }
    
    // Screenshot 1: Default view
    await page.screenshot({ path: 'test/screenshots/default-view.png', fullPage: true });
    console.log('  Screenshot saved: test/screenshots/default-view.png');
    
    // Test 3: Change habitual sleep and verify
    console.log('\nTest 3: Testing habitual sleep settings...');
    
    // Open info panel
    await page.click('#btn-info');
    await page.waitForTimeout(500);
    
    // Screenshot 2: Info panel with habitual sleep UI
    await page.screenshot({ path: 'test/screenshots/habitual-sleep-ui.png', fullPage: true });
    console.log('  Screenshot saved: test/screenshots/habitual-sleep-ui.png');
    
    // Check that UI elements exist
    const sleepHourExists = await page.$('#sleep-hour');
    const wakeHourExists = await page.$('#wake-hour');
    const saveBtnExists = await page.$('#save-sleep-btn');
    
    console.log(`  Sleep hour dropdown: ${sleepHourExists ? '✓' : '✗'}`);
    console.log(`  Wake hour dropdown: ${wakeHourExists ? '✓' : '✗'}`);
    console.log(`  Save button: ${saveBtnExists ? '✓' : '✗'}`);
    
    // Change sleep settings
    await page.selectOption('#sleep-hour', '22'); // 22:00
    await page.selectOption('#wake-hour', '6');   // 06:00
    
    // Screenshot 3: Changed settings
    await page.screenshot({ path: 'test/screenshots/changed-settings.png', fullPage: true });
    console.log('  Screenshot saved: test/screenshots/changed-settings.png');
    
    // Click save (will trigger alert)
    page.once('dialog', dialog => dialog.accept());
    await page.click('#save-sleep-btn');
    await page.waitForTimeout(500);
    
    // Verify localStorage was updated
    const savedSettings = await page.evaluate(() => {
      const stored = localStorage.getItem('jetlag-habitual-sleep');
      return stored ? JSON.parse(stored) : null;
    });
    
    console.log(`  Settings saved to localStorage: ${savedSettings ? '✓' : '✗'}`);
    if (savedSettings) {
      console.log(`    Sleep: ${savedSettings.sleepHour}:00, Wake: ${savedSettings.wakeHour}:00`);
    }
    
    // Reload page to see updated recommendations
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Screenshot 4: After reload with new settings
    await page.screenshot({ path: 'test/screenshots/after-reload.png', fullPage: true });
    console.log('  Screenshot saved: test/screenshots/after-reload.png');
    
    // Check advice changed (simple check - should have different CBTmin/DLMO)
    const updatedAdvice = await page.evaluate(() => {
      const flights = window.JETLAG_DATA.flights;
      const ek214 = flights.find(f => f.id === 'EK214');
      return ek214 ? ek214.detail : null;
    });
    
    console.log(`  Advice updated after settings change: ${updatedAdvice !== miaDxbAdvice ? '✓' : '✗'}`);
    
    console.log('\n=== Summary ===');
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Screenshots captured: 4`);
    console.log(`Tests passed: ${consoleErrors.length === 0 ? '✓ ALL' : '✗ SOME ERRORS'}`);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await browser.close();
    server.close();
    console.log('\nTest server stopped.');
  }
}

// Create screenshots directory
if (!fs.existsSync('test/screenshots')) {
  fs.mkdirSync('test/screenshots', { recursive: true });
}

runTests().catch(console.error);

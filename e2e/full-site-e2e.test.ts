import { test, expect } from '@playwright/test';

const BASE_URL = 'https://poverty-analysis-reducti.vercel.app';

test.describe('Poverty Analysis Reduction - Full Site E2E Tests', () => {

  test('Home / Poverty Analysis dashboard loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => { errors.push(err.message); });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    
    console.log(`Home URL: ${url}`);
    console.log(`Home Title: ${title}`);
    console.log(`Home Body length: ${bodyText.length}`);
    console.log(`Home Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e.slice(0, 200)}`));

    // Should not be blank
    expect(bodyText.length).toBeGreaterThan(100);
    // Should not show Supabase not configured error
    expect(bodyText).not.toContain('Supabase is not configured');
    // Should show dashboard content
    expect(bodyText).toContain('Poverty Analysis');
  });

  test('Login page shows all 10 role buttons without Supabase login', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const buttons = [
      'Platform Admin', 'NISR Analyst', 'Programme Account', 'Cooperative',
      'District Officer', 'Sector Leader', 'Cell Leader', 'Field Agent',
      'Program Member', 'Job Applicant',
    ];

    for (const label of buttons) {
      const count = await page.getByText(label).count();
      console.log(`Button "${label}": ${count} found`);
      expect(count).toBeGreaterThan(0);
    }

    // Check no Supabase not configured error
    const bodyText = await page.locator('body').innerText();
    console.log(`Login Body length: ${bodyText.length}`);
    console.log(`Login Console errors: ${errors.length}`);
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText).not.toContain('Supabase is not configured');
  });

  test('AI Engine page loads without blank page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => { errors.push(err.message); });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click Platform Admin to get demo access
    await page.getByText('Platform Admin').click();
    await page.waitForTimeout(3000);

    // Navigate to AI Engine
    await page.goto(`${BASE_URL}/ai-engine`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const url = page.url();
    const title = await page.title();
    const bodyText = await page.locator('body').innerText();
    const html = await page.locator('body').innerHTML();

    console.log(`AI Engine URL: ${url}`);
    console.log(`AI Engine Title: ${title}`);
    console.log(`AI Engine Body length: ${bodyText.length}`);
    console.log(`AI Engine HTML length: ${html.length}`);
    console.log(`AI Engine Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e.slice(0, 200)}`));

    expect(url).not.toContain('/login');
    expect(bodyText.length).toBeGreaterThan(500);
    expect(html).not.toBe('<div id="root"></div>');
    expect(bodyText).not.toContain('Supabase is not configured');
    expect(bodyText).toContain('AI Engine');
  });

  test('Evidence & lineage page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.getByText('Platform Admin').click();
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/ai-engine?section=evidence`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText();
    console.log(`Evidence Body length: ${bodyText.length}`);
    console.log(`Evidence Console errors: ${errors.length}`);
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText).not.toContain('Supabase is not configured');
  });

  test('Financial Inclusion page loads without Supabase error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE_URL}/financial-inclusion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText();
    console.log(`Financial Inclusion Body length: ${bodyText.length}`);
    console.log(`Financial Inclusion Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e.slice(0, 200)}`));
    
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText).not.toContain('Supabase is not configured');
  });

  test('Data upload page loads without Supabase error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE_URL}/data-upload`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const bodyText = await page.locator('body').innerText();
    console.log(`Data Upload Body length: ${bodyText.length}`);
    console.log(`Data Upload Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e.slice(0, 200)}`));
    
    expect(bodyText.length).toBeGreaterThan(100);
    expect(bodyText).not.toContain('Supabase is not configured');
  });

  test('Governed API is reachable without auth', async ({ page }) => {
    const response = await page.request.get('https://ireme-governed-api.fly.dev/v1/admin/bypass/status');
    console.log(`API bypass status: ${response.status()}`);
    const body = await response.json();
    console.log(`API body:`, body);
    expect(response.status()).toBe(200);
    expect(body.profile).toBe('HACKATHON_DEMO');
  });

  test('All major navigation links work', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.getByText('Platform Admin').click();
    await page.waitForTimeout(3000);

    const pages = [
      '/',
      '/ai-engine',
      '/ai-engine?section=evidence',
      '/financial-inclusion',
      '/data-upload',
      '/national-goals',
      '/programmes',
    ];

    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      console.log(`Page ${path}: body length ${bodyText.length}`);
      expect(bodyText.length).toBeGreaterThan(50);
    }
    console.log(`Total Console errors: ${errors.length}`);
  });
});

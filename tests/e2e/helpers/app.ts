import { expect, type Page } from '@playwright/test';
import { appLocators, RX, type WorkspaceTabId } from './locators';
import { createTestPngBuffer } from './media';

export const DEFAULT_OFFER =
  'Promosi Minggu Gaji: Diskaun 20% untuk pelanggan terawal, stok & slot terhad — WhatsApp sekarang.';

export async function gotoFreshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

export async function completeOnboarding(
  page: Page,
  options?: { useDemoMode?: boolean; apiKey?: string; forceBuiltInAi?: boolean },
): Promise<void> {
  const loc = appLocators(page);

  const alreadyOnWorkbench = await loc.vault.root.isVisible().catch(() => false);
  if (alreadyOnWorkbench) {
    if (!options?.useDemoMode && !options?.apiKey && !options?.forceBuiltInAi) {
      return;
    }
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible({ timeout: 5_000 });
    if (options?.useDemoMode) {
      await loc.onboarding.demoBtn.click();
    } else if (options?.apiKey) {
      await loc.onboarding.byokInput.fill(options.apiKey);
      await loc.onboarding.byokSaveBtn.click();
    } else {
      await loc.onboarding.useBuiltInBtn.click();
    }
    await expect(loc.onboarding.settingsModal).toHaveCount(0, { timeout: 5_000 });
    await expect(loc.vault.root).toBeVisible({ timeout: 10_000 });
    return;
  }

  await expect(loc.onboarding.googleLoginBtn).toBeVisible({ timeout: 10_000 });
  await loc.onboarding.googleLoginBtn.click();
  await expect(loc.onboarding.sessionBadge).toBeVisible({ timeout: 5_000 });

  if (options?.useDemoMode) {
    await loc.onboarding.demoBtn.click();
  } else if (options?.forceBuiltInAi) {
    await loc.onboarding.useBuiltInBtn.click();
  } else {
    const key = options?.apiKey ?? 'sk-live-test-key-123456';
    await loc.onboarding.byokInput.fill(key);
    await loc.onboarding.byokSaveBtn.click();
  }

  // Some UIs transition directly on Save/Demo, others show a Continue button
  const hasWorkspaceYet = await loc.vault.root.isVisible().catch(() => false);
  if (!hasWorkspaceYet) {
    const continueVisible = await loc.onboarding.continueBtn.isVisible().catch(() => false);
    if (continueVisible) {
      await loc.onboarding.continueBtn.click();
    }
  }

  await expect(loc.vault.root).toBeVisible({ timeout: 10_000 });
}

export async function setBrandTone(
  page: Page,
  tone: 'casual' | 'professional',
): Promise<void> {
  const loc = appLocators(page);
  if (await loc.vault.toneSelect.isVisible().catch(() => false)) {
    await loc.vault.toneSelect.selectOption(tone);
    return;
  }
  if (tone === 'professional') {
    await loc.vault.toneProfessionalBtn.click();
  } else {
    await loc.vault.toneCasualBtn.click();
  }
}

export async function saveBrandIfButtonVisible(page: Page): Promise<void> {
  const loc = appLocators(page);
  if (await loc.vault.saveBtn.isVisible().catch(() => false)) {
    await loc.vault.saveBtn.click();
  }
}

export async function createBrandFolder(
  page: Page,
  brand: {
    name: string;
    colorHex?: string;
    tone?: 'casual' | 'professional';
    whatsapp?: string;
    logoRgba?: [number, number, number, number];
  },
): Promise<void> {
  const loc = appLocators(page);

  const inlineNewNameVisible = await loc.vault.newNameInput.isVisible().catch(() => false);
  if (inlineNewNameVisible) {
    await loc.vault.newNameInput.fill(brand.name);
    await loc.vault.createBtn.click();
    await expect(loc.vault.folderButton(brand.name)).toBeVisible({ timeout: 5_000 });
    await loc.vault.folderButton(brand.name).click();
  } else {
    await loc.vault.createBtn.click();
    await loc.vault.nameInput.fill(brand.name);
  }

  if (brand.logoRgba) {
    const png = createTestPngBuffer({
      width: 64,
      height: 64,
      rgba: brand.logoRgba,
      stripeRgba: [255, 255, 255, 255],
    });
    await loc.vault.logoInput.setInputFiles({
      name: `${brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-logo.png`,
      mimeType: 'image/png',
      buffer: png,
    });
    await expect
      .poll(
        async () =>
          loc.vault.logoPreview.evaluate((img: HTMLImageElement) =>
            (img.currentSrc || img.src || '').startsWith('data:image/png'),
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    if (await loc.vault.saveBtn.isVisible().catch(() => false)) {
      await expect(loc.vault.saveBtn).toBeEnabled({ timeout: 5_000 });
    }
  }

  if (brand.colorHex) {
    await loc.vault.colorInput.fill(brand.colorHex);
  }

  if (brand.tone) {
    await setBrandTone(page, brand.tone);
  }

  if (brand.whatsapp) {
    await loc.vault.whatsappInput.fill(brand.whatsapp);
  }

  await saveBrandIfButtonVisible(page);
  await expect(loc.vault.folderButton(brand.name)).toBeVisible({ timeout: 5_000 });
}

export async function ensureTwoSamplePhotosAttached(page: Page): Promise<void> {
  const loc = appLocators(page);

  const slot1Img = loc.quickForm.photoSlot1.locator('img');
  const slot1HasImg = (await slot1Img.count()) > 0;
  if (!slot1HasImg && (await loc.quickForm.photo1SampleBtn.isVisible().catch(() => false))) {
    await loc.quickForm.photo1SampleBtn.click();
  }

  const slot2Img = loc.quickForm.photoSlot2.locator('img');
  const slot2HasImg = (await slot2Img.count()) > 0;
  if (!slot2HasImg && (await loc.quickForm.photo2SampleBtn.isVisible().catch(() => false))) {
    await loc.quickForm.photo2SampleBtn.click();
  }
}

export async function launchCampaign(
  page: Page,
  options?: {
    brandName?: string;
    offerSentence?: string;
    uspAndAudience?: string;
    attachSamplePhotos?: boolean;
  },
): Promise<void> {
  const loc = appLocators(page);

  if (options?.brandName) {
    const selectEl = loc.quickForm.brandSelect;
    const tagName = await selectEl.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'select');
    if (tagName === 'select') {
      const optionValue = await selectEl.evaluate((el: HTMLSelectElement, targetName: string) => {
        const opt = Array.from(el.options).find((o) =>
          o.text.toLowerCase().includes(targetName.toLowerCase()),
        );
        return opt ? opt.value : null;
      }, options.brandName);
      if (optionValue) {
        await selectEl.selectOption(optionValue);
      } else {
        await selectEl.selectOption({ label: options.brandName });
      }
    } else {
      await loc.vault.folderButton(options.brandName).click();
    }
  }

  if (options?.attachSamplePhotos ?? true) {
    await ensureTwoSamplePhotosAttached(page);
  }

  const offer = options?.offerSentence ?? DEFAULT_OFFER;
  await loc.quickForm.offerInput.fill(offer);
  if (options?.uspAndAudience !== undefined) {
    await loc.quickForm.uspAudienceInput.fill(options.uspAndAudience);
  }
  await loc.quickForm.launchBtn.click();

  await expect(loc.workspaceTabs).toBeVisible({ timeout: 10_000 });
}

export async function openTab(page: Page, tab: WorkspaceTabId): Promise<void> {
  const loc = appLocators(page);
  await loc.tabButton(tab).click();
  if (tab === 'strategy') {
    await expect(loc.tab1.psychologyPanel).toBeVisible({ timeout: 8_000 });
  } else if (tab === 'carousel') {
    await expect(loc.tab2.downloadPngBtn).toBeVisible({ timeout: 8_000 });
  } else if (tab === 'jingle') {
    await expect(loc.tab3.lyricsInput).toBeVisible({ timeout: 8_000 });
  } else if (tab === 'video') {
    await expect(loc.tab4.frameCard(1)).toBeVisible({ timeout: 8_000 });
  }
}

export async function toggleLanguage(
  page: Page,
  targetLocale?: 'ms' | 'en',
): Promise<void> {
  const loc = appLocators(page);
  const msVisible = await loc.langMsBtn.isVisible().catch(() => false);
  const enVisible = await loc.langEnBtn.isVisible().catch(() => false);

  if (msVisible && enVisible) {
    if (targetLocale === 'ms') {
      await loc.langMsBtn.click();
      return;
    }
    if (targetLocale === 'en') {
      await loc.langEnBtn.click();
      return;
    }
    const isMsActive = await page.evaluate(() => {
      const msBtn = document.querySelector('[data-testid="lang-ms"]');
      const enBtn = document.querySelector('[data-testid="lang-en"]');
      if (msBtn && enBtn) {
        if (msBtn.getAttribute('aria-pressed') === 'true') return true;
        if (enBtn.getAttribute('aria-pressed') === 'true') return false;
        const msCls = msBtn.className || '';
        const enCls = enBtn.className || '';
        if (msCls.includes('bg-slate-100') && !enCls.includes('bg-slate-100')) return true;
        if (enCls.includes('bg-slate-100') && !msCls.includes('bg-slate-100')) return false;
      }
      const nav = document.querySelector('[data-testid="nav-workbench"]')?.textContent ?? '';
      if (/Ruang Kempen/i.test(nav)) return true;
      if (/Campaign Studio/i.test(nav)) return false;
      return document.documentElement.lang !== 'en';
    });
    if (isMsActive) {
      await loc.langEnBtn.click();
    } else {
      await loc.langMsBtn.click();
    }
    return;
  }

  await expect(loc.langToggle).toBeVisible();
  await loc.langToggle.click();
}

export async function confirmStoryboard(page: Page): Promise<void> {
  const loc = appLocators(page);
  const checkbox = loc.tab4.confirmCheckbox;
  if (await checkbox.isVisible().catch(() => false)) {
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  } else if (await loc.tab4.confirmBtn.isVisible().catch(() => false)) {
    await loc.tab4.confirmBtn.click();
  }
  await expect(loc.tab4.generateBtn).toBeEnabled({ timeout: 5_000 });
}

export async function getActiveTabLanguageSnapshot(page: Page): Promise<{
  strategyLabel: string;
  carouselLabel: string;
  jingleLabel: string;
  videoLabel: string;
  launchBtnLabel: string;
}> {
  const loc = appLocators(page);
  return {
    strategyLabel: (await loc.tabButton('strategy').innerText()).trim(),
    carouselLabel: (await loc.tabButton('carousel').innerText()).trim(),
    jingleLabel: (await loc.tabButton('jingle').innerText()).trim(),
    videoLabel: (await loc.tabButton('video').innerText()).trim(),
    launchBtnLabel: (await loc.quickForm.launchBtn.innerText()).trim(),
  };
}

export function assertBilingualLabelSwitched(before: string, after: string): void {
  expect(after.trim()).not.toBe('');
  expect(after.trim()).not.toEqual(before.trim());
}

export function assertWhatsAppUrl(
  href: string | null,
  expectedDigits: string,
  expectedAngleTag?: RegExp,
): void {
  expect(href, 'WhatsApp href must be present').toBeTruthy();
  const parsed = new URL(href!);
  expect(parsed.protocol).toBe('https:');
  expect(parsed.hostname).toBe('wa.me');
  expect(parsed.pathname.replace(/^\//, '')).toBe(expectedDigits);
  const textParam = parsed.searchParams.get('text') ?? '';
  expect(textParam.length).toBeGreaterThan(10);
  if (expectedAngleTag) {
    expect(textParam).toMatch(expectedAngleTag);
  }
}

export function extractRsaItems(cardText: string): {
  headlines: string[];
  descriptions: string[];
} {
  const lines = cardText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    headlines: lines.filter((l) => l.length > 0 && l.length <= 35),
    descriptions: lines.filter((l) => l.length > 35 && l.length <= 100),
  };
}

export { RX };

import { expect, test } from '@playwright/test';
import {
  assertBilingualLabelSwitched,
  assertWhatsAppUrl,
  completeOnboarding,
  confirmStoryboard,
  createBrandFolder,
  DEFAULT_OFFER,
  getActiveTabLanguageSnapshot,
  gotoFreshApp,
  launchCampaign,
  openTab,
  saveBrandIfButtonVisible,
  toggleLanguage,
} from './helpers/app';
import {
  assertNoHorizontalOverflow,
  attachNetworkOriginAuditor,
  attachRuntimeErrorCollector,
} from './helpers/layout';
import { appLocators, RX } from './helpers/locators';
import {
  assertPngBytesChanged,
  assertPngBytesIdentical,
  assertValidAudioFileOrBuffer,
  assertValidSlidePng,
  assertValidVerticalVideoFile,
  captureDownload,
  createTestPngBuffer,
  verifyAudioElement,
  verifyVideoElement,
} from './helpers/media';

test.describe('Tier 2 — A1: Onboarding Boundaries (6 Tests)', () => {
  test('T2-A1-01: Empty BYOK key submission without Demo mode', async ({ page }) => {
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await loc.onboarding.byokInput.fill('   ');
    await loc.onboarding.byokSaveBtn.click();

    await expect(loc.vault.root).toHaveCount(0);
    await expect(loc.onboarding.byokError).toBeVisible();
  });

  test('T2-A1-02: Malformed BYOK key format', async ({ page }) => {
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await loc.onboarding.byokInput.fill('bad-key-123');
    await loc.onboarding.byokSaveBtn.click();

    await expect(loc.vault.root).toHaveCount(0);
    await expect(loc.onboarding.byokError).toBeVisible();
    await expect(loc.onboarding.byokError).toContainText(/AIza|format|tidak sah|invalid/i);
  });

  test('T2-A1-03: Demo / Offline Mode entry without any API key', async ({ page }) => {
    const net = attachNetworkOriginAuditor(page);
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await loc.onboarding.demoBtn.click();
    if (await loc.onboarding.continueBtn.isVisible().catch(() => false)) {
      await loc.onboarding.continueBtn.click();
    }

    await expect(loc.vault.root).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('header, main').filter({ hasText: /Demo|Mod Demo|Offline/i }).first()
    ).toBeVisible();
    await expect(loc.onboarding.demoBadge).toBeVisible();
    net.assertSameOriginAndHealthy();
    net.detach();
  });

  test('T2-A1-04: BYOK input show/hide visibility toggle', async ({ page }) => {
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await loc.onboarding.byokInput.fill('AIzaSySecretKeyTest999');
    expect(await loc.onboarding.byokInput.getAttribute('type')).toBe('password');

    await loc.onboarding.byokVisibilityBtn.click();
    expect(await loc.onboarding.byokInput.getAttribute('type')).toBe('text');
    await expect(loc.onboarding.byokInput).toHaveValue('AIzaSySecretKeyTest999');

    await loc.onboarding.byokVisibilityBtn.click();
    expect(await loc.onboarding.byokInput.getAttribute('type')).toBe('password');
    await expect(loc.onboarding.byokInput).toHaveValue('AIzaSySecretKeyTest999');
  });

  test('T2-A1-05: Skip Google Login attempt keeps dashboard gated', async ({ page }) => {
    await gotoFreshApp(page);
    const loc = appLocators(page);

    const demoVisible = await loc.onboarding.demoBtn.isVisible().catch(() => false);
    if (demoVisible) {
      const enabled = await loc.onboarding.demoBtn.isEnabled().catch(() => false);
      if (enabled) {
        await loc.onboarding.demoBtn.click();
      }
    }
    const saveVisible = await loc.onboarding.byokSaveBtn.isVisible().catch(() => false);
    if (saveVisible) {
      const enabled = await loc.onboarding.byokSaveBtn.isEnabled().catch(() => false);
      if (enabled) {
        await loc.onboarding.byokInput.fill('AIzaSyDemoTestKey1234567890');
        await loc.onboarding.byokSaveBtn.click();
      }
    }

    await expect(loc.vault.root).toHaveCount(0);
    await expect(loc.onboarding.googleLoginBtn).toBeVisible();
  });

  test('T2-A1-06: Revisit BYOK settings mid-campaign preserves active campaign', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: false });
    const offer = 'Tawaran Khas Kekal 123';
    await launchCampaign(page, { offerSentence: offer });

    const loc = appLocators(page);
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await loc.onboarding.settingsCloseBtn.click();

    await expect(loc.quickForm.offerInput).toHaveValue(offer);
    await expect(loc.workspaceTabs).toBeVisible();
  });
});

test.describe('Tier 2 — A2: Brand Vault Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
  });

  test('T2-A2-01: Invalid WhatsApp formatting rejected', async ({ page }) => {
    const loc = appLocators(page);
    await loc.vault.folderButton('Klinik Gigi Impian').click();

    await loc.vault.whatsappInput.fill('abc-not-a-phone');
    await saveBrandIfButtonVisible(page);
    await expect(loc.vault.errorMsg).toBeVisible();

    await loc.vault.whatsappInput.fill('123');
    await saveBrandIfButtonVisible(page);
    await expect(loc.vault.errorMsg).toBeVisible();
  });

  test('T2-A2-02: Malaysian WhatsApp normalization variations', async ({ page }) => {
    const loc = appLocators(page);
    await loc.vault.folderButton('Klinik Gigi Impian').click();

    for (const raw of ['+60 12-345 6789', '012-345 6789', '60123456789']) {
      await loc.vault.whatsappInput.fill(raw);
      await saveBrandIfButtonVisible(page);
      await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
      const href = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
      assertWhatsAppUrl(href, '60123456789');
    }
  });

  test('T2-A2-03: Empty/whitespace brand folder name rejection', async ({ page }) => {
    const loc = appLocators(page);
    const countBefore = await loc.vault.root.locator('[data-testid^="brand-folder-"]').count();

    if (await loc.vault.newNameInput.isVisible().catch(() => false)) {
      await loc.vault.newNameInput.fill('   ');
      await loc.vault.createBtn.click();
    } else {
      await loc.vault.createBtn.click();
      await loc.vault.nameInput.fill('   ');
      await loc.vault.whatsappInput.fill('0123456789');
      await saveBrandIfButtonVisible(page);
    }

    await expect(loc.vault.errorMsg).toBeVisible();
    if (countBefore > 0) {
      expect(await loc.vault.root.locator('[data-testid^="brand-folder-"]').count()).toBe(countBefore);
    }
  });

  test('T2-A2-04: Duplicate or special-character brand folder name renders safely', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);
    const specialName = 'Klinik & Co <1>';

    await createBrandFolder(page, {
      name: specialName,
      whatsapp: '0175551234',
      colorHex: '#0EA5E9',
    });

    await launchCampaign(page, { brandName: specialName, offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
    await expect(loc.tab2.previewStage).toContainText(specialName);
    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toContain(specialName);
    errors.assertClean();
    errors.detach();
  });

  test('T2-A2-05: Non-PNG / invalid image upload rejection', async ({ page }) => {
    const loc = appLocators(page);
    await loc.vault.folderButton('Klinik Gigi Impian').click();
    const prevSrc = await loc.vault.logoPreview.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);

    await loc.vault.logoInput.setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('plain text payload', 'utf8'),
    });

    await expect(loc.vault.errorMsg).toBeVisible();
    const afterSrc = await loc.vault.logoPreview.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(afterSrc).toBe(prevSrc);
  });

  test('T2-A2-06: Persistence across browser reload', async ({ page }) => {
    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Klinik Senyum',
      colorHex: '#EC4899',
      tone: 'professional',
      whatsapp: '016-333 9988',
      logoRgba: [236, 72, 153, 255],
    });

    await page.reload();
    await expect(loc.vault.folderButton('Klinik Senyum')).toBeVisible({ timeout: 10_000 });
    await expect(loc.vault.folderButton('Klinik Gigi Impian')).toBeVisible();

    await loc.vault.folderButton('Klinik Senyum').click();
    expect((await loc.vault.colorInput.inputValue()).toLowerCase()).toBe('#ec4899');
    await expect(loc.vault.whatsappInput).toHaveValue(/60163339988|016[- ]?333\s?9988/);
  });
});

test.describe('Tier 2 — A3: Quick Launch Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
  });

  test('T2-A3-01: Empty offer sentence validation blocks launch', async ({ page }) => {
    const loc = appLocators(page);
    await loc.quickForm.offerInput.fill('');
    await loc.quickForm.launchBtn.click();

    await expect(loc.quickForm.errorMsg).toBeVisible();
    await expect(loc.workspaceTabs).toHaveCount(0);
  });

  test('T2-A3-02: Whitespace-only offer sentence validation blocks launch', async ({ page }) => {
    const loc = appLocators(page);
    await loc.quickForm.offerInput.fill('   \n\t  ');
    await loc.quickForm.launchBtn.click();

    await expect(loc.quickForm.errorMsg).toBeVisible();
    await expect(loc.workspaceTabs).toHaveCount(0);
  });

  test('T2-A3-03: Missing Photo 1 or Photo 2 validation', async ({ page }) => {
    const loc = appLocators(page);
    if (await loc.quickForm.photo2ClearBtn.isVisible().catch(() => false)) {
      await loc.quickForm.photo2ClearBtn.click();
    }
    await loc.quickForm.offerInput.fill(DEFAULT_OFFER);
    await loc.quickForm.launchBtn.click();

    const tabsCount = await loc.workspaceTabs.count();
    if (tabsCount === 0) {
      await expect(loc.quickForm.errorMsg).toBeVisible();
    } else {
      const slot2Img = loc.quickForm.photoSlot2.locator('img');
      expect(await slot2Img.count()).toBeGreaterThan(0);
    }
  });

  test('T2-A3-04: Very long / multi-line offer sentence (>250 chars) stays clean & RSA compliant', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const longOffer =
      'Promosi Scaling & Polish Istimewa Sempena Minggu Gaji! ' +
      'Dapatkan pemeriksaan pergigian menyeluruh bersama doktor berpengalaman di seluruh cawangan kami dengan harga RM99 sahaja sempena hujung bulan ini. Slot sangat terhad untuk 30 pelanggan pertama yang WhatsApp klinik hari ini!';
    expect(longOffer.length).toBeGreaterThan(250);

    await launchCampaign(page, { offerSentence: longOffer });
    const loc = appLocators(page);

    const rsaCard = loc.tab1.channelCard('google_rsa').card;
    const rsaText = await rsaCard.innerText();
    const counters30 = [...rsaText.matchAll(/(\d+)\s*\/\s*30/g)].map((m) => Number(m[1]));
    const counters90 = [...rsaText.matchAll(/(\d+)\s*\/\s*90/g)].map((m) => Number(m[1]));
    expect(counters30.length).toBeGreaterThanOrEqual(3);
    expect(counters90.length).toBeGreaterThanOrEqual(2);
    for (const c of counters30) expect(c).toBeLessThanOrEqual(30);
    for (const c of counters90) expect(c).toBeLessThanOrEqual(90);

    const rsaInputs = rsaCard.locator('input[type="text"], textarea');
    const inputCount = await rsaInputs.count();
    if (inputCount >= 5) {
      for (let i = 0; i < 3; i++) {
        expect((await rsaInputs.nth(i).inputValue()).length).toBeLessThanOrEqual(30);
      }
      for (let i = 3; i < 5; i++) {
        expect((await rsaInputs.nth(i).inputValue()).length).toBeLessThanOrEqual(90);
      }
    }

    await assertNoHorizontalOverflow(page, '390 long offer tab1');
  });

  test('T2-A3-05: Re-launching Bina Kempen with updated offer refreshes all 4 tabs', async ({ page }) => {
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    const updatedOffer = 'Promosi Braces RM999 Deposit Rendah';
    await loc.quickForm.offerInput.fill(updatedOffer);
    await loc.quickForm.launchBtn.click();

    await expect(loc.tab1.root).toContainText(/Braces RM999/i);
    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toMatch(/Braces|RM999/i);
  });

  test('T2-A3-06: Invalid non-image file in Quick Form Photo slot rejected', async ({ page }) => {
    const loc = appLocators(page);
    const prevSrc = await loc.quickForm.photoSlot1
      .locator('img')
      .first()
      .evaluate((img: HTMLImageElement) => img.currentSrc || img.src)
      .catch(() => '');

    await loc.quickForm.photo1Input.setInputFiles({
      name: 'bad-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image', 'utf8'),
    });

    await expect(loc.quickForm.errorMsg).toBeVisible();
    if (prevSrc) {
      const afterMeta = await loc.quickForm.photoSlot1
        .locator('img')
        .first()
        .evaluate((img: HTMLImageElement) => ({
          naturalWidth: img.naturalWidth,
          src: img.currentSrc || img.src,
        }));
      expect(afterMeta.naturalWidth).toBeGreaterThan(0);
      expect(afterMeta.src).toBe(prevSrc);
    }
  });
});

test.describe('Tier 2 — A4: Tab 1 Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
  });

  test('T2-A4-01: Google RSA <=30 headline & <=90 description limits across all 3 angles', async ({ page }) => {
    const loc = appLocators(page);
    for (const angle of ['confidence', 'hygiene', 'payday'] as const) {
      await loc.tab1.angleBtn(angle).click();
      const rsaCard = loc.tab1.channelCard('google_rsa').card;
      const rsaText = await rsaCard.innerText();
      const c30 = [...rsaText.matchAll(/(\d+)\s*\/\s*30/g)].map((m) => Number(m[1]));
      const c90 = [...rsaText.matchAll(/(\d+)\s*\/\s*90/g)].map((m) => Number(m[1]));
      expect(c30.length).toBeGreaterThanOrEqual(3);
      expect(c90.length).toBeGreaterThanOrEqual(2);
      for (const n of c30) expect(n).toBeLessThanOrEqual(30);
      for (const n of c90) expect(n).toBeLessThanOrEqual(90);

      const rsaInputs = rsaCard.locator('input[type="text"], textarea');
      if ((await rsaInputs.count()) >= 5) {
        for (let i = 0; i < 3; i++) {
          expect((await rsaInputs.nth(i).inputValue()).length).toBeLessThanOrEqual(30);
        }
        for (let i = 3; i < 5; i++) {
          expect((await rsaInputs.nth(i).inputValue()).length).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  test('T2-A4-02: Google RSA live edit exceeding 30 / 90 char boundary shows warning', async ({ page }) => {
    const loc = appLocators(page);
    const rsaCard = loc.tab1.channelCard('google_rsa').card;
    const headlineField = rsaCard.locator('input[type="text"], textarea').nth(0);
    await headlineField.fill('12345678901234567890123456789012345'); // 35 chars

    const rsaText = await rsaCard.innerText();
    expect(rsaText).toMatch(/35\s*\/\s*30/);
  });

  test('T2-A4-03: Break-Even CPA status thresholds (Safe -> Caution -> Over Limit)', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.cpa.priceInput.fill('100');
    await loc.tab1.cpa.marginInput.fill('50');
    await loc.tab1.cpa.closeRateInput.fill('50');

    await expect(loc.tab1.cpa.breakEvenValue).toContainText(/RM\s*50(?:\.00)?/);
    await expect(loc.tab1.cpa.maxCplValue).toContainText(/RM\s*25(?:\.00)?/);

    // 0.68x -> Safe (Projected CPA = 17 / 0.50 = RM 34)
    await loc.tab1.cpa.cplInput.fill('17');
    await expect(loc.tab1.cpa.projectedValue).toContainText(/RM\s*34(?:\.00)?/);
    await expect(loc.tab1.cpa.statusBadge).toContainText(RX.cpaSafe);

    // 0.80x -> Caution (Projected CPA = 20 / 0.50 = RM 40)
    await loc.tab1.cpa.cplInput.fill('20');
    await expect(loc.tab1.cpa.projectedValue).toContainText(/RM\s*40(?:\.00)?/);
    await expect(loc.tab1.cpa.statusBadge).toContainText(RX.cpaCaution);

    // 1.20x -> Over Limit (Projected CPA = 30 / 0.50 = RM 60)
    await loc.tab1.cpa.cplInput.fill('30');
    await expect(loc.tab1.cpa.projectedValue).toContainText(/RM\s*60(?:\.00)?/);
    await expect(loc.tab1.cpa.statusBadge).toContainText(RX.cpaOverLimit);
  });

  test('T2-A4-04: Break-Even CPA zero & negative edges never produce NaN or Infinity', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);

    for (const [p, m, cr, cpl] of [
      ['100', '50', '0', '20'],
      ['100', '0', '50', '10'],
      ['100', '50', '100', '0'],
      ['-10', '50', '30', '10'],
    ]) {
      await loc.tab1.cpa.priceInput.fill(p);
      await loc.tab1.cpa.marginInput.fill(m);
      await loc.tab1.cpa.closeRateInput.fill(cr);
      await loc.tab1.cpa.cplInput.fill(cpl);
      const txt = await loc.tab1.cpa.root.innerText();
      expect(txt).not.toMatch(/\bNaN\b|\bInfinity\b/);
      await expect(loc.tab1.cpa.breakEvenValue).toContainText(/RM\s*\d/);
      await expect(loc.tab1.cpa.projectedValue).toContainText(/RM\s*\d/);
    }
    errors.assertClean();
    errors.detach();
  });

  test('T2-A4-05: Meta Personal Attributes + MY Dental/KKLIU compliance triggers', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.compliance.testRiskyBtn.click();
    await expect(loc.tab1.compliance.findings).toBeVisible();

    await loc.tab1.compliance.input.fill(
      'Gigi anda kuning? Klinik terbaik No. 1 dijamin 100% putih sebelum dan selepas!',
    );
    const findingsBm = await loc.tab1.compliance.findings.innerText();
    expect(findingsBm).toMatch(/Meta|Atribut|Personal/i);
    expect(findingsBm).toMatch(/KKLIU|terbaik|dijamin|No\.?\s*1|sebelum/i);

    await loc.tab1.compliance.input.fill('Are you suffering from bad breath? Cheapest dentist!');
    const findingsEn = await loc.tab1.compliance.findings.innerText();
    expect(findingsEn).toMatch(/Meta|Personal Attribute|Atribut Peribadi/i);
    expect(findingsEn).toMatch(/KKLIU|Healthcare|Norma Kesihatan|cheapest|paling murah|superlative/i);
  });

  test('T2-A4-06: Clean rewrite clears flags + per-angle edit isolation', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.compliance.testRiskyBtn.click();
    if (await loc.tab1.compliance.applyRewriteBtn.isVisible().catch(() => false)) {
      await loc.tab1.compliance.applyRewriteBtn.click();
    } else {
      await loc.tab1.compliance.input.fill(
        'Penjagaan penskaleran profesional di Klinik Gigi Impian. No. Kelulusan KKLIU: 1234/2026',
      );
    }

    await expect(loc.tab1.compliance.statusBadge).toContainText(RX.compliancePass);
    const findingsAfter = (await loc.tab1.compliance.findings.innerText().catch(() => '')).trim();
    expect(findingsAfter).not.toMatch(/Meta Personal Attributes|Atribut Peribadi|100%|terbaik|dijamin/i);

    await loc.tab1.angleBtn('confidence').click();
    const fbField1 = loc.tab1.channelCard('facebook').editableField;
    await fbField1.fill('Suntingan Sudut Keyakinan Sahaja');

    await loc.tab1.angleBtn('payday').click();
    const fbField2 = loc.tab1.channelCard('facebook').editableField;
    expect(await fbField2.inputValue()).not.toBe('Suntingan Sudut Keyakinan Sahaja');

    await loc.tab1.angleBtn('confidence').click();
    await expect(loc.tab1.channelCard('facebook').editableField).toHaveValue('Suntingan Sudut Keyakinan Sahaja');
  });
});

test.describe('Tier 2 — A5: Tab 2 Carousel Studio Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
  });

  test('T2-A5-01: Safe-zone 9:16 overlay isolation from exported PNG bytes', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();

    if (await loc.tab2.safeZoneOverlay.isVisible().catch(() => false)) {
      await loc.tab2.safeZoneToggleBtn.click();
    }
    await expect(loc.tab2.safeZoneOverlay).toHaveCount(0);
    const dlOff = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlOff.buffer, '9:16');

    await loc.tab2.safeZoneToggleBtn.click();
    await expect(loc.tab2.safeZoneOverlay).toBeVisible();
    const dlOn = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlOn.buffer, '9:16');

    assertPngBytesIdentical(dlOff.buffer, dlOn.buffer, '9:16 safe-zone OFF vs ON');
  });

  test('T2-A5-02: Safe-zone 4:5 overlay isolation & dimension switch', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();
    const dl916 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());

    await loc.tab2.aspect45Btn.click();
    if (await loc.tab2.safeZoneOverlay.isVisible().catch(() => false)) {
      await loc.tab2.safeZoneToggleBtn.click();
    }
    const dl45Off = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dl45Off.buffer, '4:5');

    await loc.tab2.safeZoneToggleBtn.click();
    await expect(loc.tab2.safeZoneOverlay).toBeVisible();
    const dl45On = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dl45On.buffer, '4:5');

    assertPngBytesIdentical(dl45Off.buffer, dl45On.buffer, '4:5 safe-zone OFF vs ON');
    assertPngBytesChanged(dl916.buffer, dl45Off.buffer, '9:16 vs 4:5');
  });

  test('T2-A5-03: Live headline edit mutates exported PNG bytes', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();
    const before = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());

    await loc.tab2.headlineInput.fill('Kilauan Senyuman Baru Hari Ini');
    const after = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());

    assertValidSlidePng(after.buffer, '9:16');
    assertPngBytesChanged(before.buffer, after.buffer, 'headline edit');
  });

  test('T2-A5-04: Empty headline & very long BM headline wrapping edge', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();

    await loc.tab2.headlineInput.fill('');
    const dlEmpty = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlEmpty.buffer, '9:16');

    await loc.tab2.headlineInput.fill(
      'Promosi Istimewa Scaling & Polish Sempena Hari Gaji Di Seluruh Cawangan Klinik Gigi Impian',
    );
    const dlLong = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlLong.buffer, '9:16');
    await assertNoHorizontalOverflow(page, 'Tab 2 long headline');
    errors.assertClean();
    errors.detach();
  });

  test('T2-A5-05: Different slides export distinct visual creatives', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab2.slideBtn(1).click();
    const dl1 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dl1.buffer, '9:16');

    await loc.tab2.slideBtn(2).click();
    const dl2 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dl2.buffer, '9:16');

    assertPngBytesChanged(dl1.buffer, dl2.buffer, 'Slide 1 vs Slide 2');
  });

  test('T2-A5-06: Custom uploaded brand logo + photo export without CORS taint', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await createBrandFolder(page, {
      name: 'Klinik Custom Export',
      colorHex: '#6366F1',
      tone: 'casual',
      whatsapp: '01122334455',
      logoRgba: [99, 102, 241, 255],
    });

    const loc = appLocators(page);
    const p1 = createTestPngBuffer({ width: 100, height: 150, rgba: [20, 184, 166, 255] });
    const p2 = createTestPngBuffer({ width: 100, height: 150, rgba: [245, 158, 11, 255] });
    await loc.quickForm.photo1Input.setInputFiles({ name: 'p1.png', mimeType: 'image/png', buffer: p1 });
    await loc.quickForm.photo2Input.setInputFiles({ name: 'p2.png', mimeType: 'image/png', buffer: p2 });

    await launchCampaign(page, {
      brandName: 'Klinik Custom Export',
      offerSentence: DEFAULT_OFFER,
      attachSamplePhotos: false,
    });
    await openTab(page, 'carousel');

    const dl = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dl.buffer, '9:16');
    errors.assertClean();
    errors.detach();
  });
});

test.describe('Tier 2 — A6: Tab 3 Jingle Studio Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'jingle');
  });

  test('T2-A6-01: Switching music styles produces distinct .wav audio bytes', async ({ page }) => {
    const loc = appLocators(page);

    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    const first = await verifyAudioElement(loc.tab3.audioPlayer);
    const dl1 = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    const wav1 = assertValidAudioFileOrBuffer(dl1.filePath, dl1.buffer);

    await loc.tab3.styleBtn('santai-akustik').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer, { excludeSrc: first.currentSrc });
    const dl2 = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    const wav2 = assertValidAudioFileOrBuffer(dl2.filePath, dl2.buffer);

    expect(wav2.sha256).not.toBe(wav1.sha256);
  });

  test('T2-A6-02: Empty / whitespace-only lyrics handled cleanly without crash', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);

    await loc.tab3.lyricsInput.fill('   ');
    await loc.tab3.generateBtn.click();

    const errVisible = await loc.tab3.errorMsg.isVisible().catch(() => false);
    if (!errVisible) {
      await verifyAudioElement(loc.tab3.audioPlayer);
      const dl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
      assertValidAudioFileOrBuffer(dl.filePath, dl.buffer);
    } else {
      await expect(loc.tab3.errorMsg).toBeVisible();
    }
    errors.assertClean();
    errors.detach();
  });

  test('T2-A6-03: Very long / special-character custom lyrics cap <= 6.0s', async ({ page }) => {
    const loc = appLocators(page);
    const longLyrics =
      'Klinik Gigi Impian senyuman menawan! '.repeat(12) + '✨🦷 RM99 sahaja!';
    expect(longLyrics.length).toBeGreaterThan(350);

    await loc.tab3.lyricsInput.fill(longLyrics);
    await loc.tab3.generateBtn.click();

    const meta = await verifyAudioElement(loc.tab3.audioPlayer);
    expect(meta.duration).toBeLessThanOrEqual(6.0);
    await assertNoHorizontalOverflow(page, 'Tab 3 long lyrics');
  });

  test('T2-A6-04: WAV audio energy (non-silent) & duration bounds check', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);

    const dl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    const info = assertValidAudioFileOrBuffer(dl.filePath, dl.buffer, {
      minDurationSec: 1.0,
      maxDurationSec: 6.0,
      minRms: 0.01,
    });
    expect([44100, 48000]).toContain(info.sampleRate);
  });

  test('T2-A6-05: Rapid style switch before clicking Generate', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);

    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.styleBtn('santai-akustik').click();
    if (await loc.tab3.styleBtn('korporat-segar').isVisible().catch(() => false)) {
      await loc.tab3.styleBtn('korporat-segar').click();
    }
    await loc.tab3.generateBtn.click();

    await verifyAudioElement(loc.tab3.audioPlayer);
    expect(await loc.tab3.root.locator('audio').count()).toBe(1);
    errors.assertClean();
    errors.detach();
  });

  test('T2-A6-06: Re-generating jingle replaces old preview cleanly', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);

    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    const first = await verifyAudioElement(loc.tab3.audioPlayer);

    await loc.tab3.styleBtn('santai-akustik').click();
    await loc.tab3.generateBtn.click();
    const second = await verifyAudioElement(loc.tab3.audioPlayer, { excludeSrc: first.currentSrc });

    expect(second.currentSrc).not.toBe(first.currentSrc);
    errors.assertClean();
    errors.detach();
  });
});

test.describe('Tier 2 — A7: Tab 4 Staged Video Ad Studio Boundaries (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
  });

  test('T2-A7-01: Strict gate enforcement BEFORE storyboard confirmation', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    expect(await loc.tab4.confirmCheckbox.isChecked()).toBe(false);
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    const dlCount = await loc.tab4.downloadBtn.count();
    if (dlCount > 0) {
      await expect(loc.tab4.downloadBtn).toBeDisabled();
    }
    if (await loc.tab4.generateBtn.isDisabled()) {
      await expect(loc.tab4.generateBtn).toBeDisabled();
    } else {
      await loc.tab4.generateBtn.click();
      await expect(loc.tab4.gateWarning).toBeVisible();
      await expect(loc.tab4.videoPlayer).toHaveCount(0);
    }
  });

  test('T2-A7-02: Editing any storyboard frame automatically unconfirms gate', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await expect(loc.tab4.confirmCheckbox).toBeChecked();

    await loc.tab4.frameInput(2).fill('Tawaran Baru Frame 2');
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
  });

  test('T2-A7-03: Strict <= 6.0s duration cap verification in DOM & ffprobe', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    const domMeta = await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    expect(domMeta.duration).toBeGreaterThan(1.0);
    expect(domMeta.duration).toBeLessThanOrEqual(6.0);

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    const probed = assertValidVerticalVideoFile(dl.filePath, { minDurationSec: 1.0, maxDurationSec: 6.0 });
    expect(probed.formatDurationSec).toBeLessThanOrEqual(6.0);
  });

  test('T2-A7-04: Fallback audio stream validity when Tab 3 is completely skipped', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    const probed = assertValidVerticalVideoFile(dl.filePath);
    expect(probed.audioStream.sampleRate).toBeGreaterThan(0);
  });

  test('T2-A7-05: Rapid double-click on Generate Video while rendering', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    // Attempt immediate second click if still enabled; must not crash or duplicate video elements
    if (await loc.tab4.generateBtn.isEnabled().catch(() => false)) {
      await loc.tab4.generateBtn.click().catch(() => undefined);
    }

    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    expect(await loc.tab4.root.locator('video').count()).toBe(1);
    errors.assertClean();
    errors.detach();
  });

  test('T2-A7-06: Re-editing frame after video already generated re-gates export', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });

    await loc.tab4.frameInput(1).fill('Teks Baharu Selepas Jana');
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    if (await loc.tab4.generateBtn.isDisabled()) {
      await expect(loc.tab4.generateBtn).toBeDisabled();
    } else {
      await loc.tab4.generateBtn.click();
      await expect(loc.tab4.gateWarning).toBeVisible();
    }
    const dlCount = await loc.tab4.downloadBtn.count();
    if (dlCount > 0) {
      await expect(loc.tab4.downloadBtn).toBeDisabled();
    }
  });
});

test.describe('Tier 2 — A8: Bilingual Toggle & Responsive Layout Boundaries (6 Tests)', () => {
  test('T2-A8-01: Bilingual toggle mid-edit preserves ALL Tab 1-4 & Quick Form edits', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const customOffer = 'Tawaran Kekal Sempena Gaji 99';
    await launchCampaign(page, { offerSentence: customOffer });
    const loc = appLocators(page);

    await loc.tab1.channelCard('facebook').editableField.fill('Salinan FB Tersuai');
    await loc.tab1.cpa.cplInput.fill('24');

    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Tajuk Karusel Tersuai');

    await openTab(page, 'jingle');
    await loc.tab3.lyricsInput.fill('Lirik Jingle Tersuai Klinik Gigi Impian');

    await openTab(page, 'video');
    await confirmStoryboard(page);

    const snapBm = await getActiveTabLanguageSnapshot(page);
    await toggleLanguage(page);
    const snapEn = await getActiveTabLanguageSnapshot(page);
    assertBilingualLabelSwitched(snapBm.strategyLabel, snapEn.strategyLabel);
    assertBilingualLabelSwitched(snapBm.launchBtnLabel, snapEn.launchBtnLabel);

    await toggleLanguage(page);
    const snapBack = await getActiveTabLanguageSnapshot(page);
    expect(snapBack.strategyLabel).toBe(snapBm.strategyLabel);

    await expect(loc.quickForm.offerInput).toHaveValue(customOffer);
    await expect(loc.tab4.confirmCheckbox).toBeChecked();
    await openTab(page, 'jingle');
    await expect(loc.tab3.lyricsInput).toHaveValue('Lirik Jingle Tersuai Klinik Gigi Impian');
    await openTab(page, 'carousel');
    await expect(loc.tab2.headlineInput).toHaveValue('Tajuk Karusel Tersuai');
    await openTab(page, 'strategy');
    await expect(loc.tab1.channelCard('facebook').editableField).toHaveValue('Salinan FB Tersuai');
    await expect(loc.tab1.cpa.cplInput).toHaveValue('24');
  });

  test('T2-A8-02: Rapid 6x BM <-> EN toggle stress test', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Tajuk Ujian Stres');
    const snapBm = await getActiveTabLanguageSnapshot(page);

    for (let i = 0; i < 6; i++) {
      await toggleLanguage(page);
      const snapNow = await getActiveTabLanguageSnapshot(page);
      if (i % 2 === 0) {
        assertBilingualLabelSwitched(snapBm.carouselLabel, snapNow.carouselLabel);
      } else {
        expect(snapNow.carouselLabel).toBe(snapBm.carouselLabel);
      }
    }

    await expect(loc.tab2.headlineInput).toHaveValue('Tajuk Ujian Stres');
    errors.assertClean();
    errors.detach();
  });

  test('T2-A8-03: Language toggle BEFORE Bina Kempen carries cleanly into workspace', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const loc = appLocators(page);

    await toggleLanguage(page); // Switch to EN before launch
    const bmOffer = 'Promosi Scaling & Polish RM88 Sahaja';
    await launchCampaign(page, { offerSentence: bmOffer });

    await expect(loc.tabButton('strategy')).toContainText(/Strategy/i);
    await expect(loc.quickForm.offerInput).toHaveValue(bmOffer);
  });

  test('T2-A8-04: Mobile 390x844 overflow check on long wa.me & compliance text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await loc.tab1.compliance.testRiskyBtn.click();
    await assertNoHorizontalOverflow(page, '390 Tab 1 risky compliance');

    for (const tab of ['carousel', 'jingle', 'video'] as const) {
      await openTab(page, tab);
      await assertNoHorizontalOverflow(page, `390 ${tab}`);
    }
  });

  test('T2-A8-05: Mobile 390x844 Tab 2 vertical canvas fits viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
    const loc = appLocators(page);

    await loc.tab2.aspect916Btn.click();
    await loc.tab2.safeZoneToggleBtn.click();
    const box = await loc.tab2.previewStage.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(390);
    await assertNoHorizontalOverflow(page, '390 Tab 2 9:16 safe-zone');
  });

  test('T2-A8-06: Offline / strict network audit (zero external media requests)', async ({ page }) => {
    const net = attachNetworkOriginAuditor(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
    await openTab(page, 'jingle');
    await openTab(page, 'video');
    await confirmStoryboard(page);

    net.assertSameOriginAndHealthy();
    net.detach();
  });
});

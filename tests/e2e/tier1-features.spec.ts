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
  setBrandTone,
  toggleLanguage,
} from './helpers/app';
import {
  assertDarkBackground,
  assertMobile2x2TabGrid,
  assertNoElementClipping,
  assertNoHorizontalOverflow,
  assertTabGridLayout,
  attachNetworkOriginAuditor,
  attachRuntimeErrorCollector,
  clearClipboardSpy,
  grantClipboardPermissions,
  installClipboardSpy,
  readClipboardWithFallback,
} from './helpers/layout';
import { appLocators, RX } from './helpers/locators';
import {
  assertValidAudioFileOrBuffer,
  assertValidSlidePng,
  assertValidVerticalVideoFile,
  captureDownload,
  createTestPngBuffer,
  verifyAudioElement,
  verifyVideoElement,
} from './helpers/media';

test.describe('Tier 1 — A1: Onboarding (5 Tests)', () => {
  test('T1-A1-01: Dark-mode Freelancer Workbench positioning & entry render', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await expect(loc.onboarding.root).toBeVisible();
    await assertDarkBackground(page);
    await expect(page).toHaveTitle(/AdForge MY — Tempat Menempa Iklan Digital Malaysia/);
    await expect(page.locator('header')).toContainText(/AdForge MY/);
    await expect(page.locator('header')).toContainText(/Tempat Menempa Iklan Digital Malaysia/);
    await expect(loc.onboarding.root).toContainText(/AdForge MY/i);
    await expect(loc.onboarding.root).toContainText(/Freelancer|Workbench/i);
    await expect(loc.onboarding.googleLoginBtn).toBeVisible();
    errors.assertClean();
    errors.detach();
  });

  test('T1-A1-02: Interactive Google Login trigger shows freelancer session', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await expect(loc.onboarding.sessionBadge).toBeVisible();
    await expect(loc.onboarding.sessionBadge).toContainText(/@|Freelancer|Studio/i);
    net.assertSameOriginAndHealthy();
    errors.assertClean();
    net.detach();
    errors.detach();
  });

  test('T1-A1-03: Single-key Google AI Studio BYOK input & save', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    const loc = appLocators(page);

    await loc.onboarding.googleLoginBtn.click();
    await expect(loc.onboarding.byokInput).toBeVisible();
    await loc.onboarding.byokInput.fill('sk-live-test-key-123456');

    const initialType = await loc.onboarding.byokInput.getAttribute('type');
    if (await loc.onboarding.byokVisibilityBtn.isVisible().catch(() => false)) {
      await loc.onboarding.byokVisibilityBtn.click();
      const toggledType = await loc.onboarding.byokInput.getAttribute('type');
      expect(toggledType).not.toBe(initialType);
    }

    await loc.onboarding.byokSaveBtn.click();
    if (await loc.onboarding.continueBtn.isVisible().catch(() => false)) {
      await loc.onboarding.continueBtn.click();
    }
    await expect(loc.vault.root).toBeVisible({ timeout: 10_000 });
    errors.assertClean();
    errors.detach();
  });

  test('T1-A1-04: Local/same-origin short video guide element playback', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);
    await gotoFreshApp(page);
    const loc = appLocators(page);

    const playBtnVisible = await loc.onboarding.videoGuidePlayBtn.isVisible().catch(() => false);
    if (playBtnVisible) {
      await loc.onboarding.videoGuidePlayBtn.click();
    }

    const videoCount = await page.locator('video').count();
    expect(videoCount, 'Onboarding must render a <video> guide element').toBeGreaterThan(0);

    const guideVideo = loc.onboarding.videoGuide;
    await expect(guideVideo).toBeVisible();

    await expect
      .poll(
        async () =>
          guideVideo.evaluate((el: HTMLVideoElement) => {
            const src = el.currentSrc || el.src || el.querySelector('source')?.getAttribute('src') || '';
            return (
              src.length > 0 &&
              el.error === null &&
              el.readyState >= 2 &&
              Number.isFinite(el.duration) &&
              el.duration > 0 &&
              el.videoWidth > 0
            );
          }),
        { timeout: 10_000, message: 'Waiting for onboarding guide <video> metadata & playable frame' },
      )
      .toBe(true);

    const srcInfo = await guideVideo.evaluate((el: HTMLVideoElement) => ({
      src: el.currentSrc || el.src || el.querySelector('source')?.getAttribute('src') || '',
      error: el.error ? el.error.code : null,
      readyState: el.readyState,
      duration: el.duration,
      videoWidth: el.videoWidth,
    }));
    expect(srcInfo.src.length).toBeGreaterThan(0);
    expect(srcInfo.error).toBeNull();
    expect(srcInfo.readyState).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(srcInfo.duration)).toBe(true);
    expect(srcInfo.duration).toBeGreaterThan(0);
    expect(srcInfo.videoWidth).toBeGreaterThan(0);
    expect(srcInfo.src).not.toMatch(/youtube\.com|youtu\.be|vimeo\.com/i);
    if (srcInfo.src.startsWith('http')) {
      expect(new URL(srcInfo.src).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    }

    await guideVideo.click({ force: true });
    const playState = await guideVideo.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
      const state = { paused: el.paused, currentTime: el.currentTime };
      el.pause();
      return state;
    });
    expect(!playState.paused || playState.currentTime > 0).toBe(true);

    net.assertSameOriginAndHealthy();
    errors.assertClean();
    net.detach();
    errors.detach();
  });

  test('T1-A1-05: Transition to Personal Dashboard & revisit API settings', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: false });
    const loc = appLocators(page);

    await expect(loc.vault.root).toBeVisible();
    await expect(loc.quickForm.root).toBeVisible();

    await expect(loc.headerApiSettings).toBeVisible();
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await expect(loc.onboarding.settingsModal).toContainText(/API|BYOK|Demo|Gemini/i);
    await loc.onboarding.settingsCloseBtn.click();
    await expect(loc.vault.root).toBeVisible();
    errors.assertClean();
    errors.detach();
  });
});

test.describe('Tier 1 — A2: Brand Vault (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
  });

  test('T1-A2-01: Pre-seeded Demo Bisnes Saya folder present on load', async ({ page }) => {
    const loc = appLocators(page);
    await expect(loc.vault.folderButton('Demo Bisnes Saya')).toBeVisible();
    await loc.vault.folderButton('Demo Bisnes Saya').click();

    await expect(loc.vault.root).toContainText(/Demo Bisnes Saya/i);
    await expect(loc.vault.whatsappInput).toHaveValue(/60123456789|012[- ]?345\s?6789/);

    const logoState = await loc.vault.logoPreview.evaluate((img: HTMLImageElement) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      src: img.currentSrc || img.src,
    }));
    expect(logoState.complete).toBe(true);
    expect(logoState.naturalWidth).toBeGreaterThan(0);
    if (logoState.src.startsWith('http')) {
      expect(new URL(logoState.src).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    }
  });

  test('T1-A2-02: Create new isolated client folder', async ({ page }) => {
    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Kopi Klasik KL',
      colorHex: '#D97706',
      tone: 'professional',
      whatsapp: '019-888 7766',
      logoRgba: [217, 119, 6, 255],
    });

    await loc.vault.folderButton('Kopi Klasik KL').click();
    if ((await loc.vault.activeNameInput.count()) > 0) {
      await expect(loc.vault.activeNameInput).toHaveValue('Kopi Klasik KL');
    } else {
      await expect(loc.vault.root).toContainText('Kopi Klasik KL');
    }
    await expect(loc.vault.whatsappInput).toHaveValue(/60198887766|019[- ]?888\s?7766/);
    const colorVal = (await loc.vault.colorInput.inputValue()).toLowerCase();
    expect(colorVal).toBe('#d97706');
  });

  test('T1-A2-03: Switch folders with zero cross-folder leakage', async ({ page }) => {
    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Kopi Klasik KL',
      colorHex: '#D97706',
      tone: 'professional',
      whatsapp: '019-888 7766',
      logoRgba: [217, 119, 6, 255],
    });

    await loc.vault.folderButton('Demo Bisnes Saya').click();
    if ((await loc.vault.activeNameInput.count()) > 0) {
      await expect(loc.vault.activeNameInput).toHaveValue('Demo Bisnes Saya');
    }
    expect((await loc.vault.colorInput.inputValue()).toLowerCase()).toBe('#0ea5e9');
    await expect(loc.vault.whatsappInput).toHaveValue(/60123456789|012[- ]?345\s?6789/);

    await loc.vault.folderButton('Kopi Klasik KL').click();
    if ((await loc.vault.activeNameInput.count()) > 0) {
      await expect(loc.vault.activeNameInput).toHaveValue('Kopi Klasik KL');
    }
    expect((await loc.vault.colorInput.inputValue()).toLowerCase()).toBe('#d97706');
    await expect(loc.vault.whatsappInput).toHaveValue(/60198887766|019[- ]?888\s?7766/);
  });

  test('T1-A2-04: Upload custom PNG logo into client folder', async ({ page }) => {
    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Kopi Klasik KL',
      whatsapp: '0198887766',
    });

    const pngBuf = createTestPngBuffer({
      width: 64,
      height: 64,
      rgba: [225, 29, 72, 255],
      stripeRgba: [255, 255, 255, 255],
    });
    await loc.vault.logoInput.setInputFiles({
      name: 'kopi-logo.png',
      mimeType: 'image/png',
      buffer: pngBuf,
    });
    await saveBrandIfButtonVisible(page);

    await expect
      .poll(async () =>
        loc.vault.logoPreview.evaluate((img: HTMLImageElement) => ({
          complete: img.complete,
          hasNaturalWidth: img.naturalWidth > 0,
          isDataPng: (img.currentSrc || img.src).startsWith('data:image/png'),
        })),
      )
      .toEqual({ complete: true, hasNaturalWidth: true, isDataPng: true });

    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await loc.vault.folderButton('Kopi Klasik KL').click();

    const persistedSrc = await loc.vault.logoPreview.evaluate(
      (img: HTMLImageElement) => img.currentSrc || img.src,
    );
    expect(persistedSrc.startsWith('data:image/png')).toBe(true);
  });

  test('T1-A2-05: Update theme color & tone (casual <-> professional)', async ({ page }) => {
    const loc = appLocators(page);
    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await loc.vault.colorInput.fill('#10B981');
    await setBrandTone(page, 'professional');
    await saveBrandIfButtonVisible(page);

    expect((await loc.vault.colorInput.inputValue()).toLowerCase()).toBe('#10b981');
    if (await loc.vault.toneSelect.isVisible().catch(() => false)) {
      await expect(loc.vault.toneSelect).toHaveValue('professional');
    } else {
      const proActive = await loc.vault.toneProfessionalBtn.evaluate((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        active: el.getAttribute('data-active'),
        cls: el.className,
      }));
      const casActive = await loc.vault.toneCasualBtn.evaluate((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        active: el.getAttribute('data-active'),
        cls: el.className,
      }));
      expect(
        proActive.pressed === 'true' || proActive.active === 'true' || proActive.cls !== casActive.cls,
      ).toBe(true);
    }

    await setBrandTone(page, 'casual');
    await saveBrandIfButtonVisible(page);
    if (await loc.vault.toneSelect.isVisible().catch(() => false)) {
      await expect(loc.vault.toneSelect).toHaveValue('casual');
    } else {
      const casAfter = await loc.vault.toneCasualBtn.evaluate((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        active: el.getAttribute('data-active'),
        cls: el.className,
      }));
      const proAfter = await loc.vault.toneProfessionalBtn.evaluate((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        active: el.getAttribute('data-active'),
        cls: el.className,
      }));
      expect(
        casAfter.pressed === 'true' || casAfter.active === 'true' || casAfter.cls !== proAfter.cls,
      ).toBe(true);
    }
  });

  test('T1-A2-06: Edit & normalize Malaysian WhatsApp number', async ({ page }) => {
    const loc = appLocators(page);
    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await loc.vault.whatsappInput.fill('012-999 4455');
    await saveBrandIfButtonVisible(page);

    await expect(loc.vault.whatsappInput).toHaveValue(/60129994455|\+?60\s?12[- ]?999\s?4455/);
    await page.reload();
    await expect(loc.vault.folderButton('Demo Bisnes Saya')).toBeVisible();
    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await expect(loc.vault.whatsappInput).toHaveValue(/60129994455|\+?60\s?12[- ]?999\s?4455/);
  });
});

test.describe('Tier 1 — A3: Quick Launch (5 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
  });

  test('T1-A3-01: Quick Form brand selector synced with Brand Vault', async ({ page }) => {
    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Butik Anggun Jaya',
      colorHex: '#10B981',
      tone: 'professional',
      whatsapp: '013-222 3344',
    });

    await expect(loc.quickForm.brandSelect).toBeVisible();
    await expect(loc.quickForm.brandSelect).toContainText(/Demo Bisnes Saya/i);
    await expect(loc.quickForm.brandSelect).toContainText(/Butik Anggun Jaya/i);

    await launchCampaign(page, { brandName: 'Butik Anggun Jaya' });
    await expect(loc.tab1.root).toContainText(/Butik Anggun Jaya/i);
  });

  test('T1-A3-02: Attach two sample business photos from local gallery', async ({ page }) => {
    const loc = appLocators(page);
    if (await loc.quickForm.photo1SampleBtn.isVisible().catch(() => false)) {
      await loc.quickForm.photo1SampleBtn.click();
    }
    if (await loc.quickForm.photo2SampleBtn.isVisible().catch(() => false)) {
      await loc.quickForm.photo2SampleBtn.click();
    }

    for (const slot of [loc.quickForm.photoSlot1, loc.quickForm.photoSlot2]) {
      const img = slot.locator('img').first();
      await expect(img).toBeVisible();
      const meta = await img.evaluate((el: HTMLImageElement) => ({
        complete: el.complete,
        naturalWidth: el.naturalWidth,
        src: el.currentSrc || el.src,
      }));
      expect(meta.complete).toBe(true);
      expect(meta.naturalWidth).toBeGreaterThan(0);
      if (meta.src.startsWith('http')) {
        expect(new URL(meta.src).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
      }
    }
  });

  test('T1-A3-03: Quick-fill offer example chip & manual offer entry', async ({ page }) => {
    const loc = appLocators(page);
    if (await loc.quickForm.offerChip.isVisible().catch(() => false)) {
      await loc.quickForm.offerChip.click();
      const chipVal = await loc.quickForm.offerInput.inputValue();
      expect(chipVal.length).toBeGreaterThan(15);
    }

    await loc.quickForm.offerInput.fill(DEFAULT_OFFER);
    await expect(loc.quickForm.offerInput).toHaveValue(DEFAULT_OFFER);
  });

  test('T1-A3-04: Upload custom local photos into Photo 1 & Photo 2', async ({ page }) => {
    const loc = appLocators(page);
    const p1 = createTestPngBuffer({ width: 120, height: 160, rgba: [14, 165, 233, 255] });
    const p2 = createTestPngBuffer({ width: 120, height: 160, rgba: [16, 185, 129, 255] });

    await loc.quickForm.photo1Input.setInputFiles({
      name: 'custom-photo-1.png',
      mimeType: 'image/png',
      buffer: p1,
    });
    await loc.quickForm.photo2Input.setInputFiles({
      name: 'custom-photo-2.png',
      mimeType: 'image/png',
      buffer: p2,
    });

    for (const slot of [loc.quickForm.photoSlot1, loc.quickForm.photoSlot2]) {
      const img = slot.locator('img').first();
      await expect(img).toBeVisible();
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(w).toBeGreaterThan(0);
    }
  });

  test('T1-A3-05: Bina Kempen launch hydrates 4-tab workspace', async ({ page }) => {
    const loc = appLocators(page);
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    await expect(loc.workspaceTabs).toBeVisible();
    await expect(loc.tabButton('strategy')).toBeVisible();
    await expect(loc.tabButton('carousel')).toBeVisible();
    await expect(loc.tabButton('jingle')).toBeVisible();
    await expect(loc.tabButton('video')).toBeVisible();
    await expect(loc.tab1.root).toContainText(/Demo Bisnes Saya/i);
  });
});

test.describe('Tier 1 — A4: Tab 1 Strategy, Copywriting, CPA & Compliance (6 Tests)', () => {
  test.beforeEach(async ({ page, context }) => {
    await grantClipboardPermissions(context);
    await installClipboardSpy(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
  });

  test('T1-A4-01: Customer-psychology analysis reflects active brand & offer', async ({ page }) => {
    const loc = appLocators(page);
    await expect(loc.tab1.psychologyPanel).toBeVisible();
    const text = await loc.tab1.psychologyPanel.innerText();
    expect(text).toMatch(/Demo Bisnes Saya|Minggu Gaji|Promosi/i);
    expect(text.length).toBeGreaterThan(80);
  });

  test('T1-A4-02: 3 selectable ad angles switch generated copy', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.angleBtn('urgency').click();
    const fbUrg = await loc.tab1.channelCard('facebook').card.innerText();

    await loc.tab1.angleBtn('value').click();
    const fbVal = await loc.tab1.channelCard('facebook').card.innerText();

    await loc.tab1.angleBtn('social_proof').click();
    const fbProof = await loc.tab1.channelCard('facebook').card.innerText();

    expect(fbVal).not.toEqual(fbUrg);
    expect(fbProof).not.toEqual(fbVal);
  });

  test('T1-A4-03: 4-channel copy generation (FB, IG, TikTok, Google RSA)', async ({ page }) => {
    const loc = appLocators(page);
    for (const ch of ['facebook', 'instagram', 'tiktok', 'google_rsa'] as const) {
      const card = loc.tab1.channelCard(ch).card;
      await expect(card).toBeVisible();
      expect((await card.innerText()).trim().length).toBeGreaterThan(30);
    }

    const rsaCard = loc.tab1.channelCard('google_rsa').card;
    const rsaText = await rsaCard.innerText();
    expect(rsaText).toMatch(/Negatif|Negative/i);

    const counters30 = [...rsaText.matchAll(/(\d+)\s*\/\s*30/g)].map((m) => Number(m[1]));
    const counters90 = [...rsaText.matchAll(/(\d+)\s*\/\s*90/g)].map((m) => Number(m[1]));
    expect(counters30.length).toBeGreaterThanOrEqual(3);
    expect(counters90.length).toBeGreaterThanOrEqual(2);
    for (const n of counters30) expect(n).toBeLessThanOrEqual(30);
    for (const n of counters90) expect(n).toBeLessThanOrEqual(90);

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
  });

  test('T1-A4-04: Angle-tagged wa.me CTA links & quick-copy buttons', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.angleBtn('social_proof').click();

    for (const ch of ['facebook', 'instagram', 'tiktok', 'google_rsa'] as const) {
      const link = loc.tab1.channelCard(ch).whatsappLink;
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      assertWhatsAppUrl(href, '60123456789', /SUDUT-3-BUKTISOSIAL|BUKTISOSIAL|social_proof/i);
    }

    await clearClipboardSpy(page);
    await loc.tab1.channelCard('facebook').copyBtn.click();
    await expect(loc.tab1.channelCard('facebook').card).toContainText(RX.copiedFeedback);
    const fbClip = await readClipboardWithFallback(page);
    expect(fbClip).toContain('https://wa.me/60123456789?text=');
    expect(fbClip).toMatch(/SUDUT-3-BUKTISOSIAL|BUKTISOSIAL|social_proof/i);
    expect(fbClip).toMatch(/Demo Bisnes Saya|Minggu Gaji|Promosi/i);

    await clearClipboardSpy(page);
    await loc.tab1.channelCard('google_rsa').copyBtn.click();
    await expect(loc.tab1.channelCard('google_rsa').card).toContainText(RX.copiedFeedback);
    const rsaClip = await readClipboardWithFallback(page);
    expect(rsaClip).toContain('https://wa.me/60123456789?text=');
    expect(rsaClip).toMatch(/SUDUT-3-BUKTISOSIAL|BUKTISOSIAL|social_proof/i);
    expect(rsaClip).not.toBe(fbClip);
  });

  test('T1-A4-05: Break-Even CPA calculator outputs accurate math & badge', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab1.cpa.priceInput.fill('180');
    await loc.tab1.cpa.marginInput.fill('60');
    await loc.tab1.cpa.closeRateInput.fill('30');
    await loc.tab1.cpa.cplInput.fill('18');

    await expect(loc.tab1.cpa.breakEvenValue).toContainText(/RM\s*108(?:\.00)?/);
    await expect(loc.tab1.cpa.maxCplValue).toContainText(/RM\s*32\.40/);
    await expect(loc.tab1.cpa.projectedValue).toContainText(/RM\s*60(?:\.00)?/);
    await expect(loc.tab1.cpa.statusBadge).toContainText(RX.cpaSafe);
  });

  test('T1-A4-06: Policy-safe copy check validates clean copy vs risky sample', async ({ page }) => {
    const loc = appLocators(page);
    await expect(loc.tab1.compliance.root).toBeVisible();
    await expect(loc.tab1.compliance.statusBadge).toContainText(RX.compliancePass);
    const initialFindings = (await loc.tab1.compliance.findings.innerText().catch(() => '')).trim();
    expect(initialFindings).not.toMatch(/Meta Personal Attributes|Atribut Peribadi|100%|terbaik|dijamin/i);

    await loc.tab1.compliance.testRiskyBtn.click();
    await expect(loc.tab1.compliance.findings).toBeVisible();
    const findingsText = await loc.tab1.compliance.findings.innerText();
    expect(findingsText).toMatch(/Meta|Personal Attribute|Atribut Peribadi/i);
    expect(findingsText).toMatch(/100%|terbaik|dijamin|Polisi Iklan Am|General Ad Policy/i);
  });
});

test.describe('Tier 1 — A5: Tab 2 Carousel Studio & Safe Zones (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
  });

  test('T1-A5-01: Multi-slide preview with Layer 1 photo + Layer 2 brand elements', async ({ page }) => {
    const loc = appLocators(page);
    for (let i = 1; i <= 4; i++) {
      await expect(loc.tab2.slideBtn(i)).toBeVisible();
    }
    const stageImgs = loc.tab2.previewStage.locator('img');
    const stageImgCount = await stageImgs.count();
    expect(stageImgCount).toBeGreaterThanOrEqual(2);
    for (let idx = 0; idx < stageImgCount; idx++) {
      const imgMeta = await stageImgs.nth(idx).evaluate((img: HTMLImageElement) => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }));
      expect(imgMeta.complete).toBe(true);
      expect(imgMeta.naturalWidth).toBeGreaterThan(0);
    }
    const logoMeta = await loc.tab2.logoImg.evaluate((img: HTMLImageElement) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    }));
    expect(logoMeta.complete).toBe(true);
    expect(logoMeta.naturalWidth).toBeGreaterThan(0);
    await expect(loc.tab2.previewStage).toContainText(/Demo Bisnes Saya|Minggu Gaji|WhatsApp/i);
  });

  test('T1-A5-02: Live clickable/editable BM headline updates preview', async ({ page }) => {
    const loc = appLocators(page);
    const newHeadline = 'Gaji Masuk! Tawaran Jimat Untuk Anda';
    await loc.tab2.headlineInput.fill(newHeadline);
    await expect(loc.tab2.previewStage).toContainText(newHeadline);
  });

  test('T1-A5-03: Switch between slides preserving per-slide edits', async ({ page }) => {
    const loc = appLocators(page);
    const h1 = 'Gaji Masuk! Pakej Kombo Jimat';
    const h2 = 'Slot Promosi Terhad Minggu Ini';

    await loc.tab2.slideBtn(1).click();
    await loc.tab2.headlineInput.fill(h1);
    await expect(loc.tab2.previewStage).toContainText(h1);

    await loc.tab2.slideBtn(2).click();
    await loc.tab2.headlineInput.fill(h2);
    await expect(loc.tab2.previewStage).toContainText(h2);

    await loc.tab2.slideBtn(1).click();
    await expect(loc.tab2.headlineInput).toHaveValue(h1);
    await expect(loc.tab2.previewStage).toContainText(h1);
  });

  test('T1-A5-04: 9:16 vs 4:5 safe-zone overlay toggle', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();
    const box916 = await loc.tab2.previewStage.boundingBox();
    expect(box916).toBeTruthy();

    await loc.tab2.safeZoneToggleBtn.click();
    await expect(loc.tab2.safeZoneOverlay).toBeVisible();

    await loc.tab2.aspect45Btn.click();
    const box45 = await loc.tab2.previewStage.boundingBox();
    expect(box45).toBeTruthy();
    expect(box45!.width / box45!.height).toBeGreaterThan(box916!.width / box916!.height);
  });

  test('T1-A5-05: PNG download produces valid 1080x1920 (9:16) image', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);
    await loc.tab2.aspect916Btn.click();
    await loc.tab2.headlineInput.fill('Promosi Hebat 9:16');

    const dl = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    expect(dl.suggestedFilename.toLowerCase()).toContain('.png');
    assertValidSlidePng(dl.buffer, '9:16');
    errors.assertClean();
    errors.detach();
  });

  test('T1-A5-06: PNG download in 4:5 mode produces valid 1080x1350 image', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const loc = appLocators(page);
    await loc.tab2.aspect45Btn.click();

    const dl = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    expect(dl.suggestedFilename.toLowerCase()).toContain('.png');
    assertValidSlidePng(dl.buffer, '4:5');
    errors.assertClean();
    errors.detach();
  });
});

test.describe('Tier 1 — A6: Tab 3 Jingle Studio, Styles & WAV Export (5 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'jingle');
  });

  test('T1-A6-01: Pre-populated BM chorus lyrics with active brand & offer', async ({ page }) => {
    const loc = appLocators(page);
    const lyrics = await loc.tab3.lyricsInput.inputValue();
    expect(lyrics).toContain('Demo Bisnes Saya');
    expect(lyrics).toMatch(/Minggu Gaji|Promosi|Pakej|WhatsApp/i);
  });

  test('T1-A6-02: Music style switcher (>= 2 styles)', async ({ page }) => {
    const loc = appLocators(page);
    const popBtn = loc.tab3.styleBtn('pop-ceria');
    const santaiBtn = loc.tab3.styleBtn('santai-akustik');
    await expect(popBtn).toBeVisible();
    await expect(santaiBtn).toBeVisible();

    const readActive = async (btn: typeof popBtn) =>
      btn.evaluate((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        selected: el.getAttribute('aria-selected'),
        active: el.getAttribute('data-active'),
        cls: el.className,
      }));

    await santaiBtn.click();
    const santaiOn = await readActive(santaiBtn);
    const popOff = await readActive(popBtn);
    expect(
      santaiOn.pressed === 'true' ||
        santaiOn.selected === 'true' ||
        santaiOn.active === 'true' ||
        santaiOn.cls !== popOff.cls,
    ).toBe(true);

    await popBtn.click();
    const popOn = await readActive(popBtn);
    const santaiOff = await readActive(santaiBtn);
    expect(
      popOn.pressed === 'true' ||
        popOn.selected === 'true' ||
        popOn.active === 'true' ||
        popOn.cls !== santaiOff.cls,
    ).toBe(true);
  });

  test('T1-A6-03: Generate playable <audio> jingle preview', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();

    const meta = await verifyAudioElement(loc.tab3.audioPlayer);
    expect(meta.duration).toBeGreaterThan(1.0);
    expect(meta.duration).toBeLessThanOrEqual(6.0);
  });

  test('T1-A6-04: Download valid non-empty .wav audio file', async ({ page }) => {
    const loc = appLocators(page);
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);

    const dl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    const wav = assertValidAudioFileOrBuffer(dl.filePath, dl.buffer);
    expect(wav.rms).toBeGreaterThan(0.01);
  });

  test('T1-A6-05: Custom BM lyrics edit persists & allows regeneration', async ({ page }) => {
    const loc = appLocators(page);
    const customLyrics = 'Tawaran mantap di Demo Bisnes Saya, jom tempah!';
    await loc.tab3.lyricsInput.fill(customLyrics);
    await loc.tab3.generateBtn.click();

    await verifyAudioElement(loc.tab3.audioPlayer);
    await expect(loc.tab3.lyricsInput).toHaveValue(customLyrics);
  });
});

test.describe('Tier 1 — A7: Tab 4 Staged Video Ad Studio (6 Tests)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
  });

  test('T1-A7-01: Storyboard frames render first in gated state', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    for (let i = 1; i <= 4; i++) {
      await expect(loc.tab4.frameCard(i)).toBeVisible();
    }
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    if (await loc.tab4.generateBtn.isDisabled()) {
      await expect(loc.tab4.generateBtn).toBeDisabled();
    } else {
      await loc.tab4.generateBtn.click();
      await expect(loc.tab4.gateWarning).toBeVisible();
      await expect(loc.tab4.videoPlayer).toHaveCount(0);
    }
  });

  test('T1-A7-02: Explicit storyboard confirmation unlocks video generation', async ({ page }) => {
    await openTab(page, 'video');
    const loc = appLocators(page);

    await confirmStoryboard(page);
    await expect(loc.tab4.generateBtn).toBeEnabled();
  });

  test('T1-A7-03: Generate playable 9:16 vertical video using Tab 3 jingle', async ({ page }) => {
    const loc = appLocators(page);
    await openTab(page, 'jingle');
    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);

    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.tab3AudioBadge);
  });

  test('T1-A7-04: Direct Tab 1 -> Tab 4 (skipping Tab 3) uses fallback audio', async ({ page }) => {
    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);
  });

  test('T1-A7-05: Download valid 9:16 video with muxed video + audio streams', async ({ page }) => {
    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    expect(dl.buffer.length).toBeGreaterThan(5_000);
    assertValidVerticalVideoFile(dl.filePath);
  });

  test('T1-A7-06: Edit storyboard frame text before confirmation', async ({ page }) => {
    const loc = appLocators(page);
    await openTab(page, 'video');
    await loc.tab4.frameInput(1).fill('Promosi Gaji Terkini');
    await expect(loc.tab4.frameInput(1)).toHaveValue('Promosi Gaji Terkini');

    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
  });
});

test.describe('Tier 1 — A8: Bilingual BM/EN Toggle & Responsive Shell (5 Tests)', () => {
  test('T1-A8-01: Top-bar BM <-> EN toggle translates static UI labels', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const snapMs = await getActiveTabLanguageSnapshot(page);
    await toggleLanguage(page);
    const snapEn = await getActiveTabLanguageSnapshot(page);

    assertBilingualLabelSwitched(snapMs.strategyLabel, snapEn.strategyLabel);
    assertBilingualLabelSwitched(snapMs.carouselLabel, snapEn.carouselLabel);

    await toggleLanguage(page);
    const snapMsAgain = await getActiveTabLanguageSnapshot(page);
    expect(snapMsAgain.strategyLabel).toBe(snapMs.strategyLabel);
  });

  test('T1-A8-02: Mobile 390x844 renders 2x2 tab grid', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    await assertMobile2x2TabGrid(page);
  });

  test('T1-A8-03: Desktop 1440x900 renders 4-column horizontal tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    await assertTabGridLayout(page, 'desktop-1x4');
  });

  test('T1-A8-04: Zero horizontal overflow & zero element clipping across 320px-1440px', async ({ page }) => {
    const viewports = [
      { width: 320, height: 700 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 640, height: 900 },
      { width: 768, height: 1024 },
      { width: 980, height: 900 },
      { width: 1440, height: 900 },
    ];

    await gotoFreshApp(page);
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await assertNoHorizontalOverflow(page, `${vp.width} onboarding`);
      await assertNoElementClipping(page, `${vp.width} onboarding`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await completeOnboarding(page, { useDemoMode: true });
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await assertNoHorizontalOverflow(page, `${vp.width} vault+form`);
      await assertNoElementClipping(page, `${vp.width} vault+form`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    for (const tab of ['strategy', 'carousel', 'jingle', 'video'] as const) {
      await openTab(page, tab);
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await assertNoHorizontalOverflow(page, `${vp.width} ${tab}`);
        await assertNoElementClipping(page, `${vp.width} ${tab}`);
        if (tab === 'strategy') {
          await assertTabGridLayout(page, vp.width < 640 ? 'mobile-2x2' : 'desktop-1x4');
        }
      }
    }
  });

  test('T1-A8-05: Zero uncaught runtime/console errors & zero external media', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    for (const tab of ['strategy', 'carousel', 'jingle', 'video'] as const) {
      await openTab(page, tab);
    }

    net.assertSameOriginAndHealthy();
    errors.assertClean();
    net.detach();
    errors.detach();
  });
});

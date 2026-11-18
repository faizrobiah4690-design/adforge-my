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
  toggleLanguage,
} from './helpers/app';
import {
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
  assertPngBytesIdentical,
  assertValidAudioFileOrBuffer,
  assertValidSlidePng,
  assertValidVerticalVideoFile,
  captureDownload,
  verifyAudioElement,
  verifyVideoElement,
} from './helpers/media';

test.describe('Tier 4 — Real-World Freelancer Scenarios (6 Tests)', () => {
  test('T4-01: Demo Bisnes Saya Social Proof Campaign Full Flow', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: false });

    await page.route('**/v1beta/models/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      visualSummary: 'Foto produk dan servis Demo Bisnes Saya.',
                      jingleLyrics:
                        'Pilihan tepat bersama Demo Bisnes Saya,\nPromosi Minggu Gaji diskaun 20% untuk anda,\nStok dan slot terawal sedia ditempah,\nWhatsApp Demo Bisnes Saya sekarang!',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    const loc = appLocators(page);
    await expect(loc.vault.folderButton('Demo Bisnes Saya')).toBeVisible();
    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await expect(loc.vault.whatsappInput).toHaveValue(/60123456789|012[- ]?345\s?6789/);

    await launchCampaign(page, {
      brandName: 'Demo Bisnes Saya',
      offerSentence: DEFAULT_OFFER,
    });

    // Tab 1: Social Proof angle, 4 channels, CPA Safe, Compliance risky check
    await loc.tab1.angleBtn('social_proof').click();
    await expect(loc.tab1.psychologyPanel).toBeVisible();
    for (const ch of ['facebook', 'instagram', 'tiktok', 'google_rsa'] as const) {
      const href = await loc.tab1.channelCard(ch).whatsappLink.getAttribute('href');
      assertWhatsAppUrl(href, '60123456789', /SUDUT-3-BUKTISOSIAL|BUKTISOSIAL|social_proof/i);
    }
    await loc.tab1.cpa.priceInput.fill('180');
    await loc.tab1.cpa.marginInput.fill('60');
    await loc.tab1.cpa.closeRateInput.fill('30');
    await loc.tab1.cpa.cplInput.fill('18');
    await expect(loc.tab1.cpa.statusBadge).toContainText(RX.cpaSafe);
    await loc.tab1.compliance.testRiskyBtn.click();
    await expect(loc.tab1.compliance.findings).toBeVisible();

    // Tab 2: Edit Slide 1, toggle safe zones, download PNG
    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Gaji Masuk! Tawaran Hebat RM99');
    await loc.tab2.aspect916Btn.click();
    await loc.tab2.safeZoneToggleBtn.click();
    const dlPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlPng.buffer, '9:16');

    // Tab 3: Verify BM chorus mentions brand, pick local simulation + pop-ceria, generate & download WAV
    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toContain('Demo Bisnes Saya');
    await loc.tab3.engineBtn('local').click();
    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    const dlWav = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    assertValidAudioFileOrBuffer(dlWav.filePath, dlWav.buffer);

    // Tab 4: Storyboard gated -> select local simulation -> confirm -> generate 9:16 video -> download
    await openTab(page, 'video');
    expect(await loc.tab4.videoPlayer.count()).toBe(0);
    await loc.tab4.engineBtn('local').click();
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    const dlVideo = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dlVideo.filePath);

    errors.assertClean();
    errors.detach();
  });

  test('T4-02: Second Brand Folder (Bengkel Auto Harmoni) Isolation & Separate Campaign', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const loc = appLocators(page);

    await createBrandFolder(page, {
      name: 'Bengkel Auto Harmoni',
      colorHex: '#10B981',
      tone: 'professional',
      whatsapp: '019-876 5432',
      logoRgba: [16, 185, 129, 255],
    });

    await launchCampaign(page, {
      brandName: 'Bengkel Auto Harmoni',
      offerSentence: 'Pakej Servis Penuh & Pemeriksaan Awal Korporat.',
    });

    const fbHref = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(fbHref, '60198765432');
    expect(await loc.tab1.root.innerText()).not.toContain('Demo Bisnes Saya');

    await openTab(page, 'carousel');
    const logoSrc = await loc.tab2.logoImg.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(logoSrc.startsWith('data:image/png')).toBe(true);
    await expect(loc.tab2.previewStage).toContainText('Bengkel Auto Harmoni');

    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toContain('Bengkel Auto Harmoni');

    // Switch back to Demo Bisnes Saya and confirm original state untouched
    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await expect(loc.vault.whatsappInput).toHaveValue(/60123456789|012[- ]?345\s?6789/);

    // Reload and confirm both folders persist
    await page.reload();
    await expect(loc.vault.folderButton('Bengkel Auto Harmoni')).toBeVisible({ timeout: 10_000 });
    await expect(loc.vault.folderButton('Demo Bisnes Saya')).toBeVisible();
  });

  test('T4-03: Mobile 390x844 Full Freelancer Flow (2x2 Tab Grid & Zero Overflow)', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshApp(page);
    await assertNoHorizontalOverflow(page, 'mobile onboarding');
    await assertNoElementClipping(page, 'mobile onboarding');

    await completeOnboarding(page, { useDemoMode: true });
    await assertNoHorizontalOverflow(page, 'mobile vault+form');
    await assertNoElementClipping(page, 'mobile vault+form');

    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await assertMobile2x2TabGrid(page);
    await assertNoHorizontalOverflow(page, 'mobile tab1');
    await assertNoElementClipping(page, 'mobile tab1');
    await loc.tab1.compliance.testRiskyBtn.click();
    await assertNoHorizontalOverflow(page, 'mobile tab1 risky');
    await assertNoElementClipping(page, 'mobile tab1 risky');

    await openTab(page, 'carousel');
    await assertMobile2x2TabGrid(page);
    await assertNoHorizontalOverflow(page, 'mobile tab2');
    await assertNoElementClipping(page, 'mobile tab2');
    await loc.tab2.headlineInput.fill('Promosi Mobile 390px');
    await loc.tab2.safeZoneToggleBtn.click();
    const dlPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlPng.buffer, '9:16');

    await openTab(page, 'jingle');
    await assertMobile2x2TabGrid(page);
    await assertNoHorizontalOverflow(page, 'mobile tab3');
    await assertNoElementClipping(page, 'mobile tab3');
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    const dlWav = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    assertValidAudioFileOrBuffer(dlWav.filePath, dlWav.buffer);

    await openTab(page, 'video');
    await assertMobile2x2TabGrid(page);
    await assertNoHorizontalOverflow(page, 'mobile tab4');
    await assertNoElementClipping(page, 'mobile tab4');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    const dlVid = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dlVid.filePath);

    errors.assertClean();
    errors.detach();
  });

  test('T4-04: Desktop 1440x900 Full Flow (Zero Console Errors + Clipboard Quick-Copy)', async ({ page, context }) => {
    await grantClipboardPermissions(context);
    await installClipboardSpy(page);
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await assertTabGridLayout(page, 'desktop-1x4');
    await assertNoHorizontalOverflow(page, 'desktop 1440');
    await assertNoElementClipping(page, 'desktop 1440');

    const seenClips = new Set<string>();
    for (const ch of ['facebook', 'instagram', 'tiktok', 'google_rsa'] as const) {
      await clearClipboardSpy(page);
      await loc.tab1.channelCard(ch).copyBtn.click();
      await expect(loc.tab1.channelCard(ch).card).toContainText(RX.copiedFeedback);
      const clip = await readClipboardWithFallback(page);
      expect(clip).toContain('https://wa.me/60123456789?text=');
      expect(clip).toMatch(/SUDUT-|Segera|urgency|Promosi/i);
      expect(seenClips.has(clip), `Channel ${ch} copied duplicate clipboard content`).toBe(false);
      seenClips.add(clip);
    }

    await openTab(page, 'carousel');
    const dlPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlPng.buffer, '9:16');

    await openTab(page, 'jingle');
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    const dlWav = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    assertValidAudioFileOrBuffer(dlWav.filePath, dlWav.buffer);

    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    const dlVid = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dlVid.filePath);

    net.assertSameOriginAndHealthy();
    errors.assertClean();
    net.detach();
    errors.detach();
  });

  test('T4-05: Complete Media Integrity & Forensic Validation (PNG + WAV + ffprobe Video)', async ({ browser }) => {
    // Path A: Tab 1 -> Tab 4 directly (fallback audio)
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const pageA = await ctxA.newPage();
    try {
      await gotoFreshApp(pageA);
      await completeOnboarding(pageA, { useDemoMode: true });
      await launchCampaign(pageA, { offerSentence: DEFAULT_OFFER });
      const locA = appLocators(pageA);

      await openTab(pageA, 'video');
      await confirmStoryboard(pageA);
      await locA.tab4.generateBtn.click();
      await verifyVideoElement(locA.tab4.videoPlayer, { timeoutMs: 35_000 });
      await expect(locA.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);
      const vidA = await captureDownload(pageA, () => locA.tab4.downloadBtn.click());
      assertValidVerticalVideoFile(vidA.filePath);
    } finally {
      await ctxA.close();
    }

    // Path B: Tab 2 (9:16 OFF/ON + 4:5), Tab 3 (2 styles diff), Tab 4 (Tab 3 jingle mux)
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const pageB = await ctxB.newPage();
    try {
      await gotoFreshApp(pageB);
      await completeOnboarding(pageB, { useDemoMode: true });
      await launchCampaign(pageB, { offerSentence: DEFAULT_OFFER });
      const locB = appLocators(pageB);

      await openTab(pageB, 'carousel');
      await locB.tab2.aspect916Btn.click();
      if (await locB.tab2.safeZoneOverlay.isVisible().catch(() => false)) {
        await locB.tab2.safeZoneToggleBtn.click();
      }
      const pngOff = await captureDownload(pageB, () => locB.tab2.downloadPngBtn.click());
      assertValidSlidePng(pngOff.buffer, '9:16');
      await locB.tab2.safeZoneToggleBtn.click();
      const pngOn = await captureDownload(pageB, () => locB.tab2.downloadPngBtn.click());
      assertPngBytesIdentical(pngOff.buffer, pngOn.buffer, 'Forensic 9:16 safe-zone');

      await locB.tab2.aspect45Btn.click();
      const png45 = await captureDownload(pageB, () => locB.tab2.downloadPngBtn.click());
      assertValidSlidePng(png45.buffer, '4:5');

      await openTab(pageB, 'jingle');
      await locB.tab3.styleBtn('pop-ceria').click();
      await locB.tab3.generateBtn.click();
      const firstAudio = await verifyAudioElement(locB.tab3.audioPlayer);
      const wav1 = await captureDownload(pageB, () => locB.tab3.downloadBtn.click());
      const wav1Info = assertValidAudioFileOrBuffer(wav1.filePath, wav1.buffer);

      await locB.tab3.styleBtn('santai-akustik').click();
      await locB.tab3.generateBtn.click();
      await verifyAudioElement(locB.tab3.audioPlayer, { excludeSrc: firstAudio.currentSrc });
      const wav2 = await captureDownload(pageB, () => locB.tab3.downloadBtn.click());
      const wav2Info = assertValidAudioFileOrBuffer(wav2.filePath, wav2.buffer);
      expect(wav2Info.sha256).not.toBe(wav1Info.sha256);

      await openTab(pageB, 'video');
      await confirmStoryboard(pageB);
      await locB.tab4.generateBtn.click();
      await verifyVideoElement(locB.tab4.videoPlayer, { timeoutMs: 35_000 });
      await expect(locB.tab4.audioSourceBadge).toContainText(RX.tab3AudioBadge);
      const vidB = await captureDownload(pageB, () => locB.tab4.downloadBtn.click());
      assertValidVerticalVideoFile(vidB.filePath);
    } finally {
      await ctxB.close();
    }
  });

  test('T4-06: Multi-Language Client Pitch Workflow (BM <-> EN Mid-Campaign Without Data Loss)', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const pitchOffer = 'Pakej Kombo Kopi & Kek Jimat 20%.';
    await launchCampaign(page, { offerSentence: pitchOffer });
    const loc = appLocators(page);

    // Tab 1 edits in BM
    await loc.tab1.angleBtn('value').click();
    await loc.tab1.channelCard('facebook').editableField.fill('Kualiti Mantap Setiap Hari');
    await loc.tab1.cpa.priceInput.fill('250');

    const snapBm = await getActiveTabLanguageSnapshot(page);
    await toggleLanguage(page); // -> EN
    const snapEn = await getActiveTabLanguageSnapshot(page);
    assertBilingualLabelSwitched(snapBm.strategyLabel, snapEn.strategyLabel);
    await expect(loc.quickForm.offerInput).toHaveValue(pitchOffer);
    await expect(loc.tab1.channelCard('facebook').editableField).toHaveValue('Kualiti Mantap Setiap Hari');
    await expect(loc.tab1.cpa.priceInput).toHaveValue('250');

    // Tab 2 edit while in EN -> toggle back to BM
    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Promosi Pakej Jimat');
    await toggleLanguage(page); // -> BM
    await expect(loc.tab2.headlineInput).toHaveValue('Promosi Pakej Jimat');

    // Tab 3 edit -> toggle to EN
    await openTab(page, 'jingle');
    await loc.tab3.lyricsInput.fill('Jom ke Demo Bisnes Saya sekarang');
    await toggleLanguage(page); // -> EN
    await expect(loc.tab3.lyricsInput).toHaveValue('Jom ke Demo Bisnes Saya sekarang');

    // Tab 4 confirm -> toggle to BM -> generate video
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await toggleLanguage(page); // -> BM
    await expect(loc.tab4.confirmCheckbox).toBeChecked();
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });

    errors.assertClean();
    errors.detach();
  });
});

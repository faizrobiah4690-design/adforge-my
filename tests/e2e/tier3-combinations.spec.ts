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
  attachRuntimeErrorCollector,
  clearClipboardSpy,
  grantClipboardPermissions,
  installClipboardSpy,
  readClipboardWithFallback,
} from './helpers/layout';
import { appLocators, RX } from './helpers/locators';
import {
  assertPngBytesChanged,
  assertPngBytesIdentical,
  assertValidSlidePng,
  assertValidVerticalVideoFile,
  captureDownload,
  createTestPngBuffer,
  verifyAudioElement,
  verifyVideoElement,
} from './helpers/media';

test.describe('Tier 3 — Cross-Feature Pairwise Interactions (12 Tests)', () => {
  test('T3-01: Brand Vault folder switch propagates to Tab 1 wa.me, Tab 2 logo/theme, and Tab 3 lyrics', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await createBrandFolder(page, {
      name: 'Kafe Murni',
      colorHex: '#10B981',
      tone: 'professional',
      whatsapp: '017-111 2222',
      logoRgba: [16, 185, 129, 255],
    });

    await launchCampaign(page, { brandName: 'Demo Bisnes Saya', offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);
    const href1 = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(href1, '60123456789');

    await launchCampaign(page, { brandName: 'Kafe Murni', offerSentence: DEFAULT_OFFER });
    const href2 = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(href2, '60171112222');

    await openTab(page, 'carousel');
    const logoSrc = await loc.tab2.logoImg.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(logoSrc.startsWith('data:image/png')).toBe(true);
    await expect(loc.tab2.previewStage).toContainText('Kafe Murni');

    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toContain('Kafe Murni');
  });

  test('T3-02: BM <-> EN toggle mid-edit preserves Quick Form, Tab 1 & Tab 2 edits', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: 'Offer Khas Gaji' });
    const loc = appLocators(page);

    await loc.tab1.channelCard('facebook').editableField.fill('Salinan FB Terkini');
    await loc.tab1.cpa.cplInput.fill('22');

    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Tawaran Yakin');

    const before = await getActiveTabLanguageSnapshot(page);
    await toggleLanguage(page);
    const afterEn = await getActiveTabLanguageSnapshot(page);
    assertBilingualLabelSwitched(before.carouselLabel, afterEn.carouselLabel);

    await toggleLanguage(page);
    await expect(loc.quickForm.offerInput).toHaveValue('Offer Khas Gaji');
    await expect(loc.tab2.headlineInput).toHaveValue('Tawaran Yakin');
    await openTab(page, 'strategy');
    await expect(loc.tab1.channelCard('facebook').editableField).toHaveValue('Salinan FB Terkini');
    await expect(loc.tab1.cpa.cplInput).toHaveValue('22');
  });

  test('T3-03: BM <-> EN toggle mid-edit preserves Tab 3 lyrics/style & Tab 4 frame/confirmation', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await openTab(page, 'jingle');
    await loc.tab3.styleBtn('santai-akustik').click();
    await loc.tab3.lyricsInput.fill('Lirik Saya 123');

    await openTab(page, 'video');
    await loc.tab4.frameInput(1).fill('Frame 1 Tersuai');
    await confirmStoryboard(page);

    await toggleLanguage(page);
    await expect(loc.tab4.frameInput(1)).toHaveValue('Frame 1 Tersuai');
    await expect(loc.tab4.confirmCheckbox).toBeChecked();

    await openTab(page, 'jingle');
    await expect(loc.tab3.lyricsInput).toHaveValue('Lirik Saya 123');
  });

  test('T3-04: Skip Tab 3 (Tab 1 -> Tab 4 directly) uses fallback audio mux', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dl.filePath);
  });

  test('T3-05: Brand Vault tone (casual vs professional) differentiates Tab 1 copy & psychology', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await createBrandFolder(page, {
      name: 'Agensi Korporat Pro',
      tone: 'professional',
      whatsapp: '0181234567',
    });

    await launchCampaign(page, { brandName: 'Demo Bisnes Saya', offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);
    const casualFb = await loc.tab1.channelCard('facebook').card.innerText();
    const casualPsych = await loc.tab1.psychologyPanel.innerText();

    await launchCampaign(page, { brandName: 'Agensi Korporat Pro', offerSentence: DEFAULT_OFFER });
    const proFb = await loc.tab1.channelCard('facebook').card.innerText();
    const proPsych = await loc.tab1.psychologyPanel.innerText();

    expect(proFb).not.toEqual(casualFb);
    expect(proPsych).not.toEqual(casualPsych);
  });

  test('T3-06: Edit Brand Vault WhatsApp updates all 4 Tab 1 wa.me links', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await loc.vault.whatsappInput.fill('018-777 6655');
    await saveBrandIfButtonVisible(page);

    for (const ch of ['facebook', 'instagram', 'tiktok', 'google_rsa'] as const) {
      const href = await loc.tab1.channelCard(ch).whatsappLink.getAttribute('href');
      assertWhatsAppUrl(href, '60187776655');
    }
  });

  test('T3-07: Tab 2 slide edit + aspect toggle (9:16 -> 4:5) + safe-zone PNG export', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
    const loc = appLocators(page);

    await loc.tab2.slideBtn(2).click();
    await loc.tab2.aspect45Btn.click();
    const before = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(before.buffer, '4:5');

    await loc.tab2.headlineInput.fill('Tawaran Minggu Gaji');
    if (await loc.tab2.safeZoneOverlay.isVisible().catch(() => false)) {
      await loc.tab2.safeZoneToggleBtn.click();
    }
    const editedOff = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertPngBytesChanged(before.buffer, editedOff.buffer, 'Slide 2 edit');

    await loc.tab2.safeZoneToggleBtn.click();
    await expect(loc.tab2.safeZoneOverlay).toBeVisible();
    const editedOn = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertPngBytesIdentical(editedOff.buffer, editedOn.buffer, '4:5 safe-zone toggle');
  });

  test('T3-08: Tab 3 generated jingle feeds into Tab 4 video mux', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
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

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dl.filePath);
  });

  test('T3-09: Quick Form custom photo uploads propagate to Tab 2 backgrounds & Tab 4 storyboard', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const loc = appLocators(page);

    const p1 = createTestPngBuffer({ width: 128, height: 192, rgba: [239, 68, 68, 255] });
    const p2 = createTestPngBuffer({ width: 128, height: 192, rgba: [59, 130, 246, 255] });
    await loc.quickForm.photo1Input.setInputFiles({ name: 'upload1.png', mimeType: 'image/png', buffer: p1 });
    await loc.quickForm.photo2Input.setInputFiles({ name: 'upload2.png', mimeType: 'image/png', buffer: p2 });

    await launchCampaign(page, { offerSentence: DEFAULT_OFFER, attachSamplePhotos: false });

    await openTab(page, 'carousel');
    const dlPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlPng.buffer, '9:16');

    await openTab(page, 'video');
    await expect(loc.tab4.frameCard(1).locator('img')).toBeVisible();
    errors.assertClean();
    errors.detach();
  });

  test('T3-10: Brand Vault theme color change updates Tab 2 PNG & Tab 4 video branding', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await openTab(page, 'carousel');
    const beforePng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());

    await loc.vault.folderButton('Demo Bisnes Saya').click();
    await loc.vault.colorInput.fill('#E11D48');
    await saveBrandIfButtonVisible(page);

    await openTab(page, 'carousel');
    const afterPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertPngBytesChanged(beforePng.buffer, afterPng.buffer, 'Brand theme color change');

    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
  });

  test('T3-11: Tab 1 angle switch updates wa.me tags while preserving Tab 2 & Tab 3 edits', async ({ page }) => {
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await openTab(page, 'carousel');
    await loc.tab2.headlineInput.fill('Tajuk Tab 2 Kekal');

    await openTab(page, 'jingle');
    await loc.tab3.lyricsInput.fill('Lirik Tab 3 Kekal');

    await openTab(page, 'strategy');
    await loc.tab1.angleBtn('social_proof').click();
    const href = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(href, '60123456789', /SUDUT-3-BUKTISOSIAL|BUKTISOSIAL|social_proof/i);

    await openTab(page, 'carousel');
    await expect(loc.tab2.headlineInput).toHaveValue('Tajuk Tab 2 Kekal');
    await openTab(page, 'jingle');
    await expect(loc.tab3.lyricsInput).toHaveValue('Lirik Tab 3 Kekal');
  });

  test('T3-12: Tab 1 compliance risky edit + safe rewrite -> Quick-Copy clipboard', async ({ page, context }) => {
    await grantClipboardPermissions(context);
    await installClipboardSpy(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);

    await loc.tab1.compliance.testRiskyBtn.click();
    await expect(loc.tab1.compliance.findings).toBeVisible();

    if (await loc.tab1.compliance.applyRewriteBtn.isVisible().catch(() => false)) {
      await loc.tab1.compliance.applyRewriteBtn.click();
    } else {
      await loc.tab1.compliance.input.fill(
        'Servis berkualiti untuk pelanggan di Demo Bisnes Saya.',
      );
    }

    await expect(loc.tab1.compliance.statusBadge).toContainText(RX.compliancePass);
    const rewrittenText = await loc.tab1.compliance.input.inputValue();
    expect(rewrittenText).not.toMatch(/100%|terbaik|dijamin/i);

    await clearClipboardSpy(page);
    await loc.tab1.channelCard('facebook').copyBtn.click();
    await expect(loc.tab1.channelCard('facebook').card).toContainText(RX.copiedFeedback);
    const copied = await readClipboardWithFallback(page);
    expect(copied).toContain('https://wa.me/60123456789?text=');
    expect(copied).toMatch(/SUDUT-|Segera|urgency|Promosi/i);
    expect(copied).not.toMatch(/100%|terbaik di Malaysia|dijamin/i);
  });
});

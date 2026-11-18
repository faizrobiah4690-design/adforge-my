import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  assertWhatsAppUrl,
  completeOnboarding,
  confirmStoryboard,
  createBrandFolder,
  DEFAULT_OFFER,
  gotoFreshApp,
  launchCampaign,
  openTab,
  saveBrandIfButtonVisible,
  setBrandTone,
  toggleLanguage,
} from './helpers/app';
import {
  assertNoElementClipping,
  assertNoHorizontalOverflow,
  attachNetworkOriginAuditor,
  attachRuntimeErrorCollector,
  clearClipboardSpy,
  grantClipboardPermissions,
  installClipboardSpy,
  readClipboardWithFallback,
} from './helpers/layout';
import { appLocators, RX } from './helpers/locators';
import {
  assertPngBytesChanged,
  assertValidAudioFileOrBuffer,
  assertValidSlidePng,
  assertValidVerticalVideoFile,
  captureDownload,
  createTestPngBuffer,
  resolveMediaBinary,
  sha256Hex,
  verifyAudioElement,
  verifyVideoElement,
} from './helpers/media';

function createMockMp3Base64(): string {
  const ffmpegBin = resolveMediaBinary('ffmpeg');
  const buf = execFileSync(
    ffmpegBin,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=523:duration=2.5',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '96k',
      '-f',
      'mp3',
      'pipe:1',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return buf.toString('base64');
}

function createMockVerticalMp4Base64(): string {
  const ffmpegBin = resolveMediaBinary('ffmpeg');
  const tmpFile = path.join(os.tmpdir(), `adforge-m10-mock-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);
  try {
    execFileSync(
      ffmpegBin,
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x0ea5e9:s=360x640:r=24:d=2.5',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        tmpFile,
      ],
      { maxBuffer: 25 * 1024 * 1024 },
    );
    return fs.readFileSync(tmpFile).toString('base64');
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

test.describe('Tier 5 — Adversarial Coverage & Hardening (21 Tests)', () => {
  test('T5-01: JingleTab generatedStyle tracks synthesized audio independently from selected style until regenerated', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'jingle');

    const loc = appLocators(page);
    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    const popAudio = await verifyAudioElement(loc.tab3.audioPlayer);

    const dl1 = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(dl1.suggestedFilename).toContain('pop-ceria.wav');
    const wav1 = assertValidAudioFileOrBuffer(dl1.filePath, dl1.buffer);

    // Switch style without regenerating -> stale-style notice appears, filename/badge stay pop-ceria
    await loc.tab3.styleBtn('santai-akustik').click();
    await expect(page.getByTestId('jingle-stale-style-notice')).toBeVisible();
    await expect(loc.tab3.root).toContainText(/pop-ceria\s*•\s*5\.5s/i);

    const dlStale = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(dlStale.suggestedFilename).toContain('pop-ceria.wav');
    expect(sha256Hex(dlStale.buffer)).toBe(wav1.sha256);

    // Regenerate -> stale notice disappears, audio SHA-256 and download filename update to santai-akustik
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer, { excludeSrc: popAudio.currentSrc });
    await expect(page.getByTestId('jingle-stale-style-notice')).toHaveCount(0);

    const dl2 = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(dl2.suggestedFilename).toContain('santai-akustik.wav');
    const wav2 = assertValidAudioFileOrBuffer(dl2.filePath, dl2.buffer);
    expect(wav2.sha256).not.toBe(wav1.sha256);

    errors.assertClean();
    errors.detach();
  });

  test('T5-02: Concurrent launchCampaign mid-video-render never overwrites new campaign gated state', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: 'Kempen Pertama Untuk Lumba' });

    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    // Immediately relaunch Campaign 2 while Campaign 1 video is rendering
    await loc.quickForm.offerInput.fill('Kempen Kedua Baharu');
    await loc.quickForm.launchBtn.click();

    await page.waitForTimeout(3500);
    await openTab(page, 'video');

    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    await expect(loc.tab4.downloadBtn).toBeDisabled();
    await expect(loc.tab4.gateWarning).toBeVisible();

    errors.assertClean();
    errors.detach();
  });

  test('T5-03: VideoTab Path A -> Tab 3 pending notice -> re-render -> frame edit invalidates stale player', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);

    // Generate Tab 3 jingle after Path A video is already rendered
    await openTab(page, 'jingle');
    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);

    // Returning to Tab 4 shows pending Tab 3 notice until re-rendered
    await openTab(page, 'video');
    await expect(page.getByTestId('video-pending-tab3-notice')).toBeVisible();
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);

    // Re-render switches badge to Tab 3 and clears pending notice
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.tab3AudioBadge);
    await expect(page.getByTestId('video-pending-tab3-notice')).toHaveCount(0);

    // Editing frame 1 unconfirms gate, hides stale <video>, and disables download
    await loc.tab4.frameInput(1).fill('Bingkai Disunting Selepas Render');
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    await expect(loc.tab4.downloadBtn).toBeDisabled();

    errors.assertClean();
    errors.detach();
  });

  test('T5-04: VideoTab render error translates on BM/EN toggle, clears on frame edit, and recovers via Retry', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __forceVideoFail?: boolean };
      w.__forceVideoFail = true;

      if (typeof VideoEncoder !== 'undefined') {
        const origSupported = VideoEncoder.isConfigSupported.bind(VideoEncoder);
        VideoEncoder.isConfigSupported = async (cfg: VideoEncoderConfig) => {
          if (w.__forceVideoFail) {
            return { supported: false, config: cfg };
          }
          return origSupported(cfg);
        };
      }

      const OrigMediaRecorder = window.MediaRecorder;
      if (OrigMediaRecorder) {
        const WrappedMediaRecorder = function (
          this: MediaRecorder,
          stream: MediaStream,
          options?: MediaRecorderOptions
        ) {
          if (w.__forceVideoFail) {
            throw new Error('Forced encoder unavailable');
          }
          return new OrigMediaRecorder(stream, options);
        } as unknown as typeof MediaRecorder;
        WrappedMediaRecorder.isTypeSupported = OrigMediaRecorder.isTypeSupported.bind(OrigMediaRecorder);
        window.MediaRecorder = WrappedMediaRecorder;
      }
    });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    const alertBox = loc.tab4.root.getByRole('alert');
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/Gagal merender video menegak.*Forced encoder unavailable/i);

    // Toggle BM -> EN translates error prefix immediately
    await toggleLanguage(page, 'en');
    await expect(alertBox).toContainText(/Failed to render vertical video.*Forced encoder unavailable/i);

    // Editing a storyboard frame clears the error alert and unconfirms the gate
    await loc.tab4.frameInput(1).fill('Bingkai Baharu Selepas Ralat');
    await expect(alertBox).toHaveCount(0);
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();

    // Re-confirm and trigger failure once more so Retry Render recovery is exercised directly
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/Failed to render vertical video.*Forced encoder unavailable/i);

    // Retry succeeds once encoder is restored
    await page.evaluate(() => {
      (window as unknown as { __forceVideoFail?: boolean }).__forceVideoFail = false;
    });
    await alertBox.getByRole('button', { name: /Retry Render/i }).click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.root.getByRole('alert')).toHaveCount(0);
  });

  test('T5-05: QuickCampaignForm upload-busy guard + non-square logo & custom photo propagation through Tab 2 & Tab 4', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.addInitScript(() => {
      const origRead = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (blob: Blob) {
        setTimeout(() => {
          origRead.call(this, blob);
        }, 350);
      };
    });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    const loc = appLocators(page);

    // Non-square 160x40 PNG logo in Brand Vault
    await createBrandFolder(page, {
      name: 'Butik Logo Lebar',
      colorHex: '#10B981',
      tone: 'professional',
      whatsapp: '+019-777 6655',
    });
    const wideLogo = createTestPngBuffer({
      width: 160,
      height: 40,
      rgba: [16, 185, 129, 255],
      stripeRgba: [255, 255, 255, 255],
    });
    await loc.vault.logoInput.setInputFiles({
      name: 'wide-logo.png',
      mimeType: 'image/png',
      buffer: wideLogo,
    });
    await expect(loc.vault.saveBtn).toBeDisabled();
    await expect
      .poll(async () =>
        loc.vault.logoPreview.evaluate((img: HTMLImageElement) =>
          (img.currentSrc || img.src || '').startsWith('data:image/png'),
        ),
      )
      .toBe(true);
    await expect(loc.vault.saveBtn).toBeEnabled();
    await saveBrandIfButtonVisible(page);

    // Clear Photo 1, upload custom PNG -> Bina Kempen disabled while pending, enabled after data:image/ settles
    await loc.quickForm.photo1ClearBtn.click();
    const custom1 = createTestPngBuffer({ width: 120, height: 180, rgba: [239, 68, 68, 255] });
    const custom2 = createTestPngBuffer({ width: 120, height: 180, rgba: [59, 130, 246, 255] });

    await loc.quickForm.photo1Input.setInputFiles({
      name: 'custom-1.png',
      mimeType: 'image/png',
      buffer: custom1,
    });
    await expect(loc.quickForm.launchBtn).toBeDisabled();
    await expect
      .poll(async () =>
        loc.quickForm.photoSlot1
          .locator('img')
          .first()
          .evaluate((img: HTMLImageElement) => (img.currentSrc || img.src || '').startsWith('data:image/')),
      )
      .toBe(true);
    await expect(loc.quickForm.launchBtn).toBeEnabled();

    await loc.quickForm.photo2Input.setInputFiles({
      name: 'custom-2.png',
      mimeType: 'image/png',
      buffer: custom2,
    });
    await expect
      .poll(async () =>
        loc.quickForm.photoSlot2
          .locator('img')
          .first()
          .evaluate((img: HTMLImageElement) => (img.currentSrc || img.src || '').startsWith('data:image/')),
      )
      .toBe(true);
    await expect(loc.quickForm.launchBtn).toBeEnabled();

    await launchCampaign(page, {
      brandName: 'Butik Logo Lebar',
      offerSentence: DEFAULT_OFFER,
      attachSamplePhotos: false,
    });

    // Verify Tab 2 background & Tab 4 storyboard use custom data:image/ photos
    await openTab(page, 'carousel');
    const stageBgSrc = await loc.tab2.previewStage
      .locator('img')
      .first()
      .evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(stageBgSrc.startsWith('data:image/')).toBe(true);
    const dlPng = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(dlPng.buffer, '9:16');

    await openTab(page, 'video');
    const frame1Src = await loc.tab4
      .frameCard(1)
      .locator('img')
      .first()
      .evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(frame1Src.startsWith('data:image/')).toBe(true);
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    const dlVid = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dlVid.filePath);

    errors.assertClean();
    errors.detach();
  });

  test('T5-06: Corrupt localStorage sanitization + mid-campaign Brand Vault edits propagate across Tabs 1-4 preserving user edits', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'adforge_workbench:v1',
        JSON.stringify({
          version: 1,
          isLoggedIn: true,
          freelancerEmail: 'freelancer@studio.my',
          byokKey: '',
          isDemoMode: true,
          activeScreen: 'workbench',
          brands: [
            {
              id: 'demo-bisnes-saya',
              name: 'Demo Bisnes Saya',
              logoDataUrl: 'https://evil.example/tracker.png',
              themeColor: 'not-a-hex',
              tone: 'casual',
              whatsappNumber: 'not-a-phone',
              isSeeded: true,
              updatedAt: '2026-11-17T00:00:00.000Z',
            },
          ],
          activeBrandId: 'demo-bisnes-saya',
        }),
      );
    });
    await page.reload();

    const loc = appLocators(page);
    await expect(loc.vault.root).toBeVisible({ timeout: 10_000 });
    const recoveredLogo = await loc.vault.logoPreview.evaluate(
      (img: HTMLImageElement) => img.getAttribute('src') ?? '',
    );
    expect(recoveredLogo).toBe('/assets/brands/demo-brand-logo.png');
    await expect(loc.vault.whatsappInput).toHaveValue('60123456789');

    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const casualFbBefore = await loc.tab1.channelCard('facebook').card.innerText();

    // Edit Tab 2 Slide 1 & Tab 3 lyrics, capture Slide 4 PNG before Brand Vault edit
    await openTab(page, 'carousel');
    await loc.tab2.slideBtn(1).click();
    await loc.tab2.headlineInput.fill('Tajuk Slaid 1 Kekal');
    await loc.tab2.slideBtn(4).click();
    const slide4Before = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());

    await openTab(page, 'jingle');
    await loc.tab3.lyricsInput.fill('Lirik Kekal Disunting Pengguna');

    // Edit active Brand Vault folder mid-campaign (+019 normalization + name + tone)
    await loc.vault.activeNameInput.fill('Kedai Baharu Pro');
    await setBrandTone(page, 'professional');
    await loc.vault.whatsappInput.fill('+019-999 8888');
    await saveBrandIfButtonVisible(page);
    await expect(loc.vault.whatsappInput).toHaveValue('60199998888');

    // Tab 1 reflects updated phone, brand name, and professional tone
    await openTab(page, 'strategy');
    const fbHref = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(fbHref, '60199998888');
    await expect(loc.tab1.psychologyPanel).toContainText('Kedai Baharu Pro');
    const proFbAfter = await loc.tab1.channelCard('facebook').card.innerText();
    expect(proFbAfter).not.toBe(casualFbBefore);
    await expect(loc.tab1.channelCard('facebook').card).toContainText('Kedai Baharu Pro');

    // Tab 2 preserves edited Slide 1 while Slide 4 updates & PNG bytes change
    await openTab(page, 'carousel');
    await loc.tab2.slideBtn(1).click();
    await expect(loc.tab2.headlineInput).toHaveValue('Tajuk Slaid 1 Kekal');
    await loc.tab2.slideBtn(4).click();
    await expect(loc.tab2.previewStage).toContainText('Kedai Baharu Pro');
    await expect(loc.tab2.previewStage).toContainText('+60199998888');
    const slide4After = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertPngBytesChanged(slide4Before.buffer, slide4After.buffer, 'Mid-campaign brand update Slide 4');

    // Tab 3 preserves user-edited lyrics
    await openTab(page, 'jingle');
    await expect(loc.tab3.lyricsInput).toHaveValue('Lirik Kekal Disunting Pengguna');

    // Tab 4 Frame 1 & Frame 4 update reactively
    await openTab(page, 'video');
    await expect(loc.tab4.frameInput(1)).toHaveValue(/Kedai Baharu Pro/);
    await expect(loc.tab4.frameInput(4)).toHaveValue(/\+60199998888/);

    // Creating & selecting an unlaunched Brand B + typing an unlaunched offer draft
    // MUST NOT mutate Campaign A across Tabs 1-4 until Bina Kempen is clicked
    await createBrandFolder(page, {
      name: 'Kedai Belum Lancar',
      colorHex: '#EF4444',
      tone: 'casual',
      whatsapp: '017-555 4433',
    });
    await loc.quickForm.offerInput.fill('Draf Belum Lancar Tier5');

    await openTab(page, 'strategy');
    await expect(loc.tab1.psychologyPanel).toContainText('Kedai Baharu Pro');
    await expect(loc.tab1.psychologyPanel).toContainText(DEFAULT_OFFER);
    await expect(loc.tab1.psychologyPanel).not.toContainText('Kedai Belum Lancar');
    await expect(loc.tab1.psychologyPanel).not.toContainText('Draf Belum Lancar Tier5');
    const fbStillHref = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(fbStillHref, '60199998888');

    await openTab(page, 'carousel');
    await loc.tab2.slideBtn(4).click();
    await expect(loc.tab2.previewStage).toContainText('Kedai Baharu Pro');
    await expect(loc.tab2.previewStage).not.toContainText('Kedai Belum Lancar');

    await loc.vault.folderButton('Kedai Baharu Pro').click();
    await openTab(page, 'strategy');
    const fbAfterReturnHref = await loc.tab1.channelCard('facebook').whatsappLink.getAttribute('href');
    assertWhatsAppUrl(fbAfterReturnHref, '60199998888');

    net.assertSameOriginAndHealthy();
    errors.assertClean();
    net.detach();
    errors.detach();
  });

  test('T5-07: Mobile 320/360/390 extreme unbroken brand/offer zero clipping across Onboarding, Vault, Form, Tabs 1-4 + html lang sync + Escape modal + clipboard fallback', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error('Clipboard blocked');
            },
          },
        });
      } catch {
        // Ignore if non-configurable
      }
    });

    await gotoFreshApp(page);

    for (const vp of [
      { width: 320, height: 700 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      await assertNoHorizontalOverflow(page, `${vp.width} onboarding`);
      await assertNoElementClipping(page, `${vp.width} onboarding`);
    }

    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);

    // html lang attribute tracks BM <-> EN toggle & Escape dismisses API settings modal
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ms');
    await toggleLanguage(page, 'en');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await toggleLanguage(page, 'ms');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ms');

    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(loc.onboarding.settingsModal).toHaveCount(0);

    // Extreme unbroken 64-char brand name & 212-char offer
    const extremeBrand = 'KedaiKopiDanRotiBakarWarisanNenekKebayanUltraPanjangTanpaRuang2026';
    const extremeOffer = 'PromosiPakejIstimewaSempenaMingguGajiUntukSemuaPelangganBaruDanLama_' + 'X'.repeat(140);

    await createBrandFolder(page, {
      name: extremeBrand,
      whatsapp: '012-345 6789',
    });
    await launchCampaign(page, {
      brandName: extremeBrand,
      offerSentence: extremeOffer,
    });

    // Clipboard rejection falls back cleanly to execCommand('copy')
    await loc.tab1.channelCard('facebook').copyBtn.click();
    await expect(loc.tab1.channelCard('facebook').card).toContainText(RX.copiedFeedback);

    for (const vp of [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
      { width: 320, height: 700 },
    ]) {
      await page.setViewportSize(vp);

      const folderMetrics = await loc.vault.folderButton(extremeBrand).evaluate((btn) => {
        const bRect = btn.getBoundingClientRect();
        const span = btn.querySelector('span:last-of-type');
        const sRect = span?.getBoundingClientRect();
        return {
          scrollWidth: btn.scrollWidth,
          clientWidth: btn.clientWidth,
          btnRight: bRect.right,
          spanRight: sRect?.right ?? 0,
        };
      });
      expect(folderMetrics.scrollWidth).toBeLessThanOrEqual(folderMetrics.clientWidth + 2);
      expect(folderMetrics.spanRight).toBeLessThanOrEqual(folderMetrics.btnRight + 1);

      for (const tab of ['strategy', 'carousel', 'jingle', 'video'] as const) {
        await openTab(page, tab);
        await assertNoHorizontalOverflow(page, `${vp.width} extreme ${tab}`);
        await assertNoElementClipping(page, `${vp.width} extreme ${tab}`);

        if (tab === 'carousel') {
          const pillMetrics = await page.getByTestId('carousel-layer2-brand-pill').evaluate((pill) => {
            const pRect = pill.getBoundingClientRect();
            const span = pill.querySelector('span:last-of-type');
            const sRect = span?.getBoundingClientRect();
            return {
              viewportWidth: document.documentElement.clientWidth,
              pillRight: pRect.right,
              spanRight: sRect?.right ?? 0,
            };
          });
          expect(pillMetrics.pillRight).toBeLessThanOrEqual(pillMetrics.viewportWidth + 1);
          expect(pillMetrics.spanRight).toBeLessThanOrEqual(pillMetrics.pillRight + 1);
          expect(pillMetrics.spanRight).toBeLessThanOrEqual(pillMetrics.viewportWidth + 1);
        }
      }
    }

    errors.assertClean();
    errors.detach();
  });

  test('T5-08: Tab 4 mid-render tab switch (tab-video -> tab-strategy -> tab-video) never deadlocks and exports valid 9:16 video', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.route('**/assets/audio/fallback-jingle.wav', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();

    // Immediately switch away to Tab 1 while Tab 4 is rendering
    await openTab(page, 'strategy');
    await expect(loc.tab1.psychologyPanel).toBeVisible();
    await page.waitForTimeout(3500);

    // Return to Tab 4 -> never deadlocked; either finished rendering or completes cleanly
    await openTab(page, 'video');
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.generateBtn).toBeEnabled();
    await expect(loc.tab4.confirmCheckbox).toBeEnabled();
    await expect(loc.tab4.frameInput(1)).toBeEnabled();
    await expect(loc.tab4.downloadBtn).toBeEnabled();

    const dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(dl.filePath);

    errors.assertClean();
    errors.detach();
  });

  test('T5-09: JingleTab mid-synthesis tab switch (tab-jingle -> tab-video) completes cleanly and unlocks Tab 3 & Tab 4', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.addInitScript(() => {
      const Ctx = window.OfflineAudioContext;
      if (Ctx && Ctx.prototype && typeof Ctx.prototype.startRendering === 'function') {
        const origStart = Ctx.prototype.startRendering;
        Ctx.prototype.startRendering = function (this: OfflineAudioContext) {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              origStart.call(this).then(resolve, reject);
            }, 650);
          });
        };
      }
    });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);
    await openTab(page, 'jingle');
    await loc.tab3.styleBtn('santai-akustik').click();
    await loc.tab3.generateBtn.click();

    // Immediately switch to Tab 4 while OfflineAudioContext.startRendering is still pending
    await openTab(page, 'video');
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.tab3AudioBadge, { timeout: 10_000 });

    // Return to Tab 3 -> audio player mounted and WAV download enabled
    await openTab(page, 'jingle');
    await verifyAudioElement(loc.tab3.audioPlayer);
    await expect(loc.tab3.downloadBtn).toBeEnabled();
    const dl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(dl.suggestedFilename).toContain('santai-akustik.wav');
    assertValidAudioFileOrBuffer(dl.filePath, dl.buffer);

    errors.assertClean();
    errors.detach();
  });

  test('T5-10: api-settings-modal keeps single onboarding-demo-badge, inert background, trapped Tab focus, and clean Sign Out', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();

    // Strict single onboarding-demo-badge inside modal (vault badge switches to vault-demo-badge)
    await expect(page.getByTestId('onboarding-demo-badge')).toHaveCount(1);
    await expect(loc.onboarding.settingsModal.getByTestId('onboarding-demo-badge')).toBeVisible();
    await expect(page.getByTestId('vault-demo-badge')).toHaveCount(1);

    // Background <header> and <main> wrapper are inert and aria-hidden="true"
    const bgState = await page.evaluate(() => {
      const header = document.querySelector('header');
      const mainWrap = document.querySelector('main')?.parentElement;
      return {
        headerInert: Boolean(header?.hasAttribute('inert')),
        headerAriaHidden: header?.getAttribute('aria-hidden'),
        mainInert: Boolean(mainWrap?.hasAttribute('inert')),
        mainAriaHidden: mainWrap?.getAttribute('aria-hidden'),
      };
    });
    expect(bgState).toEqual({
      headerInert: true,
      headerAriaHidden: 'true',
      mainInert: true,
      mainAriaHidden: 'true',
    });

    // Initial focus starts inside modal and pressing Tab 12 times never escapes into header or main
    await expect(loc.onboarding.settingsCloseBtn).toBeFocused();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const focusLoc = await page.evaluate(() => {
        const el = document.activeElement;
        const modal = document.querySelector('[data-testid="api-settings-modal"]');
        const main = document.querySelector('main');
        const header = document.querySelector('header');
        return {
          inModal: Boolean(el && modal?.contains(el)),
          inMain: Boolean(el && main?.contains(el)),
          inHeader: Boolean(el && header?.contains(el)),
        };
      });
      expect(focusLoc.inModal).toBe(true);
      expect(focusLoc.inMain).toBe(false);
      expect(focusLoc.inHeader).toBe(false);
    }

    // Sign Out inside modal re-gates WorkspaceShell and disables nav-workbench
    await loc.onboarding.settingsModal.getByRole('button', { name: /Log Keluar|Sign Out/i }).click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);
    await expect(loc.vault.root).toHaveCount(0);
    await expect(loc.onboarding.googleLoginBtn).toBeVisible();
    await expect(page.getByTestId('nav-workbench')).toBeDisabled();

    errors.assertClean();
    errors.detach();
  });

  test('T5-11: StrategyTab Gemini BYOK E2E (absent in demo, mid-flight angle-switch notice isolation, sanitization, HTTP 500 fallback) & RSA accessible labels', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);

    // 1. Demo Mode hides Enhance with Gemini (BYOK)
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    const loc = appLocators(page);
    await expect(loc.tab1.root.getByRole('button', { name: /Gemini/i })).toHaveCount(0);

    // Sign out and re-enter with a valid BYOK key
    await loc.headerApiSettings.click();
    await loc.onboarding.settingsModal.getByRole('button', { name: /Log Keluar|Sign Out/i }).click();
    await completeOnboarding(page, { useDemoMode: false, apiKey: 'sk-live-tier5-key-123456' });

    // Mock initial launchCampaign auto-vision call cleanly before manual enhance test
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
      });
    });

    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    // 2. Google RSA H1-H3 and D1-D2 resolve via getByLabel
    const rsaCard = loc.tab1.channelCard('google_rsa').card;
    for (const label of ['H1', 'H2', 'H3', 'D1', 'D2']) {
      await expect(rsaCard.getByLabel(label, { exact: true })).toBeVisible();
    }

    // Wait for initial auto-vision settle before replacing route handler for manual enhance test
    await expect(page.getByTestId('generate-new-variation-btn')).toBeEnabled({ timeout: 5_000 });
    await page.unroute('https://generativelanguage.googleapis.com/**');

    // 3. Mock Gemini API: call 1 delayed 450ms with risky + overlong RSA; call 2 HTTP 500 fallback
    let callCount = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      callCount += 1;
      if (callCount === 1) {
        await new Promise((r) => setTimeout(r, 450));
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
                        facebook: {
                          primaryText: 'Produk anda kusam? 100% dijamin terbaik bersama pakar kami.',
                          headline: 'Tawaran Mantap Gemini',
                          description: 'Konsultasi profesional',
                        },
                        google_rsa: {
                          headlines: [
                            'Tajuk Google RSA Sangat Panjang Melebihi Tiga Puluh Aksara',
                            'Slot Pakej Promo',
                            'Konsultasi Kedai',
                          ],
                          descriptions: [
                            'Penerangan Google RSA yang sengaja dibuat melebihi sembilan puluh aksara untuk menguji pemangkasan selamat.',
                            'Tempah slot konsultasi hari ini.',
                          ],
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({ status: 500, body: 'Upstream error' });
    });

    const enhanceBtn = loc.tab1.root.getByRole('button', { name: /Gemini/i });
    await enhanceBtn.click();

    // Switch to social_proof mid-flight -> social_proof must NOT display Gemini enhancement notice
    await loc.tab1.angleBtn('social_proof').click();
    await expect(page.getByTestId('strategy-enhance-notice')).toHaveCount(0);
    await expect(enhanceBtn).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByTestId('strategy-enhance-notice')).toHaveCount(0);

    // Switch back to urgency -> shows Gemini notice and sanitized RSA/FB copy
    await loc.tab1.angleBtn('urgency').click();
    await expect(page.getByTestId('strategy-enhance-notice')).toContainText(/Salinan dipertingkat oleh Gemini/i);
    const fbText = await loc.tab1.channelCard('facebook').card.locator('textarea').inputValue();
    expect(fbText).not.toMatch(/100%|dijamin|terbaik/i);
    const rsaH1 = await rsaCard.getByLabel('H1', { exact: true }).inputValue();
    const rsaD1 = await rsaCard.getByLabel('D1', { exact: true }).inputValue();
    expect(rsaH1.length).toBeGreaterThan(0);
    expect(rsaH1.length).toBeLessThanOrEqual(30);
    expect(rsaD1.length).toBeGreaterThan(0);
    expect(rsaD1.length).toBeLessThanOrEqual(90);

    // Trigger HTTP 500 on social_proof -> falls back cleanly to baseline template notice
    await loc.tab1.angleBtn('social_proof').click();
    await enhanceBtn.click();
    await expect(page.getByTestId('strategy-enhance-notice')).toContainText(/templat selamat terbina/i);

    expect(
      errors.errors.every(
        (entry) =>
          entry.kind === 'console.error' &&
          /status of 500/i.test(entry.message) &&
          (entry.location ?? '').includes('generativelanguage.googleapis.com'),
      ),
    ).toBe(true);
    errors.assertClean([/status of 500/i]);
    errors.detach();
  });

  test('T5-12: JingleTab Reset lyrics + VideoTab hasPendingTab3Update on Tab 3 regeneration & ready->error frame-edit invalidation', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __forceRenderFail?: boolean };
      w.__forceRenderFail = false;

      if (typeof VideoEncoder !== 'undefined') {
        const origSupported = VideoEncoder.isConfigSupported.bind(VideoEncoder);
        VideoEncoder.isConfigSupported = async (cfg: VideoEncoderConfig) => {
          if (w.__forceRenderFail) {
            return { supported: false, config: cfg };
          }
          return origSupported(cfg);
        };
      }

      const OrigMediaRecorder = window.MediaRecorder;
      if (OrigMediaRecorder) {
        const WrappedMediaRecorder = function (
          this: MediaRecorder,
          stream: MediaStream,
          options?: MediaRecorderOptions
        ) {
          if (w.__forceRenderFail) {
            throw new Error('Forced second render failure');
          }
          return new OrigMediaRecorder(stream, options);
        } as unknown as typeof MediaRecorder;
        WrappedMediaRecorder.isTypeSupported = OrigMediaRecorder.isTypeSupported.bind(OrigMediaRecorder);
        window.MediaRecorder = WrappedMediaRecorder;
      }
    });

    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);

    // 1. Tab 3 Reset lyrics restores baseline brand + offer lyrics
    await openTab(page, 'jingle');
    const baselineLyrics = await loc.tab3.lyricsInput.inputValue();
    await loc.tab3.lyricsInput.fill('Lirik Sementara Sebelum Reset');
    await page.getByTestId('jingle-reset-lyrics-btn').click();
    await expect(loc.tab3.lyricsInput).toHaveValue(baselineLyrics);

    await loc.tab3.styleBtn('pop-ceria').click();
    await loc.tab3.generateBtn.click();
    const popAudio = await verifyAudioElement(loc.tab3.audioPlayer);

    // 2. Render Tab 4 with pop-ceria -> no pending Tab 3 notice
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.tab3AudioBadge);
    await expect(page.getByTestId('video-pending-tab3-notice')).toHaveCount(0);

    // 3. Regenerate Tab 3 with korporat-segar -> returning to Tab 4 MUST show video-pending-tab3-notice
    await openTab(page, 'jingle');
    await loc.tab3.styleBtn('korporat-segar').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer, { excludeSrc: popAudio.currentSrc });

    await openTab(page, 'video');
    await expect(page.getByTestId('video-pending-tab3-notice')).toBeVisible();

    // 4. Force ready -> error on second render, then edit frame 1 -> clears alert & stale player
    await page.evaluate(() => {
      (window as unknown as { __forceRenderFail?: boolean }).__forceRenderFail = true;
    });
    await loc.tab4.generateBtn.click();
    const alertBox = loc.tab4.root.getByRole('alert');
    await expect(alertBox).toBeVisible();

    await loc.tab4.frameInput(1).fill('Bingkai Disunting Selepas Ralat Kedua');
    await expect(alertBox).toHaveCount(0);
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    await expect(loc.tab4.downloadBtn).toBeDisabled();

    // 5. Recover render -> clears pending notice
    await page.evaluate(() => {
      (window as unknown as { __forceRenderFail?: boolean }).__forceRenderFail = false;
    });
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(page.getByTestId('video-pending-tab3-notice')).toHaveCount(0);

    errors.assertClean();
    errors.detach();
  });

  test('T5-13: QuickCampaignForm 3rd sample photo + CarouselTab photo switcher, stage headline focus, and subheadline/badge/cta PNG propagation', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);

    // Open sample-photo-picker-0 and select the 3rd sample photo (business-service-3.png)
    await loc.quickForm.photo1SampleBtn.click();
    await loc.quickForm.photoSlot1.locator('.grid.grid-cols-3 button').nth(2).click();
    await expect(loc.quickForm.photoSlot1.locator('img').first()).toHaveAttribute(
      'src',
      /business-service-3\.png/i,
    );

    await launchCampaign(page, {
      offerSentence: DEFAULT_OFFER,
      attachSamplePhotos: false,
    });

    await openTab(page, 'carousel');

    // Slide 1 initially uses business-service-3.png
    const stageBgImg = loc.tab2.previewStage.locator('img').first();
    await expect(stageBgImg).toHaveAttribute('src', /business-service-3\.png/i);
    const png1 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(png1.buffer, '9:16');

    // Switch Slide 1 Layer 1 photo to Photo 2 (business-product-2.png) -> PNG bytes change
    await page.getByTestId('carousel-photo-btn-1').click();
    await expect(stageBgImg).toHaveAttribute('src', /business-product-2\.png/i);
    const png2 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertPngBytesChanged(png1.buffer, png2.buffer, 'Layer 1 photo switch');

    // Click stage headline -> focuses carousel-headline-input
    await loc.tab2.previewStage.getByTitle(/Klik untuk sunting tajuk|Click to edit headline/i).click();
    await expect(loc.tab2.headlineInput).toBeFocused();

    // Edit subheadline, badge, and CTA -> updates live preview & PNG bytes
    await loc.tab2.subheadlineInput.fill('Subtajuk Kemas Kini Tier 5');
    await page.getByTestId('carousel-badge-input').fill('PROMO TERHAD');
    await page.getByTestId('carousel-cta-input').fill('Tempah Slot');

    await expect(loc.tab2.previewStage).toContainText('Subtajuk Kemas Kini Tier 5');
    await expect(loc.tab2.previewStage).toContainText('PROMO TERHAD');
    await expect(loc.tab2.previewStage).toContainText('Tempah Slot');

    const png3 = await captureDownload(page, () => loc.tab2.downloadPngBtn.click());
    assertValidSlidePng(png3.buffer, '9:16');
    assertPngBytesChanged(png2.buffer, png3.buffer, 'Subheadline/badge/CTA live edit');

    errors.assertClean();
    errors.detach();
  });

  test('T5-14: StrategyTab mid-flight BYOK Gemini survives tab switch (tab-strategy -> tab-carousel -> tab-strategy), Vault swatch + invalid_wa guard, Shift+Tab modal wrap, and compliance reset', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: false, apiKey: 'sk-live-tier5-fourteen-12345' });

    const loc = appLocators(page);

    // 1. BrandVaultScreen preset swatch + invalid_wa persistence on name/color edits
    const emeraldSwatch = loc.vault.root.getByRole('button', { name: '#10B981' });
    await emeraldSwatch.click();
    await expect(emeraldSwatch).toHaveAttribute('aria-pressed', 'true');
    await expect(loc.vault.colorInput).toHaveValue('#10b981');

    await loc.vault.whatsappInput.fill('123');
    await loc.vault.whatsappInput.blur();
    await expect(loc.vault.errorMsg).toBeVisible();

    await loc.vault.activeNameInput.fill('Bisnes Impian Tier5');
    await expect(loc.vault.errorMsg).toBeVisible();
    await loc.vault.root.getByRole('button', { name: '#F59E0B' }).click();
    await expect(loc.vault.errorMsg).toBeVisible();

    await loc.vault.whatsappInput.fill('012-345 6789');
    await expect(loc.vault.errorMsg).toHaveCount(0);

    // 2. api-settings-modal Shift+Tab wrap & Escape focus restoration to nav-onboarding
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await expect(loc.onboarding.settingsCloseBtn).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(loc.onboarding.videoGuide).toBeFocused();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab');
      const inModal = await page.evaluate(() => {
        const el = document.activeElement;
        const modal = document.querySelector('[data-testid="api-settings-modal"]');
        return Boolean(el && modal?.contains(el));
      });
      expect(inModal).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(loc.onboarding.settingsModal).toHaveCount(0);
    await expect(loc.headerApiSettings).toBeFocused();

    // 3. Launch campaign & intercept Gemini API with 500ms delay
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
      });
    });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await expect(page.getByTestId('generate-new-variation-btn')).toBeEnabled({ timeout: 5_000 });
    await page.unroute('https://generativelanguage.googleapis.com/**');

    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
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
                      facebook: {
                        primaryText: 'Salinan Gemini selamat merentas pertukaran tab bersama pasukan bertauliah.',
                        headline: 'GEMINI_SURVIVED_TAB_SWITCH',
                        description: 'Konsultasi profesional',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    const enhanceBtn = loc.tab1.root.getByRole('button', { name: /Gemini/i });
    await enhanceBtn.click();

    // Immediately switch to Carousel tab while Gemini BYOK request is in flight
    await openTab(page, 'carousel');
    await expect(loc.tab2.previewStage).toBeVisible();
    await page.waitForTimeout(800);

    // Return to Strategy tab -> enhanced copy & notice survive unmount/remount, isolated per angle
    await openTab(page, 'strategy');
    await expect(page.getByTestId('strategy-enhance-notice')).toContainText(
      /Salinan dipertingkat oleh Gemini/i,
    );
    const fbCard = loc.tab1.channelCard('facebook').card;
    await expect(fbCard.locator('input[type="text"]').first()).toHaveValue('GEMINI_SURVIVED_TAB_SWITCH');

    await loc.tab1.angleBtn('social_proof').click();
    await expect(page.getByTestId('strategy-enhance-notice')).toHaveCount(0);
    await loc.tab1.angleBtn('urgency').click();
    await expect(page.getByTestId('strategy-enhance-notice')).toContainText(
      /Salinan dipertingkat oleh Gemini/i,
    );

    // 4. Compliance reset button: Muat dari Teks Facebook restores Facebook primaryText & clears flags
    const fbPrimaryText = await fbCard.locator('textarea').inputValue();
    await loc.tab1.compliance.testRiskyBtn.click();
    await expect(loc.tab1.compliance.findings).toContainText(/Meta Personal Attributes/i);
    await loc.tab1.root.getByRole('button', { name: /Muat dari Teks Facebook/i }).click();
    await expect(loc.tab1.compliance.input).toHaveValue(fbPrimaryText);
    await expect(loc.tab1.compliance.statusBadge).toContainText(/Lulus/i);

    errors.assertClean();
    errors.detach();
  });

  test('T5-15: Brand Vault edits (name/phone/themeColor) before video generation & #video-frame-lyric-1 edits reset VideoTab confirmation gate', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await expect(loc.tab4.confirmCheckbox).toBeChecked();
    await expect(loc.tab4.generateBtn).toBeEnabled();

    // 1. Mid-campaign Brand Vault name + WhatsApp edit while awaiting-confirmation MUST uncheck gate
    await loc.vault.activeNameInput.fill('Bisnes Mutasi Sahkan');
    await loc.vault.whatsappInput.fill('019-111 2222');
    await saveBrandIfButtonVisible(page);

    await expect(loc.tab4.frameInput(1)).toHaveValue(/Bisnes Mutasi Sahkan/);
    await expect(loc.tab4.frameInput(4)).toHaveValue(/\+60191112222/);
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.gateWarning).toBeVisible();
    await expect(loc.tab4.generateBtn).toBeDisabled();

    // 2. Re-confirm, then change Brand Vault themeColor -> MUST uncheck gate
    await confirmStoryboard(page);
    await expect(loc.tab4.confirmCheckbox).toBeChecked();
    await loc.vault.colorInput.fill('#10B981');
    await saveBrandIfButtonVisible(page);

    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.gateWarning).toBeVisible();
    await expect(loc.tab4.generateBtn).toBeDisabled();

    // 3. Re-confirm, then edit #video-frame-lyric-1 (Caption / Lyric) -> unchecks gate
    await confirmStoryboard(page);
    const lyric1 = loc.tab4.root.locator('#video-frame-lyric-1');
    await lyric1.fill('Lirik Bingkai 1 Disunting Sebelum Render');
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.gateWarning).toBeVisible();
    await expect(loc.tab4.generateBtn).toBeDisabled();

    // 4. Re-confirm & render video -> edit #video-frame-lyric-1 unmounts <video>, unchecks gate, disables download
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    await expect(loc.tab4.downloadBtn).toBeEnabled();

    await lyric1.fill('Lirik Bingkai 1 Disunting Selepas Render');
    await expect(loc.tab4.confirmCheckbox).not.toBeChecked();
    await expect(loc.tab4.videoPlayer).toHaveCount(0);
    await expect(loc.tab4.downloadBtn).toBeDisabled();

    errors.assertClean();
    errors.detach();
  });

  test('T5-16: Live Demo <-> BYOK upgrade and downgrade via api-settings-modal preserves campaign state and clears errors on close', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);
    await loc.quickForm.offerInput.fill('Tawaran Kekal Ujian Tier 5');
    await launchCampaign(page, {
      offerSentence: 'Tawaran Kekal Ujian Tier 5',
      attachSamplePhotos: true,
    });

    const fbHeadline = loc.tab1.channelCard('facebook').card.locator('input[type="text"]').first();
    await fbHeadline.fill('Tajuk FB Kekal Modal');
    await expect(loc.tab1.root.getByRole('button', { name: /Gemini/i })).toHaveCount(0);

    // 1. Open modal, trigger invalid-key error, close modal, reopen -> error is cleared
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await loc.onboarding.byokInput.fill('invalid-key');
    await loc.onboarding.byokSaveBtn.click();
    await expect(loc.onboarding.byokError).toBeVisible();

    await loc.onboarding.settingsCloseBtn.click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.byokError).toHaveCount(0);

    // 2. Upgrade Demo -> BYOK inside modal -> closes modal, restores focus, preserves campaign, mounts Gemini button
    await loc.onboarding.byokInput.fill('sk-live-tier5-upgrade-123456');
    await loc.onboarding.byokSaveBtn.click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);
    await expect(loc.headerApiSettings).toBeFocused();
    await expect(loc.quickForm.offerInput).toHaveValue('Tawaran Kekal Ujian Tier 5');
    await expect(fbHeadline).toHaveValue('Tajuk FB Kekal Modal');
    await expect(loc.tab1.root.getByRole('button', { name: /Gemini/i })).toBeVisible();

    // 3. Downgrade BYOK -> Demo inside modal -> unmounts Gemini button, preserves campaign
    await loc.headerApiSettings.click();
    await loc.onboarding.demoBtn.click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);
    await expect(loc.tab1.root.getByRole('button', { name: /Gemini/i })).toHaveCount(0);
    await expect(loc.quickForm.offerInput).toHaveValue('Tawaran Kekal Ujian Tier 5');
    await expect(fbHeadline).toHaveValue('Tajuk FB Kekal Modal');

    errors.assertClean();
    errors.detach();
  });

  test('T5-17: StrategyTab RSA D1/D2 >90 warning, live FB->Compliance sync, IG/TikTok edited Quick-Copy, and CPA 0% close-rate BM/EN', async ({ context, page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await grantClipboardPermissions(context);
    await installClipboardSpy(page);
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });

    const loc = appLocators(page);

    // 1. RSA D1 & D2 >90 chars over-limit warning
    const rsaCard = loc.tab1.channelCard('google_rsa').card;
    const d1 = rsaCard.getByLabel('D1', { exact: true });
    const d2 = rsaCard.getByLabel('D2', { exact: true });
    await d1.fill('A'.repeat(95));
    await expect(d1).toHaveValue('A'.repeat(95));
    await expect(d1).toHaveClass(/border-rose-500/);
    await expect(rsaCard).toContainText(/95\/90\s*\(Melebihi had\)/i);

    await d2.fill('B'.repeat(92));
    await expect(d2).toHaveClass(/border-rose-500/);
    await expect(rsaCard).toContainText(/92\/90\s*\(Melebihi had\)/i);

    // 2. Live FB primaryText -> Compliance auto-sync
    await loc.tab1.channelCard('facebook').card.locator('textarea').fill('Anda ada masalah kewangan? 100% dijamin!');
    await expect(loc.tab1.compliance.input).toHaveValue('Anda ada masalah kewangan? 100% dijamin!');
    await expect(loc.tab1.compliance.statusBadge).toContainText(/2 Amaran Dikesan/i);

    // 3. Edited Instagram caption & hashtags copied via Quick-Copy
    const ig = loc.tab1.channelCard('instagram');
    await ig.card.locator('textarea').fill('Kapsyen IG Suntingan Tier 5');
    await ig.card.locator('input[type="text"]').fill('#BisnesLokalTier5 #KualitiMantap');
    await clearClipboardSpy(page);
    await ig.copyBtn.click();
    const igCopied = await readClipboardWithFallback(page);
    expect(igCopied).toContain('Kapsyen IG Suntingan Tier 5');
    expect(igCopied).toContain('#BisnesLokalTier5 #KualitiMantap');
    expect(igCopied).toContain('https://wa.me/');

    // 4. Edited TikTok hook, script, and caption copied via Quick-Copy
    const tt = loc.tab1.channelCard('tiktok');
    await tt.card.locator('input[type="text"]').fill('Hook TikTok Tier 5');
    await tt.card.locator('textarea').nth(0).fill('Skrip TikTok Tier 5');
    await tt.card.locator('textarea').nth(1).fill('Kapsyen TikTok Tier 5');
    await clearClipboardSpy(page);
    await tt.copyBtn.click();
    const ttCopied = await readClipboardWithFallback(page);
    expect(ttCopied).toContain('Hook TikTok Tier 5');
    expect(ttCopied).toContain('Skrip TikTok Tier 5');
    expect(ttCopied).toContain('Kapsyen TikTok Tier 5');
    expect(ttCopied).toContain('https://wa.me/');

    // 5. CPA 0% close-rate note translates across BM -> EN
    await loc.tab1.cpa.closeRateInput.fill('0');
    await expect(loc.tab1.cpa.root).toContainText(/Kadar tutup 0%/i);
    await toggleLanguage(page, 'en');
    await expect(loc.tab1.cpa.root).toContainText(/Close rate is 0%/i);
    await expect(rsaCard).toContainText(/95\/90\s*\(Over limit\)/i);

    errors.assertClean();
    errors.detach();
  });

  test('T5-18: Duplicate brand folder -2 suffix, delete-brand-btn, QuickCampaignForm select->Vault sync, and 390x844 api-settings-modal + 4:5 safe-zone overflow + empty headline placeholder', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);

    // 1. Duplicate brand name creates -2 slug without overwriting seeded folder
    await loc.vault.newNameInput.fill('Demo Bisnes Saya');
    await loc.vault.createBtn.click();
    await expect(page.getByTestId('brand-folder-demo-bisnes-saya')).toBeVisible();
    await expect(page.getByTestId('brand-folder-demo-bisnes-saya-2')).toBeVisible();

    await loc.vault.whatsappInput.fill('019-222 3333');
    await loc.vault.colorInput.fill('#10B981');
    await saveBrandIfButtonVisible(page);
    await expect(loc.vault.whatsappInput).toHaveValue('60192223333');

    // Delete duplicate custom folder -> switches cleanly back to seeded Demo Bisnes Saya
    await expect(page.getByTestId('delete-brand-btn')).toBeVisible();
    await page.getByTestId('delete-brand-btn').click();
    await expect(page.getByTestId('brand-folder-demo-bisnes-saya-2')).toHaveCount(0);
    await expect(page.getByTestId('delete-brand-btn')).toHaveCount(0);

    // Re-create duplicate to test QuickCampaignForm <select> -> Brand Vault sync
    await loc.vault.newNameInput.fill('Demo Bisnes Saya');
    await loc.vault.createBtn.click();
    await expect(page.getByTestId('brand-folder-demo-bisnes-saya-2')).toBeVisible();

    // 2. Selecting seeded brand via QuickCampaignForm <select> updates Brand Vault active folder
    await loc.quickForm.brandSelect.selectOption('demo-bisnes-saya');
    await expect(loc.vault.activeNameInput).toHaveValue('Demo Bisnes Saya');
    await expect(loc.vault.whatsappInput).toHaveValue('60123456789');
    await expect(loc.vault.colorInput).toHaveValue('#0ea5e9');

    // 3. api-settings-modal at 390x844 has zero horizontal overflow & zero clipping
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await assertNoHorizontalOverflow(page, '390 api-settings-modal');
    await assertNoElementClipping(page, '390 api-settings-modal');
    await loc.onboarding.settingsCloseBtn.click();

    // 4. Tab 2 4:5 safe-zone at 390x844 has zero overflow & empty headline shows bilingual placeholder
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'carousel');
    await loc.tab2.aspect45Btn.click();
    await loc.tab2.safeZoneToggleBtn.click();
    await expect(loc.tab2.safeZoneOverlay).toBeVisible();
    await assertNoHorizontalOverflow(page, '390 tab2 4:5 safe-zone');
    await assertNoElementClipping(page, '390 tab2 4:5 safe-zone');

    await loc.tab2.headlineInput.fill('');
    await expect(loc.tab2.slideBtn(1)).toContainText('(Tiada tajuk)');
    await toggleLanguage(page, 'en');
    await expect(loc.tab2.slideBtn(1)).toContainText('(No headline)');

    errors.assertClean();
    errors.detach();
  });

  test('T5-19: Tab 3 Live Lyria (lyria-3-clip-preview & lyria-3.5) vs HTTP Fallback vs Demo Mode zero-external-origin', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);
    const mp3B64 = createMockMp3Base64();

    await page.setViewportSize({ width: 1280, height: 850 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });
    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'jingle');

    const loc = appLocators(page);

    // 1. Demo Mode: local selected, live Lyria disabled, zero external requests, valid .wav
    await expect(loc.tab3.engineBtn('local')).toHaveAttribute('aria-pressed', 'true');
    await expect(loc.tab3.engineBtn('lyria-3-clip-preview')).toBeDisabled();
    await expect(loc.tab3.engineBtn('lyria-3.5')).toBeDisabled();
    await expect(loc.tab3.engineDemoNote).toBeVisible();

    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    await expect(loc.tab3.engineStatusBadge).toContainText(/Simulasi Pelayar Tempatan \(RM0\)/i);
    const demoDl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(demoDl.suggestedFilename).toMatch(/\.wav$/i);
    assertValidAudioFileOrBuffer(demoDl.filePath, demoDl.buffer);
    net.assertSameOriginAndHealthy();
    net.detach();

    // 2. Switch to BYOK mode via API settings modal -> lyria-3-clip-preview becomes default
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await loc.onboarding.byokInput.fill('sk-live-m10-lyria-123456');
    await loc.onboarding.byokSaveBtn.click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);

    await expect(loc.tab3.engineBtn('lyria-3-clip-preview')).toHaveAttribute('aria-pressed', 'true');
    await expect(loc.tab3.engineBtn('lyria-3.5')).toBeEnabled();

    const capturedRequests: Array<{ model: string; store: boolean; apiKey: string | null }> = [];
    await page.route('**/v1beta/interactions', async (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() ?? '{}') as { model?: string; store?: boolean };
      capturedRequests.push({
        model: String(body.model ?? ''),
        store: Boolean(body.store),
        apiKey: req.headers()['x-goog-api-key'] ?? null,
      });
      if (capturedRequests.length === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            output_audio: {
              data: mp3B64,
              mime_type: 'audio/mpeg',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Quota exceeded' } }),
        });
      }
    });

    // Live Lyria 3 Clip -> plays MP3, downloads .mp3, shows live status badge
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    await expect(loc.tab3.engineStatusBadge).toContainText(/Dijana oleh Live Lyria API/i);
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]).toEqual({
      model: 'lyria-3-clip-preview',
      store: false,
      apiKey: 'sk-live-m10-lyria-123456',
    });
    const mp3Dl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(mp3Dl.suggestedFilename).toMatch(/\.mp3$/i);
    assertValidAudioFileOrBuffer(mp3Dl.filePath, mp3Dl.buffer);

    // Switch to Lyria 3.5 -> HTTP 429 falls back cleanly to local 5.5s WAV
    await loc.tab3.engineBtn('lyria-3.5').click();
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[1].model).toBe('lyria-3.5');
    await expect(loc.tab3.engineStatusBadge).toContainText(/Paid Tier/i);
    const fallbackDl = await captureDownload(page, () => loc.tab3.downloadBtn.click());
    expect(fallbackDl.suggestedFilename).toMatch(/\.wav$/i);
    assertValidAudioFileOrBuffer(fallbackDl.filePath, fallbackDl.buffer);

    errors.assertClean([/status of 429/i]);
    errors.detach();
  });

  test('T5-20: Tab 4 Storyboard Gate + Live Gemini Omni 1.2 Flash / Veo 3.1 + HTTP Fallback + Demo Mode zero-external-origin', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const mp4B64 = createMockVerticalMp4Base64();

    await page.setViewportSize({ width: 1280, height: 850 });
    await gotoFreshApp(page);
    await completeOnboarding(page, {
      useDemoMode: false,
      apiKey: 'sk-live-m10-omni-123456',
    });

    const videoCalls: Array<{
      model: string;
      store: boolean;
      apiKey: string | null;
      response_format?: Record<string, unknown>;
    }> = [];

    await page.route('**/v1beta/interactions', async (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() ?? '{}') as {
        model?: string;
        store?: boolean;
        response_format?: Record<string, unknown>;
      };
      videoCalls.push({
        model: String(body.model ?? ''),
        store: Boolean(body.store),
        apiKey: req.headers()['x-goog-api-key'] ?? null,
        response_format: body.response_format,
      });

      if (videoCalls.length === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            output_video: {
              data: mp4B64,
              mime_type: 'video/mp4',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Upstream unavailable' } }),
        });
      }
    });

    await page.route('**/v1beta/models/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
      });
    });

    await launchCampaign(page, { offerSentence: DEFAULT_OFFER });
    await openTab(page, 'video');

    const loc = appLocators(page);
    await expect(loc.tab4.engineBtn('gemini-omni-1.2-flash')).toHaveAttribute('aria-pressed', 'true');
    await expect(loc.tab4.generateBtn).toBeDisabled();
    expect(videoCalls).toHaveLength(0);

    // Confirm storyboard -> Gemini Omni 1.2 Flash live 9:16 MP4
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 25_000 });
    await expect(loc.tab4.engineStatusBadge).toContainText(/Live Gemini Omni 1\.2 Flash/i);
    await expect(loc.tab4.audioSourceBadge).toContainText(/Audio Asli AI/i);

    expect(videoCalls).toHaveLength(1);
    expect(videoCalls[0]).toEqual({
      model: 'gemini-omni-1.2-flash',
      store: false,
      apiKey: 'sk-live-m10-omni-123456',
      response_format: {
        type: 'video',
        duration: '6s',
        resolution: '720p',
        aspect_ratio: '9:16',
      },
    });

    const mp4Dl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    expect(mp4Dl.suggestedFilename).toMatch(/\.mp4$/i);
    assertValidVerticalVideoFile(mp4Dl.filePath);

    // Switch to Veo 3.1 -> HTTP 500 falls back automatically to local <=6s 9:16 WebM
    await loc.tab4.engineBtn('veo-3.1-generate-preview').click();
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    expect(videoCalls).toHaveLength(2);
    expect(videoCalls[1].model).toBe('veo-3.1-generate-preview');
    await expect(loc.tab4.engineStatusBadge).toContainText(/Simulasi Pelayar Tempatan/i);
    await expect(loc.tab4.audioSourceBadge).toContainText(RX.fallbackAudioBadge);
    const webmDl = await captureDownload(page, () => loc.tab4.downloadBtn.click());
    assertValidVerticalVideoFile(webmDl.filePath);

    // Switch to Demo Mode -> zero external requests on Tab 4 render
    const net = attachNetworkOriginAuditor(page);
    await loc.headerApiSettings.click();
    await expect(loc.onboarding.settingsModal).toBeVisible();
    await loc.onboarding.demoBtn.click();
    await expect(loc.onboarding.settingsModal).toHaveCount(0);

    await expect(loc.tab4.engineBtn('local')).toHaveAttribute('aria-pressed', 'true');
    await expect(loc.tab4.engineBtn('gemini-omni-1.2-flash')).toBeDisabled();
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });
    expect(videoCalls).toHaveLength(2);
    net.assertSameOriginAndHealthy();
    net.detach();

    errors.assertClean([/status of 500/i]);
    errors.detach();
  });

  test('T5-21: 320px-1440px x ms/en zero-clipping & zero-overflow on Tab 3 & Tab 4 with M10 engine selectors, fallback badges, and 64-char unbroken brand', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const unbrokenBrand =
      'SyarikatPemasaranDigitalMalaysiaTerunggulSepanjangZaman2026MYXXX';
    expect(unbrokenBrand.length).toBe(64);

    await page.setViewportSize({ width: 1280, height: 850 });
    await gotoFreshApp(page);
    await completeOnboarding(page, {
      useDemoMode: false,
      apiKey: 'sk-live-m10-layout-123456',
    });

    await page.route('**/v1beta/interactions', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Rate limited' } }),
      });
    });

    await page.route('**/v1beta/models/**', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Rate limited' } }),
      });
    });

    await createBrandFolder(page, {
      name: unbrokenBrand,
      colorHex: '#0EA5E9',
      tone: 'casual',
      whatsapp: '012-345 6789',
    });
    await launchCampaign(page, {
      brandName: unbrokenBrand,
      offerSentence: DEFAULT_OFFER,
    });

    const loc = appLocators(page);

    // Render Tab 3 (triggers fallback badge — longest string) & switch style for stale notice
    await openTab(page, 'jingle');
    await loc.tab3.generateBtn.click();
    await verifyAudioElement(loc.tab3.audioPlayer);
    await loc.tab3.styleBtn('santai-akustik').click();

    // Render Tab 4 (triggers fallback badge)
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await loc.tab4.generateBtn.click();
    await verifyVideoElement(loc.tab4.videoPlayer, { timeoutMs: 35_000 });

    const viewports = [
      { width: 320, height: 700 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 640, height: 900 },
      { width: 768, height: 1024 },
      { width: 980, height: 900 },
      { width: 1440, height: 900 },
    ] as const;

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const locale of ['ms', 'en'] as const) {
        await toggleLanguage(page, locale);

        await openTab(page, 'jingle');
        await assertNoHorizontalOverflow(page, `T5-21 ${vp.width} ${locale} tab3`);
        await assertNoElementClipping(page, `T5-21 ${vp.width} ${locale} tab3`);

        await openTab(page, 'video');
        await assertNoHorizontalOverflow(page, `T5-21 ${vp.width} ${locale} tab4`);
        await assertNoElementClipping(page, `T5-21 ${vp.width} ${locale} tab4`);
      }
    }

    errors.assertClean([/status of 429/i]);
    errors.detach();
  });

  test('T5-22: Demo Mode 5-variation sweep, Ulike X HelloKitty token extraction, zero "Tawaran Tawaran", zero external requests, and 390x844/1440x900 layout', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    const net = attachNetworkOriginAuditor(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFreshApp(page);
    await completeOnboarding(page, { useDemoMode: true });

    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Ulike X HelloKitty',
      colorHex: '#EC4899',
      tone: 'casual',
      whatsapp: '019-888 7766',
    });

    const png1 = createTestPngBuffer({ width: 64, height: 64, rgba: [236, 72, 153, 255] });
    const png2 = createTestPngBuffer({ width: 64, height: 64, rgba: [255, 255, 255, 255] });
    await page.getByTestId('campaign-photo-1-input').setInputFiles({
      name: 'ulike-1.png',
      mimeType: 'image/png',
      buffer: png1,
    });
    await page.getByTestId('campaign-photo-2-input').setInputFiles({
      name: 'ulike-2.png',
      mimeType: 'image/png',
      buffer: png2,
    });

    const ulikeOffer =
      'Edisi Khas diskaun 20% RM899 sempena Minggu Gaji, stok & slot terhad';
    await launchCampaign(page, {
      brandName: 'Ulike X HelloKitty',
      offerSentence: ulikeOffer,
      attachSamplePhotos: false,
    });

    await expect(page.getByTestId('variation-toolbar')).toBeVisible();
    await expect(page.getByTestId('campaign-engine-status-badge')).toContainText(/Demo/i);
    await expect(loc.workspaceTabs.locator(':scope > [role="tab"]')).toHaveCount(4);

    // Verify Variation #1 content: zero "Tawaran Tawaran", extracted tokens present
    const psychV1 = await loc.tab1.psychologyPanel.innerText();
    const fbV1 = await loc.tab1.channelCard('facebook').card.locator('textarea').inputValue();
    const ttV1 = await loc.tab1.channelCard('tiktok').card.innerText();
    expect(`${psychV1}\n${fbV1}\n${ttV1}`).not.toMatch(/\btawaran\s+tawaran\b/i);
    expect(`${psychV1}\n${fbV1}`).toMatch(/HelloKitty|20%|RM899|Minggu Gaji/i);

    // Cycle Variasi #1 -> #2 -> #3 -> #4 -> #5 across Tabs 1-4 and assert strict 5/5 distinctness per slide/frame & zero token duplication
    const fbPrimarySamples = new Set<string>([fbV1]);
    const psychSamples = new Set<string>([psychV1]);
    const lyricsSamples = new Set<string>();
    const slideHeadSamples = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    const slideSubSamples = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    const frameHeadSamples = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    const collectedTexts: string[] = [psychV1, fbV1, ttV1];

    for (let step = 2; step <= 5; step += 1) {
      await page.getByTestId('generate-new-variation-btn').click();
      await expect(page.getByTestId('active-variation-label')).toContainText(`#${step}`);
      const fbText = await loc.tab1.channelCard('facebook').card.locator('textarea').inputValue();
      const psychText = await loc.tab1.psychologyPanel.innerText();
      expect(`${psychText}\n${fbText}`).not.toMatch(/\btawaran\s+tawaran\b/i);
      fbPrimarySamples.add(fbText);
      psychSamples.add(psychText);
      collectedTexts.push(fbText, psychText);
    }
    expect(fbPrimarySamples.size).toBe(5);
    expect(psychSamples.size).toBe(5);

    for (let slot = 1; slot <= 5; slot += 1) {
      await page.getByTestId(`variation-pill-${slot}`).click();
      await expect(page.getByTestId('active-variation-label')).toContainText(`#${slot}`);

      await openTab(page, 'carousel');
      for (let sIdx = 0; sIdx < 4; sIdx += 1) {
        await loc.tab2.slideBtn(sIdx + 1).click();
        const headVal = await loc.tab2.headlineInput.inputValue();
        const subVal = await loc.tab2.subheadlineInput.inputValue();
        slideHeadSamples[sIdx].add(headVal);
        slideSubSamples[sIdx].add(subVal);
        collectedTexts.push(headVal, subVal);
      }

      await openTab(page, 'jingle');
      const lyricsVal = await loc.tab3.lyricsInput.inputValue();
      lyricsSamples.add(lyricsVal);
      collectedTexts.push(lyricsVal);

      await openTab(page, 'video');
      await expect(loc.tab4.generateBtn).toBeDisabled();
      for (let fIdx = 0; fIdx < 4; fIdx += 1) {
        const frameVal = await page.getByTestId(`video-frame-input-${fIdx + 1}`).inputValue();
        frameHeadSamples[fIdx].add(frameVal);
        collectedTexts.push(frameVal);
      }
    }

    expect(lyricsSamples.size).toBe(5);
    for (let idx = 0; idx < 4; idx += 1) {
      expect(slideHeadSamples[idx].size, `Tab 2 Slide ${idx + 1} headlines`).toBe(5);
      expect(slideSubSamples[idx].size, `Tab 2 Slide ${idx + 1} subheadlines`).toBe(5);
      expect(frameHeadSamples[idx].size, `Tab 4 Frame ${idx + 1} headlines`).toBe(5);
    }
    for (const txt of collectedTexts) {
      expect(txt).not.toMatch(/X HelloKitty.*X HelloKitty/i);
      expect(txt).not.toMatch(/Ulike X HelloKitty.*Ulike X HelloKitty/i);
      expect(txt).not.toMatch(/Edisi Khas.*Edisi Khas/i);
    }

    // Responsive check at 390x844 and 1440x900
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      await openTab(page, 'strategy');
      await assertNoHorizontalOverflow(page, `T5-22 ${vp.width}x${vp.height}`);
      await assertNoElementClipping(page, `T5-22 ${vp.width}x${vp.height}`);
    }

    net.assertSameOriginAndHealthy();
    net.detach();
    errors.assertClean();
    errors.detach();
  });

  test('T5-23: BYOK Multimodal Vision sends photo1+photo2 inlineData, falls back 2.5-flash (503) -> 2.0-flash (200), hydrates Tabs 1-4, and resets Tab 4 gate on Jana Variasi Baru', async ({ page }) => {
    const errors = attachRuntimeErrorCollector(page);
    await page.setViewportSize({ width: 1280, height: 850 });
    await gotoFreshApp(page);
    await completeOnboarding(page, {
      useDemoMode: false,
      apiKey: 'sk-live-m11-vision-123456',
    });

    const loc = appLocators(page);
    await createBrandFolder(page, {
      name: 'Ulike X HelloKitty',
      colorHex: '#EC4899',
      tone: 'casual',
      whatsapp: '019-888 7766',
    });

    const png1 = createTestPngBuffer({ width: 48, height: 48, rgba: [236, 72, 153, 255] });
    const png2 = createTestPngBuffer({ width: 48, height: 48, rgba: [250, 204, 21, 255] });
    await page.getByTestId('campaign-photo-1-input').setInputFiles({
      name: 'photo-1.png',
      mimeType: 'image/png',
      buffer: png1,
    });
    await page.getByTestId('campaign-photo-2-input').setInputFiles({
      name: 'photo-2.png',
      mimeType: 'image/png',
      buffer: png2,
    });

    const visionCalls: Array<{ model: string; inlineCount: number; promptText: string }> = [];

    await page.route('**/v1beta/models/**', async (route) => {
      const url = route.request().url();
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        contents?: Array<{
          parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
        }>;
      };
      const parts = body.contents?.[0]?.parts ?? [];
      const inlineParts = parts.filter((p) => Boolean(p.inlineData));
      const promptText = parts.find((p) => typeof p.text === 'string')?.text ?? '';
      const modelMatch = url.match(/models\/([^:]+):generateContent/);
      const model = modelMatch?.[1] ?? 'unknown';
      visionCalls.push({ model, inlineCount: inlineParts.length, promptText });

      if (model === 'gemini-2.5-flash' && visionCalls.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: '2.5-flash busy' } }),
        });
        return;
      }

      const isV2 = promptText.includes('Variasi #2');
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
                      visualSummary: isV2
                        ? 'Set peranti IPL merah jambu HelloKitty — UlikeXHelloKitty2026LimitedCollectorEditionSapphireCoolingIPLDeviceBundleWithProtectiveCaseMY'
                        : 'Peranti IPL Ulike X HelloKitty berwarna merah jambu edisi koleksi — UlikeXHelloKitty2026LimitedCollectorEditionSapphireCoolingIPLDeviceBundleMY.',
                      psychology: {
                        targetPersona: isV2
                          ? 'Pengguna gaya hidup moden yang mahu rutin penjagaan rumah tanpa ke salon.'
                          : 'Peminat kecantikan & kolektor HelloKitty yang mencari peranti IPL di rumah.',
                        coreTrigger: isV2
                          ? 'Transformasi rutin penjagaan kulit mingguan yang lebih selesa di rumah.'
                          : 'Diskaun 20% RM899 untuk edisi kolaborasi terhad.',
                        frictionObjections: 'Ingin pastikan keaslian set dan keselamatan penggunaan.',
                        trustAnchors: 'Set rasmi Ulike X HelloKitty bersama panduan penggunaan.',
                      },
                      angles: {
                        urgency: {
                          facebook: {
                            primaryText: isV2
                              ? 'Ubah rutin lama ke sesi penjagaan rumah selesa dengan Ulike X HelloKitty!'
                              : 'Edisi Ulike X HelloKitty diskaun 20% kini dibuka untuk batch awal!',
                            headline: isV2 ? 'Ulike X HelloKitty Gaya Baharu' : 'Ulike X HelloKitty Terhad',
                            description: 'RM899 • Minggu Gaji',
                          },
                          instagram: {
                            caption: isV2
                              ? 'Gaya baharu penjagaan rumah dengan Ulike X HelloKitty ✨'
                              : 'Koleksi Ulike X HelloKitty edisi terhad kini tiba!',
                            hashtags: '#UlikeXHelloKitty #BeautyMY',
                          },
                          tiktok: {
                            hook: isV2
                              ? 'Rutin rumah lebih kemas tanpa perlu keluar jauh!'
                              : 'Tengok rupa sebenar peranti Ulike X HelloKitty ini!',
                            script: '0-2s: Visual produk. 2-4s: Diskaun 20% RM899. 4-6s: WhatsApp.',
                            caption: 'Ulike X HelloKitty RM899',
                          },
                          google_rsa: {
                            headlines: ['Ulike X HelloKitty', 'Diskaun 20% RM899', 'Tempah WhatsApp Kini'],
                            descriptions: [
                              'Peranti IPL edisi kolaborasi Ulike X HelloKitty untuk kegunaan di rumah.',
                              'Hubungi WhatsApp rasmi untuk semak stok batch terawal.',
                            ],
                            negativeKeywords: ['percuma', 'tiruan', 'terpakai', 'rosak', 'borong'],
                          },
                        },
                      },
                      carouselSlides: [
                        {
                          badgeText: isV2 ? 'GAYA BAHARU' : 'EDISI KOLEKSI',
                          headline: isV2 ? 'Rutin Rumah Lebih Mudah' : 'Ulike X HelloKitty IPL',
                          subheadline: 'RM899 • Diskaun 20%',
                          ctaText: 'Slide 1 / 4',
                        },
                      ],
                      jingleLyrics: isV2
                        ? 'Gaya baharu bersama Ulike X HelloKitty,\nRutin selesa setiap hari!'
                        : 'Ulike X HelloKitty pilihan bergaya,\nJimat 20% RM899 minggu gaji!',
                      storyboardFrames: [
                        {
                          overlayHeadline: isV2
                            ? 'Ulike X HelloKitty: Gaya Baharu'
                            : 'Ulike X HelloKitty: Edisi Khas',
                          lyricLine: 'Baris 1',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    await launchCampaign(page, {
      brandName: 'Ulike X HelloKitty',
      offerSentence: 'Edisi Terhad diskaun 20% RM899 Minggu Gaji',
      attachSamplePhotos: false,
    });

    // Should retry 2.5-flash (503) -> 2.0-flash (200) with both photo inlineData parts
    await expect(page.getByTestId('campaign-engine-status-badge')).toContainText(
      /Gemini 2\.0 Flash Vision/i,
      { timeout: 10_000 }
    );
    await expect(page.getByTestId('product-vision-summary-badge')).toContainText(
      /Peranti IPL Ulike X HelloKitty/i
    );
    expect(visionCalls.length).toBe(2);
    expect(visionCalls[0].model).toBe('gemini-2.5-flash');
    expect(visionCalls[0].inlineCount).toBe(2);
    expect(visionCalls[1].model).toBe('gemini-2.0-flash');
    expect(visionCalls[1].inlineCount).toBe(2);

    await expect(loc.tab1.psychologyPanel).toContainText(/kolektor HelloKitty/i);

    // Confirm Tab 4 gate, then click Jana Variasi Baru -> 2.5-flash succeeds & Tab 4 gate resets
    await openTab(page, 'video');
    await confirmStoryboard(page);
    await expect(loc.tab4.generateBtn).toBeEnabled();

    await page.getByTestId('generate-new-variation-btn').click();
    await expect(page.getByTestId('active-variation-label')).toContainText('#2');
    await expect(page.getByTestId('campaign-engine-status-badge')).toContainText(
      /Gemini 2\.5 Flash Vision/i,
      { timeout: 10_000 }
    );
    await expect(loc.tab4.generateBtn).toBeDisabled();
    await expect(page.getByTestId('video-frame-input-1')).toHaveValue(/Gaya Baharu/i);

    await openTab(page, 'jingle');
    expect(await loc.tab3.lyricsInput.inputValue()).toContain('Gaya baharu bersama Ulike X HelloKitty');

    // Verify 320x700 & 390x844 (ms & en) zero-clipping & [overflow-wrap:anywhere] on product-vision-summary-badge with 80+ char unbroken token
    await openTab(page, 'strategy');
    for (const vp of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(vp);
      for (const locale of ['ms', 'en'] as const) {
        await toggleLanguage(page, locale);
        await assertNoHorizontalOverflow(page, `T5-23 ${vp.width} ${locale}`);
        await assertNoElementClipping(page, `T5-23 ${vp.width} ${locale}`);

        const badgeMetrics = await page.getByTestId('product-vision-summary-badge').evaluate((el) => {
          const style = getComputedStyle(el);
          const range = document.createRange();
          range.selectNodeContents(el);
          const textRect = range.getBoundingClientRect();
          return {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            overflowWrap: style.overflowWrap,
            textRight: textRect.right,
            innerWidth: window.innerWidth,
          };
        });
        expect(badgeMetrics.overflowWrap).toBe('anywhere');
        expect(badgeMetrics.scrollWidth).toBeLessThanOrEqual(badgeMetrics.clientWidth + 2);
        expect(badgeMetrics.textRight).toBeLessThanOrEqual(badgeMetrics.innerWidth);
      }
    }

    errors.assertClean([/status of 503/i]);
    errors.detach();
  });
});

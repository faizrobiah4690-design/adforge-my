import type { Locator, Page } from '@playwright/test';

export type AngleId = 'confidence' | 'hygiene' | 'payday';
export type ChannelId = 'facebook' | 'instagram' | 'tiktok' | 'google_rsa';
export type JingleStyleId = 'pop-ceria' | 'santai-akustik' | 'korporat-segar';
export type WorkspaceTabId = 'strategy' | 'carousel' | 'jingle' | 'video';

export function escapeRx(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TEST_IDS = {
  // Shell & Navigation
  langToggle: 'lang-toggle',
  headerApiSettings: 'header-api-settings',
  workspaceTabs: 'workspace-tabs',
  tabStrategy: 'tab-strategy',
  tabCarousel: 'tab-carousel',
  tabJingle: 'tab-jingle',
  tabVideo: 'tab-video',

  // A1: Onboarding
  onboardingScreen: 'onboarding-screen',
  onboardingGoogleLogin: 'onboarding-google-login',
  onboardingSessionBadge: 'onboarding-session-badge',
  onboardingByokInput: 'onboarding-byok-input',
  onboardingByokVisibility: 'onboarding-byok-visibility',
  onboardingByokSave: 'onboarding-byok-save',
  onboardingByokError: 'onboarding-byok-error',
  onboardingDemoBtn: 'onboarding-demo-btn',
  onboardingDemoBadge: 'onboarding-demo-badge',
  onboardingContinueBtn: 'onboarding-continue-btn',
  onboardingVideoGuide: 'onboarding-video-guide',
  onboardingVideoGuidePlay: 'onboarding-video-guide-play',
  apiSettingsModal: 'api-settings-modal',
  apiSettingsClose: 'api-settings-close',

  // A2: Brand Vault
  brandVault: 'brand-vault',
  brandCreateBtn: 'brand-create-btn',
  brandNameInput: 'brand-name-input',
  brandLogoInput: 'brand-logo-input',
  brandLogoPreview: 'brand-logo-preview',
  brandColorInput: 'brand-color-input',
  brandToneCasual: 'brand-tone-casual',
  brandToneProfessional: 'brand-tone-professional',
  brandWhatsappInput: 'brand-whatsapp-input',
  brandSaveBtn: 'brand-save-btn',
  brandError: 'brand-error',

  // A3: Quick Campaign Form
  quickCampaignForm: 'quick-campaign-form',
  campaignBrandSelect: 'campaign-brand-select',
  campaignPhotoSlot1: 'campaign-photo-slot-1',
  campaignPhotoSlot2: 'campaign-photo-slot-2',
  campaignPhoto1Sample: 'campaign-photo-1-sample',
  campaignPhoto2Sample: 'campaign-photo-2-sample',
  campaignPhoto1Input: 'campaign-photo-1-input',
  campaignPhoto2Input: 'campaign-photo-2-input',
  campaignPhoto1Clear: 'campaign-photo-1-clear',
  campaignPhoto2Clear: 'campaign-photo-2-clear',
  campaignOfferInput: 'campaign-offer-input',
  campaignOfferChip: 'campaign-offer-chip',
  campaignLaunchBtn: 'campaign-launch-btn',
  campaignFormError: 'campaign-form-error',

  // A4: Tab 1 — Strategy, Copy, CPA, Compliance
  tabPanelStrategy: 'tab-panel-strategy',
  strategyPsychologyPanel: 'strategy-psychology-panel',
  angleConfidence: 'angle-confidence',
  angleHygiene: 'angle-hygiene',
  anglePayday: 'angle-payday',
  channelFacebook: 'channel-facebook',
  channelInstagram: 'channel-instagram',
  channelTiktok: 'channel-tiktok',
  channelGoogleRsa: 'channel-google_rsa',
  cpaGuardrail: 'cpa-guardrail',
  cpaPriceInput: 'cpa-price-input',
  cpaMarginInput: 'cpa-margin-input',
  cpaCloseRateInput: 'cpa-close-rate-input',
  cpaCplInput: 'cpa-cpl-input',
  cpaBreakEvenValue: 'cpa-break-even-value',
  cpaMaxCplValue: 'cpa-max-cpl-value',
  cpaProjectedValue: 'cpa-projected-value',
  cpaStatusBadge: 'cpa-status-badge',
  complianceChecker: 'compliance-checker',
  complianceInput: 'compliance-input',
  complianceTestRiskyBtn: 'compliance-test-risky-btn',
  complianceApplyRewriteBtn: 'compliance-apply-rewrite-btn',
  complianceFindings: 'compliance-findings',
  complianceStatusBadge: 'compliance-status-badge',

  // A5: Tab 2 — Carousel Studio
  tabPanelCarousel: 'tab-panel-carousel',
  carouselPreviewStage: 'carousel-preview-stage',
  carouselHeadlineInput: 'carousel-headline-input',
  carouselSubheadlineInput: 'carousel-subheadline-input',
  carouselLogoImg: 'carousel-logo-img',
  safezoneAspect916: 'safezone-aspect-9-16',
  safezoneAspect45: 'safezone-aspect-4-5',
  safezoneOverlayToggle: 'safezone-overlay-toggle',
  safezoneOverlay: 'safezone-overlay',
  carouselDownloadBtn: 'carousel-download-btn',

  // A6: Tab 3 — Jingle Studio
  tabPanelJingle: 'tab-panel-jingle',
  jingleLyricsInput: 'jingle-lyrics-input',
  jingleGenerateBtn: 'jingle-generate-btn',
  jingleAudioPlayer: 'jingle-audio-player',
  jingleDownloadBtn: 'jingle-download-btn',
  jingleError: 'jingle-error',

  // A7: Tab 4 — Staged Video Ad Studio
  tabPanelVideo: 'tab-panel-video',
  videoConfirmCheckbox: 'video-confirm-checkbox',
  videoConfirmBtn: 'video-confirm-btn',
  videoGenerateBtn: 'video-generate-btn',
  videoPreviewPlayer: 'video-preview-player',
  videoDownloadBtn: 'video-download-btn',
  videoAudioSourceBadge: 'video-audio-source-badge',
  videoGateWarning: 'video-gate-warning',
} as const;

export const RX = {
  langToggle: /\b(BM|MS|EN|Bahasa Melayu|English|BM\s*\/\s*EN|MS\s*\/\s*EN)\b/i,
  apiSettings: /API|BYOK|Tetapan|Settings/i,
  googleLogin: /Google|Log Masuk dengan Google|Teruskan dengan Google|Continue with Google|Sign in with Google/i,
  toggleKeyVisibility: /Tunjuk|Sembunyi|Show|Hide|Toggle.*key|Visibility/i,
  saveByok: /Simpan Kunci|Simpan & Masuk|Simpan & Teruskan|Save Key|Save & Enter|Save & Continue|Simpan|Save/i,
  demoMode: /Demo|Offline|Tanpa Kunci|Showcase Mode|Mod Demo/i,
  continueDashboard: /Masuk Workbench|Buka Ruang Kempen|Open Campaign Workspace|Teruskan|Continue|Dashboard|Papan Pemuka/i,
  videoGuidePlay: /Panduan Video|Video Guide|Mainkan Panduan|Play Guide|Play|Main/i,

  brandVaultHeading: /Brand Vault|Peti Jenama|Profil Jenama/i,
  newBrand: /Folder Baru|Folder Baharu|Cipta Folder(?: Baharu)?|Cipta Jenama|Jenama Baru|New Brand|Create (?:New )?Folder|Add Brand/i,
  brandNameLabel: /Nama Jenama|Brand Name|Folder Name|Nama Folder|Klinik Pergigian Harmoni/i,
  toneCasual: /Santai|Casual/i,
  toneProfessional: /Profesional|Professional/i,
  saveBrand: /Simpan Jenama|Simpan Folder(?: Jenama)?|Save Brand Folder|Simpan|Save/i,

  quickFormHeading: /Kempen Pantas|Quick Campaign|Bina Kempen|Lancar Kempen/i,
  offerLabel: /Tawaran|Offer|Ayat Tawaran/i,
  offerPlaceholder: /Promosi|Tawaran|Offer|Scaling/i,
  offerChip: /Contoh|Quick sample|Sample Offer|Guna Contoh|Promosi Scaling|Isi Contoh/i,
  binaKempen: /Bina Kempen|Build Campaign|Launch Campaign/i,

  tabStrategy: /Strategi|Strategy/i,
  tabCarousel: /Karusel|Carousel/i,
  tabJingle: /Jingle/i,
  tabVideo: /Video/i,

  psychologyHeading: /Psikologi Pelanggan|Customer Psychology/i,
  angles: {
    confidence: /Keyakinan|Confidence/i,
    hygiene: /Pencegahan|Hygiene|Kebersihan/i,
    payday: /Minggu Gaji|Payday/i,
  } as Record<AngleId, RegExp>,

  channels: {
    facebook: /Facebook/i,
    instagram: /Instagram/i,
    tiktok: /TikTok/i,
    google_rsa: /Google.*RSA|Google Search/i,
  } as Record<ChannelId, RegExp>,

  copy: /Salin|Copy/i,
  copiedFeedback: /Disalin|Copied/i,
  cpaHeading: /Break-Even CPA|Pulang Modal|CPA Guardrail/i,
  cpaSafe: /\b(Selamat|Safe)\b/i,
  cpaCaution: /\b(Berhati-hati|Berhati|Berjaga-jaga|Awas|Caution)\b/i,
  cpaOverLimit: /\b(Rugi|Melebihi Had(?:\s+Pulang Modal)?|Over(?:\s+Break-Even)?\s*Limit|Bahaya)\b/i,

  complianceHeading: /Polisi|Policy|Pematuhan|Compliance|KKLIU/i,
  testRisky: /Uji Ayat Berisiko|Uji Contoh Berisiko|Test Risky(?:\s+Sample)?|Sampel Berisiko/i,
  applyRewrite: /Tukar Selamat|Guna Ayat Selamat|Apply.*Rewrite|Safe Rewrite|Baiki/i,
  compliancePass: /Lulus|Tiada Risiko Polisi|Patuh|Compliant|Tiada risiko tinggi|Pass\b|No Policy Risks|Clean/i,

  carouselHeadlineLabel: /Tajuk Utama|Headline|Teks Slaid/i,
  carouselHeadlinePlaceholder: /Tajuk|Headline/i,
  safeZoneToggle: /Zon Selamat|Safe[\s-]*Zone/i,
  downloadPng: /Muat Turun.*PNG|Download.*PNG|Muat Turun Slaid/i,

  jingleStyles: {
    'pop-ceria': /Pop Ceria|Upbeat Pop|Pop/i,
    'santai-akustik': /Santai Akustik|Acoustic Chill|Akustik|Acoustic/i,
    'korporat-segar': /Korporat Segar|Fresh Corporate|Korporat|Corporate/i,
  } as Record<JingleStyleId, RegExp>,
  generateJingle: /Jana.*Jingle|Generate.*Jingle|Hasilkan.*Jingle/i,
  downloadAudio: /Muat Turun Audio|Muat Turun WAV|Download Audio|Download WAV/i,

  confirmStoryboard: /Sahkan Storyboard|Confirm Storyboard|Saya sahkan|I confirm/i,
  generateVideo: /Jana.*Video|Generate.*Video|Sahkan & Jana Video/i,
  downloadVideo: /Muat Turun Video|Download Video/i,
  fallbackAudioBadge: /Fallback|Sandaran|Pra-isi|Pra-sedia|Pre-seeded|Sedia Ada|Default Track/i,
  tab3AudioBadge: /Tab 3|Jingle Studio Tab 3|Jingle Tab 3|Jingle Dijana|Generated Jingle/i,
} as const;

export function appLocators(page: Page) {
  // Shell
  const langToggleContainer = page
    .getByTestId('language-toggle')
    .or(page.getByTestId(TEST_IDS.langToggle))
    .first();

  const langMsBtn = page.getByTestId('lang-ms');
  const langEnBtn = page.getByTestId('lang-en');

  const langToggle = page
    .getByTestId(TEST_IDS.langToggle)
    .or(page.getByTestId('language-toggle'))
    .or(page.getByRole('button', { name: RX.langToggle }))
    .first();

  const headerApiSettings = page
    .getByTestId(TEST_IDS.headerApiSettings)
    .or(page.getByTestId('nav-onboarding'))
    .or(page.getByRole('button', { name: RX.apiSettings }))
    .first();

  const workspaceTabs = page
    .getByTestId(TEST_IDS.workspaceTabs)
    .or(page.getByRole('tablist'))
    .first();

  const tabButton = (tab: WorkspaceTabId): Locator => {
    const testIdMap: Record<WorkspaceTabId, string> = {
      strategy: TEST_IDS.tabStrategy,
      carousel: TEST_IDS.tabCarousel,
      jingle: TEST_IDS.tabJingle,
      video: TEST_IDS.tabVideo,
    };
    const rxMap: Record<WorkspaceTabId, RegExp> = {
      strategy: RX.tabStrategy,
      carousel: RX.tabCarousel,
      jingle: RX.tabJingle,
      video: RX.tabVideo,
    };
    return workspaceTabs
      .getByTestId(testIdMap[tab])
      .or(workspaceTabs.getByRole('tab', { name: rxMap[tab] }))
      .or(workspaceTabs.getByRole('button', { name: rxMap[tab] }))
      .first();
  };

  // A1: Onboarding
  const onboarding = {
    root: page
      .getByTestId(TEST_IDS.onboardingScreen)
      .or(
        page
          .locator('section')
          .filter({ has: page.getByRole('button', { name: RX.googleLogin }) }),
      )
      .first(),
    googleLoginBtn: page
      .getByTestId(TEST_IDS.onboardingGoogleLogin)
      .or(page.getByTestId('google-login-btn'))
      .or(page.getByRole('button', { name: RX.googleLogin }))
      .first(),
    sessionBadge: page
      .getByTestId(TEST_IDS.onboardingSessionBadge)
      .or(page.getByText(/freelancer@|@studio\.my|Signed in as|Log masuk sebagai/i))
      .first(),
    byokInput: page
      .getByTestId(TEST_IDS.onboardingByokInput)
      .or(page.getByTestId('byok-input'))
      .or(page.getByPlaceholder(/AIza|API Key|Kunci API/i))
      .or(page.getByLabel(/API Key|Kunci API/i))
      .first(),
    byokVisibilityBtn: page
      .getByTestId(TEST_IDS.onboardingByokVisibility)
      .or(page.getByRole('button', { name: RX.toggleKeyVisibility }))
      .first(),
    byokSaveBtn: page
      .getByTestId(TEST_IDS.onboardingByokSave)
      .or(page.getByTestId('byok-save-btn'))
      .or(page.getByRole('button', { name: RX.saveByok }))
      .first(),
    byokError: page
      .getByTestId(TEST_IDS.onboardingByokError)
      .or(page.getByRole('alert'))
      .first(),
    demoBtn: page
      .getByTestId(TEST_IDS.onboardingDemoBtn)
      .or(page.getByTestId('byok-demo-btn'))
      .or(page.getByRole('button', { name: RX.demoMode }))
      .first(),
    demoBadge: page
      .getByTestId(TEST_IDS.onboardingDemoBadge)
      .or(page.getByText(/Demo|Mod Demo|Offline/i))
      .first(),
    continueBtn: page
      .getByTestId(TEST_IDS.onboardingContinueBtn)
      .or(page.getByTestId('continue-workbench-btn'))
      .or(page.getByRole('button', { name: RX.continueDashboard }))
      .first(),
    videoGuide: page
      .getByTestId(TEST_IDS.onboardingVideoGuide)
      .or(page.getByTestId('byok-video-guide'))
      .or(page.locator('video'))
      .first(),
    videoGuidePlayBtn: page
      .getByTestId(TEST_IDS.onboardingVideoGuidePlay)
      .or(page.getByRole('button', { name: RX.videoGuidePlay }))
      .first(),
    settingsModal: page
      .getByTestId(TEST_IDS.apiSettingsModal)
      .or(page.getByRole('dialog'))
      .first(),
    settingsCloseBtn: page
      .getByTestId(TEST_IDS.apiSettingsClose)
      .or(page.getByRole('dialog').getByRole('button', { name: /^(?:Tutup|Close|Selesai|Done)$/i }))
      .first(),
  };

  // A2: Brand Vault
  const vaultRoot = page
    .getByTestId(TEST_IDS.brandVault)
    .or(page.getByTestId('brand-vault-screen'))
    .or(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: RX.brandVaultHeading }) }),
    )
    .first();

  const vault = {
    root: vaultRoot,
    folderButton: (brandName: string): Locator =>
      vaultRoot
        .locator('[data-testid^="brand-folder-"]')
        .filter({ hasText: brandName })
        .or(vaultRoot.getByRole('button', { name: new RegExp(escapeRx(brandName), 'i') }))
        .first(),
    createBtn: vaultRoot
      .getByTestId(TEST_IDS.brandCreateBtn)
      .or(vaultRoot.getByTestId('create-brand-btn'))
      .or(vaultRoot.getByRole('button', { name: RX.newBrand }))
      .first(),
    newNameInput: vaultRoot.getByTestId('new-brand-name-input'),
    activeNameInput: vaultRoot.getByTestId(TEST_IDS.brandNameInput),
    nameInput: vaultRoot
      .getByTestId(TEST_IDS.brandNameInput)
      .or(vaultRoot.getByTestId('new-brand-name-input'))
      .or(vaultRoot.getByLabel(RX.brandNameLabel))
      .or(vaultRoot.getByPlaceholder(RX.brandNameLabel))
      .first(),
    logoInput: vaultRoot
      .getByTestId(TEST_IDS.brandLogoInput)
      .or(vaultRoot.locator('input[type="file"]'))
      .first(),
    logoPreview: vaultRoot
      .getByTestId(TEST_IDS.brandLogoPreview)
      .or(vaultRoot.locator('img'))
      .first(),
    colorInput: vaultRoot
      .getByTestId(TEST_IDS.brandColorInput)
      .or(vaultRoot.locator('input[type="color"]'))
      .first(),
    toneSelect: vaultRoot
      .getByTestId('brand-tone-select')
      .or(vaultRoot.getByLabel(/Nada Bahasa|Language Tone/i))
      .first(),
    toneCasualBtn: vaultRoot
      .getByTestId(TEST_IDS.brandToneCasual)
      .or(vaultRoot.getByRole('button', { name: RX.toneCasual }))
      .first(),
    toneProfessionalBtn: vaultRoot
      .getByTestId(TEST_IDS.brandToneProfessional)
      .or(vaultRoot.getByRole('button', { name: RX.toneProfessional }))
      .first(),
    whatsappInput: vaultRoot
      .getByTestId(TEST_IDS.brandWhatsappInput)
      .or(vaultRoot.getByLabel(/WhatsApp/i))
      .or(vaultRoot.getByPlaceholder(/01\d|601\d|WhatsApp/i))
      .first(),
    saveBtn: vaultRoot
      .getByTestId(TEST_IDS.brandSaveBtn)
      .or(vaultRoot.getByRole('button', { name: RX.saveBrand }))
      .first(),
    errorMsg: vaultRoot
      .getByTestId(TEST_IDS.brandError)
      .or(vaultRoot.getByRole('alert'))
      .first(),
  };

  // A3: Quick Campaign Form
  const formRoot = page
    .getByTestId(TEST_IDS.quickCampaignForm)
    .or(
      page
        .locator('section, form')
        .filter({ has: page.getByRole('heading', { name: RX.quickFormHeading }) }),
    )
    .first();

  const photoSlot1 = formRoot
    .getByTestId(TEST_IDS.campaignPhotoSlot1)
    .or(formRoot.getByTestId('photo-slot-0'))
    .or(formRoot.locator('[data-photo-slot="1"], [data-slot="0"]'))
    .first();
  const photoSlot2 = formRoot
    .getByTestId(TEST_IDS.campaignPhotoSlot2)
    .or(formRoot.getByTestId('photo-slot-1'))
    .or(formRoot.locator('[data-photo-slot="2"], [data-slot="1"]'))
    .first();

  const quickForm = {
    root: formRoot,
    brandSelect: formRoot
      .getByTestId(TEST_IDS.campaignBrandSelect)
      .or(formRoot.getByRole('combobox'))
      .or(formRoot.locator('select'))
      .first(),
    photoSlot1,
    photoSlot2,
    photo1SampleBtn: photoSlot1
      .getByTestId(TEST_IDS.campaignPhoto1Sample)
      .or(photoSlot1.getByTestId('sample-photo-picker-0'))
      .or(photoSlot1.getByRole('button', { name: /Sampel|Sample|Contoh/i }))
      .first(),
    photo2SampleBtn: photoSlot2
      .getByTestId(TEST_IDS.campaignPhoto2Sample)
      .or(photoSlot2.getByTestId('sample-photo-picker-1'))
      .or(photoSlot2.getByRole('button', { name: /Sampel|Sample|Contoh/i }))
      .first(),
    photo1Input: photoSlot1
      .getByTestId(TEST_IDS.campaignPhoto1Input)
      .or(photoSlot1.getByTestId('photo-upload-0'))
      .or(photoSlot1.locator('input[type="file"]'))
      .first(),
    photo2Input: photoSlot2
      .getByTestId(TEST_IDS.campaignPhoto2Input)
      .or(photoSlot2.getByTestId('photo-upload-1'))
      .or(photoSlot2.locator('input[type="file"]'))
      .first(),
    photo1ClearBtn: photoSlot1
      .getByTestId(TEST_IDS.campaignPhoto1Clear)
      .or(photoSlot1.getByRole('button', { name: /Padam|Buang|Clear|Remove/i }))
      .first(),
    photo2ClearBtn: photoSlot2
      .getByTestId(TEST_IDS.campaignPhoto2Clear)
      .or(photoSlot2.getByRole('button', { name: /Padam|Buang|Clear|Remove/i }))
      .first(),
    offerInput: formRoot
      .getByTestId(TEST_IDS.campaignOfferInput)
      .or(formRoot.getByTestId('offer-input'))
      .or(formRoot.getByLabel(RX.offerLabel))
      .or(formRoot.getByPlaceholder(RX.offerPlaceholder))
      .or(formRoot.locator('textarea'))
      .first(),
    offerChip: formRoot
      .getByTestId(TEST_IDS.campaignOfferChip)
      .or(formRoot.getByTestId('offer-sample-chip'))
      .or(formRoot.getByRole('button', { name: RX.offerChip }))
      .first(),
    launchBtn: page
      .getByTestId(TEST_IDS.campaignLaunchBtn)
      .or(page.getByTestId('launch-campaign-btn'))
      .or(page.getByRole('button', { name: RX.binaKempen }))
      .first(),
    errorMsg: formRoot
      .getByTestId(TEST_IDS.campaignFormError)
      .or(formRoot.getByRole('alert'))
      .first(),
  };

  // A4: Tab 1
  const tab1Root = page
    .getByTestId(TEST_IDS.tabPanelStrategy)
    .or(page.getByTestId('strategy-tab'))
    .or(page.locator('[role="tabpanel"]:visible'))
    .first();

  const cpaRoot = tab1Root
    .getByTestId(TEST_IDS.cpaGuardrail)
    .or(
      tab1Root
        .locator('section, article')
        .filter({ has: tab1Root.getByRole('heading', { name: RX.cpaHeading }) })
        .filter({ hasNot: tab1Root.getByRole('heading', { name: RX.complianceHeading }) }),
    )
    .first();

  const complianceRoot = tab1Root
    .getByTestId(TEST_IDS.complianceChecker)
    .or(
      tab1Root
        .locator('section, article')
        .filter({ has: tab1Root.getByRole('heading', { name: RX.complianceHeading }) })
        .filter({ hasNot: tab1Root.getByRole('heading', { name: RX.cpaHeading }) }),
    )
    .first();

  const channelCard = (channel: ChannelId) => {
    const tidMap: Record<ChannelId, string> = {
      facebook: TEST_IDS.channelFacebook,
      instagram: TEST_IDS.channelInstagram,
      tiktok: TEST_IDS.channelTiktok,
      google_rsa: TEST_IDS.channelGoogleRsa,
    };
    const otherChannelsRxMap: Record<ChannelId, RegExp> = {
      facebook: /Instagram|TikTok|Google.*RSA|Google Search/i,
      instagram: /Facebook|TikTok|Google.*RSA|Google Search/i,
      tiktok: /Facebook|Instagram|Google.*RSA|Google Search/i,
      google_rsa: /Facebook|Instagram|TikTok/i,
    };
    const card = tab1Root
      .getByTestId(tidMap[channel])
      .or(tab1Root.locator(`[data-channel="${channel}"]`))
      .or(
        tab1Root
          .locator('article, section')
          .filter({ has: tab1Root.getByRole('heading', { name: RX.channels[channel] }) })
          .filter({ hasNot: tab1Root.getByRole('heading', { name: otherChannelsRxMap[channel] }) }),
      )
      .first();

    return {
      card,
      copyBtn: card
        .getByTestId(`copy-btn-${channel}`)
        .or(card.getByRole('button', { name: RX.copy }))
        .first(),
      whatsappLink: card
        .getByTestId(`whatsapp-cta-${channel}`)
        .or(card.locator('a[href^="https://wa.me/"]'))
        .first(),
      editableField: card.locator('textarea, input[type="text"]').first(),
    };
  };

  const tab1 = {
    root: tab1Root,
    psychologyPanel: tab1Root
      .getByTestId(TEST_IDS.strategyPsychologyPanel)
      .or(
        tab1Root
          .locator('section, article')
          .filter({ has: tab1Root.getByRole('heading', { name: RX.psychologyHeading }) })
          .filter({ hasNot: tab1Root.getByRole('heading', { name: RX.cpaHeading }) }),
      )
      .first(),
    angleBtn: (angle: AngleId): Locator => {
      const map: Record<AngleId, string> = {
        confidence: TEST_IDS.angleConfidence,
        hygiene: TEST_IDS.angleHygiene,
        payday: TEST_IDS.anglePayday,
      };
      return tab1Root
        .getByTestId(map[angle])
        .or(tab1Root.getByRole('button', { name: RX.angles[angle] }))
        .first();
    },
    channelCard,
    cpa: {
      root: cpaRoot,
      priceInput: cpaRoot
        .getByTestId(TEST_IDS.cpaPriceInput)
        .or(cpaRoot.getByLabel(/Harga Servis|Service Price|Harga/i))
        .or(cpaRoot.locator('input[type="number"]').nth(0))
        .first(),
      marginInput: cpaRoot
        .getByTestId(TEST_IDS.cpaMarginInput)
        .or(cpaRoot.getByLabel(/Margin/i))
        .or(cpaRoot.locator('input[type="number"]').nth(1))
        .first(),
      closeRateInput: cpaRoot
        .getByTestId(TEST_IDS.cpaCloseRateInput)
        .or(cpaRoot.getByLabel(/Kadar Tutup|Close Rate/i))
        .or(cpaRoot.locator('input[type="number"]').nth(2))
        .first(),
      cplInput: cpaRoot
        .getByTestId(TEST_IDS.cpaCplInput)
        .or(cpaRoot.getByLabel(/Anggaran CPL|Est.*CPL|CPL/i))
        .or(cpaRoot.locator('input[type="number"]').nth(3))
        .first(),
      breakEvenValue: cpaRoot.getByTestId(TEST_IDS.cpaBreakEvenValue),
      maxCplValue: cpaRoot.getByTestId(TEST_IDS.cpaMaxCplValue),
      projectedValue: cpaRoot.getByTestId(TEST_IDS.cpaProjectedValue),
      statusBadge: cpaRoot
        .getByTestId(TEST_IDS.cpaStatusBadge)
        .or(
          cpaRoot.getByText(
            /Selamat|Safe|Berhati-hati|Berjaga-jaga|Caution|Rugi|Melebihi Had|Over(?:\s+Break-Even)?\s*Limit/i,
          ),
        )
        .first(),
    },
    compliance: {
      root: complianceRoot,
      input: complianceRoot
        .getByTestId(TEST_IDS.complianceInput)
        .or(complianceRoot.locator('textarea'))
        .first(),
      testRiskyBtn: complianceRoot
        .getByTestId(TEST_IDS.complianceTestRiskyBtn)
        .or(complianceRoot.getByRole('button', { name: RX.testRisky }))
        .first(),
      applyRewriteBtn: complianceRoot
        .getByTestId(TEST_IDS.complianceApplyRewriteBtn)
        .or(complianceRoot.getByRole('button', { name: RX.applyRewrite }))
        .first(),
      findings: complianceRoot.getByTestId(TEST_IDS.complianceFindings),
      statusBadge: complianceRoot.getByTestId(TEST_IDS.complianceStatusBadge),
    },
  };

  // A5: Tab 2
  const tab2Root = page
    .getByTestId(TEST_IDS.tabPanelCarousel)
    .or(page.getByTestId('carousel-tab'))
    .or(page.locator('[role="tabpanel"]:visible'))
    .first();

  const tab2 = {
    root: tab2Root,
    slideBtn: (index1Based: number): Locator =>
      tab2Root
        .getByTestId(`carousel-slide-${index1Based}`)
        .or(tab2Root.getByRole('button', { name: new RegExp(`(?:Slide|Slaid)\\s*${index1Based}`, 'i') }))
        .first(),
    previewStage: tab2Root
      .getByTestId(TEST_IDS.carouselPreviewStage)
      .or(tab2Root.locator('[data-carousel-stage="true"]'))
      .first(),
    headlineInput: tab2Root
      .getByTestId(TEST_IDS.carouselHeadlineInput)
      .or(tab2Root.getByLabel(RX.carouselHeadlineLabel))
      .or(tab2Root.getByPlaceholder(RX.carouselHeadlinePlaceholder))
      .or(tab2Root.locator('input[type="text"], textarea'))
      .first(),
    subheadlineInput: tab2Root.getByTestId(TEST_IDS.carouselSubheadlineInput),
    logoImg: tab2Root
      .getByTestId(TEST_IDS.carouselLogoImg)
      .or(tab2Root.locator('img[data-layer="logo"], img[alt*="logo" i]'))
      .first(),
    aspect916Btn: tab2Root
      .getByTestId(TEST_IDS.safezoneAspect916)
      .or(tab2Root.getByRole('button', { name: /9:16/ }))
      .first(),
    aspect45Btn: tab2Root
      .getByTestId(TEST_IDS.safezoneAspect45)
      .or(tab2Root.getByRole('button', { name: /4:5/ }))
      .first(),
    safeZoneToggleBtn: tab2Root
      .getByTestId(TEST_IDS.safezoneOverlayToggle)
      .or(tab2Root.getByRole('button', { name: RX.safeZoneToggle }))
      .or(tab2Root.getByRole('checkbox', { name: RX.safeZoneToggle }))
      .first(),
    safeZoneOverlay: tab2Root.getByTestId(TEST_IDS.safezoneOverlay),
    downloadPngBtn: tab2Root
      .getByTestId(TEST_IDS.carouselDownloadBtn)
      .or(tab2Root.getByRole('button', { name: RX.downloadPng }))
      .first(),
  };

  // A6: Tab 3
  const tab3Root = page
    .getByTestId(TEST_IDS.tabPanelJingle)
    .or(page.getByTestId('jingle-tab'))
    .or(page.locator('[role="tabpanel"]:visible'))
    .first();

  const tab3 = {
    root: tab3Root,
    lyricsInput: tab3Root
      .getByTestId(TEST_IDS.jingleLyricsInput)
      .or(tab3Root.locator('textarea'))
      .first(),
    styleBtn: (styleId: JingleStyleId): Locator =>
      tab3Root
        .getByTestId(`jingle-style-${styleId}`)
        .or(tab3Root.getByRole('button', { name: RX.jingleStyles[styleId] }))
        .first(),
    generateBtn: tab3Root
      .getByTestId(TEST_IDS.jingleGenerateBtn)
      .or(tab3Root.getByRole('button', { name: RX.generateJingle }))
      .first(),
    audioPlayer: tab3Root
      .getByTestId(TEST_IDS.jingleAudioPlayer)
      .or(tab3Root.locator('audio'))
      .first(),
    downloadBtn: tab3Root
      .getByTestId(TEST_IDS.jingleDownloadBtn)
      .or(tab3Root.getByRole('button', { name: RX.downloadAudio }))
      .first(),
    errorMsg: tab3Root
      .getByTestId(TEST_IDS.jingleError)
      .or(tab3Root.getByRole('alert'))
      .first(),
  };

  // A7: Tab 4
  const tab4Root = page
    .getByTestId(TEST_IDS.tabPanelVideo)
    .or(page.getByTestId('video-tab'))
    .or(page.locator('[role="tabpanel"]:visible'))
    .first();

  const tab4 = {
    root: tab4Root,
    frameCard: (index1Based: number): Locator =>
      tab4Root.getByTestId(`video-storyboard-frame-${index1Based}`),
    frameInput: (index1Based: number): Locator => {
      const card = tab4Root.getByTestId(`video-storyboard-frame-${index1Based}`);
      return card
        .getByTestId(`video-frame-input-${index1Based}`)
        .or(card.locator('input[type="text"], textarea'))
        .first();
    },
    confirmCheckbox: tab4Root
      .getByTestId(TEST_IDS.videoConfirmCheckbox)
      .or(tab4Root.getByRole('checkbox', { name: RX.confirmStoryboard }))
      .or(tab4Root.getByRole('checkbox'))
      .first(),
    confirmBtn: tab4Root.getByTestId(TEST_IDS.videoConfirmBtn),
    generateBtn: tab4Root
      .getByTestId(TEST_IDS.videoGenerateBtn)
      .or(tab4Root.getByRole('button', { name: RX.generateVideo }))
      .first(),
    videoPlayer: tab4Root
      .getByTestId(TEST_IDS.videoPreviewPlayer)
      .or(tab4Root.locator('video'))
      .first(),
    downloadBtn: tab4Root
      .getByTestId(TEST_IDS.videoDownloadBtn)
      .or(tab4Root.getByRole('button', { name: RX.downloadVideo }))
      .first(),
    audioSourceBadge: tab4Root.getByTestId(TEST_IDS.videoAudioSourceBadge),
    gateWarning: tab4Root.getByTestId(TEST_IDS.videoGateWarning),
  };

  return {
    langToggleContainer,
    langMsBtn,
    langEnBtn,
    langToggle,
    headerApiSettings,
    workspaceTabs,
    tabButton,
    onboarding,
    vault,
    quickForm,
    tab1,
    tab2,
    tab3,
    tab4,
  };
}

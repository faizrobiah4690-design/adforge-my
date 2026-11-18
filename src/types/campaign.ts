import type { Dispatch, SetStateAction } from 'react';

export type UiLanguage = 'ms' | 'en';
export type BrandTone = 'casual' | 'professional';
export type AngleId = 'urgency' | 'value' | 'social_proof';
export type ChannelId = 'facebook' | 'instagram' | 'tiktok' | 'google_rsa';
export type WorkspaceTabId = 'strategy' | 'carousel' | 'jingle' | 'video';
export type AspectRatioMode = '9:16' | '4:5';
export type JingleStyleId = 'pop-ceria' | 'santai-akustik' | 'korporat-segar';
export type MusicEngineId = 'lyria-3-clip-preview' | 'lyria-3.5' | 'local';
export type VideoEngineId = 'gemini-omni-1.2-flash' | 'veo-3.1-generate-preview' | 'local';
export type JingleGenerationSource = 'lyria-api' | 'local-fallback' | 'local-synth';
export type VideoGenerationSource = 'omni-api' | 'veo-api' | 'local-fallback' | 'local-muxer';
export type WorkbenchScreen = 'onboarding' | 'workbench';
export type VariationFrameworkId = 'pas' | 'bab' | 'pov_ugc' | 'smart_buyer' | 'fomo_drop';
export type CampaignGenerationStatus = 'idle' | 'generating' | 'ready';
export type CampaignGenerationSource =
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  | 'pollinations-openai-fast'
  | 'offline-smart-demo'
  | 'offline-smart-fallback';

export interface OfferDetails {
  brandName: string;
  collabTag: string | null;
  discountPercent: string | null;
  priceTag: string | null;
  bundleOrFreebie: string | null;
  occasion: string | null;
  scarcityCue: string | null;
  productTopic: string;
  vertical: 'beauty' | 'fnb' | 'fashion' | 'services' | 'general';
  uspSummary?: string | null;
  targetAudience?: string | null;
}

export interface CustomerPsychologyProfile {
  targetPersona: string;
  coreTrigger: string;
  frictionObjections: string;
  trustAnchors: string;
  productVisionSummary?: string;
}

export interface CampaignVariationSnapshot {
  variationIndex: number;
  frameworkId: VariationFrameworkId;
  psychology: CustomerPsychologyProfile;
  copyByAngle: Record<AngleId, ChannelCopy>;
  slides: CarouselSlide[];
  jingleLyrics: string;
  storyboardFrames: StoryboardFrame[];
  source: CampaignGenerationSource;
  productVisionSummary: string | null;
}

export interface BrandProfile {
  id: string;
  name: string;
  logoDataUrl: string;          // Same-origin /assets/... or data:image/png;base64,...
  themeColor: string;           // Hex e.g. "#0EA5E9"
  tone: BrandTone;
  whatsappNumber: string;       // Normalized digits e.g. "60123456789"
  isSeeded?: boolean;
  updatedAt: string;
}

export interface PhotoAsset {
  id: string;
  label: string;
  src: string;                  // Same-origin /assets/photos/... or data:image/...
  isSample: boolean;
}

export interface CampaignInput {
  brandId: string;
  photos: [PhotoAsset, PhotoAsset];
  offerSentence: string;
  uspAndAudience?: string;
  generatedAt: string | null;
}

export interface ChannelCopy {
  facebook: { primaryText: string; headline: string; description: string; whatsappUrl: string };
  instagram: { caption: string; hashtags: string; whatsappUrl: string };
  tiktok: { hook: string; script: string; caption: string; whatsappUrl: string };
  google_rsa: { headlines: string[]; descriptions: string[]; negativeKeywords: string[]; whatsappUrl: string };
}

export interface CpaInputs {
  servicePriceRm: number;
  marginPercent: number;
  closeRatePercent: number;
  estimatedCplRm: number;
}

export interface ComplianceFinding {
  id: string;
  category: 'meta_personal_attributes' | 'my_advertising_norm';
  severity: 'high' | 'warning';
  matchedText: string;
  ruleKey: string;
  suggestionKey: string;
}

export interface CarouselSlide {
  id: string;
  index: number;
  role: 'hook' | 'offer' | 'proof' | 'cta';
  photoIndex: 0 | 1;
  aiBackgroundDataUrl?: string | null;
  badgeText: string;
  headline: string;             // Live-editable BM headline
  subheadline: string;
  highlightPoints?: string[];
  ctaText: string;
  editedByUser: boolean;
}

export interface JingleState {
  style: JingleStyleId;
  generatedStyle?: JingleStyleId | null;
  engine?: MusicEngineId;
  engineEditedByUser?: boolean;
  generatedEngine?: MusicEngineId | null;
  lyrics: string;
  lyricsEditedByUser: boolean;
  durationSec: number;          // 5.5 (<= 6.0)
  sampleRate: number;           // 48000
  wavBlob: Blob | null;
  previewUrl: string | null;
  audioMimeType?: string | null;
  audioExtension?: 'mp3' | 'wav' | 'ogg' | 'm4a' | null;
  generationSource?: JingleGenerationSource | null;
  fallbackReason?: string | null;
  source: 'tab3-generated' | 'fallback-preseeded';
  version?: number;
}

export type JingleErrorState =
  | { code: 'empty_lyrics' }
  | { code: 'synth_failed'; detail?: string }
  | null;

export interface StoryboardFrame {
  id: string;
  index: number;
  startSec: number;
  endSec: number;               // <= 5.5
  photoIndex: 0 | 1;
  overlayHeadline: string;
  lyricLine: string;
  editedByUser?: boolean;
}

export interface VideoStudioState {
  storyboardFrames: StoryboardFrame[];
  isStoryboardConfirmed: boolean;
  engine?: VideoEngineId;
  engineEditedByUser?: boolean;
  generatedEngine?: VideoEngineId | null;
  generationSource?: VideoGenerationSource | null;
  fallbackReason?: string | null;
  status: 'awaiting-confirmation' | 'rendering' | 'ready' | 'error';
  videoBlob: Blob | null;
  videoUrl: string | null;
  mimeType: string | null;
  fileExtension: 'webm' | 'mp4' | null;
  durationSec: number | null;   // <= 6.0
  width: number;                // 540 (9:16)
  height: number;               // 960 (9:16)
  audioSourceUsed: 'tab3-jingle' | 'fallback-preseeded' | 'native-ai' | null;
  jingleVersionUsed?: number | null;
  errorMessage: string | null;
  errorDetail?: string | null;
}

export interface I18nContextValue {
  locale: UiLanguage;
  setLocale: (locale: UiLanguage) => void;
  t: (key: string) => string;
}

export interface CreateBrandPayload {
  name: string;
  logoDataUrl?: string;
  themeColor?: string;
  tone?: BrandTone;
  whatsappNumber?: string;
}

export type UpdateBrandPatch = Partial<Omit<BrandProfile, 'id' | 'isSeeded'>>;

export interface WorkbenchContextValue {
  isLoggedIn: boolean;
  freelancerEmail: string | null;
  byokKey: string;
  isDemoMode: boolean;
  builtInAiActive: boolean;
  activeScreen: WorkbenchScreen;
  setActiveScreen: (screen: WorkbenchScreen) => void;
  loginWithGoogle: (email?: string) => void;
  logout: () => void;
  saveByokKey: (key: string, demoMode?: boolean) => void;
  activateBuiltInAi: () => void;
  brands: BrandProfile[];
  activeBrandId: string;
  activeBrand: BrandProfile;
  getBrandById: (brandId: string) => BrandProfile | undefined;
  selectBrand: (brandId: string) => void;
  createBrand: (payload: CreateBrandPayload) => BrandProfile;
  updateBrand: (brandId: string, patch: UpdateBrandPatch) => void;
  deleteBrand: (brandId: string) => boolean;
}

export type EditedCopyByAngle = Partial<Record<AngleId, ChannelCopy>>;
export type StrategyEnhanceNotice = 'gemini' | 'pollinations' | 'baseline';
export type StrategyEnhanceNoticeByAngle = Partial<Record<AngleId, StrategyEnhanceNotice>>;

export interface CampaignContextValue {
  input: CampaignInput;
  setInput: Dispatch<SetStateAction<CampaignInput>>;
  isLaunched: boolean;
  campaignLaunchEpoch: number;
  launchedBrandId: string;
  launchedBrand: BrandProfile;
  launchedOfferSentence: string;
  launchedUspAndAudience: string;
  launchedPhotos: [PhotoAsset, PhotoAsset];
  launchCampaign: (overrideInput?: Partial<CampaignInput>) => void;
  variationIndex: number;
  activeFrameworkId: VariationFrameworkId;
  customerPsychology: CustomerPsychologyProfile;
  productVisionSummary: string | null;
  campaignGenStatus: CampaignGenerationStatus;
  campaignGenSource: CampaignGenerationSource;
  campaignGenError: string | null;
  pollinationsCooldownUntil: number | null;
  generatedVariations: Record<number, CampaignVariationSnapshot>;
  selectVariation: (index: number) => Promise<void> | void;
  generateNewVariation: () => Promise<void>;
  activeTab: WorkspaceTabId;
  setActiveTab: (tab: WorkspaceTabId) => void;
  selectedAngle: AngleId;
  setSelectedAngle: (angle: AngleId) => void;
  editedCopyByAngle: EditedCopyByAngle;
  updateChannelCopy: <C extends ChannelId>(
    angle: AngleId,
    channel: C,
    patch: Partial<ChannelCopy[C]>
  ) => void;
  replaceAngleCopy: (angle: AngleId, copy: ChannelCopy) => void;
  setAngleCopyMap: (copyByAngle: EditedCopyByAngle) => void;
  isEnhancingStrategy: boolean;
  strategyEnhanceNoticeByAngle: StrategyEnhanceNoticeByAngle;
  strategyEnhanceErrorByAngle: Partial<Record<AngleId, string>>;
  enhanceStrategyAngleWithGemini: (angle?: AngleId) => Promise<void>;
  cpaInputs: CpaInputs;
  setCpaInputs: Dispatch<SetStateAction<CpaInputs>>;
  slides: CarouselSlide[];
  setSlides: Dispatch<SetStateAction<CarouselSlide[]>>;
  updateSlide: (slideId: string, patch: Partial<Omit<CarouselSlide, 'id'>>) => void;
  safeZoneMode: AspectRatioMode;
  setSafeZoneMode: (mode: AspectRatioMode) => void;
  jingle: JingleState;
  setJingle: Dispatch<SetStateAction<JingleState>>;
  isGeneratingJingle: boolean;
  jingleError: JingleErrorState;
  clearJingleError: () => void;
  generateJingle: () => Promise<void>;
  video: VideoStudioState;
  setVideo: Dispatch<SetStateAction<VideoStudioState>>;
  generateVideo: () => Promise<void>;
}

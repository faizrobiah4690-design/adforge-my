import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  DEFAULT_CPA_INPUTS,
  SAMPLE_BUSINESS_PHOTOS,
  SAMPLE_OFFER_CHIP,
} from '../data/seedVault';
import { useWorkbench } from './WorkbenchContext';
import {
  buildCarouselSlides,
  buildCustomerPsychology,
  buildStoryboardFrames,
  enhanceCopyWithGemini,
  generateCampaignCopyForAngle,
  generateCampaignCopyMap,
  generateCampaignWithAiCascade,
  getFrameworkForVariation,
  getPollinationsCooldownUntil,
} from '../utils/copyGenerator';
import {
  JINGLE_DURATION_SEC,
  buildJingleLyrics,
  generateJingleAudio,
  resolveVideoAudioBuffer,
} from '../utils/audioExport';
import { TOTAL_VIDEO_DURATION_SEC, exportVerticalVideo } from '../utils/videoExport';
import {
  buildLyriaJinglePrompt,
  buildVideoStoryboardPrompt,
  generateLyriaJingleWithInteractions,
  generateVideoWithInteractions,
  getDefaultMusicEngine,
  getDefaultVideoEngine,
  hasLiveApiAccess,
} from '../utils/interactionsApi';
import { rewriteWhatsappUrlPhone } from '../utils/whatsapp';
import type {
  AngleId,
  AspectRatioMode,
  BrandProfile,
  BrandTone,
  CampaignContextValue,
  CampaignGenerationSource,
  CampaignGenerationStatus,
  CampaignInput,
  CampaignVariationSnapshot,
  CarouselSlide,
  ChannelCopy,
  ChannelId,
  CpaInputs,
  CustomerPsychologyProfile,
  EditedCopyByAngle,
  JingleErrorState,
  JingleState,
  MusicEngineId,
  PhotoAsset,
  StoryboardFrame,
  StrategyEnhanceNoticeByAngle,
  VideoEngineId,
  VideoStudioState,
  WorkspaceTabId,
} from '../types/campaign';

interface LaunchedSnapshot {
  brandId: string;
  offerSentence: string;
  uspAndAudience: string;
  photos: [PhotoAsset, PhotoAsset];
}

function buildBaselineSlides(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  uspAndAudience?: string
): CarouselSlide[] {
  return buildCarouselSlides(brand, offerSentence, variationIndex, null, uspAndAudience);
}

function buildBaselineLyrics(
  brand: BrandProfile,
  offerSentence: string,
  variationIndex = 1,
  uspAndAudience?: string
): string {
  return buildJingleLyrics(brand.name, offerSentence, variationIndex, uspAndAudience);
}

function buildBaselineJingle(
  brand: BrandProfile,
  offerSentence: string,
  engine: MusicEngineId = 'local',
  variationIndex = 1,
  uspAndAudience?: string
): JingleState {
  return {
    style: 'pop-ceria',
    generatedStyle: null,
    engine,
    engineEditedByUser: false,
    generatedEngine: null,
    lyrics: buildBaselineLyrics(brand, offerSentence, variationIndex, uspAndAudience),
    lyricsEditedByUser: false,
    durationSec: 5.5,
    sampleRate: 48000,
    wavBlob: null,
    previewUrl: null,
    audioMimeType: null,
    audioExtension: null,
    generationSource: null,
    fallbackReason: null,
    source: 'fallback-preseeded',
    version: 0,
  };
}

function buildBaselineStoryboard(
  brand: BrandProfile,
  offerSentence: string,
  lyrics: string,
  variationIndex = 1,
  uspAndAudience?: string
): StoryboardFrame[] {
  return buildStoryboardFrames(brand, offerSentence, lyrics, variationIndex, null, uspAndAudience);
}

function buildBaselineVideoState(
  brand: BrandProfile,
  offerSentence: string,
  lyrics: string,
  engine: VideoEngineId = 'local',
  variationIndex = 1,
  uspAndAudience?: string
): VideoStudioState {
  return {
    storyboardFrames: buildBaselineStoryboard(
      brand,
      offerSentence,
      lyrics,
      variationIndex,
      uspAndAudience
    ),
    isStoryboardConfirmed: false,
    engine,
    engineEditedByUser: false,
    generatedEngine: null,
    generationSource: null,
    fallbackReason: null,
    status: 'awaiting-confirmation',
    videoBlob: null,
    videoUrl: null,
    mimeType: null,
    fileExtension: null,
    durationSec: null,
    width: 540,
    height: 960,
    audioSourceUsed: null,
    jingleVersionUsed: null,
    errorMessage: null,
    errorDetail: null,
  };
}

function syncChannelCopyWhatsapp(copy: ChannelCopy, nextPhone: string): ChannelCopy {
  return {
    facebook: {
      ...copy.facebook,
      primaryText: rewriteWhatsappUrlPhone(copy.facebook.primaryText, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.facebook.whatsappUrl, nextPhone),
    },
    instagram: {
      ...copy.instagram,
      caption: rewriteWhatsappUrlPhone(copy.instagram.caption, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.instagram.whatsappUrl, nextPhone),
    },
    tiktok: {
      ...copy.tiktok,
      script: rewriteWhatsappUrlPhone(copy.tiktok.script, nextPhone),
      caption: rewriteWhatsappUrlPhone(copy.tiktok.caption, nextPhone),
      whatsappUrl: rewriteWhatsappUrlPhone(copy.tiktok.whatsappUrl, nextPhone),
    },
    google_rsa: {
      ...copy.google_rsa,
      whatsappUrl: rewriteWhatsappUrlPhone(copy.google_rsa.whatsappUrl, nextPhone),
    },
  };
}

const ANGLES_LIST: readonly AngleId[] = ['urgency', 'value', 'social_proof'];

function safeRevokeBlobUrl(url: string | null): void {
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

async function probeLiveAudioMetadata(
  blob: Blob,
  fallbackDurationSec: number
): Promise<{ durationSec: number; sampleRate: number }> {
  try {
    if (typeof OfflineAudioContext !== 'undefined') {
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const bytes = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes);
      if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
        return {
          durationSec: decoded.duration,
          sampleRate: decoded.sampleRate || 48000,
        };
      }
    }
  } catch {
    // Ignore decode failure in mock/jsdom environments
  }
  return { durationSec: fallbackDurationSec, sampleRate: 48000 };
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const {
    brands,
    activeBrand,
    activeBrandId,
    isLoggedIn,
    byokKey,
    isDemoMode,
    getBrandById,
    selectBrand,
  } = useWorkbench();

  const [input, setInputState] = useState<CampaignInput>(() => ({
    brandId: activeBrandId,
    photos: [SAMPLE_BUSINESS_PHOTOS[0], SAMPLE_BUSINESS_PHOTOS[1]],
    offerSentence: SAMPLE_OFFER_CHIP,
    uspAndAudience: '',
    generatedAt: null,
  }));

  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('strategy');
  const [selectedAngle, setSelectedAngle] = useState<AngleId>('urgency');
  const [variationIndex, setVariationIndex] = useState<number>(1);
  const activeFrameworkId = useMemo(
    () => getFrameworkForVariation(variationIndex),
    [variationIndex]
  );
  const [customerPsychology, setCustomerPsychology] = useState<CustomerPsychologyProfile>(() =>
    buildCustomerPsychology(activeBrand, SAMPLE_OFFER_CHIP, 1)
  );
  const [productVisionSummary, setProductVisionSummary] = useState<string | null>(null);
  const [campaignGenStatus, setCampaignGenStatus] = useState<CampaignGenerationStatus>('idle');
  const [campaignGenSource, setCampaignGenSource] = useState<CampaignGenerationSource>(() =>
    isDemoMode ? 'offline-smart-demo' : 'offline-smart-fallback'
  );
  const [campaignGenError, setCampaignGenError] = useState<string | null>(null);
  const [pollinationsCooldownUntil, setPollinationsCooldownUntil] = useState<number | null>(null);
  const [generatedVariations, setGeneratedVariations] = useState<
    Record<number, CampaignVariationSnapshot>
  >({});
  const [editedCopyByAngle, setEditedCopyByAngle] = useState<EditedCopyByAngle>(() =>
    generateCampaignCopyMap(activeBrand, SAMPLE_OFFER_CHIP, 1)
  );
  const [isEnhancingStrategy, setIsEnhancingStrategy] = useState<boolean>(false);
  const [strategyEnhanceNoticeByAngle, setStrategyEnhanceNoticeByAngle] =
    useState<StrategyEnhanceNoticeByAngle>({});
  const [strategyEnhanceErrorByAngle, setStrategyEnhanceErrorByAngle] = useState<
    Partial<Record<AngleId, string>>
  >({});
  const [cpaInputs, setCpaInputs] = useState<CpaInputs>(() => ({ ...DEFAULT_CPA_INPUTS }));
  const [slides, setSlides] = useState<CarouselSlide[]>(() =>
    buildBaselineSlides(activeBrand, SAMPLE_OFFER_CHIP, 1)
  );
  const [safeZoneMode, setSafeZoneMode] = useState<AspectRatioMode>('9:16');
  const [jingle, setJingle] = useState<JingleState>(() =>
    buildBaselineJingle(
      activeBrand,
      SAMPLE_OFFER_CHIP,
      getDefaultMusicEngine(isDemoMode, byokKey),
      1
    )
  );
  const [isGeneratingJingle, setIsGeneratingJingle] = useState<boolean>(false);
  const [jingleError, setJingleError] = useState<JingleErrorState>(null);
  const [video, setVideo] = useState<VideoStudioState>(() => {
    const initialLyrics = buildBaselineLyrics(activeBrand, SAMPLE_OFFER_CHIP, 1);
    return buildBaselineVideoState(
      activeBrand,
      SAMPLE_OFFER_CHIP,
      initialLyrics,
      getDefaultVideoEngine(isDemoMode, byokKey),
      1
    );
  });
  const [campaignLaunchEpoch, setCampaignLaunchEpoch] = useState<number>(0);
  const [launchedSnapshot, setLaunchedSnapshot] = useState<LaunchedSnapshot | null>(null);

  const inputRef = useRef<CampaignInput>(input);
  const launchedSnapshotRef = useRef<LaunchedSnapshot | null>(null);
  const variationIndexRef = useRef<number>(variationIndex);
  variationIndexRef.current = variationIndex;
  const generatedVariationsRef = useRef<Record<number, CampaignVariationSnapshot>>(generatedVariations);
  generatedVariationsRef.current = generatedVariations;
  const productVisionSummaryRef = useRef<string | null>(productVisionSummary);
  productVisionSummaryRef.current = productVisionSummary;
  const campaignGenSourceRef = useRef<CampaignGenerationSource>(campaignGenSource);
  campaignGenSourceRef.current = campaignGenSource;
  const prevActiveBrandIdRef = useRef<string>(activeBrandId);
  const prevBrandSnapshotRef = useRef<{
    id: string;
    name: string;
    tone: BrandTone;
    whatsappNumber: string;
    themeColor: string;
    logoDataUrl: string;
  }>({
    id: activeBrand.id,
    name: activeBrand.name,
    tone: activeBrand.tone,
    whatsappNumber: activeBrand.whatsappNumber,
    themeColor: activeBrand.themeColor,
    logoDataUrl: activeBrand.logoDataUrl,
  });
  const copyEditedByUserRef = useRef<Partial<Record<AngleId, boolean>>>({});
  const editedCopyByAngleRef = useRef<EditedCopyByAngle>(editedCopyByAngle);
  editedCopyByAngleRef.current = editedCopyByAngle;
  const slidesRef = useRef<CarouselSlide[]>(slides);
  slidesRef.current = slides;
  const jingleRef = useRef<JingleState>(jingle);
  jingleRef.current = jingle;
  const videoRef = useRef<VideoStudioState>(video);
  videoRef.current = video;
  const jingleUrlRef = useRef<string | null>(jingle.previewUrl);
  const videoUrlRef = useRef<string | null>(video.videoUrl);
  jingleUrlRef.current = jingle.previewUrl;
  videoUrlRef.current = video.videoUrl;
  const isProviderMountedRef = useRef<boolean>(true);
  const jingleGenSeqRef = useRef<number>(0);
  const isJingleGeneratingRef = useRef<boolean>(false);
  const jingleAbortRef = useRef<AbortController | null>(null);
  const videoRenderSeqRef = useRef<number>(0);
  const isVideoRenderingRef = useRef<boolean>(false);
  const videoAbortRef = useRef<AbortController | null>(null);
  const strategyEnhanceSeqRef = useRef<number>(0);
  const isEnhancingStrategyRef = useRef<boolean>(false);
  const strategyAbortRef = useRef<AbortController | null>(null);
  const campaignVisionSeqRef = useRef<number>(0);
  const campaignVisionAbortRef = useRef<AbortController | null>(null);
  const isLoggedInRef = useRef<boolean>(isLoggedIn);
  isLoggedInRef.current = isLoggedIn;
  const byokKeyRef = useRef<string>(byokKey);
  byokKeyRef.current = byokKey;
  const isDemoModeRef = useRef<boolean>(isDemoMode);
  isDemoModeRef.current = isDemoMode;
  const prevAuthScopeRef = useRef<{
    isLoggedIn: boolean;
    byokKey: string;
    isDemoMode: boolean;
  }>({
    isLoggedIn,
    byokKey,
    isDemoMode,
  });
  const selectedAngleRef = useRef<AngleId>(selectedAngle);
  selectedAngleRef.current = selectedAngle;
  const campaignLaunchEpochRef = useRef<number>(campaignLaunchEpoch);
  campaignLaunchEpochRef.current = campaignLaunchEpoch;
  const launchedBrandRef = useRef<BrandProfile>(activeBrand);
  const launchedOfferRef = useRef<string>(input.offerSentence);
  const launchedUspRef = useRef<string>(input.uspAndAudience ?? '');
  const launchedBrandVisualKeyRef = useRef<string>(
    `${activeBrand.id}::${activeBrand.themeColor}::${activeBrand.logoDataUrl}::${activeBrand.name}::${activeBrand.whatsappNumber}`
  );
  const launchedBrandScopeKeyRef = useRef<string>(
    `${activeBrand.id}::${activeBrand.tone}::${activeBrand.name}::${activeBrand.whatsappNumber}::${input.offerSentence}::${input.uspAndAudience ?? ''}`
  );
  const prevLaunchedScopeKeyRef = useRef<string>(launchedBrandScopeKeyRef.current);
  const launchedPhotosRef = useRef<[PhotoAsset, PhotoAsset]>(input.photos);

  const setInput = useCallback<Dispatch<SetStateAction<CampaignInput>>>((updater) => {
    const next =
      typeof updater === 'function'
        ? (updater as (prev: CampaignInput) => CampaignInput)(inputRef.current)
        : updater;
    inputRef.current = next;
    setInputState(next);
  }, []);

  useEffect(() => {
    if (prevActiveBrandIdRef.current !== activeBrandId) {
      prevActiveBrandIdRef.current = activeBrandId;
      setInput((prev) =>
        prev.brandId === activeBrandId ? prev : { ...prev, brandId: activeBrandId }
      );
    }
  }, [activeBrandId, setInput]);

  useEffect(() => {
    if (launchedSnapshotRef.current !== null && launchedSnapshotRef.current.brandId !== activeBrand.id) {
      return;
    }

    const prev = prevBrandSnapshotRef.current;
    if (prev.id !== activeBrand.id) {
      prevBrandSnapshotRef.current = {
        id: activeBrand.id,
        name: activeBrand.name,
        tone: activeBrand.tone,
        whatsappNumber: activeBrand.whatsappNumber,
        themeColor: activeBrand.themeColor,
        logoDataUrl: activeBrand.logoDataUrl,
      };
      return;
    }

    const nameChanged = prev.name !== activeBrand.name;
    const toneChanged = prev.tone !== activeBrand.tone;
    const phoneChanged = prev.whatsappNumber !== activeBrand.whatsappNumber;
    const themeChanged = prev.themeColor !== activeBrand.themeColor;
    const logoChanged = prev.logoDataUrl !== activeBrand.logoDataUrl;

    if (!nameChanged && !toneChanged && !phoneChanged && !themeChanged && !logoChanged) {
      return;
    }

    prevBrandSnapshotRef.current = {
      id: activeBrand.id,
      name: activeBrand.name,
      tone: activeBrand.tone,
      whatsappNumber: activeBrand.whatsappNumber,
      themeColor: activeBrand.themeColor,
      logoDataUrl: activeBrand.logoDataUrl,
    };

    const currentOffer = launchedSnapshotRef.current
      ? launchedSnapshotRef.current.offerSentence
      : inputRef.current.offerSentence;
    const currentUsp = launchedSnapshotRef.current
      ? launchedSnapshotRef.current.uspAndAudience
      : (inputRef.current.uspAndAudience ?? '');
    const activeVarIdx = variationIndexRef.current;

    let nextPsych = buildCustomerPsychology(activeBrand, currentOffer, activeVarIdx, currentUsp);
    let nextCopyMap = editedCopyByAngleRef.current;
    let nextSlides = slidesRef.current;
    let effectiveLyrics = jingleRef.current.lyrics;
    let nextFrames = videoRef.current.storyboardFrames;

    if (nameChanged || toneChanged || phoneChanged) {
      campaignVisionSeqRef.current += 1;
      campaignVisionAbortRef.current?.abort();
      campaignVisionAbortRef.current = null;
      setCampaignGenStatus((prevStatus) => (prevStatus === 'generating' ? 'ready' : prevStatus));

      setCustomerPsychology(nextPsych);

      const prevMap = editedCopyByAngleRef.current;
      const computedCopyMap: EditedCopyByAngle = {};
      for (const angle of ANGLES_LIST) {
        const existing = prevMap[angle];
        if (!existing || (!copyEditedByUserRef.current[angle] && (nameChanged || toneChanged))) {
          computedCopyMap[angle] = generateCampaignCopyForAngle(
            activeBrand,
            currentOffer,
            angle,
            activeVarIdx,
            currentUsp
          );
        } else if (phoneChanged) {
          computedCopyMap[angle] = syncChannelCopyWhatsapp(existing, activeBrand.whatsappNumber);
        } else {
          computedCopyMap[angle] = existing;
        }
      }
      nextCopyMap = computedCopyMap;
      editedCopyByAngleRef.current = computedCopyMap;
      setEditedCopyByAngle(computedCopyMap);

      const baselineSlides = buildBaselineSlides(activeBrand, currentOffer, activeVarIdx, currentUsp);
      nextSlides = slidesRef.current.map((slide, idx) =>
        slide.editedByUser ? slide : (baselineSlides[idx] ?? slide)
      );
      slidesRef.current = nextSlides;
      setSlides(nextSlides);

      if (nameChanged || phoneChanged) {
        const nextLyrics = buildBaselineLyrics(activeBrand, currentOffer, activeVarIdx, currentUsp);
        effectiveLyrics = jingleRef.current.lyricsEditedByUser
          ? jingleRef.current.lyrics
          : nextLyrics;
        if (!jingleRef.current.lyricsEditedByUser) {
          setJingle((prevJingle) =>
            prevJingle.lyricsEditedByUser ? prevJingle : { ...prevJingle, lyrics: nextLyrics }
          );
        }
      }
    }

    if (nameChanged || phoneChanged || themeChanged || logoChanged) {
      videoRenderSeqRef.current += 1;
      videoAbortRef.current?.abort();
      videoAbortRef.current = null;
      isVideoRenderingRef.current = false;
      const nextLyrics = buildBaselineLyrics(activeBrand, currentOffer, activeVarIdx, currentUsp);
      effectiveLyrics = jingleRef.current.lyricsEditedByUser
        ? jingleRef.current.lyrics
        : nextLyrics;
      const baselineFrames =
        nameChanged || phoneChanged
          ? buildBaselineStoryboard(
              activeBrand,
              currentOffer,
              effectiveLyrics,
              activeVarIdx,
              currentUsp
            )
          : null;

      if (baselineFrames) {
        nextFrames = videoRef.current.storyboardFrames.map((frame, idx) =>
          frame.editedByUser ? frame : (baselineFrames[idx] ?? frame)
        );
      }

      setVideo((prevVideo) => {
        const computedFrames = baselineFrames
          ? prevVideo.storyboardFrames.map((frame, idx) =>
              frame.editedByUser ? frame : (baselineFrames[idx] ?? frame)
            )
          : prevVideo.storyboardFrames;
        if (prevVideo.status === 'ready' || prevVideo.status === 'rendering' || prevVideo.status === 'error') {
          safeRevokeBlobUrl(prevVideo.videoUrl);
          return {
            ...prevVideo,
            storyboardFrames: computedFrames,
            isStoryboardConfirmed: false,
            status: 'awaiting-confirmation',
            videoBlob: null,
            videoUrl: null,
            mimeType: null,
            fileExtension: null,
            durationSec: null,
            audioSourceUsed: null,
            jingleVersionUsed: null,
            errorMessage: null,
            errorDetail: null,
          };
        }
        const framesUpdated =
          baselineFrames !== null &&
          computedFrames.some(
            (frame, idx) =>
              frame.overlayHeadline !== prevVideo.storyboardFrames[idx]?.overlayHeadline ||
              frame.lyricLine !== prevVideo.storyboardFrames[idx]?.lyricLine
          );
        const visualBrandingChanged = nameChanged || themeChanged || logoChanged;
        if (framesUpdated || (prevVideo.isStoryboardConfirmed && visualBrandingChanged)) {
          return {
            ...prevVideo,
            storyboardFrames: computedFrames,
            isStoryboardConfirmed: false,
          };
        }
        return prevVideo;
      });
    }

    if (nameChanged || toneChanged) {
      if (launchedSnapshotRef.current !== null) {
        const offlineSource: CampaignGenerationSource = isDemoModeRef.current
          ? 'offline-smart-demo'
          : 'offline-smart-fallback';
        const snapshotCopyByAngle: Record<AngleId, ChannelCopy> = {
          urgency:
            nextCopyMap.urgency ??
            generateCampaignCopyForAngle(activeBrand, currentOffer, 'urgency', activeVarIdx),
          value:
            nextCopyMap.value ??
            generateCampaignCopyForAngle(activeBrand, currentOffer, 'value', activeVarIdx),
          social_proof:
            nextCopyMap.social_proof ??
            generateCampaignCopyForAngle(activeBrand, currentOffer, 'social_proof', activeVarIdx),
        };
        const refreshedSnapshot: CampaignVariationSnapshot = {
          variationIndex: activeVarIdx,
          frameworkId: getFrameworkForVariation(activeVarIdx),
          psychology: nextPsych,
          copyByAngle: snapshotCopyByAngle,
          slides: nextSlides,
          jingleLyrics: effectiveLyrics,
          storyboardFrames: nextFrames,
          source: offlineSource,
          productVisionSummary: null,
        };
        const nextCache = { [activeVarIdx]: refreshedSnapshot };
        generatedVariationsRef.current = nextCache;
        setGeneratedVariations(nextCache);
        productVisionSummaryRef.current = null;
        setProductVisionSummary(null);
        campaignGenSourceRef.current = offlineSource;
        setCampaignGenSource(offlineSource);
      } else {
        generatedVariationsRef.current = {};
        setGeneratedVariations({});
      }
    }
  }, [activeBrand]);

  useEffect(() => {
    isProviderMountedRef.current = true;
    return () => {
      isProviderMountedRef.current = false;
      campaignVisionSeqRef.current += 1;
      campaignVisionAbortRef.current?.abort();
      campaignVisionAbortRef.current = null;
      jingleGenSeqRef.current += 1;
      jingleAbortRef.current?.abort();
      jingleAbortRef.current = null;
      isJingleGeneratingRef.current = false;
      videoRenderSeqRef.current += 1;
      videoAbortRef.current?.abort();
      videoAbortRef.current = null;
      isVideoRenderingRef.current = false;
      strategyEnhanceSeqRef.current += 1;
      strategyAbortRef.current?.abort();
      strategyAbortRef.current = null;
      isEnhancingStrategyRef.current = false;
      safeRevokeBlobUrl(jingleUrlRef.current);
      safeRevokeBlobUrl(videoUrlRef.current);
    };
  }, []);

  const isLaunched = input.generatedAt !== null;
  const launchedBrandId = launchedSnapshot ? launchedSnapshot.brandId : activeBrand.id;
  const launchedBrand = useMemo(
    () => brands.find((b) => b.id === launchedBrandId) ?? activeBrand,
    [brands, launchedBrandId, activeBrand]
  );
  const launchedOfferSentence = launchedSnapshot
    ? launchedSnapshot.offerSentence
    : input.offerSentence;
  const launchedUspAndAudience = launchedSnapshot
    ? launchedSnapshot.uspAndAudience
    : (input.uspAndAudience ?? '');
  const launchedPhotos = launchedSnapshot ? launchedSnapshot.photos : input.photos;
  const launchedBrandVisualKey = `${launchedBrand.id}::${launchedBrand.themeColor}::${launchedBrand.logoDataUrl}::${launchedBrand.name}::${launchedBrand.whatsappNumber}`;
  const launchedBrandScopeKey = `${launchedBrand.id}::${launchedBrand.tone}::${launchedBrand.name}::${launchedBrand.whatsappNumber}::${launchedOfferSentence}::${launchedUspAndAudience}`;
  launchedBrandRef.current = launchedBrand;
  launchedOfferRef.current = launchedOfferSentence;
  launchedUspRef.current = launchedUspAndAudience;
  launchedBrandVisualKeyRef.current = launchedBrandVisualKey;
  launchedBrandScopeKeyRef.current = launchedBrandScopeKey;
  launchedPhotosRef.current = launchedPhotos;

  useEffect(() => {
    if (prevLaunchedScopeKeyRef.current === launchedBrandScopeKey) {
      return;
    }
    prevLaunchedScopeKeyRef.current = launchedBrandScopeKey;
    strategyEnhanceSeqRef.current += 1;
    strategyAbortRef.current?.abort();
    strategyAbortRef.current = null;
    isEnhancingStrategyRef.current = false;
    setIsEnhancingStrategy(false);
    setStrategyEnhanceNoticeByAngle({});
    setStrategyEnhanceErrorByAngle({});
    setCampaignGenError(null);
  }, [launchedBrandScopeKey]);

  useEffect(() => {
    const prev = prevAuthScopeRef.current;
    if (
      prev.isLoggedIn === isLoggedIn &&
      prev.byokKey === byokKey &&
      prev.isDemoMode === isDemoMode
    ) {
      return;
    }
    prevAuthScopeRef.current = { isLoggedIn, byokKey, isDemoMode };
    campaignVisionSeqRef.current += 1;
    campaignVisionAbortRef.current?.abort();
    campaignVisionAbortRef.current = null;
    setCampaignGenStatus((prevStatus) => (prevStatus === 'generating' ? 'ready' : prevStatus));

    strategyEnhanceSeqRef.current += 1;
    strategyAbortRef.current?.abort();
    strategyAbortRef.current = null;
    isEnhancingStrategyRef.current = false;
    setIsEnhancingStrategy(false);
    setStrategyEnhanceNoticeByAngle({});
    setStrategyEnhanceErrorByAngle({});
    setCampaignGenError(null);

    jingleGenSeqRef.current += 1;
    jingleAbortRef.current?.abort();
    jingleAbortRef.current = null;
    isJingleGeneratingRef.current = false;
    setIsGeneratingJingle(false);

    videoRenderSeqRef.current += 1;
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    isVideoRenderingRef.current = false;

    const liveAccess = hasLiveApiAccess(isDemoMode, byokKey);
    const defaultMusicEngine = getDefaultMusicEngine(isDemoMode, byokKey);
    const defaultVideoEngine = getDefaultVideoEngine(isDemoMode, byokKey);

    if (!liveAccess && campaignGenSourceRef.current !== 'offline-smart-demo') {
      setCampaignGenSource(isDemoMode ? 'offline-smart-demo' : 'offline-smart-fallback');
    }

    setJingle((prevJingle) => {
      if (!liveAccess) {
        if (prevJingle.engine === 'local' && !prevJingle.engineEditedByUser) {
          return prevJingle;
        }
        return {
          ...prevJingle,
          engine: 'local',
          engineEditedByUser: false,
        };
      }
      if (!prevJingle.engineEditedByUser && prevJingle.engine !== defaultMusicEngine) {
        return {
          ...prevJingle,
          engine: defaultMusicEngine,
        };
      }
      return prevJingle;
    });

    setVideo((prevVideo) => {
      const resetRendering = prevVideo.status === 'rendering';
      if (!liveAccess) {
        if (
          !resetRendering &&
          prevVideo.engine === 'local' &&
          !prevVideo.engineEditedByUser
        ) {
          return prevVideo;
        }
        return {
          ...prevVideo,
          engine: 'local',
          engineEditedByUser: false,
          ...(resetRendering ? { status: 'awaiting-confirmation' as const } : {}),
        };
      }
      if (!prevVideo.engineEditedByUser && prevVideo.engine !== defaultVideoEngine) {
        return {
          ...prevVideo,
          engine: defaultVideoEngine,
          ...(resetRendering ? { status: 'awaiting-confirmation' as const } : {}),
        };
      }
      return resetRendering
        ? { ...prevVideo, status: 'awaiting-confirmation' as const }
        : prevVideo;
    });
  }, [isLoggedIn, byokKey, isDemoMode]);

  const runMultimodalVariation = useCallback(
    async (params: {
      targetIndex: number;
      brand: BrandProfile;
      offerSentence: string;
      uspAndAudience: string;
      photos: [PhotoAsset, PhotoAsset];
      epochAtStart: number;
      scopeKeyAtStart: string;
      isFullLaunch: boolean;
    }): Promise<void> => {
      const {
        targetIndex,
        brand,
        offerSentence,
        uspAndAudience,
        photos,
        epochAtStart,
        scopeKeyAtStart,
        isFullLaunch,
      } = params;

      const reqSeq = ++campaignVisionSeqRef.current;
      campaignVisionAbortRef.current?.abort();
      campaignVisionAbortRef.current = null;

      const frameworkId = getFrameworkForVariation(targetIndex);
      const baselinePsych = buildCustomerPsychology(
        brand,
        offerSentence,
        targetIndex,
        uspAndAudience
      );
      const baselineCopyMap = generateCampaignCopyMap(
        brand,
        offerSentence,
        targetIndex,
        uspAndAudience
      );
      const baselineSlides = buildBaselineSlides(
        brand,
        offerSentence,
        targetIndex,
        uspAndAudience
      );
      const baselineLyrics = buildBaselineLyrics(
        brand,
        offerSentence,
        targetIndex,
        uspAndAudience
      );
      const baselineFrames = buildBaselineStoryboard(
        brand,
        offerSentence,
        baselineLyrics,
        targetIndex,
        uspAndAudience
      );

      const loggedInAtStart = isLoggedInRef.current;
      const demoAtStart = isDemoModeRef.current;
      const keyAtStart = byokKeyRef.current;
      const canLive = loggedInAtStart && !demoAtStart;
      const offlineSource: CampaignGenerationSource = demoAtStart
        ? 'offline-smart-demo'
        : 'offline-smart-fallback';

      copyEditedByUserRef.current = {};
      variationIndexRef.current = targetIndex;
      setVariationIndex(targetIndex);
      setCustomerPsychology(baselinePsych);
      setProductVisionSummary(null);
      productVisionSummaryRef.current = null;
      setCampaignGenError(null);
      setEditedCopyByAngle(baselineCopyMap);
      setSlides(baselineSlides);

      if (isFullLaunch) {
        const defaultMusicEngine = getDefaultMusicEngine(demoAtStart, keyAtStart);
        const defaultVideoEngine = getDefaultVideoEngine(demoAtStart, keyAtStart);
        setJingle(
          buildBaselineJingle(
            brand,
            offerSentence,
            defaultMusicEngine,
            targetIndex,
            uspAndAudience
          )
        );
        setVideo(
          buildBaselineVideoState(
            brand,
            offerSentence,
            baselineLyrics,
            defaultVideoEngine,
            targetIndex,
            uspAndAudience
          )
        );
      } else {
        setJingle((prevJingle) => ({
          ...prevJingle,
          lyrics: baselineLyrics,
          lyricsEditedByUser: false,
        }));
        setVideo((prevVideo) => {
          safeRevokeBlobUrl(prevVideo.videoUrl);
          return {
            ...prevVideo,
            storyboardFrames: baselineFrames,
            isStoryboardConfirmed: false,
            status: 'awaiting-confirmation',
            videoBlob: null,
            videoUrl: null,
            mimeType: null,
            fileExtension: null,
            durationSec: null,
            audioSourceUsed: null,
            jingleVersionUsed: null,
            errorMessage: null,
            errorDetail: null,
          };
        });
      }

      const baselineSnapshot: CampaignVariationSnapshot = {
        variationIndex: targetIndex,
        frameworkId,
        psychology: baselinePsych,
        copyByAngle: baselineCopyMap,
        slides: baselineSlides,
        jingleLyrics: baselineLyrics,
        storyboardFrames: baselineFrames,
        source: offlineSource,
        productVisionSummary: null,
      };
      setGeneratedVariations((prev) => {
        const next = isFullLaunch
          ? { [targetIndex]: baselineSnapshot }
          : { ...prev, [targetIndex]: baselineSnapshot };
        generatedVariationsRef.current = next;
        return next;
      });

      if (!canLive) {
        campaignGenSourceRef.current = offlineSource;
        setCampaignGenSource(offlineSource);
        setCampaignGenStatus('ready');
        return;
      }

      const controller = new AbortController();
      campaignVisionAbortRef.current = controller;
      setCampaignGenStatus('generating');

      const isStale = () =>
        !isProviderMountedRef.current ||
        campaignVisionSeqRef.current !== reqSeq ||
        campaignLaunchEpochRef.current !== epochAtStart ||
        launchedBrandScopeKeyRef.current !== scopeKeyAtStart ||
        variationIndexRef.current !== targetIndex ||
        !isLoggedInRef.current ||
        isDemoModeRef.current ||
        byokKeyRef.current !== keyAtStart;

      try {
        const result = await generateCampaignWithAiCascade({
          apiKey: keyAtStart,
          isDemoMode: demoAtStart,
          brand,
          offerSentence,
          uspAndAudience,
          photos,
          variationIndex: targetIndex,
          signal: controller.signal,
        });

        if (isStale()) {
          return;
        }

        const cooldownUntil =
          result.cooldownUntilMs ??
          (getPollinationsCooldownUntil() > Date.now()
            ? getPollinationsCooldownUntil()
            : null);
        setPollinationsCooldownUntil(cooldownUntil);

        const errorNotice = (() => {
          if (result.byokErrorReason && result.source === 'pollinations-openai-fast') {
            return `Kunci Google BYOK gagal (${result.byokErrorReason}) — bertukar automatik ke AI Terbina Dalam.`;
          }
          if (result.byokErrorReason && result.pollinationsErrorReason) {
            return `Kunci Google BYOK gagal (${result.byokErrorReason}) & AI Terbina Dalam (${result.pollinationsErrorReason}) — menggunakan enjin pintar pantas.`;
          }
          if (result.byokErrorReason) {
            return `Kunci Google BYOK gagal (${result.byokErrorReason}) — menggunakan sandaran tempatan.`;
          }
          if (result.pollinationsErrorReason) {
            return `AI Terbina Dalam (${result.pollinationsErrorReason}) — menggunakan enjin pintar pantas.`;
          }
          return null;
        })();
        setCampaignGenError(errorNotice);

        const isAiHydrated =
          result.source === 'gemini-2.5-flash' ||
          result.source === 'gemini-2.0-flash' ||
          result.source === 'pollinations-openai-fast';
        campaignGenSourceRef.current = result.source;
        setCampaignGenSource(result.source);
        setProductVisionSummary(result.visualSummary);
        productVisionSummaryRef.current = result.visualSummary;
        setCustomerPsychology(result.psychology);

        if (isAiHydrated) {
          setEditedCopyByAngle((prevMap) => {
            const nextMap: EditedCopyByAngle = {};
            for (const angle of ANGLES_LIST) {
              if (copyEditedByUserRef.current[angle] && prevMap[angle]) {
                nextMap[angle] = prevMap[angle];
              } else {
                nextMap[angle] = result.copyByAngle[angle];
              }
            }
            return nextMap;
          });

          const hydratedSlides = baselineSlides.map((slide, idx) => ({
            ...slide,
            ...(result.carouselSlides[idx] ?? {}),
          }));
          setSlides((prevSlides) =>
            prevSlides.map((slide, idx) =>
              slide.editedByUser ? slide : (hydratedSlides[idx] ?? slide)
            )
          );

          if (!jingleRef.current.lyricsEditedByUser) {
            setJingle((prevJingle) =>
              prevJingle.lyricsEditedByUser
                ? prevJingle
                : { ...prevJingle, lyrics: result.jingleLyrics }
            );
          }

          const hydratedFrames = baselineFrames.map((frame, idx) => ({
            ...frame,
            ...(result.storyboardFrames[idx] ?? {}),
          }));
          setVideo((prevVideo) => {
            const nextFrames = prevVideo.storyboardFrames.map((frame, idx) =>
              frame.editedByUser ? frame : (hydratedFrames[idx] ?? frame)
            );
            const changed = nextFrames.some(
              (f, idx) =>
                f.overlayHeadline !== prevVideo.storyboardFrames[idx]?.overlayHeadline ||
                f.lyricLine !== prevVideo.storyboardFrames[idx]?.lyricLine
            );
            if (!changed) {
              return prevVideo;
            }
            if (
              prevVideo.status === 'ready' ||
              prevVideo.status === 'rendering' ||
              prevVideo.status === 'error'
            ) {
              safeRevokeBlobUrl(prevVideo.videoUrl);
              return {
                ...prevVideo,
                storyboardFrames: nextFrames,
                isStoryboardConfirmed: false,
                status: 'awaiting-confirmation',
                videoBlob: null,
                videoUrl: null,
                mimeType: null,
                fileExtension: null,
                durationSec: null,
                audioSourceUsed: null,
                jingleVersionUsed: null,
                errorMessage: null,
                errorDetail: null,
              };
            }
            return {
              ...prevVideo,
              storyboardFrames: nextFrames,
              isStoryboardConfirmed: false,
            };
          });

          const hydratedSnapshot: CampaignVariationSnapshot = {
            variationIndex: targetIndex,
            frameworkId,
            psychology: result.psychology,
            copyByAngle: result.copyByAngle,
            slides: hydratedSlides,
            jingleLyrics: result.jingleLyrics,
            storyboardFrames: hydratedFrames,
            source: result.source,
            productVisionSummary: result.visualSummary,
          };
          setGeneratedVariations((prev) => {
            const next = { ...prev, [targetIndex]: hydratedSnapshot };
            generatedVariationsRef.current = next;
            return next;
          });
        }
      } finally {
        if (campaignVisionAbortRef.current === controller) {
          campaignVisionAbortRef.current = null;
        }
        if (campaignVisionSeqRef.current === reqSeq && isProviderMountedRef.current) {
          setCampaignGenStatus('ready');
        }
      }
    },
    []
  );

  const launchCampaign = useCallback(
    (overrideInput?: Partial<CampaignInput>) => {
      jingleGenSeqRef.current += 1;
      jingleAbortRef.current?.abort();
      jingleAbortRef.current = null;
      isJingleGeneratingRef.current = false;
      setIsGeneratingJingle(false);
      setJingleError(null);
      videoRenderSeqRef.current += 1;
      videoAbortRef.current?.abort();
      videoAbortRef.current = null;
      isVideoRenderingRef.current = false;
      strategyEnhanceSeqRef.current += 1;
      strategyAbortRef.current?.abort();
      strategyAbortRef.current = null;
      isEnhancingStrategyRef.current = false;
      setIsEnhancingStrategy(false);
      setStrategyEnhanceNoticeByAngle({});
      safeRevokeBlobUrl(jingleUrlRef.current);
      safeRevokeBlobUrl(videoUrlRef.current);

      const currentInput = inputRef.current;
      const generatedAt = new Date().toISOString();
      const targetBrandId = overrideInput?.brandId ?? (currentInput.brandId || activeBrandId);
      const resolvedBrand =
        getBrandById(targetBrandId) ??
        brands.find((b) => b.id === targetBrandId) ??
        activeBrand;
      const nextInput: CampaignInput = {
        brandId: resolvedBrand.id,
        photos: overrideInput?.photos ?? currentInput.photos,
        offerSentence: overrideInput?.offerSentence ?? currentInput.offerSentence,
        uspAndAudience:
          overrideInput?.uspAndAudience ?? currentInput.uspAndAudience ?? '',
        generatedAt,
      };
      const resolvedOffer = nextInput.offerSentence;
      const resolvedUsp = nextInput.uspAndAudience ?? '';

      if (resolvedBrand.id !== activeBrandId) {
        selectBrand(resolvedBrand.id);
      }

      const nextSnapshot: LaunchedSnapshot = {
        brandId: resolvedBrand.id,
        offerSentence: resolvedOffer,
        uspAndAudience: resolvedUsp,
        photos: nextInput.photos,
      };
      launchedSnapshotRef.current = nextSnapshot;
      setLaunchedSnapshot(nextSnapshot);
      prevBrandSnapshotRef.current = {
        id: resolvedBrand.id,
        name: resolvedBrand.name,
        tone: resolvedBrand.tone,
        whatsappNumber: resolvedBrand.whatsappNumber,
        themeColor: resolvedBrand.themeColor,
        logoDataUrl: resolvedBrand.logoDataUrl,
      };
      inputRef.current = nextInput;
      setInputState(nextInput);

      const nextEpoch = campaignLaunchEpochRef.current + 1;
      campaignLaunchEpochRef.current = nextEpoch;
      setCampaignLaunchEpoch(nextEpoch);

      const nextScopeKey = `${resolvedBrand.id}::${resolvedBrand.tone}::${resolvedBrand.name}::${resolvedBrand.whatsappNumber}::${resolvedOffer}::${resolvedUsp}`;
      launchedBrandScopeKeyRef.current = nextScopeKey;
      prevLaunchedScopeKeyRef.current = nextScopeKey;
      launchedBrandRef.current = resolvedBrand;
      launchedOfferRef.current = resolvedOffer;
      launchedUspRef.current = resolvedUsp;
      launchedPhotosRef.current = nextInput.photos;
      launchedBrandVisualKeyRef.current = `${resolvedBrand.id}::${resolvedBrand.themeColor}::${resolvedBrand.logoDataUrl}::${resolvedBrand.name}::${resolvedBrand.whatsappNumber}`;

      setActiveTab('strategy');

      void runMultimodalVariation({
        targetIndex: 1,
        brand: resolvedBrand,
        offerSentence: resolvedOffer,
        uspAndAudience: resolvedUsp,
        photos: nextInput.photos,
        epochAtStart: nextEpoch,
        scopeKeyAtStart: nextScopeKey,
        isFullLaunch: true,
      });
    },
    [activeBrand, activeBrandId, brands, getBrandById, runMultimodalVariation, selectBrand]
  );

  const selectVariation = useCallback(
    async (index: number) => {
      const targetIndex =
        Number.isFinite(index) && index >= 1 ? Math.floor(index) : 1;

      if (
        targetIndex === variationIndexRef.current &&
        generatedVariationsRef.current[targetIndex]
      ) {
        return;
      }

      strategyEnhanceSeqRef.current += 1;
      strategyAbortRef.current?.abort();
      strategyAbortRef.current = null;
      isEnhancingStrategyRef.current = false;
      setIsEnhancingStrategy(false);
      setStrategyEnhanceNoticeByAngle({});

      videoRenderSeqRef.current += 1;
      videoAbortRef.current?.abort();
      videoAbortRef.current = null;
      isVideoRenderingRef.current = false;

      const brand = launchedBrandRef.current;
      const offerSentence = launchedOfferRef.current;
      const uspAndAudience = launchedUspRef.current;
      const photos = launchedPhotosRef.current;
      const epochAtStart = campaignLaunchEpochRef.current;
      const scopeKeyAtStart = launchedBrandScopeKeyRef.current;

      const cached = generatedVariationsRef.current[targetIndex];
      if (cached) {
        campaignVisionSeqRef.current += 1;
        campaignVisionAbortRef.current?.abort();
        campaignVisionAbortRef.current = null;

        copyEditedByUserRef.current = {};
        variationIndexRef.current = targetIndex;
        setVariationIndex(targetIndex);
        setCustomerPsychology(cached.psychology);
        setProductVisionSummary(cached.productVisionSummary);
        productVisionSummaryRef.current = cached.productVisionSummary;
        campaignGenSourceRef.current = cached.source;
        setCampaignGenSource(cached.source);
        setCampaignGenStatus('ready');

        const syncedCopy: EditedCopyByAngle = {};
        for (const angle of ANGLES_LIST) {
          syncedCopy[angle] = syncChannelCopyWhatsapp(
            cached.copyByAngle[angle],
            brand.whatsappNumber
          );
        }
        setEditedCopyByAngle(syncedCopy);

        const baselineSlidesForWa = buildBaselineSlides(
          brand,
          offerSentence,
          targetIndex,
          uspAndAudience
        );
        setSlides(
          cached.slides.map((slide, idx) => ({
            ...slide,
            editedByUser: false,
            ...(slide.role === 'cta'
              ? {
                  subheadline: /\+\d+/.test(slide.subheadline)
                    ? slide.subheadline.replace(/\+\d+/g, `+${brand.whatsappNumber}`)
                    : (baselineSlidesForWa[idx]?.subheadline ??
                      `Nombor rasmi: +${brand.whatsappNumber}`),
                }
              : {}),
          }))
        );

        setJingle((prevJingle) => ({
          ...prevJingle,
          lyrics: cached.jingleLyrics,
          lyricsEditedByUser: false,
        }));

        const baselineFramesForWa = buildBaselineStoryboard(
          brand,
          offerSentence,
          cached.jingleLyrics,
          targetIndex,
          uspAndAudience
        );
        setVideo((prevVideo) => {
          safeRevokeBlobUrl(prevVideo.videoUrl);
          return {
            ...prevVideo,
            storyboardFrames: cached.storyboardFrames.map((f, idx) => ({
              ...f,
              editedByUser: false,
              ...(idx === 3
                ? {
                    overlayHeadline: /\+\d+/.test(f.overlayHeadline)
                      ? f.overlayHeadline.replace(/\+\d+/g, `+${brand.whatsappNumber}`)
                      : (baselineFramesForWa[3]?.overlayHeadline ??
                        `WhatsApp +${brand.whatsappNumber}`),
                  }
                : {}),
            })),
            isStoryboardConfirmed: false,
            status: 'awaiting-confirmation',
            videoBlob: null,
            videoUrl: null,
            mimeType: null,
            fileExtension: null,
            durationSec: null,
            audioSourceUsed: null,
            jingleVersionUsed: null,
            errorMessage: null,
            errorDetail: null,
          };
        });
        return;
      }

      await runMultimodalVariation({
        targetIndex,
        brand,
        offerSentence,
        uspAndAudience,
        photos,
        epochAtStart,
        scopeKeyAtStart,
        isFullLaunch: false,
      });
    },
    [runMultimodalVariation]
  );

  const generateNewVariation = useCallback(async () => {
    strategyEnhanceSeqRef.current += 1;
    strategyAbortRef.current?.abort();
    strategyAbortRef.current = null;
    isEnhancingStrategyRef.current = false;
    setIsEnhancingStrategy(false);
    setStrategyEnhanceNoticeByAngle({});
    setStrategyEnhanceErrorByAngle({});
    setCampaignGenError(null);

    videoRenderSeqRef.current += 1;
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    isVideoRenderingRef.current = false;

    const existingIndices = Object.keys(generatedVariationsRef.current)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1);
    const maxIndex = Math.max(variationIndexRef.current, ...existingIndices, 1);
    const nextIndex = maxIndex + 1;

    await runMultimodalVariation({
      targetIndex: nextIndex,
      brand: launchedBrandRef.current,
      offerSentence: launchedOfferRef.current,
      uspAndAudience: launchedUspRef.current,
      photos: launchedPhotosRef.current,
      epochAtStart: campaignLaunchEpochRef.current,
      scopeKeyAtStart: launchedBrandScopeKeyRef.current,
      isFullLaunch: false,
    });
  }, [runMultimodalVariation]);

  const updateChannelCopy = useCallback(
    <C extends ChannelId>(angle: AngleId, channel: C, patch: Partial<ChannelCopy[C]>) => {
      copyEditedByUserRef.current[angle] = true;
      setEditedCopyByAngle((prev) => {
        const snapshot = launchedSnapshotRef.current;
        const targetBrand = snapshot
          ? (brands.find((b) => b.id === snapshot.brandId) ?? activeBrand)
          : activeBrand;
        const targetOffer = snapshot ? snapshot.offerSentence : inputRef.current.offerSentence;
        const existingAngle =
          prev[angle] ??
          generateCampaignCopyForAngle(
            targetBrand,
            targetOffer,
            angle,
            variationIndexRef.current
          );
        return {
          ...prev,
          [angle]: {
            ...existingAngle,
            [channel]: {
              ...existingAngle[channel],
              ...patch,
            },
          },
        };
      });
    },
    [activeBrand, brands]
  );

  const replaceAngleCopy = useCallback((angle: AngleId, copy: ChannelCopy) => {
    copyEditedByUserRef.current[angle] = true;
    setEditedCopyByAngle((prev) => ({
      ...prev,
      [angle]: copy,
    }));
  }, []);

  const setAngleCopyMap = useCallback((copyByAngle: EditedCopyByAngle) => {
    setEditedCopyByAngle(copyByAngle);
  }, []);

  const enhanceStrategyAngleWithGemini = useCallback(
    async (angle?: AngleId) => {
      const targetAngle = angle ?? selectedAngleRef.current;
      const loggedInAtStart = isLoggedInRef.current;
      const keyAtStart = byokKeyRef.current;
      const demoAtStart = isDemoModeRef.current;
      if (
        !loggedInAtStart ||
        demoAtStart ||
        isEnhancingStrategyRef.current
      ) {
        return;
      }

      const reqSeq = ++strategyEnhanceSeqRef.current;
      isEnhancingStrategyRef.current = true;
      setIsEnhancingStrategy(true);
      setStrategyEnhanceNoticeByAngle((prev) => {
        if (!(targetAngle in prev)) return prev;
        const next = { ...prev };
        delete next[targetAngle];
        return next;
      });
      setStrategyEnhanceErrorByAngle((prev) => {
        if (!(targetAngle in prev)) return prev;
        const next = { ...prev };
        delete next[targetAngle];
        return next;
      });

      const epochAtStart = campaignLaunchEpochRef.current;
      const scopeKeyAtStart = launchedBrandScopeKeyRef.current;
      const brandSnapshot = launchedBrandRef.current;
      const offerSnapshot = launchedOfferRef.current;
      const uspSnapshot = launchedUspRef.current;
      const variationAtStart = variationIndexRef.current;
      const photosSnapshot = launchedPhotosRef.current;

      const isStale = () =>
        !isProviderMountedRef.current ||
        strategyEnhanceSeqRef.current !== reqSeq ||
        campaignLaunchEpochRef.current !== epochAtStart ||
        launchedBrandScopeKeyRef.current !== scopeKeyAtStart ||
        variationIndexRef.current !== variationAtStart ||
        !isLoggedInRef.current ||
        byokKeyRef.current !== keyAtStart ||
        isDemoModeRef.current !== demoAtStart;

      try {
        const result = await enhanceCopyWithGemini({
          apiKey: keyAtStart,
          isDemoMode: demoAtStart,
          brand: brandSnapshot,
          offerSentence: offerSnapshot,
          uspAndAudience: uspSnapshot,
          angle: targetAngle,
          variationIndex: variationAtStart,
          photos: photosSnapshot,
        });

        if (isStale()) {
          return;
        }

        if (result.cooldownUntilMs) {
          setPollinationsCooldownUntil(result.cooldownUntilMs);
        }

        replaceAngleCopy(targetAngle, result.copy);
        setStrategyEnhanceNoticeByAngle((prev) => ({
          ...prev,
          [targetAngle]: result.source,
        }));
        if (result.errorReason) {
          setStrategyEnhanceErrorByAngle((prev) => ({
            ...prev,
            [targetAngle]: result.errorReason as string,
          }));
        }
      } finally {
        if (strategyEnhanceSeqRef.current === reqSeq) {
          isEnhancingStrategyRef.current = false;
          if (isProviderMountedRef.current) {
            setIsEnhancingStrategy(false);
          }
        }
      }
    },
    [replaceAngleCopy]
  );

  const updateSlide = useCallback(
    (slideId: string, patch: Partial<Omit<CarouselSlide, 'id'>>) => {
      setSlides((prev) =>
        prev.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide))
      );
    },
    []
  );

  const clearJingleError = useCallback(() => {
    setJingleError(null);
  }, []);

  const generateJingle = useCallback(async () => {
    if (isJingleGeneratingRef.current) {
      return;
    }

    const currentJingle = jingleRef.current;
    if (currentJingle.lyrics.trim().length === 0) {
      setJingleError({ code: 'empty_lyrics' });
      return;
    }

    const reqSeq = ++jingleGenSeqRef.current;
    isJingleGeneratingRef.current = true;
    setIsGeneratingJingle(true);
    setJingleError(null);

    const epochAtStart = campaignLaunchEpochRef.current;
    const activeStyle = currentJingle.style;
    const prevUrl = currentJingle.previewUrl;
    const demoAtStart = isDemoModeRef.current;
    const keyAtStart = byokKeyRef.current;
    const brandSnapshot = launchedBrandRef.current;
    const offerSnapshot = launchedOfferRef.current;
    const liveAccessAtStart = hasLiveApiAccess(demoAtStart, keyAtStart);
    const requestedEngine: MusicEngineId = liveAccessAtStart
      ? (currentJingle.engine ?? 'lyria-3-clip-preview')
      : 'local';
    const shouldCallLiveApi = liveAccessAtStart && requestedEngine !== 'local';

    jingleAbortRef.current?.abort();
    const controller = new AbortController();
    jingleAbortRef.current = controller;

    const isStale = () =>
      !isProviderMountedRef.current ||
      jingleGenSeqRef.current !== reqSeq ||
      campaignLaunchEpochRef.current !== epochAtStart ||
      (shouldCallLiveApi &&
        (isDemoModeRef.current !== demoAtStart ||
          byokKeyRef.current !== keyAtStart ||
          !isLoggedInRef.current));

    try {
      let fallbackReason: string | null = null;

      if (shouldCallLiveApi) {
        const prompt = buildLyriaJinglePrompt({
          brand: brandSnapshot,
          offerSentence: offerSnapshot,
          uspAndAudience: launchedUspRef.current,
          style: activeStyle,
          lyrics: currentJingle.lyrics,
        });

        const apiResult = await generateLyriaJingleWithInteractions({
          apiKey: keyAtStart,
          isDemoMode: demoAtStart,
          model: requestedEngine,
          input: prompt,
          signal: controller.signal,
        });

        if (isStale()) {
          return;
        }

        if (apiResult.ok) {
          const meta = await probeLiveAudioMetadata(
            apiResult.blob,
            JINGLE_DURATION_SEC
          );

          if (isStale()) {
            return;
          }

          const previewUrl = URL.createObjectURL(apiResult.blob);
          if (isStale()) {
            safeRevokeBlobUrl(previewUrl);
            return;
          }

          setJingle((prev) => ({
            ...prev,
            generatedStyle: activeStyle,
            generatedEngine: requestedEngine,
            wavBlob: apiResult.blob,
            previewUrl,
            durationSec: meta.durationSec,
            sampleRate: meta.sampleRate,
            audioMimeType: apiResult.mimeType,
            audioExtension: apiResult.fileExtension,
            generationSource: 'lyria-api',
            fallbackReason: null,
            source: 'tab3-generated',
            version: (prev.version ?? 0) + 1,
          }));

          if (prevUrl && prevUrl !== previewUrl && prevUrl.startsWith('blob:')) {
            window.setTimeout(() => {
              safeRevokeBlobUrl(prevUrl);
            }, 1000);
          }
          return;
        }

        fallbackReason = apiResult.reason;
      }

      const result = await generateJingleAudio(activeStyle, JINGLE_DURATION_SEC);

      if (isStale()) {
        safeRevokeBlobUrl(result.previewUrl);
        return;
      }

      setJingle((prev) => ({
        ...prev,
        generatedStyle: activeStyle,
        generatedEngine: 'local',
        wavBlob: result.wavBlob,
        previewUrl: result.previewUrl,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
        audioMimeType: 'audio/wav',
        audioExtension: 'wav',
        generationSource: fallbackReason ? 'local-fallback' : 'local-synth',
        fallbackReason,
        source: 'tab3-generated',
        version: (prev.version ?? 0) + 1,
      }));

      if (prevUrl && prevUrl !== result.previewUrl && prevUrl.startsWith('blob:')) {
        window.setTimeout(() => {
          safeRevokeBlobUrl(prevUrl);
        }, 1000);
      }
    } catch (err) {
      if (isStale()) {
        return;
      }
      const detail = err instanceof Error ? err.message : undefined;
      setJingleError({ code: 'synth_failed', detail });
    } finally {
      if (jingleAbortRef.current === controller) {
        jingleAbortRef.current = null;
      }
      if (jingleGenSeqRef.current === reqSeq) {
        isJingleGeneratingRef.current = false;
        if (isProviderMountedRef.current) {
          setIsGeneratingJingle(false);
        }
      }
    }
  }, []);

  const generateVideo = useCallback(async () => {
    const currentVideo = videoRef.current;
    if (
      isVideoRenderingRef.current ||
      !currentVideo.isStoryboardConfirmed ||
      currentVideo.status === 'rendering'
    ) {
      return;
    }

    const reqSeq = ++videoRenderSeqRef.current;
    isVideoRenderingRef.current = true;
    const epochAtStart = campaignLaunchEpochRef.current;
    const brandSnapshot = launchedBrandRef.current;
    const offerSnapshot = launchedOfferRef.current;
    const brandKeyAtStart = launchedBrandVisualKeyRef.current;
    const photosSnapshot = launchedPhotosRef.current;
    const jingleSnapshot = jingleRef.current;
    const framesSnapshot = currentVideo.storyboardFrames;
    const prevUrl = currentVideo.videoUrl;
    const demoAtStart = isDemoModeRef.current;
    const keyAtStart = byokKeyRef.current;
    const liveAccessAtStart = hasLiveApiAccess(demoAtStart, keyAtStart);
    const requestedEngine: VideoEngineId = liveAccessAtStart
      ? (currentVideo.engine ?? 'gemini-omni-1.2-flash')
      : 'local';
    const shouldCallLiveApi = liveAccessAtStart && requestedEngine !== 'local';

    videoAbortRef.current?.abort();
    const controller = new AbortController();
    videoAbortRef.current = controller;

    const isStale = () =>
      !isProviderMountedRef.current ||
      videoRenderSeqRef.current !== reqSeq ||
      campaignLaunchEpochRef.current !== epochAtStart ||
      launchedBrandVisualKeyRef.current !== brandKeyAtStart ||
      !videoRef.current.isStoryboardConfirmed ||
      (shouldCallLiveApi &&
        (isDemoModeRef.current !== demoAtStart ||
          byokKeyRef.current !== keyAtStart ||
          !isLoggedInRef.current));

    setVideo((prev) => ({
      ...prev,
      status: 'rendering',
      errorMessage: null,
      errorDetail: null,
    }));

    try {
      let fallbackReason: string | null = null;

      if (shouldCallLiveApi) {
        const prompt = buildVideoStoryboardPrompt({
          brand: brandSnapshot,
          offerSentence: offerSnapshot,
          uspAndAudience: launchedUspRef.current,
          jingleStyle: jingleSnapshot.style,
          frames: framesSnapshot,
        });

        const apiResult = await generateVideoWithInteractions({
          apiKey: keyAtStart,
          isDemoMode: demoAtStart,
          model: requestedEngine,
          input: prompt,
          signal: controller.signal,
        });

        if (isStale()) {
          return;
        }

        if (apiResult.ok) {
          const nextUrl = URL.createObjectURL(apiResult.blob);
          if (isStale()) {
            safeRevokeBlobUrl(nextUrl);
            return;
          }

          setVideo((prev) => ({
            ...prev,
            status: 'ready',
            generatedEngine: requestedEngine,
            generationSource:
              requestedEngine === 'gemini-omni-1.2-flash' ? 'omni-api' : 'veo-api',
            fallbackReason: null,
            videoBlob: apiResult.blob,
            videoUrl: nextUrl,
            mimeType: apiResult.mimeType,
            fileExtension: apiResult.fileExtension,
            durationSec: 6.0,
            width: 720,
            height: 1280,
            audioSourceUsed: 'native-ai',
            jingleVersionUsed: null,
            errorMessage: null,
            errorDetail: null,
          }));

          if (prevUrl && prevUrl !== nextUrl && prevUrl.startsWith('blob:')) {
            window.setTimeout(() => {
              safeRevokeBlobUrl(prevUrl);
            }, 1000);
          }
          return;
        }

        fallbackReason = apiResult.reason;
      }

      const { audioBuffer, audioSourceUsed } =
        await resolveVideoAudioBuffer(jingleSnapshot);

      if (isStale()) {
        return;
      }

      const exported = await exportVerticalVideo({
        frames: framesSnapshot,
        photos: photosSnapshot,
        brand: brandSnapshot,
        audioBuffer,
        durationSec: TOTAL_VIDEO_DURATION_SEC,
        offerSentence: offerSnapshot,
        uspAndAudience: launchedUspRef.current,
      });

      if (isStale()) {
        return;
      }

      const nextUrl = URL.createObjectURL(exported.blob);

      if (isStale()) {
        safeRevokeBlobUrl(nextUrl);
        return;
      }

      setVideo((prev) => ({
        ...prev,
        status: 'ready',
        generatedEngine: 'local',
        generationSource: fallbackReason ? 'local-fallback' : 'local-muxer',
        fallbackReason,
        videoBlob: exported.blob,
        videoUrl: nextUrl,
        mimeType: exported.mimeType,
        fileExtension: exported.fileExtension,
        durationSec: exported.durationSec,
        width: exported.width,
        height: exported.height,
        audioSourceUsed,
        jingleVersionUsed:
          audioSourceUsed === 'tab3-jingle' ? (jingleSnapshot.version ?? 0) : null,
        errorMessage: null,
        errorDetail: null,
      }));

      if (prevUrl && prevUrl !== nextUrl && prevUrl.startsWith('blob:')) {
        window.setTimeout(() => {
          safeRevokeBlobUrl(prevUrl);
        }, 1000);
      }
    } catch (err) {
      if (isStale()) {
        return;
      }
      const detail = err instanceof Error ? err.message : '';
      setVideo((prev) => ({
        ...prev,
        status: 'error',
        errorDetail: detail || null,
        errorMessage: detail || 'Render failed',
      }));
    } finally {
      if (videoAbortRef.current === controller) {
        videoAbortRef.current = null;
      }
      if (videoRenderSeqRef.current === reqSeq) {
        isVideoRenderingRef.current = false;
      }
    }
  }, []);

  const value = useMemo<CampaignContextValue>(
    () => ({
      input,
      setInput,
      isLaunched,
      campaignLaunchEpoch,
      launchedBrandId,
      launchedBrand,
      launchedOfferSentence,
      launchedUspAndAudience,
      launchedPhotos,
      launchCampaign,
      variationIndex,
      activeFrameworkId,
      customerPsychology,
      productVisionSummary,
      campaignGenStatus,
      campaignGenSource,
      campaignGenError,
      pollinationsCooldownUntil,
      generatedVariations,
      selectVariation,
      generateNewVariation,
      activeTab,
      setActiveTab,
      selectedAngle,
      setSelectedAngle,
      editedCopyByAngle,
      updateChannelCopy,
      replaceAngleCopy,
      setAngleCopyMap,
      isEnhancingStrategy,
      strategyEnhanceNoticeByAngle,
      strategyEnhanceErrorByAngle,
      enhanceStrategyAngleWithGemini,
      cpaInputs,
      setCpaInputs,
      slides,
      setSlides,
      updateSlide,
      safeZoneMode,
      setSafeZoneMode,
      jingle,
      setJingle,
      isGeneratingJingle,
      jingleError,
      clearJingleError,
      generateJingle,
      video,
      setVideo,
      generateVideo,
    }),
    [
      input,
      setInput,
      isLaunched,
      campaignLaunchEpoch,
      launchedBrandId,
      launchedBrand,
      launchedOfferSentence,
      launchedUspAndAudience,
      launchedPhotos,
      launchCampaign,
      variationIndex,
      activeFrameworkId,
      customerPsychology,
      productVisionSummary,
      campaignGenStatus,
      campaignGenSource,
      campaignGenError,
      pollinationsCooldownUntil,
      generatedVariations,
      selectVariation,
      generateNewVariation,
      activeTab,
      selectedAngle,
      editedCopyByAngle,
      updateChannelCopy,
      replaceAngleCopy,
      setAngleCopyMap,
      isEnhancingStrategy,
      strategyEnhanceNoticeByAngle,
      strategyEnhanceErrorByAngle,
      enhanceStrategyAngleWithGemini,
      cpaInputs,
      slides,
      updateSlide,
      safeZoneMode,
      jingle,
      isGeneratingJingle,
      jingleError,
      clearJingleError,
      generateJingle,
      video,
      generateVideo,
    ]
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return ctx;
}

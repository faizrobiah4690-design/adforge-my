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
  enhanceCopyWithGemini,
  generateCampaignCopyForAngle,
  generateCampaignCopyMap,
  isValidGeminiKeyFormat,
} from '../utils/copyGenerator';
import {
  JINGLE_DURATION_SEC,
  buildJingleLyrics,
  generateJingleAudio,
  resolveVideoAudioBuffer,
} from '../utils/audioExport';
import { TOTAL_VIDEO_DURATION_SEC, exportVerticalVideo } from '../utils/videoExport';
import { rewriteWhatsappUrlPhone } from '../utils/whatsapp';
import type {
  AngleId,
  AspectRatioMode,
  BrandProfile,
  BrandTone,
  CampaignContextValue,
  CampaignInput,
  CarouselSlide,
  ChannelCopy,
  ChannelId,
  CpaInputs,
  EditedCopyByAngle,
  JingleErrorState,
  JingleState,
  PhotoAsset,
  StoryboardFrame,
  StrategyEnhanceNoticeByAngle,
  VideoStudioState,
  WorkspaceTabId,
} from '../types/campaign';

interface LaunchedSnapshot {
  brandId: string;
  offerSentence: string;
  photos: [PhotoAsset, PhotoAsset];
}

function buildBaselineSlides(brand: BrandProfile, offerSentence: string): CarouselSlide[] {
  const shortOffer = offerSentence.trim() || SAMPLE_OFFER_CHIP;
  const isCasual = brand.tone === 'casual';
  return [
    {
      id: 'slide-1',
      index: 0,
      role: 'hook',
      photoIndex: 0,
      badgeText: brand.name,
      headline: isCasual
        ? 'Tawaran Istimewa Untuk Anda'
        : `Pilihan Berkualiti ${brand.name}`,
      subheadline: isCasual
        ? `Produk & servis berkualiti tinggi daripada ${brand.name}.`
        : `Piawaian perkhidmatan teratur & telus di ${brand.name}.`,
      ctaText: 'Slide 1 / 4',
      editedByUser: false,
    },
    {
      id: 'slide-2',
      index: 1,
      role: 'offer',
      photoIndex: 1,
      badgeText: 'TAWARAN KHAS',
      headline: shortOffer.length > 62 ? `${shortOffer.slice(0, 59)}...` : shortOffer,
      subheadline: `Eksklusif di ${brand.name}`,
      ctaText: isCasual ? 'Stok & Slot Terhad' : 'Promosi Rasmi Terhad',
      editedByUser: false,
    },
    {
      id: 'slide-3',
      index: 2,
      role: 'proof',
      photoIndex: 0,
      badgeText: 'KUALITI TERJAMIN',
      headline: isCasual
        ? 'Dipercayai Ramai Pelanggan Malaysia'
        : 'Rekod Kepercayaan Pelanggan Tempatan',
      subheadline: isCasual
        ? 'Layanan mesra, harga telus & respons pantas.'
        : 'Khidmat pelanggan konsisten, telus & profesional.',
      ctaText: 'Dipercayai Ramai',
      editedByUser: false,
    },
    {
      id: 'slide-4',
      index: 3,
      role: 'cta',
      photoIndex: 1,
      badgeText: 'TEMPAH SEKARANG',
      headline: `WhatsApp ${brand.name} Hari Ini`,
      subheadline: `Nombor rasmi: +${brand.whatsappNumber}`,
      ctaText: 'WhatsApp Sekarang',
      editedByUser: false,
    },
  ];
}

function buildBaselineLyrics(brand: BrandProfile, offerSentence: string): string {
  return buildJingleLyrics(brand.name, offerSentence);
}

function buildBaselineJingle(brand: BrandProfile, offerSentence: string): JingleState {
  return {
    style: 'pop-ceria',
    generatedStyle: null,
    lyrics: buildBaselineLyrics(brand, offerSentence),
    lyricsEditedByUser: false,
    durationSec: 5.5,
    sampleRate: 48000,
    wavBlob: null,
    previewUrl: null,
    source: 'fallback-preseeded',
    version: 0,
  };
}

function buildBaselineStoryboard(
  brand: BrandProfile,
  offerSentence: string,
  lyrics: string
): StoryboardFrame[] {
  const lines = lyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const shortOffer = offerSentence.trim() || SAMPLE_OFFER_CHIP;
  const isCasual = brand.tone === 'casual';

  return [
    {
      id: 'frame-1',
      index: 0,
      startSec: 0.0,
      endSec: 1.35,
      photoIndex: 0,
      overlayHeadline: `${brand.name}: Pilihan Tepat`,
      lyricLine: lines[0] ?? `Pilihan tepat bersama ${brand.name},`,
    },
    {
      id: 'frame-2',
      index: 1,
      startSec: 1.35,
      endSec: 2.75,
      photoIndex: 1,
      overlayHeadline: isCasual ? 'Kualiti & Nilai Berbaloi' : 'Piawaian Kualiti Teratur',
      lyricLine: lines[1] ?? 'Kualiti terjamin untuk anda semua,',
    },
    {
      id: 'frame-3',
      index: 2,
      startSec: 2.75,
      endSec: 4.15,
      photoIndex: 0,
      overlayHeadline: shortOffer.length > 48 ? `${shortOffer.slice(0, 45)}...` : shortOffer,
      lyricLine: lines[2] ?? shortOffer,
    },
    {
      id: 'frame-4',
      index: 3,
      startSec: 4.15,
      endSec: 5.5,
      photoIndex: 1,
      overlayHeadline: `WhatsApp +${brand.whatsappNumber}`,
      lyricLine: lines[3] ?? 'Jom WhatsApp sekarang, jangan lepaskan peluang!',
    },
  ];
}

function buildBaselineVideoState(
  brand: BrandProfile,
  offerSentence: string,
  lyrics: string
): VideoStudioState {
  return {
    storyboardFrames: buildBaselineStoryboard(brand, offerSentence, lyrics),
    isStoryboardConfirmed: false,
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
    generatedAt: null,
  }));

  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('strategy');
  const [selectedAngle, setSelectedAngle] = useState<AngleId>('urgency');
  const [editedCopyByAngle, setEditedCopyByAngle] = useState<EditedCopyByAngle>(() =>
    generateCampaignCopyMap(activeBrand, SAMPLE_OFFER_CHIP)
  );
  const [isEnhancingStrategy, setIsEnhancingStrategy] = useState<boolean>(false);
  const [strategyEnhanceNoticeByAngle, setStrategyEnhanceNoticeByAngle] =
    useState<StrategyEnhanceNoticeByAngle>({});
  const [cpaInputs, setCpaInputs] = useState<CpaInputs>(() => ({ ...DEFAULT_CPA_INPUTS }));
  const [slides, setSlides] = useState<CarouselSlide[]>(() =>
    buildBaselineSlides(activeBrand, SAMPLE_OFFER_CHIP)
  );
  const [safeZoneMode, setSafeZoneMode] = useState<AspectRatioMode>('9:16');
  const [jingle, setJingle] = useState<JingleState>(() =>
    buildBaselineJingle(activeBrand, SAMPLE_OFFER_CHIP)
  );
  const [isGeneratingJingle, setIsGeneratingJingle] = useState<boolean>(false);
  const [jingleError, setJingleError] = useState<JingleErrorState>(null);
  const [video, setVideo] = useState<VideoStudioState>(() => {
    const initialLyrics = buildBaselineLyrics(activeBrand, SAMPLE_OFFER_CHIP);
    return buildBaselineVideoState(activeBrand, SAMPLE_OFFER_CHIP, initialLyrics);
  });
  const [campaignLaunchEpoch, setCampaignLaunchEpoch] = useState<number>(0);
  const [launchedSnapshot, setLaunchedSnapshot] = useState<LaunchedSnapshot | null>(null);

  const inputRef = useRef<CampaignInput>(input);
  const launchedSnapshotRef = useRef<LaunchedSnapshot | null>(null);
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
  const videoRenderSeqRef = useRef<number>(0);
  const isVideoRenderingRef = useRef<boolean>(false);
  const strategyEnhanceSeqRef = useRef<number>(0);
  const isEnhancingStrategyRef = useRef<boolean>(false);
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
  const launchedBrandVisualKeyRef = useRef<string>(
    `${activeBrand.id}::${activeBrand.themeColor}::${activeBrand.logoDataUrl}::${activeBrand.name}::${activeBrand.whatsappNumber}`
  );
  const launchedBrandScopeKeyRef = useRef<string>(
    `${activeBrand.id}::${activeBrand.tone}::${activeBrand.name}::${activeBrand.whatsappNumber}::${input.offerSentence}`
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

    if (nameChanged || toneChanged || phoneChanged) {
      setEditedCopyByAngle((prevMap) => {
        const nextMap: EditedCopyByAngle = {};
        for (const angle of ANGLES_LIST) {
          const existing = prevMap[angle];
          if (!existing || (!copyEditedByUserRef.current[angle] && (nameChanged || toneChanged))) {
            nextMap[angle] = generateCampaignCopyForAngle(activeBrand, currentOffer, angle);
          } else if (phoneChanged) {
            nextMap[angle] = syncChannelCopyWhatsapp(existing, activeBrand.whatsappNumber);
          } else {
            nextMap[angle] = existing;
          }
        }
        return nextMap;
      });
    }

    if (nameChanged || toneChanged || phoneChanged) {
      const baselineSlides = buildBaselineSlides(activeBrand, currentOffer);
      setSlides((prevSlides) =>
        prevSlides.map((slide, idx) =>
          slide.editedByUser ? slide : (baselineSlides[idx] ?? slide)
        )
      );

      if (nameChanged || phoneChanged) {
        const nextLyrics = buildBaselineLyrics(activeBrand, currentOffer);
        if (!jingleRef.current.lyricsEditedByUser) {
          setJingle((prevJingle) =>
            prevJingle.lyricsEditedByUser ? prevJingle : { ...prevJingle, lyrics: nextLyrics }
          );
        }
      }
    }

    if (nameChanged || phoneChanged || themeChanged || logoChanged) {
      videoRenderSeqRef.current += 1;
      isVideoRenderingRef.current = false;
      const nextLyrics = buildBaselineLyrics(activeBrand, currentOffer);
      const effectiveLyrics = jingleRef.current.lyricsEditedByUser
        ? jingleRef.current.lyrics
        : nextLyrics;
      const baselineFrames =
        nameChanged || phoneChanged
          ? buildBaselineStoryboard(activeBrand, currentOffer, effectiveLyrics)
          : null;

      setVideo((prevVideo) => {
        const nextFrames = baselineFrames
          ? prevVideo.storyboardFrames.map((frame, idx) =>
              frame.editedByUser ? frame : (baselineFrames[idx] ?? frame)
            )
          : prevVideo.storyboardFrames;
        if (prevVideo.status === 'ready' || prevVideo.status === 'rendering' || prevVideo.status === 'error') {
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
        const framesUpdated =
          baselineFrames !== null &&
          nextFrames.some(
            (frame, idx) =>
              frame.overlayHeadline !== prevVideo.storyboardFrames[idx]?.overlayHeadline ||
              frame.lyricLine !== prevVideo.storyboardFrames[idx]?.lyricLine
          );
        const visualBrandingChanged = nameChanged || themeChanged || logoChanged;
        if (framesUpdated || (prevVideo.isStoryboardConfirmed && visualBrandingChanged)) {
          return {
            ...prevVideo,
            storyboardFrames: nextFrames,
            isStoryboardConfirmed: false,
          };
        }
        return prevVideo;
      });
    }
  }, [activeBrand]);

  useEffect(() => {
    isProviderMountedRef.current = true;
    return () => {
      isProviderMountedRef.current = false;
      jingleGenSeqRef.current += 1;
      isJingleGeneratingRef.current = false;
      videoRenderSeqRef.current += 1;
      isVideoRenderingRef.current = false;
      strategyEnhanceSeqRef.current += 1;
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
  const launchedPhotos = launchedSnapshot ? launchedSnapshot.photos : input.photos;
  const launchedBrandVisualKey = `${launchedBrand.id}::${launchedBrand.themeColor}::${launchedBrand.logoDataUrl}::${launchedBrand.name}::${launchedBrand.whatsappNumber}`;
  const launchedBrandScopeKey = `${launchedBrand.id}::${launchedBrand.tone}::${launchedBrand.name}::${launchedBrand.whatsappNumber}::${launchedOfferSentence}`;
  launchedBrandRef.current = launchedBrand;
  launchedOfferRef.current = launchedOfferSentence;
  launchedBrandVisualKeyRef.current = launchedBrandVisualKey;
  launchedBrandScopeKeyRef.current = launchedBrandScopeKey;
  launchedPhotosRef.current = launchedPhotos;

  useEffect(() => {
    if (prevLaunchedScopeKeyRef.current === launchedBrandScopeKey) {
      return;
    }
    prevLaunchedScopeKeyRef.current = launchedBrandScopeKey;
    strategyEnhanceSeqRef.current += 1;
    isEnhancingStrategyRef.current = false;
    setIsEnhancingStrategy(false);
    setStrategyEnhanceNoticeByAngle({});
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
    strategyEnhanceSeqRef.current += 1;
    isEnhancingStrategyRef.current = false;
    setIsEnhancingStrategy(false);
    setStrategyEnhanceNoticeByAngle({});
  }, [isLoggedIn, byokKey, isDemoMode]);

  const launchCampaign = useCallback(
    (overrideInput?: Partial<CampaignInput>) => {
      jingleGenSeqRef.current += 1;
      isJingleGeneratingRef.current = false;
      setIsGeneratingJingle(false);
      setJingleError(null);
      videoRenderSeqRef.current += 1;
      isVideoRenderingRef.current = false;
      strategyEnhanceSeqRef.current += 1;
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
        generatedAt,
      };
      const resolvedOffer = nextInput.offerSentence;

      if (resolvedBrand.id !== activeBrandId) {
        selectBrand(resolvedBrand.id);
      }

      copyEditedByUserRef.current = {};
      const nextSnapshot: LaunchedSnapshot = {
        brandId: resolvedBrand.id,
        offerSentence: resolvedOffer,
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
      setCampaignLaunchEpoch((prev) => prev + 1);

      const nextJingle = buildBaselineJingle(resolvedBrand, resolvedOffer);
      setEditedCopyByAngle(generateCampaignCopyMap(resolvedBrand, resolvedOffer));
      setSlides(buildBaselineSlides(resolvedBrand, resolvedOffer));
      setJingle(nextJingle);
      setVideo(buildBaselineVideoState(resolvedBrand, resolvedOffer, nextJingle.lyrics));
      setActiveTab('strategy');
    },
    [activeBrand, activeBrandId, brands, getBrandById, selectBrand]
  );

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
          generateCampaignCopyForAngle(targetBrand, targetOffer, angle);
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
        !isValidGeminiKeyFormat(keyAtStart) ||
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

      const epochAtStart = campaignLaunchEpochRef.current;
      const scopeKeyAtStart = launchedBrandScopeKeyRef.current;
      const brandSnapshot = launchedBrandRef.current;
      const offerSnapshot = launchedOfferRef.current;

      const isStale = () =>
        !isProviderMountedRef.current ||
        strategyEnhanceSeqRef.current !== reqSeq ||
        campaignLaunchEpochRef.current !== epochAtStart ||
        launchedBrandScopeKeyRef.current !== scopeKeyAtStart ||
        !isLoggedInRef.current ||
        byokKeyRef.current !== keyAtStart ||
        isDemoModeRef.current !== demoAtStart;

      try {
        const result = await enhanceCopyWithGemini({
          apiKey: keyAtStart,
          isDemoMode: demoAtStart,
          brand: brandSnapshot,
          offerSentence: offerSnapshot,
          angle: targetAngle,
        });

        if (isStale()) {
          return;
        }

        replaceAngleCopy(targetAngle, result.copy);
        setStrategyEnhanceNoticeByAngle((prev) => ({
          ...prev,
          [targetAngle]: result.source,
        }));
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

    const isStale = () =>
      !isProviderMountedRef.current ||
      jingleGenSeqRef.current !== reqSeq ||
      campaignLaunchEpochRef.current !== epochAtStart;

    try {
      const result = await generateJingleAudio(activeStyle, JINGLE_DURATION_SEC);

      if (isStale()) {
        safeRevokeBlobUrl(result.previewUrl);
        return;
      }

      setJingle((prev) => ({
        ...prev,
        generatedStyle: activeStyle,
        wavBlob: result.wavBlob,
        previewUrl: result.previewUrl,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
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
    const brandKeyAtStart = launchedBrandVisualKeyRef.current;
    const photosSnapshot = launchedPhotosRef.current;
    const jingleSnapshot = jingleRef.current;
    const framesSnapshot = currentVideo.storyboardFrames;
    const prevUrl = currentVideo.videoUrl;

    const isStale = () =>
      !isProviderMountedRef.current ||
      videoRenderSeqRef.current !== reqSeq ||
      campaignLaunchEpochRef.current !== epochAtStart ||
      launchedBrandVisualKeyRef.current !== brandKeyAtStart;

    setVideo((prev) => ({
      ...prev,
      status: 'rendering',
      errorMessage: null,
      errorDetail: null,
    }));

    try {
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
      launchedPhotos,
      launchCampaign,
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
      launchedPhotos,
      launchCampaign,
      activeTab,
      selectedAngle,
      editedCopyByAngle,
      updateChannelCopy,
      replaceAngleCopy,
      setAngleCopyMap,
      isEnhancingStrategy,
      strategyEnhanceNoticeByAngle,
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

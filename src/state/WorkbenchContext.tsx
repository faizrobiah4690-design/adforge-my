import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  cloneBrand,
  createSeededBrands,
  SEEDED_BRAND_ID,
  SEEDED_DEMO_BRAND,
} from '../data/seedVault';
import type {
  BrandProfile,
  BrandTone,
  CreateBrandPayload,
  UpdateBrandPatch,
  WorkbenchContextValue,
  WorkbenchScreen,
} from '../types/campaign';
import { isAllowedImageSrc } from '../utils/carouselExport';
import {
  getSafeWhatsappDigits,
  normalizeWhatsappDigits,
  normalizeWhatsappNumber,
} from '../utils/whatsapp';

export { normalizeWhatsappDigits };

export const WORKBENCH_STORAGE_KEY = 'adforge_workbench:v1';

interface PersistedWorkbenchState {
  version: 1;
  isLoggedIn: boolean;
  freelancerEmail: string | null;
  byokKey: string;
  isDemoMode: boolean;
  builtInAiActive: boolean;
  activeScreen: WorkbenchScreen;
  brands: BrandProfile[];
  activeBrandId: string;
}

function isValidTone(value: unknown): value is BrandTone {
  return value === 'casual' || value === 'professional';
}

function isValidBrand(value: unknown): value is BrandProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.trim().length > 0 &&
    typeof obj.name === 'string' &&
    obj.name.trim().length > 0 &&
    typeof obj.logoDataUrl === 'string' &&
    obj.logoDataUrl.trim().length > 0 &&
    typeof obj.themeColor === 'string' &&
    obj.themeColor.trim().length > 0 &&
    isValidTone(obj.tone) &&
    typeof obj.whatsappNumber === 'string' &&
    typeof obj.updatedAt === 'string' &&
    obj.updatedAt.trim().length > 0
  );
}

function createDefaultWorkbenchState(): PersistedWorkbenchState {
  const seeded = createSeededBrands();
  return {
    version: 1,
    isLoggedIn: true,
    freelancerEmail: 'freelancer@adforge.my',
    byokKey: '',
    isDemoMode: false,
    builtInAiActive: true,
    activeScreen: 'workbench',
    brands: seeded,
    activeBrandId: seeded[0].id,
  };
}

function safeReadWorkbenchStorage(): PersistedWorkbenchState {
  const fallback = createDefaultWorkbenchState();
  try {
    if (typeof window === 'undefined') {
      return fallback;
    }
    const storage = window.localStorage;
    if (!storage) {
      return fallback;
    }
    const raw = storage.getItem(WORKBENCH_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.brands)) {
      return fallback;
    }

    const validBrands = record.brands.filter(isValidBrand).map((b) => {
      const cloned = cloneBrand(b);
      return {
        ...cloned,
        logoDataUrl: isAllowedImageSrc(cloned.logoDataUrl)
          ? cloned.logoDataUrl
          : SEEDED_DEMO_BRAND.logoDataUrl,
        themeColor: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cloned.themeColor.trim())
          ? cloned.themeColor.trim()
          : '#0EA5E9',
        whatsappNumber: getSafeWhatsappDigits(
          cloned.whatsappNumber,
          SEEDED_DEMO_BRAND.whatsappNumber
        ),
      };
    });
    const hasSeeded = validBrands.some((b) => b.id === SEEDED_BRAND_ID);
    const brands = hasSeeded
      ? validBrands
      : [cloneBrand(SEEDED_DEMO_BRAND), ...validBrands];

    const rawActiveId = typeof record.activeBrandId === 'string' ? record.activeBrandId : '';
    const activeBrandId = brands.some((b) => b.id === rawActiveId)
      ? rawActiveId
      : brands[0].id;

    const isLoggedIn = record.isLoggedIn === true;
    const byokKey = typeof record.byokKey === 'string' ? record.byokKey.trim() : '';
    const isDemoMode = record.isDemoMode === true;
    const builtInAiActive =
      typeof record.builtInAiActive === 'boolean'
        ? record.builtInAiActive
        : !isDemoMode && byokKey.length === 0;
    const canEnterWorkbench =
      isLoggedIn && (builtInAiActive || byokKey.trim().length > 0 || isDemoMode);
    const activeScreen: WorkbenchScreen =
      canEnterWorkbench && record.activeScreen === 'workbench' ? 'workbench' : 'onboarding';

    return {
      version: 1,
      isLoggedIn,
      freelancerEmail: typeof record.freelancerEmail === 'string' ? record.freelancerEmail : null,
      byokKey,
      isDemoMode,
      builtInAiActive,
      activeScreen,
      brands,
      activeBrandId,
    };
  } catch {
    return fallback;
  }
}

function safeWriteWorkbenchStorage(state: PersistedWorkbenchState): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }
    const storage = window.localStorage;
    if (!storage) {
      return;
    }
    storage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private-browsing storage restrictions
  }
}

function slugifyBrandName(name: string, existingIds: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'brand-folder';

  if (!existingIds.has(base)) {
    return base;
  }
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function applyPatchToBrands(
  brandsList: BrandProfile[],
  brandId: string,
  patch: UpdateBrandPatch,
  timestamp: string
): { nextBrands: BrandProfile[]; changed: boolean } {
  let changed = false;
  const nextBrands = brandsList.map((brand) => {
    if (brand.id !== brandId) {
      return brand;
    }
    changed = true;
    let nextPhone = brand.whatsappNumber;
    if (patch.whatsappNumber !== undefined) {
      const normalized = normalizeWhatsappNumber(patch.whatsappNumber);
      if (normalized.length > 0) {
        nextPhone = normalized;
      }
    }
    const nextName =
      patch.name !== undefined && patch.name.trim().length > 0 ? patch.name : brand.name;
    const nextLogoDataUrl =
      patch.logoDataUrl !== undefined && patch.logoDataUrl.trim().length > 0
        ? patch.logoDataUrl
        : brand.logoDataUrl;
    const nextThemeColor =
      patch.themeColor !== undefined && patch.themeColor.trim().length > 0
        ? patch.themeColor
        : brand.themeColor;

    return {
      ...cloneBrand(brand),
      name: nextName,
      logoDataUrl: nextLogoDataUrl,
      themeColor: nextThemeColor,
      tone: patch.tone !== undefined ? patch.tone : brand.tone,
      whatsappNumber: nextPhone,
      updatedAt: timestamp,
    };
  });

  return { nextBrands, changed };
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedWorkbenchState>(() => safeReadWorkbenchStorage());
  const brandsRef = useRef<BrandProfile[]>(state.brands);

  useEffect(() => {
    brandsRef.current = state.brands;
  }, [state.brands]);

  useEffect(() => {
    safeWriteWorkbenchStorage(state);
  }, [state]);

  const loginWithGoogle = useCallback((email = 'freelancer@studio.my') => {
    const cleanEmail = email.trim() || 'freelancer@studio.my';
    setState((prev) => ({
      ...prev,
      isLoggedIn: true,
      freelancerEmail: cleanEmail,
    }));
  }, []);

  const logout = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoggedIn: false,
      freelancerEmail: null,
      builtInAiActive: false,
      activeScreen: 'onboarding',
    }));
  }, []);

  const saveByokKey = useCallback((key: string, demoMode = false) => {
    const trimmedKey = key.trim();
    setState((prev) => {
      if (demoMode) {
        return {
          ...prev,
          byokKey: trimmedKey,
          isDemoMode: true,
          builtInAiActive: false,
          activeScreen: prev.isLoggedIn ? 'workbench' : 'onboarding',
        };
      }
      if (trimmedKey.length > 0) {
        return {
          ...prev,
          byokKey: trimmedKey,
          isDemoMode: false,
          builtInAiActive: true,
          activeScreen: prev.isLoggedIn ? 'workbench' : 'onboarding',
        };
      }
      return {
        ...prev,
        byokKey: '',
        isDemoMode: false,
        builtInAiActive: false,
        activeScreen: 'onboarding',
      };
    });
  }, []);

  const activateBuiltInAi = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoggedIn: true,
      freelancerEmail: prev.freelancerEmail || 'freelancer@adforge.my',
      byokKey: '',
      isDemoMode: false,
      builtInAiActive: true,
      activeScreen: 'workbench',
    }));
  }, []);

  const setActiveScreen = useCallback((screen: WorkbenchScreen) => {
    setState((prev) => {
      const canEnter =
        prev.isLoggedIn &&
        (prev.builtInAiActive || prev.byokKey.trim().length > 0 || prev.isDemoMode);
      if (screen === 'workbench' && !canEnter) {
        return prev;
      }
      return {
        ...prev,
        activeScreen: screen,
      };
    });
  }, []);

  const selectBrand = useCallback((brandId: string) => {
    setState((prev) => {
      if (!prev.brands.some((b) => b.id === brandId)) {
        return prev;
      }
      return {
        ...prev,
        activeBrandId: brandId,
      };
    });
  }, []);

  const createBrand = useCallback((payload: CreateBrandPayload): BrandProfile => {
    const existingIds = new Set(brandsRef.current.map((b) => b.id));
    const cleanName = payload.name.trim() || 'Klien Baharu';
    const id = slugifyBrandName(cleanName, existingIds);
    const normalizedPhone = getSafeWhatsappDigits(payload.whatsappNumber ?? '60123456789');

    const newBrand: BrandProfile = {
      id,
      name: cleanName,
      logoDataUrl: payload.logoDataUrl || SEEDED_DEMO_BRAND.logoDataUrl,
      themeColor: payload.themeColor || '#0EA5E9',
      tone: payload.tone || 'casual',
      whatsappNumber: normalizedPhone || '60123456789',
      isSeeded: false,
      updatedAt: new Date().toISOString(),
    };

    brandsRef.current = [...brandsRef.current.map(cloneBrand), cloneBrand(newBrand)];

    setState((prev) => {
      const prevIds = new Set(prev.brands.map((b) => b.id));
      const finalId = prevIds.has(newBrand.id)
        ? slugifyBrandName(cleanName, prevIds)
        : newBrand.id;
      const inserted: BrandProfile = { ...cloneBrand(newBrand), id: finalId };
      return {
        ...prev,
        brands: [...prev.brands.map(cloneBrand), inserted],
        activeBrandId: finalId,
      };
    });

    return cloneBrand(newBrand);
  }, []);

  const getBrandById = useCallback((brandId: string): BrandProfile | undefined => {
    const found = brandsRef.current.find((b) => b.id === brandId);
    return found ? cloneBrand(found) : undefined;
  }, []);

  const updateBrand = useCallback((brandId: string, patch: UpdateBrandPatch) => {
    const timestamp = patch.updatedAt ?? new Date().toISOString();
    const { nextBrands: syncBrands, changed: syncChanged } = applyPatchToBrands(
      brandsRef.current,
      brandId,
      patch,
      timestamp
    );
    if (syncChanged) {
      brandsRef.current = syncBrands;
    }

    setState((prev) => {
      const { nextBrands, changed } = applyPatchToBrands(prev.brands, brandId, patch, timestamp);
      if (!changed) {
        return prev;
      }
      return {
        ...prev,
        brands: nextBrands,
      };
    });
  }, []);

  const deleteBrand = useCallback((brandId: string): boolean => {
    const current = brandsRef.current;
    if (current.length <= 1) {
      return false;
    }
    const target = current.find((b) => b.id === brandId);
    if (!target || target.isSeeded) {
      return false;
    }
    const remaining = current.filter((b) => b.id !== brandId).map(cloneBrand);
    if (remaining.length === 0) {
      return false;
    }
    brandsRef.current = remaining;
    setState((prev) => {
      const nextBrands = prev.brands.filter((b) => b.id !== brandId).map(cloneBrand);
      if (nextBrands.length === 0 || nextBrands.length === prev.brands.length) {
        return prev;
      }
      const nextActiveId = nextBrands.some((b) => b.id === prev.activeBrandId)
        ? prev.activeBrandId
        : nextBrands[0].id;
      return {
        ...prev,
        brands: nextBrands,
        activeBrandId: nextActiveId,
      };
    });
    return true;
  }, []);

  const activeBrand = useMemo(() => {
    return (
      state.brands.find((b) => b.id === state.activeBrandId) ??
      state.brands[0] ??
      SEEDED_DEMO_BRAND
    );
  }, [state.brands, state.activeBrandId]);

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      isLoggedIn: state.isLoggedIn,
      freelancerEmail: state.freelancerEmail,
      byokKey: state.byokKey,
      isDemoMode: state.isDemoMode,
      builtInAiActive: state.builtInAiActive,
      activeScreen: state.activeScreen,
      setActiveScreen,
      loginWithGoogle,
      logout,
      saveByokKey,
      activateBuiltInAi,
      brands: state.brands,
      activeBrandId: activeBrand.id,
      activeBrand,
      getBrandById,
      selectBrand,
      createBrand,
      updateBrand,
      deleteBrand,
    }),
    [
      state.isLoggedIn,
      state.freelancerEmail,
      state.byokKey,
      state.isDemoMode,
      state.builtInAiActive,
      state.activeScreen,
      state.brands,
      activeBrand,
      setActiveScreen,
      loginWithGoogle,
      logout,
      saveByokKey,
      activateBuiltInAi,
      getBrandById,
      selectBrand,
      createBrand,
      updateBrand,
      deleteBrand,
    ]
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) {
    throw new Error('useWorkbench must be used within a WorkbenchProvider');
  }
  return ctx;
}

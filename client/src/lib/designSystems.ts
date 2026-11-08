import { useEffect, useState } from 'react';
import type { DesignSystemId, UiStyleId } from '@platform/shared';

// Defined here as a runtime VALUE (not imported from `@platform/shared`, even though the
// type above comes from there) — a client dev-server gotcha found 2026-10: this package is
// resolved through Vite's dependency pre-bundle cache
// (`client/node_modules/.vite/deps/@platform_shared.js`), which an ALREADY-RUNNING dev
// server keeps serving from its own process memory and does not reliably refresh just
// because `shared/dist` was rebuilt or the cache folder was deleted — only an actual
// server restart does. Since this app's dev server must never be restarted out from under
// real users mid-session, any RUNTIME (not type-only) value this client code depends on
// has to live in a file Vite watches directly, not behind that pre-bundled package
// boundary — type-only imports are erased at compile time and are NOT affected, only
// actual exported values are. `UiStyleId`/`UI_STYLE_IDS` (the full 9-value set, including
// the 4 legacy styles) still correctly comes from `@platform/shared` — it's also needed
// server-side for Prisma validation, which has no such caching concern.
export const DESIGN_SYSTEM_IDS = [
  'minimalAcademic',
  'modernSaas',
  'editorialLearning',
  'focusExam',
  'contemporaryCreative',
  'minimalism',
  'flatDesign',
  'glassmorphism',
  'neumorphism',
  'swissDesign',
  'neoBrutalism',
  'materialDesign',
  'cyberpunkNeon',
  'playfulRetro',
  'claymorphism',
] as const satisfies readonly DesignSystemId[];
export type { DesignSystemId };

interface DesignSystemDefinition {
  id: DesignSystemId;
  /** i18n keys under `adminSettings.designSystems.<id>.*` — the gallery card's visible
   * copy (`AdminSettingsPage.tsx`). */
  nameKey: string;
  descriptionKey: string;
  /** 3–4 short highlight phrases, each its own i18n key (`highlights.0`, `.1`, …). */
  highlightKeys: string[];
}

/**
 * The 5 current design systems (2026-10 "5 Design Systems" rebuild — customer request:
 * "xây dựng 5 phong cách giao diện hoàn toàn khác nhau để Admin có thể lựa chọn"). Each
 * is a genuinely different layout/typography/spacing/card language, not a palette swap —
 * see `index.css`'s `[data-ui-style='…']` blocks for the actual tokens, and the
 * theme-aware branches in `components/ui/Card.tsx`/`StatCard.tsx`/`PageHeader.tsx` and
 * `components/TopNav.tsx` for the structural (not just CSS) differences each one needs.
 *
 * Kept deliberately separate from `UI_STYLE_IDS` (`@platform/shared`, the full 9-value
 * enum including the 4 legacy styles this replaces in the picker) — `DESIGN_SYSTEM_IDS`
 * is "what the admin can newly choose today."
 */
export const DESIGN_SYSTEM_DEFINITIONS: DesignSystemDefinition[] = [
  {
    id: 'minimalAcademic',
    nameKey: 'minimalAcademic',
    descriptionKey: 'minimalAcademic',
    highlightKeys: ['whitespace', 'noBorders', 'serifHeadings', 'calmTables'],
  },
  {
    id: 'modernSaas',
    nameKey: 'modernSaas',
    descriptionKey: 'modernSaas',
    highlightKeys: ['sidebarNav', 'refinedShadow', 'dataDense', 'productPolish'],
  },
  {
    id: 'editorialLearning',
    nameKey: 'editorialLearning',
    descriptionKey: 'editorialLearning',
    highlightKeys: ['magazineType', 'warmPalette', 'readableProse', 'minimalChrome'],
  },
  {
    id: 'focusExam',
    nameKey: 'focusExam',
    descriptionKey: 'focusExam',
    highlightKeys: ['zeroDistraction', 'highContrast', 'examOptimized', 'clearProgress'],
  },
  {
    id: 'contemporaryCreative',
    nameKey: 'contemporaryCreative',
    descriptionKey: 'contemporaryCreative',
    highlightKeys: ['boldColor', 'geometricType', 'colorBlocks', 'playfulNotStock'],
  },
  // --- Second batch of 5 (same day, customer request: "5 giao diện hiện tại gần như chỉ
  // khác nhau 1 chút, làm thêm cho tôi 5 giao diện" + 5 named web design styles) ---
  {
    id: 'minimalism',
    nameKey: 'minimalism',
    descriptionKey: 'minimalism',
    highlightKeys: ['notionLike', 'quietGray', 'sansOnly', 'blockContent'],
  },
  {
    id: 'flatDesign',
    nameKey: 'flatDesign',
    descriptionKey: 'flatDesign',
    highlightKeys: ['zeroDepth', 'solidFills', 'boldLabels', 'confidentColor'],
  },
  {
    id: 'glassmorphism',
    nameKey: 'glassmorphism',
    descriptionKey: 'glassmorphism',
    highlightKeys: ['frostedPanels', 'colorMesh', 'softHighlight', 'depthBlur'],
  },
  {
    id: 'neumorphism',
    nameKey: 'neumorphism',
    descriptionKey: 'neumorphism',
    highlightKeys: ['softEmboss', 'sameToneSurface', 'dualShadow', 'tactileFeel'],
  },
  {
    id: 'swissDesign',
    nameKey: 'swissDesign',
    descriptionKey: 'swissDesign',
    highlightKeys: ['gridSystem', 'strongType', 'preciseAlign', 'noDecoration'],
  },
  // --- Third batch of 5 (same day, customer request: "làm thêm 5 giao diện mới, phải
  // khác hoàn toàn 10 giao diện kia" — each a fully different, well-known web design
  // movement, not a variation on any of the 10 above). ---
  {
    id: 'neoBrutalism',
    nameKey: 'neoBrutalism',
    descriptionKey: 'neoBrutalism',
    highlightKeys: ['hardShadow', 'thickOutline', 'rawType', 'zeroRadius'],
  },
  {
    id: 'materialDesign',
    nameKey: 'materialDesign',
    descriptionKey: 'materialDesign',
    highlightKeys: ['tonalSurface', 'layeredElevation', 'pillControls', 'googleFamiliar'],
  },
  {
    id: 'cyberpunkNeon',
    nameKey: 'cyberpunkNeon',
    descriptionKey: 'cyberpunkNeon',
    highlightKeys: ['neonGlow', 'darkTerminal', 'monoHeadings', 'highTechMood'],
  },
  {
    id: 'playfulRetro',
    nameKey: 'playfulRetro',
    descriptionKey: 'playfulRetro',
    highlightKeys: ['cartoonOutline', 'bouncyShapes', 'candyPalette', 'funForLearners'],
  },
  {
    id: 'claymorphism',
    nameKey: 'claymorphism',
    descriptionKey: 'claymorphism',
    highlightKeys: ['puffy3d', 'pastelClay', 'softDualShadow', 'tactileRounded'],
  },
];

const VALID_IDS = new Set<string>(DESIGN_SYSTEM_IDS);

/** True for any of the 5 current design systems — false for the 4 legacy styles
 * (`glass`/`brutalist`/`vivid`/`dark`) a site might still be on. Components that branch
 * their JSX per design system (not just CSS) use this to fall back to their original,
 * unbranched rendering for a legacy style instead of guessing which of the 5 it's
 * "closest to." */
export function isDesignSystemId(id: UiStyleId | null | undefined): id is DesignSystemId {
  return typeof id === 'string' && VALID_IDS.has(id);
}

/** Reads the live `data-ui-style` attribute `applyUiStyle`/preview mode set on `<html>`,
 * and re-renders whenever it changes (an admin applying a new style, or previewing one —
 * see `AdminSettingsPage.tsx`'s `DesignSystemGallery`) — there is no React context for
 * this (settings are fetched once in `main.tsx` and applied straight to the DOM, never
 * stored in React state), so a small `MutationObserver` is the lightest way for a
 * component to stay in sync with it without introducing an app-wide provider. */
export function useActiveUiStyle(): UiStyleId | null {
  const [style, setStyle] = useState<UiStyleId | null>(
    () => (document.documentElement.getAttribute('data-ui-style') as UiStyleId | null) ?? null,
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setStyle((document.documentElement.getAttribute('data-ui-style') as UiStyleId | null) ?? null);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-style'] });
    return () => observer.disconnect();
  }, []);

  return style;
}

/** Convenience wrapper over `useActiveUiStyle` for components that only care "is one of
 * the 5 current design systems active, and if so which" — returns `null` for no style set
 * or a legacy one. */
export function useActiveDesignSystem(): DesignSystemId | null {
  const uiStyle = useActiveUiStyle();
  return isDesignSystemId(uiStyle) ? uiStyle : null;
}

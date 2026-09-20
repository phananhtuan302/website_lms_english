import { useOutletContext } from 'react-router-dom';
import type { AcademicPeriodDTO, ClassDTO } from '@platform/shared';

/**
 * What `ClassWorkspaceLayout` hands to every tab rendered inside its `<Outlet/>` (T-102).
 * The layout loads the class list + semester list ONCE; tabs read them from here instead of
 * refetching (so a semester switch made in the header is instantly visible to every tab).
 */
export interface ClassWorkspaceContext {
  /** The class this workspace is for (never null — the layout renders a "not found" state
   * instead of the tabs when the `:classId` isn't one of the teacher's own). */
  cls: ClassDTO;
  /** Every class the teacher owns (drives the header's quick class-switcher). */
  classes: ClassDTO[];
  /** Every AcademicPeriod (global list); `null` while still loading. */
  periods: AcademicPeriodDTO[] | null;
  /** Non-null when the period list failed to load (already translated, ready to show). */
  periodsError: string | null;
  /** Replace this class with a fresh server copy (e.g. after rename / semester switch) —
   * updates the header and every tab with no extra request. */
  setClass: (updated: ClassDTO) => void;
  /** Refetch the class list from the server (e.g. after something that changes
   * `studentCount`). */
  reload: () => Promise<void>;
}

/** Typed access to the class workspace context; only valid inside the layout's routes. */
export function useClassWorkspace(): ClassWorkspaceContext {
  return useOutletContext<ClassWorkspaceContext>();
}

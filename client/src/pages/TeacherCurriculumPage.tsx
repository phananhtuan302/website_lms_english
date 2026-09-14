import { useEffect, useState, type FormEvent } from 'react';
import type { AcademicPeriodDTO, UnitDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';

/** Renders a UTC-instant ISO string (see `AcademicPeriodDTO`'s doc comment — it
 * represents local midnight in Asia/Ho_Chi_Minh) back as the plain `YYYY-MM-DD` calendar
 * date a teacher authored, in that same fixed timezone — never the browser's local
 * timezone, so this always shows the same date no matter where the browser is. */
function toHcmDateInputValue(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
}

/**
 * Minimal teacher-only curriculum management page (T-018): create/list/edit/delete
 * `Unit`s and `AcademicPeriod`s. Both are global entities shared by every teacher (see
 * `server/prisma/schema.prisma`'s doc comments for why), so there is no per-teacher
 * filtering here — every teacher sees and manages the exact same lists.
 *
 * Deliberately simple per T-018's acceptance criteria ("doesn't need to be fancy — a
 * simple management page is fine"): one form to add a new row, a flat list with inline
 * edit-in-place fields and a delete button. No drag-to-reorder, no pagination.
 */
function TeacherCurriculumPage() {
  const [units, setUnits] = useState<UnitDTO[] | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitOrder, setNewUnitOrder] = useState('');

  const [periods, setPeriods] = useState<AcademicPeriodDTO[] | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');

  function loadUnits() {
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch((err) =>
        setUnitError(err instanceof ApiError ? err.message : 'Failed to load units.'),
      );
  }

  function loadPeriods() {
    teacherApi
      .listAcademicPeriods()
      .then(setPeriods)
      .catch((err) =>
        setPeriodError(err instanceof ApiError ? err.message : 'Failed to load academic periods.'),
      );
  }

  useEffect(loadUnits, []);
  useEffect(loadPeriods, []);

  async function handleCreateUnit(event: FormEvent) {
    event.preventDefault();
    const name = newUnitName.trim();
    const order = Number(newUnitOrder);
    if (!name || !Number.isInteger(order)) {
      setUnitError('Unit name and a whole-number order are required.');
      return;
    }
    try {
      await teacherApi.createUnit({ name, order });
      setNewUnitName('');
      setNewUnitOrder('');
      setUnitError(null);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : 'Failed to create unit.');
    }
  }

  async function handleUpdateUnit(unit: UnitDTO, name: string, order: number) {
    try {
      await teacherApi.updateUnit(unit.id, { name, order });
      setUnitError(null);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : 'Failed to save unit.');
    }
  }

  async function handleDeleteUnit(unitId: string) {
    try {
      await teacherApi.deleteUnit(unitId);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : 'Failed to delete unit.');
    }
  }

  async function handleCreatePeriod(event: FormEvent) {
    event.preventDefault();
    const name = newPeriodName.trim();
    if (!name || !newPeriodStart || !newPeriodEnd) {
      setPeriodError('Name, start date, and end date are all required.');
      return;
    }
    try {
      await teacherApi.createAcademicPeriod({
        name,
        startDate: newPeriodStart,
        endDate: newPeriodEnd,
      });
      setNewPeriodName('');
      setNewPeriodStart('');
      setNewPeriodEnd('');
      setPeriodError(null);
      loadPeriods();
    } catch (err) {
      setPeriodError(err instanceof ApiError ? err.message : 'Failed to create academic period.');
    }
  }

  async function handleUpdatePeriod(
    period: AcademicPeriodDTO,
    name: string,
    startDate: string,
    endDate: string,
  ) {
    try {
      await teacherApi.updateAcademicPeriod(period.id, { name, startDate, endDate });
      setPeriodError(null);
      loadPeriods();
    } catch (err) {
      setPeriodError(err instanceof ApiError ? err.message : 'Failed to save academic period.');
    }
  }

  async function handleDeletePeriod(periodId: string) {
    try {
      await teacherApi.deleteAcademicPeriod(periodId);
      loadPeriods();
    } catch (err) {
      setPeriodError(err instanceof ApiError ? err.message : 'Failed to delete academic period.');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">Curriculum</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Units and academic periods (semesters) are shared across every teacher account. Tag a test
          with a Unit from its editor page.
        </p>
      </div>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">Units</h2>
        {unitError && <p className="mt-2 text-sm text-red-700">{unitError}</p>}

        <form onSubmit={handleCreateUnit} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Name
            <input
              type="text"
              value={newUnitName}
              onChange={(event) => setNewUnitName(event.target.value)}
              placeholder="e.g. Unit 3 — Food & Drink"
              className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Order
            <input
              type="number"
              value={newUnitOrder}
              onChange={(event) => setNewUnitOrder(event.target.value)}
              placeholder="1"
              className="w-24 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            Add unit
          </button>
        </form>

        <ul className="mt-4 flex flex-col gap-2">
          {units === null && <p className="text-sm text-base-black/60">Loading...</p>}
          {units?.length === 0 && <p className="text-sm text-base-black/60">No units yet.</p>}
          {units?.map((unit) => (
            <UnitRow
              key={unit.id}
              unit={unit}
              onSave={handleUpdateUnit}
              onDelete={() => handleDeleteUnit(unit.id)}
            />
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">Academic periods (semesters)</h2>
        <p className="mt-1 text-xs text-base-black/50">
          Dates are treated as calendar days in the fixed Asia/Ho_Chi_Minh timezone.
        </p>
        {periodError && <p className="mt-2 text-sm text-red-700">{periodError}</p>}

        <form onSubmit={handleCreatePeriod} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Name
            <input
              type="text"
              value={newPeriodName}
              onChange={(event) => setNewPeriodName(event.target.value)}
              placeholder="e.g. Semester 1 2026"
              className="w-56 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            Start date
            <input
              type="date"
              value={newPeriodStart}
              onChange={(event) => setNewPeriodStart(event.target.value)}
              className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            End date
            <input
              type="date"
              value={newPeriodEnd}
              onChange={(event) => setNewPeriodEnd(event.target.value)}
              className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            Add period
          </button>
        </form>

        <ul className="mt-4 flex flex-col gap-2">
          {periods === null && <p className="text-sm text-base-black/60">Loading...</p>}
          {periods?.length === 0 && (
            <p className="text-sm text-base-black/60">No academic periods yet.</p>
          )}
          {periods?.map((period) => (
            <PeriodRow
              key={period.id}
              period={period}
              onSave={handleUpdatePeriod}
              onDelete={() => handleDeletePeriod(period.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function UnitRow({
  unit,
  onSave,
  onDelete,
}: {
  unit: UnitDTO;
  onSave: (unit: UnitDTO, name: string, order: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(unit.name);
  const [order, setOrder] = useState(String(unit.order));

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-primary-100 px-3 py-2">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const parsedOrder = Number(order);
          if (
            name.trim() &&
            Number.isInteger(parsedOrder) &&
            (name !== unit.name || parsedOrder !== unit.order)
          ) {
            onSave(unit, name.trim(), parsedOrder);
          }
        }}
        className="flex-1 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <input
        type="number"
        value={order}
        onChange={(event) => setOrder(event.target.value)}
        onBlur={() => {
          const parsedOrder = Number(order);
          if (
            name.trim() &&
            Number.isInteger(parsedOrder) &&
            (name !== unit.name || parsedOrder !== unit.order)
          ) {
            onSave(unit, name.trim(), parsedOrder);
          }
        }}
        className="w-20 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </li>
  );
}

function PeriodRow({
  period,
  onSave,
  onDelete,
}: {
  period: AcademicPeriodDTO;
  onSave: (period: AcademicPeriodDTO, name: string, startDate: string, endDate: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(period.name);
  const [startDate, setStartDate] = useState(toHcmDateInputValue(period.startDate));
  const [endDate, setEndDate] = useState(toHcmDateInputValue(period.endDate));

  function maybeSave() {
    const originalStart = toHcmDateInputValue(period.startDate);
    const originalEnd = toHcmDateInputValue(period.endDate);
    if (
      name.trim() &&
      startDate &&
      endDate &&
      (name !== period.name || startDate !== originalStart || endDate !== originalEnd)
    ) {
      onSave(period, name.trim(), startDate, endDate);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-primary-100 px-3 py-2">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={maybeSave}
        className="flex-1 rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <input
        type="date"
        value={startDate}
        onChange={(event) => setStartDate(event.target.value)}
        onBlur={maybeSave}
        className="rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <input
        type="date"
        value={endDate}
        onChange={(event) => setEndDate(event.target.value)}
        onBlur={maybeSave}
        className="rounded-md border border-primary-200 px-2 py-1 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </li>
  );
}

export default TeacherCurriculumPage;

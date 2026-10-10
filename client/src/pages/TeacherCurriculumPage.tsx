import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AcademicPeriodDTO, UnitDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';

/** Renders a UTC-instant ISO string (see `AcademicPeriodDTO`'s doc comment — it
 * represents local midnight in Asia/Ho_Chi_Minh) back as the plain `YYYY-MM-DD` calendar
 * date a teacher authored, in that same fixed timezone — never the browser's local
 * timezone, so this always shows the same date no matter where the browser is. */
function toHcmDateInputValue(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
}

/**
 * Trang quản lý Chương trình học (Curriculum) - Thiết kế lại giao diện hiện đại &
 * Tính năng kéo thả sắp xếp (Drag and Drop):
 * - Cho phép cầm kéo thả để thay đổi vị trí các Unit
 * - Khi kéo thả, thẻ mới thế chỗ thẻ cũ và tự động tính lại thứ tự (order 1, 2, 3...)
 * - Tự động đồng bộ và lưu thứ tự mới lên server
 * - Thiết kế giao diện card bo tròn 2xl, phối màu hài hòa và trực quan
 */
function TeacherCurriculumPage() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<UnitDTO[] | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitOrder, setNewUnitOrder] = useState('');
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Drag and drop states (Hiệu ứng kéo thả phong cách iPhone / iOS)
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  // dropIndex: vị trí (0 .. units.length) mà thẻ sẽ rơi vào giữa các thẻ khác
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState(false);

  const [periods, setPeriods] = useState<AcademicPeriodDTO[] | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [isAddingPeriod, setIsAddingPeriod] = useState(false);

  function loadUnits() {
    teacherApi
      .listUnits()
      .then((data) => {
        // Luôn sắp xếp theo order tăng dần
        const sorted = [...data].sort((a, b) => a.order - b.order);
        setUnits(sorted);
        // Tự động gợi ý order tiếp theo
        const nextOrder = sorted.length > 0 ? Math.max(...sorted.map((u) => u.order)) + 1 : 1;
        setNewUnitOrder(String(nextOrder));
      })
      .catch((err) =>
        setUnitError(err instanceof ApiError ? err.message : t('teacherCurriculum.units.loadFailed')),
      );
  }

  function loadPeriods() {
    teacherApi
      .listAcademicPeriods()
      .then(setPeriods)
      .catch((err) =>
        setPeriodError(
          err instanceof ApiError ? err.message : t('teacherCurriculum.periods.loadFailed'),
        ),
      );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadUnits, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadPeriods, []);

  async function handleCreateUnit(event: FormEvent) {
    event.preventDefault();
    const name = newUnitName.trim();
    const order = Number(newUnitOrder);
    if (!name || !Number.isInteger(order)) {
      setUnitError(t('teacherCurriculum.units.validationError'));
      return;
    }
    setIsAddingUnit(true);
    try {
      await teacherApi.createUnit({ name, order });
      setNewUnitName('');
      setUnitError(null);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : t('teacherCurriculum.units.createFailed'));
    } finally {
      setIsAddingUnit(false);
    }
  }

  async function handleUpdateUnit(unit: UnitDTO, name: string, order: number) {
    try {
      await teacherApi.updateUnit(unit.id, { name, order });
      setUnitError(null);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : t('teacherCurriculum.units.saveFailed'));
    }
  }

  async function handleDeleteUnit(unitId: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa Unit này không?')) return;
    try {
      await teacherApi.deleteUnit(unitId);
      loadUnits();
    } catch (err) {
      setUnitError(err instanceof ApiError ? err.message : t('teacherCurriculum.units.deleteFailed'));
    }
  }

  // === XỬ LÝ KÉO THẢ (DRAG & DROP) PHONG CÁCH IPHONE ===
  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string, index: number) {
    setDraggedUnitId(id);
    setDropIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);

    // Kỹ thuật delay 1 frame: Để browser kịp chụp ghost image hiển thị dưới con trỏ chuột,
    // sau đó mới ẩn thẻ gốc đi (opacity: 0) giống iPhone
    requestAnimationFrame(() => {
      setIsDraggingActive(true);
    });
  }

  function handleContainerDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleItemDragOver(e: React.DragEvent<HTMLDivElement>, targetIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Xác định chuột đang ở nửa trên hay nửa dưới của item để tính vị trí chèn giữa 2 thẻ
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isAfter = e.clientY > midY;
    const newIndex = isAfter ? targetIndex + 1 : targetIndex;

    if (dropIndex !== newIndex) {
      setDropIndex(newIndex);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!draggedUnitId || dropIndex === null || !units) {
      handleDragEnd();
      return;
    }

    const currentList = [...units];
    const sourceIndex = currentList.findIndex((u) => u.id === draggedUnitId);

    if (sourceIndex === -1) {
      handleDragEnd();
      return;
    }

    // Lấy thẻ được kéo ra
    const [movedUnit] = currentList.splice(sourceIndex, 1);

    // Tính toán lại vị trí đích sau khi đã cắt thẻ gốc khỏi mảng
    let targetInsertIndex = dropIndex;
    if (sourceIndex < dropIndex) {
      targetInsertIndex = dropIndex - 1;
    }

    // Chèn vào vị trí đích
    currentList.splice(targetInsertIndex, 0, movedUnit);

    // Tính lại thứ tự từ 1 đến N
    const reorderedList = currentList.map((unit, index) => ({
      ...unit,
      order: index + 1,
    }));

    setUnits(reorderedList);
    handleDragEnd();

    // Đồng bộ lên server
    setIsSavingOrder(true);
    setUnitError(null);
    try {
      const changedUnits = reorderedList.filter((unit) => {
        const original = units.find((u) => u.id === unit.id);
        return original && original.order !== unit.order;
      });

      await Promise.all(
        changedUnits.map((unit) => teacherApi.updateUnit(unit.id, { name: unit.name, order: unit.order })),
      );
    } catch (err) {
      console.warn('[units] update order failed:', err);
      setUnitError('Không thể lưu thứ tự mới lên hệ thống.');
      loadUnits();
    } finally {
      setIsSavingOrder(false);
    }
  }

  function handleDragEnd() {
    setDraggedUnitId(null);
    setDropIndex(null);
    setIsDraggingActive(false);
  }

  async function handleCreatePeriod(event: FormEvent) {
    event.preventDefault();
    const name = newPeriodName.trim();
    if (!name || !newPeriodStart || !newPeriodEnd) {
      setPeriodError(t('teacherCurriculum.periods.validationError'));
      return;
    }
    setIsAddingPeriod(true);
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
      setPeriodError(
        err instanceof ApiError ? err.message : t('teacherCurriculum.periods.createFailed'),
      );
    } finally {
      setIsAddingPeriod(false);
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
      setPeriodError(
        err instanceof ApiError ? err.message : t('teacherCurriculum.periods.saveFailed'),
      );
    }
  }

  async function handleDeletePeriod(periodId: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa học kỳ này không?')) return;
    try {
      await teacherApi.deleteAcademicPeriod(periodId);
      loadPeriods();
    } catch (err) {
      setPeriodError(
        err instanceof ApiError ? err.message : t('teacherCurriculum.periods.deleteFailed'),
      );
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Header Toolbar & Breadcrumb */}
      <div>
        <LibraryBreadcrumb section="curriculum" />
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('teacherCurriculum.heading')}</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">{t('teacherCurriculum.description')}</p>
          </div>
        </div>
      </div>

      {/* 2. Phần Quản Lý Danh Sách Unit (Kèm tính năng Kéo Thả Sắp Xếp) */}
      <section className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xs transition sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black tracking-tight text-slate-900">{t('teacherCurriculum.units.heading')}</h2>
            {units && (
              <span className="rounded-full border border-blue-200/60 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {units.length} Unit
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSavingOrder && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 animate-pulse">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                Đang lưu thứ tự mới...
              </span>
            )}
            <span className="text-xs font-medium text-slate-400">
              * Giữ biểu tượng <span className="font-bold text-slate-600">⋮⋮</span> để kéo thả đổi vị trí
            </span>
          </div>
        </div>

        {unitError && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {unitError}
          </div>
        )}

        {/* Form Thêm Unit Mới */}
        <form onSubmit={handleCreateUnit} className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              {t('teacherCurriculum.units.nameLabel')}
            </label>
            <input
              type="text"
              value={newUnitName}
              onChange={(event) => setNewUnitName(event.target.value)}
              placeholder={t('teacherCurriculum.units.namePlaceholder')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div className="w-full sm:w-28">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              {t('teacherCurriculum.units.orderLabel')}
            </label>
            <input
              type="number"
              value={newUnitOrder}
              onChange={(event) => setNewUnitOrder(event.target.value)}
              placeholder="1"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 text-center shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={isAddingUnit || !newUnitName.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-primary-700 disabled:opacity-50"
          >
            {isAddingUnit ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
            <span>{t('teacherCurriculum.units.addButton')}</span>
          </button>
        </form>

        {/* Danh Sách Unit Kéo Thả (Hỗ trợ hiệu ứng tách khoảng trống iPhone) */}
        <div
          onDragOver={handleContainerDragOver}
          onDrop={handleDrop}
          className="mt-5 flex flex-col gap-2.5 transition-all duration-300"
        >
          {units === null && (
            <div className="flex items-center gap-2 py-8 text-sm font-medium text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              <span>{t('common.loading')}</span>
            </div>
          )}

          {units?.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs font-medium text-slate-400">
              {t('teacherCurriculum.units.empty')}
            </p>
          )}

          {units?.map((unit, index) => {
            const isDragged = draggedUnitId === unit.id;
            // Xác định xem khoảng trống (placeholder) có mở ra trước thẻ này không
            const showGapBefore =
              isDraggingActive &&
              dropIndex === index &&
              draggedUnitId !== unit.id &&
              (draggedUnitId !== null && units.findIndex((u) => u.id === draggedUnitId) !== index - 1);

            return (
              <div key={unit.id} className="flex flex-col">
                {/* Khoảng trống tách ra vừa khít kích thước thẻ khi kéo đến giữa 2 thẻ */}
                {showGapBefore && (
                  <div className="my-1.5 h-[62px] w-full rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 shadow-inner transition-all duration-200 animate-pulse flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">Thả vào vị trí này</span>
                  </div>
                )}

                <UnitDraggableRow
                  unit={unit}
                  index={index}
                  isDragging={isDragged && isDraggingActive}
                  onDragStart={(e) => handleDragStart(e, unit.id, index)}
                  onDragOver={(e) => handleItemDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onSave={handleUpdateUnit}
                  onDelete={() => handleDeleteUnit(unit.id)}
                />
              </div>
            );
          })}

          {/* Khoảng trống mở ra ở cuối danh sách nếu kéo xuống vị trí cuối cùng */}
          {isDraggingActive &&
            dropIndex === units?.length &&
            draggedUnitId !== null &&
            units.findIndex((u) => u.id === draggedUnitId) !== units.length - 1 && (
              <div className="my-1.5 h-[62px] w-full rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 shadow-inner transition-all duration-200 animate-pulse flex items-center justify-center">
                <span className="text-xs font-bold text-blue-600">Thả vào vị trí cuối</span>
              </div>
            )}
        </div>
      </section>

      {/* 3. Phần Quản Lý Học Kỳ (Academic Periods) */}
      <section className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xs transition sm:p-6">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900">{t('teacherCurriculum.periods.heading')}</h2>
          <p className="mt-1 text-xs font-medium text-slate-400">{t('teacherCurriculum.periods.timezoneNote')}</p>
        </div>

        {periodError && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {periodError}
          </div>
        )}

        {/* Form Thêm Học Kỳ */}
        <form onSubmit={handleCreatePeriod} className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              {t('teacherCurriculum.periods.nameLabel')}
            </label>
            <input
              type="text"
              value={newPeriodName}
              onChange={(event) => setNewPeriodName(event.target.value)}
              placeholder={t('teacherCurriculum.periods.namePlaceholder')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              {t('teacherCurriculum.periods.startDateLabel')}
            </label>
            <input
              type="date"
              value={newPeriodStart}
              onChange={(event) => setNewPeriodStart(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-2xs focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              {t('teacherCurriculum.periods.endDateLabel')}
            </label>
            <input
              type="date"
              value={newPeriodEnd}
              onChange={(event) => setNewPeriodEnd(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-2xs focus:border-primary-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isAddingPeriod || !newPeriodName.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-primary-700 disabled:opacity-50"
          >
            {isAddingPeriod ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
            <span>{t('teacherCurriculum.periods.addButton')}</span>
          </button>
        </form>

        {/* Danh Sách Học Kỳ */}
        <div className="mt-5 flex flex-col gap-2.5">
          {periods === null && (
            <div className="flex items-center gap-2 py-8 text-sm font-medium text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              <span>{t('common.loading')}</span>
            </div>
          )}

          {periods?.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs font-medium text-slate-400">
              {t('teacherCurriculum.periods.empty')}
            </p>
          )}

          {periods?.map((period) => (
            <PeriodRow
              key={period.id}
              period={period}
              onSave={handleUpdatePeriod}
              onDelete={() => handleDeletePeriod(period.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Component Hàng Unit có hỗ trợ Kéo Thả (Drag & Drop) phong cách iPhone */
function UnitDraggableRow({
  unit,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onSave,
  onDelete,
}: {
  unit: UnitDTO;
  index: number;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onSave: (unit: UnitDTO, name: string, order: number) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(unit.name);
  const [order, setOrder] = useState(String(unit.order));

  // Cập nhật khi props unit thay đổi (do kéo thả sắp xếp lại thứ tự)
  useEffect(() => {
    setName(unit.name);
    setOrder(String(unit.order));
  }, [unit.name, unit.order]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      style={{
        // Khi đang giữ kéo: ẩn thẻ gốc đi (opacity 0 hoặc giữ chiều cao tàng hình) giống hệt hành vi iPhone
        opacity: isDragging ? 0 : 1,
        pointerEvents: isDragging ? 'none' : 'auto',
      }}
      className="group relative flex items-center gap-3 rounded-xl border-2 border-slate-200/90 bg-white p-3 transition-all duration-200 hover:border-slate-300 hover:shadow-xs"
    >
      {/* Nút cầm kéo thả (Drag Handle) */}
      <div
        className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 transition"
        title="Kéo thả để sắp xếp lại thứ tự"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-12a2 2 0 10.001 4.001A2 2 0 0013 2zm0 6a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </div>

      {/* Tên Unit */}
      <div className="flex-1 min-w-0">
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
          className="w-full rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:border-slate-200 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {/* Thứ tự (Order badge & input) */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase text-slate-400">Thứ tự:</span>
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
          className="w-14 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-center text-xs font-bold text-slate-800 shadow-2xs focus:border-primary-500 focus:bg-white focus:outline-none"
        />
      </div>

      {/* Nút Xóa */}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        <svg className="h-3.5 w-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>{t('teacherCurriculum.units.deleteButton')}</span>
      </button>
    </div>
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
  const { t } = useTranslation();
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
    <div className="flex flex-col gap-2.5 rounded-xl border-2 border-slate-200/90 bg-white p-3 shadow-2xs sm:flex-row sm:items-center">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={maybeSave}
        className="flex-1 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:border-slate-200 hover:bg-slate-50 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          onBlur={maybeSave}
          className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs focus:border-primary-500 focus:bg-white focus:outline-none"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          onBlur={maybeSave}
          className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs focus:border-primary-500 focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          <svg className="h-3.5 w-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>{t('teacherCurriculum.periods.deleteButton')}</span>
        </button>
      </div>
    </div>
  );
}

export default TeacherCurriculumPage;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Focus,
  Home,
  Maximize2,
  Map,
  Move,
  RotateCw,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import styles from './Warehouse3DPlanner.module.css';
import { warehouseVisualLayoutApi } from '../api/warehouseVisualLayoutApi';
import {
  arrangeVisualPlan,
  moveVisualEntity,
  validVisualPlan,
  visualPlanKey,
} from '../utils/visualLayout';
import { createWarehouseScene } from '../utils/warehouseScene';
import {
  defaultWarehouseViewFilters,
  filterWarehouseEntities,
  visualEntityKey,
  warehouseViewFilterSchema,
} from '../utils/warehouseView';

import type { Bin, Zone } from '../api/warehouseLayoutApi';
import type {
  VisualEntity,
  VisualLayout,
  VisualPlan,
} from '../schemas/warehouseVisualLayoutSchema';
import type { Warehouse } from '../types/warehouse';

const floorSchema = z.object({
  width: z.number().int().min(16).max(256),
  depth: z.number().int().min(16).max(256),
});
const positionSchema = z.object({
  x: z.number().int().min(0).max(255),
  z: z.number().int().min(0).max(255),
  width: z.number().int().min(3).max(128),
  depth: z.number().int().min(3).max(128),
});
type Scene = ReturnType<typeof createWarehouseScene>;
type Snapshot = { zones: Zone[]; bins: Bin[]; saved: VisualLayout; plan: VisualPlan };

export default function Warehouse3DPlanner({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const t = useTranslations('Warehouse3D');
  const locale = useLocale();
  const principal = useAuthStore((state) => state.user);
  const { can } = useAccess();
  const scope = JSON.stringify([
    principal?.userId,
    principal?.actorScope,
    principal?.tenantId,
    principal?.roles,
    principal?.warehouseIds,
    warehouse.id,
  ]);
  const canEdit =
    can('warehouses.layout.manage') &&
    principal?.warehouseIds?.includes(warehouse.id) === true &&
    warehouse.status === 'ACTIVE';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [selected, setSelected] = useState<VisualEntity | null>(null);
  const [editing, setEditing] = useState(false);
  const [topView, setTopView] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'reload' | null>(null);
  const [past, setPast] = useState<VisualPlan[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const request = useRef<AbortController | null>(null);
  const latest = useRef({ plan, snapshot, editing, canEdit, saving });
  latest.current = { plan, snapshot, editing, canEdit, saving };
  const dirty =
    !!plan &&
    !!snapshot &&
    (snapshot.saved.plan === null || visualPlanKey(plan) !== visualPlanKey(snapshot.saved.plan));
  const hasEdits = !!plan && !!snapshot && visualPlanKey(plan) !== visualPlanKey(snapshot.plan);
  const {
    register,
    watch,
    reset: resetFilters,
  } = useForm({
    resolver: zodResolver(warehouseViewFilterSchema),
    defaultValues: defaultWarehouseViewFilters,
  });
  const [search, zoneId, zoneType, status, placed] = watch([
    'search',
    'zoneId',
    'zoneType',
    'status',
    'placement',
  ]);
  const matches = useMemo(() => {
    const entities =
      snapshot && plan
        ? filterWarehouseEntities(
            snapshot.zones,
            snapshot.bins,
            plan,
            { search, zoneId, zoneType, status, placement: placed },
            locale,
          )
        : [];
    return new Set(entities.map(visualEntityKey));
  }, [snapshot, plan, search, zoneId, zoneType, status, placed, locale]);
  const floorSize = useForm({
    resolver: zodResolver(floorSchema),
    defaultValues: { width: 32, depth: 32 },
  });
  const position = useForm({
    resolver: zodResolver(positionSchema),
    defaultValues: { x: 0, z: 0, width: 8, depth: 6 },
  });
  const zone = snapshot?.zones.find((item) => selected?.kind === 'zone' && item.id === selected.id);
  const bin = snapshot?.bins.find((item) => selected?.kind === 'bin' && item.id === selected.id);
  const placement =
    selected?.kind === 'zone'
      ? plan?.zones.find((item) => item.zoneId === selected.id)
      : plan?.bins.find((item) => item.binId === selected?.id);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setUnavailable(false);
    setSaving(false);
    setSnapshot(null);
    setPlan(null);
    setSelected(null);
    setPast([]);
    setEditing(false);
    setTopView(false);
    resetFilters(defaultWarehouseViewFilters);
    setError('');
    setNotice('');
    setLoading(true);
    void Promise.all([
      warehouseVisualLayoutApi.catalog(warehouse.id, controller.signal),
      warehouseVisualLayoutApi.read(warehouse.id, controller.signal),
    ])
      .then(([catalog, saved]) => {
        if (controller.signal.aborted) return;
        const next = saved.plan ?? arrangeVisualPlan(catalog.zones, catalog.bins);
        if (!validVisualPlan(next, catalog.zones, catalog.bins)) {
          throw new Error('VISUAL_LAYOUT_INVALID');
        }
        setSnapshot({ ...catalog, saved, plan: next });
        setPlan(next);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error && failure.message === 'VISUAL_LAYOUT_LIMIT'
              ? t('limit')
              : failure instanceof ApiError
                ? failure.message
                : t('loadError'),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [warehouse.id, scope, attempt, t, resetFilters]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasEdits) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasEdits]);

  const apply = useCallback(
    (next: VisualPlan) => {
      const current = latest.current;
      if (
        !current.plan ||
        !current.snapshot ||
        !current.editing ||
        !current.canEdit ||
        current.saving
      ) {
        return;
      }
      if (!validVisualPlan(next, current.snapshot.zones, current.snapshot.bins)) {
        setNotice(t('invalidPosition'));
        return;
      }
      setPast((items) => [...items.slice(-19), current.plan as VisualPlan]);
      setPlan(next);
      setNotice('');
    },
    [t],
  );
  const move = useCallback(
    (entity: VisualEntity, x: number, z: number) => {
      const current = latest.current;
      if (!current.plan || !current.snapshot) return;
      const next = moveVisualEntity(
        current.plan,
        entity,
        x,
        z,
        current.snapshot.zones,
        current.snapshot.bins,
      );
      if (next) {
        setSelected(entity);
        apply(next);
      } else setNotice(t('invalidPosition'));
    },
    [apply, t],
  );
  const callbacks = useRef({ select: setSelected, move, unavailable: () => setUnavailable(true) });
  callbacks.current = { select: setSelected, move, unavailable: () => setUnavailable(true) };
  useEffect(() => {
    if (!host.current || !snapshot || unavailable) return;
    try {
      const value = createWarehouseScene(
        host.current,
        t('canvasLabel'),
        {
          select: (entity) => callbacks.current.select(entity),
          move: (entity, x, z) => callbacks.current.move(entity, x, z),
          unavailable: () => callbacks.current.unavailable(),
        },
        styles.selectionChip,
      );
      scene.current = value;
      value.update({ ...snapshot, plan: snapshot.plan, selected: null, editing: false });
      value.home(latest.current.editing);
      return () => {
        scene.current = null;
        value.dispose();
      };
    } catch {
      setUnavailable(true);
    }
  }, [snapshot, unavailable, t]);
  const selectionLabel =
    zone || bin
      ? `${zone?.code ?? bin?.code} · ${t((zone ?? bin)?.isActive ? 'active' : 'inactive')}`
      : '';
  useEffect(() => {
    if (snapshot && plan) {
      scene.current?.update({
        ...snapshot,
        plan,
        selected,
        editing: editing && !saving,
        matches,
        selectionLabel,
      });
    }
  }, [snapshot, plan, selected, editing, saving, matches, selectionLabel]);
  useEffect(() => {
    scene.current?.setTopView(editing || topView);
  }, [editing, topView, snapshot]);
  const { reset: resetFloorSize } = floorSize;
  const floorWidth = plan?.width,
    floorDepth = plan?.depth;
  useEffect(() => {
    if (floorWidth && floorDepth) resetFloorSize({ width: floorWidth, depth: floorDepth });
  }, [floorWidth, floorDepth, resetFloorSize]);
  const { reset } = position;
  useEffect(() => {
    if (placement) {
      reset({
        x: placement.x,
        z: placement.z,
        width: 'width' in placement ? placement.width : 8,
        depth: 'depth' in placement ? placement.depth : 6,
      });
    }
  }, [placement, reset]);

  // The map also exposes every entity through native controls and numeric editing.
  // Trap focus in the existing modal, including its header close button.
  useEffect(() => {
    const dialog = stage.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first && last) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last && first) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => dialog.removeEventListener('keydown', trap);
  }, [loading]);

  const reload = () => {
    setConfirm(null);
    setAttempt((value) => value + 1);
  };
  const close = () => {
    if (saving) return;
    if (hasEdits && canEdit) setConfirm('close');
    else onClose();
  };
  const save = async () => {
    if (!plan || !snapshot || !canEdit || saving || !dirty) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await warehouseVisualLayoutApi.save(
        warehouse.id,
        snapshot.saved.revision,
        plan,
        controller.signal,
      );
      if (!controller.signal.aborted && saved.plan) {
        setSnapshot({ ...snapshot, saved, plan: saved.plan });
        setPlan(saved.plan);
        setPast([]);
        setNotice(t('saved'));
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof ApiError && failure.status === 409
            ? t('stale')
            : failure instanceof ApiError
              ? failure.message
              : t('saveError'),
        );
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };
  const selectedValue = selected ? `${selected.kind}:${selected.id}` : '';
  const options = snapshot
    ? [
        ...snapshot.zones.map((item) => ({
          value: `zone:${item.id}`,
          label: `${t('zone')} · ${item.code}`,
        })),
        ...snapshot.bins.map((item) => ({
          value: `bin:${item.id}`,
          label: `${t('bin')} · ${item.code}`,
        })),
      ].filter((item) => matches.has(item.value))
    : [];
  const outsideFilter = !!selectedValue && !matches.has(selectedValue);
  // Keep current details without disguising an excluded selection as a match.
  if (selectedValue && !options.some((item) => item.value === selectedValue)) {
    options.unshift({
      value: selectedValue,
      label: t('selectedOutsideOption', { code: zone?.code ?? bin?.code ?? selectedValue }),
    });
  }

  return (
    <Modal isOpen title={t('title', { code: warehouse.code })} width="1500px" onClose={close}>
      <div ref={stage} className={styles.planner}>
        <div className={styles.toolbar}>
          <p>{t('schematic')}</p>
          <div className={styles.actions}>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || saving}
              onClick={() => (hasEdits && canEdit ? setConfirm('reload') : reload())}
            >
              {t('reload')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void stage.current
                  ?.requestFullscreen?.()
                  .catch(() => setNotice(t('fullscreenUnavailable')));
              }}
              aria-label={t('fullscreen')}
            >
              <Maximize2 size={16} />
            </Button>
            {canEdit && (
              <>
                <Button
                  variant={editing ? 'primary' : 'outline'}
                  size="sm"
                  disabled={!snapshot || saving}
                  aria-pressed={editing}
                  onClick={() => setEditing((value) => !value)}
                >
                  <Move size={16} />
                  {t(editing ? 'viewMode' : 'arrangeMode')}
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || !snapshot || saving}
                  isLoading={saving}
                  onClick={() => void save()}
                >
                  <Save size={16} />
                  {t('save')}
                </Button>
              </>
            )}
          </div>
        </div>
        {confirm && (
          <Alert variant="warning" title={t('discardTitle')}>
            <p>{t('discardHelp')}</p>
            <div className={styles.actions}>
              <Button
                variant="danger"
                size="sm"
                onClick={() => (confirm === 'close' ? onClose() : reload())}
              >
                {t('discard')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                {t('keepEditing')}
              </Button>
            </div>
          </Alert>
        )}
        {error && <Alert variant="error" title={error} />}
        {notice && (
          <div role="status" className={styles.notice}>
            {notice}
          </div>
        )}
        {loading ? (
          <p role="status">{t('loading')}</p>
        ) : snapshot && plan ? (
          <>
            <div className={styles.world}>
              <div ref={host} className={styles.canvas} />
              <div className={styles.kpis} aria-label={t('summary')}>
                <div>
                  <span>{t('zones')}</span>
                  <strong>{snapshot.zones.length}</strong>
                </div>
                <div>
                  <span>{t('placedBins')}</span>
                  <strong>
                    {plan.bins.length}
                    <small> / {snapshot.bins.length}</small>
                  </strong>
                </div>
                <div>
                  <span>{t('activeBins')}</span>
                  <strong>{snapshot.bins.filter((item) => item.isActive).length}</strong>
                </div>
              </div>
              <div className={styles.camera} aria-label={t('camera')}>
                {[
                  {
                    label: 'home',
                    icon: Home,
                    action: () => scene.current?.home(editing || topView),
                  },
                  { label: 'zoomIn', icon: ZoomIn, action: () => scene.current?.zoom(0.8) },
                  { label: 'zoomOut', icon: ZoomOut, action: () => scene.current?.zoom(1.25) },
                  { label: 'rotate', icon: RotateCw, action: () => scene.current?.rotate() },
                ].map(({ label, icon: Icon, action }) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="sm"
                    aria-label={t(label)}
                    disabled={unavailable || ((editing || topView) && label === 'rotate')}
                    onClick={action}
                  >
                    <Icon size={17} />
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('topView')}
                  aria-pressed={editing || topView}
                  disabled={unavailable || editing}
                  onClick={() => setTopView((value) => !value)}
                >
                  <Map size={17} />
                </Button>
              </div>
              <aside className={styles.details} aria-label={t('details')}>
                <div className={styles.detailHeading}>
                  <Box size={19} />
                  <strong>{t('details')}</strong>
                </div>
                <Input
                  label={t('search')}
                  {...register('search')}
                  placeholder={t('searchPlaceholder')}
                />
                <details className={styles.filters}>
                  <summary>{t('filters')}</summary>
                  <Select
                    label={t('zone')}
                    {...register('zoneId')}
                    placeholder={t('allZones')}
                    isPlaceholderDisabled={false}
                    options={snapshot.zones.map((item) => ({ value: item.id, label: item.code }))}
                  />
                  <Select
                    label={t('type')}
                    {...register('zoneType')}
                    options={['all', 'RECEIVING', 'STORAGE', 'PACKING', 'QUARANTINE'].map(
                      (value) => ({
                        value,
                        label: value === 'all' ? t('allTypes') : t(`types.${value}`),
                      }),
                    )}
                  />
                  <Select
                    label={t('state')}
                    {...register('status')}
                    options={['all', 'active', 'inactive'].map((value) => ({
                      value,
                      label: t(value === 'all' ? 'allStatuses' : value),
                    }))}
                  />
                  <Select
                    label={t('placement')}
                    {...register('placement')}
                    options={['all', 'placed', 'unplaced'].map((value) => ({
                      value,
                      label: t(value === 'all' ? 'allPlacements' : value),
                    }))}
                  />
                </details>
                <div className={styles.filterSummary}>
                  <p role="status">
                    {t('matches', {
                      count: matches.size,
                      total: snapshot.zones.length + snapshot.bins.length,
                    })}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetFilters(defaultWarehouseViewFilters)}
                  >
                    {t('clearFilters')}
                  </Button>
                </div>
                {matches.size === 0 && <p>{t('noMatches')}</p>}
                <p>{t('filterContext')}</p>
                <Select
                  label={t('selectEntity')}
                  value={selectedValue}
                  options={options}
                  isPlaceholderDisabled={false}
                  onChange={(event) => {
                    const [kind, id] = event.target.value.split(':');
                    if (id && (kind === 'zone' || kind === 'bin')) {
                      setSelected({ kind, id });
                      scene.current?.focus({ kind, id });
                    } else setSelected(null);
                  }}
                />
                {outsideFilter && <p role="status">{t('selectedOutside')}</p>}
                {zone || bin ? (
                  <>
                    <h4>{zone?.code ?? bin?.code}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!placement || unavailable}
                      onClick={() => selected && scene.current?.focus(selected)}
                    >
                      <Focus size={16} />
                      {t('focus')}
                    </Button>
                    <dl className={styles.metadata}>
                      <div>
                        <dt>{t('state')}</dt>
                        <dd>{t((zone ?? bin)?.isActive ? 'active' : 'inactive')}</dd>
                      </div>
                      {zone && (
                        <div>
                          <dt>{t('type')}</dt>
                          <dd>{t(`types.${zone.zoneType}`)}</dd>
                        </div>
                      )}
                      {bin && (
                        <>
                          <div>
                            <dt>{t('zone')}</dt>
                            <dd>{snapshot.zones.find((item) => item.id === bin.zoneId)?.code}</dd>
                          </div>
                          <div>
                            <dt>{t('maxWeight')}</dt>
                            <dd>{bin.maxWeightG} g</dd>
                          </div>
                          <div>
                            <dt>{t('maxVolume')}</dt>
                            <dd>{bin.maxVolumeM3} m³</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>{t('position')}</dt>
                        <dd>{placement ? `${placement.x}, ${placement.z}` : t('unplaced')}</dd>
                      </div>
                    </dl>
                    {editing && canEdit && (
                      <form
                        className={styles.positionForm}
                        onSubmit={position.handleSubmit((values) => {
                          if (!selected) return;
                          const next =
                            selected.kind === 'zone'
                              ? {
                                  ...plan,
                                  zones: [
                                    ...plan.zones.filter((item) => item.zoneId !== selected.id),
                                    { zoneId: selected.id, ...values },
                                  ],
                                }
                              : {
                                  ...plan,
                                  bins: [
                                    ...plan.bins.filter((item) => item.binId !== selected.id),
                                    { binId: selected.id, x: values.x, z: values.z },
                                  ],
                                };
                          apply(next);
                        })}
                      >
                        <p>{t(bin ? 'binCoordinates' : 'zoneCoordinates')}</p>
                        <div className={styles.fields}>
                          {(
                            ['x', 'z', ...(zone ? (['width', 'depth'] as const) : [])] as const
                          ).map((field) => (
                            <Input
                              key={field}
                              label={t(field)}
                              type="number"
                              min={field === 'width' || field === 'depth' ? 3 : 0}
                              max={field === 'width' || field === 'depth' ? 128 : 255}
                              step="1"
                              required
                              disabled={saving}
                              {...position.register(field, { valueAsNumber: true })}
                              error={
                                position.formState.errors[field] ? t('invalidNumber') : undefined
                              }
                            />
                          ))}
                        </div>
                        <Button variant="outline" size="sm" type="submit" disabled={saving}>
                          {t('applyPosition')}
                        </Button>
                        {placement && (
                          <div className={styles.nudge} aria-label={t('nudge')}>
                            {[
                              { icon: ArrowLeft, dx: -1, dz: 0, label: 'left' },
                              { icon: ArrowUp, dx: 0, dz: -1, label: 'up' },
                              { icon: ArrowDown, dx: 0, dz: 1, label: 'down' },
                              { icon: ArrowRight, dx: 1, dz: 0, label: 'right' },
                            ].map(({ icon: Icon, dx, dz, label }) => (
                              <Button
                                type="button"
                                key={label}
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                aria-label={t(label)}
                                onClick={() =>
                                  selected && move(selected, placement.x + dx, placement.z + dz)
                                }
                              >
                                <Icon size={16} />
                              </Button>
                            ))}
                          </div>
                        )}
                      </form>
                    )}
                  </>
                ) : (
                  <p>{t(snapshot.zones.length ? 'selectHelp' : 'empty')}</p>
                )}
                {editing && canEdit && (
                  <details className={styles.filters}>
                    <summary>{t('floorSize')}</summary>
                    <form
                      className={styles.positionForm}
                      onSubmit={floorSize.handleSubmit((values) => apply({ ...plan, ...values }))}
                    >
                      <p>{t('floorSizeHelp')}</p>
                      <div className={styles.fields}>
                        {(['width', 'depth'] as const).map((field) => (
                          <Input
                            key={field}
                            label={t(field)}
                            type="number"
                            min={16}
                            max={256}
                            step="1"
                            required
                            disabled={saving}
                            {...floorSize.register(field, { valueAsNumber: true })}
                            error={
                              floorSize.formState.errors[field] ? t('invalidNumber') : undefined
                            }
                          />
                        ))}
                      </div>
                      <Button variant="outline" size="sm" type="submit" disabled={saving}>
                        {t('applyFloorSize')}
                      </Button>
                    </form>
                  </details>
                )}
              </aside>
              <div className={styles.legend}>
                <span className={styles.storage} />
                {t('types.STORAGE')}
                <span className={styles.receiving} />
                {t('types.RECEIVING')}
                <span className={styles.packing} />
                {t('types.PACKING')}
                <span className={styles.quarantine} />
                {t('types.QUARANTINE')}
              </div>
              <div className={styles.help}>
                {t(editing ? 'dragHelp' : topView ? 'panHelp' : 'orbitHelp')}
              </div>
              {unavailable && (
                <div className={styles.fallback}>
                  <Alert variant="warning" title={t('webglUnavailable')}>
                    {t('fallbackHelp')}
                  </Alert>
                </div>
              )}
            </div>
            <footer className={styles.footer}>
              <p role="status">
                {dirty ? t('draft') : t('revision', { revision: snapshot.saved.revision })}
                {` · ${t('floorCells', { width: plan.width, depth: plan.depth })}`}
                {snapshot.saved.savedAt &&
                  ` · ${new Date(snapshot.saved.savedAt).toLocaleString(locale)}`}
              </p>
              {canEdit && editing && (
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!past.length || saving}
                    onClick={() => {
                      const previous = past.at(-1);
                      if (previous) {
                        setPlan(previous);
                        setPast((items) => items.slice(0, -1));
                      }
                    }}
                  >
                    <Undo2 size={15} />
                    {t('undo')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => apply(arrangeVisualPlan(snapshot.zones, snapshot.bins))}
                  >
                    {t('autoArrange')}
                  </Button>
                </div>
              )}
            </footer>
          </>
        ) : (
          !loading && (
            <Button variant="outline" onClick={reload}>
              {t('reload')}
            </Button>
          )
        )}
      </div>
    </Modal>
  );
}

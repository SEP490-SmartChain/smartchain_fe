import { useEffect, useRef, useState } from 'react';

import { X, CalendarDays, Info, MapPin, PanelsTopLeft, Pencil, PauseCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button, Tabs } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';

import { WarehouseCalendarPanel } from './WarehouseCalendarPanel';
import styles from './WarehouseDetails.module.css';
import { WarehouseDowntimePanel } from './WarehouseDowntimePanel';
import { WarehouseLayoutPanel } from './WarehouseLayoutPanel';
import { END_OF_DAY_MINUTE, minuteToTime } from '../utils/warehouseHours';

import type { Warehouse } from '../types/warehouse';

interface WarehouseDetailsProps {
  id: string;
  warehouse: Warehouse;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => void;
}

type Section = 'overview' | 'layout' | 'calendar' | 'downtime';

export function WarehouseDetails({
  id,
  warehouse,
  onClose,
  onEdit,
  onSaved,
}: WarehouseDetailsProps) {
  const t = useTranslations('Warehouses');
  const locale = useLocale();
  const { can } = useAccess();
  const [section, setSection] = useState<Section>('overview');
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  const [visited, setVisited] = useState<Partial<Record<Section, boolean>>>({ overview: true });
  const tabsId = `warehouse-${warehouse.id}`;
  const sections = [
    { id: 'overview' as const, label: t('overviewTab'), icon: Info, visible: true },
    {
      id: 'layout' as const,
      label: t('layoutTab'),
      icon: PanelsTopLeft,
      visible: can('warehouses.layout.view'),
    },
    {
      id: 'calendar' as const,
      label: t('calendarTitle'),
      icon: CalendarDays,
      visible: can('warehouses.downtime.view'),
    },
    {
      id: 'downtime' as const,
      label: t('downtimeTab'),
      icon: PauseCircle,
      visible: can('warehouses.downtime.view'),
    },
  ].filter((item) => item.visible);
  const endTime =
    warehouse.operatingEndMinute === END_OF_DAY_MINUTE
      ? t('endOfDay')
      : minuteToTime(warehouse.operatingEndMinute);
  return (
    <section id={id} className={styles.page} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className={styles.title} ref={titleRef} tabIndex={-1}>
            {t('warehouseDetailTitle', { code: warehouse.code })}
          </h2>
          <p className={`${styles.address} ${styles.copy}`}>
            <MapPin size={14} className="mt-1 shrink-0" aria-hidden="true" />
            {warehouse.address}
          </p>
        </div>
        <div className={styles.detailActions}>
          {can('warehouses.update') && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil size={14} aria-hidden="true" />
              {t('editWarehouse')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('collapseWarehouse', { code: warehouse.code })}
          >
            <X size={14} aria-hidden="true" />
            {t('collapseDetails')}
          </Button>
        </div>
      </header>
      <nav className={styles.navigation} aria-label={t('detailSections')}>
        <Tabs
          id={tabsId}
          label={t('detailSections')}
          activeId={section}
          tabs={sections.map(({ id, label, icon: Icon }) => ({
            id,
            label,
            icon: <Icon size={16} aria-hidden="true" />,
          }))}
          onChange={(id) => {
            const nextSection = sections.find((item) => item.id === id);
            if (!nextSection) return;
            setSection(nextSection.id);
            setVisited((previous) => ({ ...previous, [nextSection.id]: true }));
          }}
        />
      </nav>
      <div
        id={`${tabsId}-panel-overview`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-overview`}
        tabIndex={0}
        hidden={section !== 'overview'}
      >
        <div className={styles.overview}>
          <dl className={styles.operatingStats}>
            <div>
              <dt>{t('hoursTitle')}</dt>
              <dd>
                {minuteToTime(warehouse.operatingStartMinute)} – {endTime}
              </dd>
            </div>
            <div>
              <dt>{t('cutoffLabel')}</dt>
              <dd>{minuteToTime(warehouse.cutoffMinute)}</dd>
            </div>
            <div>
              <dt>{t('dailyCapacity')}</dt>
              <dd>
                {t('ordersPerDay', { count: warehouse.dailyCapacity.toLocaleString(locale) })}
              </dd>
            </div>
          </dl>
          <details className={styles.overviewHelp}>
            <summary>{t('cutoffExplanation')}</summary>
            <p className={`${styles.copy} mt-2`}>{t('cutoffHelp')}</p>
          </details>
          <div className={styles.contactSection}>
            <h3 className={styles.subtitle}>{t('warehouseInformation')}</h3>
            <dl className={`${styles.metadata} ${styles.contactMetadata}`}>
              {[
                { label: t('name'), value: warehouse.name },
                { label: t('code'), value: warehouse.code },
                { label: t('region'), value: t(`regions.${warehouse.region}`) },
                { label: t('contactName'), value: warehouse.contactName },
                { label: t('contactPhone'), value: warehouse.contactPhone },
                { label: t('contactEmail'), value: warehouse.contactEmail },
              ].map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <details className={styles.overviewHelp}>
            <summary>{t('additionalInformation')}</summary>
            <dl className={`${styles.metadata} mt-4`}>
              <div>
                <dt>{t('gps')}</dt>
                <dd>
                  {warehouse.latitude}, {warehouse.longitude}
                </dd>
              </div>
              <div>
                <dt>{t('timeZone')}</dt>
                <dd>{warehouse.timeZone}</dd>
              </div>
            </dl>
          </details>
        </div>
      </div>
      {can('warehouses.layout.view') && (
        <div
          id={`${tabsId}-panel-layout`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-layout`}
          tabIndex={0}
          hidden={section !== 'layout'}
        >
          {visited.layout && <WarehouseLayoutPanel warehouse={warehouse} />}
        </div>
      )}
      {can('warehouses.downtime.view') && (
        <div
          id={`${tabsId}-panel-calendar`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-calendar`}
          tabIndex={0}
          hidden={section !== 'calendar'}
        >
          {visited.calendar && (
            <WarehouseCalendarPanel warehouse={warehouse} onSaved={onSaved} onEdit={onEdit} />
          )}
        </div>
      )}
      {can('warehouses.downtime.view') && (
        <div
          id={`${tabsId}-panel-downtime`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-downtime`}
          tabIndex={0}
          hidden={section !== 'downtime'}
        >
          {visited.downtime && <WarehouseDowntimePanel warehouse={warehouse} onSaved={onSaved} />}
        </div>
      )}
    </section>
  );
}

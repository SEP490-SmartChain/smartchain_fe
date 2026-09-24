import { Globe, Plane, Server, ShieldCheck, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/Common/Badge/Badge';
import Modal from '@/components/Common/Modal/Modal';

import type { CarrierDetail } from '../types/carrierCatalog.types';

interface CarrierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  carrier: CarrierDetail | null;
}

export function CarrierDetailModal({ isOpen, onClose, carrier }: CarrierDetailModalProps) {
  const t = useTranslations('AdminCarriers');

  if (!carrier) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={carrier.name} width="680px">
      <div className="flex max-h-[75vh] flex-col gap-5 overflow-y-auto p-5 text-sm">
        {/* Header */}
        <div className="flex items-center justify-between rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] font-bold text-[var(--sc-primary)]">
              {carrier.code}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--sc-text-primary)]">
                  {carrier.name}
                </span>
                <Badge
                  status={carrier.isActive ? 'success' : 'default'}
                  label={carrier.isActive ? t('status_active') : t('status_inactive')}
                />
              </div>
              <div className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                {carrier.connectedTenantsCount} {t('connected_tenants')}
              </div>
            </div>
          </div>
        </div>

        {/* Endpoints section */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Server size={16} className="text-[var(--sc-primary)]" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
              {t('configured_endpoints')} ({carrier.endpoints.length})
            </h4>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--sc-border-default)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('env')}</th>
                  <th className="px-3 py-2 font-medium">{t('base_url')}</th>
                  <th className="px-3 py-2 font-medium">{t('api_version')}</th>
                  <th className="px-3 py-2 font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {carrier.endpoints.map((ep) => (
                  <tr key={ep.id} className="hover:bg-[var(--sc-bg-secondary)]">
                    <td className="px-3 py-2.5 font-medium text-[var(--sc-text-primary)]">
                      <Badge
                        status={ep.environment === 'PRODUCTION' ? 'success' : 'default'}
                        label={ep.environment}
                      />
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 font-mono text-[var(--sc-text-secondary)]">
                      {ep.baseUrl}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{ep.apiVersion || 'v1'}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[var(--sc-success-dark)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--sc-success)]" />
                        {ep.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Services section */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Truck size={16} className="text-[var(--sc-primary)]" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--sc-text-secondary)]">
              {t('shipping_services')} ({carrier.services.length})
            </h4>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--sc-border-default)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('service_code')}</th>
                  <th className="px-3 py-2 font-medium">{t('service_name')}</th>
                  <th className="px-3 py-2 font-medium">{t('mode')}</th>
                  <th className="px-3 py-2 font-medium">{t('volumetric')}</th>
                  <th className="px-3 py-2 font-medium">{t('max_weight')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sc-border-default)]">
                {carrier.services.map((srv) => (
                  <tr key={srv.id} className="hover:bg-[var(--sc-bg-secondary)]">
                    <td className="px-3 py-2.5 font-mono font-medium text-[var(--sc-text-primary)]">
                      {srv.code}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--sc-text-primary)]">{srv.name}</td>
                    <td className="px-3 py-2.5">
                      <Badge status="default" label={srv.transportMode} />
                    </td>
                    <td className="px-3 py-2.5 font-mono">/{srv.volumetricDivisor}</td>
                    <td className="px-3 py-2.5">
                      {srv.maxWeightG ? `${srv.maxWeightG / 1000}kg` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

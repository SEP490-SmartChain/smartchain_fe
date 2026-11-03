import type { TransportMode } from '../types/carrierCatalog.types';

interface CarrierServicePreset {
  code: string;
  labelKey: 'serviceGhnLight' | 'serviceGhnHeavy' | 'serviceGhtkRoad' | 'serviceGhtkAir';
  transportMode: TransportMode;
}

// Provider codes: GHN service_type_id; GHTK transport (normalized by dispatch).
export function carrierServicePresets(carrierCode: string): readonly CarrierServicePreset[] {
  switch (carrierCode) {
    case 'GHN':
      return [
        { code: '2', labelKey: 'serviceGhnLight', transportMode: 'ROAD' },
        { code: '5', labelKey: 'serviceGhnHeavy', transportMode: 'ROAD' },
      ];
    case 'GHTK':
      return [
        { code: 'ROAD', labelKey: 'serviceGhtkRoad', transportMode: 'ROAD' },
        { code: 'FLY', labelKey: 'serviceGhtkAir', transportMode: 'AIR' },
      ];
    default:
      return [];
  }
}

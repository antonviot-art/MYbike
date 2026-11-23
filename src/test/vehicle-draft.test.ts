import { expect, it } from 'vitest';
import { parseVehicleNotes } from '@/features/crew/vehicle-draft';

it('extracts a model, French measurements and parts from vehicle notes', () => {
  expect(parseVehicleNotes("J’ai une KTM 350 EXC-F, enduro, 350 cm³, 60,5 h, 1 200 km, avec pneus Michelin")).toEqual({
    name: 'KTM 350 EXC-F', type: 'Enduro', cc: 350, hours: 60.5, km: 1200, parts: 'pneus Michelin',
  });
});

it('keeps absent measurements empty and accepts explicit form labels', () => {
  expect(parseVehicleNotes('Honda CRF 450')).toEqual({ name: 'Honda CRF 450' });
  expect(parseVehicleNotes('Modèle: Yamaha Raptor; Cylindrée: 700; Kilométrage: 250; Description: bleu et blanc')).toEqual({
    name: 'Yamaha Raptor', cc: 700, km: 250, description: 'bleu et blanc',
  });
});

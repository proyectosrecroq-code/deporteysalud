import { describe, expect, it } from 'vitest';
import { generateWorkout } from '@/lib/workout-gen';
import { previousLoad, editableBlocks, canRecordLoad } from '@/lib/workout-loads';
import type { Workout } from '@/lib/store';

const workout = (id: string, date: string, item: { name: string; load?: string; recordedLoad?: string }): Workout => ({ id, date, member_id: 'member', title: 'Fuerza', type: 'Completo', blocks: [{ block: 'Fuerza', items: [item] }] });
describe('cargas realizadas, nunca prescritas', () => {
  it('no prescribe pesos en ningún tipo de entreno automático', () => {
    for (const type of ['Completo', 'WOD', 'Hyrox', 'Sueltos'] as const) {
      const result = generateWorkout(type, [{ id: '1', name: 'Sentadilla', category: 'Fuerza' }]);
      expect(result.blocks.flatMap(b => b.items).some(i => Boolean(i.load) || Boolean(i.recordedLoad))).toBe(false);
    }
  });
  it('recuerda el último peso final anterior del mismo ejercicio, sin tomar pesos futuros ni heredados', () => {
    const history = [workout('old', '2026-10-05', { name: 'Sentadilla', recordedLoad: '30' }), workout('last', '2026-10-08', { name: 'Sentadilla', recordedLoad: '35' }), workout('future', '2026-10-15', { name: 'Sentadilla', recordedLoad: '80' }), workout('legacy', '2026-10-09', { name: 'Sentadilla', load: '50' })];
    expect(previousLoad(history, 'Sentadilla', '2026-10-10')).toEqual({ kg: '35', date: '2026-10-08' });
    expect(previousLoad(history, 'Remo', '2026-10-10')).toBeUndefined();
  });
  it('conserva resultados al editar y elimina pesos antiguos que no son resultados', () => {
    const blocks = workout('edit', '2026-10-08', { name: 'Sentadilla', load: '50', recordedLoad: '35' }).blocks;
    expect(editableBlocks(blocks)[0]?.items[0]).toEqual({ name: 'Sentadilla', recordedLoad: '35' });
    expect(blocks[0]?.items[0]?.load).toBe('50');
  });
  it('solo permite registrar resultados de sesiones actuales o pasadas', () => {
    expect(canRecordLoad('2026-10-09', '2026-10-10')).toBe(true);
    expect(canRecordLoad('2026-10-10', '2026-10-10')).toBe(true);
    expect(canRecordLoad('2026-10-11', '2026-10-10')).toBe(false);
  });
});
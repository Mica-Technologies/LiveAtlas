import {coalesceMarkerUpdates} from "@/util/markerQueue";
import {DynmapMarkerUpdate} from "@/dynmap";

const update = (set: string, id: string, x: number, removed = false): DynmapMarkerUpdate => ({
	set, id, removed, type: 0, payload: removed ? undefined : {x},
} as unknown as DynmapMarkerUpdate);

describe('coalesceMarkerUpdates', () => {
	test('keeps only the newest update per marker', () => {
		let queue: DynmapMarkerUpdate[] = [];
		for(let i = 0; i < 100; i++) {
			queue = coalesceMarkerUpdates(queue, [update('storms', 'point_a', i), update('storms', 'point_b', -i)]);
		}

		expect(queue).toHaveLength(2);
		expect(queue.map(u => (u.payload as any).x)).toEqual([99, -99]);
	});

	test('a later removal replaces earlier updates, and a later re-add replaces the removal', () => {
		let queue = coalesceMarkerUpdates([], [update('s', 'point_a', 1), update('s', 'point_a', 0, true)]);
		expect(queue).toHaveLength(1);
		expect(queue[0].removed).toBe(true);

		queue = coalesceMarkerUpdates(queue, [update('s', 'point_a', 2)]);
		expect(queue).toHaveLength(1);
		expect(queue[0].removed).toBe(false);
		expect((queue[0].payload as any).x).toBe(2);
	});

	test('the same id in different sets stays separate', () => {
		const queue = coalesceMarkerUpdates([], [update('a', 'point_x', 1), update('b', 'point_x', 2)]);
		expect(queue).toHaveLength(2);
	});

	test('a marker keeps the queue position of its first pending update', () => {
		const queue = coalesceMarkerUpdates([update('s', 'point_a', 1), update('s', 'point_b', 1)], [update('s', 'point_a', 2)]);
		expect(queue.map(u => u.id)).toEqual(['point_a', 'point_b']);
	});

	test('no incoming updates returns the queue unchanged', () => {
		const pending = [update('s', 'point_a', 1)];
		expect(coalesceMarkerUpdates(pending, [])).toBe(pending);
	});
});

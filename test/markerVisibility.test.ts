import {CRS, LatLng, Layer, Map as LeafletMap} from "leaflet";
import {hasZoomLimits, isInBounds, isVisibleAtZoom, pendingMarkerCount} from "@/util/markerVisibility";
import LiveAtlasLayerGroup from "@/leaflet/layer/LiveAtlasLayerGroup";
import {GenericMarker} from "@/leaflet/marker/GenericMarker";
import {LiveAtlasPointMarker} from "@/index";

describe('isVisibleAtZoom', () => {
	test('no limits anywhere shows at every zoom', () => {
		expect(isVisibleAtZoom(0)).toBe(true);
		expect(isVisibleAtZoom(12, {}, {})).toBe(true);
	});

	test('group limits apply when the layer has none', () => {
		expect(isVisibleAtZoom(5, {}, {minZoom: 6})).toBe(false);
		expect(isVisibleAtZoom(6, {}, {minZoom: 6})).toBe(true);
		expect(isVisibleAtZoom(9, {}, {minZoom: 6, maxZoom: 8})).toBe(false);
	});

	test('a layer limit overrides its group, even below the group minimum', () => {
		// A landmark shown city-wide in a set that only appears close up
		expect(isVisibleAtZoom(3, {minZoom: 3}, {minZoom: 6})).toBe(true);
		expect(isVisibleAtZoom(2, {minZoom: 3}, {minZoom: 6})).toBe(false);
	});

	test('a one-sided limit only limits that side', () => {
		expect(isVisibleAtZoom(20, {minZoom: 3})).toBe(true);
		expect(isVisibleAtZoom(0, {maxZoom: 5})).toBe(true);
		expect(isVisibleAtZoom(6, {maxZoom: 5})).toBe(false);
	});

	test('zero is a real limit', () => {
		expect(hasZoomLimits({maxZoom: 0})).toBe(true);
		expect(isVisibleAtZoom(1, {maxZoom: 0})).toBe(false);
		expect(isVisibleAtZoom(0, {maxZoom: 0})).toBe(true);
		expect(isVisibleAtZoom(1, {}, {maxZoom: 0})).toBe(false);
	});
});

describe('isInBounds', () => {
	const bounds = {minX: -10, maxX: 10, minY: -5, maxY: 5};

	test('inside, on the edge and outside', () => {
		expect(isInBounds(0, 0, bounds)).toBe(true);
		expect(isInBounds(10, -5, bounds)).toBe(true);
		expect(isInBounds(10.1, 0, bounds)).toBe(false);
		expect(isInBounds(0, -6, bounds)).toBe(false);
	});
});

describe('LiveAtlasLayerGroup culling', () => {
	let map: LeafletMap;

	const point = (lat: number, lng: number, limits: {minZoom?: number, maxZoom?: number} = {}) =>
		new GenericMarker(new LatLng(lat, lng), {
			iconUrl: 'x.png', tooltip: '', tooltipHTML: '', ...limits,
		} as unknown as LiveAtlasPointMarker);

	beforeEach(() => {
		vi.useFakeTimers({toFake: ['requestAnimationFrame', 'cancelAnimationFrame']});

		const container = document.createElement('div');
		// jsdom does no layout, so give the map a size to work out its bounds from
		Object.defineProperty(container, 'clientWidth', {value: 400});
		Object.defineProperty(container, 'clientHeight', {value: 200});
		document.body.appendChild(container);

		map = new LeafletMap(container, {crs: CRS.Simple, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false});
		map.createPane('vectors');
		map.setView([0, 0], 0);
	});

	afterEach(() => {
		map.remove();
		vi.useRealTimers();
	});

	const flush = () => vi.runAllTimers();

	test('only points in or near the view are put on the map', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0}),
			near = point(0, 10),
			far = point(0, 5000);

		group.addLayer(near).addLayer(far);
		map.addLayer(group);
		flush();

		expect(map.hasLayer(near)).toBe(true);
		expect(map.hasLayer(far)).toBe(false);

		// Moving to the far marker brings it in and drops the other
		map.setView([0, 5000], 0);
		flush();

		expect(map.hasLayer(far)).toBe(true);
		expect(map.hasLayer(near)).toBe(false);
		expect(pendingMarkerCount.value).toBe(0);
	});

	test('layers other than points are not culled, only zoom limited', () => {
		// jsdom can't draw vectors, so stand in for a line with a bare layer far outside the view
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0, minZoom: 1}),
			line = new Layer();
		(line as any).onAdd = () => line;
		(line as any).onRemove = () => line;

		group.addLayer(line);
		map.addLayer(group);
		flush();
		expect(map.hasLayer(line)).toBe(false);

		map.setZoom(1);
		flush();
		expect(map.hasLayer(line)).toBe(true);
	});

	test('a marker added by a live update respects the set\'s zoom limit', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0, minZoom: 2});
		map.addLayer(group);
		flush();

		const marker = point(0, 0);
		group.addLayer(marker);
		expect(map.hasLayer(marker)).toBe(false);

		map.setZoom(2);
		flush();
		expect(map.hasLayer(marker)).toBe(true);
	});

	test('refreshLayer follows a moved marker and changed zoom limits', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0}),
			marker = point(0, 0);

		group.addLayer(marker);
		map.addLayer(group);
		flush();
		expect(map.hasLayer(marker)).toBe(true);

		marker.setLatLng([0, 5000]);
		group.refreshLayer(marker);
		expect(map.hasLayer(marker)).toBe(false);

		marker.setLatLng([0, 0]);
		marker.options.minZoom = 3;
		group.refreshLayer(marker);
		expect(map.hasLayer(marker)).toBe(false);

		marker.options.minZoom = undefined;
		group.refreshLayer(marker);
		expect(map.hasLayer(marker)).toBe(true);
	});

	test('adds a big batch over several frames, and reports it as pending meanwhile', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0}),
			markers = Array.from({length: 3000}, (_, i) => point((i % 50) - 25, Math.floor(i / 50) - 30));

		markers.forEach(m => group.addLayer(m));

		const now = vi.spyOn(performance, 'now');
		let t = 0;
		// Each call takes 1 ms, so the per-frame time budget runs out after a handful of markers
		now.mockImplementation(() => t++);

		map.addLayer(group);
		expect(pendingMarkerCount.value).toBeGreaterThan(0);
		expect(markers.filter(m => map.hasLayer(m)).length).toBeLessThan(markers.length);

		now.mockRestore();
		flush();
		expect(pendingMarkerCount.value).toBe(0);
		expect(markers.every(m => map.hasLayer(m))).toBe(true);
	});

	test('removing the group cancels pending adds', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 0}),
			markers = Array.from({length: 500}, () => point(0, 0));

		markers.forEach(m => group.addLayer(m));
		const now = vi.spyOn(performance, 'now');
		let t = 0;
		now.mockImplementation(() => t++);
		map.addLayer(group);
		now.mockRestore();

		map.removeLayer(group);
		flush();
		expect(pendingMarkerCount.value).toBe(0);
		expect(markers.some(m => map.hasLayer(m))).toBe(false);
	});
});

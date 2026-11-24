import {CRS, LatLng, Map as LeafletMap, point} from "leaflet";
import {CanvasIconMarker} from "@/leaflet/marker/CanvasIconMarker";
import {IconCanvasRenderer} from "@/leaflet/layer/IconCanvasRenderer";
import LiveAtlasLayerGroup from "@/leaflet/layer/LiveAtlasLayerGroup";
import {LiveAtlasPointMarker} from "@/index";

const options = (extra: Partial<LiveAtlasPointMarker> = {}) => ({
	iconUrl: 'x.png', tooltip: 'Town Hall', tooltipHTML: '', ...extra,
} as unknown as LiveAtlasPointMarker);

describe('CanvasIconMarker', () => {
	test('sizes and anchors given as strings are used as numbers', () => {
		// Dynmap marker data gives "16x16"-style sizes, split into strings
		const icon = new CanvasIconMarker(new LatLng(0, 0), options({
			iconSize: ['16', '16'] as any,
			iconAnchor: ['8', '16'] as any,
		})),
			size = icon.getSize(new Image());

		expect(size.x + 1).toBe(17);
		expect(icon.getAnchor(size).y + 1).toBe(17);
	});

	test('without an anchor the icon is centred on its position', () => {
		const icon = new CanvasIconMarker(new LatLng(0, 0), options({iconSize: [32, 16]}));
		const anchor = icon.getAnchor(icon.getSize(new Image()));

		expect([anchor.x, anchor.y]).toEqual([16, 8]);
	});

	test('the label is the HTML tooltip when there is one', () => {
		const icon = new CanvasIconMarker(new LatLng(0, 0), options({tooltipHTML: '<b>Hall</b>'}));

		expect(icon.label).toBe('<b>Hall</b>');
		expect(icon.isHtml).toBe(true);
	});

	test('keeps its zoom limits where the layer group reads them', () => {
		const icon = new CanvasIconMarker(new LatLng(0, 0), options({minZoom: 3, maxZoom: 5}));

		expect(icon.options.minZoom).toBe(3);
		expect(icon.options.maxZoom).toBe(5);
	});
});

describe('canvas icons on a map', () => {
	let map: LeafletMap;

	beforeEach(() => {
		const container = document.createElement('div');
		Object.defineProperty(container, 'clientWidth', {value: 400});
		Object.defineProperty(container, 'clientHeight', {value: 200});
		document.body.appendChild(container);

		map = new LeafletMap(container, {crs: CRS.Simple, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false});
		map.createPane('vectors');
		map.setView([0, 0], 0);
	});

	afterEach(() => {
		map.remove();
	});

	test('take their set\'s priority and zoom limits through the layer group', () => {
		const group = new LiveAtlasLayerGroup({id: 'test', showLabels: false, priority: 4, minZoom: 2}),
			icon = new CanvasIconMarker(new LatLng(0, 0), options());

		group.addLayer(icon);
		map.addLayer(group);

		expect(icon.priority).toBe(4);
		expect(map.hasLayer(icon)).toBe(false);

		map.setZoom(2);
		expect(map.hasLayer(icon)).toBe(true);

		group.update({id: 'test', showLabels: false, priority: 7, minZoom: 2});
		expect(icon.priority).toBe(7);
	});

	test('share one renderer per map, which finds the topmost icon under a point', () => {
		const a = new CanvasIconMarker(new LatLng(0, 0), options()),
			b = new CanvasIconMarker(new LatLng(0, 0), options());

		map.addLayer(a);
		map.addLayer(b);

		const renderer = IconCanvasRenderer.for(map);
		expect(IconCanvasRenderer.for(map)).toBe(renderer);

		// jsdom has no canvas to draw on, so give the renderer what drawing would have recorded
		(renderer as any)._drawn = [
			{icon: a, x: 0, y: 0, width: 16, height: 16},
			{icon: b, x: 8, y: 8, width: 16, height: 16},
		];

		expect(renderer.iconAt(point(10, 10))).toBe(b); // Overlap: the one drawn last is on top
		expect(renderer.iconAt(point(2, 2))).toBe(a);
		expect(renderer.iconAt(point(17, 1))).toBe(a); // Within the slop around a small icon
		expect(renderer.iconAt(point(100, 100))).toBeUndefined();
	});
});

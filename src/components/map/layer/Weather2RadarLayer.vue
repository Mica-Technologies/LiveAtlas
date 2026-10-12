<!--
  - Image overlays for maps served alongside the Weather2 Remastered Minecraft mod.
  -
  - Weather2 writes image products into <dynmap web>/weather2/<world>/: the radar reflectivity
  - directly there, and other products (such as "temperature") in a sub-folder of that name. Each
  - has an index.json listing frames and tiles, plus the PNG tiles. This layer shows the latest
  - frame of one product and refreshes it while the layer is on. Nothing appears on servers without
  - Weather2: the index is simply not there, and the layer never joins the layer control.
  -
  - Configure the location with liveAtlasConfig.weather2 = {url: "weather2/", refreshMs: 10000,
  - opacity: 0.75} in index.html; all fields are optional. The opacity applies to the radar.
  -->

<script lang="ts">
import {computed, defineComponent, onUnmounted, watch} from "vue";
import {ImageOverlay, LatLngBounds, LayerGroup} from "leaflet";
import {useStore} from "@/store";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";

interface RadarIndex {
	version: number;
	tileBlocks: number;
	frames: {id: string; time: number; tiles: [number, number][]}[];
}

interface Weather2Config {
	url?: string;
	refreshMs?: number;
	opacity?: number;
}

const PANE = 'weather2Radar';

/** Matches Weather2's RadarImageWriter.slug: Dynmap world names can contain URL-unfriendly characters. */
const slug = (world: string): string => world.replace(/[^A-Za-z0-9_-]/g, '_');

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		},
		/** Sub-folder of the product, or empty for the radar. */
		product: {
			type: String,
			default: '',
		},
		label: {
			type: String,
			default: 'Weather Radar',
		},
		/** Position in the layer control. */
		position: {
			type: Number,
			default: 5,
		},
		/** Stacking order of the product's pane; the radar sits above other products. */
		zIndex: {
			type: Number,
			default: 350,
		},
		/** Smooth pixels (fields like temperature) instead of crisp radar pixels. */
		smooth: {
			type: Boolean,
			default: false,
		},
		/** Overrides the configured opacity for this product. */
		opacity: {
			type: Number,
			default: undefined,
		},
		/** Joins the layer control switched off. */
		hiddenByDefault: {
			type: Boolean,
			default: false,
		},
	},

	setup(props) {
		const store = useStore(),
			config: Weather2Config = (window as any).liveAtlasConfig?.weather2 || {},
			baseUrl = config.url || 'weather2/',
			refreshMs = config.refreshMs || 10000,
			opacity = typeof props.opacity === 'number' ? props.opacity : typeof config.opacity === 'number' ? config.opacity : 0.75,
			productPath = props.product ? `${props.product}/` : '',
			pane = PANE + (props.product || ''),
			currentWorld = computed(() => store.state.currentWorld),
			currentMap = computed(() => store.state.currentMap),
			layerGroup = new LayerGroup();

		let overlays: ImageOverlay[] = [],
			loading: ImageOverlay[] = [],
			generation = 0,
			shownFrame = '',
			inControl = false,
			timer: number | undefined,
			warnedOrientation = false;

		// Products sit above the terrain tiles and below markers, so storm icons and warning
		// boxes stay on top of them.
		if(!props.leaflet.getPane(pane)) {
			const element = props.leaflet.createPane(pane);
			element.style.zIndex = String(props.zIndex);
			element.style.pointerEvents = 'none';
		}

		const schedule = (delay: number) => {
			window.clearTimeout(timer);
			timer = window.setTimeout(refresh, delay);
		};

		// Also drops a frame that is still loading, so it can't swap itself in afterwards: a world
		// change would otherwise end with the old world's radar over the new world's map.
		const clear = () => {
			generation++;
			overlays.concat(loading).forEach(o => layerGroup.removeLayer(o));
			overlays = [];
			loading = [];
			shownFrame = '';
		};

		/**
		 * World-aligned bounds of a tile, or undefined if this map isn't a top-down view with world
		 * +X to the right and +Z down, the orientation the tiles are drawn in. Image overlays can't be
		 * rotated or sheared, so isometric and rotated maps don't get the radar.
		 */
		const tileBounds = (tx: number, tz: number, tileBlocks: number): LatLngBounds | undefined => {
			const map = currentMap.value;
			if(!map) {
				return undefined;
			}
			const x0 = tx * tileBlocks, z0 = tz * tileBlocks,
				nw = map.locationToLatLng({x: x0, y: 64, z: z0}),
				ne = map.locationToLatLng({x: x0 + tileBlocks, y: 64, z: z0}),
				sw = map.locationToLatLng({x: x0, y: 64, z: z0 + tileBlocks});
			const xRuns = ne.lng - nw.lng, xDrift = Math.abs(ne.lat - nw.lat),
				zRuns = nw.lat - sw.lat, zDrift = Math.abs(sw.lng - nw.lng);
			if(xRuns <= 0 || zRuns <= 0 || xDrift > xRuns * 0.01 || zDrift > zRuns * 0.01) {
				if(!warnedOrientation) {
					console.info('Weather2 radar: this map is not a north-up top-down view, so the radar layer is hidden on it');
					warnedOrientation = true;
				}
				return undefined;
			}
			return new LatLngBounds(sw, map.locationToLatLng({x: x0 + tileBlocks, y: 64, z: z0 + tileBlocks})).extend(nw);
		};

		const show = (index: RadarIndex, worldSlug: string) => {
			const frame = index.frames[index.frames.length - 1];
			if(!frame || frame.id === shownFrame) {
				return;
			}
			const next: ImageOverlay[] = [];
			for(const [tx, tz] of frame.tiles) {
				const bounds = tileBounds(tx, tz, index.tileBlocks);
				if(!bounds) {
					clear();
					return;
				}
				next.push(new ImageOverlay(`${baseUrl}${worldSlug}/${productPath}${frame.id}/${tx}_${tz}.png`, bounds, {
					pane, opacity: 0, interactive: false, className: props.smooth ? 'weather2-field-tile' : 'weather2-radar-tile',
				}));
			}
			// Load the new frame invisibly, then swap, so the radar never flashes empty. A frame that
			// is still loading when a newer one arrives is dropped, so frames can't land out of order.
			loading.forEach(o => layerGroup.removeLayer(o));
			loading = next;
			const mine = ++generation;
			let pending = next.length;
			const swap = () => {
				if(mine !== generation) {
					return;
				}
				overlays.forEach(o => layerGroup.removeLayer(o));
				next.forEach(o => o.setOpacity(opacity));
				overlays = next;
				loading = [];
			};
			if(!pending) {
				swap();
			}
			next.forEach(o => {
				o.once('load error', () => {
					if(--pending === 0) {
						swap();
					}
				});
				layerGroup.addLayer(o);
			});
			shownFrame = frame.id;
		};

		const refresh = async () => {
			const world = currentWorld.value;
			if(!world) {
				schedule(refreshMs);
				return;
			}
			const worldSlug = slug(world.name);
			try {
				const response = await fetch(`${baseUrl}${worldSlug}/${productPath}index.json?t=${Date.now()}`, {cache: 'no-store'});
				if(!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const index = await response.json() as RadarIndex;
				if(!inControl) {
					// Only now that data exists does the layer appear in the layer control.
					if(props.hiddenByDefault) {
						props.leaflet.getLayerManager().addHiddenLayer(layerGroup, props.label, props.position);
					} else {
						props.leaflet.getLayerManager().addLayer(layerGroup, true, props.label, props.position);
					}
					inControl = true;
				}
				if(props.leaflet.hasLayer(layerGroup)) {
					show(index, worldSlug);
				}
				schedule(document.hidden ? refreshMs * 5 : refreshMs);
			} catch(e) {
				// No Weather2 imagery for this world (or the server is unreachable): try again later.
				clear();
				schedule(60000);
			}
		};

		// Switched on from the layer control: show the latest frame now rather than at the next poll.
		layerGroup.on('add', () => {
			shownFrame = '';
			schedule(0);
		});

		watch([currentWorld, currentMap], () => {
			clear();
			schedule(0);
		});

		schedule(0);

		onUnmounted(() => {
			window.clearTimeout(timer);
			if(inControl) {
				props.leaflet.getLayerManager().removeLayer(layerGroup);
			}
		});
	},

	render() {
		return null;
	},
});
</script>

<style>
	/* Radar pixels stay crisp, as on real radar displays, instead of being smoothed when zoomed. */
	.weather2-radar-tile {
		image-rendering: pixelated;
		image-rendering: crisp-edges;
	}

	/* Smooth fields such as temperature are interpolated, and a little see-through over terrain. */
	.weather2-field-tile {
		image-rendering: auto;
	}
</style>

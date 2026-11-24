/*
 * Copyright 2022 James Lyne
 *
 * Some portions of this file were taken from https://github.com/webbukkit/dynmap.
 * These portions are Copyright 2020 Dynmap Contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {computed, watch, WatchStopHandle, ComputedRef} from "vue";
import {Map as LeafletMap, Coords, DoneCallback} from 'leaflet';
import {TileInformation} from "dynmap";
import {Coordinate, Coordinate2D} from "@/index";
import {Store, useStore} from "@/store";
import {ActionTypes} from "@/store/action-types";
import {LiveAtlasTileLayer, LiveAtlasTileLayerOptions} from "@/leaflet/tileLayer/LiveAtlasTileLayer";


// noinspection JSUnusedGlobalSymbols
export class DynmapTileLayer extends LiveAtlasTileLayer {
	private readonly _namedTiles: Map<any, any>;
	private readonly _store: Store = useStore();

	private readonly _night: ComputedRef<boolean>;
	private readonly _pendingUpdates: ComputedRef<boolean>;
	private _nightUnwatch: WatchStopHandle | null = null;
	private _updateUnwatch: WatchStopHandle | null = null;

	// Tile updates come in one shared queue for every Dynmap tile layer on the map (the base map and
	// any overlays). It is drained once, and each update is offered to every such layer: layers that
	// drained it separately raced each other, and each threw away the updates for the others' tiles.
	private static readonly _active: Set<DynmapTileLayer> = new Set();
	private static _updateFrame: number = 0;

	constructor(options: LiveAtlasTileLayerOptions) {
		super(options);

		this._namedTiles = Object.seal(new Map());
		this._pendingUpdates = computed(() => !!this._store.state.pendingTileUpdates.length);
		this._night = computed(() => this._store.getters.night);
	}

	onAdd(map: LeafletMap) {
		super.onAdd(map);

		DynmapTileLayer._active.add(this);

		this._updateUnwatch = watch(this._pendingUpdates, (newValue, oldValue) => {
			if(newValue && !oldValue && !DynmapTileLayer._updateFrame) {
				DynmapTileLayer.handlePendingUpdates(this._store);
			}
		});

		this._nightUnwatch = watch(this._night, () =>  {
			if(this.options.nightAndDay) {
				this.redraw();
			}
		});

		return this;
	}

	private getTileName(coords: Coordinate) {
		const info = this.getTileInfo(coords);
		// Y is inverted for HD-map.
		info.y = -info.y;
		info.scaledy = info.y >> 5;
		return `${info.prefix}${info.nightday}/${info.scaledx}_${info.scaledy}/${info.zoom}${info.x}_${info.y}.${info.fmt}`;
	}

	getTileUrl(coords: Coordinate) {
		return this.getTileUrlFromName(this.getTileName(coords));
	}

	private getTileUrlFromName(name: string, timestamp?: number) {
		let url = this.options.baseUrl + name;

		if(typeof timestamp !== 'undefined') {
			url += (url.indexOf('?') === -1 ? `?timestamp=${timestamp}` : `&timestamp=${timestamp}`);
		}

		return url;
	}

	private updateNamedTile(name: string, timestamp: number) {
		const tile = this._namedTiles.get(name);

		if (tile) {
			// The tile is fetched from tile.url, so the timestamped URL has to go there to get the new
			// image past the browser cache. The old image stays visible until the new one has loaded,
			// rather than the tile going blank for the reload.
			tile.url = this.getTileUrlFromName(name, timestamp);

			if(!this.loadQueue.includes(tile)) {
				this.loadQueue.push(tile);
			}

			this.tickLoadQueue();
		}
	}

	createTile(coords: Coords, done: DoneCallback) {
		const tile = super.createTile(coords, done);

		tile.tileName = this.getTileName(coords);
		this._namedTiles.set(tile.tileName, tile);

		return tile;
	}

	// stops loading all tiles in the background layer
	_abortLoading() {
		let tile;

		for (const i in this._tiles) {
			if (!Object.prototype.hasOwnProperty.call(this._tiles, i)) {
				continue;
			}

			tile = this._tiles[i];

			// Drop _namedTiles for any different-zoom tile here, loaded or
			// not. super._abortLoading deletes incomplete tiles from
			// this._tiles directly, bypassing our _removeTile override —
			// so without this cleanup their _namedTiles entry orphans
			// (holding a reference to a now-detached <img>). Loaded
			// different-zoom tiles still get removed via _removeTile
			// during the subsequent pruning pass, so deleting them here
			// is just redundant, not wrong.
			if (tile.coords.z !== this._tileZoom && tile.el && tile.el.tileName) {
				this._namedTiles.delete(tile.el.tileName);
			}
		}

		super._abortLoading.call(this);
	}

	_removeTile(key: string) {
		const tile = this._tiles[key];

		if (!tile) {
			return;
		}

		const tileName = tile.el.tileName as string;

		if (tileName) {
			this._namedTiles.delete(tileName);
		}

		// @ts-ignore
		super._removeTile.call(this, key);
	}

	// Some helper functions.
	private zoomprefix(amount: number) {
		// amount == 0 -> ''
		// amount == 1 -> 'z_'
		// amount == 2 -> 'zz_'
		return 'z'.repeat(amount) + (amount === 0 ? '' : '_');
	}

	private getTileInfo(coords: Coordinate2D): TileInformation {
		// zoom: max zoomed in = this.options.maxZoom, max zoomed out = 0
		// izoom: max zoomed in = 0, max zoomed out = this.options.maxZoom
		// zoomoutlevel: izoom < mapzoomin -> 0, else -> izoom - mapzoomin (which ranges from 0 till mapzoomout)
		const izoom = this._getZoomForUrl(),
			zoomoutlevel = Math.max(0, izoom - (this.options.extraZoomLevels || 0)),
			scale = (1 << zoomoutlevel),
			x = scale * coords.x,
			y = scale * coords.y;

		return {
			prefix: encodeURIComponent(this.options.prefix || ''),
			nightday: (this.options.nightAndDay && !this._night.value) ? '_day' : '',
			scaledx: x >> 5,
			scaledy: y >> 5,
			zoom: this.zoomprefix(zoomoutlevel),
			zoomprefix: (zoomoutlevel == 0) ? "" : (this.zoomprefix(zoomoutlevel) + "_"),
			x: x,
			y: y,
			fmt: this.options.imageFormat || 'png'
		};
	}

	private static async handlePendingUpdates(store: Store) {
		DynmapTileLayer._updateFrame = 0;

		if(!DynmapTileLayer._active.size) {
			return;
		}

		const updates = await store.dispatch(ActionTypes.POP_TILE_UPDATES, 10);

		for(const update of updates) {
			DynmapTileLayer._active.forEach(layer => layer.updateNamedTile(update.name, update.timestamp));
		}

		if(store.state.pendingTileUpdates.length && DynmapTileLayer._active.size) {
			DynmapTileLayer._updateFrame = requestAnimationFrame(() => DynmapTileLayer.handlePendingUpdates(store));
		}
	}

	// Torn down here rather than in remove(): overlays switched off from the layer control are only
	// removed from the map, and kept watching (and draining) tile updates from then on
	onRemove(map: LeafletMap): this {
		DynmapTileLayer._active.delete(this);

		if(!DynmapTileLayer._active.size && DynmapTileLayer._updateFrame) {
			cancelAnimationFrame(DynmapTileLayer._updateFrame);
			DynmapTileLayer._updateFrame = 0;
		}

		this._nightUnwatch?.();
		this._nightUnwatch = null;
		this._updateUnwatch?.();
		this._updateUnwatch = null;

		return super.onRemove(map);
	}
}

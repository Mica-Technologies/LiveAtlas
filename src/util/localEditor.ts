/*
 * Copyright 2022 James Lyne
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

import {Coordinate} from "@/index";

export type LocalEditorMarkerType = 'point' | 'area' | 'line' | 'circle';

interface LocalEditorMarkerBase {
	id: string;
	worldName: string;
	setId: string;
	label: string;
	description?: string;
}

export interface LocalEditorPointMarker extends LocalEditorMarkerBase {
	type: 'point';
	iconId: string;
	location: Coordinate;
}

export interface PathStyle {
	lineColor: string;     // #rrggbb
	lineOpacity: number;   // 0-1
	lineWeight: number;    // px
	fillColor: string;
	fillOpacity: number;
}

export interface LocalEditorAreaMarker extends LocalEditorMarkerBase {
	type: 'area';
	points: Coordinate[];
	style: PathStyle;
}

export interface LocalEditorLineMarker extends LocalEditorMarkerBase {
	type: 'line';
	points: Coordinate[];
	style: PathStyle;
}

export interface LocalEditorCircleMarker extends LocalEditorMarkerBase {
	type: 'circle';
	center: Coordinate;
	radiusX: number;
	radiusZ: number;
	style: PathStyle;
}

export type LocalEditorMarker =
	| LocalEditorPointMarker
	| LocalEditorAreaMarker
	| LocalEditorLineMarker
	| LocalEditorCircleMarker;

const STORAGE_KEY = 'liveatlas-local-editor';
const STORAGE_VERSION = 2;

interface PersistedLocalEditor {
	version: number;
	markers: LocalEditorMarker[];
}

const isCoordinate = (v: unknown): v is Coordinate => {
	return !!v && typeof v === 'object'
		&& typeof (v as Coordinate).x === 'number'
		&& typeof (v as Coordinate).y === 'number'
		&& typeof (v as Coordinate).z === 'number';
};

const isValidMarker = (m: unknown): m is LocalEditorMarker => {
	if(!m || typeof m !== 'object') return false;
	const base = m as Partial<LocalEditorMarkerBase> & {type?: string};
	if(typeof base.id !== 'string' || typeof base.worldName !== 'string'
		|| typeof base.setId !== 'string' || typeof base.label !== 'string') return false;

	switch(base.type) {
		case 'point':
			return isCoordinate((m as LocalEditorPointMarker).location)
				&& typeof (m as LocalEditorPointMarker).iconId === 'string';
		case 'area':
		case 'line':
			return Array.isArray((m as LocalEditorAreaMarker).points)
				&& (m as LocalEditorAreaMarker).points.every(isCoordinate);
		case 'circle':
			return isCoordinate((m as LocalEditorCircleMarker).center)
				&& typeof (m as LocalEditorCircleMarker).radiusX === 'number'
				&& typeof (m as LocalEditorCircleMarker).radiusZ === 'number';
	}
	return false;
};

export const loadPersisted = (): LocalEditorMarker[] => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as PersistedLocalEditor;
		if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.markers)) return [];
		return parsed.markers.filter(isValidMarker);
	} catch (e) {
		console.warn('Failed to load saved local editor markers', e);
		return [];
	}
};

export const savePersisted = (markers: LocalEditorMarker[]): void => {
	const data: PersistedLocalEditor = {version: STORAGE_VERSION, markers};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const clearPersisted = (): void => {
	localStorage.removeItem(STORAGE_KEY);
};

export const generateMarkerId = (existing: Iterable<LocalEditorMarker>): string => {
	let maxNum = 0;
	for (const m of existing) {
		const match = m.id.match(/^localmarker_(\d+)$/);
		if (match) {
			const n = parseInt(match[1], 10);
			if (n > maxNum) maxNum = n;
		}
	}
	return `localmarker_${maxNum + 1}`;
};

export const DEFAULT_STYLE: PathStyle = {
	lineColor: '#ff8800',
	lineOpacity: 0.85,
	lineWeight: 3,
	fillColor: '#ff8800',
	fillOpacity: 0.25,
};

// Dynmap stock icons (https://dynmap.wiki.gg/wiki/Icons). Used to populate
// the icon suggestion list — users can still type any server-installed icon ID.
export const DEFAULT_ICON_IDS = [
	'anchor', 'bank', 'basket', 'beer', 'bell', 'bighouse', 'blueflag', 'bomb',
	'bookshelf', 'bricks', 'bronzemedal', 'bronzestar', 'building', 'cake',
	'camera', 'cart', 'caution', 'chest', 'church', 'coins', 'comment', 'compass',
	'construction', 'cross', 'cup', 'cutlery', 'default', 'diamond', 'dog',
	'door', 'down', 'drink', 'exclamation', 'factory', 'fire', 'flag', 'flower',
	'gear', 'goldmedal', 'goldstar', 'greenflag', 'hammer', 'heart', 'house',
	'key', 'king', 'left', 'lightbulb', 'lighthouse', 'lock', 'minecart',
	'orangeflag', 'pin', 'pinkflag', 'pirateflag', 'pointdown', 'pointleft',
	'pointright', 'pointup', 'portal', 'purpleflag', 'queen', 'redflag', 'right',
	'ruby', 'scales', 'shield', 'sign', 'silvermedal', 'silverstar', 'skull',
	'star', 'sun', 'temple', 'theater', 'tornado', 'tower', 'tree', 'truck',
	'up', 'walk', 'warning', 'world', 'yellowflag',
];

const needsQuoting = (value: string): boolean => /\s|"/.test(value);

const quoteArg = (value: string): string => {
	if (!value.length) return '""';
	if (needsQuoting(value)) {
		return `"${value.replace(/"/g, '\\"')}"`;
	}
	return value;
};

const quoteAlways = (value: string): string => `"${value.replace(/"/g, '\\"')}"`;

// Strip leading "#" so Dynmap accepts the hex color
const hexColor = (value: string): string => value.replace(/^#/, '');

const round = (n: number): number => Math.round(n);

export interface CommandGenerationOptions {
	// Marker set IDs that already exist on the server. Any pending marker
	// targeting a set not in this collection will get an /addset command
	// emitted first.
	existingSetIds: Set<string>;
}

const emitPoint = (m: LocalEditorPointMarker): string => {
	return [
		'/dmarker add',
		`id:${m.id}`,
		quoteArg(m.label || m.id),
		`icon:${m.iconId}`,
		`set:${m.setId}`,
		`x:${round(m.location.x)}`,
		`y:${round(m.location.y)}`,
		`z:${round(m.location.z)}`,
		`world:${m.worldName}`,
	].join(' ');
};

const emitCorners = (points: Coordinate[], world: string): string[] => {
	const lines: string[] = ['/dmarker clearcorners'];
	for (const p of points) {
		lines.push(`/dmarker addcorner ${round(p.x)} ${round(p.y)} ${round(p.z)} ${world}`);
	}
	return lines;
};

const emitAreaOrLine = (kind: 'area' | 'line', m: LocalEditorAreaMarker | LocalEditorLineMarker): string[] => {
	const lines = emitCorners(m.points, m.worldName);
	lines.push([
		`/dmarker add${kind}`,
		`id:${m.id}`,
		quoteArg(m.label || m.id),
		`set:${m.setId}`,
	].join(' '));

	const style = m.style;
	const updateParts = [
		`/dmarker update${kind}`,
		`id:${m.id}`,
		`set:${m.setId}`,
		`color:${hexColor(style.lineColor)}`,
		`opacity:${style.lineOpacity}`,
		`weight:${style.lineWeight}`,
	];
	if (kind === 'area') {
		updateParts.push(`fillcolor:${hexColor(style.fillColor)}`, `fillopacity:${style.fillOpacity}`);
	}
	lines.push(updateParts.join(' '));
	return lines;
};

const emitCircle = (m: LocalEditorCircleMarker): string[] => {
	const lines: string[] = [];
	lines.push([
		'/dmarker addcircle',
		`id:${m.id}`,
		quoteArg(m.label || m.id),
		`set:${m.setId}`,
		`x:${round(m.center.x)}`,
		`y:${round(m.center.y)}`,
		`z:${round(m.center.z)}`,
		`world:${m.worldName}`,
		`radiusx:${round(m.radiusX)}`,
		`radiusz:${round(m.radiusZ)}`,
	].join(' '));

	const s = m.style;
	lines.push([
		'/dmarker updatecircle',
		`id:${m.id}`,
		`set:${m.setId}`,
		`color:${hexColor(s.lineColor)}`,
		`opacity:${s.lineOpacity}`,
		`weight:${s.lineWeight}`,
		`fillcolor:${hexColor(s.fillColor)}`,
		`fillopacity:${s.fillOpacity}`,
	].join(' '));
	return lines;
};

export const generateCommands = (
	markers: LocalEditorMarker[],
	options: CommandGenerationOptions,
): string[] => {
	const lines: string[] = [];
	const declaredSets = new Set<string>();

	for (const m of markers) {
		if (!options.existingSetIds.has(m.setId) && !declaredSets.has(m.setId)) {
			lines.push(`/dmarker addset id:${m.setId} ${quoteArg(m.setId)}`);
			declaredSets.add(m.setId);
		}
	}

	for (const m of markers) {
		switch (m.type) {
			case 'point':
				lines.push(emitPoint(m));
				break;
			case 'area':
				lines.push(...emitAreaOrLine('area', m));
				break;
			case 'line':
				lines.push(...emitAreaOrLine('line', m));
				break;
			case 'circle':
				lines.push(...emitCircle(m));
				break;
		}

		if (m.description && m.description.trim()) {
			lines.push(`/dmarker appenddesc id:${m.id} set:${m.setId} desc:${quoteAlways(m.description)}`);
		}
	}

	return lines;
};

// Factory helpers used by the right-click context menu when seeding a new
// shape at a given location. Each provides sensible defaults the user can
// then refine in the editor form.

export const createDefaultPoint = (
	id: string, worldName: string, setId: string, location: Coordinate,
): LocalEditorPointMarker => ({
	type: 'point',
	id, worldName, setId,
	label: '',
	iconId: 'default',
	location,
});

const defaultStyle = (): PathStyle => ({...DEFAULT_STYLE});

export const createDefaultArea = (
	id: string, worldName: string, setId: string, center: Coordinate, size = 20,
): LocalEditorAreaMarker => {
	const half = size / 2;
	return {
		type: 'area',
		id, worldName, setId,
		label: '',
		points: [
			{x: center.x - half, y: center.y, z: center.z - half},
			{x: center.x + half, y: center.y, z: center.z - half},
			{x: center.x + half, y: center.y, z: center.z + half},
			{x: center.x - half, y: center.y, z: center.z + half},
		],
		style: defaultStyle(),
	};
};

export const createDefaultLine = (
	id: string, worldName: string, setId: string, center: Coordinate, size = 20,
): LocalEditorLineMarker => {
	const half = size / 2;
	return {
		type: 'line',
		id, worldName, setId,
		label: '',
		points: [
			{x: center.x - half, y: center.y, z: center.z},
			{x: center.x + half, y: center.y, z: center.z},
		],
		style: defaultStyle(),
	};
};

export const createDefaultCircle = (
	id: string, worldName: string, setId: string, center: Coordinate, radius = 15,
): LocalEditorCircleMarker => ({
	type: 'circle',
	id, worldName, setId,
	label: '',
	center,
	radiusX: radius,
	radiusZ: radius,
	style: defaultStyle(),
});

// "Begin drawing" factories — these seed the marker with the minimum data
// needed to enter drawing mode, where subsequent map clicks supply the rest.

export const startArea = (
	id: string, worldName: string, setId: string, first: Coordinate,
): LocalEditorAreaMarker => ({
	type: 'area',
	id, worldName, setId,
	label: '',
	points: [first],
	style: defaultStyle(),
});

export const startLine = (
	id: string, worldName: string, setId: string, first: Coordinate,
): LocalEditorLineMarker => ({
	type: 'line',
	id, worldName, setId,
	label: '',
	points: [first],
	style: defaultStyle(),
});

export const startCircle = (
	id: string, worldName: string, setId: string, center: Coordinate,
): LocalEditorCircleMarker => ({
	type: 'circle',
	id, worldName, setId,
	label: '',
	center,
	radiusX: 0,
	radiusZ: 0,
	style: defaultStyle(),
});

// Collects every "interesting" vertex from existing pending markers in the
// given world: point markers' locations, polygon/line vertices, and circle
// centers. Used by snapping.
export const collectSnapTargets = (markers: LocalEditorMarker[], worldName: string): Coordinate[] => {
	const out: Coordinate[] = [];
	for (const m of markers) {
		if (m.worldName !== worldName) continue;
		switch (m.type) {
			case 'point':  out.push(m.location); break;
			case 'circle': out.push(m.center); break;
			case 'area':
			case 'line':   out.push(...m.points); break;
		}
	}
	return out;
};

// Returns the nearest target within `threshold` 2D blocks (XZ), or null.
// We ignore Y because Dynmap markers are placed at a chosen elevation that
// often differs from where the user is clicking.
export const findSnapTarget = (
	point: Coordinate, targets: Coordinate[], threshold = 3,
): Coordinate | null => {
	let best: Coordinate | null = null;
	let bestDist = threshold;
	for (const t of targets) {
		const dx = t.x - point.x;
		const dz = t.z - point.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist <= bestDist) {
			bestDist = dist;
			best = t;
		}
	}
	return best;
};

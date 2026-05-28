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

import {
	Coordinate,
	LiveAtlasWorldState,
	LiveAtlasServerDefinition,
	LiveAtlasSidebarSection,
	LiveAtlasSortedPlayers,
	LiveAtlasUIElement,
	LiveAtlasWorldDefinition,
	LiveAtlasParsedUrl,
	LiveAtlasMessageConfig,
	LiveAtlasMapProvider,
	LiveAtlasPlayer,
	LiveAtlasMarkerSet,
	LiveAtlasComponentConfig,
	LiveAtlasServerConfig,
	LiveAtlasChat,
	LiveAtlasUIModal,
	LiveAtlasSidebarSectionState,
	LiveAtlasMarker, LiveAtlasMapViewTarget, LiveAtlasBookmark
} from "@/index";
import {
	DynmapMarkerUpdate,
	DynmapTileUpdate
} from "@/dynmap";
import LiveAtlasMapDefinition from "@/model/LiveAtlasMapDefinition";
import {getMessages} from "@/util";
import {getDefaultPlayerImage} from "@/util/images";
import {LocalEditorMarker, LocalEditorSet} from "@/util/localEditor";

const BOOKMARKS_STORAGE_KEY = 'liveatlas.bookmarks';

// Bookmarks live in localStorage so they survive page reloads. Read once
// at module load; the persistence subscription in main.ts writes back on
// every mutation.
const loadStoredBookmarks = (): LiveAtlasBookmark[] => {
	try {
		const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
		if(!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

export {BOOKMARKS_STORAGE_KEY};

export type LocalEditorDrawingKind = 'area' | 'line' | 'circle-radius';
export type LocalEditorPickTarget = 'line' | 'fill';

export interface LocalEditorState {
	active: boolean;
	markers: LocalEditorMarker[];
	sets: LocalEditorSet[];
	selectedId?: string;
	commandsModalOpen: boolean;
	menu: {
		open: boolean;
		x: number;
		y: number;
	};
	drawing?: {
		id: string;
		kind: LocalEditorDrawingKind;
	};
	picking?: {
		markerId: string;
		target: LocalEditorPickTarget;
	};
	snapEnabled: boolean;
	// Last in-game coords the cursor was hovered over. Published from the
	// editor layer's mousemove and read by the editor panel so the user
	// can see coords even when the bottom-left control is covered.
	hoverLocation?: Coordinate;
	// Show numeric labels on every area/line vertex, not just the selected
	// marker's vertices. Helps cross-reference between map and form.
	showVertexNumbers: boolean;
}

export type State = {
	version: string;
	firstLoad: boolean;
	initialTitle: string;

	servers: Map<string, LiveAtlasServerDefinition>;
	configuration: LiveAtlasServerConfig;
	configurationHash: number | undefined;
	messages: LiveAtlasMessageConfig;
	components: LiveAtlasComponentConfig;

	loggedIn: boolean;
	loginRequired: boolean;

	worlds: Map<string, LiveAtlasWorldDefinition>;
	maps: Map<string, LiveAtlasMapDefinition>;
	players: Map<string, LiveAtlasPlayer>;
	sortedPlayers: LiveAtlasSortedPlayers;
	maxPlayers: number;
	markerSets: Map<string, LiveAtlasMarkerSet>;
	// Live visibility state for marker-set overlays (true = currently
	// visible on the map). Updated by MarkerSetLayer on mount and on
	// Leaflet overlayadd/overlayremove. Read at link-generation time so
	// a shared URL can encode the visible layers.
	markerSetVisibility: Map<string, boolean>;
	// One-shot visibility override applied from a URL on load. While
	// defined, marker-set layers use this list instead of their server
	// default `hidden` flag. Cleared on app navigation to avoid stale
	// state on subsequent server/world switches.
	urlVisibleLayers?: string[];

	chat: {
		unread: number;
		messages: LiveAtlasChat[];
	};

	pendingMarkerUpdates: DynmapMarkerUpdate[];
	pendingTileUpdates: Array<DynmapTileUpdate>;

	followTarget?: LiveAtlasPlayer;
	viewTarget?: LiveAtlasMapViewTarget;
	pingTarget?: { setId: string; markerId: string; nonce: number };
	bookmarks: LiveAtlasBookmark[];

	currentMapProvider?: Readonly<LiveAtlasMapProvider>;
	currentServer?: LiveAtlasServerDefinition;
	currentWorldState: LiveAtlasWorldState;
	currentWorld?: LiveAtlasWorldDefinition;
	currentMap?: LiveAtlasMapDefinition;
	currentLocation: Coordinate;
	currentZoom: number;

	ui: {
		playersAboveMarkers: boolean;
		playersSearch: boolean;
		compactPlayerMarkers: boolean;
		disableContextMenu: boolean;
		disableMarkerUI: boolean;
		customLoginUrl: string | null;

		screenWidth: number;
		screenHeight: number;
		smallScreen: boolean;
		visibleElements: Set<LiveAtlasUIElement>;
		visibleModal?: LiveAtlasUIModal;
		previouslyVisibleElements: Set<LiveAtlasUIElement>;

		sidebar: {
			[K in LiveAtlasSidebarSection]: LiveAtlasSidebarSectionState
		};

		// When true, panels use the opaque surface (--background-base-solid,
		// no backdrop-filter) at all times instead of only during a map
		// drag. User preference, persisted to localStorage. Useful on
		// low-end GPUs or when the user finds the glass treatment
		// distracting.
		alwaysOpaque: boolean;
	};

	parsedUrl?: LiveAtlasParsedUrl;

	localEditor: LocalEditorState;
}

export const state: State = {
	version: (process.env.VITE_APP_VERSION || 'Unknown') as string,
	firstLoad: true,
	initialTitle: document.title,

	servers: new Map(),

	configuration: {
		defaultMap: '',
		defaultWorld: '',
		defaultZoom: 0,
		followMap: '',
		followZoom: 0,
		title: '',
		expandUI: false,
		singleMapWorlds: false,
	},
	configurationHash: undefined,

	messages: getMessages(),

	loggedIn: false,
	loginRequired: false,

	worlds: new Map(), //Defined (loaded) worlds with maps from configuration.json
	maps: new Map(), //Defined maps from configuration.json
	players: new Map(), //Online players from world.json
	sortedPlayers: [] as LiveAtlasSortedPlayers, //Online players from world.json, sorted by their sort property then alphabetically
	maxPlayers: 0,

	chat: {
		unread: 0,
		messages: [],
	},

	markerSets: new Map(), //Marker sets from world_markers.json, doesn't include the markers themselves for performance reasons
	markerSetVisibility: new Map(),
	urlVisibleLayers: undefined,

	pendingMarkerUpdates: [],  //Pending updates to markers/areas/etc
	pendingTileUpdates: [], //Pending updates to map tiles

	// Map plugin provided settings for various parts of LiveAtlas
	components: {
		// Settings for markers
		// (markers component in Dynmap)
		markers: {
			showLabels: false,
		},

		// Settings for player related UI elements and markers
		players: {
			// Settings for online player markers
			// (playermarkers component in Dynmap, world-settings.x.player-tracker in squaremap)
			// If not present, player markers will be disabled
			markers: undefined,

			grayHiddenPlayers: true,

			// ("showplayerfacesinmenu" setting in dynmap)
			showImages: false,

			// (world-settings.x.player-tracker.heads-url in squaremap)
			imageUrl: getDefaultPlayerImage,
		},

		// Settings for coordinates control
		// ("coords" component in dynmap, settings.ui.coordinates in squaremap)
		// Adds control showing coordinates on map mouseover
		coordinatesControl: undefined,

		// Settings for world time/weather clock
		// ("digitalclock"/"timeofdayclock" components in dynmap)
		clockControl: undefined,

		// Settings for copy URL button
		// ("link" component in dynmap, settings.ui.link in squaremap)
		linkControl: false,

		// Enabled state of map layer control
		// ("showlayercontrol" setting in dynmap)
		layerControl: false,

		// Settings for additional controls containing arbitrary text, images and links
		// ("logo" components in dynmap)
		logoControls: [],

		// Settings for chat message sending functionality
		// ("chat" component in dynmap)
		chatSending: undefined,

		// Settings for chat box
		// ("chatbox" component in dynmap)
		chatBox: undefined,

		// Enabled state of player chat balloons
		// ("chatballoon" component in dynmap)
		chatBalloons: false,

		// Enabled state of login/registration functionality
		// ("login-enabled" setting in dynmap)
		login: false,
	},

	followTarget: undefined,
	viewTarget: undefined,
	pingTarget: undefined,
	bookmarks: loadStoredBookmarks(),

	currentMapProvider: undefined,
	currentServer: undefined,
	currentWorld: undefined,
	currentMap: undefined,
	currentLocation: {
		x: 0,
		y: 0,
		z: 0,
	},
	currentZoom: 0,
	currentWorldState: {
		raining: false,
		thundering: false,
		timeOfDay: 0,
	},

	ui: {
		playersAboveMarkers: true,
		playersSearch: true,
		compactPlayerMarkers: false,
		disableContextMenu: false,
		disableMarkerUI: false,
		customLoginUrl: null,

		screenWidth: window.innerWidth,
		screenHeight: window.innerHeight,
		smallScreen: false,
		visibleElements: new Set(),
		visibleModal: undefined,
		previouslyVisibleElements: new Set(),

		sidebar: {
			servers: {},
			players: {},
			maps: {},
			markers: {},
		},

		// Default off — glass treatment applies at rest, opaque only during
		// drag. SET_UI_CONFIGURATION reads any persisted user preference
		// from uiSettings on app load.
		alwaysOpaque: false,
	},

	localEditor: {
		active: false,
		markers: [],
		sets: [],
		selectedId: undefined,
		commandsModalOpen: false,
		menu: {open: false, x: 0, y: 0},
		drawing: undefined,
		picking: undefined,
		snapEnabled: true,
		hoverLocation: undefined,
		showVertexNumbers: false,
	},
};

export const nonReactiveState = Object.freeze({
	markers: new Map<string, Map<string, LiveAtlasMarker>>(),
});

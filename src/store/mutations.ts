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

import {MutationTree} from "vuex";
import {
	Coordinate,
	LiveAtlasWorldState,
	LiveAtlasSidebarSection,
	LiveAtlasSortedPlayers,
	LiveAtlasUIElement,
	LiveAtlasWorldDefinition,
	LiveAtlasParsedUrl,
	LiveAtlasServerMessageConfig,
	LiveAtlasPlayer,
	LiveAtlasMarkerSet,
	LiveAtlasServerConfig,
	LiveAtlasChat,
	LiveAtlasPartialComponentConfig,
	LiveAtlasComponentConfig,
	LiveAtlasUIModal,
	LiveAtlasSidebarSectionState,
	LiveAtlasMarker,
	LiveAtlasMapViewTarget,
	LiveAtlasGlobalMessageConfig,
	LiveAtlasUIConfig, LiveAtlasServerDefinition
} from "@/index";
import {
	DynmapMarkerSetUpdate, DynmapMarkerUpdate,
	DynmapTileUpdate
} from "@/dynmap";
import {MutationTypes} from "@/store/mutation-types";
import {nonReactiveState, State} from "@/store/state";
import {getServerMapProvider} from "@/util/config";
import {getDefaultPlayerImage} from "@/util/images";
import {
	clearPersisted as clearPersistedLocalEditor,
	liveAtlasToLocalEditor,
	loadPersisted as loadPersistedLocalEditor,
	LocalEditorMarker,
	LocalEditorSet,
	savePersisted as savePersistedLocalEditor,
} from "@/util/localEditor";

export type CurrentMapPayload = {
	worldName: string;
	mapName: string;
}

export type Mutations<S = State> = {
	[MutationTypes.SET_UI_CONFIGURATION](state: S, config: LiveAtlasUIConfig): void
	[MutationTypes.SET_SERVERS](state: S, config: Map<string, LiveAtlasServerDefinition>): void
	[MutationTypes.SET_SERVER_CONFIGURATION](state: S, config: LiveAtlasServerConfig): void
	[MutationTypes.SET_SERVER_CONFIGURATION_HASH](state: S, hash: number): void
	[MutationTypes.SET_MESSAGES](state: S, messages: LiveAtlasGlobalMessageConfig|LiveAtlasServerMessageConfig): void
	[MutationTypes.SET_WORLDS](state: S, worlds: Array<LiveAtlasWorldDefinition>): void
	[MutationTypes.SET_COMPONENTS](state: S, components: LiveAtlasPartialComponentConfig | LiveAtlasComponentConfig): void
	[MutationTypes.SET_MARKER_SETS](state: S, markerSets: Map<string, LiveAtlasMarkerSet>): void
	[MutationTypes.SET_MARKER_SET_VISIBILITY](state: S, payload: {id: string, visible: boolean}): void
	[MutationTypes.SET_URL_VISIBLE_LAYERS](state: S, layers: string[] | undefined): void
	[MutationTypes.SET_MARKERS](state: S, markers: Map<string, Map<string, LiveAtlasMarker>>): void
	[MutationTypes.SET_WORLD_STATE](state: S, worldState: LiveAtlasWorldState): void
	[MutationTypes.ADD_MARKER_SET_UPDATES](state: S, updates: DynmapMarkerSetUpdate[]): void
	[MutationTypes.ADD_MARKER_UPDATES](state: S, updates: DynmapMarkerUpdate[]): void
	[MutationTypes.ADD_TILE_UPDATES](state: S, updates: Array<DynmapTileUpdate>): void
	[MutationTypes.ADD_CHAT](state: State, chat: Array<LiveAtlasChat>): void

	[MutationTypes.POP_MARKER_UPDATES](state: S, amount: number): void
	[MutationTypes.POP_TILE_UPDATES](state: S, amount: number): void

	[MutationTypes.SET_MAX_PLAYERS](state: S, maxPlayers: number): void
	[MutationTypes.SET_PLAYERS_ASYNC](state: S, players: Set<LiveAtlasPlayer>): Set<LiveAtlasPlayer>
	[MutationTypes.SYNC_PLAYERS](state: S, keep: Set<string>): void
	[MutationTypes.SET_LOADED](state: S, a?: void): void
	[MutationTypes.SET_CURRENT_SERVER](state: S, server: string): void
	[MutationTypes.SET_CURRENT_MAP](state: S, payload: CurrentMapPayload): void
	[MutationTypes.SET_CURRENT_LOCATION](state: S, payload: Coordinate): void
	[MutationTypes.SET_CURRENT_ZOOM](state: S, payload: number): void
	[MutationTypes.SET_PARSED_URL](state: S, payload: LiveAtlasParsedUrl): void
	[MutationTypes.CLEAR_PARSED_URL](state: S): void
	[MutationTypes.SET_FOLLOW_TARGET](state: S, payload: LiveAtlasPlayer): void
	[MutationTypes.SET_VIEW_TARGET](state: S, payload: LiveAtlasMapViewTarget): void
	[MutationTypes.CLEAR_FOLLOW_TARGET](state: S, a?: void): void
	[MutationTypes.CLEAR_VIEW_TARGET](state: S, a?: void): void

	[MutationTypes.SET_SCREEN_SIZE](state: S, payload: {width: number, height: number}): void
	[MutationTypes.TOGGLE_UI_ELEMENT_VISIBILITY](state: S, payload: LiveAtlasUIElement): void
	[MutationTypes.SET_UI_ELEMENT_VISIBILITY](state: S, payload: {element: LiveAtlasUIElement, state: boolean}): void
	[MutationTypes.SHOW_UI_MODAL](state: S, payload: LiveAtlasUIModal): void
	[MutationTypes.HIDE_UI_MODAL](state: S, payload: LiveAtlasUIModal): void

	[MutationTypes.TOGGLE_SIDEBAR_SECTION_COLLAPSED_STATE](state: S, section: LiveAtlasSidebarSection): void

	[MutationTypes.SET_LOGGED_IN](state: S, payload: boolean): void
	[MutationTypes.SET_LOGIN_REQUIRED](state: S, payload: boolean): void

	[MutationTypes.LOCAL_EDITOR_SET_ACTIVE](state: S, active: boolean): void
	[MutationTypes.LOCAL_EDITOR_ADD_MARKER](state: S, marker: LocalEditorMarker): void
	[MutationTypes.LOCAL_EDITOR_UPDATE_MARKER](state: S, payload: {id: string, patch: Partial<LocalEditorMarker>}): void
	[MutationTypes.LOCAL_EDITOR_DELETE_MARKER](state: S, id: string): void
	[MutationTypes.LOCAL_EDITOR_SELECT_MARKER](state: S, id: string | undefined): void
	[MutationTypes.LOCAL_EDITOR_CLEAR_MARKERS](state: S): void
	[MutationTypes.LOCAL_EDITOR_HYDRATE](state: S): void
	[MutationTypes.LOCAL_EDITOR_PERSIST](state: S): void
	[MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL](state: S, open: boolean): void
	[MutationTypes.LOCAL_EDITOR_OPEN_MENU](state: S, payload: {x: number, y: number}): void
	[MutationTypes.LOCAL_EDITOR_CLOSE_MENU](state: S): void
	[MutationTypes.LOCAL_EDITOR_BEGIN_EDIT](state: S, payload: {setId: string, markerId: string, worldName: string}): void
	[MutationTypes.LOCAL_EDITOR_QUEUE_DELETE](state: S, payload: {setId: string, markerId: string, worldName: string}): void
	[MutationTypes.LOCAL_EDITOR_TOGGLE_DELETE](state: S, id: string): void
	[MutationTypes.LOCAL_EDITOR_DISCARD_EDIT](state: S, id: string): void
	[MutationTypes.LOCAL_EDITOR_START_DRAWING](state: S, payload: {id: string, kind: 'area' | 'line' | 'circle-radius'}): void
	[MutationTypes.LOCAL_EDITOR_FINISH_DRAWING](state: S): void
	[MutationTypes.LOCAL_EDITOR_START_PICKING](state: S, payload: {markerId: string, target: 'line' | 'fill'}): void
	[MutationTypes.LOCAL_EDITOR_FINISH_PICKING](state: S): void
	[MutationTypes.LOCAL_EDITOR_SET_SNAP](state: S, enabled: boolean): void
	[MutationTypes.LOCAL_EDITOR_SET_HOVER_LOCATION](state: S, location: Coordinate | undefined): void
	[MutationTypes.LOCAL_EDITOR_SET_SHOW_VERTEX_NUMBERS](state: S, enabled: boolean): void
	[MutationTypes.LOCAL_EDITOR_ADD_SET](state: S, set: LocalEditorSet): void
	[MutationTypes.LOCAL_EDITOR_UPDATE_SET](state: S, payload: {id: string, patch: Partial<LocalEditorSet>}): void
	[MutationTypes.LOCAL_EDITOR_DELETE_SET](state: S, id: string): void

	[MutationTypes.RESET](state: S): void
}

export const mutations: MutationTree<State> & Mutations = {
	[MutationTypes.SET_UI_CONFIGURATION](state: State, config: LiveAtlasUIConfig) {
		const isEmbedded = new URLSearchParams(window.location.search).has('embedBaseUrl');

		try {
			const uiSettings = JSON.parse(localStorage.getItem('uiSettings') || '{}');

			if(!isEmbedded && uiSettings && uiSettings.sidebar) {
				for(const element in uiSettings.sidebar) {
					const elementState: LiveAtlasSidebarSectionState = uiSettings.sidebar[element];

					if(!elementState) {
						continue;
					}

					if(typeof state.ui.sidebar[element as LiveAtlasSidebarSection] !== 'undefined') {
						state.ui.sidebar[element as LiveAtlasSidebarSection].collapsed = !!elementState.collapsed;
					}
				}
			}
		} catch(e) {
			console.warn('Failed to load saved UI settings', e);
		}

		if(typeof config.playersAboveMarkers === 'boolean') {
			state.ui.playersAboveMarkers = config.playersAboveMarkers;
		}

		if(typeof config.compactPlayerMarkers === 'boolean') {
			state.ui.compactPlayerMarkers = config.compactPlayerMarkers;
		}

		if(typeof config.disableContextMenu === 'boolean') {
			state.ui.disableContextMenu = config.disableContextMenu;
		}

		if(typeof config.disableMarkerUI === 'boolean') {
			state.ui.disableMarkerUI = config.disableMarkerUI;
		}

		if(typeof config.playersSearch === 'boolean') {
			state.ui.playersSearch = config.playersSearch;
		}

		if(typeof config.customLoginUrl === 'string') {
			state.ui.customLoginUrl = config.customLoginUrl;
		}
	},

	// Sets messages from the initial config fetch
	[MutationTypes.SET_MESSAGES](state: State, messages: LiveAtlasServerMessageConfig|LiveAtlasGlobalMessageConfig) {
		state.messages = Object.assign(state.messages, messages);
	},

	[MutationTypes.SET_SERVERS](state: State, servers: Map<string, LiveAtlasServerDefinition>) {
		state.servers = servers;

		if(state.currentServer && !state.servers.has(state.currentServer.id)) {
			state.currentServer = undefined;
		}
	},

	// Sets configuration options from the initial config fetch
	[MutationTypes.SET_SERVER_CONFIGURATION](state: State, config: LiveAtlasServerConfig) {
		state.configuration = Object.assign(state.configuration, config);
	},

	// Sets configuration hash
	[MutationTypes.SET_SERVER_CONFIGURATION_HASH](state: State, hash: number) {
		state.configurationHash = hash;
	},

	//Sets the list of worlds, and their settings, from the initial config fetch
	[MutationTypes.SET_WORLDS](state: State, worlds: Array<LiveAtlasWorldDefinition>) {
		state.worlds.clear();
		state.maps.clear();

		state.followTarget = undefined;
		state.viewTarget = undefined;

		state.currentWorldState.timeOfDay = 0;
		state.currentWorldState.raining = false;
		state.currentWorldState.thundering = false;

		worlds.forEach(world => {
			state.worlds.set(world.name, world);
			world.maps.forEach(map => state.maps.set(`${map.world.name}_${map.name}`, map));
		});

		//Update current world if a world with the same name still exists, otherwise clear
		if(state.currentWorld && state.worlds.has(state.currentWorld.name)) {
			state.currentWorld = state.worlds.get(state.currentWorld.name);
		} else {
			state.currentWorld = undefined;
		}

		//Update current map if a map with the same name still exists, otherwise clear
		if(state.currentWorld && state.currentMap && state.maps.has(`${state.currentWorld.name}_${state.currentMap.name}`)) {
			state.currentMap = state.maps.get(`${state.currentWorld.name}_${state.currentMap.name}`);
		} else {
			state.currentMap = undefined;
		}
	},

	//Updates the state of optional components (chat, link button, etc)
	//Can be called with a LiveAtlasComponentConfig object to replace the whole state
	//or a LiveAtlasPartialComponentConfig object for partial updates to the existing state
	[MutationTypes.SET_COMPONENTS](state: State, components: LiveAtlasPartialComponentConfig | LiveAtlasComponentConfig) {
		state.components = Object.assign(state.components, components);
	},

	[MutationTypes.SET_MARKER_SET_VISIBILITY](state: State, payload: {id: string, visible: boolean}) {
		state.markerSetVisibility.set(payload.id, payload.visible);
	},

	[MutationTypes.SET_URL_VISIBLE_LAYERS](state: State, layers: string[] | undefined) {
		state.urlVisibleLayers = layers && layers.length ? layers : undefined;
	},

	//Sets the existing marker sets from the last marker fetch
	[MutationTypes.SET_MARKER_SETS](state: State, markerSets: Map<string, LiveAtlasMarkerSet>) {
		state.markerSets.clear();
		state.markerSetVisibility.clear();
		state.pendingMarkerUpdates.splice(0);
		nonReactiveState.markers.clear();

		for(const entry of markerSets) {
			state.markerSets.set(entry[0], entry[1]);
			nonReactiveState.markers.set(entry[0], new Map());
		}
	},

	//Sets the existing marker sets from the last marker fetch
	[MutationTypes.SET_MARKERS](state: State, markers: Map<string, Map<string, LiveAtlasMarker>>) {
		nonReactiveState.markers.clear();

		for(const entry of markers) {
			nonReactiveState.markers.set(entry[0], entry[1]);
		}
	},

	//Sets the current world state an update fetch
	[MutationTypes.SET_WORLD_STATE](state: State, worldState: LiveAtlasWorldState) {
		state.currentWorldState = Object.assign(state.currentWorldState, worldState);
	},

	//Adds markerset related updates from an update fetch to the pending updates list
	[MutationTypes.ADD_MARKER_SET_UPDATES](state: State, updates: DynmapMarkerSetUpdate[]) {
		for(const update of updates) {
			if(update.removed) {
				state.markerSets.delete(update.id);
				nonReactiveState.markers.delete(update.id);
				continue;
			}

			if(update.payload) {
				if(state.markerSets.has(update.id)) { //Update if exists
					const set = state.markerSets.get(update.id) as LiveAtlasMarkerSet;

					set.showLabels = update.payload.showLabels;
					set.minZoom = update.payload.minZoom;
					set.maxZoom = update.payload.maxZoom;
					set.priority = update.payload.priority;
					set.label = update.payload.label;
					set.hidden = update.payload.hidden;
				} else { //Otherwise create
					state.markerSets.set(update.id, {
						id: update.id,
						showLabels: update.payload.showLabels,
						minZoom: update.payload.minZoom,
						maxZoom: update.payload.maxZoom,
						priority: update.payload.priority,
						label: update.payload.label,
						hidden: update.payload.hidden,
					});
					nonReactiveState.markers.set(update.id, new Map());
				}
			}
		}
	},

	//Sets the existing marker sets from the last marker fetch
	[MutationTypes.ADD_MARKER_UPDATES](state: State, markers: DynmapMarkerUpdate[]) {
		let setContents;

		for (const update of markers) {
			if(!nonReactiveState.markers.has(update.set)) {
				continue;
			}

			setContents = nonReactiveState.markers.get(update.set) as Map<string, LiveAtlasMarker>;

			if(update.removed) {
				setContents.delete(update.id);
			} else {
				setContents.set(update.id, update.payload);
			}
		}

		state.pendingMarkerUpdates = state.pendingMarkerUpdates.concat(markers);
	},

	//Adds tile updates from an update fetch to the pending updates list
	[MutationTypes.ADD_TILE_UPDATES](state: State, updates: Array<DynmapTileUpdate>) {
		state.pendingTileUpdates = state.pendingTileUpdates.concat(updates);
	},

	//Adds chat messages from an update fetch to the chat history
	[MutationTypes.ADD_CHAT](state: State, chat: Array<LiveAtlasChat>) {
		state.chat.messages.unshift(...chat);
	},

	//Pops the specified number of marker updates from the pending updates list
	[MutationTypes.POP_MARKER_UPDATES](state: State, amount: number) {
		state.pendingMarkerUpdates.splice(0, amount);
	},

	//Pops the specified number of tile updates from the pending updates list
	[MutationTypes.POP_TILE_UPDATES](state: State, amount: number) {
		state.pendingTileUpdates.splice(0, amount);
	},

	[MutationTypes.SET_MAX_PLAYERS](state: State, maxPlayers: number) {
		state.maxPlayers = maxPlayers;
	},

	// Set up to 10 players at once
	[MutationTypes.SET_PLAYERS_ASYNC](state: State, players: Set<LiveAtlasPlayer>): Set<LiveAtlasPlayer> {
		let count = 0;

		for(const player of players) {
			if(state.players.has(player.name)) {
				const existing = state.players.get(player.name);

				existing!.health = player.health;
				existing!.uuid = player.uuid;
				existing!.armor = player.armor;
				existing!.location = Object.assign(existing!.location, player.location);
				existing!.yaw = player.yaw;
				existing!.hidden = player.hidden;
				existing!.displayName = player.displayName;
				existing!.sort = player.sort;

				if(existing!.displayName !== player.displayName || existing!.sort !== player.sort) {
					state.sortedPlayers.dirty = true;
				}
			} else {
				state.sortedPlayers.dirty = true;
				state.players.set(player.name, {
					name: player.name,
					uuid: player.uuid,
					health: player.health,
					armor: player.armor,
					location: player.location,
					yaw: player.yaw,
					displayName: player.displayName,
					sort: player.sort,
					hidden: player.hidden,
				});
			}

			players.delete(player);

			if(++count >= 10) {
				break;
			}
		}

		//Re-sort sortedPlayers array if needed
		if(!players.size && state.sortedPlayers.dirty) {
			state.sortedPlayers = [...state.players.values()].sort((a, b) => {
				if(a.sort !== b.sort) {
					return a.sort - b.sort;
				}

				return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
			}) as LiveAtlasSortedPlayers;
		}

		return players;
	},

	//Removes all players not found in the provided keep set
	[MutationTypes.SYNC_PLAYERS](state: State, keep: Set<string>) {
		// Collect departed names in one pass (so the sortedPlayers compaction
		// below is O(n) instead of the old splice-by-indexOf approach which
		// degraded to O(n²) on servers with many simultaneous disconnects).
		const removed = new Set<string>();
		for(const [key, player] of state.players) {
			if(!keep.has(player.name)) {
				removed.add(player.name);
				state.players.delete(key);
			}
		}

		if(!removed.size) return;

		// In-place compaction preserves the sortedPlayers array identity
		// (some consumers track it reactively) while avoiding any extra
		// allocation.
		let write = 0;
		for(let read = 0; read < state.sortedPlayers.length; read++) {
			const player = state.sortedPlayers[read];
			if(!removed.has(player.name)) {
				if(write !== read) state.sortedPlayers[write] = player;
				write++;
			}
		}
		state.sortedPlayers.length = write;
	},

	//Sets flag indicating LiveAtlas has fully loaded
	[MutationTypes.SET_LOADED](state: State) {
		state.firstLoad = false;
	},

	//Sets the currently active server
	[MutationTypes.SET_CURRENT_SERVER](state: State, serverName) {
		if(!state.servers.has(serverName)) {
			throw new RangeError(`Unknown server ${serverName}`);
		}

		state.currentServer = state.servers.get(serverName);

		if(state.currentMapProvider) {
			state.currentMapProvider.stopUpdates();
		}

		state.currentMapProvider = getServerMapProvider(serverName);
	},

	//Sets the currently active map/world
	[MutationTypes.SET_CURRENT_MAP](state: State, {worldName, mapName}) {
		mapName = `${worldName}_${mapName}`;

		if(!state.worlds.has(worldName)) {
			throw new RangeError(`Unknown world ${worldName}`);
		}

		if(!state.maps.has(mapName)) {
			throw new RangeError(`Unknown map ${mapName}`);
		}

		const newWorld = state.worlds.get(worldName);

		if(state.currentWorld !== newWorld) {
			state.currentWorld = newWorld;
			state.markerSets.clear();
			state.pendingMarkerUpdates.splice(0);
			state.pendingTileUpdates.splice(0);
			state.currentWorldState.timeOfDay = undefined;
			state.currentWorldState.raining = false;
			state.currentWorldState.thundering = false;

			// Cancel follow when switching to a different world
			if(state.followTarget && state.followTarget.location.world !== newWorld!.name) {
				state.followTarget = undefined;
			}
		}

		state.currentMap = state.maps.get(mapName);
	},

	//Sets the current location the map is showing. This is called by the map itself, and calling elsewhere will not update the map.
	[MutationTypes.SET_CURRENT_LOCATION](state: State, payload: Coordinate) {
		state.currentLocation = payload;
	},

	//Sets the current zoom level of the map. This is called by the map itself, and calling elsewhere will not update the map.
	[MutationTypes.SET_CURRENT_ZOOM](state: State, payload: number) {
		state.currentZoom = payload;
	},

	//Sets the result of parsing the current map url, if present and valid
	[MutationTypes.SET_PARSED_URL](state: State, payload: LiveAtlasParsedUrl) {
		state.parsedUrl = payload;
	},

	//Clear any existing parsed url
	[MutationTypes.CLEAR_PARSED_URL](state: State) {
		state.parsedUrl = undefined;
	},

	//Set the follow target, which the map will automatically pan to keep in view
	[MutationTypes.SET_FOLLOW_TARGET](state: State, player: LiveAtlasPlayer) {
		state.followTarget = player;
	},

	//Set the pan target, which the map will immediately pan to once
	[MutationTypes.SET_VIEW_TARGET](state: State, target: LiveAtlasMapViewTarget) {
		state.followTarget = undefined;
		state.viewTarget = target;
	},

	//Clear the follow target
	[MutationTypes.CLEAR_FOLLOW_TARGET](state: State) {
		state.followTarget = undefined;
	},

	//Clear the pan target
	[MutationTypes.CLEAR_VIEW_TARGET](state: State) {
		state.viewTarget = undefined;
	},

	[MutationTypes.SET_SCREEN_SIZE](state: State, payload: {width: number, height: number}): void {
		state.ui.screenWidth = payload.width;
		state.ui.screenHeight = payload.height;

		const smallScreen = state.ui.screenWidth < 480 || state.ui.screenHeight < 500;

		if(!state.ui.smallScreen && smallScreen && state.ui.visibleElements.size > 1) {
			state.ui.visibleElements.clear();
		}

		state.ui.smallScreen = smallScreen;
	},

	[MutationTypes.TOGGLE_UI_ELEMENT_VISIBILITY](state: State, element: LiveAtlasUIElement): void {
		const newState = !state.ui.visibleElements.has(element);

		if(newState && state.ui.smallScreen) {
			state.ui.visibleElements.clear();
		}

		state.ui.previouslyVisibleElements.add(element);
		newState ? state.ui.visibleElements.add(element) : state.ui.visibleElements.delete(element);
	},

	[MutationTypes.SET_UI_ELEMENT_VISIBILITY](state: State, payload: {element: LiveAtlasUIElement, state: boolean}): void {
		if(payload.state && state.ui.smallScreen) {
			state.ui.visibleElements.clear();
		}

		if(payload.state || state.ui.visibleElements.has(payload.element)) {
			state.ui.previouslyVisibleElements.add(payload.element);
		}

		payload.state ? state.ui.visibleElements.add(payload.element) : state.ui.visibleElements.delete(payload.element);
	},

	[MutationTypes.SHOW_UI_MODAL](state: State, modal: LiveAtlasUIModal): void {
		if(state.ui.smallScreen) {
			state.ui.visibleElements.clear();
		}

		state.ui.visibleModal = modal;
	},

	[MutationTypes.HIDE_UI_MODAL](state: State, modal: LiveAtlasUIModal): void {
		if(state.ui.visibleModal === modal) {
			state.ui.visibleModal = undefined;
		}
	},

	[MutationTypes.TOGGLE_SIDEBAR_SECTION_COLLAPSED_STATE](state: State, section: LiveAtlasSidebarSection): void {
		state.ui.sidebar[section].collapsed = !state.ui.sidebar[section].collapsed;
	},

	[MutationTypes.SET_LOGGED_IN](state: State, payload: boolean): void {
		state.loggedIn = payload;
	},

	[MutationTypes.SET_LOGIN_REQUIRED](state: State, payload: boolean): void {
		if(payload) {
			state.loggedIn = false;
		}

		state.loginRequired = payload;
	},

	[MutationTypes.LOCAL_EDITOR_SET_ACTIVE](state: State, active: boolean): void {
		state.localEditor.active = active;
	},

	[MutationTypes.LOCAL_EDITOR_ADD_MARKER](state: State, marker: LocalEditorMarker): void {
		state.localEditor.markers.push(marker);
		state.localEditor.selectedId = marker.id;
	},

	[MutationTypes.LOCAL_EDITOR_UPDATE_MARKER](state: State, {id, patch}): void {
		const marker = state.localEditor.markers.find(m => m.id === id);

		if(marker) {
			Object.assign(marker, patch);
		}
	},

	[MutationTypes.LOCAL_EDITOR_DELETE_MARKER](state: State, id: string): void {
		const index = state.localEditor.markers.findIndex(m => m.id === id);

		if(index !== -1) {
			state.localEditor.markers.splice(index, 1);
		}

		if(state.localEditor.selectedId === id) {
			state.localEditor.selectedId = undefined;
		}
	},

	[MutationTypes.LOCAL_EDITOR_SELECT_MARKER](state: State, id: string | undefined): void {
		state.localEditor.selectedId = id;
	},

	[MutationTypes.LOCAL_EDITOR_CLEAR_MARKERS](state: State): void {
		state.localEditor.markers.splice(0);
		state.localEditor.sets.splice(0);
		state.localEditor.selectedId = undefined;
		clearPersistedLocalEditor();
	},

	[MutationTypes.LOCAL_EDITOR_HYDRATE](state: State): void {
		const {markers, sets} = loadPersistedLocalEditor();
		state.localEditor.markers.splice(0, state.localEditor.markers.length, ...markers);
		state.localEditor.sets.splice(0, state.localEditor.sets.length, ...sets);
		state.localEditor.selectedId = undefined;
	},

	[MutationTypes.LOCAL_EDITOR_PERSIST](state: State): void {
		savePersistedLocalEditor(state.localEditor.markers, state.localEditor.sets);
	},

	[MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL](state: State, open: boolean): void {
		state.localEditor.commandsModalOpen = open;
	},

	[MutationTypes.LOCAL_EDITOR_OPEN_MENU](state: State, {x, y}): void {
		state.localEditor.menu.x = x;
		state.localEditor.menu.y = y;
		state.localEditor.menu.open = true;
	},

	[MutationTypes.LOCAL_EDITOR_CLOSE_MENU](state: State): void {
		state.localEditor.menu.open = false;
	},

	// Move a server marker into the pending list as an editable copy. If the
	// marker is already pending (edit or delete), just select it and let the
	// caller flip the origin if needed.
	[MutationTypes.LOCAL_EDITOR_BEGIN_EDIT](state: State, {setId, markerId, worldName}): void {
		const existing = state.localEditor.markers.find(m =>
			m.id === markerId && (m.originalSetId === setId || m.setId === setId));
		if(existing) {
			// Already pending — if it's queued for deletion, restore to edit.
			if(existing.origin === 'delete') existing.origin = 'edit';
			state.localEditor.selectedId = existing.id;
			return;
		}
		const source = nonReactiveState.markers.get(setId)?.get(markerId);
		if(!source) return;
		const converted = liveAtlasToLocalEditor(setId, worldName, source);
		if(!converted) return;
		state.localEditor.markers.push(converted);
		state.localEditor.selectedId = converted.id;
	},

	// Queue a deletion for a server marker. Same shape as begin-edit but
	// the resulting pending entry has origin='delete'.
	[MutationTypes.LOCAL_EDITOR_QUEUE_DELETE](state: State, {setId, markerId, worldName}): void {
		const existing = state.localEditor.markers.find(m =>
			m.id === markerId && (m.originalSetId === setId || m.setId === setId));
		if(existing) {
			existing.origin = 'delete';
			state.localEditor.selectedId = existing.id;
			return;
		}
		const source = nonReactiveState.markers.get(setId)?.get(markerId);
		if(!source) return;
		const converted = liveAtlasToLocalEditor(setId, worldName, source);
		if(!converted) return;
		converted.origin = 'delete';
		state.localEditor.markers.push(converted);
		state.localEditor.selectedId = converted.id;
	},

	// Flip a pending marker between edit and delete origins. Used by the
	// "Queue deletion" / "Restore" buttons in the form. No-op for origin='new'.
	[MutationTypes.LOCAL_EDITOR_TOGGLE_DELETE](state: State, id: string): void {
		const marker = state.localEditor.markers.find(m => m.id === id);
		if(!marker) return;
		if(marker.origin === 'edit') marker.origin = 'delete';
		else if(marker.origin === 'delete') marker.origin = 'edit';
	},

	// Drop a pending edit/delete entry entirely, restoring the server marker's
	// original visibility on the map.
	[MutationTypes.LOCAL_EDITOR_DISCARD_EDIT](state: State, id: string): void {
		const index = state.localEditor.markers.findIndex(m => m.id === id);
		if(index === -1) return;
		// Only meaningful for edit/delete entries — refuse to silently drop
		// freshly-created markers (the regular delete mutation handles those).
		const m = state.localEditor.markers[index];
		if(m.origin !== 'edit' && m.origin !== 'delete') return;
		state.localEditor.markers.splice(index, 1);
		if(state.localEditor.selectedId === id) {
			state.localEditor.selectedId = undefined;
		}
	},

	[MutationTypes.LOCAL_EDITOR_START_DRAWING](state: State, {id, kind}): void {
		state.localEditor.drawing = {id, kind};
		state.localEditor.selectedId = id;
	},

	[MutationTypes.LOCAL_EDITOR_FINISH_DRAWING](state: State): void {
		state.localEditor.drawing = undefined;
	},

	[MutationTypes.LOCAL_EDITOR_START_PICKING](state: State, {markerId, target}): void {
		state.localEditor.picking = {markerId, target};
	},

	[MutationTypes.LOCAL_EDITOR_FINISH_PICKING](state: State): void {
		state.localEditor.picking = undefined;
	},

	[MutationTypes.LOCAL_EDITOR_SET_SNAP](state: State, enabled: boolean): void {
		state.localEditor.snapEnabled = enabled;
	},

	[MutationTypes.LOCAL_EDITOR_SET_HOVER_LOCATION](state: State, location: Coordinate | undefined): void {
		state.localEditor.hoverLocation = location;
	},

	[MutationTypes.LOCAL_EDITOR_SET_SHOW_VERTEX_NUMBERS](state: State, enabled: boolean): void {
		state.localEditor.showVertexNumbers = enabled;
	},

	[MutationTypes.LOCAL_EDITOR_ADD_SET](state: State, set: LocalEditorSet): void {
		state.localEditor.sets.push(set);
	},

	[MutationTypes.LOCAL_EDITOR_UPDATE_SET](state: State, {id, patch}): void {
		const set = state.localEditor.sets.find(s => s.id === id);
		if(set) Object.assign(set, patch);
	},

	[MutationTypes.LOCAL_EDITOR_DELETE_SET](state: State, id: string): void {
		const index = state.localEditor.sets.findIndex(s => s.id === id);
		if(index !== -1) state.localEditor.sets.splice(index, 1);
	},

	//Cleanup for switching servers or reloading the configuration
	[MutationTypes.RESET](state: State): void {
		state.followTarget = undefined;
		state.viewTarget = undefined;

		state.players.clear();
		state.sortedPlayers.splice(0, state.sortedPlayers.length);

		state.maxPlayers = 0;
		state.currentWorld = undefined;
		state.currentMap = undefined;

		state.markerSets.clear();
		state.pendingMarkerUpdates.splice(0);
		state.pendingTileUpdates.splice(0);

		state.worlds.clear();
		state.maps.clear();
		state.currentZoom = 0;
		state.currentLocation = {x: 0, y: 0, z: 0};

		state.currentWorldState.timeOfDay = 0;
		state.currentWorldState.raining = false;
		state.currentWorldState.thundering = false;

		state.configurationHash = undefined;
		state.configuration.title = '';

		state.components.markers.showLabels= false;
		state.components.players = {
			markers: undefined,
			showImages: true,
			grayHiddenPlayers: true,
			imageUrl: getDefaultPlayerImage,
		};
		state.components.coordinatesControl = undefined;
		state.components.clockControl = undefined;
		state.components.linkControl = false;
		state.components.layerControl = false;
		state.components.logoControls = [];
		state.components.chatSending = undefined;
		state.components.chatBox = undefined;
		state.components.chatBalloons = false;
		state.components.login = false;

		state.ui.visibleModal = undefined;
		state.chat.messages = [];

		state.loggedIn = false;
		state.loginRequired = false;
	}
}

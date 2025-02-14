/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2020 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

'use strict';

// Using 'import' breaks hooks
var React = require('react');
var ReactDOM = require('react-dom');
import TabBar from 'components/tabBar';
import { CSSIcon, CSSItemTypeIcon } from 'components/icons';

// Configure loaded tabs limit
const MAX_LOADED_TABS = Zotero.Prefs.get("tabs.maxLoadedTabs");
const UNLOAD_UNUSED_AFTER = Zotero.Prefs.get("tabs.unloadUnusedAfter");

var Zotero_Tabs = new function () {
	Object.defineProperty(this, 'selectedID', {
		get: () => this._selectedID
	});

	Object.defineProperty(this, 'selectedType', {
		get: () => this._getTab(this._selectedID).tab.type
	});

	Object.defineProperty(this, 'selectedIndex', {
		get: () => this._getTab(this._selectedID).tabIndex
	});

	Object.defineProperty(this, 'deck', {
		get: () => document.getElementById('tabs-deck')
	});

	Object.defineProperty(this, 'numTabs', {
		get: () => this._tabs.length
	});

	Object.defineProperty(this, 'focusOptions', {
		get: () => this._focusOptions
	});

	Object.defineProperty(this, 'tabsMenuList', {
		get: () => document.getElementById('zotero-tabs-menu-list')
	});

	Object.defineProperty(this, 'tabsMenuPanel', {
		get: () => document.getElementById('zotero-tabs-menu-panel')
	});

	this._tabBarRef = React.createRef();
	this._tabs = [{
		id: 'zotero-pane',
		type: 'library',
		title: ''
	}];
	this._selectedID = 'zotero-pane';
	this._prevSelectedID = null;
	this._history = [];
	this._focusOptions = {};
	this._tabsMenuFilter = "";
	this._tabsMenuFocusedIndex = 0;
	this._tabsMenuIgnoreMouseover = false;

	this._unloadInterval = setInterval(() => {
		this.unloadUnusedTabs();
	}, 60000); // Trigger every minute

	this._getTab = function (id) {
		var tabIndex = this._tabs.findIndex(tab => tab.id == id);
		return { tab: this._tabs[tabIndex], tabIndex };
	};

	this._update = function () {
		this._tabBarRef.current.setTabs(this._tabs.map((tab) => {
			let icon = null;
			if (tab.id === 'zotero-pane') {
				let index = ZoteroPane.collectionsView?.selection?.focused;
				if (typeof index !== 'undefined' && ZoteroPane.collectionsView.getRow(index)) {
					let iconName = ZoteroPane.collectionsView.getIconName(index);
					icon = <CSSIcon name={iconName} className="tab-icon" />;
				}
			}
			else if (tab.data?.itemID) {
				try {
					let item = Zotero.Items.get(tab.data.itemID);
					icon = <CSSItemTypeIcon itemType={item.getItemTypeIconName()} className="tab-icon" />;
				}
				catch (e) {
					// item might not yet be loaded, we will get the icon on the next update
				}
			}

			return {
				id: tab.id,
				type: tab.type,
				title: tab.title,
				selected: tab.id == this._selectedID,
				icon,
			};
		}));
		// Disable File > Close menuitem if multiple tabs are open
		const multipleTabsOpen = this._tabs.length > 1;
		document.getElementById('cmd_close').setAttribute('disabled', multipleTabsOpen);
		var { tab } = this._getTab(this._selectedID);
		if (!tab) {
			return;
		}
		document.title = (tab.title.length ? tab.title + ' - ' : '') + Zotero.appName;
		// Hide any tab `title` tooltips that might be open
		window.Zotero_Tooltip.stop();
		if (this.isTabsMenuVisible()) {
			this.refreshTabsMenuList();
			if (document.activeElement.id !== "zotero-tabs-menu-filter") {
				focusTabsMenuEntry();
			}
		}
		// Disable tabs menu button when no reader tabs are present
		document.getElementById("zotero-tb-tabs-menu").disabled = this._tabs.length == 1;
		// Close tabs menu if all tabs are closed
		if (this._tabs.length == 1 && this.isTabsMenuVisible()) {
			this.tabsMenuPanel.hidePopup();
		}
	};

	this.getTabIDByItemID = function (itemID) {
		let tab = this._tabs.find(tab => tab.data && tab.data.itemID === itemID);
		return tab && tab.id;
	};

	this.setSecondViewState = function (tabID, state) {
		let { tab } = this._getTab(tabID);
		tab.data.secondViewState = state;
		Zotero.Session.debounceSave();
	};

	this.init = function () {
		ReactDOM.render(
			<TabBar
				ref={this._tabBarRef}
				onTabSelect={this.select.bind(this)}
				onTabMove={this.move.bind(this)}
				onTabClose={this.close.bind(this)}
				onContextMenu={this._openMenu.bind(this)}
			/>,
			document.getElementById('tab-bar-container'),
			() => {
				this._update();
			}
		);
	};

	this.getState = function () {
		return this._tabs.map((tab) => {
			let type = tab.type;
			if (type === 'reader-unloaded') {
				type = 'reader';
			}
			var o = {
				type,
				title: tab.title,
				timeUnselected: tab.timeUnselected
			};
			if (tab.data) {
				o.data = tab.data;
			}
			if (tab.id == this._selectedID) {
				o.selected = true;
			}
			return o;
		});
	};

	this.restoreState = function (tabs) {
		for (let i = 0; i < tabs.length; i++) {
			let tab = tabs[i];
			if (tab.type === 'library') {
				this.rename('zotero-pane', tab.title);
			}
			else if (tab.type === 'reader') {
				if (Zotero.Items.exists(tab.data.itemID)) {
					if (tab.selected) {
						Zotero.Reader.open(tab.data.itemID,
							null,
							{
								title: tab.title,
								tabIndex: i,
								openInBackground: !tab.selected,
								secondViewState: tab.data.secondViewState
							}
						);
					}
					else {
						this.add({
							type: 'reader-unloaded',
							title: tab.title,
							index: i,
							data: tab.data
						});
					}
				}
			}
		}
		// Unset the previously selected tab id, because it was set when restoring tabs
		this._prevSelectedID = null;
	};
	
	/**
	 * Add a new tab
	 *
	 * @param {String} type
	 * @param {String} title
	 * @param {String} data - Extra data about the tab to pass to notifier and session
	 * @param {Integer} index
	 * @param {Boolean} select
	 * @param {Function} onClose
	 * @return {{ id: string, container: XULElement}} id - tab id, container - a new tab container created in the deck
	 */
	this.add = function ({ id, type, data, title, index, select, onClose, preventJumpback }) {
		if (typeof type != 'string') {
		}
		if (typeof title != 'string') {
			throw new Error(`'title' should be a string (was ${typeof title})`);
		}
		if (index !== undefined && (!Number.isInteger(index) || index < 1)) {
			throw new Error(`'index' should be an integer > 0 (was ${index} (${typeof index})`);
		}
		if (onClose !== undefined && typeof onClose != 'function') {
			throw new Error(`'onClose' should be a function (was ${typeof onClose})`);
		}
		id = id || 'tab-' + Zotero.Utilities.randomString();
		var container = document.createXULElement('vbox');
		container.id = id;
		this.deck.appendChild(container);
		var tab = { id, type, title, data, onClose };
		index = index || this._tabs.length;
		this._tabs.splice(index, 0, tab);
		this._update();
		Zotero.Notifier.trigger('add', 'tab', [id], { [id]: data }, true);
		if (select) {
			let previousID = this._selectedID;
			this.select(id);
			if (!preventJumpback) {
				this._prevSelectedID = previousID;
			}
		}
		return { id, container };
	};

	/**
	 * Set a new tab title
	 *
	 * @param {String} id
	 * @param {String} title
	 */
	this.rename = function (id, title) {
		if (typeof title != 'string') {
			throw new Error(`'title' should be a string (was ${typeof title})`);
		}
		var { tab } = this._getTab(id);
		if (!tab) {
			return;
		}
		tab.title = title;
		this._update();
	};

	/**
	 * Close tabs
	 *
	 * @param {String|Array<String>|undefined} ids One or more ids, or empty for the current tab
	 */
	this.close = function (ids) {
		if (!ids) {
			ids = [this._selectedID];
		}
		else if (!Array.isArray(ids)) {
			ids = [ids];
		}
		if (ids.includes('zotero-pane')) {
			throw new Error('Library tab cannot be closed');
		}
		var historyEntry = [];
		var closedIDs = [];
		var tmpTabs = this._tabs.slice();
		for (var id of ids) {
			let { tab, tabIndex } = this._getTab(id);
			if (!tab) {
				continue;
			}
			if (tab.id == this._selectedID) {
				this.select(this._prevSelectedID || (this._tabs[tabIndex + 1] || this._tabs[tabIndex - 1]).id);
			}
			if (tab.id == this._prevSelectedID) {
				this._prevSelectedID = null;
			}
			tabIndex = this._tabs.findIndex(x => x.id === id);
			this._tabs.splice(tabIndex, 1);
			if (tab.onClose) {
				tab.onClose();
			}
			historyEntry.push({ index: tmpTabs.indexOf(tab), data: tab.data });
			closedIDs.push(id);

			setTimeout(() => {
				document.getElementById(tab.id).remove();
				// For unknown reason fx102, unlike 60, sometimes doesn't automatically update selected index
				let selectedIndex = Array.from(this.deck.children).findIndex(x => x.id == this._selectedID);
				if (this.deck.selectedIndex !== selectedIndex) {
					this.deck.selectedIndex = selectedIndex;
				}
			});
		}
		this._history.push(historyEntry);
		Zotero.Notifier.trigger('close', 'tab', [closedIDs], true);
		this._update();
	};

	/**
	 * Close all tabs except the first one
	 */
	this.closeAll = function () {
		this.close(this._tabs.slice(1).map(x => x.id));
	};
	
	/**
	 * Undo tabs closing
	 */
	this.undoClose = async function () {
		var historyEntry = this._history.pop();
		if (historyEntry) {
			let maxIndex = -1;
			let openPromises = [];
			for (let tab of historyEntry) {
				if (Zotero.Items.exists(tab.data.itemID)) {
					openPromises.push(Zotero.Reader.open(tab.data.itemID,
						null,
						{
							tabIndex: tab.index,
							openInBackground: true
						}
					));
					if (tab.index > maxIndex) {
						maxIndex = tab.index;
					}
				}
			}
			await Promise.all(openPromises);
			// Select last reopened tab
			if (maxIndex > -1) {
				this.jump(maxIndex);
			}
		}
	};

	/**
	 * Move a tab to the specified index
	 *
	 * @param {String} id
	 * @param {Integer} newIndex
	 */
	this.move = function (id, newIndex) {
		if (!Number.isInteger(newIndex) || newIndex < 1) {
			throw new Error(`'newIndex' should be an interger > 0 (was ${newIndex} (${typeof newIndex})`);
		}
		var { tab, tabIndex } = this._getTab(id);
		if (tabIndex == 0) {
			throw new Error('Library tab cannot be moved');
		}
		if (!tab || tabIndex == newIndex) {
			return;
		}
		if (newIndex > tabIndex) {
			newIndex--;
		}
		this._tabs.splice(tabIndex, 1);
		this._tabs.splice(newIndex, 0, tab);
		this._update();
	};

	/**
	 * Select a tab
	 *
	 * @param {String} id
	 * @param {Boolean} reopening
	 */
	this.select = function (id, reopening, options = {}) {
		var { tab, tabIndex } = this._getTab(id);
		// Move focus to the last focused element of zoteroPane if any or itemTree otherwise
		let focusZoteroPane = () => {
			if (tab.id !== 'zotero-pane') return;
			// Small delay to make sure the focus does not remain on the actual
			// tab after mouse click
			setTimeout(() => {
				if (tab.lastFocusedElement) {
					tab.lastFocusedElement.focus();
				}
				if (document.activeElement !== tab.lastFocusedElement) {
					ZoteroPane_Local.itemsView.focus();
				}
				tab.lastFocusedElement = null;
			});
		};
		if (!tab || tab.id === this._selectedID) {
			// Focus on reader or zotero pane when keepTabFocused is explicitly false
			// E.g. when a tab is selected via Space or Enter
			if (options.keepTabFocused === false && tab?.id === this._selectedID) {
				var reader = Zotero.Reader.getByTabID(this._selectedID);
				if (reader) {
					reader.focus();
				}
				if (tab.id == 'zotero-pane') {
					focusZoteroPane();
				}
			}
			return;
		}
		let selectedTab;
		if (this._selectedID) {
			selectedTab = this._getTab(this._selectedID).tab;
			if (selectedTab) {
				selectedTab.timeUnselected = Zotero.Date.getUnixTimestamp();
			}
		}
		
		// If the last focus data was recorded for a different item, discard it
		if (!this._focusOptions.itemID || this._focusOptions.itemID != tab?.data?.itemID) {
			this._focusOptions = {};
		}
		// Save focus option for this item to tell reader and contextPane how to handle focus
		if (Object.keys(options).length && selectedTab) {
			this._focusOptions.keepTabFocused = !!options.keepTabFocused;
			this._focusOptions.itemID = tab?.data?.itemID;
		}
		if (this._selectedID === 'zotero-pane'
		&& !document.activeElement.classList.contains("tab")
		&& document.activeElement.tagName !== 'window') {
			// never return focus to another tab or <window>
			selectedTab.lastFocusedElement = document.activeElement;
		}
		if (tab.type === 'reader-unloaded') {
			this.close(tab.id);
			Zotero.Reader.open(tab.data.itemID, options && options.location, {
				tabID: tab.id,
				title: tab.title,
				tabIndex,
				allowDuplicate: true,
				secondViewState: tab.data.secondViewState,
				preventJumpback: true
			});
			return;
		}
		this._prevSelectedID = reopening ? this._selectedID : null;
		this._selectedID = id;
		this.deck.selectedIndex = Array.from(this.deck.children).findIndex(x => x.id == id);
		this._update();
		Zotero.Notifier.trigger('select', 'tab', [tab.id], { [tab.id]: { type: tab.type } }, true);
		if (tab.id === 'zotero-pane' && (options.keepTabFocused !== true)) {
			focusZoteroPane();
		}
		let tabNode = document.querySelector(`.tab[data-id="${tab.id}"]`);
		if (this._focusOptions.keepTabFocused && document.activeElement.getAttribute('data-id') != tabNode.getAttribute('data-id')) {
			// Keep focus on the currently selected tab during keyboard navigation
			if (tab.id == 'zotero-pane') {
				// Since there is more than one zotero-pane tab (pinned and not pinned),
				// use moveFocus() to focus on the visible one
				this.moveFocus('first');
			}
			else {
				tabNode.focus();
			}
		}
		// Allow React to create a tab node
		setTimeout(() => {
			tabNode.scrollIntoView({ behavior: 'smooth' });
		});
		// Border is not included when scrolling element node into view, therefore we do it manually.
		// TODO: `scroll-padding` since Firefox 68 can probably be used instead
		setTimeout(() => {
			if (!tabNode) {
				return;
			}
			let tabsContainerNode = document.querySelector('#tab-bar-container .tabs');
			if (tabNode.offsetLeft + tabNode.offsetWidth - tabsContainerNode.offsetWidth + 1 >= tabsContainerNode.scrollLeft) {
				document.querySelector('#tab-bar-container .tabs').scrollLeft += 1;
			}
			else if (tabNode.offsetLeft - 1 <= tabsContainerNode.scrollLeft) {
				document.querySelector('#tab-bar-container .tabs').scrollLeft -= 1;
			}
		}, 500);
		tab.timeSelected = Zotero.Date.getUnixTimestamp();
		// Without `setTimeout` the tab closing that happens in `unloadUnusedTabs` results in
		// tabs deck selection index bigger than the deck children count. It feels like something
		// isn't update synchronously
		setTimeout(() => this.unloadUnusedTabs());
	};

	this.unload = function (id) {
		var { tab, tabIndex } = this._getTab(id);
		if (!tab || tab.id === this._selectedID || tab.type !== 'reader') {
			return;
		}
		this.close(tab.id);
		this.add({
			id: tab.id,
			type: 'reader-unloaded',
			title: tab.title,
			index: tabIndex,
			data: tab.data
		});
	};

	this.unloadUnusedTabs = function () {
		for (let tab of this._tabs) {
			if (Zotero.Date.getUnixTimestamp() - tab.timeUnselected > UNLOAD_UNUSED_AFTER) {
				this.unload(tab.id);
			}
		}
		let tabs = this._tabs.slice().filter(x => x.type === 'reader');
		tabs.sort((a, b) => b.timeUnselected - a.timeUnselected);
		tabs = tabs.slice(MAX_LOADED_TABS);
		for (let tab of tabs) {
			this.unload(tab.id);
		}
	};

	/**
	 * Select the previous tab (closer to the library tab)
	 */
	this.selectPrev = function (options) {
		var { tabIndex } = this._getTab(this._selectedID);
		this.select((this._tabs[tabIndex - 1] || this._tabs[this._tabs.length - 1]).id, false, options || {});
	};

	/**
	 * Select the next tab (farther to the library tab)
	 */
	this.selectNext = function (options) {
		var { tabIndex } = this._getTab(this._selectedID);
		this.select((this._tabs[tabIndex + 1] || this._tabs[0]).id, false, options || {});
	};
	
	/**
	 * Select the last tab
	 */
	this.selectLast = function () {
		this.select(this._tabs[this._tabs.length - 1].id);
	};

	/**
	 * Moves focus to a tab in the specified direction.
	 * @param {String} direction. "first", "last", "left", "right", or "current"
	 * If document.activeElement is a tab, "left" or "right" direction moves focus from that tab.
	 * Otherwise, focus is moved in the given direction from the currently selected tab.
	 */
	this.moveFocus = function (direction) {
		let focusedTabID = document.activeElement.getAttribute('data-id');
		var { tabIndex } = this._getTab(this._selectedID);

		let tabIndexToFocus = null;
	
		if (direction === "last") {
			tabIndexToFocus = this._tabs.length - 1;
		}
		else if (direction == "first") {
			tabIndexToFocus = 0;
		}
		else if (direction == "current") {
			tabIndexToFocus = tabIndex;
		}
		else {
			let focusedTabIndex = this._tabs.findIndex(tab => tab.id === focusedTabID);
			
			// If the currently focused element is not a tab, use tab that is selected
			if (focusedTabIndex === -1) {
				focusedTabIndex = tabIndex;
			}
	
			switch (direction) {
				case "left":
					tabIndexToFocus = focusedTabIndex > 0 ? focusedTabIndex - 1 : null;
					break;
				case "right":
					tabIndexToFocus = focusedTabIndex < this._tabs.length - 1 ? focusedTabIndex + 1 : null;
					break;
				default:
					throw new Error(`${direction} is an invalid direction.`);
			}
		}
	
		if (tabIndexToFocus !== null) {
			const nextTab = this._tabs[tabIndexToFocus];
			// There may be duplicate tabs - in normal tab array and in pinned tabs
			// So to get the right one, fetch all tabs with a given id and filter out one
			// that's visible
			let candidates = document.querySelectorAll(`[data-id="${nextTab.id}"]`);
			for (let node of candidates) {
				if (node.offsetParent) {
					node.focus();
					return;
				}
			}
		}
	};
	
	/**
	 * Jump to the tab at a particular index. If the index points beyond the array, jump to the last
	 * tab.
	 *
	 * @param {Integer} index
	 */
	this.jump = function (index) {
		this.select(this._tabs[Math.min(index, this._tabs.length - 1)].id);
	};

	this._openMenu = function (x, y, id) {
		var { tab, tabIndex } = this._getTab(id);
		window.Zotero_Tooltip.stop();
		let menuitem;
		let popup = document.createXULElement('menupopup');
		document.querySelector('popupset').appendChild(popup);
		popup.addEventListener('popuphidden', function (event) {
			if (event.target === popup) {
				popup.remove();
			}
		});
		if (id !== 'zotero-pane') {
			// Show in library
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('general.showInLibrary'));
			menuitem.addEventListener('command', () => {
				let { tab } = this._getTab(id);
				if (tab && (tab.type === 'reader' || tab.type === 'reader-unloaded')) {
					let itemID = tab.data.itemID;
					let item = Zotero.Items.get(itemID);
					if (item && item.parentItemID) {
						itemID = item.parentItemID;
					}
					ZoteroPane_Local.selectItem(itemID);
					this.select('zotero-pane');
				}
			});
			popup.appendChild(menuitem);
			// Move tab
			let menu = document.createXULElement('menu');
			menu.setAttribute('label', Zotero.getString('tabs.move'));
			let menupopup = document.createXULElement('menupopup');
			menu.append(menupopup);
			popup.appendChild(menu);
			// Move to start
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToStart'));
			menuitem.setAttribute('disabled', tabIndex == 1);
			menuitem.addEventListener('command', () => {
				this.move(id, 1);
			});
			menupopup.appendChild(menuitem);
			// Move to end
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToEnd'));
			menuitem.setAttribute('disabled', tabIndex == this._tabs.length - 1);
			menuitem.addEventListener('command', () => {
				this.move(id, this._tabs.length);
			});
			menupopup.appendChild(menuitem);
			// Move to new window
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.moveToWindow'));
			menuitem.setAttribute('disabled', false);
			menuitem.addEventListener('command', () => {
				let { tab } = this._getTab(id);
				if (tab && (tab.type === 'reader' || tab.type === 'reader-unloaded')) {
					this.close(id);
					let { itemID, secondViewState } = tab.data;
					Zotero.Reader.open(itemID, null, { openInWindow: true, secondViewState });
				}
			});
			menupopup.appendChild(menuitem);
			// Duplicate tab
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.duplicate'));
			menuitem.addEventListener('command', () => {
				if (tab.data.itemID) {
					tabIndex++;
					let { secondViewState } = tab.data;
					Zotero.Reader.open(tab.data.itemID, null, { tabIndex, allowDuplicate: true, secondViewState });
				}
			});
			popup.appendChild(menuitem);
			// Separator
			popup.appendChild(document.createXULElement('menuseparator'));
		}
		// Close
		if (id != 'zotero-pane') {
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('general.close'));
			menuitem.addEventListener('command', () => {
				this.close(id);
			});
			popup.appendChild(menuitem);
		}
		// Close other tabs
		if (!(this._tabs.length == 2 && id != 'zotero-pane')) {
			menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', Zotero.getString('tabs.closeOther'));
			menuitem.addEventListener('command', () => {
				this.close(this._tabs.slice(1).filter(x => x.id != id).map(x => x.id));
			});
			popup.appendChild(menuitem);
		}
		// Undo close
		menuitem = document.createXULElement('menuitem');
		menuitem.setAttribute(
			'label',
			Zotero.getString(
				'tabs.undoClose',
				[],
				// If not disabled, show proper plural for tabs to reopen
				this._history.length ? this._history[this._history.length - 1].length : 1
			)
		);
		menuitem.setAttribute('disabled', !this._history.length);
		menuitem.addEventListener('command', () => {
			this.undoClose();
		});
		popup.appendChild(menuitem);
		popup.openPopupAtScreen(x, y, true);
	};

	// Used to move focus back to itemTree or contextPane from the tabs.
	this.focusWrapAround = function () {
		// If no item is selected, focus items list.
		const pane = document.getElementById("zotero-item-pane-content");
		if (pane.selectedIndex === "0") {
			document.getElementById("item-tree-main-default").focus();
		}
		else {
			let selected = ZoteroPane.getSelectedItems();
			// If the selected collection row is duplicates, just focus on the
			// itemTree until the merge pane is keyboard accessible
			// If multiple items selected, focus on itemTree as well.
			let collectionRow = ZoteroPane.collectionsView.selectedTreeRow;
			if (collectionRow.isDuplicates() || selected.length !== 1) {
				document.getElementById("item-tree-main-default").focus();
				return;
			}
			// Special treatment for notes and attachments in itemPane
			selected = selected[0];
			if (selected.isNote()) {
				document.getElementById("zotero-note-editor").focus();
				return;
			}
			if (selected.isAttachment()) {
				document.getElementById("attachment-note-editor").focus();
				return;
			}
			// For regular items, focus the last field
			// We do that by moving focus backwards from the element following the pane, because Services.focus doesn't
			// support MOVEFOCUS_LAST on subtrees
			Services.focus.moveFocus(window, document.getElementById('zotero-context-splitter'),
				Services.focus.MOVEFOCUS_BACKWARD, 0);
		}
	};

	/**
	 * @param {title} String - Tab's title
	 * @returns <description> with bold substrings of title matching this._tabsMenuFilter
	 */
	let createTabsMenuLabel = (title) => {
		let xhtmlNS = "http://www.w3.org/1999/xhtml";
		let desc = document.createXULElement('description');

		let regex = new RegExp(`(${Zotero.Utilities.quotemeta(this._tabsMenuFilter)})`, 'gi');
		let matches = title.matchAll(regex);

		let lastIndex = 0;

		for (let match of matches) {
			if (match.index > lastIndex) {
				// Add preceding text
				desc.appendChild(document.createTextNode(title.substring(lastIndex, match.index)));
			}
			// Add matched text wrapped in <b>
			let b = document.createElementNS(xhtmlNS, 'b');
			b.textContent = match[0];
			desc.appendChild(b);
			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < title.length) {
			// Add remaining text
			desc.appendChild(document.createTextNode(title.substring(lastIndex)));
		}
		return desc;
	};

	this.isTabsMenuVisible = () => {
		return ['showing', 'open'].includes(this.tabsMenuPanel.state);
	};

	/**
	 * Create the list of opened tabs in tabs menu.
	 */
	this.refreshTabsMenuList = () => {
		// Empty existing nodes
		this.tabsMenuList.replaceChildren();
		this._tabsMenuFocusedIndex = 0;
		let index = 1;
		for (let tab of this._tabs) {
			// Skip tabs whose title wasn't added yet
			if (tab.title == "") {
				continue;
			}
			// Filter tabs that do not match the filter
			if (!tab.title.toLowerCase().includes(this._tabsMenuFilter)) {
				continue;
			}
			// Top-level entry of the opened tabs array
			let row = document.createXULElement('toolbaritem');
			let rowIndex = this._tabs.findIndex(x => x.id === tab.id);
			row.setAttribute("index", rowIndex);
			
			// Title of the tab
			let tabName = document.createXULElement('toolbarbutton');
			tabName.setAttribute('flex', '1');
			tabName.setAttribute('class', 'zotero-tabs-menu-entry title');
			tabName.setAttribute('tabindex', `${index++}`);
			tabName.setAttribute('aria-label', tab.title);
			tabName.setAttribute('tooltiptext', tab.title);

			// Cross button to close a tab
			let closeButton = document.createXULElement('toolbarbutton');
			closeButton.setAttribute('class', 'zotero-tabs-menu-entry zotero-clicky-cross close');
			closeButton.setAttribute('data-l10n-id', 'zotero-tabs-menu-close-button');
			closeButton.addEventListener("command", () => {
				// Keep the focus on the cross at the same spot
				if (this._tabsMenuFocusedIndex == this.tabsMenuList.childElementCount * 2) {
					this._tabsMenuFocusedIndex = Math.max(this._tabsMenuFocusedIndex - 2, 0);
				}
				this.close(tab.id);
			});

			// Library tab has no close button
			if (tab.id == "zotero-pane") {
				closeButton.hidden = true;
				closeButton.disabled = true;
			}

			closeButton.setAttribute('tabindex', `${index++}`);

			// Item type icon
			let span = document.createElement("span");
			span.className = "icon icon-css tab-icon";
			if (tab.id == 'zotero-pane') {
				// Determine which icon from the collection view rows to use (same as in _update())
				let index = ZoteroPane.collectionsView?.selection?.focused;
				if (typeof index !== 'undefined' && ZoteroPane.collectionsView.getRow(index)) {
					let iconName = ZoteroPane.collectionsView.getIconName(index);
					span.classList.add(`icon-${iconName}`);
				}
			}
			else {
				span.classList.add("icon-item-type");
				let item = Zotero.Items.get(tab.data.itemID);
				let dataTypeLabel = item.getItemTypeIconName();
				span.setAttribute("data-item-type", dataTypeLabel);
			}

			tabName.appendChild(span);
			// Actual label with bolded substrings matching the filter
			let tabLabel = createTabsMenuLabel(tab.title, this._tabsMenuFilter);
			tabLabel.setAttribute('flex', 1);
			tabName.appendChild(tabLabel);

			// Selected tab is bold
			if (tab.id == this._selectedID) {
				tabName.classList.add('selected');
			}
			// Onclick, go to selected tab + close popup
			tabName.addEventListener("command", () => {
				this.tabsMenuPanel.hidePopup();
				this.select(tab.id);
			});
			// Manually handle hover effects as a workaround for a likely mozilla bug that
			// keeps :hover at the location of dragstart after drop.
			for (let node of [tabName, closeButton]) {
				node.addEventListener('mouseenter', (_) => {
					if (this._tabsMenuIgnoreMouseover) {
						return;
					}
					node.classList.add('hover');
					// If the mouse moves over a tab, send focus back to the panel
					// to avoid having two fields that appear greyed out.
					if (document.activeElement.id !== "zotero-tabs-menu-filter") {
						this._tabsMenuFocusedIndex = -1;
						this.tabsMenuPanel.focus();
					}
				});
				node.addEventListener('mouseleave', (_) => {
					node.classList.remove('hover');
				});
			}

			row.appendChild(tabName);
			row.appendChild(closeButton);
	
			row.addEventListener("dragstart", (e) => {
				// No drag-drop on the cross button or the library tab
				if (tab.id == 'zotero-pane' || e.target.classList.contains("close")) {
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				e.dataTransfer.setData('zotero/tab', tab.id);
				setTimeout(() => {
					row.classList.remove("hover");
					row.setAttribute("id", "zotero-tabs-menu-dragged");
				});
			});
			

			row.addEventListener('dragover', (e) => {
				e.preventDefault();
				let tabId = e.dataTransfer.getData("zotero/tab");
				if (!tabId || tab.id == "zotero-pane") {
					return false;
				}
				if (row.getAttribute("id") == "zotero-tabs-menu-dragged") {
					return true;
				}
				let placeholder = document.getElementById("zotero-tabs-menu-dragged");
				if (row.previousSibling?.id == placeholder.id) {
					// If the placeholder exists before the row, swap the placeholder and the row
					row.parentNode.insertBefore(row, placeholder);
					placeholder.setAttribute("index", parseInt(row.getAttribute("index")) + 1);
				}
				else {
					// Insert placeholder before the row
					row.parentNode.insertBefore(placeholder, row);
					placeholder.setAttribute("index", parseInt(row.getAttribute("index")));
				}
				return false;
			});

			row.addEventListener('drop', (e) => {
				let tabId = e.dataTransfer.getData("zotero/tab");
				let rowIndex = parseInt(row.getAttribute("index"));
				if (rowIndex == 0) return;
				this.move(tabId, rowIndex);
			});

			row.addEventListener('dragend', (_) => {
				// If this.move() wasn't called, just re-render the menu
				if (document.getElementById("zotero-tabs-menu-dragged")) {
					this.refreshTabsMenuList();
				}
			});
			this.tabsMenuList.appendChild(row);
		}
	};

	this.showTabsMenu = function (button) {
		this.tabsMenuPanel.openPopup(button, "after_start", -20, -2, false, false);
	};

	this.handleTabsMenuHiding = function (event) {
		if (event.originalTarget.id != 'zotero-tabs-menu-panel') return;

		// Empty out the filter input field
		let menuFilter = document.getElementById('zotero-tabs-menu-filter');
		menuFilter.value = "";
		this._tabsMenuFilter = "";
	};

	this.handleTabsMenuShown = function (_) {
		focusTabsMenuEntry(0);
	};

	/**
	 * Record the value of the filter
	 */
	this.handleTabsMenuFilterInput = function (_, input) {
		if (this._tabsMenuFilter == input.value.toLowerCase()) {
			return;
		}
		this._tabsMenuFilter = input.value.toLowerCase();
		this.refreshTabsMenuList();
	};

	this.resetFocusIndex = (_) => {
		this._tabsMenuFocusedIndex = 0;
	};


	/**
	 * Focus on the element in the tabs menu with [tabindex=tabIndex] if given
	 * or [tabindex=this._tabsMenuFocusedIndex] otherwise
	 */
	let focusTabsMenuEntry = (tabIndex = null) => {
		tabIndex = tabIndex !== null ? tabIndex : this._tabsMenuFocusedIndex;
		if (tabIndex === null) {
			return;
		}
		var nextTab = this.tabsMenuList.parentElement.querySelector(`[tabindex="${tabIndex}"]`);
		if (!nextTab) {
			return;
		}
		this._tabsMenuIgnoreMouseover = true;
		this._tabsMenuFocusedIndex = tabIndex;
		let hovered = this.tabsMenuList.querySelector(".hover");
		if (hovered) {
			hovered.classList.remove("hover");
		}
		nextTab.focus();
		// For some reason (likely a mozilla bug),
		// a mouseover event fires at the location where the drag event started after the drop.
		// To not mark the wrong entry as hovered, ignore mouseover events for a bit after the focus change
		setTimeout(() => {
			this._tabsMenuIgnoreMouseover = false;
		}, 250);
	};

	/**
	 * Keyboard navigation within the tabs menu
	 * - Tab/Shift-Tab moves focus from the input field across tab titles and close buttons
	 * - Enter from the input field focuses the first tab
	 * - Enter on a toolbarbutton clicks it
	 * - ArrowUp/ArrowDown on a toolbarbutton moves focus to the next/previous toolbarbutton of the
	 *   same type (e.g. arrowDown from title focuses the next title)
	 * - ArrowUp from the first tab or ArrowDown from the last tab focuses the filter field
	 * - ArrowDown from the filter field focuses the first tab
	 * - ArrowUp from the filter field focuses the last tab
	 * - Home/PageUp focuses the filter field
	 * - End/PageDown focues the last tab title
	 * - CMD-f will focus the input field
	 */
	this.handleTabsMenuKeyPress = function (event) {
		let tabindex = this._tabsMenuFocusedIndex;
		if (event.key == "Tab") {
			event.preventDefault();
			let isShift = event.shiftKey;
			let moveTabIndex = () => tabindex++;
			if (isShift) {
				moveTabIndex = () => tabindex--;
			}
			moveTabIndex();
			let candidate = this.tabsMenuList.parentElement.querySelector(`[tabindex="${tabindex}"]`);
			// If the candidate is disabled (e.g. close button of library tab), skip it
			if (candidate && candidate.disabled) {
				moveTabIndex();
			}
			focusTabsMenuEntry(tabindex);
		}
		else if (["Home", "PageUp"].includes(event.key)) {
			event.preventDefault();
			focusTabsMenuEntry(0);
		}
		else if (["End", "PageDown"].includes(event.key)) {
			event.preventDefault();
			focusTabsMenuEntry(this.tabsMenuList.childElementCount * 2 - 1);
		}
		else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
			event.preventDefault();
			let isFirstRow = tabindex <= 2 && tabindex > 0;
			// Step over 1 index to jump over close button, unless we move
			// from the filter field
			let step = tabindex == 0 ? 1 : 2;
			if (event.key == "ArrowDown") {
				tabindex += step;
			}
			else {
				tabindex -= step;
			}
			// If the candidate is a disabled element (e.g. close button of the library tab),
			// move focus to the element before it
			let candidate = this.tabsMenuList.parentElement.querySelector(`[tabindex="${tabindex}"]`);
			if (candidate && candidate.disabled) {
				tabindex--;
			}
			if (tabindex <= 0) {
				// ArrowUp from the first tab or the first close button focuses the filter field.
				// ArrowUp from the filter field focuses the last tab
				if (isFirstRow) {
					tabindex = 0;
				}
				else {
					tabindex = this.tabsMenuList.childElementCount * 2 - 1;
				}
			}
			// ArrowDown from the bottom focuses the filter field
			if (tabindex > this.tabsMenuList.childElementCount * 2) {
				tabindex = 0;
			}
			focusTabsMenuEntry(tabindex);
		}
		else if (event.key == "Enter") {
			event.preventDefault();
			if (event.target.id == "zotero-tabs-menu-filter") {
				focusTabsMenuEntry(1);
				return;
			}
			event.target.click();
		}
		else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
			event.preventDefault();
			event.stopPropagation();
		}
		else if (event.key == "f" && (Zotero.isMac ? event.metaKey : event.ctrlKey)) {
			focusTabsMenuEntry(0);
			event.preventDefault();
			event.stopPropagation();
		}
	};
};

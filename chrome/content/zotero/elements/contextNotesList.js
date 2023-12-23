/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2023 Corporation for Digital Scholarship
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

"use strict";

{
	const MAX_UNEXPANDED_ALL_NOTES = 7;
	
	class ContextNotesList extends XULElementBase {
		content = MozXULElement.parseXULToFragment(`
			<html:div>
				<collapsible-section data-pane="context-item-notes" show-add="true" class="item-notes">
					<html:div class="body"/>
				</collapsible-section>
			</html:div>
			<html:div>
				<collapsible-section data-pane="context-all-notes" show-add="true" class="all-notes">
					<html:div class="body"/>
				</collapsible-section>
			</html:div>
		`, ['chrome://zotero/locale/zotero.dtd']);
		
		_itemNotes = [];
		
		_allNotes = [];
		
		_expanded = false;
		
		_numVisible = 0;
		
		_hasParent = false;
		
		get notes() {
			return [...this._itemNotes, ...this._allNotes];
		}
		
		set notes(val) {
			let itemNotes = [];
			let allNotes = [];
			for (let note of val) {
				if (note.isCurrentChild) {
					itemNotes.push(note);
				}
				else {
					allNotes.push(note);
				}
			}
			this._itemNotes = itemNotes;
			this._allNotes = allNotes;
			this.render();
		}
		
		get expanded() {
			return this._expanded;
		}
		
		set expanded(val) {
			this._expanded = val;
			if (val) {
				this.numVisible += 1000;
			}
			else {
				this.numVisible = 0;
			}
		}
		
		get numVisible() {
			return this._numVisible;
		}
		
		set numVisible(val) {
			this._numVisible = val;
			this.render();
		}
		
		get hasParent() {
			return this._hasParent;
		}
		
		set hasParent(val) {
			this._hasParent = val;
			this.render();
		}

		init() {
			this._itemNotesSection = this.querySelector('.item-notes');
			this._allNotesSection = this.querySelector('.all-notes');
			
			this._itemNotesSection.label = Zotero.getString('pane.context.itemNotes');
			this._allNotesSection.label = Zotero.getString('pane.context.allNotes');
			
			this._itemNotesSection.addEventListener('add', this._handleAddNote);
			this._allNotesSection.addEventListener('add', this._handleAddNote);
			
			this.addEventListener('click', this._handleClick);
			this.addEventListener('contextmenu', this._handleContextMenu);
			this.render();
		}
		
		render() {
			this._itemNotesSection.empty = !this._itemNotes.length;
			this._allNotesSection.empty = !this._allNotes.length;
			
			let itemNotesBody = this._itemNotesSection.querySelector('.body');
			let allNotesBody = this._allNotesSection.querySelector('.body');
			
			itemNotesBody.replaceChildren();
			for (let note of this._itemNotes) {
				itemNotesBody.append(this._makeRow(note));
			}
			
			allNotesBody.replaceChildren();
			let visibleNotes = this._allNotes.slice(0, this._expanded ? this._numVisible : MAX_UNEXPANDED_ALL_NOTES);
			for (let note of visibleNotes) {
				allNotesBody.append(this._makeRow(note));
			}
			if (visibleNotes.length < this._allNotes.length) {
				let moreButton = document.createElement('button');
				moreButton.className = 'more';
				moreButton.textContent = Zotero.getString('general.numMore', Zotero.Utilities.numberFormat(
					[this._allNotes.length - visibleNotes.length], 0));
				moreButton.addEventListener('click', () => {
					this.expanded = true;
				});
				allNotesBody.append(moreButton);
			}
		}
		
		_makeRow(note) {
			let row = document.createXULElement('note-row');
			row.note = note;
			return row;
		}
		
		_handleClick = (event) => {
			if (event.button !== 0) return;
			let note = event.target.closest('note-row')?.note;
			if (note) {
				this.dispatchEvent(new CustomEvent('note-click', {
					...event,
					bubbles: true,
					detail: { id: note.id }
				}));
			}
		};
		
		_handleContextMenu = (event) => {
			let note = event.target.closest('note-row')?.note;
			if (note) {
				this.dispatchEvent(new CustomEvent('note-contextmenu', {
					bubbles: true,
					detail: {
						screenX: event.screenX,
						screenY: event.screenY,
						id: note.id
					}
				}));
			}
		};
		
		_handleAddNote = (event) => {
			let eventName = event.target.closest('collapsible-section') == this._itemNotesSection
				? 'add-child'
				: 'add-standalone';
			this.dispatchEvent(new CustomEvent(eventName, {
				bubbles: true,
				detail: { button: event.detail.button }
			}));
		};
	}
	customElements.define("context-notes-list", ContextNotesList);
}

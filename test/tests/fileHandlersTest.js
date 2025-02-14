describe("Zotero.FileHandlers", () => {
	describe("open()", () => {
		var win;
		
		function clearPrefs() {
			Zotero.Prefs.clear('fileHandler.pdf');
			Zotero.Prefs.clear('fileHandler.epub');
			Zotero.Prefs.clear('fileHandler.snapshot');
			Zotero.Prefs.clear('openReaderInNewWindow');
		}
		
		before(async function () {
			clearPrefs();
			win = await loadZoteroPane();
		});

		afterEach(function () {
			clearPrefs();
			delete Zotero.FileHandlers._mockHandlers;
			for (let reader of Zotero.Reader._readers) {
				reader.close();
			}
		});

		after(async function () {
			win.close();
		});
		
		it("should open a PDF internally when no handler is set", async function () {
			let pdf = await importFileAttachment('wonderland_short.pdf');
			await Zotero.FileHandlers.open(pdf, {
				location: { pageIndex: 2 }
			});
			let reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
			assert.ok(reader);
			
			// Wait for _setState() (is there an easier way to do this?)
			let stub = sinon.stub(reader, '_setState');
			let setStatePromise = new Promise((resolve) => {
				stub.callsFake(async (...args) => {
					await stub.wrappedMethod.apply(reader, args);
					resolve();
				});
			});
			await reader._waitForReader();
			await setStatePromise;
			
			// Check that the reader navigated to the correct page
			assert.equal(pdf.getAttachmentLastPageIndex(), 2);
			stub.restore();
		});

		it("should open a PDF in a new window when no handler is set and openInWindow is passed", async function () {
			let pdf = await importFileAttachment('wonderland_short.pdf');
			await Zotero.FileHandlers.open(pdf, {
				location: { pageIndex: 2 },
				openInWindow: true
			});
			assert.notOk(Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID));
			assert.isNotEmpty(Zotero.Reader.getWindowStates());
		});
		
		it("should use matching handler", async function () {
			let pdf = await importFileAttachment('wonderland_short.pdf');
			let wasRun = false;
			let readerOpenSpy = sinon.spy(Zotero.Reader, 'open');
			Zotero.FileHandlers._mockHandlers = {
				pdf: [
					{
						name: /mock/,
						async open() {
							wasRun = true;
						}
					}
				]
			};
			Zotero.Prefs.set('fileHandler.pdf', 'mock');
			
			await Zotero.FileHandlers.open(pdf);
			assert.isTrue(wasRun);
			assert.isFalse(readerOpenSpy.called);
			assert.notOk(Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID));
			assert.isEmpty(Zotero.Reader.getWindowStates());

			readerOpenSpy.restore();
		});

		it("should fall back to fallback handler when location is passed", async function () {
			let pdf = await importFileAttachment('wonderland_short.pdf');
			let wasRun = false;
			let readerOpenSpy = sinon.spy(Zotero.Reader, 'open');
			Zotero.FileHandlers._mockHandlers = {
				pdf: [
					{
						name: /mock/,
						fallback: true,
						async open(appPath) {
							assert.notOk(appPath); // appPath won't be set when called as fallback
							wasRun = true;
						}
					}
				]
			};

			// Set our custom handler to something nonexistent,
			// and stub the system handler to something nonexistent as well
			Zotero.Prefs.set('fileHandler.pdf', 'some nonexistent tool');
			let getSystemHandlerStub = sinon.stub(Zotero.FileHandlers, '_getSystemHandler');
			getSystemHandlerStub.returns('some other nonexistent tool');

			await Zotero.FileHandlers.open(pdf, { location: {} });
			assert.isTrue(wasRun);
			assert.isFalse(readerOpenSpy.called);
			assert.notOk(Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID));
			assert.isEmpty(Zotero.Reader.getWindowStates());

			readerOpenSpy.restore();
			getSystemHandlerStub.restore();
		});
	});
});

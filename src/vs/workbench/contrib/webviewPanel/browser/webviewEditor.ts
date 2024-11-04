/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { generateUuid } from 'vs/base/common/uuid';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { Parts } from 'vs/platform/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IOverlayWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewWindowDragMonitor } from 'vs/workbench/contrib/webview/browser/webviewWindowDragMonitor';
import { WebviewInput } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditorInput';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export class WebviewEditor extends EditorPane {

	public static readonly ID = 'WebviewEditor';

	private _element?: HTMLElement;
	private _dimension?: DOM.Dimension;
	private _visible = false;
	private _isDisposed = false;

	private readonly _webviewVisibleDisposables = this._register(new DisposableStore());
	private readonly _onFocusWindowHandler = this._register(new MutableDisposable());

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	public override get onDidFocus(): Event<any> { return this._onDidFocusWebview.event; }

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IContextKeyService>());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _workbenchLayoutService: IWorkbenchLayoutService,
		@IHostService private readonly _hostService: IHostService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super(WebviewEditor.ID, telemetryService, themeService, storageService);

		this._register(Event.any(
			_editorGroupsService.onDidScroll,
			_editorGroupsService.onDidAddGroup,
			_editorGroupsService.onDidRemoveGroup,
			_editorGroupsService.onDidMoveGroup,
		)(() => {
			if (this.webview && this._visible) {
				this.synchronizeWebviewContainerDimensions(this.webview);
			}
		}));
	}

	private get webview(): IOverlayWebview | undefined {
		return this.input instanceof WebviewInput ? this.input.webview : undefined;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	protected createEditor(parent: HTMLElement): void {
		const element = document.createElement('div');
		this._element = element;
		// 创建一个webview-editor-element-uuid的id   webview的element用于占位，但是webviewOverlay用于显示
		this._element.id = `webview-editor-element-${generateUuid()}`;
		parent.appendChild(element);

		this._scopedContextKeyService.value = this._contextKeyService.createScoped(element);
	}

	public override dispose(): void {
		this._isDisposed = true;

		this._element?.remove();
		this._element = undefined;

		super.dispose();
	}

	public override layout(dimension: DOM.Dimension): void {
		// let webviewElement = this.webview?.container;
		// let myDoc = this._element?.ownerDocument;
		// if (myDoc && webviewElement && webviewElement.ownerDocument &&
		// 	this._element?.ownerDocument !== webviewElement.ownerDocument) {
		// 	// let parent = myDoc.querySelector('[role="application"]') as HTMLElement;
		// 	// parent?.appendChild(webviewElement);
		// }
		this._dimension = dimension;
		if (this.webview && this._visible) {
			this.synchronizeWebviewContainerDimensions(this.webview, dimension);
		}
	}

	public override focus(): void {
		super.focus();
		if (!this._onFocusWindowHandler.value && !isWeb) {
			// Make sure we restore focus when switching back to a VS Code window
			this._onFocusWindowHandler.value = this._hostService.onDidChangeFocus(focused => {
				if (focused && this._editorService.activeEditorPane === this && this._workbenchLayoutService.hasFocus(Parts.EDITOR_PART)) {
					this.focus();
				}
			});
		}
		this.webview?.focus();
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		this._visible = visible;
		if (this.input instanceof WebviewInput && this.webview) {
			if (visible) {
				this.claimWebview(this.input);
			} else {
				this.webview.release(this);
			}
		}
		super.setEditorVisible(visible, group);
	}

	public override clearInput() {
		if (this.webview) {
			this.webview.release(this);
			this._webviewVisibleDisposables.clear();
		}

		super.clearInput();
	}

	public override async setInput(input: EditorInput, options: IEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (this.input && input.matches(this.input)) {
			return;
		}

		// 已经有了webviewOverlay对象（显示）
		const alreadyOwnsWebview = input instanceof WebviewInput && input.webview === this.webview;
		if (this.webview && !alreadyOwnsWebview) {
			this.webview.release(this);
		}

		await super.setInput(input, options, context, token);
		await input.resolve();

		if (token.isCancellationRequested || this._isDisposed) {
			return;
		}

		if (input instanceof WebviewInput) {
			// 设置WebviewInput
			if (this.group) {
				input.updateGroup(this.group.id);
			}

			if (!alreadyOwnsWebview) {
				// 创建webviewOverlay对象
				this.claimWebview(input);
			}
			if (this._dimension) {
				this.layout(this._dimension);
			}
		}
	}

	private claimWebview(input: WebviewInput): void {
		input.webview.window = this._element?.ownerDocument.defaultView || window;
		input.webview.claim(this, this.scopedContextKeyService);

		if (this._element) {
			this._element.setAttribute('aria-flowto', input.webview.container.id);
			DOM.setParentFlowTo(input.webview.container, this._element);
		}

		this._webviewVisibleDisposables.clear();

		// Webviews are not part of the normal editor dom, so we have to register our own drag and drop handler on them.
		this._webviewVisibleDisposables.add(this._editorGroupsService.createEditorDropTarget(input.webview.container, {
			containsGroup: (group) => this.group?.id === group.id
		}));

		this._webviewVisibleDisposables.add(new WebviewWindowDragMonitor(() => this.webview));

		this.synchronizeWebviewContainerDimensions(input.webview);
		this._webviewVisibleDisposables.add(this.trackFocus(input.webview));

	}

	private synchronizeWebviewContainerDimensions(webview: IOverlayWebview, dimension?: DOM.Dimension) {
		if (!this._element) {
			return;
		}
		// 这里，获取的是主窗口的EDITOR_PART位置，不适合副窗口
		let rootContainer = this._workbenchLayoutService.getContainer(window, Parts.EDITOR_PART);
		if (rootContainer && rootContainer.ownerDocument !== this._element.ownerDocument) {
			if (this.webview) {
				this.webview.window = this._element.ownerDocument.defaultView || window;
			}
			// 获取webview窗口（rootContainer）的位置
			rootContainer = this._element.ownerDocument.querySelector(`[id = "${this.webview?.container.getAttribute('data-parent-flow-to-element-id')}"]`)?.parentElement as HTMLElement || undefined;
		}
		// 根据rootContainer的位置，重新设置webview的位置
		webview.layoutWebviewOverElement(this._element.parentElement!, dimension, rootContainer);
	}

	private trackFocus(webview: IOverlayWebview): IDisposable {
		const store = new DisposableStore();

		// Track focus in webview content
		const webviewContentFocusTracker = DOM.trackFocus(webview.container);
		store.add(webviewContentFocusTracker);
		store.add(webviewContentFocusTracker.onDidFocus(() => this._onDidFocusWebview.fire()));

		// Track focus in webview element
		store.add(webview.onDidFocus(() => this._onDidFocusWebview.fire()));

		return store;
	}
}

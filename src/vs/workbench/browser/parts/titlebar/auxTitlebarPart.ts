/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dfs Corporation. All rights reserved.
 *  See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./media/titlebarpart';
import { Emitter, Event } from 'vs/base/common/event';
import {
	$, Dimension, EventHelper, EventType,
	addDisposableListener, append,
	copyAttributes, getClientArea, position,
	registerWindow, size, trackAttributes
} from 'vs/base/browser/dom';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isWeb } from 'vs/base/common/platform';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import { Color } from 'vs/base/common/color';
import { getTitleBarStyle } from 'vs/platform/window/common/window';

export interface IAuxiliaryWindow extends IDisposable {

	readonly onDidResize: Event<Dimension>;
	readonly onDidClose: Event<void>;

	readonly container: HTMLElement;
}
let counter = 0;
export class AuxWindow extends Themable implements IDisposable, IAuxiliaryWindow {
	minimumWidth: number = 300;
	maximumWidth: number = Number.POSITIVE_INFINITY;
	minimumHeight: number = 200;
	maximumHeight: number = Number.POSITIVE_INFINITY;
	override themeService: any;
	toJSON(): object {
		throw new Error('Method not implemented.');
	}

	private readonly _onDidResize: Emitter<Dimension> = this._register(new Emitter<Dimension>);
	readonly onDidResize: Event<Dimension> = this._onDidResize.event;

	private readonly _onDidClose: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidClose: Event<void> = this._onDidClose.event;

	container: HTMLElement;
	private readonly disposables: DisposableStore;
	readonly id: number;

	override dispose(): void {
		if (!this.disposables.isDisposed) {
			this.disposables.dispose();
		}
	}

	override updateStyles(): void {
		// 更新CSS
		this.updateCSS(this.auxiliaryWindow);
		// 更新titlebar的颜色
		const titleBarColor = this.theme.getColor(this.theme.type === 'light' ? 'titleBar.activeBackground' : 'titleBar.activeBackground')?.toString() || '';
		const titlebarPart = this.auxiliaryWindow.document.querySelector('.part.titlebar') as HTMLElement;
		titlebarPart.style.cssText = `background-color: ${titleBarColor};height:30px; -webkit-app-region: drag;`;
		const symbolColor = Color.fromHex(titleBarColor).isDarker() ? '#FFFFFF' : '#000000';

		// 向主进程发送消息，更新窗口的titlebar的颜色 todo@rengy check id of updateAuxTitleBarOverlay()
		this.nativeHostService.updateAuxTitleBarOverlay(0, titleBarColor, symbolColor);
	}

	constructor(
		public auxiliaryWindow: Window & typeof globalThis,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@INativeHostMainService private readonly nativeHostService: INativeHostMainService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchLayoutService protected readonly layoutService: IWorkbenchLayoutService
	) {
		super(themeService);
		this.disposables = new DisposableStore();

		// 保存窗口到窗口列表
		this.disposables.add(registerWindow(auxiliaryWindow));
		// 设置窗口关闭时的回调
		this.disposables.add(toDisposable(() => auxiliaryWindow.close()));

		// 屏蔽窗口的createElement方法
		this.blockMethods(auxiliaryWindow);

		// 设置窗口head的Meta标签
		this.applyMeta(auxiliaryWindow);
		// 设置窗口head的CSS标签
		this.applyCSS(auxiliaryWindow);

		// 创建窗口的body中的div元素，用于放置工作台(layoutService)
		const container = this.applyHTML(auxiliaryWindow);

		// 监听窗口的resize事件和关闭事件和相关的绑定EventEmitter
		this.registerListeners(auxiliaryWindow, container);

		// 声明周期结束时，清理工作
		this.disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => this.dispose()));

		const theme = this.themeService.getColorTheme();
		const titleBarColor = theme.getColor(theme.type === 'light' ? 'titleBar.activeBackground' : 'titleBar.activeBackground')?.toString() || '';

		// window.auxWindow.noTitle === true，表示副窗口不显示titlebar
		if ((!configurationService.getValue('window.auxWindow.hasTitle') ||
			(getTitleBarStyle(configurationService) !== 'custom'))) {
			// class="tabs-container" 这个是titlebar的容器
			// class="tab" 这个是tab页
			// let titlebar_width = auxiliaryWindow
			const style = document.createElement('style');
			style.innerText = `.tabs-container { -webkit-app-region: drag; }\n`;
			style.innerText += `.tab { -webkit-app-region: no-drag; }\n`;
			style.innerText += `.editor-group-container { width:100% - 136px; }\n`;
			// // 加入titlebar的容器
			// const tc = prepend(container, $('div.titlebar-container'));
			// prepend(tc, $('a.window-appicon'));
			auxiliaryWindow.document.head.appendChild(style.cloneNode(true));
		}
		else {
			const titlebarPart = document.createElement('div');
			titlebarPart.classList.add('part', 'titlebar');
			titlebarPart.setAttribute('role', 'none');
			titlebarPart.style.position = 'relative';
			titlebarPart.style.cssText = `background-color: ${titleBarColor};height:30px; -webkit-app-region: drag;`;

			// 加入titlebar的容器
			const tc = append(titlebarPart, $('div.titlebar-container'));
			// 加入titlebar的内容
			append(tc, $('a.window-appicon'));
			container.insertBefore(titlebarPart, container.firstChild); // ensure we are first element

			// 右侧窗口控制按钮(一 口 X)占位
			append(titlebarPart, $('div.window-controls-container'));
		}
		auxiliaryWindow.onfocus = () => {
			// 激活窗口
			// console.log("auxiliaryWindow.onfocus");
		};
		this.container = container;
		this.id = counter++;
	}

	private applyMeta(auxiliaryWindow: Window): void {
		const metaCharset = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
		metaCharset.setAttribute('charset', 'utf-8');

		const originalCSPMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
		if (originalCSPMetaTag) {
			const csp = auxiliaryWindow.document.head.appendChild(document.createElement('meta'));
			copyAttributes(originalCSPMetaTag, csp);
		}
	}

	// 更新CSS,将主窗口的CSS更新到副窗口
	private updateCSS(win: Window): void {
		// 清理旧的CSS
		const oldStyles = win.document.head.querySelectorAll('link[rel="stylesheet"], style');
		for (const element of oldStyles) {
			win.document.head.removeChild(element);
		}

		// Clone all style elements and stylesheet links from the window to the child window
		for (const element of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
			win.document.head.appendChild(element.cloneNode(true));
		}
	}

	private applyCSS(auxiliaryWindow: Window): void {

		this.updateCSS(auxiliaryWindow);

		// Running out of sources: listen to new stylesheets as they
		// are being added to the main window and apply to child window
		if (!this.environmentService.isBuilt) {
			const observer = new MutationObserver(mutations => {
				for (const mutation of mutations) {
					if (mutation.type === 'childList') {
						for (const node of mutation.addedNodes) {
							if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'style') {
								auxiliaryWindow.document.head.appendChild(node.cloneNode(true));
							}
						}
					}
				}
			});

			observer.observe(document.head, { childList: true });
			this.disposables.add(toDisposable(() => observer.disconnect()));
		}
	}

	private applyHTML(auxiliaryWindow: Window): HTMLElement {

		// Create workbench container and apply classes
		const container = document.createElement('div');
		auxiliaryWindow.document.body.append(container);

		// Track attributes
		this.disposables.add(trackAttributes(document.documentElement, auxiliaryWindow.document.documentElement));
		this.disposables.add(trackAttributes(document.body, auxiliaryWindow.document.body));
		this.disposables.add(trackAttributes(this.layoutService.container, container, ['class'])); // only class attribute

		return container;
	}

	private registerListeners(auxiliaryWindow: Window & typeof globalThis, container: HTMLElement) {

		let exitWindow = false;
		const winDispose = new DisposableStore();
		// 监听窗口的message事件,收到消息后关闭窗口
		winDispose.add(addDisposableListener(window, 'message', async (event) => {
			if (event.data.type === 'unloadAuxiliaryWindow' && event.data.content === `${this.id}`) {
				this._onDidClose.fire();		// 发送消息，执行清理工作
				setTimeout(() => {
					// 清理之后，关闭窗口
					exitWindow = true;
					auxiliaryWindow.close();
				}, 100);
			}
		}));

		winDispose.add(addDisposableListener(auxiliaryWindow, 'beforeunload', (e) => {
			if (exitWindow) {
				// 此两个事件监听器在此处清理
				winDispose.dispose();
				return;
			}
			// 阻止窗口关闭
			e.preventDefault();
			e.returnValue = '';
			// 关闭窗口
			window.postMessage({ type: 'unloadAuxiliaryWindow', content: `${this.id}` });
		}));

		this.disposables.add(addDisposableListener(auxiliaryWindow, 'unhandledrejection', e => {
			onUnexpectedError(e.reason);
			e.preventDefault();
		}));

		this.disposables.add(addDisposableListener(auxiliaryWindow, EventType.RESIZE, () => {
			// 尺寸需要使用新创建的窗口的尺寸
			const dimension = getClientArea(auxiliaryWindow.document.body);
			position(container, 0, 0, 0, 0, 'relative');
			size(container, dimension.width, dimension.height);

			this._onDidResize.fire(dimension);
		}));

		if (isWeb) {
			this.disposables.add(addDisposableListener(this.layoutService.container, EventType.DROP, e => EventHelper.stop(e, true))); 			// Prevent default navigation on drop
			this.disposables.add(addDisposableListener(container, EventType.WHEEL, e => e.preventDefault(), { passive: false })); 				// Prevent the back/forward gestures in macOS
			this.disposables.add(addDisposableListener(this.layoutService.container, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true))); 	// Prevent native context menus in web
		} else {
			this.disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DRAG_OVER, (e: DragEvent) => EventHelper.stop(e)));	// Prevent drag feedback on <body>
			this.disposables.add(addDisposableListener(auxiliaryWindow.document.body, EventType.DROP, (e: DragEvent) => EventHelper.stop(e)));		// Prevent default navigation on drop
		}
	}

	private blockMethods(auxiliaryWindow: Window): void {
		auxiliaryWindow.document.createElement = function () {
			throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
		};
	}
}


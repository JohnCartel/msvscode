/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, TitleBarOverlay, WebContents } from 'electron';
import { Event } from 'vs/base/common/event';
import { IProcessEnvironment, isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { ServicesAccessor, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICodeWindow, defaultWindowState } from 'vs/platform/window/electron-main/window';
import { IOpenEmptyWindowOptions, IWindowOpenable, IWindowSettings, WindowMinimumSize, getTitleBarStyle, useWindowControlsOverlay, zoomLevelToZoomFactor } from 'vs/platform/window/common/window';
import { join } from 'path';
import { IThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { Color } from 'vs/base/common/color';
import { FileAccess } from 'vs/base/common/network';

export const IWindowsMainService = createDecorator<IWindowsMainService>('windowsMainService');

export interface IWindowsMainService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeWindowsCount: Event<IWindowsCountChangedEvent>;

	readonly onDidOpenWindow: Event<ICodeWindow>;
	readonly onDidSignalReadyWindow: Event<ICodeWindow>;
	readonly onDidTriggerSystemContextMenu: Event<{ window: ICodeWindow; x: number; y: number }>;
	readonly onDidDestroyWindow: Event<ICodeWindow>;

	open(openConfig: IOpenConfiguration): ICodeWindow[];
	openEmptyWindow(openConfig: IOpenEmptyConfiguration, options?: IOpenEmptyWindowOptions): ICodeWindow[];
	openExistingWindow(window: ICodeWindow, openConfig: IOpenConfiguration): void;
	openExtensionDevelopmentHostWindow(extensionDevelopmentPath: string[], openConfig: IOpenConfiguration): ICodeWindow[];

	sendToFocused(channel: string, ...args: any[]): void;
	sendToAll(channel: string, payload?: any, windowIdsToIgnore?: number[]): void;

	getWindows(): ICodeWindow[];
	getWindowCount(): number;

	getFocusedWindow(): ICodeWindow | undefined;
	getLastActiveWindow(): ICodeWindow | undefined;

	getWindowById(windowId: number): ICodeWindow | undefined;
	getWindowByWebContents(webContents: WebContents): ICodeWindow | undefined;
}

export interface IWindowsCountChangedEvent {
	readonly oldCount: number;
	readonly newCount: number;
}

export const enum OpenContext {

	// opening when running from the command line
	CLI,

	// macOS only: opening from the dock (also when opening files to a running instance from desktop)
	DOCK,

	// opening from the main application window
	MENU,

	// opening from a file or folder dialog
	DIALOG,

	// opening from the OS's UI
	DESKTOP,

	// opening through the API
	API
}

export interface IBaseOpenConfiguration {
	readonly context: OpenContext;
	readonly contextWindowId?: number;
}

export interface IOpenConfiguration extends IBaseOpenConfiguration {
	readonly cli: NativeParsedArgs;
	readonly userEnv?: IProcessEnvironment;
	readonly urisToOpen?: IWindowOpenable[];
	readonly waitMarkerFileURI?: URI;
	readonly preferNewWindow?: boolean;
	readonly forceNewWindow?: boolean;
	readonly forceNewTabbedWindow?: boolean;
	readonly forceReuseWindow?: boolean;
	readonly forceEmpty?: boolean;
	readonly diffMode?: boolean;
	readonly mergeMode?: boolean;
	addMode?: boolean;
	readonly gotoLineMode?: boolean;
	readonly initialStartup?: boolean;
	readonly noRecentEntry?: boolean;
	/**
	 * The remote authority to use when windows are opened with either
	 * - no workspace (empty window)
	 * - a workspace that is neither `file://` nor `vscode-remote://`
	 */
	readonly remoteAuthority?: string;
}

export interface IOpenEmptyConfiguration extends IBaseOpenConfiguration { }

export enum UpdateWindowEvent {
	Close = 'Close',
	Create = 'Create'
}

const auxWindows = new Map<number, BrowserWindow>();

export function getActiveBrowserWindow() {
	for (const window of auxWindows.values()) {
		if (window.isFocused()) {
			return window;
		}
	}
	return undefined;
}

export function updateWindow(window: BrowserWindow, event: UpdateWindowEvent) {
	if (event === UpdateWindowEvent.Create) {
		auxWindows.set(window.id, window);
		// 副窗口暂定不适用菜单：创建窗口时，需要将副窗口的menu设置为null
		// 此时不需要判断是否是native模式，因为在custom模式下，不使用系统菜单
		if (window.id > 2) {
			window.setMenu(null);
		}
	}
	else {
		auxWindows.delete(window.id);
	}
}

export function updateAuxWindowsTitleControl(color: string, symbolColor: string) {
	for (const window of auxWindows.values()) {
		// 由于没有办法判断是否VScode的主窗口，所以这里只能通过window.id来判断
		if (window.id > 2) {
			window.setTitleBarOverlay({
				color: color,
				symbolColor: symbolColor
			});
			// 副窗口暂定不适用菜单：更新窗口的titlebar时，需要将副窗口的menu设置为null
			// 此时不需要判断是否是native模式，因为在custom模式下，不使用系统菜单
			window.setMenu(null);
		}
	}
}

// 副窗口暂定不适用菜单:刷新窗口的menu时，需要将副窗口的menu设置为null
// 此时不需要判断是否是native模式，因为只有在native模式才会使用该函数刷新系统菜单
export function updateAuxWindowsMenu() {
	for (const window of auxWindows.values()) {
		// 由于没有办法判断是否VScode的主窗口，所以这里只能通过window.id来判断
		if (window.id > 2) {
			window.setMenu(null);
		}
	}
}

export function defaultBrowserWindowOptions(
	accessor: ServicesAccessor,
	isMainWindow: boolean = false,
	windowState = defaultWindowState(),
	overrides?: BrowserWindowConstructorOptions):
	BrowserWindowConstructorOptions & { experimentalDarkMode: boolean } {

	// 设置窗口的默认属性
	const themeMainService = accessor.get(IThemeMainService);
	const productService = accessor.get(IProductService);
	const configurationService = accessor.get(IConfigurationService);
	const environmentMainService = accessor.get(IEnvironmentMainService);

	const windowSettings = configurationService.getValue<IWindowSettings | undefined>('window');

	const options: BrowserWindowConstructorOptions & { experimentalDarkMode: boolean } = {
		backgroundColor: themeMainService.getBackgroundColor(),
		minWidth: WindowMinimumSize.WIDTH,
		minHeight: WindowMinimumSize.HEIGHT,
		title: productService.nameLong,
		...overrides,
		webPreferences: {
			preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js', require).fsPath,
			v8CacheOptions: environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
			enableWebSQL: false,
			spellcheck: false,
			// nativeWindowOpen: true,
			zoomFactor: zoomLevelToZoomFactor(windowSettings?.zoomLevel),
			// Enable experimental css highlight api https://chromestatus.com/feature/5436441440026624
			// Refs https://github.com/microsoft/vscode/issues/140098
			enableBlinkFeatures: 'HighlightAPI',
			// ...environmentMainService.sandbox ?
			// 	// Sandbox
			// 	{
			// 		sandbox: true
			// 	} :
			// 	// No Sandbox
			// 	{
			// 		nodeIntegration: true,
			// 		contextIsolation: false
			// 	},
			...{
				nodeIntegration: true,
				contextIsolation: false
			},
			...overrides?.webPreferences
		},
		experimentalDarkMode: true
	};

	if (isLinux) {
		options.icon = join(environmentMainService.appRoot, 'resources/linux/code.png'); // always on Linux
	} else if (isWindows && !environmentMainService.isBuilt) {
		options.icon = join(environmentMainService.appRoot, 'resources/win32/code_150x150.png'); // only when running out of sources on Windows
	}

	if (isMacintosh) {
		options.acceptFirstMouse = true; // enabled by default

		if (windowSettings?.clickThroughInactive === false) {
			options.acceptFirstMouse = false;
		}
	}

	const useCustomTitleStyle = getTitleBarStyle(configurationService) === 'custom';

	if (useCustomTitleStyle) {
		options.titleBarStyle = 'hidden';
		if (!isMacintosh) {
			options.frame = false;
		}

		// 显示窗口控制按钮(一 口 X)
		if (useWindowControlsOverlay(configurationService)) {
			const titleBarColor = themeMainService.getWindowSplash()?.colorInfo.titleBarBackground ?? themeMainService.getBackgroundColor();
			const symbolColor = Color.fromHex(titleBarColor).isDarker() ? '#FFFFFF' : '#000000';

			options.titleBarOverlay = {
				height: 30, 				// titlebar的高度
				color: titleBarColor,		// titlebar的背景颜色
				symbolColor: symbolColor,	// titlebar的图标颜色
				...overrides?.titleBarOverlay as TitleBarOverlay
			};
		}
		else {
			options.titleBarOverlay = false;
		}
	}
	if (isMainWindow) {
		options.width = windowState.width;
		options.height = windowState.height;
		options.x = windowState.x;
		options.y = windowState.y;
	}
	return { ...options, experimentalDarkMode: true };
}

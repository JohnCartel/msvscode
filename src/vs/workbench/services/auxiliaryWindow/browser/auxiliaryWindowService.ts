/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAuxiliaryWindowOpenOptions } from 'vs/workbench/services/editor/common/editorGroupsService';
import { AuxWindow, IAuxiliaryWindow } from 'vs/workbench/browser/parts/titlebar/auxTitlebarPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';

export const IAuxiliaryWindowService = createDecorator<IAuxiliaryWindowService>('auxiliaryWindowService');

export interface IAuxiliaryWindowService {

	readonly _serviceBrand: undefined;

	open(options?: IAuxiliaryWindowOpenOptions): IAuxiliaryWindow;
	close(auxWindow: IAuxiliaryWindow): void;
}

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

// 注册配置
configurationRegistry.registerConfiguration({
	'id': 'window.auxWindow',
	'title': 'Auxiliary Window',
	'type': 'object',
	'properties': {
		'window.auxWindow.hasTitle': {
			'type': 'boolean',
			'default': true,
			'scope': ConfigurationScope.APPLICATION,
			'description': '是否在副窗口显示标题栏'
		}
	}
});

export class AuxiliaryWindowService implements IDisposable, IAuxiliaryWindowService {

	declare readonly _serviceBrand: undefined;

	auxWindows: Set<IAuxiliaryWindow> = new Set<IAuxiliaryWindow>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	dispose(): void {
		this.auxWindows.forEach(auxWindow => auxWindow.dispose());
		this.auxWindows.clear();
	}

	open(options?: IAuxiliaryWindowOpenOptions): IAuxiliaryWindow {

		const left = typeof options?.bounds?.x === 'number' ? options?.bounds?.x : 40;
		const top = typeof options?.bounds?.y === 'number' ? options?.bounds?.y : 40;

		// 创建了一个窗口
		const auxiliaryWindow = assertIsDefined(window.open('about:blank', undefined, `popup=yes,left=${left},top=${top}`)?.window);

		// IAuxiliaryWindow
		const auxWindow = this.instantiationService.createInstance(AuxWindow, auxiliaryWindow);
		this.auxWindows.add(auxWindow);

		return auxWindow;
	}
	close(auxWindow: IAuxiliaryWindow): void {
		this.auxWindows.delete(auxWindow);
		auxWindow.dispose();
	}
}

// 注册服务
registerSingleton(IAuxiliaryWindowService, AuxiliaryWindowService, true);

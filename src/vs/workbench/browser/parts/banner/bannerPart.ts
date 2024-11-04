/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/bannerpart';
import { localize } from 'vs/nls';
import { $, addDisposableListener, append, asCSSUrl, clearNode, EventHelper, EventType, prepend } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { Codicon } from 'vs/base/common/codicons';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_BORDER } from 'vs/workbench/common/theme';
import { Part } from 'vs/workbench/browser/part';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Link } from 'vs/platform/opener/browser/link';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Emitter } from 'vs/base/common/event';
import { IBannerItem, IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { Action2, IMenuService, IMenu, MenuId, MenuRegistry, registerAction2, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { URI } from 'vs/base/common/uri';
import { widgetClose } from 'vs/platform/theme/common/iconRegistry';
import { BannerFocused } from 'vs/workbench/common/contextkeys';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ActivityAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IActivity } from 'vs/workbench/common/activity';
import { ActionViewItem, BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { mnemonicMenuLabel } from 'vs/base/common/labels';
import product from 'vs/platform/product/common/product';
import { Parts } from 'vs/platform/layout/browser/layoutService';

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, { command: { id: 'undo', title: 'Test ABCD' }, when: undefined, group: 'navigation' });

// Theme support
registerThemingParticipant((theme, collector) => {
	const titleBorder = theme.getColor(TITLE_BAR_BORDER);
	if (titleBorder) {
		collector.addRule(`
			.maintoolbar {
				border-bottom: 1px solid var(--vscode-panel-border);
				box-sizing: border-box;
				height: 33px;
			}
		`);
	}
	else {
		collector.addRule(`
			.maintoolbar {
				border-bottom: 1px solid var(--vscode-panel-border);
				border-top: 1px solid var(--vscode-panel-border);
				box-sizing: border-box;
				height: 33px;
			}
		`);
	}
});



export class ToolbarActions {
	private static actionMenuMap: Map<string, Action> = new Map();

	constructor() {
	}

	static add(id: string, action: Action) {
		ToolbarActions.actionMenuMap.set(id, action);
	}

	static getMenuId(id: string): MenuId | undefined {
		// 只有MyAction才有getMenuId方法，返回的ID才有意义
		return (this.actionMenuMap.get(id) as MyAction)?.getMenuId();
	}
}

class MyAction extends ActivityAction {

	constructor(id: string, label: string = '', private menuId?: MenuId, cssClass: string = '', keybindingId?: string, iconUrl?: URI, enabled: boolean = true) {
		super({ id: id, name: label, cssClass: cssClass, keybindingId: keybindingId, iconUrl: iconUrl });
		ToolbarActions.add(id, this);
	}

	public getMenuId(): MenuId | undefined {
		return this.menuId;
	}
}

export class MyMenuItem extends BaseActionViewItem {
	protected container!: HTMLElement;
	protected label!: HTMLElement;
	constructor(
		action: ActivityAction,
		private menuId: MenuId,
		@IMenuService private menuService: IMenuService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		// @IConfigurationService private configurationService: IConfigurationService
	) {
		super(null, action);
	}

	protected async resolveMainMenuActions(menu: IMenu, disposables: DisposableStore): Promise<IAction[]> {
		const actions: IAction[] = [];

		// todo@rengy check
		// disposables.add(createAndFillInActionBarActions(menu, undefined, { primary: [], secondary: actions }));
		createAndFillInActionBarActions(menu, undefined, { primary: [], secondary: actions });

		return actions;
	}

	async showContextMenu(e?: MouseEvent): Promise<void> {
		const disposables = new DisposableStore();

		// let actions: IAction[];

		// MenubarViewMenu
		// 在这里添加ContextMenu
		const menu = disposables.add(this.menuService.createMenu(this.menuId, this.contextKeyService));
		const actions = await this.resolveMainMenuActions(menu, disposables);
		for (let i = actions.length - 1; i >= 0; i--) {
			const value = actions[i];
			// 过滤空的子菜单
			if (value instanceof SubmenuItemAction) {
				if (value.actions.length === 0) {
					actions.splice(i, 1);
					continue;
				}
			}
			// && -> &
			actions[i].label = mnemonicMenuLabel(value.label);
		}
		actions.filter(value => { return !(value instanceof SubmenuItemAction && value.actions.length === 0); });

		const isUsingCustomMenu = true;
		// const position = this.configurationService.getValue('workbench.sideBar.location');

		this.contextMenuService.showContextMenu({
			getAnchor: () => isUsingCustomMenu ? this.container : e || this.container,
			// anchorAlignment: isUsingCustomMenu ? (position === 'left' ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT) : undefined,
			// anchorAxisAlignment: isUsingCustomMenu ? AnchorAxisAlignment.HORIZONTAL : AnchorAxisAlignment.VERTICAL,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const customActionViewItem = <any>action;
				if (typeof customActionViewItem.getActionViewItem === 'function') {
					return customActionViewItem.getActionViewItem();
				}

				return new ActionViewItem(action, action, { icon: true, label: true, isMenu: true });
			},
			onHide: () => disposables.dispose()
		});
	}

	// 显示ActionViewItem(工具栏按钮)
	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		this.container.classList.add('icon');

		// this.container.style.backgroundColor = "#ff0000";

		// Try hard to prevent keyboard only focus feedback when using mouse
		this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, () => {
			this.container.classList.add('clicked');
		}));

		// Label
		this.label = append(container, $('a'));
		this.label.className = 'action-label';
		if (this.activity?.cssClass) {
			this.label.classList.add(...this.activity.cssClass.split(' '));
		}
		this.label.classList.add('codicon');
		this.label.setAttribute('aria-label', this.action.label);
		this.label.setAttribute('title', this.action.label);
		this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			EventHelper.stop(e, true);
			this.showContextMenu(e);
		}));

		this._register(addDisposableListener(this.container, EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				EventHelper.stop(e, true);
				this.showContextMenu();
			}
		}));

		this._register(addDisposableListener(this.container, TouchEventType.Tap, (e: GestureEvent) => {
			EventHelper.stop(e, true);
			this.showContextMenu();
		}));

		// pane composite bar active border + background
		append(container, $('.active-item-indicator'));
	}

	protected get activity(): IActivity {
		return (this._action as ActivityAction).activity;
	}
}
// Banner Part

export class BannerPart extends Part implements IBannerService {

	declare readonly _serviceBrand: undefined;

	// #region IView

	height: number = 60;
	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		return this.visible ? this.height : 0;
	}

	get maximumHeight(): number {
		return this.visible ? this.height : 0;
	}

	private _onDidChangeSize = this._register(new Emitter<{ width: number; height: number } | undefined>());
	override get onDidChange() { return this._onDidChangeSize.event; }

	//#endregion

	private item: IBannerItem | undefined;
	private readonly markdownRenderer: MarkdownRenderer;
	private visible = true;

	private actionBar: ActionBar | undefined;
	private messageActionsContainer: HTMLElement | undefined;
	private focusedActionIndex: number = -1;

	private msgElement: HTMLElement | null = null;

	constructor(
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IEditorService private readonly editorService: IEditorService,
		// @ITextModelService private readonly textModelService: ITextModelService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IMenuService readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(Parts.BANNER_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.tabIndex = 0;
		// this.element.innerText = "BANNER";
		// "text-align: right;top: 30px;height: 50px;align-items: center;"
		// this.element.style.textAlign = "left";
		// this.element.style.alignItems = "center";
		// this.element.style.fontSize = "48";

		// Restore focused action if needed
		this._register(addDisposableListener(this.element, EventType.FOCUS, () => {
			if (this.focusedActionIndex !== -1) {
				this.focusActionLink();
			}
		}));
		this.showToolbar();

		// Track focus
		const scopedContextKeyService = this.contextKeyService.createScoped(this.element);
		BannerFocused.bindTo(scopedContextKeyService).set(true);

		return this.element;
	}

	private close(item: IBannerItem): void {
		// Hide banner
		// this.setVisibility(false);

		// Remove from document
		clearNode(this.element);
		this.showToolbar();

		// Remember choice
		if (typeof item.onClose === 'function') {
			item.onClose();
		}
		this._onDidChangeSize.fire(undefined);
		this.item = undefined;
	}

	private focusActionLink(): void {
		const length = this.item?.actions?.length ?? 0;

		if (this.focusedActionIndex < length) {
			const actionLink = this.messageActionsContainer?.children[this.focusedActionIndex];
			if (actionLink instanceof HTMLElement) {
				this.actionBar?.setFocusable(false);
				actionLink.focus();
			}
		} else {
			this.actionBar?.focus(0);
		}
	}

	private getAriaLabel(item: IBannerItem): string | undefined {
		if (item.ariaLabel) {
			return item.ariaLabel;
		}
		if (typeof item.message === 'string') {
			return item.message;
		}

		return undefined;
	}

	private getBannerMessage(message: MarkdownString | string): HTMLElement {
		if (typeof message === 'string') {
			const element = $('span');
			element.innerText = message;
			return element;
		}

		return this.markdownRenderer.render(message).element;
	}

	private setVisibility(visible: boolean): void {
		if (visible !== this.visible) {
			this.visible = visible;
			this.focusedActionIndex = -1;

			this.layoutService.setPartHidden(!visible, Parts.BANNER_PART);
			this._onDidChangeSize.fire(undefined);
		}
	}

	focus(): void {
		this.focusedActionIndex = -1;
		this.element.focus();
	}

	focusNextAction(): void {
		const length = this.item?.actions?.length ?? 0;
		this.focusedActionIndex = this.focusedActionIndex < length ? this.focusedActionIndex + 1 : 0;

		this.focusActionLink();
	}

	focusPreviousAction(): void {
		const length = this.item?.actions?.length ?? 0;
		this.focusedActionIndex = this.focusedActionIndex > 0 ? this.focusedActionIndex - 1 : length;

		this.focusActionLink();
	}

	hide(id: string): void {
		if (this.item?.id !== id) {
			return;
		}

		this.setVisibility(false);
	}

	show(item: IBannerItem): void {
		if (item.id === this.item?.id) {
			this.setVisibility(true);
			return;
		}
		// Clear previous item
		this.showToolbar();

		console.log(`显示Message:${item.message}`);

		if (this.msgElement === null) {
			this.msgElement = append(this.element, $('div.msg'));
		}

		// Banner aria label
		const ariaLabel = this.getAriaLabel(item);
		if (ariaLabel) {
			this.msgElement.setAttribute('aria-label', ariaLabel);
		}

		// Icon
		const iconContainer = append(this.msgElement, $('div.icon-container'));
		iconContainer.setAttribute('aria-hidden', 'true');

		// this.element.style.cssText = '* { font-size: 48px; }';

		if (item.icon instanceof Codicon) {
			iconContainer.appendChild($(`div${item.icon.cssSelector}`));
		} else {
			iconContainer.classList.add('custom-icon');

			if (URI.isUri(item.icon)) {
				iconContainer.style.backgroundImage = asCSSUrl(item.icon);
			}
		}

		// Message
		const messageContainer = append(this.msgElement, $('div.message-container'));
		messageContainer.setAttribute('aria-hidden', 'true');
		messageContainer.appendChild(this.getBannerMessage(item.message));

		// Message Actions
		this.messageActionsContainer = append(this.msgElement, $('div.message-actions-container'));
		if (item.actions) {
			for (const action of item.actions) {
				this._register(this.instantiationService.createInstance(Link, this.messageActionsContainer, { ...action, tabIndex: -1 }, {}));
			}
		}

		// Action
		const actionBarContainer = append(this.msgElement, $('div.action-container'));
		this.actionBar = this._register(new ActionBar(actionBarContainer));

		const closeAction = this._register(new Action('banner.close', 'Close Banner', ThemeIcon.asClassName(widgetClose), true, () => this.close(item)));
		this.actionBar.push(closeAction, { icon: true, label: false });
		this.actionBar.setFocusable(false);

		this.setVisibility(true);
		this.item = item;

		this.height += 26;
		this._onDidChangeSize.fire(undefined);
	}

	showToolbar(): void {

		this.height = 33;

		this.element.style.textAlign = 'left';
		this.element.style.alignItems = 'top';
		this.element.style.fontSize = '24';

		// let style = $('style.ToolsStyle'); //document.createElement('style');
		// this.setStyle(parent.ownerDocument, style);

		// Clear previous item
		clearNode(this.element);

		const tools = prepend(this.element, $('div.maintoolbar'));

		// Action
		const actionBarContainer = append(tools, $('div.action-container'));

		this.makeActionBar(actionBarContainer);

		this.setVisibility(true);
		// this.visible = true;
	}

	private makeActionBar(actionBarContainer: HTMLElement) {

		const actionBar = this._register(new ActionBar(actionBarContainer, {
			// 返回button的ActionViewItem
			actionViewItemProvider: action => {
				const menuId = ToolbarActions.getMenuId(action.id);
				// todo@rengy 重构
				// 如果按钮按下后，会处触发菜单，创建菜单按钮
				if (menuId) {
					return this.instantiationService.createInstance(MyMenuItem, action as ActivityAction, menuId);
				}
				return undefined;
			}
		}));

		const actions = this.GetActions();

		for (let i = 0; i < actions.length; i++) {
			const action = this._register(actions[i]);
			if (action.id === 'divider') {
				actionBar.push(action, { icon: false, label: true });
			}
			else {
				actionBar.push(action, { icon: true, label: false });
			}
			actionBar.setFocusable(false);
		}
	}

	GetActions(): Action[] {
		const actions: Action[] = [];

		const buttons = product.mainToolbarActions;

		if (buttons && buttons.length > 0) {
			buttons.sort((a, b) => {
				const groupA = a.group ?? '';
				const groupB = b.group ?? '';
				return groupA === groupB ? 0 : groupA < groupB ? -1 : 1;
			});

			let lastGroup: string | undefined = buttons[0].group;
			buttons.forEach(button => {
				if (lastGroup !== button.group) {
					actions.push(new Separator());
					lastGroup = button.group;
				}
				if (button.menuId) {
					const action = new MyAction(button.id, button.label, MenuId.getMenuIdbyId(button.menuId), button.iconClass);
					actions.push(action);
				} else if (button.commandId) {
					const
						action = new Action(button.id, button.label, button.iconClass, true, async () => this.commandService.executeCommand(button.commandId!));
					actions.push(action);
				}
			});
		}

		return actions;
	}

	toJSON(): object {
		return {
			type: Parts.BANNER_PART
		};
	}
}

registerSingleton(IBannerService, BannerPart);


// Keybindings

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusBanner',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Escape,
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focus();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusNextAction',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.RightArrow,
	secondary: [KeyCode.DownArrow],
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focusNextAction();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.banner.focusPreviousAction',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.LeftArrow,
	secondary: [KeyCode.UpArrow],
	when: BannerFocused,
	handler: (accessor: ServicesAccessor) => {
		const bannerService = accessor.get(IBannerService);
		bannerService.focusPreviousAction();
	}
});


// Actions

class FocusBannerAction extends Action2 {

	static readonly ID = 'workbench.action.focusBanner';
	static readonly LABEL = localize('focusBanner', "Focus Banner");

	constructor() {
		super({
			id: FocusBannerAction.ID,
			title: { value: FocusBannerAction.LABEL, original: 'Focus Banner' },
			category: CATEGORIES.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.focusPart(Parts.BANNER_PART);
	}
}

registerAction2(FocusBannerAction);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { protocol } from 'electron';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';


export class WebviewProtocolProvider extends Disposable {

	private static validWebviewFilePaths = new Map([
		['/index.html', 'index.html'],
		['/fake.html', 'fake.html'],
		['/service-worker.js', 'service-worker.js'],
	]);

	constructor() {
		super();

		// Register the protocol for loading webview html
		const webviewHandler = this.handleWebviewRequest.bind(this);
		protocol.registerFileProtocol(Schemas.vscodeWebview, webviewHandler);
		// protocol.registerFileProtocol('https', webviewHandler);
		// protocol.registerFileProtocol('http', webviewHandler);
	}

	private handleWebviewRequest(
		request: Electron.ProtocolRequest,
		callback: (response: string | Electron.ProtocolResponse) => void
	) {
		try {
			/**
			 * Uniform Resource Identifier (URI) http://tools.ietf.org/html/rfc3986.
			 * This class is a simple parser which creates the basic component parts
			 * (http://tools.ietf.org/html/rfc3986#section-3) with minimal validation
			 * and encoding.
			 *
			 * ```txt
			 *       foo://example.com:8042/over/there?name=ferret#nose
			 *       \_/   \______________/\_________/ \_________/ \__/
			 *        |           |            |            |        |
			 *     scheme     authority       path        query   fragment
			 *        |   _____________________|__
			 *       / \ /                        \
			 *       urn:example:animal:ferret:nose
			 * ```
			 */
			const uri = URI.parse(request.url);
			const entry = WebviewProtocolProvider.validWebviewFilePaths.get(uri.path);
			if (typeof entry === 'string') {
				const relativeResourcePath = `vs/workbench/contrib/webview/browser/pre/${entry}`;
				const url = FileAccess.asFileUri(relativeResourcePath, require);
				return callback(decodeURIComponent(url.fsPath));
			} else {
				return callback({ error: -10 /* ACCESS_DENIED - https://cs.chromium.org/chromium/src/net/base/net_error_list.h?l=32 */ });
				// return callback("D:\\Source\\hespl_all\\hespl_backend\\out\\vs\\workbench\\browser\\media\\code-icon.svg");
			}
		} catch {
			// noop
		}
		return callback({ error: -2 /* FAILED - https://cs.chromium.org/chromium/src/net/base/net_error_list.h?l=32 */ });
	}
}

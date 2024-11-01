/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dfs Corporation. All rights reserved.
 *  This file is proprietary and confidential.
 *--------------------------------------------------------------------------------------------*/

function server() {
	const net = require('net');

	const server = net.createServer((socket) => {
	});

	const socks = new Map();

	server.on('connection', (socket) => {
		console.log('客户端连接成功');
		// socks.add(socket);
		socks.set(socket, '');
		socket.on('data', (data) => {
			if (socks.get(socket) === '') {
				socks.set(socket, { name: `${data}`, refcount: -1 });
			}
			const str = `${data}`.trimEnd();
			if (str !== '') {
				const socketData = socks.get(socket);
				console.log(str);
				socks.set(socket, { name: socketData.name, refcount: socketData.refcount + 1 });
			}
		});
		socket.on('end', () => {
			const socketData = socks.get(socket);
			console.log(`客户端关闭连接: + ${socketData.name} 使用了${socketData.refcount}次`);
			socks.delete(socket);
		});
		// server.close();
	});

	server.listen('\\\\.\\pipe\\mylog', () => {
		console.log('logserver启动成功...');
	});
}

server();

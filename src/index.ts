/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';

interface Env {
	STORAGE: R2Bucket;
	BASIC_AUTH_USER: string;    // 添加用户名环境变量
	BASIC_AUTH_PASS: string;    // 添加密码环境变量
	LAST_LOCATIONS: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// 添加 CORS 支持
app.use('/*', cors({
	origin: 'http://localhost:5173',
	allowHeaders: ['Content-Type', 'Authorization'],
	credentials: true
}));

app.use('/*', async (c, next) => {
	return basicAuth({
		username: c.env.BASIC_AUTH_USER,
		password: c.env.BASIC_AUTH_PASS,
		realm: 'Secure Area'
	})(c, next);
});

app.post('/', async (c) => {
	try {
		const payload = await c.req.json();

		if (payload._type !== 'location') {
			return c.json([]);
		}

		// 验证基本字段
		if (payload._type !== 'location' || !payload.lat || !payload.lon) {
			return c.json({ error: 'Invalid location payload' }, 400);
		}

		// 验证并解析 topic
		if (!payload.topic) {
			return c.json({ error: 'Missing topic' }, 400);
		}

		const topicParts = payload.topic.split('/');
		if (topicParts.length !== 3 || topicParts[0] !== 'owntracks') {
			return c.json({ error: 'Invalid topic format. Expected: owntracks/<username>/<devicename>' }, 400);
		}

		const [_, username, device] = topicParts;

		await updateLastLocations(c.env, username, device, payload);

		// 生成存储路径
		const now = new Date();
		// 如果 payload 包含 tst (Unix timestamp)，使用它作为时间戳
		const timestamp = payload.tst
			? new Date(payload.tst * 1000).toISOString()
			: now.toISOString();

		const month = timestamp.substring(0, 7); // YYYY-MM
		const storagePath = `rec/${username}/${device}/${month}.rec`;
		console.log(storagePath);

		// 格式化记录行
		const newRecord = `${timestamp} * ${JSON.stringify(payload)}\n`;

		// 读取现有内容或创建新文件
		let content = '';
		const existingFile = await c.env.STORAGE.get(storagePath);
		if (existingFile) {
			content = await existingFile.text();
		}

		// 追加新记录
		content += newRecord;
		console.log(content);

		// 存储更新后的内容
		await c.env.STORAGE.put(storagePath, content, {
			httpMetadata: {
				contentType: 'text/plain',
			}
		});

		// 按照 Owntracks 规范返回空数组
		return c.json([]);

	} catch (error) {
		console.error('Error processing location:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

app.get('/api/0/list', async (c) => {
	try {
		const user = c.req.query('user');
		const device = c.req.query('device');

		if (user && device) {
			const prefix = `rec/${user}/${device}/`;
			const objects = await c.env.STORAGE.list({ prefix });
			const recFiles = objects.objects
				.map(obj => obj.key.split('/').pop()) // 只返回文件名
				.filter(name => name?.endsWith('.rec'));
			return c.json(recFiles);
		}

		// 列出指定用户的所有设备
		if (user) {
			const prefix = `rec/${user}/`;
			const objects = await c.env.STORAGE.list({ prefix });
			const devices = new Set(
				objects.objects
					.map(obj => obj.key.split('/')[2]) // 获取设备名称
					.filter(Boolean)
			);
			return c.json({ results: Array.from(devices) });
		}

		// 列出所有用户
		const prefix = 'rec/';
		const objects = await c.env.STORAGE.list({ prefix });
		const users = new Set(
			objects.objects
				.map(obj => obj.key.split('/')[1]) // 获取用户名称
				.filter(Boolean)
		);
		return c.json({ results: Array.from(users) });

	} catch (error) {
		console.error('Error listing data:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

app.get('/api/0/last', async (c) => {
	try {
		const user = c.req.query('user');
		const device = c.req.query('device');
		const fields = c.req.query('fields')?.split(',');

		let key;
		if (user && device) {
			key = `last:${user}:${device}`;
		} else if (user) {
			key = `last:${user}`;
		} else {
			key = 'last:all';
		}

		const lastLocation = await c.env.LAST_LOCATIONS.get(key);
		if (!lastLocation) {
			return c.json({ error: 'No location data found' }, 404);
		}

		let result = JSON.parse(lastLocation);

		return c.json(result);
	} catch (error) {
		console.error('Error fetching last location:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

async function updateLastLocations(env: Env, username: string, device: string, lastLocation: any) {
	try {
		// 1. 更新特定用户和设备的最新位置
		const userDeviceKey = `last:${username}:${device}`;
		await env.LAST_LOCATIONS.put(userDeviceKey, JSON.stringify([lastLocation]));

		// 2. 更新用户的所有设备最新位置列表
		const userKey = `last:${username}`;
		const existingUserData = await env.LAST_LOCATIONS.get(userKey);
		let userDevices = [];
        if (existingUserData) {
            userDevices = JSON.parse(existingUserData);
            // 从 topic 解析设备信息进行过滤
            userDevices = userDevices.filter(loc => {
                const [_, __, deviceId] = loc.topic.split('/');
                return deviceId !== device;
            });
        }
		userDevices.push(lastLocation);
		await env.LAST_LOCATIONS.put(userKey, JSON.stringify(userDevices));

		// 3. 更新全局最新位置
		const globalKey = 'last:all';
		const existingGlobalData = await env.LAST_LOCATIONS.get(globalKey);
		let allLocations = [];
        if (existingGlobalData) {
            allLocations = JSON.parse(existingGlobalData);
            // 从 topic 解析用户和设备信息进行过滤
            allLocations = allLocations.filter(loc => {
                const [_, userId, deviceId] = loc.topic.split('/');
                return !(userId === username && deviceId === device);
            });
        }
		allLocations.push(lastLocation);
		await env.LAST_LOCATIONS.put(globalKey, JSON.stringify(allLocations));
	} catch (error) {
		console.error('Error updating last locations:', error);
		throw error; // 向上传播错误以便主函数处理
	}
}



export default app;

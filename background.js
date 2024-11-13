// background.js

const ALARM_NAME = 'syncJDCookieToQingLong';

let config = {
    qlUrl: '',
    clientId: '',
    clientSecret: '',
    envName: 'JD_COOKIE',
    targetURL: 'https://bean.m.jd.com/bean/signIndex.action',  // 替换为目标网站域名
    autoSync: true,          // 默认开启自动同步
    syncInterval: 60,        // 同步间隔（分钟）
    lastSync: null          // 上次同步时间
};

// 初始化配置和定时器
chrome.runtime.onInstalled.addListener(() => {
    console.log('扩展已安装/更新');
    initializeConfigAndAlarm();
});

// Service Worker 启动时初始化
chrome.runtime.onStartup.addListener(() => {
    console.log('浏览器启动');
    initializeConfigAndAlarm();
});

// 加载配置并初始化
async function initializeConfigAndAlarm() {
    console.log('初始化扩展')
    try {
        const result = await chrome.storage.local.get(['config']);
        if (result.config) {
            config = { ...config, ...result.config };
        }

        // 如果启用了自动同步，设置定时器
        if (config.autoSync) {
            await setupAlarm();

            // 首次运行执行一次同步
            const result = await syncCookie();
            handleSyncResult(result);
        }
    } catch (error) {
        console.error('初始化失败:', error);
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    }
}

// 监听定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('定时同步触发');
        const result = await syncCookie();
        handleSyncResult(result);
    }
});

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.config) {
        const newConfig = changes.config.newValue;
        const oldConfig = changes.config.oldValue || {};
        config = { ...config, ...newConfig };
        
        // 检查是否需要更新定时器
        if (newConfig.autoSync !== oldConfig.autoSync || 
            newConfig.syncInterval !== oldConfig.syncInterval) {
            if (newConfig.autoSync) {
                await setupAlarm();
            } else {
                await chrome.alarms.clear(ALARM_NAME);
            }
        }
    }
});

// 设置定时器
async function setupAlarm() {
    try {
        // 清除现有的定时器
        await chrome.alarms.clear(ALARM_NAME);
        
        // 创建新的定时器
        const interval = Math.max(1, config.syncInterval || 60);
        await chrome.alarms.create(ALARM_NAME, {
            periodInMinutes: interval
        });
        
        console.log(`已设置定时同步，间隔: ${interval}分钟`);
    } catch (error) {
        console.error('设置定时器失败:', error);
    }
}

// 处理同步结果
async function handleSyncResult(result) {
    if (result) {
        // 更新最后同步时间
        config.lastSync = Date.now();
        await chrome.storage.local.set({ config });
        
        // 更新图标状态
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        
        // 3秒后清除勾号
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    } else {
        // 显示错误状态
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    }
}

// 获取指定的Cookie
async function getJDCookie() {
    try {
        // 获取 pt_key
        const ptKey = await chrome.cookies.get({
            name: 'pt_key',
            url: config.targetURL
        });

        // 获取 pt_pin
        const ptPin = await chrome.cookies.get({
            name: 'pt_pin',
            url: config.targetURL
        });

        // 检查是否都获取到了（包含空值检查）
        if (!ptKey?.value || !ptPin?.value) {
            chrome.tabs.create({
                url: config.targetURL,
                active: true
            });

            throw new Error('未找到必要的Cookie或Cookie值为空，请确保已经登录京东');
        }

        // 组合cookie字符串
        const cookieStr = `pt_key=${ptKey.value};pt_pin=${ptPin.value};`;

        return cookieStr;
    } catch (error) {
        console.error('获取Cookie失败:', error);
        throw error;
    }
}

// 获取青龙面板token
async function getQlToken() {
    try {
        const response = await fetch(
            `${config.qlUrl}/open/auth/token?client_id=${config.clientId}&client_secret=${config.clientSecret}`
        );
        const data = await response.json();
        if (data.code === 200) {
            return data.data.token;
        }
        throw new Error(data.message || '获取token失败');
    } catch (error) {
        console.error('获取青龙token失败:', error);
        throw error;
    }
}

// 更新环境变量
async function updateEnv(token, value) {
    try {
        // 先获取现有环境变量
        const searchResponse = await fetch(
            `${config.qlUrl}/open/envs`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        const envs = await searchResponse.json();

        let existingEnv = envs.data.find(env => env.name === config.envName);
        let response;

        if (existingEnv) {
            // 更新已存在的环境变量
            response = await fetch(
                `${config.qlUrl}/open/envs`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: config.envName,
                        value: value,
                        id: existingEnv.id,
                        remarks: `由Cookie同步助手更新于 ${new Date().toLocaleString()}`
                    })
                }
            );
        } else {
            // 创建新的环境变量
            response = await fetch(
                `${config.qlUrl}/open/envs`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify([{
                        name: config.envName,
                        value: value,
                        remarks: `由Cookie同步助手创建于 ${new Date().toLocaleString()}`
                    }])
                }
            );
        }

        const result = await response.json();
        if (result.code === 200) {
            return true;
        }
        throw new Error(result.message || '更新环境变量失败');
    } catch (error) {
        console.error('更新环境变量失败:', error);
        throw error;
    }
}

// 执行同步
async function syncCookie() {
    try {
        const cookie = await getJDCookie();
        if (!cookie) {
            throw new Error('获取Cookie失败');
        }

        const token = await getQlToken();
        await updateEnv(token, cookie);

        config.lastSync = Date.now();
        chrome.storage.local.set({ config });

        return true;
    } catch (error) {
        console.error('同步Cookie失败:', error);
        throw error;
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'syncNow') {
        console.log(config)
        syncCookie()
            .then(async (result) => {
                await handleSyncResult(result);
                sendResponse({
                    success: result,
                    timestamp: Date.now()
                });
            })
            .catch(async (error) => {
                await handleSyncResult(false);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        return true;  // 表示会异步发送响应
    }
});

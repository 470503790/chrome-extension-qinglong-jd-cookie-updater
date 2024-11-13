// popup.js
document.addEventListener('DOMContentLoaded', () => {
    // 加载配置
    chrome.storage.local.get(['config'], (result) => {
        if (result.config) {
            document.getElementById('qlUrl').value = result.config.qlUrl || '';
            document.getElementById('clientId').value = result.config.clientId || '';
            document.getElementById('clientSecret').value = result.config.clientSecret || '';
            document.getElementById('envName').value = result.config.envName || '';
            document.getElementById('autoSync').checked = result.config.autoSync || false;
            document.getElementById('syncInterval').value = result.config.syncInterval || 60;
            updateLastSyncTimeDisplay(result.config.lastSync);
            
            // Update syncInterval field visibility based on autoSync
            toggleSyncIntervalVisibility(result.config.autoSync);
        }
    });

    // Toggle syncInterval visibility when autoSync changes
    document.getElementById('autoSync').addEventListener('change', (e) => {
        toggleSyncIntervalVisibility(e.target.checked);
    });

    // 保存配置
    document.getElementById('saveConfig').addEventListener('click', () => {
        // Validate required fields
        const qlUrl = document.getElementById('qlUrl').value.trim();
        const clientId = document.getElementById('clientId').value.trim();
        const clientSecret = document.getElementById('clientSecret').value.trim();
        const envName = document.getElementById('envName').value.trim();
        const autoSync = document.getElementById('autoSync').checked;
        const syncInterval = parseInt(document.getElementById('syncInterval').value) || 60;

        // Check required fields
        const errors = [];
        if (!qlUrl) errors.push('青龙面板地址');
        if (!clientId) errors.push('Client ID');
        if (!clientSecret) errors.push('Client Secret');
        if (!envName) errors.push('环境变量名称');
        if (autoSync && (!syncInterval || syncInterval < 1)) {
            errors.push('有效的同步间隔（分钟）');
        }

        if (errors.length > 0) {
            showStatus(`请填写以下必填项：${errors.join('、')}`, 'error');
            return;
        }

        // Validate URL format
        try {
            new URL(qlUrl);
        } catch {
            showStatus('请输入有效的青龙面板地址', 'error');
            return;
        }

        chrome.storage.local.get(['config'], (result) => {
            const config = {
                ...result.config,
                qlUrl,
                clientId,
                clientSecret,
                envName,
                autoSync,
                syncInterval
            };

            chrome.storage.local.set({ config }, () => {
                showStatus('配置保存成功！', 'success');
            });
        });
    });

    // 立即同步
    document.getElementById('syncNow').addEventListener('click', () => {
        // Validate required fields before syncing
        const qlUrl = document.getElementById('qlUrl').value.trim();
        const clientId = document.getElementById('clientId').value.trim();
        const clientSecret = document.getElementById('clientSecret').value.trim();
        const envName = document.getElementById('envName').value.trim();

        if (!qlUrl || !clientId || !clientSecret || !envName) {
            showStatus('请先填写并保存完整的配置信息', 'error');
            return;
        }

        chrome.runtime.sendMessage({ action: 'syncNow' }, (response) => {
            if (response.success) {
                showStatus('同步成功！', 'success');
                updateLastSyncTimeDisplay(response.timestamp);
            } else {
                showStatus(`同步失败：${response.error}`, 'error');
            }
        });
    });

    function showStatus(message, type) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';

        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }

    function toggleSyncIntervalVisibility(show) {
        const syncIntervalContainer = document.getElementById('syncInterval').parentElement;
        syncIntervalContainer.style.display = show ? 'block' : 'none';
    }

    function updateLastSyncTimeDisplay(timestamp) {
        const lastSyncElem = document.getElementById('lastSyncTime');
        if (timestamp) {
            const date = new Date(timestamp);
            lastSyncElem.textContent = `上次同步: ${date.toLocaleString()}`;
        } else {
            lastSyncElem.textContent = '尚未同步';
        }
    }
});

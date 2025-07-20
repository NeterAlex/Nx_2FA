// TOTP 2FA Manager - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
	console.log("TOTP 2FA Manager installed");
});

// 处理扩展图标点击
chrome.action.onClicked.addListener((_tab) => {
	console.log("Extension icon clicked");
});

// 监听来自内容脚本或popup的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request.action === "generateTOTP") {
		console.log("TOTP generation request:", request);
		sendResponse({ success: true });
	}

	return true; // 保持消息通道开放
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace === "sync" && changes.totp_accounts) {
		console.log("TOTP accounts updated");
	}
});

// 定期清理过期数据
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "cleanup") {
		// 执行清理任务
		console.log("Performing cleanup tasks");
	}
});

// 设置定期清理任务
chrome.runtime.onStartup.addListener(() => {
	chrome.alarms.create("cleanup", {
		delayInMinutes: 60,
		periodInMinutes: 60 * 24, // 每天执行一次
	});
});

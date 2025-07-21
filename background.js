// TOTP 2FA Manager - Background Service Worker

// 初始化alarms功能
function initializeAlarms() {
	if (chrome.alarms) {
		// 设置alarm监听器
		chrome.alarms.onAlarm.addListener((alarm) => {
			if (alarm.name === "cleanup") {
				console.log("Performing cleanup tasks");
				performCleanup();
			}
		});

		// 创建定期清理任务
		chrome.alarms.create("cleanup", {
			delayInMinutes: 60,
			periodInMinutes: 60 * 24, // 每天执行一次
		});

		console.log("Alarms initialized successfully");
	} else {
		console.warn("chrome.alarms API is not available");
	}
}

// 安装时
chrome.runtime.onInstalled.addListener(() => {
	console.log("TOTP 2FA Manager installed");
	initializeAlarms();
});

// 启动时
chrome.runtime.onStartup.addListener(() => {
	console.log("TOTP 2FA Manager started");
	initializeAlarms();
});

// 处理扩展图标点击（如果没有popup）
chrome.action.onClicked.addListener((tab) => {
	console.log("Extension icon clicked", tab);
});

// 监听来自popup或content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("Message received:", request, sender);

	if (request.action === "generateTOTP") {
		console.log("TOTP generation request:", request);
		sendResponse({ success: true });
		return true;
	}

	if (request.action === "getCurrentDomain") {
		// 返回当前活动标签的域名
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs.length > 0 && tabs[0].url) {
				try {
					const url = new URL(tabs[0].url);
					const domain = url.hostname.replace(/^www\./, "");
					sendResponse({ domain: domain });
				} catch (error) {
					console.warn("Failed to parse URL:", error);
					sendResponse({ domain: "" });
				}
			} else {
				sendResponse({ domain: "" });
			}
		});
		return true;
	}

	// 默认响应
	sendResponse({ success: false, message: "Unknown action" });
	return true;
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace === "sync" && changes.totp_accounts) {
		console.log("TOTP accounts updated:", changes.totp_accounts);
	}
});

// 清理函数
async function performCleanup() {
	try {
		const result = await chrome.storage.sync.get(null);
		console.log("Current storage data:", result);
		console.log("Cleanup completed");
	} catch (error) {
		console.error("Cleanup failed:", error);
	}
}

// TOTP 2FA Manager - Main Popup Script

class TOTP2FAManager {
	constructor() {
		this.accounts = [];
		this.timers = new Map();
		this.currentEditId = null;
		this.currentDomain = "";
		this.searchQuery = "";

		this.init();
	}

	async init() {
		await this.loadAccounts();
		await this.getCurrentDomain();
		this.setupEventListeners();
		this.updateUI();
		this.startTimers();
	}

	// 数据存储和加载
	async loadAccounts() {
		try {
			const result = await chrome.storage.sync.get(["totp_accounts"]);
			this.accounts = result.totp_accounts || [];
		} catch (error) {
			console.error("Failed to load accounts:", error);
			this.accounts = [];
		}
	}

	async saveAccounts() {
		try {
			await chrome.storage.sync.set({ totp_accounts: this.accounts });
		} catch (error) {
			console.error("Failed to save accounts:", error);
			this.showToast("保存失败，请重试");
		}
	}

	// UI 更新
	updateUI() {
		const emptyState = document.getElementById("empty-state");
		const accountsContainer = document.getElementById("accounts-container");
		const searchContainer = document.getElementById("search-container");

		if (this.accounts.length === 0) {
			emptyState.style.display = "flex";
			accountsContainer.style.display = "none";
			searchContainer.style.display = "none";
		} else {
			emptyState.style.display = "none";
			accountsContainer.style.display = "block";
			searchContainer.style.display = "block";
			this.renderAccounts();
		}
	}

	// 获取当前标签页的域名
	async getCurrentDomain() {
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab?.url) {
				const url = new URL(tab.url);
				this.currentDomain = url.hostname.replace(/^www\./, "");
			}
		} catch (error) {
			console.warn("无法获取当前域名:", error);
			this.currentDomain = "";
		}
	}

	// 检查账户是否匹配当前域名
	isDomainMatched(account) {
		if (!this.currentDomain) return false;

		const accountName = account.name.toLowerCase();
		const issuer = (account.issuer || "").toLowerCase();
		const domain = this.currentDomain.toLowerCase();

		// 检查发行商或账户名是否包含域名关键词
		const domainParts = domain.split(".");
		const mainDomain = domainParts[domainParts.length - 2] || domain;

		return (
			issuer.includes(mainDomain) ||
			accountName.includes(mainDomain) ||
			issuer.includes(domain) ||
			accountName.includes(domain)
		);
	}

	// 搜索过滤
	filterAccounts(query) {
		this.searchQuery = query.toLowerCase();
		this.renderAccounts();
	}

	// 检查账户是否匹配搜索
	isSearchMatched(account) {
		if (!this.searchQuery) return true;

		const accountName = account.name.toLowerCase();
		const issuer = (account.issuer || "").toLowerCase();

		return (
			accountName.includes(this.searchQuery) ||
			issuer.includes(this.searchQuery)
		);
	}

	renderAccounts() {
		const accountsList = document.getElementById("accounts-list");
		accountsList.innerHTML = "";

		// 过滤和排序账户
		const filteredAccounts = this.accounts.filter((account) =>
			this.isSearchMatched(account),
		);

		// 按域名匹配排序 - 匹配的置顶
		filteredAccounts.sort((a, b) => {
			const aMatched = this.isDomainMatched(a);
			const bMatched = this.isDomainMatched(b);

			if (aMatched && !bMatched) return -1;
			if (!aMatched && bMatched) return 1;
			return 0;
		});

		filteredAccounts.forEach((account) => {
			const accountElement = this.createAccountElement(account);
			accountsList.appendChild(accountElement);
		});
	}

	createAccountElement(account) {
		const div = document.createElement("div");
		div.className = "account-item";
		div.dataset.accountId = account.id;

		const code = this.generateTOTP(account.secret);
		const timeRemaining = this.getTimeRemaining();
		const progressPercent = (timeRemaining / 30) * 100;
		const isDomainMatched = this.isDomainMatched(account);

		// 如果域名匹配，添加置顶样式
		if (isDomainMatched) {
			div.classList.add("pinned");
		}

		div.innerHTML = `
            <div class="account-header">
                <div class="account-info">
                    <div class="account-name">${this.escapeHtml(account.name)}</div>
                    ${account.issuer ? `<div class="account-issuer">${this.escapeHtml(account.issuer)}</div>` : ""}
                </div>
                <div class="account-actions">
                    <button class="icon-button show-qr-btn" title="显示二维码" data-account-id="${account.id}">
                        <span class="material-icons">qr_code</span>
                    </button>
                    <button class="icon-button edit-account-btn" title="编辑账户">
                        <span class="material-icons">edit</span>
                        ${isDomainMatched ? '<div class="domain-badge"></div>' : ""}
                    </button>
                </div>
            </div>
            <div class="code-section">
                <div class="code-display">
                    <div class="totp-code" title="点击复制">${this.formatCode(code)}</div>
                    <button class="copy-button" title="复制验证码">
                        <span class="material-icons">content_copy</span>
                    </button>
                </div>
                <div class="timer-container">
                    <svg class="progress-ring" width="32" height="32">
                        <circle class="progress-ring__circle" 
                                cx="16" cy="16" r="14" 
                                stroke-dashoffset="${88 - (88 * progressPercent) / 100}">
                        </circle>
                    </svg>
                    <div class="time-remaining">${timeRemaining}s</div>
                </div>
            </div>
        `;

		// 绑定事件
		const showQRBtn = div.querySelector(".show-qr-btn");
		const editBtn = div.querySelector(".edit-account-btn");
		const copyBtn = div.querySelector(".copy-button");
		const codeElement = div.querySelector(".totp-code");

		showQRBtn.addEventListener("click", () =>
			this.showAccountQRCode(account.id),
		);
		editBtn.addEventListener("click", () => this.editAccount(account.id));
		copyBtn.addEventListener("click", () => this.copyCode(code));
		codeElement.addEventListener("click", () => this.copyCode(code));

		return div;
	}

	formatCode(code) {
		// 格式化验证码为 XXX XXX
		return `${code.slice(0, 3)} ${code.slice(3)}`;
	}

	escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	// TOTP 生成
	generateTOTP(secret) {
		try {
			const totp = new jsOTP.totp();
			return totp.getOtp(secret);
		} catch (error) {
			console.error("Failed to generate TOTP:", error);
			return "000000";
		}
	}

	getTimeRemaining() {
		const now = Math.floor(Date.now() / 1000);
		return 30 - (now % 30);
	}

	// 定时器管理
	startTimers() {
		// 清除现有定时器
		this.timers.forEach((timer) => clearInterval(timer));
		this.timers.clear();

		// 主更新定时器
		const mainTimer = setInterval(() => {
			this.updateCodes();
		}, 1000);
		this.timers.set("main", mainTimer);
	}

	updateCodes() {
		const timeRemaining = this.getTimeRemaining();

		this.accounts.forEach((account) => {
			const accountElement = document.querySelector(
				`[data-account-id="${account.id}"]`,
			);
			if (!accountElement) return;

			const code = this.generateTOTP(account.secret);
			const codeElement = accountElement.querySelector(".totp-code");
			const timeElement = accountElement.querySelector(".time-remaining");
			const progressCircle = accountElement.querySelector(
				".progress-ring__circle",
			);

			if (codeElement) codeElement.textContent = this.formatCode(code);
			if (timeElement) timeElement.textContent = `${timeRemaining}s`;

			if (progressCircle) {
				const progressPercent = (timeRemaining / 30) * 100;
				const offset = 88 - (88 * progressPercent) / 100;
				progressCircle.style.strokeDashoffset = offset;

				// 最后5秒时改变颜色
				if (timeRemaining <= 5) {
					progressCircle.style.stroke = "var(--md-sys-color-error)";
				} else {
					progressCircle.style.stroke = "var(--md-sys-color-primary)";
				}
			}
		});
	}

	// 复制功能
	async copyCode(code) {
		try {
			await navigator.clipboard.writeText(code);
			this.showToast("验证码已复制到剪贴板");
		} catch (_error) {
			// 降级
			const textArea = document.createElement("textarea");
			textArea.value = code;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			this.showToast("验证码已复制到剪贴板");
		}
	}

	// 账户管理
	addAccount(name, issuer, secret) {
		const id = Date.now().toString();
		const account = {
			id,
			name: name.trim(),
			issuer: issuer.trim(),
			secret: secret.replace(/\s/g, "").toUpperCase(),
		};

		this.accounts.push(account);
		this.saveAccounts();
		this.updateUI();
		this.showToast("账户添加成功");
	}

	editAccount(accountId) {
		const account = this.accounts.find((acc) => acc.id === accountId);
		if (!account) return;

		this.currentEditId = accountId;

		// 填充编辑表单
		document.getElementById("edit-account-name").value = account.name;
		document.getElementById("edit-account-issuer").value = account.issuer || "";

		// 显示编辑模态框
		this.showModal("edit-modal-backdrop");
	}

	updateAccount(accountId, name, issuer) {
		const accountIndex = this.accounts.findIndex((acc) => acc.id === accountId);
		if (accountIndex === -1) return;

		this.accounts[accountIndex].name = name.trim();
		this.accounts[accountIndex].issuer = issuer.trim();

		this.saveAccounts();
		this.updateUI();
		this.showToast("账户更新成功");
	}

	deleteAccount(accountId) {
		if (!confirm("确定要删除这个账户吗？此操作无法撤销。")) {
			return;
		}

		this.accounts = this.accounts.filter((acc) => acc.id !== accountId);
		this.saveAccounts();
		this.updateUI();
		this.showToast("账户已删除");
	}

	// 模态框管理
	showModal(modalId) {
		const modal = document.getElementById(modalId);
		if (modal) {
			modal.style.display = "flex";
			// 聚焦到第一个输入框
			const firstInput = modal.querySelector("input");
			if (firstInput) {
				setTimeout(() => firstInput.focus(), 100);
			}
		}
	}

	hideModal(modalId) {
		const modal = document.getElementById(modalId);
		if (modal) {
			modal.style.display = "none";
		}
	}

	// 导入导出功能
	exportAccounts(format = "uri") {
		if (this.accounts.length === 0) {
			this.showToast("没有账户可导出");
			return "";
		}

		if (format === "json") {
			return JSON.stringify(this.accounts, null, 2);
		} else {
			// 导出为 otpauth:// URI 格式
			return this.accounts
				.map((account) => this.generateOtpAuthUri(account))
				.join("\n");
		}
	}

	generateOtpAuthUri(account) {
		const params = new URLSearchParams();
		params.set("secret", account.secret);
		params.set("algorithm", "SHA1");
		params.set("digits", "6");
		params.set("period", "30");

		if (account.issuer) {
			params.set("issuer", account.issuer);
		}

		// 构建标签 - 如果有issuer，格式为 "issuer:account"，否则只用account
		let label = account.name;
		if (account.issuer) {
			label = `${account.issuer}:${account.name}`;
		}

		return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
	}

	async importAccounts(content, format = "auto") {
		let importData = [];

		try {
			if (format === "auto") {
				// 自动检测格式
				content = content.trim();
				if (content.startsWith("[") || content.startsWith("{")) {
					format = "json";
				} else if (content.includes("otpauth://")) {
					format = "uri";
				} else {
					throw new Error("无法识别的文件格式");
				}
			}

			if (format === "json") {
				const jsonData = JSON.parse(content);
				importData = Array.isArray(jsonData) ? jsonData : [jsonData];
			} else if (format === "uri") {
				const lines = content.split("\n").filter((line) => line.trim());
				importData = lines
					.map((line) => this.parseOtpAuthUri(line.trim()))
					.filter(Boolean);
			}

			if (importData.length === 0) {
				throw new Error("没有找到有效的账户数据");
			}

			// 验证并添加账户
			let successCount = 0;
			const existingNames = this.accounts.map((acc) => acc.name.toLowerCase());

			for (const accountData of importData) {
				try {
					// 验证必需字段
					if (!accountData.name || !accountData.secret) {
						continue;
					}

					// 检查密钥有效性
					const validation = this.validateSecret(accountData.secret);
					if (!validation.valid) {
						continue;
					}

					// 避免重复账户名
					let finalName = accountData.name;
					let counter = 1;
					while (existingNames.includes(finalName.toLowerCase())) {
						finalName = `${accountData.name} (${counter})`;
						counter++;
					}

					// 创建账户
					const newAccount = {
						id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
						name: finalName,
						issuer: accountData.issuer || "",
						secret: validation.secret,
					};

					this.accounts.push(newAccount);
					existingNames.push(finalName.toLowerCase());
					successCount++;
				} catch (error) {
					console.warn("导入账户失败:", error);
				}
			}

			if (successCount > 0) {
				await this.saveAccounts();
				this.updateUI();
				this.showToast(`成功导入 ${successCount} 个账户`);
				return successCount;
			} else {
				throw new Error("没有成功导入任何账户");
			}
		} catch (error) {
			console.error("导入失败:", error);
			this.showToast(`导入失败: ${error.message}`);
			return 0;
		}
	}

	parseOtpAuthUri(uri) {
		try {
			if (!uri.startsWith("otpauth://totp/")) {
				throw new Error("不是有效的TOTP URI");
			}

			const url = new URL(uri);
			const secret = url.searchParams.get("secret");

			if (!secret) {
				throw new Error("缺少密钥参数");
			}

			// 解析标签
			const label = decodeURIComponent(url.pathname.substring(1));
			let name = label;
			let issuer = url.searchParams.get("issuer") || "";

			// 如果标签包含冒号，分离issuer和account name
			const colonIndex = label.indexOf(":");
			if (colonIndex > 0) {
				const labelIssuer = label.substring(0, colonIndex);
				const labelName = label.substring(colonIndex + 1);

				// 如果URL参数中没有issuer，使用标签中的issuer
				if (!issuer) {
					issuer = labelIssuer;
				}
				name = labelName;
			}

			return {
				name: name.trim(),
				issuer: issuer.trim(),
				secret: secret.toUpperCase().replace(/\s/g, ""),
			};
		} catch (error) {
			console.warn("解析URI失败:", uri, error);
			return null;
		}
	}

	downloadFile(content, filename, mimeType = "text/plain") {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		URL.revokeObjectURL(url);
	}

	readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result);
			reader.onerror = (_e) => reject(new Error("文件读取失败"));
			reader.readAsText(file, "UTF-8");
		});
	}

	// Toast 通知
	showToast(message) {
		const toast = document.getElementById("toast");
		const messageElement = document.getElementById("toast-message");

		messageElement.textContent = message;
		toast.classList.add("show");

		setTimeout(() => {
			toast.classList.remove("show");
		}, 3000);
	}

	// 验证密钥
	validateSecret(secret) {
		const cleanSecret = secret.replace(/\s/g, "").toUpperCase();

		// 检查长度 (16 或 32 字符)
		if (cleanSecret.length !== 16 && cleanSecret.length !== 32) {
			return { valid: false, message: "密钥必须是16位或32位字符" };
		}

		// 检查是否只包含有效的Base32字符
		const base32Regex = /^[A-Z2-7]+$/;
		if (!base32Regex.test(cleanSecret)) {
			return { valid: false, message: "密钥包含无效字符，只允许A-Z和2-7" };
		}

		// 尝试生成TOTP验证
		try {
			const totp = new jsOTP.totp();
			totp.getOtp(cleanSecret);
			return { valid: true, secret: cleanSecret };
		} catch (_error) {
			return { valid: false, message: "无效的密钥格式" };
		}
	}

	// 事件监听器设置
	setupEventListeners() {
		// 菜单按钮
		document.getElementById("menu-btn").addEventListener("click", (e) => {
			e.stopPropagation();
			const dropdown = document.getElementById("menu-dropdown");
			const isVisible = dropdown.style.display === "block";
			dropdown.style.display = isVisible ? "none" : "block";
		});

		// 点击其他地方关闭菜单
		document.addEventListener("click", () => {
			document.getElementById("menu-dropdown").style.display = "none";
		});

		// 导入按钮
		document.getElementById("import-btn").addEventListener("click", () => {
			document.getElementById("menu-dropdown").style.display = "none";
			this.showModal("import-modal-backdrop");
		});

		// 导出按钮
		document.getElementById("export-btn").addEventListener("click", () => {
			document.getElementById("menu-dropdown").style.display = "none";
			this.showExportModal();
		});

		// 搜索功能
		const searchInput = document.getElementById("search-input");
		const searchClear = document.getElementById("search-clear");

		searchInput.addEventListener("input", (e) => {
			const query = e.target.value.trim();
			this.filterAccounts(query);

			// 显示/隐藏清除按钮
			if (query) {
				searchClear.style.display = "flex";
			} else {
				searchClear.style.display = "none";
			}
		});

		searchClear.addEventListener("click", () => {
			searchInput.value = "";
			this.filterAccounts("");
			searchClear.style.display = "none";
			searchInput.focus();
		});

		// 添加账户按钮
		document.getElementById("add-account-btn").addEventListener("click", () => {
			this.showModal("add-modal-backdrop");
		});

		document
			.getElementById("add-first-account")
			.addEventListener("click", () => {
				this.showModal("add-modal-backdrop");
			});

		// 关闭模态框
		document.getElementById("close-modal-btn").addEventListener("click", () => {
			this.hideModal("add-modal-backdrop");
		});

		document
			.getElementById("close-edit-modal-btn")
			.addEventListener("click", () => {
				this.hideModal("edit-modal-backdrop");
			});

		document
			.getElementById("close-import-modal-btn")
			.addEventListener("click", () => {
				this.hideModal("import-modal-backdrop");
			});

		document
			.getElementById("close-export-modal-btn")
			.addEventListener("click", () => {
				this.hideModal("export-modal-backdrop");
			});

		// 二维码模态框事件
		document
			.getElementById("close-show-qr-modal-btn")
			.addEventListener("click", () => {
				this.hideModal("show-qr-modal-backdrop");
			});

		document
			.getElementById("close-show-qr-btn")
			.addEventListener("click", () => {
				this.hideModal("show-qr-modal-backdrop");
			});

		document.getElementById("cancel-add-btn").addEventListener("click", () => {
			this.hideModal("add-modal-backdrop");
		});

		document.getElementById("cancel-edit-btn").addEventListener("click", () => {
			this.hideModal("edit-modal-backdrop");
		});

		document
			.getElementById("cancel-import-btn")
			.addEventListener("click", () => {
				this.hideModal("import-modal-backdrop");
			});

		document
			.getElementById("cancel-export-btn")
			.addEventListener("click", () => {
				this.hideModal("export-modal-backdrop");
			});

		// 点击背景关闭模态框
		document
			.getElementById("add-modal-backdrop")
			.addEventListener("click", (e) => {
				if (e.target === e.currentTarget) {
					this.hideModal("add-modal-backdrop");
				}
			});

		document
			.getElementById("edit-modal-backdrop")
			.addEventListener("click", (e) => {
				if (e.target === e.currentTarget) {
					this.hideModal("edit-modal-backdrop");
				}
			});

		document
			.getElementById("import-modal-backdrop")
			.addEventListener("click", (e) => {
				if (e.target === e.currentTarget) {
					this.hideModal("import-modal-backdrop");
				}
			});

		document
			.getElementById("export-modal-backdrop")
			.addEventListener("click", (e) => {
				if (e.target === e.currentTarget) {
					this.hideModal("export-modal-backdrop");
				}
			});

		document
			.getElementById("show-qr-modal-backdrop")
			.addEventListener("click", (e) => {
				if (e.target === e.currentTarget) {
					this.hideModal("show-qr-modal-backdrop");
				}
			});

		// 添加账户表单
		document
			.getElementById("add-account-form")
			.addEventListener("submit", (e) => {
				e.preventDefault();

				const name = document.getElementById("account-name").value.trim();
				const issuer = document.getElementById("account-issuer").value.trim();
				const secret = document.getElementById("secret-key").value.trim();

				if (!name || !secret) {
					this.showToast("请填写账户名称和密钥");
					return;
				}

				const validation = this.validateSecret(secret);
				if (!validation.valid) {
					this.showToast(validation.message);
					return;
				}

				this.addAccount(name, issuer, validation.secret);
				this.hideModal("add-modal-backdrop");

				// 重置表单
				e.target.reset();
			});

		// 编辑账户表单
		document
			.getElementById("edit-account-form")
			.addEventListener("submit", (e) => {
				e.preventDefault();

				const name = document.getElementById("edit-account-name").value.trim();
				const issuer = document
					.getElementById("edit-account-issuer")
					.value.trim();

				if (!name) {
					this.showToast("请填写账户名称");
					return;
				}

				if (this.currentEditId) {
					this.updateAccount(this.currentEditId, name, issuer);
					this.hideModal("edit-modal-backdrop");
					this.currentEditId = null;
				}
			});

		// 删除账户按钮
		document
			.getElementById("delete-account-btn")
			.addEventListener("click", () => {
				if (this.currentEditId) {
					this.deleteAccount(this.currentEditId);
					this.hideModal("edit-modal-backdrop");
					this.currentEditId = null;
				}
			});

		// 导入相关事件监听器
		document.getElementById("select-file-btn").addEventListener("click", () => {
			document.getElementById("import-file").click();
		});

		document
			.getElementById("import-file")
			.addEventListener("change", async (e) => {
				const file = e.target.files[0];
				if (file) {
					try {
						const content = await this.readFileAsText(file);
						document.getElementById("import-text").value = content;
						this.previewImport(content);
					} catch (_error) {
						this.showToast("文件读取失败");
					}
				}
			});

		document.getElementById("import-text").addEventListener("input", (e) => {
			this.previewImport(e.target.value);
		});

		document
			.getElementById("confirm-import-btn")
			.addEventListener("click", () => {
				const content = document.getElementById("import-text").value.trim();
				if (content) {
					this.importAccounts(content).then(() => {
						this.hideModal("import-modal-backdrop");
						document.getElementById("import-text").value = "";
						document.getElementById("import-preview").style.display = "none";
					});
				}
			});

		// 导出相关事件监听器
		document
			.querySelectorAll('input[name="export-format"]')
			.forEach((radio) => {
				radio.addEventListener("change", () => {
					this.updateExportPreview();
				});
			});

		document
			.getElementById("download-export-btn")
			.addEventListener("click", () => {
				this.downloadExportFile();
			});

		// ESC 键关闭模态框
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.hideModal("add-modal-backdrop");
				this.hideModal("edit-modal-backdrop");
				this.hideModal("import-modal-backdrop");
				this.hideModal("export-modal-backdrop");
				this.hideModal("show-qr-modal-backdrop");
				document.getElementById("menu-dropdown").style.display = "none";
			}
		});
	}

	// 显示导出模态框并准备数据
	showExportModal() {
		if (this.accounts.length === 0) {
			this.showToast("没有账户可导出");
			return;
		}

		this.showModal("export-modal-backdrop");
		this.updateExportPreview();
	}

	// 更新导出预览
	updateExportPreview() {
		const format = document.querySelector(
			'input[name="export-format"]:checked',
		).value;
		const content = this.exportAccounts(format);
		document.getElementById("export-content").value = content;
	}

	// 下载导出文件
	downloadExportFile() {
		const format = document.querySelector(
			'input[name="export-format"]:checked',
		).value;
		const content = this.exportAccounts(format);

		if (!content) return;

		const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
		const extension = format === "json" ? "json" : "txt";
		const filename = `2fa-backup-${timestamp}.${extension}`;
		const mimeType = format === "json" ? "application/json" : "text/plain";

		this.downloadFile(content, filename, mimeType);
		this.showToast(`导出文件已下载: ${filename}`);
		this.hideModal("export-modal-backdrop");
	}

	// 预览导入内容
	previewImport(content) {
		const preview = document.getElementById("import-preview");
		const previewList = document.getElementById("import-preview-list");
		const confirmBtn = document.getElementById("confirm-import-btn");

		if (!content.trim()) {
			preview.style.display = "none";
			confirmBtn.disabled = true;
			return;
		}

		try {
			let accounts = [];

			// 尝试解析内容
			if (content.trim().startsWith("[") || content.trim().startsWith("{")) {
				// JSON 格式
				const jsonData = JSON.parse(content);
				accounts = Array.isArray(jsonData) ? jsonData : [jsonData];
			} else if (content.includes("otpauth://")) {
				// URI 格式
				const lines = content.split("\n").filter((line) => line.trim());
				accounts = lines
					.map((line) => this.parseOtpAuthUri(line.trim()))
					.filter(Boolean);
			}

			if (accounts.length === 0) {
				throw new Error("没有找到有效账户");
			}

			// 显示预览
			previewList.innerHTML = "";
			accounts.forEach((account) => {
				if (account?.name && account.secret) {
					const item = document.createElement("div");
					item.className = "import-preview-item";
					item.innerHTML = `
						<span class="material-icons">account_circle</span>
						<div class="import-preview-text">
							<span class="import-preview-issuer">${account.issuer || "未知服务"}</span>
							<span class="import-preview-account">${account.name}</span>
						</div>
					`;
					previewList.appendChild(item);
				}
			});

			preview.style.display = "block";
			confirmBtn.disabled = false;
			confirmBtn.textContent = `导入 ${accounts.length} 个账户`;
		} catch (error) {
			preview.style.display = "none";
			confirmBtn.disabled = true;
			console.warn("预览失败:", error);
		}
	}

	// 显示账户的二维码
	showAccountQRCode(accountId) {
		const account = this.accounts.find((acc) => acc.id === accountId);
		if (!account) {
			this.showToast("账户不存在");
			return;
		}

		try {
			// 检查QRCode库是否可用
			if (typeof QRCode === "undefined") {
				throw new Error("QRCode库未加载");
			}

			// 生成 otpauth URI
			const otpauthUri = this.generateOtpAuthUri(account);

			// 显示二维码
			const display = document.getElementById("qr-code-display");
			display.innerHTML = "";

			// 创建二维码
			new QRCode(display, {
				text: otpauthUri,
				width: 200,
				height: 200,
				colorDark: "#000000",
				colorLight: "#ffffff",
				correctLevel: QRCode.CorrectLevel.M,
			});

			// 显示账户信息
			const info = document.getElementById("qr-code-info");
			info.innerHTML = `
				<h3>${this.escapeHtml(account.name)}</h3>
				${account.issuer ? `<p><strong>发行商:</strong> ${this.escapeHtml(account.issuer)}</p>` : ""}
				<p><strong>类型:</strong> TOTP</p>
				<p style="font-size: 12px; margin-top: 12px; opacity: 0.7;">使用支持TOTP的认证器应用扫描此二维码</p>
			`;

			this.showModal("show-qr-modal-backdrop");
		} catch (error) {
			console.error("生成二维码失败:", error);
			this.showToast("生成二维码失败");
		}
	}
}

// 初始化应用
document.addEventListener("DOMContentLoaded", () => {
	// 检查 jsOTP 库是否加载
	if (typeof jsOTP === "undefined") {
		console.error("jsOTP library not loaded");
		document.body.innerHTML =
			'<div style="padding: 20px; text-align: center;">加载失败，请刷新页面重试</div>';
		return;
	}

	const manager = new TOTP2FAManager();
	// 暴露到全局作用域供HTML使用
	window.totp2fa = manager;
});

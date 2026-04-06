/**
 * Pi Image Composer - Browser App
 */

(function() {
	const $ = (id) => document.getElementById(id);
	const els = {
		prompt: $('prompt-text'),
		upload: $('upload-area'),
		fileInput: $('file-input'),
		pick: $('file-picker-btn'),
		imagesSection: $('images-section'),
		imagesList: $('images-list'),
		status: $('status'),
		submit: $('submit-btn'),
		countdown: $('countdown'),
	};

	const state = {
		token: new URL(location.href).searchParams.get('t'),
		images: new Map(),
		expired: false,
		sent: false,
	};

	let countdown = 0;

	const esc = (value) => String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
	const size = (bytes) => bytes == null ? '—' : bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

	function status(message = '', type = '') {
		els.status.textContent = message;
		els.status.className = type ? `status ${type}` : 'status';
	}

	function setExpired(message = 'Session expired. Please run /cpimg again.') {
		if (state.expired) return;
		state.expired = true;
		clearInterval(countdown);
		els.prompt.disabled = true;
		els.fileInput.disabled = true;
		els.pick.disabled = true;
		els.submit.disabled = true;
		els.submit.textContent = 'Session Expired';
		els.countdown.textContent = 'Expired';
		status(message, 'error');
	}

	function refreshSubmit() {
		els.submit.disabled = state.expired || state.sent || (!els.prompt.value.trim() && state.images.size === 0);
	}

	function render() {
		els.imagesSection.style.display = state.images.size ? 'block' : 'none';
		els.imagesList.innerHTML = [...state.images.values()].map((img) => `
			<div class="image-card">
				${img.previewUrl ? `<img class="image-preview" src="${esc(img.previewUrl)}" alt="${esc(img.originalName)}">` : '<div class="image-preview image-preview-placeholder">Preview unavailable</div>'}
				<div class="image-info">
					<input class="image-name-input" value="${esc(img.name)}" readonly disabled>
					<div class="image-meta">${esc(img.originalName)} • ${size(img.size)} • ${esc((img.mimeType || '').split('/')[1] || img.mimeType || 'image')}</div>
					<div class="image-actions">
						<button class="btn-delete" data-name="${esc(img.name)}" ${state.expired || state.sent ? 'disabled' : ''}>Delete</button>
					</div>
				</div>
			</div>
		`).join('');
		refreshSubmit();
	}

	async function api(path, options) {
		const res = await fetch(path, options);
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new Error(data?.error || 'Request failed');
		return data;
	}

	function toBase64(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result).split(',')[1]);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	async function uploadFile(file) {
		if (state.expired || state.sent) return;
		if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return status(`Unsupported type: ${file.type}`, 'error');
		if (file.size > 10 * 1024 * 1024) return status(`File too large: ${file.name}`, 'error');
		if (state.images.size >= 10) return status('Maximum 10 images allowed', 'error');
		status('Uploading...', 'loading');
		try {
			const result = await api(`/api/cpimg/session/${state.token}/upload`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					originalName: file.name,
					mimeType: file.type,
					data: await toBase64(file),
				}),
			});
			state.images.set(result.image.name, { ...result.image, previewUrl: URL.createObjectURL(file) });
			render();
			status();
		} catch (error) {
			/expired/i.test(error.message) ? setExpired(error.message) : status(`Upload failed: ${error.message}`, 'error');
		}
	}

	function startCountdown(expiresAt) {
		clearInterval(countdown);
		const tick = () => {
			const left = Math.max(0, expiresAt - Date.now());
			els.countdown.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
			if (!left) setExpired();
		};
		tick();
		countdown = setInterval(tick, 1000);
	}

	async function submit() {
		if (state.expired || state.sent) return;
		const promptText = els.prompt.value.trim();
		if (!promptText && !state.images.size) return status('Please enter a prompt or upload images', 'error');
		status('Submitting...', 'loading');
		els.submit.disabled = true;
		try {
			await api(`/api/cpimg/session/${state.token}/submit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ promptText }),
			});
			state.sent = true;
			clearInterval(countdown);
			els.prompt.disabled = true;
			els.fileInput.disabled = true;
			els.pick.disabled = true;
			els.submit.textContent = 'Sent ✓';
			els.countdown.textContent = 'Completed';
			status('Sent to Pi. You can close this tab.', 'success');
			render();
		} catch (error) {
			/expired/i.test(error.message) ? setExpired(error.message) : status(`Submit failed: ${error.message}`, 'error');
			refreshSubmit();
		}
	}

	async function init() {
		if (!state.token) return setExpired('Missing session token. Please run /cpimg again.');
		status('Loading...', 'loading');
		try {
			const session = await api(`/api/cpimg/session/${state.token}`);
			els.prompt.value = session.promptText || '';
			for (const image of session.images) state.images.set(image.name, { ...image, previewUrl: null });
			render();
			startCountdown(session.expiresAt);
			status();
		} catch (error) {
			setExpired(error.message);
		}
	}

	els.pick.addEventListener('click', () => !state.expired && !state.sent && els.fileInput.click());
	els.fileInput.addEventListener('change', (e) => {
		for (const file of e.target.files || []) void uploadFile(file);
		e.target.value = '';
	});
	els.prompt.addEventListener('input', refreshSubmit);
	els.submit.addEventListener('click', submit);

	els.upload.addEventListener('dragover', (e) => {
		if (state.expired || state.sent) return;
		e.preventDefault();
		els.upload.classList.add('drag-over');
	});
	els.upload.addEventListener('dragleave', () => els.upload.classList.remove('drag-over'));
	els.upload.addEventListener('drop', (e) => {
		e.preventDefault();
		els.upload.classList.remove('drag-over');
		if (state.expired || state.sent) return;
		for (const file of e.dataTransfer?.files || []) void uploadFile(file);
	});

	document.addEventListener('paste', async (e) => {
		if (state.expired || state.sent) return;
		for (const item of e.clipboardData?.items || []) {
			if (!item.type.startsWith('image/')) continue;
			e.preventDefault();
			const file = item.getAsFile();
			if (file) await uploadFile(new File([file], `pasted-${Date.now()}.png`, { type: file.type }));
		}
	});

	els.imagesList.addEventListener('click', async (e) => {
		const button = e.target.closest('.btn-delete');
		if (!button || state.expired || state.sent) return;
		const name = button.dataset.name;
		if (!name) return;
		try {
			await api(`/api/cpimg/session/${state.token}/upload/${encodeURIComponent(name)}`, { method: 'DELETE' });
			const image = state.images.get(name);
			if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
			state.images.delete(name);
			render();
			status('Image deleted', 'success');
		} catch (error) {
			/expired/i.test(error.message) ? setExpired(error.message) : status(`Delete failed: ${error.message}`, 'error');
		}
	});


	window.addEventListener('beforeunload', () => {
		clearInterval(countdown);
		for (const image of state.images.values()) if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
	});

	init();
})();

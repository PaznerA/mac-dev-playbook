/**
 * Glasswing Hub — client-side logic
 *   - Filter / search across service cards
 *   - Poll /api/v1/hub/health for live up/down indicators
 */
(function () {
	'use strict';

	const grid = document.getElementById('hub-grid');
	if (!grid) { return; }

	const searchInput = document.getElementById('hub-search');
	const filterBtns = document.querySelectorAll('.filter-btn[data-filter]');
	const refreshBtn = document.getElementById('hub-refresh-health');
	const cards = () => Array.from(grid.querySelectorAll('.hub-card'));

	let activeCategory = 'all';
	let query = '';

	function applyFilter() {
		cards().forEach(card => {
			const cat = card.dataset.category || '';
			const name = card.dataset.name || '';
			const categoryOk = activeCategory === 'all' || cat === activeCategory;
			const queryOk = !query || name.includes(query) || cat.includes(query);
			card.classList.toggle('hidden', !(categoryOk && queryOk));
		});
	}

	filterBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			filterBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			activeCategory = btn.dataset.filter;
			applyFilter();
		});
	});

	if (searchInput) {
		searchInput.addEventListener('input', (ev) => {
			query = (ev.target.value || '').toLowerCase().trim();
			applyFilter();
		});
	}

	// Health polling
	async function fetchHealth() {
		try {
			const res = await fetch('/api/v1/hub/health', { headers: { Accept: 'application/json' } });
			if (!res.ok) { return; }
			const data = await res.json();
			const probes = (data && data.probes) || [];
			const byUrl = Object.create(null);
			probes.forEach(p => { byUrl[p.url] = p; });
			cards().forEach(card => {
				const url = card.dataset.url;
				if (!url) { return; }
				const probe = byUrl[url];
				const healthEl = card.querySelector('.hub-card-health');
				if (!healthEl) { return; }
				healthEl.classList.remove('up', 'down', 'skipped');
				if (!probe) {
					healthEl.classList.add('skipped');
					healthEl.title = 'Not probed';
					return;
				}
				healthEl.classList.add(probe.status);
				healthEl.title = `HTTP ${probe.http_code} in ${probe.ms}ms`;
			});
		} catch (err) {
			console.warn('[hub] health poll failed:', err);
		}
	}

	if (refreshBtn) {
		refreshBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			fetchHealth();
		});
	}

	fetchHealth();
	setInterval(fetchHealth, 30_000); // refresh every 30s
})();

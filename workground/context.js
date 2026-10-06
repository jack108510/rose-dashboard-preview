(() => {
  'use strict';
  const API = 'https://wildrose-widget.wildeautomations.com';
  const SNAPSHOT_KEY = 'roseContextWebSnapshot';
  const $ = id => document.getElementById(id);
  const groups = [
    { id: 'business', name: 'Business', mark: 'B', words: /business name|description|about|company|established|specializ/i },
    { id: 'services', name: 'Services', mark: 'S', words: /service|repair|install|offer|product|quote|price|cost|sell/i },
    { id: 'hours', name: 'Hours', mark: '◷', words: /hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|open|closed|am\b|pm\b/i },
    { id: 'areas', name: 'Locations', mark: '↗', words: /area|location|address|serve|serving|region|city|town|province|street|\broad\b/i },
    { id: 'contact', name: 'Contact', mark: '@', words: /contact|email|phone|call|@|\+\d|\b\d{3}[- .]\d{3}/i },
    { id: 'other', name: 'Other facts', mark: '·', words: /.*/ },
  ];
  let account = {}, approved = [], pending = [], selected = null, filter = 'all', query = '';
  let lastSiteScan = null, currentSession = '', loading = false, nodes = [], links = [], zoom = 1, panX = 0, panY = 0, pointer = null;
  let worldWidth = 1100, worldHeight = 800;
  const token = () => localStorage.getItem('wildroseDashboardToken') || localStorage.getItem('roseDashboardToken') || '';
  const clean = (value, max = 2400) => String(value || '').slice(0, max);
  function safeUrl(value) {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  }
  const sourceLabel = value => {
    try { const url = new URL(value); return url.hostname.replace(/^www\./, '') + (url.pathname === '/' ? '' : url.pathname); }
    catch { return 'Source not recorded'; }
  };
  async function sessionId(value) {
    if (!value) return '';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function normalise(note, status) {
    const text = clean(note.text || note.content);
    const label = clean(note.label, 120);
    const category = (/service areas/i.test(label) ? groups.find(group => group.id === 'areas') : null) || groups.find(group => group.id !== 'other' && group.words.test(label + ' ' + text)) || groups[groups.length - 1];
    return { id: status + ':' + clean(note.id || text, 140), originalId: clean(note.id, 140), text, label,
      status, group: category.id, sourceUrl: safeUrl(note.sourceUrl), source: clean(note.source, 80),
      scanId: clean(note.scanId, 120), createdAt: clean(note.reviewedAt || note.createdAt, 60) };
  }
  const facts = () => [...approved, ...pending];
  const visible = fact => (filter === 'all' || fact.status === filter) &&
    (!query || (fact.text + ' ' + fact.label + ' ' + sourceLabel(fact.sourceUrl)).toLowerCase().includes(query));
  function notify(message) { $('notice').textContent = message; $('notice').hidden = !message; }
  function clearSession() {
    localStorage.removeItem('wildroseDashboardToken');
    localStorage.removeItem('roseDashboardToken');
    ['roseClientSettings','roseCommandHistory','roseSavedContext','rosePreviewKnowledge','rosePreviewApiKeys','roseDraftConnections','roseConnectedConnections','roseDraftWorkflows','rosePendingWorkflowDrafts','roseDraftConfig','rosePendingContextReview','roseLastSiteScan',SNAPSHOT_KEY].forEach(key=>localStorage.removeItem(key));
    currentSession = ''; lastSiteScan = null; account = {}; approved = []; pending = []; selected = null;
    render();
  }
  async function request(path, body) {
    const requestToken = token();
    const response = await fetch(API + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + requestToken },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (token() !== requestToken) throw new Error('Your account changed. Refresh to sync the current account.');
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Could not sync your context. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function errorMessage(error) {
    if (error.status === 401 || error.status === 403) {
      clearSession();
      notify('Your session expired. Sign in to Workground to continue.');
    } else notify(error.message || 'Could not sync your context. Please try again.');
  }
  function readSnapshot(session) {
    try {
      const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
      return snapshot?.session === session && Array.isArray(snapshot.pending) ? snapshot : null;
    } catch { return null; }
  }
  function saveSnapshot() {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ version: 1, session: currentSession,
      lastSiteScan, website: $('websiteInput').value, businessName: account.businessName || '',
      pending: pending.map(fact => ({ id: fact.originalId, text: fact.text, label: fact.label,
        sourceUrl: fact.sourceUrl, source: fact.source, scanId: fact.scanId, createdAt: fact.createdAt })),
      updatedAt: new Date().toISOString() }));
  }
  async function loadContext() {
    if (loading) return;
    if (!token()) { currentSession = ''; account = {}; approved = []; pending = []; selected = null; render(); return; }
    loading = true; $('refresh').disabled = true; $('syncLabel').textContent = 'Syncing…';
    try {
      const loadingToken = token(); const session = await sessionId(loadingToken);
      const [dashboard, knowledge] = await Promise.all([
        request('/api/rose-account-dashboard'), request('/api/rose-account-knowledge'),
      ]);
      if (token() !== loadingToken) return;
      account = { businessName: clean(dashboard.customer?.businessName, 180),
        website: safeUrl(dashboard.draft?.settings?.website || dashboard.customer?.website),
        email: clean(dashboard.account?.email, 240) };
      approved = (Array.isArray(knowledge.notes) ? knowledge.notes : []).filter(note => note && !note.revokedAt && (note.text || note.content)).map(note => normalise(note, 'approved'));
      currentSession = session;
      const snapshot = readSnapshot(session); lastSiteScan = snapshot?.lastSiteScan || null;
      pending = (snapshot?.pending || []).filter(note => note?.text).map(note => normalise(note, 'pending'));
      pending = pending.filter(fact => !approved.some(saved => saved.text === fact.text && saved.sourceUrl === fact.sourceUrl));
      $('websiteInput').value = safeUrl(snapshot?.website) || account.website;
      notify(''); render();
    } catch (error) { errorMessage(error); $('syncLabel').textContent = 'Sync unavailable'; }
    finally { loading = false; $('refresh').disabled = false; }
  }
  function buildWeb() {
    const all = facts();
    const populated = groups.filter(group => all.some(fact => fact.group === group.id));
    const largestGroup = Math.max(0, ...populated.map(group => all.filter(fact => fact.group === group.id).length));
    const factRadius = largestGroup ? 124 + Math.floor((largestGroup - 1) / 8) * 96 : 0;
    const categoryRadius = populated.length > 1 ? Math.max(250, factRadius + 110) : 220;
    const sourceUrls = [...new Set(all.map(fact => fact.sourceUrl).filter(Boolean))];
    const sourceRadius = categoryRadius + factRadius + (sourceUrls.length ? 65 : 0);
    const extent = Math.max(430, sourceRadius + 95);
    worldWidth = worldHeight = Math.ceil(extent * 2);
    const center = extent;
    const world = $('world'); world.style.width = worldWidth + 'px'; world.style.height = worldHeight + 'px';
    const svg = $('edges'); svg.setAttribute('width', worldWidth); svg.setAttribute('height', worldHeight);
    const root = { id: 'root', kind: 'root', x: center, y: center, label: account.businessName || 'Your business', mark: '✳' };
    nodes = [root]; links = [];
    populated.forEach((group, groupIndex) => {
      const angle = -Math.PI / 2 + groupIndex * Math.PI * 2 / populated.length;
      const category = { id: 'group:' + group.id, kind: 'category', group: group.id, label: group.name, mark: group.mark,
        x: center + Math.cos(angle) * categoryRadius, y: center + Math.sin(angle) * categoryRadius };
      nodes.push(category); links.push({ from: root.id, to: category.id, flow: true });
      const groupFacts = all.filter(fact => fact.group === group.id);
      groupFacts.forEach((fact, index) => {
        const ring = Math.floor(index / 8), inRing = Math.min(8, groupFacts.length - ring * 8);
        const arc = angle + (index % 8) * Math.PI * 2 / inRing;
        const radius = 124 + ring * 96;
        const node = { id: fact.id, kind: 'fact', fact, group: group.id,
          label: fact.label || fact.text, x: category.x + Math.cos(arc) * radius,
          y: category.y + Math.sin(arc) * radius };
        nodes.push(node); links.push({ from: category.id, to: node.id });
      });
    });
    sourceUrls.forEach((url, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / sourceUrls.length;
      const node = { id: 'source:' + url, kind: 'source', label: sourceLabel(url), url, mark: '↗',
        x: center + Math.cos(angle) * sourceRadius, y: center + Math.sin(angle) * sourceRadius };
      nodes.push(node);
      links.push({ from: root.id, to: node.id, source: true });
      nodes.filter(item => item.fact?.sourceUrl === url).forEach(item => links.push({ from: node.id, to: item.id, source: true }));
    });
    svg.replaceChildren();
    const byId = new Map(nodes.map(node => [node.id, node]));
    links.forEach(link => {
      const a = byId.get(link.from), b = byId.get(link.to);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const bend = link.source ? 32 : 13;
      const d = 'M ' + a.x + ' ' + a.y + ' Q ' + ((a.x + b.x) / 2 + bend) + ' ' + ((a.y + b.y) / 2 - bend) + ' ' + b.x + ' ' + b.y;
      path.setAttribute('d', d); path.setAttribute('class', 'edge' + (link.source ? ' source' : ''));
      path.dataset.from = link.from; path.dataset.to = link.to; svg.appendChild(path);
      if (link.flow) {
        const flow = path.cloneNode(); flow.classList.add('flow'); svg.appendChild(flow);
      }
    });
    document.querySelector('.graph-bottom p').textContent = 'Drag to explore · select a point to inspect its source and status';
    $('nodes').replaceChildren();
    nodes.forEach(node => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'web-node ' + node.kind + (node.fact ? ' ' + node.fact.status : '');
      button.dataset.node = node.id; button.style.left = node.x + 'px'; button.style.top = node.y + 'px';
      button.setAttribute('aria-label', node.fact ? node.fact.status + ' fact: ' + node.fact.text : node.label);
      const orb = document.createElement('span'); orb.className = 'orb'; orb.textContent = node.mark || ''; orb.setAttribute('aria-hidden', 'true');
      const label = document.createElement('b'); label.textContent = clean(node.label, 110);
      button.append(orb, label);
      if (node.kind === 'fact') { const status = document.createElement('small'); status.textContent = node.fact.status === 'approved' ? 'Approved' : 'Needs review'; button.append(status); }
      if (node.kind === 'category') { const count = document.createElement('small'); count.textContent = all.filter(fact => fact.group === node.group).length + ' facts'; button.append(count); }
      button.addEventListener('click', () => selectNode(node));
      $('nodes').appendChild(button);
    });
    fitWeb(); updateHighlights();
  }
  function transform() {
    $('world').style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    $('world').style.setProperty('--counter-scale', String(1 / zoom));
    $('graph').classList.toggle('compact', zoom < .6);
  }
  function fitWeb() {
    const bounds = $('graph').getBoundingClientRect();
    zoom = Math.min(bounds.width / worldWidth, (bounds.height - 60) / worldHeight);
    panX = (bounds.width - worldWidth * zoom) / 2; panY = (bounds.height - worldHeight * zoom) / 2 - 10; transform();
  }
  function zoomBy(factor) {
    const width = $('graph').clientWidth, height = $('graph').clientHeight;
    const next = Math.max(.25, Math.min(2.5, zoom * factor));
    panX = width / 2 - (width / 2 - panX) * next / zoom;
    panY = height / 2 - (height / 2 - panY) * next / zoom;
    zoom = next; transform();
  }
  function selectNode(node) {
    if (node.fact) { selected = node.fact.id; showFact(node.fact); }
    else if (node.kind === 'category') { query = ''; $('search').value = ''; selected = node.id; showSummary(node.label, facts().filter(fact => fact.group === node.group)); }
    else if (node.kind === 'source') { selected = node.id; showSummary('Source page', facts().filter(fact => fact.sourceUrl === node.url), node.url); }
    else { selected = node.id; showSummary(account.businessName || 'Your business', facts(), account.website); }
    updateHighlights(); renderList();
  }
  function element(tag, className, text) {
    const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el;
  }
  function sourceInfo(container, url, source, label = '') {
    const box = element('div', 'source-info');
    box.appendChild(element('span', '', url ? 'Source page' : source === 'owner-chat' ? 'Suggested from your Builder conversation' : source === 'document' ? 'Uploaded document: ' + (label || 'document') : source === 'owner' ? 'Added by the business owner' : 'Source not recorded'));
    if (url) { const anchor = element('a', '', sourceLabel(url)); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; box.appendChild(anchor); }
    container.appendChild(box);
  }
  function showSummary(title, rows, url) {
    const detail = $('detail'); detail.replaceChildren(element('h2', '', title),
      element('p', 'fact-text', rows.length + ' facts · ' + rows.filter(fact => fact.status === 'approved').length + ' approved'));
    if (url) sourceInfo(detail, url);
    detail.appendChild(element('p', 'detail-placeholder', 'Choose a fact below to see the full text and review its source.'));
  }
  function showFact(fact) {
    const detail = $('detail'); detail.replaceChildren();
    detail.appendChild(element('span', 'tag ' + fact.status, fact.status === 'approved' ? '✓ Approved knowledge' : '○ Needs your review'));
    detail.appendChild(element('h2', '', fact.label || groups.find(group => group.id === fact.group).name));
    let editor;
    if (fact.status === 'pending') {
      editor = element('textarea'); editor.value = fact.text; editor.setAttribute('aria-label', 'Edit context fact before approval'); detail.appendChild(editor);
    } else detail.appendChild(element('p', 'fact-text', fact.text));
    sourceInfo(detail, fact.sourceUrl, fact.source, fact.label);
    if (fact.status === 'pending') {
      detail.appendChild(element('p', 'detail-placeholder', 'This suggestion is not published. Check it before approving.'));
      const actions = element('div', 'detail-actions');
      const approve = element('button', 'primary', 'Approve fact'); approve.type = 'button';
      const discard = element('button', 'secondary', 'Discard'); discard.type = 'button';
      actions.append(approve, discard); detail.appendChild(actions);
      approve.addEventListener('click', async () => {
        const text = editor.value.trim();
        if (text.length < 3) { notify('Add a little more detail before approving this fact.'); return; }
        approve.disabled = discard.disabled = true; approve.textContent = 'Saving…';
        try {
          const data = await request('/api/rose-account-knowledge', { action: 'add', text, source: fact.source === 'document' ? 'document' : fact.source === 'owner-chat' ? 'owner-chat' : 'website-scan', sourceUrl: fact.sourceUrl, scanId: fact.scanId });
          if (!data.note?.id) throw new Error('The approved fact could not be saved. Please try again.');
          approved.push(normalise(data.note, 'approved')); pending = pending.filter(item => item.id !== fact.id);
          selected = 'approved:' + data.note.id; saveSnapshot(); notify('Fact approved. Publish from Builder when your context is ready.'); render();
        } catch (error) { errorMessage(error); approve.disabled = discard.disabled = false; approve.textContent = 'Approve fact'; }
      });
      discard.addEventListener('click', () => { pending = pending.filter(item => item.id !== fact.id); selected = null; saveSnapshot(); notify('Suggestion discarded.'); render(); });
    }
  }
  function renderList() {
    let rows = facts().filter(visible);
    if (selected?.startsWith('group:')) rows = rows.filter(fact => fact.group === selected.slice(6));
    if (selected?.startsWith('source:')) rows = rows.filter(fact => fact.sourceUrl === selected.slice(7));
    $('listCount').textContent = rows.length + (rows.length === 1 ? ' fact' : ' facts');
    const list = $('facts'); list.replaceChildren();
    if (!rows.length) { list.appendChild(element('p', 'no-results', facts().length ? 'No facts match this view. Try another filter or search.' : 'New website and conversation facts will appear here.')); return; }
    rows.forEach(fact => {
      const row = element('button', 'fact-row ' + fact.status + (selected === fact.id ? ' selected' : '')); row.type = 'button';
      const dot = element('i'); dot.setAttribute('aria-hidden', 'true');
      const copy = element('div'); copy.appendChild(element('b', '', fact.text));
      copy.appendChild(element('small', '', groups.find(group => group.id === fact.group).name + ' · ' + (fact.status === 'approved' ? 'Approved' : 'Needs review')));
      row.append(dot, copy); row.addEventListener('click', () => {
        selected = fact.id; showFact(fact); updateHighlights(); renderList();
        const node = nodes.find(item => item.id === fact.id);
        if (node) { panX = $('graph').clientWidth / 2 - node.x * zoom; panY = $('graph').clientHeight / 2 - node.y * zoom; transform(); }
      }); list.appendChild(row);
    });
  }
  function updateHighlights() {
    const related = new Set(selected ? [selected] : []);
    links.forEach(link => { if (link.from === selected || link.to === selected) { related.add(link.from); related.add(link.to); } });
    document.querySelectorAll('.web-node').forEach(button => {
      const node = nodes.find(item => item.id === button.dataset.node);
      button.classList.toggle('selected', node?.id === selected);
      button.classList.toggle('dim', node?.fact ? !visible(node.fact) : false);
    });
    document.querySelectorAll('.edge').forEach(edge => edge.classList.toggle('selected', !!selected && related.has(edge.dataset.from) && related.has(edge.dataset.to)));
  }
  function render() {
    const signedIn = !!token();
    $('accountButton').textContent = signedIn ? 'Sign out' : 'Sign in';
    $('businessLabel').textContent = account.businessName || 'Website context';
    $('syncLabel').textContent = signedIn && currentSession ? 'Account synced' : 'Sign in to connect';
    $('approvedCount').textContent = approved.length; $('pendingCount').textContent = pending.length;
    $('sourceCount').textContent = new Set(facts().map(fact => fact.sourceUrl).filter(Boolean)).size;
    $('emptyState').hidden = facts().length > 0;
    $('emptyText').textContent = signedIn ? 'Scan your website or tell Builder about your business, then review what Rose should know.' : 'Sign in to build a web of your business context.';
    $('emptyAction').textContent = signedIn ? 'Start with your website' : 'Sign in to Workground';
    $('emptyAction').href = signedIn ? '#websiteInput' : './?returnTo=context';
    buildWeb(); renderList();
    const fact = facts().find(item => item.id === selected);
    if (fact) showFact(fact);
    else if (!selected || !nodes.some(node => node.id === selected)) { selected = null; $('detail').replaceChildren(element('p', 'detail-placeholder', 'Select a point in the web, or choose a fact below.')); }
  }
  function scanCandidates(scraped, scanId, website) {
    const rows = []; const detected = scraped.detected || {};
    const add = (label, value) => {
      for (const item of (Array.isArray(value) ? value : [value])) {
        const text = clean(item).trim();
        if (text.length > 2) rows.push(normalise({ id: scanId + '_' + rows.length, label, text,
          source: 'website-scan', sourceUrl: website, scanId }, 'pending'));
      }
    };
    add('Business name', scraped.businessName); add('Description', scraped.description);
    add('Services', detected.services || scraped.services); add('Service areas', scraped.areasServed || detected.areasServed);
    add('Hours', scraped.hours || detected.hours); add('Contact', scraped.contactEmail || detected.contactEmail);
    return rows;
  }
  $('scanForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!token()) { location.href = './?returnTo=context'; return; }
    const website = safeUrl($('websiteInput').value.trim());
    if (!website) { notify('Enter a valid website URL starting with https:// or http://.'); return; }
    const button = $('scanButton'); button.disabled = true; button.textContent = 'Scanning…';
    try {
      if (!currentSession) await loadContext();
      if (!currentSession) return;
      const data = await request('/api/rose-site-scan', { website, sourcePage: location.href });
      if (!data.scraped) throw new Error('No website facts were returned. Try again or add knowledge in Builder.');
      const rows = scanCandidates(data.scraped, clean(data.scanId || Date.now(), 120), website);
      const known = new Set([...approved, ...pending].map(fact => fact.text.trim().toLowerCase() + '|' + fact.sourceUrl));
      const fresh = rows.filter(fact => { const key = fact.text.trim().toLowerCase() + '|' + fact.sourceUrl; if (known.has(key)) return false; known.add(key); return true; });
      pending.push(...fresh);
      lastSiteScan = {website, quality:Number(data.scraped.scanQuality||0),pages:Number(data.scraped.pagesScanned||0),missing:data.scraped.missingQuestions||data.scraped.detected?.missingQuestions||[]};
      $('websiteInput').value = website; saveSnapshot(); selected = null;
      notify(fresh.length ? fresh.length + ' new website suggestions are ready for your review.' : 'No new facts found. You can add details in Builder.');
      render();
    } catch (error) { errorMessage(error); }
    finally { button.disabled = false; button.replaceChildren(document.createTextNode('Scan website ↗')); }
  });
  $('accountButton').addEventListener('click', () => {
    if (!token()) location.href = './?returnTo=context';
    else { clearSession(); notify('Signed out.'); }
  });
  $('refresh').addEventListener('click', loadContext);
  $('search').addEventListener('input', () => { query = $('search').value.trim().toLowerCase(); selected = null; renderList(); updateHighlights(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter; selected = null;
    document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    renderList(); updateHighlights();
  }));
  $('fit').addEventListener('click', () => { selected = null; fitWeb(); updateHighlights(); renderList(); });
  $('zoomIn').addEventListener('click', () => zoomBy(1.2)); $('zoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
  $('graph').addEventListener('pointerdown', event => {
    if (event.target.closest('button,a,.empty')) return;
    pointer = { x: event.clientX, y: event.clientY, panX, panY };
    $('graph').setPointerCapture(event.pointerId); $('graph').classList.add('dragging');
  });
  $('graph').addEventListener('pointermove', event => {
    if (!pointer) return; panX = pointer.panX + event.clientX - pointer.x; panY = pointer.panY + event.clientY - pointer.y; transform();
  });
  const release = () => { pointer = null; $('graph').classList.remove('dragging'); };
  $('graph').addEventListener('pointerup', release); $('graph').addEventListener('pointercancel', release);
  new ResizeObserver(fitWeb).observe($('graph'));
  window.addEventListener('focus', loadContext);
  window.addEventListener('storage', event => { if ([SNAPSHOT_KEY, 'wildroseDashboardToken', 'roseDashboardToken'].includes(event.key)) loadContext(); });
  render(); loadContext();
})();

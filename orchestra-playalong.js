(function (root) {
  'use strict';

  function safeUrl(value, base) {
    const url = new URL(String(value || ''), base);
    const parent = new URL(base);
    if (!value || !['http:', 'https:'].includes(url.protocol) || url.origin !== parent.origin) {
      throw new Error('Pairing audio and pages must use a local HTTP address.');
    }
    if (url.username || url.password) throw new Error('Media addresses cannot contain a login.');
    return url.href;
  }

  async function fetchPairing(fetcher, explicitPath, base) {
    const explicit = explicitPath != null;
    const paths = explicit ? [explicitPath] : ["research/learn/pictures-at-an-exhibition/practice-ready/pairing.json"];
    for (let index = 0; index < paths.length; index++) {
      const url = safeUrl(paths[index], base);
      const response = await fetcher(url, { cache: 'no-store' });
      if (response.status === 404 && !explicit && index + 1 < paths.length) continue;
      if (!response.ok) throw new Error('The saved pairing could not load (HTTP ' + response.status + ').');
      return { raw: await response.json(), url, usedFallback: index > 0 };
    }
    throw new Error('The saved pairing was not found.');
  }

  function methodText(bundle) {
    return typeof bundle.note === 'string' && bundle.note.trim() ? bundle.note : typeof bundle.description === 'string' ? bundle.description : '';
  }

  function modeLinksFor(bundle, base, pageUrl) {
    let entries = bundle.modeLinks;
    if (entries == null) {
      if (!/\/baba-yaga(?:-blind)?\//.test(new URL(base, pageUrl).pathname)) return {};
      const root = new URL('.', pageUrl);
      entries = {
        working: {label:'Working timing',bundle:new URL('research/learn/baba-yaga-blind/player/video-comparison.json',root).href},
        trial: {label:'Rhythm-only trial (experimental)',bundle:new URL('research/learn/baba-yaga-blind/player/pairing.json',root).href}
      };
    }
    if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Timing method links are invalid.');
    const result = {};
    if (Object.keys(entries).length > 24) throw new Error('Too many movement links.');
    for (const key of Object.keys(entries)) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(key)) throw new Error('A timing method key is invalid.');
      const entry = entries[key];
      if (entry == null) continue;
      if (!entry || typeof entry !== 'object' || typeof entry.label !== 'string') throw new Error('A timing method link is invalid.');
      const target = safeUrl(entry.bundle, base), href = new URL(pageUrl);
      href.search = ''; href.hash = ''; href.searchParams.set('bundle', target);
      result[key] = {label:entry.label.slice(0,80),href:href.href,current:new URL(base,pageUrl).href===target};
    }
    return result;
  }

  function paintModeLinks(nav, modes, create) {
    const links = Object.entries(modes).map(([key, mode]) => {
      const link = create('a');
      link.id = key+'-mode'; link.textContent = mode.label; link.href = mode.href;
      link.setAttribute('aria-current', mode.current ? 'page' : 'false');
      return link;
    });
    nav.replaceChildren(...links);
  }

  const catalogRegistry = root.OrchestraCatalogData ||
    (typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./orchestra-catalog.js') : []);

  function musicCatalog(bundle, base, pageUrl, registry = catalogRegistry) {
    if (!Array.isArray(registry) || registry.length > 40) throw new Error('Music catalog is invalid.');
    const current = new URL(base, pageUrl).href, playerRoot = new URL('.', pageUrl);
    const ids = new Set();
    function link(entry) {
      if (!entry || typeof entry.label !== 'string' || !entry.label.trim()) throw new Error('A catalog view has no label.');
      const target = safeUrl(entry.bundle, playerRoot.href), href = new URL(pageUrl);
      href.search = ''; href.hash = ''; href.searchParams.set('bundle', target);
      return {label:entry.label.slice(0,160), href:href.href, current:target === current};
    }
    const works = registry.map(work => {
      if (!work || !/^[a-z][a-z0-9-]{0,63}$/.test(work.id || '') || ids.has(work.id) ||
          typeof work.title !== 'string' || !work.title.trim() || typeof work.composer !== 'string' ||
          !Array.isArray(work.movements) || work.movements.length > 128 ||
          !Array.isArray(work.versions) || work.versions.length > 32) throw new Error('A catalog piece is invalid.');
      ids.add(work.id);
      const primary = link(work.primary), versions = work.versions.map(link);
      const movementIds = new Set();
      const movements = work.movements.map(movement => {
        if (!movement) throw new Error('A catalog movement is invalid.');
        const time = movement.firstBarTime == null ? movement.time : movement.firstBarTime;
        if (!movement || typeof movement.id !== 'string' || movementIds.has(movement.id) ||
            typeof movement.label !== 'string' || !Number.isFinite(time) || time < 0 ||
            !['bar-following','navigation-only'].includes(movement.status)) throw new Error('A catalog movement is invalid.');
        movementIds.add(movement.id);
        const href = new URL(primary.href); href.searchParams.set('at', String(time));
        return {id:movement.id,label:movement.label.slice(0,160),status:movement.status,time,href:href.href};
      });
      return {id:work.id,title:work.title.slice(0,160),composer:work.composer.slice(0,160),
              durationLabel:String(work.durationLabel || ''),part:String(work.part || ''),
              summary:String(work.summary || '').slice(0,500),primary,movements,versions,
              current:primary.current || versions.some(view => view.current)};
    });
    const modes = modeLinksFor(bundle, base, pageUrl);
    const known = new Set(works.flatMap(work => [work.primary, ...work.versions].map(view => new URL(view.href).searchParams.get('bundle'))));
    const related = works.find(work => {
      const family = new URL(new URL(work.primary.href).searchParams.get('bundle')).pathname.split('/research/learn/')[1]?.split('/')[0];
      return family && new URL(current).pathname.includes('/research/learn/'+family+'/');
    });
    if (!known.has(current)) {
      const own = link({label:'Current view',bundle:current});
      if (related) {
        related.current = true; related.versions.push(own);
      } else {
        works.push({id:'current-piece',title:String(bundle.title || 'Imported piece'),composer:'Your music',
          part:'',durationLabel:Math.round(bundle.duration/60)+' min',summary:'Your currently opened pairing.',
          primary:own,movements:[],versions:Object.values(modes),current:true});
      }
    }
    return works;
  }

  function catalogChoices(catalog, query) {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const needle = normalize(query).trim();
    return catalog.filter(work => !needle || normalize([work.title,work.composer,work.part,work.summary,
      ...work.movements.map(row => row.label+' '+row.status),...work.versions.map(row => row.label)].join(' ')).includes(needle));
  }

  function paintMusicCatalog(host, catalog, query, create, onChoose) {
    const works = catalogChoices(catalog, query);
    const elements = works.map(work => {
      const card = create('article'); card.className = 'catalog-work'+(work.current ? ' current' : '');
      function text(tag, value, className) {
        const element = create(tag); element.textContent = value; if (className) element.className = className;
        return element;
      }
      card.append(text('p',work.composer,'catalog-composer'),text('h3',work.title),
        text('p',[work.durationLabel,work.part].filter(Boolean).join(' · '),'catalog-meta'),
        text('p',work.summary,'catalog-summary'));
      const action = create('div'); action.className = 'catalog-action';
      const open = text('button',work.primary.current ? 'Continue practicing' : 'Open piece','primary');
      open.type = 'button'; open.setAttribute('aria-label','Open '+work.title);
      if (work.primary.current) open.setAttribute('aria-current','page');
      open.addEventListener('click',() => onChoose(work.primary.href)); action.append(open);
      if (work.current) action.append(text('span','Currently open','catalog-current'));
      card.append(action);
      if (work.movements.length) {
        const search = String(query || '').trim().toLowerCase();
        const matched = search ? work.movements.filter(movement =>
          (movement.label+' '+movement.status).toLowerCase().includes(search)) : [];
        const shown = matched.length ? matched : work.movements;
        const details = create('details'); details.append(text('summary','Movements · '+
          (shown.length === work.movements.length ? shown.length : shown.length+' of '+work.movements.length)));
        details.open = matched.length > 0;
        const list = create('div'); list.className = 'catalog-movements';
        for (const movement of shown) {
          const anchor = create('a'); anchor.className = 'catalog-movement'; anchor.href = movement.href;
          anchor.append(text('span',movement.label),text('span',movement.status === 'bar-following' ? 'Bar following' : 'Movement jump',
            'catalog-badge'+(movement.status === 'navigation-only' ? ' unfinished' : '')));
          anchor.addEventListener('click',event => { event.preventDefault(); onChoose(movement.href); });
          list.append(anchor);
        }
        details.append(list); card.append(details);
      }
      if (work.versions.length) {
        const details = create('details'); details.append(text('summary','Other views'));
        const list = create('div'); list.className = 'catalog-versions';
        for (const version of work.versions) {
          const anchor = text('a',version.label,'catalog-version'); anchor.href = version.href;
          if (version.current) anchor.setAttribute('aria-current','page');
          anchor.addEventListener('click',event => { event.preventDefault(); onChoose(version.href); }); list.append(anchor);
        }
        details.append(list); card.append(details);
      }
      return card;
    });
    if (!elements.length) {
      const empty = create('p'); empty.className = 'catalog-empty'; empty.textContent = 'No music found. Try another piece, composer, or movement.';
      empty.setAttribute('role','status'); elements.push(empty);
    }
    host.replaceChildren(...elements);
  }

  function createTransport(audio, onChange, onError) {
    let desired = false;
    let request = 0;
    let loop = null;
    return {
      async play() {
        if (desired) return;
        desired = true;
        const token = ++request;
        onChange(true);
        try {
          await audio.play();
          if (!desired) audio.pause();
        } catch (error) {
          if (token !== request) return;
          desired = false;
          onChange(false);
          if (!error || error.name !== 'AbortError') onError(error);
        }
      },
      pause() {
        desired = false;
        ++request;
        audio.pause();
        onChange(false);
      },
      toggle() { if (desired) this.pause(); else this.play(); },
      setLoop(start, end) {
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('This section has no usable loop end.');
        loop = { start, end };
      },
      clearLoop() { loop = null; },
      tick() {
        if (loop && desired && !audio.paused && (audio.currentTime >= loop.end || audio.currentTime < loop.start - .05)) {
          audio.currentTime = loop.start;
        }
      },
      ended() {
        if (loop && desired) {
          audio.currentTime = loop.start;
          desired = false;
          this.play();
        } else this.pause();
      },
      wantsPlay() { return desired; }
    };
  }

  function restoreEdits(bundle, edits, validate, retime) {
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return bundle;
    const candidate = { ...bundle, markers: bundle.markers.map(marker => {
      const edit = Object.prototype.hasOwnProperty.call(edits, marker.id) ? edits[marker.id] : null;
      if (!edit || typeof edit !== 'object' || !Number.isFinite(edit.time)) return { ...marker };
      return { ...marker, time: edit.time, checked: edit.checked === true, basis: edit.basis || marker.basis };
    }) };
    const result = validate(candidate.markers, candidate.duration);
    if (result && result.ok === false) throw new Error(result.error || 'Saved timing is invalid.');
    const timingChanged = candidate.markers.some((marker, index) => marker.time !== bundle.markers[index].time);
    if (timingChanged && typeof retime === 'function') return retime(bundle, candidate.markers);
    return withoutStaleSpans(candidate, timingChanged);
  }

  function withoutStaleSpans(bundle, timingChanged) {
    const hasSpans = Array.isArray(bundle.spans) && bundle.spans.length > 0;
    const hasRests = Array.isArray(bundle.rests) && bundle.rests.length > 0;
    const hasRhythm = bundle.rhythm && Array.isArray(bundle.rhythm.bars) && bundle.rhythm.bars.length > 0;
    if (!timingChanged || !hasSpans && !hasRests && !hasRhythm) return bundle;
    return { ...bundle, spans: [], rests: [], rhythm: null, lineFollowingDisabled: bundle.lineFollowingDisabled || hasSpans, restFollowingDisabled: bundle.restFollowingDisabled || hasRests, rhythmFollowingDisabled: bundle.rhythmFollowingDisabled || Boolean(hasRhythm) };
  }

  function restLabel(rests, time, rhythmPosition) {
    if (!Array.isArray(rests) || !Number.isFinite(time)) return '';
    const rest = rests.find(item => item && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && Number.isInteger(item.printedBarCount) && item.printedBarCount > 0 && time >= item.start && time < item.end);
    if (!rest) return '';
    const barCount = rhythmPosition && Number.isInteger(rhythmPosition.bar) && Number.isInteger(rest.startBar) && Number.isInteger(rest.endBarExclusive) && rhythmPosition.bar >= rest.startBar && rhythmPosition.bar < rest.endBarExclusive ? rest.endBarExclusive - rhythmPosition.bar : null;
    const remaining = Math.max(1, Math.min(rest.printedBarCount, barCount === null ? Math.ceil((rest.end - time) / (rest.end - rest.start) * rest.printedBarCount) : barCount));
    return 'Rest · about ' + remaining + ' of ' + rest.printedBarCount + ' bars left';
  }

  function timingEditNotice(bundle) {
    const disabled = [];
    if (bundle.rhythmFollowingDisabled) disabled.push('beat following');
    if (bundle.lineFollowingDisabled) disabled.push('line following');
    if (bundle.restFollowingDisabled) disabled.push('rest counts');
    if (!disabled.length) return '';
    const label = disabled.length === 1 ? disabled[0] : disabled.slice(0, -1).join(', ') + ' and ' + disabled.at(-1);
    return label[0].toUpperCase() + label.slice(1) + (disabled.length === 1 && disabled[0] !== 'rest counts' ? ' is' : ' are') + ' disabled until the pairing is rebuilt.';
  }

  function rhythmDisplay(position) {
    if (!position || !Number.isInteger(position.bar) || position.bar < 1 || !Number.isInteger(position.beat) || !Number.isInteger(position.beatsPerBar) || position.beat < 1 || position.beat > position.beatsPerBar || !Number.isFinite(position.progress) || position.progress < 0 || position.progress > 1) return null;
    const meter = /^\d{1,2}\/\d{1,2}$/.test(String(position.meter || '')) ? position.meter : position.beatsPerBar + '/8';
    return { label: 'Bar ' + position.bar + ' · ' + meter, subdivision: 'eighth ' + position.beat + '/' + position.beatsPerBar, pulse: .25 + .75 * Math.max(0, 1 - position.progress * 5) };
  }

  function paintPulseReadout(elements, position, paused) {
    const value = position || {status:'unavailable',bar:null,beat:null,beatsPerBar:null,meter:null};
    elements.host.dataset.state = value.status;
    elements.bar.textContent = value.bar == null ? '—' : String(value.bar);
    elements.beat.textContent = value.beat == null ? '—' : String(value.beat);
    elements.count.textContent = value.beatsPerBar == null || value.beat == null ? '' : '/'+value.beatsPerBar;
    elements.meter.textContent = value.meter || '';
    elements.status.textContent = value.status === 'hold' ? 'Hold · timing estimated' :
      value.status === 'timing-edited' ? 'Beat guide off after timing edit' :
      value.status === 'estimate' ? 'Approximate timing guide' : 'No beat map yet';
    elements.light.classList.toggle('downbeat',value.beat === 1 && value.status === 'estimate');
    elements.light.style.opacity = String(!paused && value.status === 'estimate' && Number.isFinite(value.phase)
      ? .25+.75*Math.max(0,1-value.phase*5) : .25);
  }

  function barRegionLabel(region) {
    if (!region || !Number.isInteger(region.bar) || !Number.isInteger(region.barStart) || !Number.isInteger(region.barEndExclusive)) return '';
    const count = region.barEndExclusive - region.barStart;
    if (count > 1) return 'Rest · about ' + Math.max(1, Math.min(count, region.barEndExclusive - region.bar)) + ' of ' + count + ' bars left';
    return 'Bar ' + region.bar;
  }

  function regionAt(bundle, time, marker, barLookup) {
    const bar = typeof barLookup === 'function' ? barLookup(bundle, time) : null;
    if (bar && bar.rect && Number.isInteger(bar.page)) return bar;
    const rest = (bundle.rests || []).find(item => time >= item.start && time < item.end && item.rect && Number.isInteger(item.page));
    if (rest) return rest;
    const span = (bundle.spans || []).find(item => time >= item.start && time < item.end && item.rect && Number.isInteger(item.page));
    return span || marker;
  }

  function badgePosition(marker) {
    const rect = marker.markerRect || marker.rect;
    if (!rect || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key]) && rect[key] >= 0 && rect[key] <= 1) || rect.x + rect.w > 1.000001 || rect.y + rect.h > 1.000001) throw new Error('A rehearsal badge has an invalid printed position.');
    return marker.markerRect ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } : { x: rect.x, y: rect.y };
  }

  function scoreClickTargets(bundle, page) {
    const result = [], seen = new Set();
    const markers = bundle.markers || [];
    function add(row, time, label) {
      if (row.page !== page || !row.rect || !Number.isFinite(time)) return;
      const rect = row.rect;
      if (!['x','y','w','h'].every(key => Number.isFinite(rect[key]) && rect[key] >= 0 && rect[key] <= 1) ||
          rect.w <= 0 || rect.h <= 0 || rect.x+rect.w > 1.000001 || rect.y+rect.h > 1.000001) return;
      const identity = JSON.stringify(rect);
      if (seen.has(identity)) return;
      seen.add(identity);
      let markerIndex = 0;
      markers.forEach((marker, index) => { if (marker.time <= time + .000001) markerIndex = index; });
      result.push({rect:{...rect}, time, label:String(label || 'Score location'), markerIndex});
    }
    const regions = (bundle.barRegions || []).filter(region => region.page === page);
    if (regions.length) {
      for (const region of regions) {
        const bar = bundle.rhythm && bundle.rhythm.bars.find(row => row.bar === region.barStart);
        const marker = markers.find(row => row.page === page && row.rect &&
          JSON.stringify(row.rect) === JSON.stringify(region.rect));
        const span = (bundle.spans || []).find(row => row.page === page && row.rect &&
          JSON.stringify(row.rect) === JSON.stringify(region.rect));
        const time = bar ? bar.time : marker ? marker.time : span ? span.start : NaN;
        add(region, time, region.label || marker && marker.label || 'Bar ' + region.barStart);
      }
    } else {
      markers.forEach(marker => add(marker, marker.time, marker.label));
    }
    return result;
  }

  function paintScoreTargets(figure, targets, create, seek) {
    for (const target of targets) {
      const button = create('button');
      button.className = 'score-hit-target'; button.type = 'button';
      button.setAttribute('aria-label', 'Jump to ' + target.label);
      button.title = 'Jump to ' + target.label;
      button.style.left = target.rect.x * 100 + '%'; button.style.top = target.rect.y * 100 + '%';
      button.style.width = target.rect.w * 100 + '%'; button.style.height = target.rect.h * 100 + '%';
      button.addEventListener('click', () => seek(target));
      figure.append(button);
    }
  }

  function practiceSections(bundle) {
    if (bundle.practiceSections == null) return [];
    if (!Array.isArray(bundle.practiceSections) || bundle.practiceSections.length > 64) throw new Error('Movement navigation is invalid.');
    let last = -1;
    return bundle.practiceSections.map(section => {
      if (!section || typeof section.label !== 'string' || !Number.isFinite(section.time) ||
          section.time < 0 || section.time >= bundle.duration || section.time <= last ||
          !['bar-following','navigation-only'].includes(section.status)) throw new Error('A movement navigation entry is invalid.');
      last = section.time;
      const result = {label:section.label.slice(0,160),time:section.time,status:section.status};
      if (section.firstBarTime != null) {
        if (!Number.isFinite(section.firstBarTime) || section.firstBarTime < section.time || section.firstBarTime >= bundle.duration)
          throw new Error('The first bar of a movement lies outside its recording.');
        result.seekTime = section.firstBarTime;
      }
      return result;
    });
  }

  function localAsset(value, base) {
    const url = new URL(safeUrl(value, base));
    return url.pathname + url.search;
  }

  const api = { safeUrl, createTransport, restoreEdits, localAsset, withoutStaleSpans, badgePosition, restLabel, timingEditNotice, regionAt, rhythmDisplay, barRegionLabel, fetchPairing, methodText, modeLinksFor, paintModeLinks, scoreClickTargets, paintScoreTargets, practiceSections, musicCatalog, catalogChoices, paintMusicCatalog, paintPulseReadout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OrchestraPlayer = api;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const timing = root.OrchestraTiming;
  const audio = $('audio');
  const pulseElements = {host:$('pulse-guide'),bar:$('pulse-bar'),beat:$('pulse-beat'),count:$('pulse-count'),
    meter:$('pulse-meter'),status:$('pulse-status'),light:$('pulse-light')};
  const state = { bundle: null, original: null, selected: 0, active: -2, activeSpan: null, key: '', edits: Object.create(null), loop: false, base: location.href, raf: 0, loadToken: 0 };
  const transport = createTransport(audio, playing => {
    $('play').textContent = playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-label', playing ? 'Pause recording' : 'Play recording');
  }, error => setStatus('Playback could not start. ' + (error && error.message ? error.message : 'Try Play again.'), true));

  function setStatus(message, error) {
    $('status').textContent = message;
    $('status').className = 'status' + (error ? ' error' : '');
  }

  function validate(markers, duration) {
    const result = timing.validateMarkers(markers, duration);
    if (result === false || (Array.isArray(result) && result.length)) throw new Error(Array.isArray(result) ? result.join(' ') : 'The landmark times are not valid.');
    if (result && result.ok === false) throw new Error(result.error || 'The landmark times are not valid.');
    if (result && result.valid === false) throw new Error((result.errors || ['The landmark times are not valid.']).join(' '));
    return result;
  }

  function format(seconds) { return timing.timeFormat(seconds); }

  function currentIndex(time) {
    const result = timing.markerAt(state.bundle.markers, time);
    if (typeof result === 'number') return result;
    if (!result) return -1;
    return state.bundle.markers.findIndex(marker => marker.id === result.id);
  }

  function duration() {
    return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : state.bundle && state.bundle.duration || 0;
  }

  function sectionEnd(index) { return timing.sectionEnd(state.bundle.markers, index, duration()); }

  function updateLoop() {
    if (state.loop && state.bundle) {
      try { transport.setLoop(state.bundle.markers[state.selected].time, sectionEnd(state.selected)); }
      catch (error) { state.loop = false; transport.clearLoop(); setStatus(error.message, true); }
    } else transport.clearLoop();
    $('loop').classList.toggle('loop-active', state.loop);
    $('loop').setAttribute('aria-pressed', String(state.loop));
    $('loop').textContent = state.loop ? 'Looping ' + state.bundle.markers[state.selected].label : 'Loop section';
  }

  function seekTo(time, keepLoop) {
    if (!state.bundle) return;
    if (!Number.isFinite(time)) return;
    if (!keepLoop && state.loop) { state.loop = false; updateLoop(); }
    // Seek just inside the cue so browser time rounding cannot select the previous bar.
    audio.currentTime = Math.min(duration(), Math.max(0, time) + .001);
    updatePosition(true);
  }

  function editSelection() {
    const marker = state.bundle.markers[state.selected];
    $('editor').hidden = false;
    $('edit-label').textContent = 'Adjust ' + marker.label;
    $('edit-time').value = marker.time.toFixed(2);
    $('edit-time').max = String(duration());
    $('edit-checked').checked = marker.checked === true;
    $('edit-basis').textContent = typeof marker.basis === 'string' ? marker.basis : JSON.stringify(marker.basis || 'Approximate section landmark.');
    document.querySelectorAll('.landmark').forEach((node, index) => node.classList.toggle('selected', index === state.selected));
  }

  function select(index, shouldSeek) {
    state.selected = index;
    editSelection();
    updateLoop();
    if (shouldSeek) seekTo(state.bundle.markers[index].time, true);
  }

  function buildLandmarks() {
    $('landmarks').replaceChildren();
    state.bundle.markers.forEach((marker, index) => {
      const button = document.createElement('button');
      button.className = 'landmark';
      const name = document.createElement('span'); name.textContent = marker.label;
      const time = document.createElement('span'); time.className = 'marker-time'; time.textContent = format(marker.time);
      const check = document.createElement('span'); check.className = 'marker-check'; check.textContent = marker.checked ? 'Checked landmark' : 'Approximate · needs playing check';
      button.append(name, time, check);
      button.addEventListener('click', () => select(index, true));
      $('landmarks').append(button);
    });
  }

  function buildPages() {
    $('pages').replaceChildren();
    state.bundle.partPages.forEach((page, index) => {
      const figure = document.createElement('figure');
      figure.className = 'page'; figure.dataset.page = String(index + 1);
      const img = document.createElement('img');
      img.loading = 'lazy'; img.decoding = 'async';
      img.src = safeUrl(page.url, state.base); img.alt = (page.label || 'Violin II part') + ', page ' + (index + 1);
      if (page.width && page.height) { img.width = page.width; img.height = page.height; }
      img.addEventListener('error', () => setStatus('A sheet-music page could not load. Check the pairing’s page files.', true));
      const label = document.createElement('span'); label.className = 'page-label'; label.textContent = 'Original part · page ' + (index + 1);
      const region = document.createElement('div'); region.className = 'region'; region.hidden = true;
      const regionLabel = document.createElement('span'); regionLabel.className = 'region-label'; region.append(regionLabel);
      figure.append(img, label, region);
      paintScoreTargets(figure, scoreClickTargets(state.bundle, index + 1), tag => document.createElement(tag), target => {
        const current = scoreClickTargets(state.bundle, index + 1).find(row => JSON.stringify(row.rect) === JSON.stringify(target.rect));
        if (!current) return;
        select(current.markerIndex, false);
        seekTo(current.time, true);
      });
      $('pages').append(figure);
    });
  }

  function activeRegion(time, marker) {
    return regionAt(state.bundle, time, marker, timing.barRegionAt);
  }

  function updatePulse(time) {
    const pulse = root.OrchestraPulse && state.pulse ? root.OrchestraPulse.readout(state.pulse,time) : null;
    paintPulseReadout(pulseElements,pulse,audio.paused);
  }

  function updatePosition(force) {
    if (!state.bundle) return;
    transport.tick();
    const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    $('elapsed').textContent = format(time); $('seek').value = String(time);
    const index = currentIndex(time);
    const marker = index >= 0 ? state.bundle.markers[index] : null;
    const region = marker ? activeRegion(time, marker) : null;
    const rhythmPosition = state.bundle.rhythm && typeof timing.rhythmAt === 'function' ? timing.rhythmAt(state.bundle.rhythm, time) : null;
    const rhythm = rhythmDisplay(rhythmPosition);
    $('rhythm').hidden = true;
    if (rhythm) {
      if ($('bar-label').textContent !== rhythm.label) $('bar-label').textContent = rhythm.label;
      if ($('eighth-label').textContent !== rhythm.subdivision) $('eighth-label').textContent = rhythm.subdivision;
      $('bar-pulse').style.opacity = String(rhythm.pulse);
    }
    updatePulse(time);
    const specificLabel = barRegionLabel(region);
    let note = restLabel(state.bundle.rests, time, rhythmPosition) || region && (region.note || region.rest || region.entry) || marker && (marker.note || marker.rest || marker.entry) || '';
    if (specificLabel) note = region.barEndExclusive - region.barStart > 1 ? specificLabel : region.note || marker && marker.note || '';
    if ($('current-note').textContent !== note) $('current-note').textContent = note;
    const regionCaption = specificLabel || region && region.label || marker && marker.label || '';
    document.querySelectorAll('.page').forEach(page => {
      if (!region || Number(page.dataset.page) !== region.page) return;
      const label = page.querySelector('.region-label');
      if (label.textContent !== regionCaption) label.textContent = regionCaption;
    });
    const identity = region ? String(region.id || '') + ':' + region.page + ':' + JSON.stringify(region.rect) : '';
    if (!force && index === state.active && identity === state.activeSpan) return;
    state.active = index; state.activeSpan = identity;
    $('current-label').textContent = marker ? marker.label : 'Before the first landmark';
    $('current-review').textContent = marker ? marker.checked ? 'Checked landmark · approximate section following' : 'Approximate section timing · needs playing check' : '';
    document.querySelectorAll('.landmark').forEach((node, position) => {
      node.classList.toggle('active', index === position);
      node.setAttribute('aria-current', index === position ? 'true' : 'false');
    });
    document.querySelectorAll('.page').forEach(page => {
      const highlight = page.querySelector('.region');
      highlight.hidden = !region || Number(page.dataset.page) !== region.page || !region.rect;
      if (highlight.hidden) return;
      const rect = region.rect;
      highlight.style.left = (rect.x * 100) + '%'; highlight.style.top = (rect.y * 100) + '%';
      highlight.style.width = (rect.w * 100) + '%'; highlight.style.height = (rect.h * 100) + '%';
      highlight.classList.toggle('unchecked', region.checked !== true);
      highlight.querySelector('.region-label').textContent = regionCaption;
      if ($('follow').checked) {
        const bounds = highlight.getBoundingClientRect();
        const top = document.querySelector('.transport').getBoundingClientRect().bottom + 30;
        if (bounds.top < top || bounds.bottom > window.innerHeight - 55) {
          window.scrollBy({ top: bounds.top - top - 40, behavior: audio.paused ? 'auto' : 'smooth' });
        }
      }
    });
  }

  function persist() {
    try { localStorage.setItem(state.key, JSON.stringify(state.edits)); return true; }
    catch (_) { $('edit-message').textContent = 'This browser could not save edits. Export the pairing to keep them.'; return false; }
  }

  function saveEdit() {
    const marker = state.bundle.markers[state.selected];
    const enteredTime = Number($('edit-time').value);
    const time = enteredTime === Number(marker.time.toFixed(2)) ? marker.time : enteredTime;
    const edits = { ...state.edits, [marker.id]: { time, checked: $('edit-checked').checked, basis: marker.basis } };
    let adjusted;
    try {
      if ($('edit-time').value.trim() === '') throw new Error('Enter a start time.');
      adjusted = restoreEdits(state.original, edits, validate, timing.retimeBundle);
      validate(adjusted.markers, duration());
    }
    catch (error) { $('edit-message').textContent = error.message; return; }
    state.bundle = adjusted; state.edits = edits;
    state.pulse = root.OrchestraPulse ? root.OrchestraPulse.prepare(state.bundle,location.href) : null;
    const saved = persist();
    buildLandmarks(); editSelection(); updateLoop(); updatePosition(true);
    const notice = timingEditNotice(state.bundle);
    const lineMessage = notice ? ' ' + notice : '';
    const guidesRetimed = !lineMessage && typeof timing.retimeBundle === 'function' && state.bundle.markers.some((item, index) => item.time !== state.original.markers[index].time);
    if (saved) $('edit-message').textContent = guidesRetimed ? 'Saved. Beat, line and rest guides follow your adjusted cue. Export a copy to keep it.' : 'Saved in this browser. Export a copy to keep your adjustments.' + lineMessage;
    if (lineMessage) setStatus('Your adjusted rehearsal landmarks are active.' + lineMessage);
    else if (guidesRetimed) setStatus('Beat, line and rest guides follow your adjusted cues. Their timing is still approximate.');
  }

  function exportBundle() {
    const out = { ...state.bundle, audioUrl: localAsset(state.bundle.audioUrl, state.base), partPages: state.bundle.partPages.map(page => ({ ...page, url: localAsset(page.url, state.base) })), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'orchestra-pairing.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadBundle(raw, base) {
    if (!timing) throw new Error('The player’s timing file could not load.');
    transport.pause(); transport.clearLoop(); state.loop = false;
    const resolved = {...raw,
      audioUrl: new URL(safeUrl(raw.audioUrl, base)).pathname,
      partPages: raw.partPages.map(page => ({...page, url:new URL(safeUrl(page.url, base)).pathname}))};
    const bundle = timing.normalizeBundle(resolved);
    validate(bundle.markers, bundle.duration);
    const movements = practiceSections(bundle);
    safeUrl(bundle.audioUrl, base); bundle.partPages.forEach(page => safeUrl(page.url, base));
    state.catalog = musicCatalog(bundle, base, location.href);
    state.original = JSON.parse(JSON.stringify(bundle)); state.bundle = bundle; state.base = base;
    state.key = 'cadenza.orchestra-pairing.' + JSON.stringify([bundle.id || bundle.title, bundle.audioUrl, bundle.partPages.map(page => page.url), bundle.markers.map(marker => [marker.id, marker.time])]);
    state.edits = Object.create(null);
    let message = methodText(bundle) ? 'Ready. Press Play or choose a landmark.' : 'Ready. Section highlights are approximate; listen and check the landmarks as you play.';
    try {
      const edits = JSON.parse(localStorage.getItem(state.key) || '{}');
      state.bundle = restoreEdits(bundle, edits, validate, timing.retimeBundle); state.edits = edits;
      if (Object.keys(edits).length) message = 'Loaded your saved timing adjustments. Export a copy to keep them.';
    } catch (_) { message = 'Ready. A saved edit did not match this pairing, so the original timing is loaded.'; }
    if (!state.edits || typeof state.edits !== 'object' || Array.isArray(state.edits)) state.edits = Object.create(null);
    state.pulse = root.OrchestraPulse ? root.OrchestraPulse.prepare(state.bundle,location.href) : null;
    if (timingEditNotice(state.bundle)) message += ' ' + timingEditNotice(state.bundle);
    state.selected = 0; state.active = -2; state.activeSpan = null;
    $('title').textContent = bundle.title || 'Orchestra Play Along';
    $('description').textContent = bundle.description || 'Your original Violin II pages, with the full orchestra recording.';
    $('method').textContent = methodText(bundle); $('method').hidden = !$('method').textContent;
    $('landmark-help').textContent = Array.isArray(bundle.barRegions) && bundle.barRegions.length ? 'Click any printed bar to jump there. Long rests share one box and seek to their first bar.' : 'Click the printed music to jump there. Unaligned sections have movement navigation only.';
    refreshCatalog();
    $('movement-picker-label').hidden = !movements.length;
    $('movement-picker').replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a movement';
    $('movement-picker').append(placeholder);
    for (const movement of movements) {
      const option = document.createElement('option'); option.value = String(movement.seekTime == null ? movement.time : movement.seekTime);
      option.textContent = movement.label + (movement.status === 'navigation-only' ? ' · navigation only' : ' · bar following');
      $('movement-picker').append(option);
    }
    buildPages(); buildLandmarks(); editSelection(); updateLoop();
    ['play', 'back', 'forward', 'seek', 'speed', 'loop', 'export', 'reset'].forEach(id => { $(id).disabled = false; });
    audio.src = safeUrl(bundle.audioUrl, base); audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true;
    audio.playbackRate = Number($('speed').value); audio.load();
    $('seek').max = String(bundle.duration || 1); $('duration').textContent = format(bundle.duration || 0);
    setStatus(message); updatePosition(true);
  }

  $('play').addEventListener('click', () => transport.toggle());
  $('back').addEventListener('click', () => seekTo(audio.currentTime - 5));
  $('forward').addEventListener('click', () => seekTo(audio.currentTime + 5));
  $('seek').addEventListener('input', () => seekTo(Number($('seek').value)));
  $('speed').addEventListener('change', () => { audio.playbackRate = Number($('speed').value); });
  $('loop').addEventListener('click', () => { state.loop = !state.loop; updateLoop(); if (state.loop) seekTo(state.bundle.markers[state.selected].time, true); });
  $('movement-picker').addEventListener('change', () => {
    if ($('movement-picker').value === '') return;
    seekTo(Number($('movement-picker').value), false);
  });
  function chooseCatalog(href) {
    const next = new URL(safeUrl(href, location.href)), current = new URL(state.base);
    const target = next.searchParams.get('bundle');
    if (target === current.href) {
      $('music-catalog').close();
      const at = next.searchParams.get('at');
      if (at != null) seekTo(Number(at), false);
      return;
    }
    transport.pause(); location.assign(next.href);
  }
  function refreshCatalog() {
    paintMusicCatalog($('catalog-works'),state.catalog || [],$('catalog-search').value,
      tag => document.createElement(tag),chooseCatalog);
  }
  $('open-catalog').addEventListener('click',() => { refreshCatalog(); $('music-catalog').showModal(); $('catalog-search').focus(); });
  $('close-catalog').addEventListener('click',() => $('music-catalog').close());
  $('catalog-search').addEventListener('input',refreshCatalog);
  $('follow').addEventListener('change', () => updatePosition(true));
  $('use-time').addEventListener('click', () => { $('edit-time').value = audio.currentTime.toFixed(2); });
  $('save-time').addEventListener('click', saveEdit);
  $('export').addEventListener('click', exportBundle);
  $('reset').addEventListener('click', () => {
    try { localStorage.removeItem(state.key); } catch (_) {}
    state.edits = Object.create(null); state.bundle = JSON.parse(JSON.stringify(state.original));
    state.pulse = root.OrchestraPulse ? root.OrchestraPulse.prepare(state.bundle,location.href) : null;
    buildLandmarks(); editSelection(); updateLoop(); updatePosition(true); $('edit-message').textContent = 'Your browser edits were reset to the original pairing.';
  });
  $('bundle-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    const token = ++state.loadToken;
    try { const raw = JSON.parse(await file.text()); if (token === state.loadToken) loadBundle(raw, location.href); }
    catch (error) { if (token === state.loadToken) setStatus('Could not open that pairing. ' + error.message, true); }
    event.target.value = '';
  });
  audio.addEventListener('loadedmetadata', () => {
    if (!state.bundle) return;
    try { validate(state.bundle.markers, audio.duration); }
    catch (error) { transport.pause(); $('play').disabled = true; setStatus('The recording is shorter than its pairing. ' + error.message, true); return; }
    $('seek').max = String(duration()); $('duration').textContent = format(duration()); $('edit-time').max = String(duration()); updateLoop(); updatePosition(true);
  });
  audio.addEventListener('timeupdate', () => updatePosition());
  audio.addEventListener('ended', () => { transport.ended(); updatePosition(true); });
  audio.addEventListener('error', () => { transport.pause(); setStatus('The orchestra audio could not load. Open the pairing with its original audio file available.', true); });
  document.addEventListener('keydown', event => {
    if ($('music-catalog').open || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName) || event.target.isContentEditable || !state.bundle) return;
    if (event.code === 'Space') { event.preventDefault(); transport.toggle(); }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); seekTo(audio.currentTime + (event.code === 'ArrowLeft' ? -5 : 5)); }
  });
  function frame() { if (transport.wantsPlay()) updatePosition(); state.raf = requestAnimationFrame(frame); }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(entries => document.documentElement.style.setProperty('--transport-offset',
      (entries[0].target.getBoundingClientRect().height+20)+'px')).observe(document.querySelector('.transport'));
  }
  state.raf = requestAnimationFrame(frame);
  root.addEventListener('pagehide', () => { transport.pause(); cancelAnimationFrame(state.raf); });
  const path = new URLSearchParams(location.search).get('bundle');
  (async function () {
    const token = ++state.loadToken;
    try {
      const pairing = await fetchPairing(fetch, path, location.href);
      if (token === state.loadToken) {
        loadBundle(pairing.raw, pairing.url);
        const at = new URL(location.href).searchParams.get('at');
        if (at != null && at.trim() && Number.isFinite(Number(at)) && Number(at) >= 0 && Number(at) < state.bundle.duration)
          seekTo(Number(at), false);
      }
    } catch (error) { if (token === state.loadToken) setStatus(error.message + ' Use “Open another pairing” to choose a saved JSON file.', true); }
  })();
})(typeof window !== 'undefined' ? window : globalThis);

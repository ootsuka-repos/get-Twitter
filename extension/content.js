(() => {
  const state = {
    collecting: false,
    profile: null,
    options: {
      maxTweets: 10000,
      onlyOwner: true,
      throttleMs: 100000,
      maxScrolls: 2000,
      maxIdleSteps: 30
    },
    tweets: new Map(), // id -> tweet data
    lastAddedAt: 0,
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const getProfileHandle = () => {
    try {
      const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  };

  const normalizeWhitespace = (s) => (s || "").replace(/[\t\u00A0]+/g, " ").replace(/[ ]{2,}/g, " ").trim();

  const parseCompactNumber = (raw) => {
    if (raw == null) return 0;
    const s = String(raw).trim();
    if (!s) return 0;
    console.log('parseCompactNumber input:', JSON.stringify(s)); // Debug: exact input

    // Handle Japanese decimal + unit like "1.8万" directly (no space)
    const jpDecimalNoSpace = s.match(/^([\d.]+)(万|億)$/);
    if (jpDecimalNoSpace) {
      const n = parseFloat(jpDecimalNoSpace[1]);
      const unit = jpDecimalNoSpace[2];
      const result = unit === '万' ? Math.round(n * 10000) : Math.round(n * 100000000);
      console.log(`Parsed Japanese decimal no space: "${s}" -> ${result}`); // Debug
      return result;
    }

    // Remove commas and spaces like "1,234"
    const basic = s.replace(/,/g, "").trim();
    if (/^\d+$/.test(basic)) return parseInt(basic, 10);

    // English suffixes with optional space
    const kmg = basic.match(/^([\d.]+)\s*([KMB])$/i);
    if (kmg) {
      const n = parseFloat(kmg[1]);
      const unit = kmg[2].toUpperCase();
      const result = unit === 'K' ? Math.round(n * 1000) : unit === 'M' ? Math.round(n * 1000000) : Math.round(n * 1000000000);
      console.log(`Parsed English suffix: "${s}" -> ${result}`); // Debug
      return result;
    }

    // Japanese units 万 (1e4), 億 (1e8) with optional space
    const jp = basic.match(/^([\d.]+)\s*(万|億)$/);
    if (jp) {
      const n = parseFloat(jp[1]);
      const unit = jp[2];
      const result = unit === '万' ? Math.round(n * 10000) : Math.round(n * 100000000);
      console.log(`Parsed Japanese unit: "${s}" -> ${result}`); // Debug
      return result;
    }

    // Extract first number (including decimals and comma-separated)
    const numMatch = s.match(/[\d,.]+(?:\.\d+)?/);
    if (numMatch) {
      const numStr = numMatch[0].replace(/,/g, '');
      const num = parseFloat(numStr) || parseInt(numStr, 10) || 0;
      console.log(`Fallback number extraction from "${s}": ${num}`); // Debug
      return Math.round(num);
    }

    console.log('parseCompactNumber: no number found in', JSON.stringify(s)); // Debug
    return 0;
  };

  const readCountFromElem = (root, debugLabel = '') => {
    console.log(`=== readCountFromElem(${debugLabel}) ===`); // Debug header
    
    // Collect all numeric spans first
    const allSpans = root.querySelectorAll('span');
    let numericSpans = [];
    
    for (const span of allSpans) {
      const txt = (span.textContent || '').trim();
      if (!txt) continue;
      
      // Check if it looks like a metric number
      if (/^[\d.,]+\.?\d*(?:[KMB万億])?$/.test(txt)) {
        const num = parseCompactNumber(txt);
        if (!isNaN(num)) {
          numericSpans.push({
            text: txt,
            value: num,
            element: span
          });
          console.log(`Numeric span: "${txt}" -> ${num} (classes: ${span.className.substring(0, 50)}...)`); // Debug
        }
      }
    }
    
    console.log(`Found ${numericSpans.length} numeric spans`); // Debug
    
    // For views: return the largest number (views are typically the highest)
    if (debugLabel.includes('view') && numericSpans.length > 0) {
      const maxView = numericSpans.reduce((max, current) =>
        current.value > max.value ? current : max
      );
      console.log(`✓ VIEWS: Selected largest value ${maxView.value} from "${maxView.text}"`); // Debug success
      return maxView.value;
    }
    
    // For other metrics: try CSS class patterns first (likes, retweets have specific classes)
    const cssSpans = root.querySelectorAll('span[class*="css-"][class*="r-"]');
    for (const span of cssSpans) {
      const txt = (span.textContent || '').trim();
      if (!txt) continue;
      if (/^[\d.,]+\.?\d*(?:[KMB万億])?$/.test(txt)) {
        const num = parseCompactNumber(txt);
        if (!isNaN(num)) {
          console.log(`✓ ${debugLabel} from CSS class: ${num} ("${txt}")`); // Debug
          return num;
        }
      }
    }
    
    // Try aria-label on root or children
    const ariaTargets = [root, ...root.querySelectorAll('[aria-label]')];
    for (const el of ariaTargets) {
      const label = el.getAttribute('aria-label');
      if (!label) continue;
      const num = parseCompactNumber(label);
      if (num || num === 0) {
        console.log(`✓ ${debugLabel} from aria-label: ${num} ("${label}")`); // Debug
        return num;
      }
    }
    
    // Fallback: first numeric span for non-view counts
    if (numericSpans.length > 0 && !debugLabel.includes('view')) {
      const fallback = numericSpans[0];
      console.log(`✓ ${debugLabel} fallback: ${fallback.value} ("${fallback.text}")`); // Debug
      return fallback.value;
    }
    
    console.log(`✗ No ${debugLabel} found in element (${numericSpans.length} numerics)`); // Debug fail
    return 0;
  };

  const getCount = (article, kinds) => {
    console.log(`getCount called for kinds: [${kinds.join(', ')}]`); // Debug
    
    // CRITICAL: Handle views FIRST and SEPARATELY to avoid interference
    if (kinds.includes('view') || kinds.includes('impression') || kinds.includes('impressions')) {
      console.log('=== PRIORITY VIEW SEARCH - Searching entire tweet for largest numeric value ==='); // Debug
      const viewCount = readCountFromElem(article, 'views-priority');
      if (viewCount || viewCount === 0) {
        console.log(`✓ VIEW_COUNT FINAL: ${viewCount}`); // Debug
        return viewCount;
      }
    }
    
    // For other metrics: try data-testid selectors first
    for (const k of kinds) {
      if (k.includes('view')) continue; // Skip view testids, already handled above
      
      const target = article.querySelector(`[data-testid="${k}"]`);
      if (target) {
        console.log(`Found data-testid="${k}" element`); // Debug
        const n = readCountFromElem(target, k);
        if (n || n === 0) {
          console.log(`✓ ${k.toUpperCase()}_COUNT: ${n}`); // Debug
          return n;
        }
      }
    }
    
    // Try to find metrics container (usually under tweet actions area)
    const metricsContainer = article.querySelector('[data-testid="reply"], [data-testid="retweet"], [data-testid="like"]')?.parentElement?.parentElement;
    if (metricsContainer) {
      console.log(`Found metrics container, searching within`); // Debug
      const containerCount = readCountFromElem(metricsContainer, `${kinds[0]}-container`);
      if (containerCount || containerCount === 0) {
        console.log(`✓ ${kinds[0].toUpperCase()}_COUNT from container: ${containerCount}`); // Debug
        return containerCount;
      }
    }
    
    // Fallback: scan aria-labels with hints
    const hints = [
      { keys: ['いいね', 'Likes', 'like'], type: 'like' },
      { keys: ['リポスト', 'Repost', 'Retweet', 'repost'], type: 'rt' },
      { keys: ['返信', 'Replies', 'Reply'], type: 'reply' },
      { keys: ['ブックマーク', 'Bookmarks', 'Bookmark'], type: 'bm' }
    ];
    
    const allAria = article.querySelectorAll('[aria-label]');
    for (const el of allAria) {
      const label = el.getAttribute('aria-label') || '';
      for (const h of hints) {
        if (kinds.includes(h.type) && h.keys.some(key =>
          label.toLowerCase().includes(key.toLowerCase()))) {
          const n = parseCompactNumber(label);
          if (!isNaN(n)) {
            console.log(`✓ ${h.type.toUpperCase()}_COUNT from aria hint: ${n}`); // Debug
            return n;
          }
        }
      }
    }
    
    // Final fallback: first numeric span in article (excluding views case)
    if (!kinds.includes('view')) {
      const fallback = readCountFromElem(article, `${kinds[0]}-fallback`);
      if (fallback || fallback === 0) {
        console.log(`✓ ${kinds[0].toUpperCase()}_COUNT fallback: ${fallback}`); // Debug
        return fallback;
      }
    }
    
    console.log(`✗ No count found for kinds: [${kinds.join(', ')}]`); // Debug
    return 0;
  };

  const detectTweetType = (article) => {
    const ctx = article.querySelector('[data-testid="socialContext"]');
    const t = (ctx && ctx.textContent) ? ctx.textContent.toLowerCase() : '';
    if (t.includes('retweeted') || t.includes('reposted') || t.includes('リポスト')) return 'repost';
    if (t.includes('pinned') || t.includes('固定表示')) return 'pinned';
    if (t.includes('replying to') || t.includes('返信先') || t.includes('replied')) return 'reply';
    return 'tweet';
  };

  const parseArticle = (article) => {
    try {
      const link = article.querySelector('a[href*="/status/"]');
      if (!link) return null;
      const href = link.getAttribute('href');
      if (!href) return null;
      const url = href.startsWith('http') ? href : `https://x.com${href}`;
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('status');
      if (idx < 1 || idx + 1 >= parts.length) return null;
      const author = parts[idx - 1];
      const tweetId = parts[idx + 1];

      const textNodes = article.querySelectorAll('div[data-testid="tweetText"]');
      const text = normalizeWhitespace(Array.from(textNodes).map(n => n.innerText).join('\n'));

      const timeEl = article.querySelector('time');
      const createdAt = timeEl?.getAttribute('datetime') || '';

      const likes = getCount(article, ['like', 'unlike', 'like', 'Likes', 'like']);
      const retweets = getCount(article, ['retweet', 'unretweet', 'repost', 'unrepost', 'rt']);
      const replies = getCount(article, ['reply']);
      const views = getCount(article, ['view', 'impression', 'viewCount', 'impressions']);
      const bookmarks = getCount(article, ['bm']);

      const hasPhoto = !!article.querySelector('img[src*="twimg.com/media"], div[data-testid="tweetPhoto"] img');
      const hasVideo = !!article.querySelector('video, div[data-testid="videoPlayer"]');

      return {
        tweet_id: tweetId,
        url,
        author_handle: author,
        created_at: createdAt,
        text,
        like_count: likes || 0,
        retweet_count: retweets || 0,
        reply_count: replies || 0,
        view_count: views || 0,
        bookmark_count: bookmarks || 0,
        has_photo: hasPhoto ? 1 : 0,
        has_video: hasVideo ? 1 : 0,
        tweet_type: detectTweetType(article)
      };
    } catch (e) {
      return null;
    }
  };

  const collectVisibleTweets = (onlyOwner) => {
    const articles = document.querySelectorAll('article[data-testid="tweet"], article[role="article"]');
    let added = 0;
    const prof = state.profile || getProfileHandle() || '';
    for (const a of articles) {
      const t = parseArticle(a);
      if (!t) continue;
      if (onlyOwner && t.author_handle && prof && t.author_handle.toLowerCase() !== prof.toLowerCase()) {
        continue;
      }
      if (!t.tweet_id) continue;
      if (!state.tweets.has(t.tweet_id)) {
        state.tweets.set(t.tweet_id, t);
        added++;
      } else {
        // update in case newer counts found
        const prev = state.tweets.get(t.tweet_id);
        state.tweets.set(t.tweet_id, { ...prev, ...t });
      }
    }
    if (added) state.lastAddedAt = Date.now();
    return added;
  };

  const scrollStep = async () => {
    const before = state.tweets.size;
    collectVisibleTweets(state.options.onlyOwner);
    if (state.tweets.size >= state.options.maxTweets) return 'done';
    window.scrollBy({ top: Math.floor(window.innerHeight * 0.9), behavior: 'instant' });
    await sleep(state.options.throttleMs);
    collectVisibleTweets(state.options.onlyOwner);
    return state.tweets.size > before ? 'progress' : 'idle';
  };

  const runScrape = async () => {
    state.profile = getProfileHandle();
    let idle = 0;
    for (let i = 0; i < state.options.maxScrolls; i++) {
      if (!state.collecting) break;
      const r = await scrollStep();
      if (r === 'done') break;
      if (r === 'idle') idle++; else idle = 0;
      if (idle >= state.options.maxIdleSteps) break;
    }
    state.collecting = false;
  };

  const toCSV = (rows) => {
    const headers = [
      'tweet_id','url','author_handle','created_at','tweet_type','like_count','retweet_count','reply_count','view_count','bookmark_count','has_photo','has_video','text'
    ];
    const esc = (v) => {
      let s = v == null ? '' : String(v);
      // Normalize embedded newlines to literal \n to keep one row per tweet
      s = s.replace(/\r\n|\r|\n/g, '\\n');
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      const line = [
        r.tweet_id, r.url, r.author_handle, r.created_at, r.tweet_type,
        r.like_count, r.retweet_count, r.reply_count, r.view_count, r.bookmark_count,
        r.has_photo, r.has_video,
        r.text
      ].map(esc).join(',');
      lines.push(line);
    }
    // Prepend BOM for Excel compatibility and use CRLF line endings
    return '\ufeff' + lines.join('\r\n');
  };

  const triggerDownload = (filename, text) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      switch (msg?.type) {
        case 'X_SCRAPER_START': {
          if (state.collecting) return sendResponse({ ok: true, collecting: true, note: 'already running' });
          state.options.maxTweets = Math.max(1, Math.min(50000, Number(msg.maxTweets) || 10000));
          state.options.onlyOwner = !!msg.onlyOwner;
          state.options.throttleMs = Math.max(250, Math.min(3000, Number(msg.throttleMs) || 100000));
          state.collecting = true;
          state.profile = getProfileHandle();
          runScrape();
          return sendResponse({ ok: true, collecting: true, profile: state.profile });
        }
        case 'X_SCRAPER_STOP': {
          state.collecting = false;
          return sendResponse({ ok: true, collecting: false });
        }
        case 'X_SCRAPER_STATUS': {
          return sendResponse({
            ok: true,
            collecting: state.collecting,
            count: state.tweets.size,
            profile: state.profile || getProfileHandle(),
            lastAddedAt: state.lastAddedAt
          });
        }
        case 'X_SCRAPER_CLEAR': {
          state.tweets.clear();
          state.collecting = false;
          return sendResponse({ ok: true, count: 0 });
        }
        case 'X_SCRAPER_EXPORT': {
          const rows = Array.from(state.tweets.values());
          rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
          const csv = toCSV(rows);
          const prof = state.profile || getProfileHandle() || 'profile';
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          triggerDownload(`x-${prof}-tweets-${stamp}.csv`, csv);
          return sendResponse({ ok: true, count: rows.length });
        }
        default:
          return sendResponse({ ok: false, error: 'unknown message' });
      }
    })();
    return true; // async
  });

  // Light passive init
  state.profile = getProfileHandle();
})();

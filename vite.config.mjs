import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { spawn } from 'child_process';

function normalizeExchangeEwsUrl(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (/\.asmx/i.test(u)) return u;
  const parsed = new URL(u);
  return `${parsed.origin}/EWS/Exchange.asmx`;
}

function buildCandidateEwsUrls(rawUrl) {
  const primary = normalizeExchangeEwsUrl(rawUrl);
  const candidates = [primary];

  // Si c'est un serveur OVH (ou si l'utilisateur teste Exchange OVH), on teste automatiquement les clusters OVH
  if (/ovh\./i.test(primary)) {
    const ovhClusters = [
      'ex.mail.ovh.net',
      'ex2.mail.ovh.net',
      'ex3.mail.ovh.net',
      'ex4.mail.ovh.net',
      'ex5.mail.ovh.net',
      'mail.ovh.net',
      'pro1.mail.ovh.net',
      'pro2.mail.ovh.net',
      'pro3.mail.ovh.net'
    ];
    for (const host of ovhClusters) {
      const url = `https://${host}/EWS/Exchange.asmx`;
      if (!candidates.includes(url)) {
        candidates.push(url);
      }
    }
  }
  return candidates;
}

function escapeXmlStr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Exécute une requête HTTP avec support complet NTLM + Basic + Digest + Redirections (--location-trusted)
 * via le binaire système curl (Windows SSPI / Linux libcurl), avec fallback sur fetch.
 */
function executeAuthRequest({ url, method = 'POST', username, password, contentType, extraHeaders = [], body = '' }) {
  return new Promise((resolve) => {
    const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const args = [
      '-s', '-S', '-i', '-L', '--location-trusted',
      '--max-time', '8',
      '--anyauth',
      '-u', `${username}:${password}`,
      '-X', method,
      '-H', `Content-Type: ${contentType}`,
      '-H', 'User-Agent: Kanbinou-ExchangeSSL/2.0',
      '-H', 'Expect:',
      ...extraHeaders.flatMap(h => ['-H', h]),
      '-w', '\n__KANBINOU_META__:%{http_code}|%{url_effective}',
      '--data-binary', '@-',
      url
    ];

    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(curlBin, args, { windowsHide: true });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

    child.on('error', async () => {
      if (settled) return;
      settled = true;
      // Fallback sur fetch natif si curl n'est pas disponible
      try {
        const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        const headers = {
          'Authorization': authHeader,
          'Content-Type': contentType,
          'User-Agent': 'Kanbinou-ExchangeSSL/2.0'
        };
        for (const h of extraHeaders) {
          const idx = h.indexOf(':');
          if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        }
        const resp = await fetch(url, { method, headers, body, redirect: 'follow' });
        const text = await resp.text();
        resolve({
          status: resp.status,
          effectiveUrl: resp.url || url,
          body: text,
          wwwAuth: resp.headers.get('www-authenticate') || '',
          curlError: ''
        });
      } catch (err) {
        resolve({ status: 0, effectiveUrl: url, body: '', wwwAuth: '', curlError: err.message });
      }
    });

    child.on('close', () => {
      if (settled) return;
      settled = true;

      const metaMarker = '\n__KANBINOU_META__:';
      const metaIdx = stdout.lastIndexOf(metaMarker);
      let status = 0;
      let effectiveUrl = url;
      let rawOutput = stdout;

      if (metaIdx !== -1) {
        const metaPart = stdout.slice(metaIdx + metaMarker.length).trim();
        rawOutput = stdout.slice(0, metaIdx);
        const [codeStr, effUrl] = metaPart.split('|');
        status = parseInt(codeStr, 10) || 0;
        if (effUrl) effectiveUrl = effUrl.trim();
      }

      const authMatches = [...rawOutput.matchAll(/^WWW-Authenticate:\s*(.+)$/gim)].map(m => m[1].trim());
      const wwwAuth = [...new Set(authMatches)].join(', ');

      // Extraire le corps XML s'il est présent après les en-têtes HTTP
      const xmlStart = rawOutput.search(/<\?xml|<(?:\w+:)?Envelope|<(?:\w+:)?multistatus/i);
      const responseBody = xmlStart !== -1 ? rawOutput.slice(xmlStart) : rawOutput;

      resolve({
        status,
        effectiveUrl,
        body: responseBody,
        wwwAuth,
        curlError: stderr.trim()
      });
    });

    if (body) {
      child.stdin.write(body, 'utf8');
    }
    child.stdin.end();
  });
}

function caldavDevMiddleware() {
  return {
    name: 'kanbinou-caldav-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || (!req.url.endsWith('/api/calendar/test') && !req.url.endsWith('/api/calendar/push'))) {
          return next();
        }

        let rawBody = '';
        req.on('data', chunk => { rawBody += chunk; });
        req.on('end', async () => {
          const sendJson = (status, data) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          };

          try {
            const body = JSON.parse(rawBody || '{}');
            const protocol = String(body.protocol || 'caldav').toLowerCase().trim();

            if (req.url.endsWith('/api/calendar/test')) {
              let rawUrl = String(body.url || '').trim();
              const username = String(body.username || '').trim();
              const password = String(body.password || '');

              if (!rawUrl || !username || !password) {
                return sendJson(400, { error: 'Veuillez renseigner l\'adresse du serveur, l\'identifiant et le mot de passe.' });
              }

              if (protocol === 'ssl' || /Exchange\.asmx|\/owa|mail\.ovh\./i.test(rawUrl)) {
                const candidateUrls = buildCandidateEwsUrls(rawUrl);
                const soapGetFolder = '<?xml version="1.0" encoding="utf-8"?>' +
                  '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
                  'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" ' +
                  'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" ' +
                  'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                  '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>' +
                  '<soap:Body><m:GetFolder>' +
                  '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>' +
                  '<m:FolderIds><t:DistinguishedFolderId Id="calendar" /></m:FolderIds>' +
                  '</m:GetFolder></soap:Body></soap:Envelope>';

                const soapFindCalendars = '<?xml version="1.0" encoding="utf-8"?>' +
                  '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
                  'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" ' +
                  'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" ' +
                  'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                  '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>' +
                  '<soap:Body><m:FindFolder Traversal="Deep">' +
                  '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>' +
                  '<m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot" /></m:ParentFolderIds>' +
                  '</m:FindFolder></soap:Body></soap:Envelope>';

                const debugAttempts = [];

                for (const candidateUrl of candidateUrls) {
                  const result = await executeAuthRequest({
                    url: candidateUrl,
                    method: 'POST',
                    username,
                    password,
                    contentType: 'text/xml; charset=utf-8',
                    body: soapGetFolder
                  });

                  const hostLabel = new URL(candidateUrl).hostname;
                  const soapErrMatch = result.body.match(/<(?:\w+:)?MessageText[^>]*>([\s\S]*?)<\/(?:\w+:)?MessageText>/i);
                  const soapErrText = soapErrMatch ? soapErrMatch[1].trim() : '';

                  debugAttempts.push({
                    server: hostLabel,
                    url: candidateUrl,
                    effectiveUrl: result.effectiveUrl,
                    httpStatus: result.status,
                    wwwAuthenticate: result.wwwAuth || 'none',
                    soapError: soapErrText || undefined,
                    networkError: result.curlError || undefined
                  });

                  if (result.status >= 200 && result.status < 300 && !/ResponseClass="Error"/i.test(result.body)) {
                    const winningUrl = result.effectiveUrl || candidateUrl;
                    const calendars = [];
                    const seenIds = new Set();

                    const addCalFolder = (id, displayName) => {
                      if (!id || seenIds.has(id)) return;
                      seenIds.add(id);
                      calendars.push({
                        id,
                        name: `${displayName} (${hostLabel})`,
                        url: winningUrl
                      });
                    };

                    // 1. Extraire le calendrier principal issu de GetFolder
                    const mainIdMatch = result.body.match(/<(?:\w+:)?FolderId[^>]*\bId="([^"]+)"/i);
                    const mainDnMatch = result.body.match(/<(?:\w+:)?DisplayName[^>]*>([\s\S]*?)<\/(?:\w+:)?DisplayName>/i);
                    const mainName = (mainDnMatch && mainDnMatch[1]) ? mainDnMatch[1].replace(/<[^>]+>/g, '').trim() : 'Calendrier principal';
                    addCalFolder(mainIdMatch ? mainIdMatch[1] : 'calendar', mainName);

                    // 2. Rechercher tous les autres calendriers / sous-calendriers du compte via FindFolder Deep
                    const findRes = await executeAuthRequest({
                      url: winningUrl,
                      method: 'POST',
                      username,
                      password,
                      contentType: 'text/xml; charset=utf-8',
                      body: soapFindCalendars
                    });

                    if (findRes.status >= 200 && findRes.status < 300) {
                      const calFolderRegex = /<(?:\w+:)?CalendarFolder\b[^>]*>([\s\S]*?)<\/(?:\w+:)?CalendarFolder>/gi;
                      let cfMatch;
                      while ((cfMatch = calFolderRegex.exec(findRes.body)) !== null) {
                        const block = cfMatch[1];
                        const idM = block.match(/<(?:\w+:)?FolderId[^>]*\bId="([^"]+)"/i);
                        const dnM = block.match(/<(?:\w+:)?DisplayName[^>]*>([\s\S]*?)<\/(?:\w+:)?DisplayName>/i);
                        if (idM && dnM) {
                          const dName = dnM[1].replace(/<[^>]+>/g, '').trim();
                          if (dName) addCalFolder(idM[1], dName);
                        }
                      }
                    }

                    const firstCal = calendars[0] || { id: 'calendar', name: `Calendrier (${hostLabel})`, url: winningUrl };

                    return sendJson(200, {
                      success: true,
                      protocol: 'ssl',
                      calendarName: firstCal.name,
                      calendarUrl: winningUrl,
                      folderId: firstCal.id,
                      calendars,
                      debug: debugAttempts
                    });
                  }
                }

                const primaryAttempt = debugAttempts[0] || {};
                const testedList = debugAttempts.map(d => `${d.server} (HTTP ${d.httpStatus})`).join(', ');
                return sendJson(401, {
                  error: `Connexion Exchange refusée après test de : ${testedList}. Vérifiez que cette boîte est bien une boîte Exchange (et non un mail standard MX Plan / Zimbra) et que le mot de passe est exact.`,
                  debug: debugAttempts,
                  lastStatus: primaryAttempt.httpStatus || 401
                });
              }

              // Mode CalDAV standard
              if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;
              const calUrl = rawUrl.replace(/\/+$/, '') + '/';

              const propfindXml = '<?xml version="1.0" encoding="utf-8" ?>' +
                '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
                '<d:prop><d:displayname/><d:resourcetype/></d:prop>' +
                '</d:propfind>';

              const result = await executeAuthRequest({
                url: calUrl,
                method: 'PROPFIND',
                username,
                password,
                contentType: 'application/xml; charset=utf-8',
                extraHeaders: ['Depth: 1'],
                body: propfindXml
              });

              const debugInfo = [{
                server: new URL(calUrl).hostname,
                url: calUrl,
                effectiveUrl: result.effectiveUrl,
                httpStatus: result.status,
                wwwAuthenticate: result.wwwAuth || 'none',
                networkError: result.curlError || undefined
              }];

              if (result.status === 401 || result.status === 403) {
                return sendJson(401, {
                  error: `Identifiant ou mot de passe refusé par le serveur CalDAV (Code HTTP ${result.status}).`,
                  debug: debugInfo
                });
              }
              if (result.status < 200 || result.status >= 300) {
                return sendJson(400, {
                  error: `Le serveur n'a pas reconnu cet emplacement CalDAV (Code HTTP ${result.status}).`,
                  debug: debugInfo
                });
              }

              const responseXml = result.body;
              const effectiveUrl = result.effectiveUrl || calUrl;
              const calendars = [];
              const seenUrls = new Set();

              const respRegex = /<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/gi;
              let match;
              while ((match = respRegex.exec(responseXml)) !== null) {
                const respBlock = match[1];
                const isCalendar = /<(?:\w+:)?calendar\b/i.test(respBlock);
                const isInboxOutbox = /<(?:\w+:)?schedule-inbox\b|<(?:\w+:)?schedule-outbox\b/i.test(respBlock);
                if (isCalendar && !isInboxOutbox) {
                  let cName = '';
                  let cUrl = effectiveUrl.replace(/\/+$/, '') + '/';
                  const dnMatch = respBlock.match(/<(?:\w+:)?displayname[^>]*>([\s\S]*?)<\/(?:\w+:)?displayname>/i);
                  if (dnMatch && dnMatch[1]) {
                    cName = dnMatch[1].replace(/<[^>]+>/g, '').trim();
                  }
                  const hrefMatch = respBlock.match(/<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i);
                  if (hrefMatch && hrefMatch[1]) {
                    const href = hrefMatch[1].trim();
                    if (href) {
                      if (/^https?:\/\//i.test(href)) {
                        cUrl = href.replace(/\/+$/, '') + '/';
                      } else {
                        const parsed = new URL(effectiveUrl);
                        cUrl = `${parsed.origin}/${href.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
                      }
                    }
                  }
                  if (cName && !seenUrls.has(cUrl)) {
                    seenUrls.add(cUrl);
                    calendars.push({ id: cUrl, name: cName, url: cUrl });
                  }
                }
              }

              if (calendars.length === 0) {
                let fallbackName = '';
                const dnMatch = responseXml.match(/<(?:\w+:)?displayname[^>]*>([\s\S]*?)<\/(?:\w+:)?displayname>/i);
                if (dnMatch && dnMatch[1]) fallbackName = dnMatch[1].replace(/<[^>]+>/g, '').trim();
                const resolvedUrl = effectiveUrl.replace(/\/+$/, '') + '/';
                if (!fallbackName) {
                  const host = new URL(resolvedUrl).hostname || 'Agenda CalDAV';
                  fallbackName = `${host} (${username})`;
                }
                calendars.push({ id: resolvedUrl, name: fallbackName, url: resolvedUrl });
              }

              const firstCal = calendars[0];

              return sendJson(200, {
                success: true,
                protocol: 'caldav',
                calendarName: firstCal.name,
                calendarUrl: firstCal.url,
                folderId: firstCal.id,
                calendars,
                debug: debugInfo
              });
            }

            if (req.url.endsWith('/api/calendar/push')) {
              const rawUrl = String(body.url || '').trim();
              const username = String(body.username || '').trim();
              const password = String(body.password || '');
              const folderId = String(body.folderId || 'calendar').trim();
              const events = body.events;

              if (!rawUrl || !username || !password || !Array.isArray(events) || events.length === 0) {
                return sendJson(400, { error: 'Paramètres d\'agenda ou événements manquants.' });
              }

              if (protocol === 'ssl' || /Exchange\.asmx|mail\.ovh\./i.test(rawUrl)) {
                const ewsUrl = normalizeExchangeEwsUrl(rawUrl);
                let savedFolderXml = '<t:DistinguishedFolderId Id="calendar" />';
                if (folderId.startsWith('shared:')) {
                  const sharedEmail = folderId.slice(7).trim();
                  if (sharedEmail) {
                    savedFolderXml = `<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>${escapeXmlStr(sharedEmail)}</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>`;
                  }
                } else if (folderId && folderId !== 'calendar') {
                  savedFolderXml = `<t:FolderId Id="${escapeXmlStr(folderId)}" />`;
                }

                let pushed = 0;

                for (const ev of events) {
                  if (!ev?.startIso || !ev?.endIso) continue;
                  const soapCreateItem = '<?xml version="1.0" encoding="utf-8"?>' +
                    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
                    'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" ' +
                    'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" ' +
                    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
                    '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>' +
                    '<soap:Body><m:CreateItem SendMeetingInvitations="SendToNone">' +
                    `<m:SavedItemFolderId>${savedFolderXml}</m:SavedItemFolderId>` +
                    '<m:Items><t:CalendarItem>' +
                    `<t:Subject>${escapeXmlStr(ev.summary || 'Rappel Kanbinou')}</t:Subject>` +
                    `<t:Body BodyType="Text">${escapeXmlStr(ev.description || '')}</t:Body>` +
                    '<t:ReminderIsSet>true</t:ReminderIsSet>' +
                    '<t:ReminderMinutesBeforeStart>15</t:ReminderMinutesBeforeStart>' +
                    `<t:Start>${escapeXmlStr(ev.startIso)}</t:Start>` +
                    `<t:End>${escapeXmlStr(ev.endIso)}</t:End>` +
                    '<t:IsAllDayEvent>false</t:IsAllDayEvent>' +
                    '<t:LegacyFreeBusyStatus>Busy</t:LegacyFreeBusyStatus>' +
                    `<t:Location>${escapeXmlStr(ev.location || '')}</t:Location>` +
                    '</t:CalendarItem></m:Items></m:CreateItem></soap:Body></soap:Envelope>';

                  const postRes = await executeAuthRequest({
                    url: ewsUrl,
                    method: 'POST',
                    username,
                    password,
                    contentType: 'text/xml; charset=utf-8',
                    body: soapCreateItem
                  });

                  if (postRes.status < 200 || postRes.status >= 300 || /ResponseClass="Error"/i.test(postRes.body)) {
                    const soapErrM = postRes.body.match(/<(?:\w+:)?MessageText[^>]*>([\s\S]*?)<\/(?:\w+:)?MessageText>/i);
                    const detail = soapErrM ? ` (${soapErrM[1].trim()})` : '';
                    return sendJson(502, {
                      error: `Échec d'écriture sur Exchange SSL (Code HTTP ${postRes.status})${detail}.`
                    });
                  }
                  pushed++;
                }

                return sendJson(200, { success: true, pushedCount: pushed });
              }

              const calUrl = rawUrl.replace(/\/+$/, '') + '/';
              let pushed = 0;

              for (const ev of events) {
                const uid = String(ev?.uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
                const ics = String(ev?.icsContent || '');
                if (!uid || !ics) continue;

                const targetUrl = `${calUrl}${uid}.ics`;
                const putRes = await executeAuthRequest({
                  url: targetUrl,
                  method: 'PUT',
                  username,
                  password,
                  contentType: 'text/calendar; charset=utf-8',
                  body: ics
                });

                if (putRes.status < 200 || putRes.status >= 300) {
                  return sendJson(502, { error: `Échec d'écriture sur l'agenda (Code HTTP ${putRes.status}).` });
                }
                pushed++;
              }

              return sendJson(200, { success: true, pushedCount: pushed });
            }
          } catch (err) {
            return sendJson(502, { error: `Serveur d'agenda injoignable (${err.message || 'erreur réseau'}).` });
          }
        });
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), caldavDevMiddleware()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});

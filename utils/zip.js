// Initialize Leaflet map
function initMap() {
  if (!map) {
    map = L.map('map').setView([34.0522, -118.2437], 10); // Default to LA
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  }
}

// Display tracks on map
function displayTracksOnMap() {
  if (!map || !zipFileCache) return;

  // Clear existing track layer
  if (trackLayer) {
    map.removeLayer(trackLayer);
  }

  trackLayer = L.layerGroup().addTo(map);
  const allCoords = [];

  (async () => {
    const entries = Object.values(zipFileCache.files);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (entry.dir || (!entry.name.toLowerCase().endsWith('.tcx') && !entry.name.toLowerCase().endsWith('.gpx')) || entry.name.includes('__MACOSX')) continue;

      try {
        const txt = await entry.async('text');
        const doc = new DOMParser().parseFromString(txt, 'application/xml');
        let coords = [];
        if (entry.name.toLowerCase().endsWith('.tcx')) {
          const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
          const trackpoints = Array.from(doc.getElementsByTagNameNS(TCX_NS, 'Trackpoint'));
          trackpoints.forEach(pt => {
            const latNode = pt.getElementsByTagNameNS(TCX_NS, 'LatitudeDegrees')[0];
            const lonNode = pt.getElementsByTagNameNS(TCX_NS, 'LongitudeDegrees')[0];
            if (latNode && lonNode) {
              const lat = parseFloat(latNode.textContent);
              const lon = parseFloat(lonNode.textContent);
              coords.push([lat, lon]);
              allCoords.push([lat, lon]);
            }
          });
        } else if (entry.name.toLowerCase().endsWith('.gpx')) {
          // GPX: <trk><trkseg><trkpt lat="" lon="" ...>
          const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
          trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
              coords.push([lat, lon]);
              allCoords.push([lat, lon]);
            }
          });
        }

        if (coords.length > 0) {
          // Create different colors for different tracks
          const colors = ['red', 'blue', 'green', 'orange', 'purple', 'darkred', 'lightred', 'beige', 'darkblue', 'darkgreen'];
          const color = colors[index % colors.length];

          const polyline = L.polyline(coords, {
            color: color,
            weight: 3,
            opacity: 0.8
          }).addTo(trackLayer);

          polyline.bindPopup(`Track: ${entry.name}<br>Points: ${coords.length}`);
        }
      } catch (error) {
        console.warn(`Error processing ${entry.name} for map display:`, error);
      }
    }
    // Fit map to show all tracks
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [10, 10] });
    }
  })();

  // Fit map to show all tracks
  if (allCoords.length > 0) {
    const bounds = L.latLngBounds(allCoords);
    map.fitBounds(bounds, { padding: [10, 10] });
  }
}


// Helpers
function updateProgress(val) {
  const bar = $('.progress-bar');
  bar.css('width', val + '%').attr('aria-valuenow', val);
  $('#progressContainer')[val > 0 ? 'show' : 'hide']();
}

function getInterval() {
  return parseInt($('#pointInterval').val(), 10);
}
function getFormat() {
  return $('#outputFormat').val();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  $('<a>')
    .attr({ href: url, download: name })
    .appendTo('body')[0]
    .click();
  URL.revokeObjectURL(url);
}


// === TRACK CLEANUP UTILITIES ===

// Earth‐distance (Haversine) in meters
function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad, φ2 = lat2 * toRad;
  const Δφ = (lat2 - lat1) * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const a = Math.sin(Δφ / 2) ** 2
    + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Time difference in seconds
function deltaSeconds(t1, t2) {
  return (new Date(t2) - new Date(t1)) / 1000;
}

// Remove speed spikes above vmax (m/s)
function removeSpikes(points, vmax = 4.91) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], cur = points[i];
    const dt = deltaSeconds(prev.time, cur.time);
    if (dt <= 0) continue;
    const dist = haversineDist(prev.lat, prev.lon, cur.lat, cur.lon);
    if ((dist / dt) <= vmax) out.push(cur);
  }
  return out;
}

// Exponential smoothing (IIR)
function exponentialSmoothing(points, tau = 10) {
  if (!points.length) return [];
  const out = [];
  let S_lat = points[0].lat, S_lon = points[0].lon;
  out.push({ ...points[0] });
  for (let i = 1; i < points.length; i++) {
    const dt = deltaSeconds(points[i - 1].time, points[i].time);
    const α = 1 - Math.exp(-dt / tau);
    S_lat = α * points[i].lat + (1 - α) * S_lat;
    S_lon = α * points[i].lon + (1 - α) * S_lon;
    out.push({ time: points[i].time, lat: S_lat, lon: S_lon });
  }
  return out;
}

// Ramer–Douglas–Peucker simplification
function rdp(points, eps = 5) {
  if (points.length < 3) return points.slice();
  const [x1, y1] = [points[0].lat, points[0].lon];
  const [x2, y2] = [points.at(-1).lat, points.at(-1).lon];
  let maxDist = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = [points[i].lat, points[i].lon];
    const num = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
    const den = Math.hypot(y2 - y1, x2 - x1);
    const d = num / den * 111000;
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points.at(-1)];
}

// Orchestrator: rawPoints=[{time,lat,lon},...]
function cleanTrack(rawPoints, config = {}) {
  const { enableSpike = true, enableSmooth = true, enableSmoothify = true,
    vmax = 4.91, tau = 10, epsilon = 5 } = config;
  let pts = rawPoints.slice();
  if (enableSpike) pts = removeSpikes(pts, vmax);
  if (enableSmooth) pts = exponentialSmoothing(pts, tau);
  if (enableSmoothify) pts = rdp(pts, epsilon);
  return pts;
}

async function cleanFiles() {
  const btn = $('#cleanFilesBtn');
  const progressContainer = $('#progressContainer');
  const progressBar = progressContainer.find('.progress-bar');

  // read live cleaning parameters
  const vmax = parseFloat($('#vmaxInput').val());   // max speed (m/s)
  const tau = parseFloat($('#tauInput').val());    // smoothing time const (s)
  const epsilon = parseFloat($('#epsInput').val());    // RDP tolerance (m)

  // disable UI
  btn.prop('disabled', true);
  progressContainer.show();
  progressBar.css({ width: '0%' }).attr('aria-valuenow', 0);

  if (!zipFileCache) {
    btn.prop('disabled', false);
    progressContainer.hide();
    return;
  }

  const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
  const entries = Object.entries(zipFileCache.files)
    .filter(([path, entry]) =>
      !entry.dir &&
      path.toLowerCase().endsWith('.tcx') &&
      !path.includes('__MACOSX')
    );

  const totalFiles = entries.length;
  let processed = 0;
  const cleanedCount = [];

  for (const [path, entry] of entries) {
    const txt = await entry.async('text');
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    let pts = Array.from(doc.getElementsByTagNameNS(TCX_NS, 'Trackpoint'));

    // 1) remove exact‐time duplicates
    const seen = new Set();
    let removedTimeDupe = 0;
    pts.forEach(pt => {
      const timeNode = pt.getElementsByTagNameNS(TCX_NS, 'Time')[0];
      if (!timeNode) return;
      const key = new Date(timeNode.textContent.trim())
        .toISOString().split('.')[0];
      if (seen.has(key)) {
        pt.parentNode.removeChild(pt);
        removedTimeDupe++;
      } else {
        seen.add(key);
      }
    });


    // Only serialize back and overwrite in ZIP after removing duplicates
    const xmlStr = new XMLSerializer().serializeToString(doc);
    zipFileCache.file(path, xmlStr);

    cleanedCount.push({
      path,
      removedTimeDupe,
      removedClean: 0 // No other cleaning
    });

    // update progress bar
    processed++;
    const pct = Math.round((processed / totalFiles) * 100);
    progressBar.css({ width: pct + '%' }).attr('aria-valuenow', pct);
    console.log(
      `Cleaned ${path}: time-dupes ${removedTimeDupe}`
    );
  }

  // show per-file cleanup summary
  $('#previewContainer').html(
    `<strong>Removals per file:</strong><br>` +
    cleanedCount.map(r =>
      `• ${r.path}: time duplicates ${r.removedTimeDupe}, ` +
      `outliers/jitter ${r.removedClean}`
    ).join('<br>')
  );

  // refresh stats, restore UI
  await renderStats();
  btn.prop('disabled', false);
  progressContainer.hide();
}

async function renderStats() {
  // GPX helpers
  function extractGPXMeta(doc, interval) {
    // GPX: <trk><trkseg><trkpt lat="" lon=""><ele></ele><time></time></trkpt>...</trkseg></trk>
    const trksegs = Array.from(doc.getElementsByTagName('trkseg'));
    let before = 0, after = 0, start = '—', totalD = 0, totalT = 0;
    let laps = trksegs.length;
    let firstTime = null, lastTime = null;
    let prevLat = null, prevLon = null;
    trksegs.forEach(seg => {
      const pts = Array.from(seg.getElementsByTagName('trkpt'));
      before += pts.length;
      after += Math.ceil(pts.length / interval);
      pts.forEach((pt, idx) => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        const timeNode = pt.getElementsByTagName('time')[0];
        if (timeNode) {
          const t = new Date(timeNode.textContent.trim());
          if (!firstTime || t < firstTime) firstTime = t;
          if (!lastTime || t > lastTime) lastTime = t;
        }
        if (prevLat !== null && prevLon !== null) {
          // Use haversineDist from above
          totalD += haversineDist(prevLat, prevLon, lat, lon);
        }
        prevLat = lat;
        prevLon = lon;
      });
    });
    if (firstTime && lastTime) {
      totalT = (lastTime - firstTime) / 1000;
      start = firstTime.toISOString();
    }
    return { laps, start, totalT, totalD, before, after };
  }
  if (!zipFileCache) return;
  const interval = getInterval();
  const rows = [];

  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';

  const useImperial = document.getElementById('unitsSelector').value === 'imperial';

  function xmlParse(txt) {
    return new DOMParser().parseFromString(txt.trim(), 'text/xml');
  }

  function regexExtract(txt, path) {
    console.warn(`Falling back to regex for ${path}`);
    const lapRe = /<Lap\b[^>]*StartTime="([^"]+)"/g;
    const laps = [...txt.matchAll(lapRe)];
    const tRe = /<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/g;
    const dRe = /<DistanceMeters>([\d.]+)<\/DistanceMeters>/g;
    const times = [...txt.matchAll(tRe)].map(m => parseFloat(m[1]));
    const dists = [...txt.matchAll(dRe)].map(m => parseFloat(m[1]));
    const totalT = times.reduce((s, v) => s + v, 0);
    const totalD = dists.reduce((s, v) => s + v, 0);
    const start = laps[0]?.[1] || '—';
    const before = (txt.match(/<Trackpoint\b/g) || []).length;
    const after = Math.ceil(before / interval);

    return { laps: laps.length, start, totalT, totalD, before, after };
  }

  function convertDistance(meters) {
    const km = meters / 1000;
    return useImperial
      ? (km * 0.621371).toFixed(2) + ' mi'
      : km.toFixed(2) + ' km';
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}hr ${minutes}min`;
  }

  for (const path in zipFileCache.files) {
    const entry = zipFileCache.files[path];
    if (entry.dir || path.includes('__MACOSX')) continue;
    if (!/\.tcx$/i.test(path) && !/\.gpx$/i.test(path)) continue;

    const txt = await entry.async('text');
    if (!txt.trim()) {
      console.warn(`Empty file: ${path}`);
      continue;
    }

    const doc = xmlParse(txt);
    const root = doc.documentElement;
    console.log(`Parsed ${path}, root=<${root.nodeName}> ns=${root.namespaceURI}`);

    let meta;
    if (/\.tcx$/i.test(path)) {
      if (
        root.namespaceURI === HTML_NS ||
        root.nodeName === 'parsererror' ||
        doc.getElementsByTagName('parsererror').length > 0
      ) {
        meta = regexExtract(txt, path);
      } else {
        const laps = [...doc.getElementsByTagNameNS(TCX_NS, 'Lap')];
        const tPts = [...doc.getElementsByTagNameNS(TCX_NS, 'Trackpoint')];
        let totalT = 0, totalD = 0, start = '—';
        laps.forEach((lap, i) => {
          const st = lap.getAttribute('StartTime');
          const t = parseFloat(lap.getElementsByTagNameNS(TCX_NS, 'TotalTimeSeconds')[0]?.textContent || 0);
          const d = parseFloat(lap.getElementsByTagNameNS(TCX_NS, 'DistanceMeters')[0]?.textContent || 0);
          if (i === 0 && st) start = st;
          totalT += t;
          totalD += d;
        });
        meta = {
          laps: laps.length,
          start,
          totalT,
          totalD,
          before: tPts.length,
          after: Math.ceil(tPts.length / interval)
        };
      }
    } else if (/\.gpx$/i.test(path)) {
      // GPX logic
      meta = extractGPXMeta(doc, interval);
    } else {
      continue;
    }

    rows.push({
      path,
      start: meta.start,
      duration: formatDuration(meta.totalT),
      dist: convertDistance(meta.totalD),
      laps: meta.laps,
      before: meta.before,
      after: meta.after
    });
  }

  if (!rows.length) {
    $('#output').text('No valid TCX/GPX files found.');
    return;
  }

  let html = `
    <button id="addAllToMapBtn" class="btn btn-primary btn-sm mb-2">Add All to Map</button>
    <table class="table table-striped">
      <thead>
        <tr>
          <th></th><th>File Name</th><th>Start</th><th>Duration</th>
          <th>Distance</th><th># Laps</th>
          <th># Points Before</th><th># Points After</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.sort((a, b) => new Date(a.start) - new Date(b.start));
  rows.forEach(r => {
    html += `
      <tr>
        <td><input type="checkbox" class="track-checkbox" data-path="${r.path}" /></td>
        <td><input type="text"
                   class="form-control filename-input"
                   data-path="${r.path}"
                   value="${r.path}" /></td>
        <td>${r.start}</td>
        <td>${r.duration}</td>
        <td>${r.dist}</td>
        <td>${r.laps}</td>
        <td>${r.before}</td>
        <td>${r.after}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  $('#output').html(html);
}

function extractLatLon(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const ns = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';

  return Array.from(doc.getElementsByTagNameNS(ns, 'Trackpoint'))
    .map(tp => {
      const latNode = tp.getElementsByTagNameNS(ns, 'LatitudeDegrees')[0];
      const lonNode = tp.getElementsByTagNameNS(ns, 'LongitudeDegrees')[0];
      if (!latNode || !lonNode) return null;
      const lat = parseFloat(latNode.textContent);
      const lon = parseFloat(lonNode.textContent);
      return [lat, lon];
    })
    .filter(pt => pt !== null);
}
function extractLatLon(xmlText, fileType = 'tcx') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (fileType === 'gpx') {
    const pts = Array.from(doc.getElementsByTagName('trkpt'));
    return pts.map(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      return [lat, lon];
    }).filter(pt => pt.every(v => !isNaN(v)));
  } else {
    const ns = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
    return Array.from(doc.getElementsByTagNameNS(ns, 'Trackpoint'))
      .map(tp => {
        const latNode = tp.getElementsByTagNameNS(ns, 'LatitudeDegrees')[0];
        const lonNode = tp.getElementsByTagNameNS(ns, 'LongitudeDegrees')[0];
        if (!latNode || !lonNode) return null;
        const lat = parseFloat(latNode.textContent);
        const lon = parseFloat(lonNode.textContent);
        return [lat, lon];
      })
      .filter(pt => pt !== null);
  }
}

 function exportGPX(doc, interval) {
      const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
      const gpxDoc = document.implementation.createDocument('', 'gpx');
      const gpxRoot = gpxDoc.documentElement;
      gpxRoot.setAttribute('version', '1.1');
      gpxRoot.setAttribute('creator', 'PCT Site');
      gpxRoot.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1');
      const trk = gpxDoc.createElement('trk');
      const trkseg = gpxDoc.createElement('trkseg');
      const laps = Array.from(doc.getElementsByTagNameNS(TCX_NS, 'Lap'));
      laps.forEach(lapEl => {
        const pts = Array.from(lapEl.getElementsByTagNameNS(TCX_NS, 'Trackpoint'));
        pts.forEach((pt, idx) => {
          if (idx % interval !== 0) return;
          const latNode = pt.getElementsByTagNameNS(TCX_NS, 'LatitudeDegrees')[0];
          const lonNode = pt.getElementsByTagNameNS(TCX_NS, 'LongitudeDegrees')[0];
          const eleNode = pt.getElementsByTagNameNS(TCX_NS, 'AltitudeMeters')[0];
          const timeNode = pt.getElementsByTagNameNS(TCX_NS, 'Time')[0];
          if (!latNode || !lonNode || !timeNode) return;
          const trkpt = gpxDoc.createElement('trkpt');
          trkpt.setAttribute('lat', latNode.textContent);
          trkpt.setAttribute('lon', lonNode.textContent);
          if (eleNode) {
            const ele = gpxDoc.createElement('ele');
            ele.textContent = eleNode.textContent;
            trkpt.appendChild(ele);
          }
          const time = gpxDoc.createElement('time');
          time.textContent = timeNode.textContent;
          trkpt.appendChild(time);
          trkseg.appendChild(trkpt);
        });
      });
      trk.appendChild(trkseg);
      gpxRoot.appendChild(trk);
      return new XMLSerializer().serializeToString(gpxDoc);
    }

    function exportTCX(doc, interval) {
      const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
      const laps = Array.from(doc.getElementsByTagNameNS(TCX_NS, 'Lap'));
      laps.forEach(lapEl => {
        const pts = Array.from(lapEl.getElementsByTagNameNS(TCX_NS, 'Trackpoint'));
        const newTrack = doc.createElementNS(TCX_NS, 'Track');
        pts.forEach((pt, idx) => {
          if (idx % interval === 0) {
            newTrack.appendChild(pt.cloneNode(true));
          }
        });
        const oldTrack = lapEl.getElementsByTagNameNS(TCX_NS, 'Track')[0];
        if (oldTrack) {
          lapEl.replaceChild(newTrack, oldTrack);
        } else {
          lapEl.appendChild(newTrack);
        }
      });
      return new XMLSerializer().serializeToString(doc);
    }

// DOCUMENT READY //
  let map = null;
  let trackLayer = null;
    let zipFileCache = null;
  const originalTCX = {};

$(document).ready(function () {
  // --- Removals summary toggle ---
  const showRemovalsBtn = document.getElementById('showRemovalsBtn');
  const previewDiv = document.getElementById('previewContainer');
  if (showRemovalsBtn && previewDiv) {
    showRemovalsBtn.addEventListener('click', () => {
      if (previewDiv.style.display === 'none' || previewDiv.style.display === '') {
        previewDiv.style.display = 'block';
        showRemovalsBtn.textContent = 'Hide Removals Per File';
      } else {
        previewDiv.style.display = 'none';
        showRemovalsBtn.textContent = 'Show Removals Per File';
      }
    });
  }

  // --- Map selection checkboxes and add-all button ---
  $('#output').on('change', '.track-checkbox', async function () {
    compareLayer.clearLayers();
    const checked = $('.track-checkbox:checked');
    let allBounds = null;
    for (let i = 0; i < checked.length; i++) {
      const path = $(checked[i]).data('path');
      const rawXml = originalTCX[path];
      const rawPts = extractLatLon(rawXml);
      const interval = getInterval();
      const filteredPts = rawPts.filter((_, idx) => idx % interval === 0);
      const rawLine = L.polyline(rawPts, { color: 'blue', weight: 3 });
      const filteredLine = L.polyline(filteredPts, { color: 'orange', weight: 3 });
      rawLine.addTo(compareLayer);
      filteredLine.addTo(compareLayer);
      if (!allBounds && rawPts.length) {
        allBounds = L.latLngBounds(rawPts);
      } else if (rawPts.length) {
        allBounds.extend(L.latLngBounds(rawPts));
      }
    }
    if (allBounds && map) {
      map.fitBounds(allBounds.pad(0.1));
    }
  });
  $('#output').on('change', '.track-checkbox', async function () {
    compareLayer.clearLayers();
    const checked = $('.track-checkbox:checked');
    let allBounds = null;
    for (let i = 0; i < checked.length; i++) {
      const path = $(checked[i]).data('path');
      const rawXml = originalTCX[path];
      const fileType = path.toLowerCase().endsWith('.gpx') ? 'gpx' : 'tcx';
      const rawPts = extractLatLon(rawXml, fileType);
      const interval = getInterval();
      const filteredPts = rawPts.filter((_, idx) => idx % interval === 0);
      const rawLine = L.polyline(rawPts, { color: 'blue', weight: 3 });
      const filteredLine = L.polyline(filteredPts, { color: 'orange', weight: 3 });
      rawLine.addTo(compareLayer);
      filteredLine.addTo(compareLayer);
      if (!allBounds && rawPts.length) {
        allBounds = L.latLngBounds(rawPts);
      } else if (rawPts.length) {
        allBounds.extend(L.latLngBounds(rawPts));
      }
    }
    if (allBounds && map) {
      map.fitBounds(allBounds.pad(0.1));
    }
  });

  $('#output').on('click', '#addAllToMapBtn', async function () {
    $('.track-checkbox').prop('checked', true).trigger('change');
  });
  
  // Export trimmed files as ZIP
  $('#exportTrimmedBtn').on('click', async function () {
    if (!zipFileCache) return;
    const interval = getInterval();
    const format = $('#outputFormat').val(); // selector: 'tcx' or 'gpx'
    const zip = new JSZip();
    const entries = Object.values(zipFileCache.files)
      .filter(e => (e.name.endsWith('.tcx') || e.name.endsWith('.gpx')) && !e.dir && !e.name.includes('__MACOSX'));

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const txt = await e.async('text');
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
      if (e.name.endsWith('.tcx')) {
        if (format === 'gpx') {
          zip.file(e.name.replace(/\.tcx$/i, '_trimmed.gpx'), exportGPX(doc, interval));
        } else {
          zip.file(e.name.replace(/\.tcx$/i, '_trimmed.tcx'), exportTCX(doc, interval));
        }
      } else if (e.name.endsWith('.gpx')) {
        // For GPX files, just trim points by interval and re-export as GPX
        zip.file(e.name.replace(/\.gpx$/i, '_trimmed.gpx'), trimGPX(doc, interval));
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, format === 'gpx' ? 'trimmed_files_gpx.zip' : 'trimmed_files.zip');

    // Helper for GPX trimming
    function trimGPX(doc, interval) {
      // GPX: <gpx><trk><trkseg><trkpt/></trkseg></trk></gpx>
      const gpxDoc = document.implementation.createDocument('', 'gpx');
      const gpxRoot = gpxDoc.documentElement;
      // Copy attributes from original root
      const origRoot = doc.documentElement;
      for (let i = 0; i < origRoot.attributes.length; i++) {
        const attr = origRoot.attributes[i];
        gpxRoot.setAttribute(attr.name, attr.value);
      }
      const trks = Array.from(doc.getElementsByTagName('trk'));
      trks.forEach(trk => {
        const newTrk = gpxDoc.createElement('trk');
        // Copy trk name, etc.
        Array.from(trk.childNodes).forEach(child => {
          if (child.nodeType === 1 && child.nodeName !== 'trkseg') {
            newTrk.appendChild(gpxDoc.importNode(child, true));
          }
        });
        const trksegs = Array.from(trk.getElementsByTagName('trkseg'));
        trksegs.forEach(seg => {
          const newSeg = gpxDoc.createElement('trkseg');
          const pts = Array.from(seg.getElementsByTagName('trkpt'));
          pts.forEach((pt, idx) => {
            if (idx % interval === 0) {
              newSeg.appendChild(gpxDoc.importNode(pt, true));
            }
          });
          newTrk.appendChild(newSeg);
        });
        gpxRoot.appendChild(newTrk);
      });
      return new XMLSerializer().serializeToString(gpxDoc);
    }

    // --- Helper functions ---
   
  });
  initMap();

  $('#cleanFilesBtn').on('click', cleanFiles);

  // Auto‐refresh when changing interval
  $('#pointInterval').on('change', () => $('#refreshBtn').click());

  // Trigger re-render on unit change
  document.getElementById('unitsSelector').addEventListener('change', renderStats);

    // create a layer group for comparison polylines
  const compareLayer = L.layerGroup().addTo(map);

  // Load ZIP and initial render
  $('#zipInput').on('change', async function () {
    const f = this.files[0];
    if (!f || !f.name.endsWith('.zip')) {
      $('#output').text('Please select a .zip file.');
      return;
    }
    updateProgress(10);
    zipFileCache = await JSZip.loadAsync(f);
    updateProgress(40);
    await renderStats();
    await cacheOriginalTCX();
    updateProgress(100);
    setTimeout(() => updateProgress(0), 300);
  });

  async function cacheOriginalTCX() {
    for (const path in zipFileCache.files) {
      const entry = zipFileCache.files[path];
      if (entry.dir || !path.toLowerCase().endsWith('.tcx')) continue;
      originalTCX[path] = await entry.async('text');
    }
  }

  // Refresh button
  $('#refreshBtn').on('click', async () => {
    updateProgress(20);
    await renderStats();
    updateProgress(100);
    setTimeout(() => updateProgress(0), 300);
  });

  // Merge Into One Activity
  $('#mergeFilesBtn').on('click', async () => {
    if (!zipFileCache) return;
    const interval = getInterval();
    const fmt = getFormat();
    const laps = [];
    let totalPts = 0;

    $('#previewContainer').empty();
    updateProgress(10);

    const entries = Object.values(zipFileCache.files)
      .filter(e => e.name.endsWith('.tcx') && !e.dir && !e.name.includes('__MACOSX'));

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const txt = await e.async('text');
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      let lapEl = doc.getElementsByTagNameNS(TCX_NS, 'Lap')[0].cloneNode(true);

      // filter its points
      const pts = Array.from(
        lapEl.getElementsByTagNameNS(TCX_NS, 'Trackpoint')
      );
      const newTrack = doc.createElementNS(TCX_NS, 'Track');
      pts.forEach((pt, idx) => {
        if (idx % interval === 0) {
          newTrack.appendChild(pt.cloneNode(true));
          totalPts++;
        }
      });
      // replace old track if present, else append
      const oldTrack = lapEl.getElementsByTagNameNS(TCX_NS, 'Track')[0];
      if (oldTrack) {
        lapEl.replaceChild(newTrack, oldTrack);
      } else {
        lapEl.appendChild(newTrack);
      }
      laps.push(lapEl);

      $('#previewContainer').append(
        `• ${e.name}: ${pts.length} → ${newTrack.childNodes.length} pts<br>`
      );
      updateProgress(Math.round(((i + 1) / entries.length) * 80) + 10);
    }

    // build merged TCX
    const mergedDoc = document.implementation
      .createDocument(TCX_NS, 'TrainingCenterDatabase');
    const acts = mergedDoc.createElementNS(TCX_NS, 'Activities');
    const act = mergedDoc.createElementNS(TCX_NS, 'Activity');
    act.setAttribute('Sport', 'Running');
    laps.forEach(l => act.appendChild(l.cloneNode(true)));
    acts.appendChild(act);
    mergedDoc.documentElement.appendChild(acts);

    const xmlOut = new XMLSerializer().serializeToString(mergedDoc);
    const blob = new Blob([xmlOut], { type: 'application/xml' });
    downloadBlob(blob, `merged_activity.${fmt}`);

    $('#previewContainer').prepend(
      `<strong>Merged ${laps.length} laps, ${totalPts} points total</strong><br>`
    );

    updateProgress(100);
    setTimeout(() => updateProgress(0), 300);
  });

  // click‐handler for any map‐btn
  $('#output').on('click', '.map-btn', async function () {
    const path = $(this).data('path');

    // Get raw XML
    const rawXml = originalTCX[path];
    const rawPts = extractLatLon(rawXml);

    // Remove every nth point (interval from UI)
    const interval = getInterval();
    const filteredPts = rawPts.filter((_, idx) => idx % interval === 0);

    // Draw both lines on the map
    compareLayer.clearLayers();
    const rawLine = L.polyline(rawPts, { color: 'blue', weight: 3 });
    const filteredLine = L.polyline(filteredPts, { color: 'orange', weight: 3 });

    rawLine.addTo(compareLayer);
    filteredLine.addTo(compareLayer);

    // Fit map to show both lines
    const group = L.featureGroup([rawLine, filteredLine]);
    map.fitBounds(group.getBounds().pad(0.1));
  });
  $('#output').on('click', '.map-btn', async function () {
    const path = $(this).data('path');
    const rawXml = originalTCX[path];
    const fileType = path.toLowerCase().endsWith('.gpx') ? 'gpx' : 'tcx';
    const rawPts = extractLatLon(rawXml, fileType);
    const interval = getInterval();
    const filteredPts = rawPts.filter((_, idx) => idx % interval === 0);
    compareLayer.clearLayers();
    const rawLine = L.polyline(rawPts, { color: 'blue', weight: 3 });
    const filteredLine = L.polyline(filteredPts, { color: 'orange', weight: 3 });
    rawLine.addTo(compareLayer);
    filteredLine.addTo(compareLayer);
    const group = L.featureGroup([rawLine, filteredLine]);
    map.fitBounds(group.getBounds().pad(0.1));
  });

});
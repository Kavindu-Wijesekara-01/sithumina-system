import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { BUNDLED_LEAFLET_CSS, BUNDLED_LEAFLET_JS } from "./leaflet-bundle";
import { SRI_LANKA_CITIES } from "../data/sri-lanka-cities";

export interface MapLorryItem {
  id: string;
  plate: string;
  route: string;
  driverName: string;
  driverPhone?: string;
  status: "On trip" | "Empty";
  lat: number;
  lng: number;
  speedKmH: number;
  heading?: number;
  isOnline?: boolean;
  startLocation?: string;
  endLocation?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  travelRoute?: string;
  viaWaypoints?: Array<{ name: string; lat: number; lng: number }>;
  emptyTime?: string;
  returnRoute?: string;
  finalDestination?: string;
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
}

export interface CustomerMapPin {
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  bookingId?: string;
  phone?: string;
  packageDetails?: string;
}

interface SriLankaMapViewerProps {
  lorries: MapLorryItem[];
  selectedPlate?: string | null;
  filter?: "all" | "Empty" | "On trip";
  onSelectLorry?: (plate: string) => void;
  height?: number;
  isMiniMap?: boolean;
  customerPins?: CustomerMapPin[];
}

export const SriLankaMapViewer: React.FC<SriLankaMapViewerProps> = ({
  lorries,
  selectedPlate,
  filter = "all",
  onSelectLorry,
  height = 420,
  isMiniMap = false,
  customerPins = [],
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapLoadTimedOut, setMapLoadTimedOut] = useState(false);
  const [mapErrorMsg, setMapErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 15-second timeout watcher to surface helpful retry UI if WebView initialization stalls
  useEffect(() => {
    if (isMapReady) {
      setMapLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!isMapReady) {
        console.warn("[MAP] Initialization timed out after 15s");
        setMapLoadTimedOut(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [isMapReady, reloadKey]);

  // Show lorries: always include the driver's own lorry (if single vehicle or matching plate), plus online vehicles
  const filteredLorries = useMemo(() => {
    return lorries.filter((l) => {
      if (lorries.length === 1) return true;
      if (l.isOnline) return filter === "all" || l.status === filter;
      if (selectedPlate && l.plate && l.plate === selectedPlate) return true;
      return false;
    });
  }, [lorries, filter, selectedPlate]);

  const generateMapHtml = (fullscreenMode = false) => {
    const lorriesJson = JSON.stringify(filteredLorries);
    const selectedJson = JSON.stringify(selectedPlate || "");
    const customerPinsJson = JSON.stringify(customerPins || []);
    const allSlCitiesJson = JSON.stringify(SRI_LANKA_CITIES);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes" />
  
  <script>
    // 1. Critical: Immediate error & console interceptors at the very top of <head>
    window.onerror = function(msg, url, line, col, err) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MAP_ERROR',
          message: String(msg) + ' at ' + (url || 'inline') + ':' + line + (col ? (':' + col) : '')
        }));
      }
    };

    window.onunhandledrejection = function(e) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MAP_ERROR',
          message: 'Unhandled Promise Rejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown')
        }));
      }
    };

    (function() {
      var origLog = console.log;
      var origWarn = console.warn;
      var origErr = console.error;
      function forward(level, args) {
        try {
          var str = Array.prototype.slice.call(args).map(function(a) {
            return (a && typeof a === 'object') ? JSON.stringify(a) : String(a);
          }).join(' ');
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MAP_LOG',
              level: level,
              message: str
            }));
          }
        } catch(e) {}
      }
      console.log = function() { origLog.apply(console, arguments); forward('log', arguments); };
      console.warn = function() { origWarn.apply(console, arguments); forward('warn', arguments); };
      console.error = function() { origErr.apply(console, arguments); forward('error', arguments); };
    })();
  </script>

  <style>
    ${BUNDLED_LEAFLET_CSS}
  </style>

  <script>
    // 2. Load bundled Leaflet JS offline first
    try {
      ${BUNDLED_LEAFLET_JS}
    } catch(bundleErr) {
      console.warn('Bundled Leaflet failed, falling back to CDN:', bundleErr);
    }
  </script>

  <script>
    // 3. Fallback CDN if bundled Leaflet did not initialize window.L
    if (typeof L === 'undefined') {
      console.log('Loading Leaflet from CDN...');
      var cdnCss = document.createElement('link');
      cdnCss.rel = 'stylesheet';
      cdnCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(cdnCss);

      var cdnScript = document.createElement('script');
      cdnScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      cdnScript.onload = function() {
        console.log('Leaflet loaded from CDN successfully');
        if (typeof initLeafletMap === 'function') {
          initLeafletMap();
        }
      };
      cdnScript.onerror = function(err) {
        console.error('Leaflet CDN load failed:', err);
      };
      document.head.appendChild(cdnScript);
    }
  </script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #EFECE1;
      overflow: hidden;
      touch-action: pan-x pan-y pinch-zoom;
      -webkit-overflow-scrolling: touch;
      position: relative;
    }
    #map {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      min-height: 100%;
      background: #EFECE1;
    }
    
    /* Custom Pin Container */
    .lorry-pin-wrapper {
      position: relative;
      cursor: pointer;
    }

    /* Pulse Radar Ring for On Trip */
    .pin-pulse-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(255, 194, 14, 0.45);
      border: 1.5px solid rgba(255, 194, 14, 0.85);
      animation: pulseAnim 2s infinite ease-out;
      pointer-events: none;
      z-index: 1;
    }
    @keyframes pulseAnim {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.9; }
      100% { transform: translate(-50%, -50%) scale(2.3); opacity: 0; }
    }

    /* Lorry Pin Badge */
    .lorry-badge {
      position: relative;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      font-size: 18px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      transition: transform 0.2s ease;
    }
    .lorry-badge:hover, .lorry-badge.selected {
      transform: scale(1.15);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
    }
    .badge-ontrip {
      background: #1E9E5A;
      color: #FFFFFF;
      border: 2px solid #26231B;
    }
    .badge-empty {
      background: #FFC20E;
      color: #26231B;
      border: 2px solid #26231B;
    }
    .badge-icon {
      font-size: 18px;
      line-height: 1;
    }
    .badge-selected-ring {
      position: absolute;
      inset: -4px;
      border: 2px solid #FFC20E;
      border-radius: 50%;
      pointer-events: none;
    }

    /* Rich Popup Styling */
    .leaflet-popup-content-wrapper {
      background: #26231B !important;
      color: #F6F1DF !important;
      border-radius: 14px !important;
      padding: 6px 8px !important;
      border: 1.5px solid #FFC20E !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5) !important;
      min-width: 230px !important;
      max-width: 300px !important;
    }
    .leaflet-popup-content {
      margin: 6px 8px !important;
      line-height: 1.4 !important;
    }
    .leaflet-popup-tip {
      background: #26231B !important;
    }
    .pop-container {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .pop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 194, 14, 0.35);
      padding-bottom: 5px;
      margin-bottom: 5px;
    }
    .pop-plate-title {
      font-size: 14px;
      font-weight: 900;
      color: #FFC20E;
      letter-spacing: 0.5px;
    }
    .pop-status {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 800;
    }
    .pop-status-ontrip {
      background: #363227;
      color: #FFC20E;
      border: 1px solid #FFC20E;
    }
    .pop-status-empty {
      background: #173B28;
      color: #2FE084;
      border: 1px solid #1E9E5A;
    }
    .pop-driver-row {
      font-size: 11px;
      color: #E7E2D0;
      margin-bottom: 5px;
    }
    .pop-section {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 6px 8px;
      margin-top: 4px;
    }
    .pop-row {
      font-size: 11px;
      margin-bottom: 3px;
      display: flex;
      justify-content: space-between;
      gap: 6px;
    }
    .pop-k {
      color: #B2AB92;
      font-weight: 600;
      flex-shrink: 0;
    }
    .pop-v {
      color: #F6F1DF;
      font-weight: 700;
      text-align: right;
    }
    .pop-v-gold {
      color: #FFC20E;
      font-weight: 800;
      text-align: right;
    }
    .pop-badges-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 5px;
    }
    .pop-badge {
      background: #363227;
      color: #FFE08A;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 6px;
      border: 1px solid rgba(255, 194, 14, 0.35);
    }
    .pop-badge-green {
      background: #173B28;
      color: #4ADE80;
      border: 1px solid #1E9E5A;
    }
    
    /* Control buttons bar */
    .map-controls-row {
      position: absolute;
      bottom: 14px;
      right: 12px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ctrl-btn {
      background: #26231B;
      color: #FFC20E;
      border: 1.5px solid #FFC20E;
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .ctrl-btn:active {
      background: #FFC20E;
      color: #26231B;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  ${
    !isMiniMap
      ? `<div class="map-controls-row">
          <button class="ctrl-btn" onclick="zoomIn()">+</button>
          <button class="ctrl-btn" onclick="zoomOut()">−</button>
          <button class="ctrl-btn" onclick="recenterMap()">Center Map</button>
          <button class="ctrl-btn" onclick="triggerFullScreen()">Full Screen</button>
        </div>`
      : ""
  }

  <script>
    var map = null;
    var baseTileLayer = null;
    var markers = {};
    var activeRouteLayers = {};
    var roadRoutingCache = {};
    var pendingRouteRequests = {};
    var lastFittedTrip = '';
    var userInteracted = false;
    var focusLorryGlobal = null;
    var lorriesData = ${lorriesJson};
    var selectedPlate = ${selectedJson};
    var customerPinsData = ${customerPinsJson};
    var pendingUpdate = null;
    var tilesLoadedOnce = false;
    var consecutiveTileErrors = 0;

    // Smooth marker position animation helper
    function smoothMoveMarker(marker, targetLatLng, durationMs) {
      if (!marker || !targetLatLng) return;
      var cur = marker.getLatLng();
      if (!cur) {
        marker.setLatLng(targetLatLng);
        return;
      }
      var startLat = cur.lat;
      var startLng = cur.lng;
      var endLat = targetLatLng[0];
      var endLng = targetLatLng[1];
      if (Math.abs(startLat - endLat) < 0.000005 && Math.abs(startLng - endLng) < 0.000005) {
        return;
      }
      if (marker._animFrame) {
        cancelAnimationFrame(marker._animFrame);
        marker._animFrame = null;
      }
      var startTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
      var dur = durationMs || 900;
      function animTick(now) {
        var elapsed = (now || ((window.performance && window.performance.now) ? window.performance.now() : Date.now())) - startTime;
        var p = Math.min(1.0, elapsed / dur);
        // Ease-out cubic curve
        var ease = 1 - Math.pow(1 - p, 3);
        var curLat = startLat + (endLat - startLat) * ease;
        var curLng = startLng + (endLng - startLng) * ease;
        marker.setLatLng([curLat, curLng]);
        if (p < 1.0) {
          marker._animFrame = requestAnimationFrame(animTick);
        } else {
          marker.setLatLng([endLat, endLng]);
          marker._animFrame = null;
        }
      }
      marker._animFrame = requestAnimationFrame(animTick);
    }

    function initLeafletMap() {
      if (map) return;
      if (typeof L === 'undefined') {
        setTimeout(initLeafletMap, 50);
        return;
      }
      var mapContainer = document.getElementById('map');
      if (!mapContainer) {
        setTimeout(initLeafletMap, 50);
        return;
      }

      try {
        console.log('init ok');

        // Smooth zoom & inertia physics enabled
        map = L.map('map', {
          center: [7.8731, 80.7718],
          zoom: ${fullscreenMode ? 8 : isMiniMap ? 6.9 : 7.6},
          minZoom: 6.0,
          maxZoom: 19,
          zoomControl: false,
          attributionControl: false,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          wheelDebounceTime: 40,
          wheelPxPerZoomLevel: 60,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          boxZoom: true,
          dragging: true,
          inertia: true,
          inertiaDeceleration: 3000
        });

        // Multi-source tile layer: Google Streets primary + OpenStreetMap fallback + CartoDB fallback
        var googleTileUrl = 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
        baseTileLayer = L.tileLayer(googleTileUrl, {
          maxZoom: 20,
          minZoom: 6,
          subdomains: ['0', '1', '2', '3'],
          keepBuffer: 4,
          updateWhenIdle: false,
          updateWhenZooming: true
        }).addTo(map);

        baseTileLayer.on('load', function() {
          if (!tilesLoadedOnce) {
            tilesLoadedOnce = true;
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tilesLoaded' }));
            }
          }
        });

        baseTileLayer.on('tileerror', function(e) {
          consecutiveTileErrors++;
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'tileError',
              errorCount: consecutiveTileErrors
            }));
          }
          if (!e || !e.tile || !e.coords) return;
          var tileImg = e.tile;
          var z = e.coords.z;
          var x = e.coords.x;
          var y = e.coords.y;
          var step = parseInt(tileImg.getAttribute('data-err-step') || '0', 10);
          if (step === 0) {
            tileImg.setAttribute('data-err-step', '1');
            tileImg.src = 'https://a.tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
          } else if (step === 1) {
            tileImg.setAttribute('data-err-step', '2');
            tileImg.src = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + x + '/' + y + '.png';
          }
        });

        window.map = map;

        // User touch listener properly registered INSIDE initLeafletMap()
        map.on('dragstart zoomstart', function() {
          userInteracted = true;
        });

        invalidateMap();
        setTimeout(invalidateMap, 50);
        setTimeout(invalidateMap, 150);
        setTimeout(invalidateMap, 300);
        setTimeout(invalidateMap, 1000);

        // Apply queued updates if any arrived before map was ready
        if (pendingUpdate) {
          if (pendingUpdate.lorries) lorriesData = pendingUpdate.lorries;
          if (pendingUpdate.selected !== undefined) selectedPlate = pendingUpdate.selected;
          if (pendingUpdate.pins) customerPinsData = pendingUpdate.pins;
          pendingUpdate = null;
        }

        renderLorries(lorriesData, selectedPlate);
        renderCustomerPins(customerPinsData);

        // Notify React Native that Map is ready right after init!
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
        }
      } catch (initErr) {
        console.error('initLeafletMap exception:', initErr);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'MAP_ERROR',
            message: 'initLeafletMap failed: ' + (initErr && initErr.message ? initErr.message : String(initErr))
          }));
        }
      }
    }

    function invalidateMap() {
      if (map) {
        try { map.invalidateSize(true); } catch(e) {}
      }
    }
    window.addEventListener('resize', invalidateMap);
    window.addEventListener('load', invalidateMap);

    function recenterMap() {
      if (!map) return;
      userInteracted = false;
      lastFittedTrip = '';
      if (focusLorryGlobal && focusLorryGlobal.lat && focusLorryGlobal.lng) {
        var startCoord = (focusLorryGlobal.startLat && focusLorryGlobal.startLng) ? [Number(focusLorryGlobal.startLat), Number(focusLorryGlobal.startLng)] : (focusLorryGlobal.startLocation ? resolveCity(focusLorryGlobal.startLocation) : null);
        var destCoord = (focusLorryGlobal.endLat && focusLorryGlobal.endLng) ? [Number(focusLorryGlobal.endLat), Number(focusLorryGlobal.endLng)] : (focusLorryGlobal.endLocation ? resolveCity(focusLorryGlobal.endLocation) : null);
        var framePoints = [[focusLorryGlobal.lat, focusLorryGlobal.lng]];
        if (startCoord) framePoints.push(startCoord);
        if (destCoord) framePoints.push(destCoord);
        if (framePoints.length >= 2) {
          map.fitBounds(framePoints, { padding: [45, 45], maxZoom: 13, animate: true });
        } else {
          map.setView([focusLorryGlobal.lat, focusLorryGlobal.lng], 13);
        }
      } else {
        map.flyTo([7.8731, 80.7718], ${fullscreenMode ? 8 : isMiniMap ? 6.9 : 7.6}, { duration: 1.2 });
      }
    }

    function zoomIn() {
      if (map) map.zoomIn(1);
    }

    function zoomOut() {
      if (map) map.zoomOut(1);
    }

    function triggerFullScreen() {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_FULLSCREEN' }));
      }
    }

    var ALL_SL_CITIES = ${allSlCitiesJson};

    function resolveCity(txt) {
      if (!txt || typeof txt !== 'string') return null;
      var s = txt.trim();
      if (s.length === 0) return null;

      // 1. Direct Sinhala match from complete 206-city database
      for (var i = 0; i < ALL_SL_CITIES.length; i++) {
        var c = ALL_SL_CITIES[i];
        if (c.sinhala && (s === c.sinhala || s.indexOf(c.sinhala) !== -1 || c.sinhala.indexOf(s) !== -1)) {
          return [c.lat, c.lng];
        }
      }

      // 2. Normalized Sinhala match (ළ/ල, ණ/න, ශ/ෂ/ස)
      var sinNorm = s.replace(/ළ/g, 'ල').replace(/ණ/g, 'න').replace(/[ශෂ]/g, 'ස');
      for (var i = 0; i < ALL_SL_CITIES.length; i++) {
        var c = ALL_SL_CITIES[i];
        if (c.sinhala) {
          var cNorm = c.sinhala.replace(/ළ/g, 'ල').replace(/ණ/g, 'න').replace(/[ශෂ]/g, 'ස');
          if (sinNorm === cNorm || sinNorm.indexOf(cNorm) !== -1 || cNorm.indexOf(sinNorm) !== -1) {
            return [c.lat, c.lng];
          }
        }
      }

      // 3. Exact English name match
      var lower = s.toLowerCase();
      for (var i = 0; i < ALL_SL_CITIES.length; i++) {
        var c = ALL_SL_CITIES[i];
        if (c.name.toLowerCase() === lower) {
          return [c.lat, c.lng];
        }
      }

      // 4. Exact alias match
      for (var i = 0; i < ALL_SL_CITIES.length; i++) {
        var c = ALL_SL_CITIES[i];
        if (c.aliases) {
          for (var a = 0; a < c.aliases.length; a++) {
            if (c.aliases[a].toLowerCase() === lower) {
              return [c.lat, c.lng];
            }
          }
        }
      }

      // 5. Cleaned English match
      var stopWords = ['road', 'rd', 'highway', 'expressway', 'street', 'st', 'lane', 'junction', 'junc', 'jn', 'town', 'city', 'hub', 'port', 'harbor', 'harbour', 'fort', 'park', 'station', 'village', 'estate'];
      var clean = lower;
      for (var sw = 0; sw < stopWords.length; sw++) {
        clean = clean.split(stopWords[sw]).join(' ');
      }
      clean = clean.replace(/[^a-z0-9]/g, '');

      if (clean.length >= 3) {
        for (var i = 0; i < ALL_SL_CITIES.length; i++) {
          var c = ALL_SL_CITIES[i];
          var cClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cClean === clean) return [c.lat, c.lng];
          if (c.aliases) {
            for (var a = 0; a < c.aliases.length; a++) {
              if (c.aliases[a].toLowerCase().replace(/[^a-z0-9]/g, '') === clean) {
                return [c.lat, c.lng];
              }
            }
          }
        }
      }

      return null;
    }

    function isValidCoord(c) {
      if (!c || !Array.isArray(c) || c.length < 2) return false;
      var lat = Number(c[0]);
      var lng = Number(c[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 5.0 && lat <= 10.5 && lng >= 79.0 && lng <= 82.5;
    }

    function tokenizeRoute(str) {
      if (!str || typeof str !== 'string') return [];
      var s = str;
      var seps = [',', ';', '-', '/', '→', '->', 'via', 'VIA', 'Via', 'through', 'THROUGH', 'Through', 'to', 'TO', 'To', 'හරහා'];
      for (var si = 0; si < seps.length; si++) {
        s = s.split(seps[si]).join('|');
      }
      var tokens = s.split('|');
      var out = [];
      for (var ti = 0; ti < tokens.length; ti++) {
        var t = tokens[ti].trim();
        if (t.length >= 3) out.push(t);
      }
      return out;
    }

    function notifySelect(plate) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SELECT_LORRY', plate: plate }));
      } else if (window.parent) {
        window.parent.postMessage(JSON.stringify({ type: 'SELECT_LORRY', plate: plate }), '*');
      }
    }

    function createLorryIcon(l, isSelected) {
      var isTrip = l.status === 'On trip';
      var pulseHtml = '<div class="pin-pulse-ring"></div>';
      var ringHtml = isSelected ? '<div class="badge-selected-ring"></div>' : '';
      
      var truckSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#26231B" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

      var html = '<div class="lorry-pin-wrapper">' +
        pulseHtml +
        '<div class="lorry-badge ' + (isTrip ? 'badge-ontrip' : 'badge-empty') + (isSelected ? ' selected' : '') + '">' +
          ringHtml +
          '<span class="badge-icon" style="display:flex;align-items:center;justify-content:center;">' + truckSvg + '</span>' +
        '</div>' +
      '</div>';

      return L.divIcon({
        className: 'custom-div-icon',
        html: html,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
      });
    }

    function buildPopupHtml(l) {
      var tripDetailsHtml = '';
      if (l.status === 'On trip') {
        tripDetailsHtml = '<div class="pop-section">' +
          '<div class="pop-row"><span class="pop-k">Start:</span> <span class="pop-v">' + (l.startLocation || 'Colombo') + '</span></div>' +
          '<div class="pop-row"><span class="pop-k">Destination:</span> <span class="pop-v">' + (l.endLocation || l.route || 'Destination') + '</span></div>' +
          (l.travelRoute ? '<div class="pop-row"><span class="pop-k">Route:</span> <span class="pop-v">' + l.travelRoute + '</span></div>' : '') +
          (l.emptyTime ? '<div class="pop-row"><span class="pop-k">Est. Empty:</span> <span class="pop-v-gold">' + l.emptyTime + '</span></div>' : '') +
          (l.returnRoute ? '<div class="pop-row"><span class="pop-k">Return Route:</span> <span class="pop-v">' + l.returnRoute + '</span></div>' : '') +
          (l.finalDestination ? '<div class="pop-row"><span class="pop-k">Final Stop:</span> <span class="pop-v">' + l.finalDestination + '</span></div>' : '') +
        '</div>';
      } else {
        tripDetailsHtml = '<div class="pop-section">' +
          '<div class="pop-row"><span class="pop-k">Location:</span> <span class="pop-v">' + (l.startLocation || l.route || 'Standby') + '</span></div>' +
          (l.endLocation ? '<div class="pop-row"><span class="pop-k">Bound For:</span> <span class="pop-v">' + l.endLocation + '</span></div>' : '') +
          (l.travelRoute ? '<div class="pop-row"><span class="pop-k">Route:</span> <span class="pop-v">' + l.travelRoute + '</span></div>' : '') +
          '<div class="pop-badges-grid">' +
            '<span class="pop-badge">Space: ' + (l.availableSpace || 'Full Space') + '</span>' +
            '<span class="pop-badge">Capacity: ' + (l.availableCapacityKg || '3,000 Kg') + '</span>' +
            (l.hasFreezer ? '<span class="pop-badge pop-badge-green">Freezer</span>' : '') +
            (l.hasHelper ? '<span class="pop-badge pop-badge-green">Helper</span>' : '') +
          '</div>' +
        '</div>';
      }

      return '<div class="pop-container">' +
        '<div class="pop-header">' +
          '<div class="pop-plate-title">' + l.plate + '</div>' +
          '<span class="pop-status ' + (l.status === 'On trip' ? 'pop-status-ontrip' : 'pop-status-empty') + '">' + (l.status === 'On trip' ? 'Loaded' : 'Empty') + '</span>' +
        '</div>' +
        '<div class="pop-driver-row"><b>' + (l.driverName || 'Driver') + '</b>' + (l.driverPhone ? ' · ' + l.driverPhone : '') + '</div>' +
        tripDetailsHtml +
        (l.speedKmH && l.speedKmH > 0 ? '<div style="font-size:10px;color:#2FE084;font-weight:700;margin-top:4px;">● Moving at ' + l.speedKmH + ' km/h</div>' : '') +
      '</div>';
    }

    function getCorridorWaypoints(from, to) {
      if (!from || !to) return [];
      var lat1 = from[0], lng1 = from[1];
      var lat2 = to[0], lng2 = to[1];

      // 1. Southern Hills <-> Western Province
      var isSouthHills1 = lat1 >= 6.10 && lat1 <= 6.50 && lng1 >= 80.40 && lng1 <= 80.75;
      var isWest1 = lat1 >= 6.50 && lat1 <= 7.25 && lng1 >= 79.75 && lng1 <= 80.15;
      var isSouthHills2 = lat2 >= 6.10 && lat2 <= 6.50 && lng2 >= 80.40 && lng2 <= 80.75;
      var isWest2 = lat2 >= 6.50 && lat2 <= 7.25 && lng2 >= 79.75 && lng2 <= 80.15;

      if (isSouthHills1 && isWest2) {
        return [
          [6.2667, 80.4833],
          [6.0989, 80.4736],
          [6.0400, 80.4100],
          [6.1833, 80.1833],
          [6.2550, 80.1450],
          [6.5233, 80.1147],
          [6.6850, 80.0200],
          [6.7140, 79.9890],
          [6.7130, 79.9074]
        ];
      }
      if (isWest1 && isSouthHills2) {
        return [
          [6.7130, 79.9074],
          [6.7140, 79.9890],
          [6.6850, 80.0200],
          [6.5233, 80.1147],
          [6.2550, 80.1450],
          [6.1833, 80.1833],
          [6.0400, 80.4100],
          [6.0989, 80.4736],
          [6.2667, 80.4833]
        ];
      }

      // 2. South Coast <-> Western Coast
      var isSouthCoast1 = lat1 >= 5.90 && lat1 <= 6.15 && lng1 >= 80.15 && lng1 <= 80.70;
      var isSouthCoast2 = lat2 >= 5.90 && lat2 <= 6.15 && lng2 >= 80.15 && lng2 <= 80.70;

      if (isSouthCoast1 && isWest2) {
        return [
          [6.0535, 80.2210],
          [6.1833, 80.1833],
          [6.2550, 80.1450],
          [6.5233, 80.1147],
          [6.6850, 80.0200],
          [6.7130, 79.9074]
        ];
      }
      if (isWest1 && isSouthCoast2) {
        return [
          [6.7130, 79.9074],
          [6.6850, 80.0200],
          [6.5233, 80.1147],
          [6.2550, 80.1450],
          [6.1833, 80.1833],
          [6.0535, 80.2210]
        ];
      }

      // 3. Central (Kandy) <-> Colombo
      var isKandy1 = lat1 >= 7.20 && lat1 <= 7.35 && lng1 >= 80.55 && lng1 <= 80.75;
      var isColombo2 = lat2 >= 6.85 && lat2 <= 7.10 && lng2 >= 79.80 && lng2 <= 80.00;
      var isColombo1 = lat1 >= 6.85 && lat1 <= 7.10 && lng1 >= 79.80 && lng1 <= 80.00;
      var isKandy2 = lat2 >= 7.20 && lat2 <= 7.35 && lng2 >= 80.55 && lng2 <= 80.75;

      if (isKandy1 && isColombo2) {
        return [
          [7.2562, 80.5218],
          [7.2513, 80.3464],
          [7.2255, 80.1983],
          [7.1439, 80.0964],
          [7.0016, 79.9525]
        ];
      }
      if (isColombo1 && isKandy2) {
        return [
          [7.0016, 79.9525],
          [7.1439, 80.0964],
          [7.2255, 80.1983],
          [7.2513, 80.3464],
          [7.2562, 80.5218]
        ];
      }

      return [];
    }

    function getInitialRoutePoints(fromCoord, toCoord, viaCoords) {
      if (Array.isArray(viaCoords) && viaCoords.length > 0) {
        var pts = [fromCoord];
        for (var vi = 0; vi < viaCoords.length; vi++) {
          pts.push(viaCoords[vi]);
        }
        pts.push(toCoord);
        return pts;
      }
      var waypoints = getCorridorWaypoints(fromCoord, toCoord);
      if (waypoints && waypoints.length > 0) {
        return [fromCoord].concat(waypoints).concat([toCoord]);
      }
      return [fromCoord, toCoord];
    }

    function applyRouteGeometry(latLngs, routeHolder) {
      if (!map || !routeHolder || !Array.isArray(latLngs) || latLngs.length < 2) return;
      if (routeHolder.glowLine && routeHolder.dashLine) {
        routeHolder.glowLine.setLatLngs(latLngs);
        routeHolder.dashLine.setLatLngs(latLngs);
      } else {
        routeHolder.glowLine = L.polyline(latLngs, {
          color: '#FFC20E',
          weight: 6,
          opacity: 0.6,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
        routeHolder.dashLine = L.polyline(latLngs, {
          color: '#26231B',
          weight: 3.5,
          dashArray: '5, 8',
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }
    }

    function fetchRoadRouteForTrip(key, fromCoord, toCoord, viaCoords, routeHolder) {
      if (!fromCoord || !toCoord || !map) return;
      if (roadRoutingCache[key]) {
        applyRouteGeometry(roadRoutingCache[key], routeHolder);
        return;
      }
      if (pendingRouteRequests[key]) return; // In-flight request deduplication
      pendingRouteRequests[key] = true;

      var pts = [fromCoord[1] + ',' + fromCoord[0]];
      if (Array.isArray(viaCoords)) {
        for (var vi = 0; vi < viaCoords.length; vi++) {
          var v = viaCoords[vi];
          if (v && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
            pts.push(v[1] + ',' + v[0]);
          }
        }
      }
      pts.push(toCoord[1] + ',' + toCoord[0]);
      var ptsParam = pts.join(';');
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + ptsParam + '?overview=full&geometries=geojson';
      fetch(osrmUrl)
        .then(function(r) { return r.json(); })
        .then(function(res) {
          delete pendingRouteRequests[key];
          if (res && res.code === 'Ok' && res.routes && res.routes[0] && res.routes[0].geometry) {
            var raw = res.routes[0].geometry.coordinates || [];
            var latLngs = raw.map(function(c) { return [c[1], c[0]]; });
            if (latLngs.length >= 2) {
              roadRoutingCache[key] = latLngs;
              try { sessionStorage.setItem('sr_route_' + key, JSON.stringify(latLngs)); } catch(e) {}
              applyRouteGeometry(latLngs, routeHolder);
            }
          }
        })
        .catch(function(e) {
          delete pendingRouteRequests[key];
        });
    }

    function renderLorries(data, sel) {
      if (!map || !Array.isArray(data)) return;
      var activePlates = {};
      var focusLorry = null;
      var focusDestCoord = null;

      data.forEach(function(l) {
        if (!l.lat || !l.lng) return;
        activePlates[l.plate] = true;
        var isSelected = (l.plate === sel);
        if (isSelected || !focusLorry) {
          focusLorry = l;
        }

        var icon = createLorryIcon(l, isSelected);
        var popupContent = buildPopupHtml(l);

        if (markers[l.plate]) {
          smoothMoveMarker(markers[l.plate], [l.lat, l.lng], 950);
          markers[l.plate].setIcon(icon);
          markers[l.plate].setPopupContent(popupContent);
        } else {
          var marker = L.marker([l.lat, l.lng], { icon: icon }).addTo(map);
          marker.bindPopup(popupContent);
          marker.on('click', function() {
            notifySelect(l.plate);
          });
          markers[l.plate] = marker;
        }

        var startCoord = (l.startLat && l.startLng) ? [Number(l.startLat), Number(l.startLng)] : (l.startLocation ? resolveCity(l.startLocation) : null);
        var destCoord = (l.endLat && l.endLng) ? [Number(l.endLat), Number(l.endLng)] : (l.endLocation ? resolveCity(l.endLocation) : null);

        if (isSelected || l === focusLorry) {
          focusDestCoord = destCoord;
        }

        // Extract via coordinates
        var viaCoords = [];
        if (Array.isArray(l.viaWaypoints) && l.viaWaypoints.length > 0) {
          for (var vIdx = 0; vIdx < l.viaWaypoints.length; vIdx++) {
            var vWp = l.viaWaypoints[vIdx];
            if (vWp && Number.isFinite(vWp.lat) && Number.isFinite(vWp.lng)) {
              viaCoords.push([Number(vWp.lat), Number(vWp.lng)]);
            }
          }
        } else {
          var rawRoute = l.travelRoute || l.returnRoute || '';
          if (rawRoute) {
            var rTokens = tokenizeRoute(rawRoute);
            for (var rk = 0; rk < rTokens.length; rk++) {
              var rt = rTokens[rk];
              var rc = resolveCity(rt);
              if (rc && isValidCoord(rc)) {
                if (startCoord && Math.abs(startCoord[0] - rc[0]) < 0.02 && Math.abs(startCoord[1] - rc[1]) < 0.02) continue;
                if (destCoord && Math.abs(destCoord[0] - rc[0]) < 0.02 && Math.abs(destCoord[1] - rc[1]) < 0.02) continue;
                viaCoords.push(rc);
              }
            }
          }
        }

        var sKey = startCoord ? (startCoord[0].toFixed(3) + ',' + startCoord[1].toFixed(3)) : (l.startLocation || 'start');
        var dKey = destCoord ? (destCoord[0].toFixed(3) + ',' + destCoord[1].toFixed(3)) : (l.endLocation || 'end');
        var viaKey = viaCoords.map(function(c) { return c[0].toFixed(3) + ',' + c[1].toFixed(3); }).join('|');
        var tripKey = l.plate + '_' + sKey + '->[' + viaKey + ']->' + dKey;

        var existingRoute = activeRouteLayers[l.plate];

        if (existingRoute && existingRoute.tripKey === tripKey) {
          // Trip unchanged: Keep existing road polyline intact.
        } else {
          // New or modified trip: Remove previous route layers for this vehicle
          if (existingRoute) {
            if (existingRoute.sMarker) try { map.removeLayer(existingRoute.sMarker); } catch(e) {}
            if (existingRoute.dMarker) try { map.removeLayer(existingRoute.dMarker); } catch(e) {}
            if (Array.isArray(existingRoute.vMarkers)) {
              for (var vm = 0; vm < existingRoute.vMarkers.length; vm++) {
                try { map.removeLayer(existingRoute.vMarkers[vm]); } catch(e) {}
              }
            }
            if (existingRoute.glowLine) try { map.removeLayer(existingRoute.glowLine); } catch(e) {}
            if (existingRoute.dashLine) try { map.removeLayer(existingRoute.dashLine); } catch(e) {}
            delete activeRouteLayers[l.plate];
          }

          var sMarker = null;
          var dMarker = null;
          var vMarkers = [];
          var glowLine = null;
          var dashLine = null;

          if (startCoord) {
            var startHtml = '<div style="display:flex;align-items:center;gap:4px;background:#1E9E5A;color:#FFFFFF;border:1.5px solid #FFFFFF;border-radius:12px;padding:3px 8px;box-shadow:0 3px 8px rgba(0,0,0,0.35);font-size:10px;font-weight:700;">' +
              '<div style="width:6px;height:6px;border-radius:50%;background:#FFFFFF;"></div>' +
              '<span>Start: ' + (l.startLocation || 'Start') + '</span>' +
            '</div>';

            var startIcon = L.divIcon({
              className: 'start-marker-icon',
              html: startHtml,
              iconSize: [95, 24],
              iconAnchor: [47, 12]
            });

            sMarker = L.marker(startCoord, { icon: startIcon }).addTo(map);
            sMarker.bindPopup('<div style="font-size:11px;font-weight:700;padding:2px;color:#26231B;">Trip Origin: ' + (l.startLocation || 'Start') + '</div>');
          }

          if (destCoord) {
            var destHtml = '<div style="display:flex;align-items:center;gap:4px;background:#D9381E;color:#FFFFFF;border:1.5px solid #FFFFFF;border-radius:12px;padding:3px 8px;box-shadow:0 3px 8px rgba(0,0,0,0.35);font-size:10px;font-weight:700;">' +
              '<div style="width:6px;height:6px;border-radius:50%;background:#FFFFFF;"></div>' +
              '<span>' + (l.endLocation || 'Destination') + '</span>' +
            '</div>';

            var destIcon = L.divIcon({
              className: 'dest-marker-icon',
              html: destHtml,
              iconSize: [85, 24],
              iconAnchor: [42, 12]
            });

            dMarker = L.marker(destCoord, { icon: destIcon }).addTo(map);
            dMarker.bindPopup('<div style="font-size:11px;font-weight:700;padding:2px;color:#26231B;">Final Destination: ' + (l.endLocation || 'Destination') + '</div>');

            for (var vi2 = 0; vi2 < viaCoords.length; vi2++) {
              var vc = viaCoords[vi2];
              var viaHtml = '<div style="display:flex;align-items:center;gap:3px;background:#26231B;color:#FFC20E;border:1.5px solid #FFC20E;border-radius:12px;padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:9.5px;font-weight:700;">' +
                '<span>#' + (vi2 + 1) + '</span>' +
              '</div>';
              var viaIcon = L.divIcon({
                className: 'via-marker-icon',
                html: viaHtml,
                iconSize: [40, 20],
                iconAnchor: [20, 10]
              });
              var vmMarker = L.marker(vc, { icon: viaIcon }).addTo(map);
              vmMarker.bindPopup('<div style="font-size:11px;font-weight:700;padding:2px;color:#26231B;">Via Town #' + (vi2 + 1) + '</div>');
              vMarkers.push(vmMarker);
            }

            var fromCoord = startCoord || [l.lat, l.lng];
            var cachedPts = roadRoutingCache[tripKey];
            var initialPts = cachedPts || getInitialRoutePoints(fromCoord, destCoord, viaCoords);

            if (initialPts && initialPts.length >= 2) {
              glowLine = L.polyline(initialPts, {
                color: '#FFC20E',
                weight: 6,
                opacity: 0.6,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(map);

              dashLine = L.polyline(initialPts, {
                color: '#26231B',
                weight: 3.5,
                dashArray: '5, 8',
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(map);
            }

            var routeHolder = {
              glowLine: glowLine,
              dashLine: dashLine
            };

            if (!cachedPts) {
              fetchRoadRouteForTrip(tripKey, fromCoord, destCoord, viaCoords, routeHolder);
            }
          }

          activeRouteLayers[l.plate] = {
            tripKey: tripKey,
            sMarker: sMarker,
            dMarker: dMarker,
            vMarkers: vMarkers,
            glowLine: routeHolder ? routeHolder.glowLine : glowLine,
            dashLine: routeHolder ? routeHolder.dashLine : dashLine
          };
        }
      });

      // Remove markers for deactivated plates
      Object.keys(markers).forEach(function(p) {
        if (!activePlates[p]) {
          map.removeLayer(markers[p]);
          delete markers[p];
        }
      });

      // Remove route layers for deactivated plates
      Object.keys(activeRouteLayers).forEach(function(p) {
        if (!activePlates[p]) {
          var r = activeRouteLayers[p];
          if (r.sMarker) try { map.removeLayer(r.sMarker); } catch(e) {}
          if (r.dMarker) try { map.removeLayer(r.dMarker); } catch(e) {}
          if (r.startLine) try { map.removeLayer(r.startLine); } catch(e) {}
          if (r.glowLine) try { map.removeLayer(r.glowLine); } catch(e) {}
          if (r.dashLine) try { map.removeLayer(r.dashLine); } catch(e) {}
          delete activeRouteLayers[p];
        }
      });

      if (sel && markers[sel] && !${isMiniMap} && !userInteracted) {
        markers[sel].openPopup();
      }

      // Smooth auto-framing on live vehicle & destination
      focusLorryGlobal = focusLorry;
      if (focusLorry && focusLorry.lat && focusLorry.lng) {
        var focusCoordKey = focusLorry.lat.toFixed(3) + ',' + focusLorry.lng.toFixed(3);
        var destKey = focusDestCoord ? (focusDestCoord[0].toFixed(3) + ',' + focusDestCoord[1].toFixed(3)) : (focusLorry.endLocation || '');
        var focusTripKey = focusLorry.plate + '_' + focusCoordKey + '_' + (focusLorry.startLocation || '') + '_' + destKey;
        if (focusTripKey !== lastFittedTrip && !userInteracted) {
          lastFittedTrip = focusTripKey;
          var framePoints = [[focusLorry.lat, focusLorry.lng]];
          var focusStartCoord = (focusLorry.startLat && focusLorry.startLng) ? [Number(focusLorry.startLat), Number(focusLorry.startLng)] : (focusLorry.startLocation ? resolveCity(focusLorry.startLocation) : null);
          if (focusStartCoord) framePoints.push(focusStartCoord);
          if (focusDestCoord) framePoints.push(focusDestCoord);

          if (framePoints.length >= 2) {
            map.fitBounds(framePoints, {
              padding: [45, 45],
              maxZoom: 13,
              animate: true
            });
          } else {
            map.setView([focusLorry.lat, focusLorry.lng], 13);
          }
        }
      }
    }

    var customerMarkers = [];
    var customerRouteLines = [];

    function renderCustomerPins(pins) {
      if (!map) return;
      for (var ci = 0; ci < customerMarkers.length; ci++) {
        try { map.removeLayer(customerMarkers[ci]); } catch(e) {}
      }
      customerMarkers = [];
      for (var cri = 0; cri < customerRouteLines.length; cri++) {
        try { map.removeLayer(customerRouteLines[cri]); } catch(e) {}
      }
      customerRouteLines = [];

      if (!Array.isArray(pins) || pins.length === 0) return;

      var allBounds = [];
      pins.forEach(function(cp) {
        if (typeof cp.lat === 'number' && typeof cp.lng === 'number' && !isNaN(cp.lat) && !isNaN(cp.lng)) {
          allBounds.push([cp.lat, cp.lng]);
          
          var custSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
          var custHtml = '<div style="position:relative; width:36px; height:36px;">' +
            '<div style="position:absolute; inset:-4px; border-radius:50%; background:rgba(26,115,232,0.35); border:1.5px solid #1A73E8; animation:pulseAnim 1.8s infinite ease-out; pointer-events:none;"></div>' +
            '<div style="position:relative; z-index:2; background:#1A73E8; color:#ffffff; border:2.5px solid #ffffff; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(0,0,0,0.45);">' + custSvg + '</div>' +
            '</div>';
          
          var custIcon = L.divIcon({
            className: 'cust-marker-icon',
            html: custHtml,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18]
          });
          
          var marker = L.marker([cp.lat, cp.lng], { icon: custIcon }).addTo(map);
          var phoneHtml = cp.phone ? ('<div style="font-size:11px; color:#60A5FA; margin-top:2px; font-weight:700;">📞 ' + cp.phone + '</div>') : '';
          var pkgHtml = cp.packageDetails ? ('<div style="font-size:10.5px; color:#E5E7EB; margin-top:3px; background:rgba(255,255,255,0.08); padding:3px 6px; border-radius:6px;">📦 ' + cp.packageDetails + '</div>') : '';
          
          var popHtml = '<div style="background:#26231B; color:#F6F1DF; padding:8px 10px; border-radius:12px; border:1.5px solid #1A73E8; min-width:190px;">' +
            '<div style="color:#60A5FA; font-weight:900; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">📍 Customer Pickup (Booked)</div>' +
            '<div style="color:#FFFFFF; font-weight:800; font-size:14px; margin:2px 0;">' + (cp.title || 'Customer') + '</div>' +
            '<div style="font-size:11px; color:#D1D5DB;">' + (cp.subtitle || '') + '</div>' +
            phoneHtml +
            pkgHtml +
            '</div>';
          marker.bindPopup(popHtml);
          customerMarkers.push(marker);

          // Dotted PickMe route corridor connecting lorry to customer pickup location
          if (focusLorryGlobal && typeof focusLorryGlobal.lat === 'number' && typeof focusLorryGlobal.lng === 'number') {
            var connGlow = L.polyline([[focusLorryGlobal.lat, focusLorryGlobal.lng], [cp.lat, cp.lng]], {
              color: '#1A73E8',
              weight: 5,
              opacity: 0.5,
              lineCap: 'round'
            }).addTo(map);
            var connDash = L.polyline([[focusLorryGlobal.lat, focusLorryGlobal.lng], [cp.lat, cp.lng]], {
              color: '#60A5FA',
              weight: 3,
              dashArray: '6, 8',
              opacity: 0.9,
              lineCap: 'round'
            }).addTo(map);
            customerRouteLines.push(connGlow);
            customerRouteLines.push(connDash);
          }
        }
      });

      // Auto-fit bounds if multiple pins exist
      if (!userInteracted && allBounds.length > 0) {
        if (focusLorryGlobal && typeof focusLorryGlobal.lat === 'number' && typeof focusLorryGlobal.lng === 'number') {
          allBounds.push([focusLorryGlobal.lat, focusLorryGlobal.lng]);
        }
        if (allBounds.length > 1) {
          map.fitBounds(allBounds, { padding: [45, 45], maxZoom: 14 });
        }
      }
    }

    window.updateMapData = function(data, sel, pins) {
      if (data) lorriesData = data;
      if (sel !== undefined) selectedPlate = sel;
      if (pins) customerPinsData = pins;
      if (!map) {
        pendingUpdate = { lorries: data, selected: sel, pins: pins };
        return;
      }
      invalidateMap();
      renderLorries(lorriesData, selectedPlate);
      if (customerPinsData) renderCustomerPins(customerPinsData);
    };

    window.updateCustomerPins = function(pins) {
      if (pins) customerPinsData = pins;
      if (!map) {
        if (!pendingUpdate) pendingUpdate = {};
        pendingUpdate.pins = pins;
        return;
      }
      renderCustomerPins(customerPinsData);
    };

    window.updateLorries = function(data, sel) {
      if (data) lorriesData = data;
      if (sel !== undefined) selectedPlate = sel;
      if (!map) {
        if (!pendingUpdate) pendingUpdate = {};
        pendingUpdate.lorries = data;
        pendingUpdate.selected = sel;
        return;
      }
      invalidateMap();
      renderLorries(lorriesData, selectedPlate);
    };

    window.addEventListener('message', function(ev) {
      try {
        var d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (d && d.type === 'UPDATE_MAP_DATA') {
          if (d.lorries) lorriesData = d.lorries;
          if (d.selectedPlate !== undefined) selectedPlate = d.selectedPlate;
          if (d.customerPins) customerPinsData = d.customerPins;
          if (!map) {
            pendingUpdate = { lorries: d.lorries, selected: d.selectedPlate, pins: d.customerPins };
            return;
          }
          renderLorries(lorriesData, selectedPlate);
          renderCustomerPins(customerPinsData);
        } else if (d && d.type === 'UPDATE_LORRIES') {
          if (d.lorries) lorriesData = d.lorries;
          if (d.selectedPlate !== undefined) selectedPlate = d.selectedPlate;
          if (!map) {
            if (!pendingUpdate) pendingUpdate = {};
            pendingUpdate.lorries = d.lorries;
            pendingUpdate.selected = d.selectedPlate;
            return;
          }
          renderLorries(lorriesData, selectedPlate);
        }
      } catch(e) {}
    });

    // Run map initialization safely on DOM readiness
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initLeafletMap();
      });
    } else {
      initLeafletMap();
    }
  </script>
</body>
</html>`;
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "mapReady" || data.type === "MAP_READY") {
        console.log("[MAP] ready - Leaflet Map initialized");
        setIsMapReady(true);
        setMapLoadTimedOut(false);
        setMapErrorMsg(null);
      } else if (data.type === "tilesLoaded") {
        console.log("[MAP] tiles loaded");
      } else if (data.type === "tileError") {
        console.warn("[MAP] tile error (fallback triggered, count: " + data.errorCount + ")");
      } else if (data.type === "MAP_LOG") {
        console.log(`[MAP] [WebView ${data.level || "log"}]`, data.message);
      } else if (data.type === "MAP_ERROR") {
        console.warn("[MAP] error:", data.message);
        setMapErrorMsg(data.message);
      } else if (data.type === "SELECT_LORRY" && onSelectLorry) {
        onSelectLorry(data.plate);
      } else if (data.type === "TOGGLE_FULLSCREEN") {
        setIsFullScreen(true);
      }
    } catch (e) {
      // Ignored
    }
  };

  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const fullScreenWebViewRef = useRef<any>(null);
  const fullScreenIframeRef = useRef<any>(null);

  // Smooth real-time update injection without reloading Leaflet WebView
  useEffect(() => {
    const payload = JSON.stringify(filteredLorries);
    const sel = JSON.stringify(selectedPlate || "");
    const pinsPayload = JSON.stringify(customerPins || []);
    const script = `if (window.updateMapData) { window.updateMapData(${payload}, ${sel}, ${pinsPayload}); } else if (window.updateLorries) { window.updateLorries(${payload}, ${sel}); } true;`;

    if (Platform.OS === "web") {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "UPDATE_MAP_DATA", lorries: filteredLorries, selectedPlate: selectedPlate || "", customerPins: customerPins || [] },
        "*"
      );
      fullScreenIframeRef.current?.contentWindow?.postMessage(
        { type: "UPDATE_MAP_DATA", lorries: filteredLorries, selectedPlate: selectedPlate || "", customerPins: customerPins || [] },
        "*"
      );
    } else {
      webViewRef.current?.injectJavaScript(script);
      fullScreenWebViewRef.current?.injectJavaScript(script);
    }
  }, [filteredLorries, selectedPlate, customerPins]);

  // Generate HTML ONCE per mode so Android WebView NEVER resets or reloads on GPS ticks!
  const mapHtml = useMemo(() => generateMapHtml(false), [isMiniMap]);
  const fullScreenHtml = useMemo(() => generateMapHtml(true), []);

  return (
    <>
      <View style={[styles.container, { height }]}>
        {Platform.OS === "web" ? (
          /* @ts-ignore */
          <iframe
            ref={iframeRef}
            srcDoc={mapHtml}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: 14,
            }}
          />
        ) : (
          <WebView
            key={`map-view-${reloadKey}`}
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html: mapHtml, baseUrl: "https://tile.openstreetmap.org" }}
            userAgent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={false}
            androidHardwareAccelerationDisabled={false}
            androidLayerType="hardware"
            mixedContentMode="always"
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            scalesPageToFit={false}
            setSupportMultipleWindows={false}
            nestedScrollEnabled={true}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn("[MAP] WebView native onError:", nativeEvent);
              setMapErrorMsg(`WebView load error: ${nativeEvent.description || "Unknown"}`);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn("[MAP] WebView native onHttpError:", nativeEvent.statusCode, nativeEvent.url);
            }}
            onLoadEnd={() => {
              console.log("[MAP] WebView native onLoadEnd");
              const payload = JSON.stringify(filteredLorries);
              const sel = JSON.stringify(selectedPlate || "");
              const pinsPayload = JSON.stringify(customerPins || []);
              webViewRef.current?.injectJavaScript(
                `if (window.updateMapData) { window.updateMapData(${payload}, ${sel}, ${pinsPayload}); } else if (window.updateLorries) { window.updateLorries(${payload}, ${sel}); } if (window.map) { window.map.invalidateSize(true); } true;`
              );
            }}
            style={[styles.webView, { width: "100%", height: "100%" }]}
          />
        )}

        {/* Loading overlay while Leaflet finishes initializing */}
        {!isMapReady && !mapLoadTimedOut && Platform.OS !== "web" && (
          <View style={styles.loadingContainer} pointerEvents="none">
            <ActivityIndicator size="small" color="#FFC20E" />
            <Text style={styles.loadingText}>Loading Sri Lanka Live Map...</Text>
          </View>
        )}

        {/* Error / Retry overlay if map fails to report ready within 15s */}
        {mapLoadTimedOut && !isMapReady && (
          <View style={styles.errorOverlayContainer}>
            <Text style={styles.errorTitle}>Map Initialization Delayed</Text>
            <Text style={styles.errorSub}>
              {mapErrorMsg || "Network or tile service is taking longer than usual."}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                console.log("[MAP] User tapped Retry Loading Map");
                setMapLoadTimedOut(false);
                setMapErrorMsg(null);
                setReloadKey((k) => k + 1);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.retryBtnText}>Retry Loading Map</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isMiniMap && (
          <TouchableOpacity
            style={styles.floatingFullScreenBtn}
            onPress={() => setIsFullScreen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.floatingFullScreenText}>Fullscreen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* FULL SCREEN MODAL VIEW */}
      <Modal visible={isFullScreen} animationType="slide">
        <SafeAreaView style={styles.fullScreenModalWrapper}>
          <View style={styles.fullScreenHeader}>
            <View style={styles.fullScreenTitleRow}>
              <View style={styles.liveDotMini} />
              <Text style={styles.fullScreenTitle}>Sri Lanka Live Map</Text>
              <View style={styles.liveBadgeMini}>
                <View style={styles.liveDotMini} />
                <Text style={styles.liveBadgeMiniText}>{filteredLorries.length} Live</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.exitFullScreenBtn}
              onPress={() => setIsFullScreen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.exitFullScreenText}>Exit Fullscreen</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fullScreenWebViewContainer}>
            {Platform.OS === "web" ? (
              /* @ts-ignore */
              <iframe
                ref={fullScreenIframeRef}
                srcDoc={fullScreenHtml}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            ) : (
              <WebView
                key={`fullscreen-map-${reloadKey}`}
                ref={fullScreenWebViewRef}
                originWhitelist={["*"]}
                source={{ html: fullScreenHtml, baseUrl: "https://tile.openstreetmap.org" }}
                userAgent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                onMessage={handleMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                androidHardwareAccelerationDisabled={false}
                androidLayerType="hardware"
                mixedContentMode="always"
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                scalesPageToFit={false}
                setSupportMultipleWindows={false}
                nestedScrollEnabled={true}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.warn("[MAP] FullScreen WebView native onError:", nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.warn("[MAP] FullScreen WebView native onHttpError:", nativeEvent.statusCode, nativeEvent.url);
                }}
                onLoadEnd={() => {
                  const payload = JSON.stringify(filteredLorries);
                  const sel = JSON.stringify(selectedPlate || "");
                  const pinsPayload = JSON.stringify(customerPins || []);
                  fullScreenWebViewRef.current?.injectJavaScript(
                    `if (window.updateMapData) { window.updateMapData(${payload}, ${sel}, ${pinsPayload}); } else if (window.updateLorries) { window.updateLorries(${payload}, ${sel}); } if (window.map) { window.map.invalidateSize(true); } true;`
                  );
                }}
                style={[styles.webView, { width: "100%", height: "100%" }]}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#EFECE1",
    borderWidth: 1,
    borderColor: "#E7E2D0",
    position: "relative",
  },
  webView: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#EFECE1",
  },
  loadingContainer: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(239, 236, 225, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 10,
  },
  loadingText: {
    color: "#26231B",
    fontSize: 12,
    fontWeight: "700",
  },
  errorOverlayContainer: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(38, 35, 27, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
    zIndex: 20,
  },
  errorTitle: {
    color: "#FFC20E",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  errorSub: {
    color: "#E7E2D0",
    fontSize: 11,
    textAlign: "center",
    maxWidth: 240,
    marginBottom: 6,
  },
  retryBtn: {
    backgroundColor: "#FFC20E",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#26231B",
    fontSize: 12,
    fontWeight: "800",
  },
  floatingFullScreenBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#26231B",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC20E",
    elevation: 3,
    zIndex: 5,
  },
  floatingFullScreenText: {
    color: "#FFC20E",
    fontSize: 11,
    fontWeight: "800",
  },

  /* Full Screen Modal */
  fullScreenModalWrapper: {
    flex: 1,
    backgroundColor: "#26231B",
  },
  fullScreenHeader: {
    height: 54,
    backgroundColor: "#26231B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#3B3727",
  },
  fullScreenTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fullScreenTitle: {
    color: "#FFC20E",
    fontSize: 16,
    fontWeight: "900",
  },
  liveBadgeMini: {
    backgroundColor: "#173B28",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#1E9E5A",
  },
  liveDotMini: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#2FE084",
  },
  liveBadgeMiniText: {
    color: "#2FE084",
    fontSize: 10,
    fontWeight: "800",
  },
  exitFullScreenBtn: {
    backgroundColor: "#B3121F",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  exitFullScreenText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  fullScreenWebViewContainer: {
    flex: 1,
  },
});

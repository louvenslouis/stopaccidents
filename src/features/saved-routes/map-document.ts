import { HAITI_BOUNDS } from '@/components/map-document';

export const ROUTE_EDITOR_DOCUMENT = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#E8EEF0}
.route-pin{border:3px solid #fff;background:#1767A6;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;box-shadow:0 2px 8px #0005}
.route-pin.origin{background:#17825D}.route-pin.destination{background:#B84638}
.leaflet-control-attribution{font:10px/1.4 system-ui}
html[data-theme="dark"],html[data-theme="dark"] body,html[data-theme="dark"] #map{background:#10151D;color:#F1F5F9}
html[data-theme="dark"] .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.78) saturate(.65)}
html[data-theme="dark"] .leaflet-control-zoom a,html[data-theme="dark"] .leaflet-control-attribution,html[data-theme="dark"] .leaflet-tooltip{background:#1A222D;color:#F1F5F9;border-color:#344152}
html[data-theme="dark"] .leaflet-control-attribution a{color:#8DC8FF}
</style></head><body><div id="map" aria-label="Mon trajet exact"></div>
<script>
function notify(payload){var message=JSON.stringify(Object.assign({source:'stopaccidents-route-editor'},payload));if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else window.parent.postMessage(message,'*');}
window.stopAccidentsTheme=function(scheme){document.documentElement.dataset.theme=scheme==='dark'?'dark':'light';document.documentElement.style.colorScheme=scheme==='dark'?'dark':'light';};
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous" onerror="notify({status:'error'})"></script>
<script>
try {
var bounds=L.latLngBounds(${JSON.stringify(HAITI_BOUNDS)});
var map=L.map('map',{maxBounds:bounds,maxBoundsViscosity:1,maxZoom:19,inertia:false,bounceAtZoomLimits:false,zoomControl:false});
L.control.zoom({position:'bottomleft',zoomInTitle:'Zoomer',zoomOutTitle:'Dézoomer'}).addTo(map);
function constrain(){map.setMinZoom(Math.min(19,map.getBoundsZoom(bounds,true)));map.panInsideBounds(bounds,{animate:false});}
map.setView(bounds.getCenter(),Math.min(19,map.getBoundsZoom(bounds,true)));constrain();map.on('resize',constrain);
var pins=L.layerGroup().addTo(map),line=null,outline=null,lastFit=null,lastCount=0,editable=true;
function valid(point){return point&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&bounds.contains([point.latitude,point.longitude]);}
window.stopAccidentsSetRoute=function(state){
 if(!state||!Array.isArray(state.points)||!Array.isArray(state.coordinates))return;
 editable=state.editable===true;pins.clearLayers();
 var locations=[];
 state.points.forEach(function(point){
  if(!valid(point)||typeof point.id!=='string')return;
  var latlng=[point.latitude,point.longitude];locations.push(latlng);
  var badge=document.createElement('span');badge.textContent=String(point.badge).slice(0,3);
  var kind=point.id==='origin'?' origin':point.id==='destination'?' destination':'';
  var marker=L.marker(latlng,{draggable:editable,keyboard:true,title:String(point.label),icon:L.divIcon({className:'route-pin'+kind,html:badge,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(pins);
  var label=document.createElement('span');label.textContent=String(point.label);marker.bindTooltip(label,{direction:'top',offset:[0,-15]});
  marker.on('dragend',function(){var p=marker.getLatLng();if(!bounds.contains(p)){marker.setLatLng(latlng);return;}notify({status:'move',id:point.id,latitude:p.lat,longitude:p.lng});});
 });
 var coordinates=state.coordinates.filter(function(p){return Array.isArray(p)&&p.length===2&&valid({latitude:p[1],longitude:p[0]});}).map(function(p){return[p[1],p[0]];});
 if(line){map.removeLayer(line);map.removeLayer(outline);line=null;outline=null;}
 if(coordinates.length>1){outline=L.polyline(coordinates,{color:'#FFFFFF',weight:9,opacity:.9,interactive:false}).addTo(map);line=L.polyline(coordinates,{color:'#1767A6',weight:5,opacity:1,interactive:false}).addTo(map);}
 if((lastFit!==state.fit||lastCount===0)&&locations.length){
  var fitPoints=coordinates.length>1?coordinates:locations;
  if(fitPoints.length===1)map.setView(fitPoints[0],16,{animate:false});else map.fitBounds(L.latLngBounds(fitPoints),{padding:[35,45],maxZoom:17,animate:false});
 }
 lastFit=state.fit;lastCount=locations.length;
};
map.on('click',function(event){if(editable&&bounds.contains(event.latlng))notify({status:'pick',latitude:event.latlng.lat,longitude:event.latlng.lng});});
window.addEventListener('message',function(event){if(event.source!==window.parent)return;if(event.data&&event.data.source==='stopaccidents-app'){if('theme' in event.data)window.stopAccidentsTheme(event.data.theme);if('state' in event.data)window.stopAccidentsSetRoute(event.data.state);}});
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,bounds:bounds,noWrap:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'});
tiles.once('tileload',function(){notify({status:'ready'});});tiles.on('tileerror',function(){notify({status:'error'});});tiles.addTo(map);
} catch(error){notify({status:'error'});}
</script></body></html>`;

export type RouteMapMessage = { status: 'ready' | 'error' } |
  { status: 'pick'; latitude: number; longitude: number } |
  { status: 'move'; id: string; latitude: number; longitude: number };

export function readRouteMapMessage(message: unknown): RouteMapMessage | null {
  if (typeof message !== 'string' || message.length > 2000) return null;
  try {
    const value = JSON.parse(message);
    if (value?.source !== 'stopaccidents-route-editor') return null;
    if (value.status === 'ready' || value.status === 'error') return { status: value.status };
    if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number' ||
        !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
        value.latitude < HAITI_BOUNDS[0][0] || value.latitude > HAITI_BOUNDS[1][0] ||
        value.longitude < HAITI_BOUNDS[0][1] || value.longitude > HAITI_BOUNDS[1][1]) return null;
    const point = { latitude: value.latitude, longitude: value.longitude };
    if (value.status === 'pick') return { status: 'pick', ...point };
    if (value.status === 'move' && typeof value.id === 'string' && /^(origin|destination|via-\d{1,2})$/.test(value.id))
      return { status: 'move', id: value.id, ...point };
    return null;
  } catch { return null; }
}

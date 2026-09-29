export const LIVE_MAP_DOCUMENT = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>html,body,#map{height:100%;margin:0;background:#E8EEF0}html[data-theme=dark] .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.78) saturate(.65)}</style>
</head><body><div id="map"></div>
<script>function notify(status){var m=JSON.stringify({source:'live-location-map',status:status});if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m);else parent.postMessage(m,'*')}</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous" onerror="notify('error')"></script>
<script>
try {
 var map=L.map('map').setView([18.54,-72.34],13), layer=L.layerGroup().addTo(map), previous='';
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map);
 window.updateLiveLocations=function(data){
  document.documentElement.dataset.theme=data.theme;
  layer.clearLayers();
  var points=[];
  (data.locations||[]).forEach(function(p){
   if(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Date.parse(p.expires_at)<=Date.now()||Date.now()-Date.parse(p.captured_at)>90000)return;
   var point=[p.latitude,p.longitude];points.push(point);
   var label=document.createElement('span');label.textContent=p.alias;
   L.circleMarker(point,{radius:9,color:'#fff',weight:3,fillColor:'#267E70',fillOpacity:1}).bindTooltip(label,{permanent:true,direction:'top'}).addTo(layer);
   if(p.accuracy!=null)L.circle(point,{radius:p.accuracy,color:'#267E70',weight:1,fillOpacity:.08,interactive:false}).addTo(layer);
  });
  var key=(data.locations||[]).map(function(p){return p.connection_id}).sort().join(',');
  if(data.selected){var p=(data.locations||[]).find(function(p){return p.connection_id===data.selected});if(p)map.setView([p.latitude,p.longitude],Math.max(map.getZoom(),15),{animate:false});}
  else if(points.length&&key!==previous)map.fitBounds(L.latLngBounds(points),{maxZoom:15,padding:[40,40],animate:false});
  previous=key;
 };
 addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.source==='live-location-app')window.updateLiveLocations(e.data)});
 notify('ready');
} catch(e){notify('error')}
</script></body></html>`;

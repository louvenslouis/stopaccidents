// Render the existing mockup as a 12-second motion graphic.
// Dependencies are isolated from the application in /private/tmp.
const { createCanvas, loadImage, GlobalFonts } = require('/private/tmp/stop-accident-animation-runtime/node_modules/@napi-rs/canvas');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const ffmpeg = '/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf', 'App');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'AppBold');
const W = 1080, H = 1080, FPS = 30, DURATION = 12;
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x*x*(3-2*x); };
const bubbles = [
  { text: 'Signalez un danger', color: '#E63D43', tint: '#FFF0F1', x: 64, y: 294, start: 0.6, icon: 'alert' },
  { text: 'Explorez la carte', color: '#41856B', tint: '#ECF6F1', x: 88, y: 416, start: 3.0, icon: 'map' },
  { text: 'Consultez les rapports', color: '#7861B2', tint: '#F2EEFB', x: 64, y: 538, start: 5.4, icon: 'chart' },
];
function rounded(x,y,w,h,r) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
function icon(type,x,y,color) {
  ctx.save(); ctx.translate(x,y); ctx.strokeStyle=color; ctx.fillStyle=color;
  ctx.lineWidth=2.7; ctx.lineCap='round'; ctx.lineJoin='round';
  if(type==='alert') {
    ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(16,13); ctx.lineTo(-16,13); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(0,3); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,8,1.6,0,Math.PI*2); ctx.fill();
  } else if(type==='map') {
    ctx.beginPath(); ctx.moveTo(-15,-10); ctx.lineTo(-5,-14); ctx.lineTo(5,-10); ctx.lineTo(15,-14); ctx.lineTo(15,11); ctx.lineTo(5,15); ctx.lineTo(-5,11); ctx.lineTo(-15,15); ctx.closePath(); ctx.stroke();
    for(const [x,a,b] of [[-5,-14,11],[5,-10,15]]) {ctx.beginPath();ctx.moveTo(x,a);ctx.lineTo(x,b);ctx.stroke();}
  } else {
    for(const [x,h] of [[-13,12],[-2,22],[9,31]]) {rounded(x,15-h,6,h,2);ctx.fill();}
  }
  ctx.restore();
}
function bubble(b,t) {
  const age=t-b.start;
  if(age<0) return;
  const fade=smooth(age/0.38)*(1-smooth((t-10.5)/0.85));
  const enter=1-Math.exp(-age*7)*Math.cos(age*10);
  const float=Math.sin(age*1.35)*3;
  ctx.save(); ctx.globalAlpha=fade;
  ctx.translate(b.x+(1-enter)*-35,b.y+(1-enter)*18+float);
  ctx.shadowColor='rgba(30,42,61,0.10)';ctx.shadowBlur=28;ctx.shadowOffsetY=9;
  ctx.fillStyle='#FFFFFF';rounded(0,0,405,88,26);ctx.fill();
  ctx.shadowColor='transparent';ctx.lineWidth=1;ctx.strokeStyle='#EAECEF';ctx.stroke();
  ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.moveTo(351,86);ctx.quadraticCurveTo(360,106,377,106);ctx.lineTo(374,84);ctx.closePath();ctx.fill();
  ctx.fillStyle=b.tint;rounded(16,16,56,56,18);ctx.fill();icon(b.icon,44,44,b.color);
  ctx.fillStyle='#253044';ctx.font='26px AppBold';ctx.textBaseline='middle';ctx.fillText(b.text,88,44);
  ctx.restore();
}
async function main() {
  const photo=await loadImage(path.join(__dirname,'../stop-accident-signaler-clair.png'));
  const video=path.join(__dirname,'stop-accident-animation.mp4');
  const proc=spawn(ffmpeg,['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:['pipe','ignore','pipe']});
  let log='';proc.stderr.on('data',data=>log+=data.toString());
  const done=once(proc,'close');
  for(let frame=0;frame<FPS*DURATION;frame++) {
    const t=frame/FPS;
    ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,W,H);
    const lift=Math.sin(t/DURATION*Math.PI*2)*4;
    ctx.drawImage(photo,160,219+lift,920,920*photo.height/photo.width);
    ctx.fillStyle='#E63D43';rounded(64,94,40,5,2.5);ctx.fill();
    ctx.font='bold 48px AppBold';ctx.textBaseline='alphabetic';ctx.fillStyle='#202936';ctx.fillText('Stop Accident',64,164);
    bubbles.forEach(b=>bubble(b,t));
    if(frame===225) fs.writeFileSync(path.join(__dirname,'apercu.png'),canvas.toBuffer('image/png'));
    const raw=ctx.getImageData(0,0,W,H).data;
    if(!proc.stdin.write(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength))) await once(proc.stdin,'drain');
  }
  proc.stdin.end();
  const [code]=await done;
  if(code!==0) throw new Error(log);
  console.log(video);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

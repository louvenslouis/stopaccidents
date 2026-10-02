const {createCanvas,loadImage,GlobalFonts}=require('/private/tmp/stop-accident-animation-runtime/node_modules/@napi-rs/canvas');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const FFMPEG='/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const ROOT=path.resolve(__dirname,'../../..');
const W=1080,H=1920,FPS=30,D=48;
const canvas=createCanvas(W,H),c=canvas.getContext('2d');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf','App');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial Bold.ttf','Bold');
const RED='#E44048',INK='#232C3B';
const clamp=x=>Math.min(1,Math.max(0,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const spring=x=>x<=0?0:1-Math.exp(-7*x)*Math.cos(9*x);
const types=[
 {name:'Accident',lines:['ACCIDENT'],color:'#E34E4C',tint:'#FFF0E9',file:'report-illustrations/accident.png'},
 {name:'Route barricadée',lines:['ROUTE','BARRICADÉE'],color:'#AF882F',tint:'#FFF5DF',file:'barricade-types/other.png'},
 {name:'Véhicule en panne',lines:['VÉHICULE','EN PANNE'],color:'#C28A32',tint:'#FFF4E8',file:'breakdown-report/breakdown.png'},
 {name:'Incendie',lines:['INCENDIE'],color:'#E57633',tint:'#FFF1E3',file:'fire-report/fire.png'},
 {name:'Tirs entendus',lines:['TIRS ENTENDUS'],color:'#DD6168',tint:'#FFF0EE',file:'report-illustrations/gunfire.png'},
 {name:'Enlèvement',lines:['ENLÈVEMENT'],color:'#8E68B5',tint:'#F0EDFF',file:'report-illustrations/kidnapping.png'},
 {name:'Présence d’hommes armés',lines:['PRÉSENCE','D’HOMMES ARMÉS'],color:'#527B98',tint:'#EDF3F8',file:'report-illustrations/armed-presence.png'},
 {name:'Véhicule suspect',lines:['VÉHICULE','SUSPECT'],color:'#44856C',tint:'#EAF6F0',file:'report-illustrations/suspicious-vehicle.png'},
];
const CAP=path.join(__dirname,'update-2026-09-30');

function rounded(x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
function circle(x,y,r,fill,width=0){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(width){c.strokeStyle=fill;c.lineWidth=width;c.stroke();}else{c.fillStyle=fill;c.fill();}}
function text(s,x,y,size=30,color=INK,align='left',font='Bold'){c.fillStyle=color;c.font=`${size}px ${font}`;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(s,x,y);}
function animatedText(s,x,y,size,color,t,delay=0,align='left'){const p=ease((t-delay)/.28);c.save();c.globalAlpha=p;text(s,x+(1-p)*32,y+(1-p)*28,size,color,align);c.restore();}
function shadow(on){c.shadowColor=on?'rgba(20,35,55,.10)':'transparent';c.shadowBlur=on?25:0;c.shadowOffsetY=on?10:0;}
function background(t,tint='#FFFFFF'){c.fillStyle='#FFFFFF';c.fillRect(0,0,W,H);if(tint!=='#FFFFFF'){const g=c.createRadialGradient(800,850,20,800,850,1250);g.addColorStop(0,tint);g.addColorStop(1,'#FFFFFF');c.fillStyle=g;c.fillRect(0,0,W,H);}for(let i=0;i<24;i++)circle((i*163+Math.sin(t*.6+i)*13)%W,(i*231+t*7)%H,2+i%3,'rgba(190,125,135,.10)');}
function brand(t,color=RED){rounded(78,126,34,5,2,color);text('STOP ACCIDENT',132,143,27);rounded(80,1815,920,5,2,'#ECEEF1');rounded(80,1815,920*t/D,5,2,color);}
function phone(im,x,y,w,rot=0,srcH=800){
 const h=w*srcH/430;c.save();c.translate(x+w/2,y+h/2);c.rotate(rot);
 shadow(true);rounded(-w/2-10,-h/2-10,w+20,h+20,52,'#242C36');shadow(false);
 c.save();c.beginPath();c.roundRect(-w/2,-h/2,w,h,43);c.clip();c.drawImage(im,0,0,430,srcH,-w/2,-h/2,w,h);c.restore();c.restore();
}
function pill(s,x,y,w,color=RED){shadow(true);rounded(x,y,w,72,36,'#FFFFFF');shadow(false);circle(x+31,y+36,7,color);text(s,x+52,y+47,27,color);}
function intro(a,images){
 animatedText('MIEUX INFORMÉS.',540,295,76,INK,a,0,'center');animatedText('ENSEMBLE.',540,385,84,RED,a,.12,'center');
 const p=spring(a*1.3);phone(images.home,240,500+(1-p)*500,600,-.025+Math.sin(a)*.012,900);
 c.save();c.globalAlpha=ease((a-.7)/.3);pill('Près de moi',80,740,270);c.restore();
 c.save();c.globalAlpha=ease((a-1.2)/.3);pill('Mon trajet',745,1375,260);c.restore();
}
function sheet(a,images){animatedText('UN GESTE.',540,285,88,INK,a,0,'center');animatedText('8 SIGNALEMENTS.',540,382,75,RED,a,.1,'center');
 phone(images.home,215,490,650,0,800);
 const h=650*800/430,p=ease(a/.6);c.save();c.beginPath();c.roundRect(215,490,650,h,43);c.clip();c.drawImage(images.sheet,0,0,430,800,215,490+(1-p)*h,650,h);c.restore();
}
function category(index,a,t){const type=types[index];background(t,type.tint);
 text(String(index+1).padStart(2,'0')+' / 08',1000,143,27,type.color,'right');
 const lineSize=index===6?76:88;
 type.lines.forEach((line,i)=>animatedText(line,540,type.lines.length===1?410:367+i*104,lineSize,type.color,a,i*.045,'center'));
 const cy=975,scale=.83+.17*spring(a*1.35);
 c.save();c.translate(540,cy);c.scale(scale,scale);circle(0,0,340,type.tint);circle(0,0,365,type.color+'28',2);
 for(let j=0;j<8;j++){const angle=j*Math.PI/4+t*.16;c.save();c.translate(Math.cos(angle)*396,Math.sin(angle)*396);c.rotate(angle);rounded(-16,-3,32,6,3,type.color);c.restore();}
 c.rotate(Math.sin(a*1.8)*.02);c.drawImage(type.image,-335,-335,670,670);c.restore();
 types.forEach((item,i)=>{const x=120+i*120,y=1557;circle(x,y,i===index?55:44,i===index?item.tint:'#F8F9FB');if(i===index)circle(x,y,57,item.color,3);c.drawImage(item.image,x-37,y-37,74,74);});
}
const scrollStops=[[0,0],[1,0],[3,630],[3.5,630],[5.7,1260],[6.2,1260],[8.2,1890],[8.7,1890],[10.5,2520],[11,2520],[13,2795],[14,2795]];
function scrollPosition(a){for(let i=1;i<scrollStops.length;i++){const end=scrollStops[i],start=scrollStops[i-1];if(a<=end[0])return start[1]+(end[1]-start[1])*smooth((a-start[0])/(end[0]-start[0]));}return 2795;}
function reports(a,images){const y=scrollPosition(a);animatedText('LES RAPPORTS',540,247,78,INK,a,0,'center');
 const labels=['Vue d’ensemble','Évolution','Territoires','Types d’événement','Heures de signalement'];
 const active=y<650?0:y<1450?1:y<2100?2:y<2500?3:4;
 rounded(230,278,620,53,26,'#FFF0EF');text(labels[active],540,314,31,RED,'center');
 const sx=220,sy=365,sw=640,sh=640*900/430,ratio=sw/430;
 shadow(true);rounded(sx-10,sy-10,sw+20,sh+20,54,'#262C35');shadow(false);
 c.save();c.beginPath();c.roundRect(sx,sy,sw,sh,44);c.clip();c.fillStyle='#F7F7F7';c.fillRect(sx,sy,sw,sh);
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 c.drawImage(images.report,0,Math.min(y,2795),430,900,sx,sy,sw,sh);
 shadow(true);rounded(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio,'#FFFFFF');shadow(false);
 c.save();c.beginPath();c.roundRect(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio);c.clip();c.drawImage(images.first,50,810,361,71,sx+50*ratio,sy+810*ratio,361*ratio,71*ratio);c.restore();c.restore();
 labels.forEach((_,i)=>circle(480+i*30,1755,i===active?6:4,i===active?RED:'#D3D8DF'));
}
function relatives(a){
 background(a,'#EAF6F0');animatedText('MES PROCHES',540,315,85,'#267E70',a,0,'center');
 const pts=[[540,750],[275,1060],[805,1060]];
 c.strokeStyle='#267E7040';c.lineWidth=5;c.setLineDash([10,14]);c.lineDashOffset=-a*35;
 c.beginPath();c.moveTo(540,750);c.lineTo(275,1060);c.lineTo(805,1060);c.closePath();c.stroke();c.setLineDash([]);
 pts.forEach(([x,y],i)=>{const p=spring(Math.max(0,a-i*.12));c.save();c.translate(x,y);c.scale(p,p);shadow(true);circle(0,0,108,'#FFFFFF');shadow(false);circle(0,-23,28,'#267E70');rounded(-48,15,96,57,28,'#267E70');circle(78,-68,17,RED);c.restore();});
 ['Ajouter ses proches','Partager sa position'].forEach((s,i)=>{c.save();c.globalAlpha=ease((a-.4-i*.3)/.3);pill(s,280,1370+i*110,520,'#267E70');c.restore();});
}
function settings(a,images){animatedText('À VOTRE FAÇON.',540,300,79,INK,a,0,'center');
 phone(images.settings,195,440+80*(1-ease(a/.5)),690,Math.sin(a*.7)*.012,650);
 animatedText('FRANÇAIS · KREYÒL',540,1590,43,RED,a,.4,'center');
 animatedText('VOTRE THÈME',540,1660,34,INK,a,.6,'center');
}
function outro(a,images){animatedText('STOP',540,350,115,INK,a,0,'center');animatedText('ACCIDENT',540,480,115,RED,a,.08,'center');
 types.forEach((type,i)=>{const x=240+(i%3)*300,y=730+Math.floor(i/3)*240,p=spring(Math.max(0,a-.1-i*.045));c.save();c.translate(x,y);c.scale(p,p);circle(0,0,98,type.tint);c.drawImage(type.image,-84,-84,168,168);c.restore();});
 c.save();c.globalAlpha=ease((a-.4)/.3);shadow(true);rounded(240,1490,600,110,55,RED);shadow(false);text('SIGNALER',540,1563,48,'#FFFFFF','center');c.restore();
}
const transitions=[4,7,9,11,13,15,17,19,21,23,37,41,45];
function wipe(t){for(const at of transitions){const d=t-at;if(Math.abs(d)<.14){const p=(d+.14)/.28;c.save();c.translate(-1510+p*3220,0);c.transform(1,0,-.12,1,0,0);c.fillStyle=at>=7&&at<23?types[Math.min(7,Math.floor((at-7)/2))].color:RED;c.fillRect(0,-50,1100,2020);c.restore();}}}
function soundtrack(){const rate=48000,N=rate*D,L=new Float64Array(N),R=new Float64Array(N);let seed=17;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
 function add(start,length,fn,pan=0){const first=Math.round(start*rate);for(let j=0;j<length*rate&&first+j<N;j++){if(first+j<0)continue;const v=fn(j/rate);L[first+j]+=v*Math.sqrt((1-pan)/2);R[first+j]+=v*Math.sqrt((1+pan)/2);}}
 const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
 for(let beat=0;beat<D*2;beat++){const at=beat*.5,ch=chords[Math.floor(at/4)%4],soft=at>=23&&at<37?.62:1;
  add(at,.3,u=>soft*.2*Math.sin(2*Math.PI*(48*u+1.4*(1-Math.exp(-u*30))))*Math.exp(-u*18)*(1-Math.exp(-u*700)));
  if(beat%2)add(at,.15,u=>soft*.043*rand()*Math.exp(-u*32)*(1-Math.exp(-u*900)));
  add(at+.25,.06,u=>soft*.02*rand()*Math.exp(-u*85));
  const note=ch[beat%3]*2;for(const[delay,gain]of[[0,1],[.18,.2],[.36,.08]])add(at+delay,.8,u=>soft*gain*.056*(Math.sin(2*Math.PI*note*u)+.16*Math.sin(4*Math.PI*note*u))*Math.exp(-u*5)*(1-Math.exp(-u*160)),beat%2?.3:-.3);
  if(beat%2===0)add(at,.8,u=>soft*.064*Math.sin(Math.PI*ch[0]*u)*Math.exp(-u*4)*(1-Math.exp(-u*100)));
 }
 for(const at of transitions)add(at-.22,.5,u=>.085*rand()*Math.pow(Math.sin(Math.PI*u/.5),2));
 for(let i=0;i<8;i++)add(7+i*2+.2,.4,u=>.085*Math.sin(2*Math.PI*(660*u+12*(1-Math.exp(-u*60))))*Math.exp(-u*12)*(1-Math.exp(-u*300)));
 let peak=0;for(let j=0;j<N;j++){const fade=smooth(j/rate/.1)*(1-smooth((j/rate-(D-1.5))/1.5));L[j]*=fade;R[j]*=fade;peak=Math.max(peak,Math.abs(L[j]),Math.abs(R[j]));}
 const gain=.68/peak,b=Buffer.alloc(44+N*4);b.write('RIFF');b.writeUInt32LE(36+N*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);for(let j=0;j<N;j++){b.writeInt16LE(Math.round(L[j]*gain*32767),44+j*4);b.writeInt16LE(Math.round(R[j]*gain*32767),46+j*4);}fs.writeFileSync(path.join(__dirname,'motion-musique.wav'),b);
}
async function main(){
 const images={home:await loadImage(path.join(CAP,'accueil.png')),sheet:await loadImage(path.join(CAP,'signaler.png')),settings:await loadImage(path.join(CAP,'parametres.png'))};
 for(const item of types)item.image=await loadImage(path.join(ROOT,'assets/images',item.file));
 const captures=JSON.parse(fs.readFileSync(path.join(CAP,'captures.json'),'utf8'));
 const tall=createCanvas(430,3695),tc=tall.getContext('2d');tc.fillStyle='#F7F7F7';tc.fillRect(0,0,430,3695);
 for(let i=0;i<captures.length;i++){const shot=captures[i],im=await loadImage(path.join(CAP,shot.file));if(i===0)images.first=im;const h=i===captures.length-1?800:captures[i+1].top-shot.top;tc.drawImage(im,0,0,430,h,0,shot.top,430,h);}
 images.report=tall;
 if(!process.argv.includes('--preview'))soundtrack();
 const preview=process.argv.includes('--preview');const proc=preview?null:spawn(FFMPEG,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1920','-framerate',String(FPS),'-i','pipe:0','-i',path.join(__dirname,'motion-musique.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',String(D),'-movflags','+faststart',path.join(__dirname,'stop-accident-motion-2026-09-30.mp4')],{stdio:['pipe','ignore','pipe']});
 let err='';if(proc)proc.stderr.on('data',v=>err+=v);const done=proc?once(proc,'close'):Promise.resolve([0]);
 const board=createCanvas(1440,2560),bc=board.getContext('2d');bc.fillStyle='#FFF';bc.fillRect(0,0,1440,2560);
 const marks=[2,5,8,10,12,14,16,18,20,22,25,30,35,39,43,47];let boardIndex=0;
 for(let frame=0;frame<D*FPS;frame++){const t=frame/FPS;if(preview&&!marks.includes(t))continue;background(t);let color=RED;
  if(t<4)intro(t,images);else if(t<7)sheet(t-4,images);else if(t<23){const index=Math.floor((t-7)/2);category(index,t-7-index*2,t);color=types[index].color;}else if(t<37)reports(t-23,images);else if(t<41)relatives(t-37);else if(t<45)settings(t-41,images);else outro(t-45,images);
  brand(t,color);wipe(t);
  if(marks.includes(t)){bc.drawImage(canvas,boardIndex%4*360,Math.floor(boardIndex/4)*640,360,640);boardIndex++;}
  if(frame===30*FPS)fs.writeFileSync(path.join(__dirname,'motion-rapports-apercu.png'),canvas.toBuffer('image/png'));
  if(preview)continue;const raw=c.getImageData(0,0,W,H).data;if(!proc.stdin.write(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength)))await once(proc.stdin,'drain');
 }
 if(proc)proc.stdin.end();const[code]=await done;if(code!==0)throw new Error(err);fs.writeFileSync(path.join(__dirname,'motion-storyboard.png'),board.toBuffer('image/png'));console.log('48 seconds. 1080x1920. All 8 report types: 2 seconds each. Reports: 14 seconds of scrolling. Stereo soundtrack.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

const {createCanvas,loadImage,GlobalFonts}=require('/private/tmp/stop-accident-animation-runtime/node_modules/@napi-rs/canvas');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const FFMPEG='/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const ROOT=path.resolve(__dirname,'../../..');
const W=1080,H=1920,FPS=30,D=34;
const canvas=createCanvas(W,H),c=canvas.getContext('2d');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf','App');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial Bold.ttf','Bold');
const RED='#E44048',INK='#232C3B';
const clamp=x=>Math.min(1,Math.max(0,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const spring=x=>x<=0?0:1-Math.exp(-7*x)*Math.cos(9*x);
const types=[
 {name:'Tirs entendus',lines:['TIRS ENTENDUS'],color:'#DD6168',tint:'#FFF0EE',file:'report-illustrations/gunfire.png'},
 {name:'Accident',lines:['ACCIDENT'],color:'#E34E4C',tint:'#FFF0E9',file:'report-illustrations/accident.png'},
 {name:'Véhicule en panne',lines:['VÉHICULE','EN PANNE'],color:'#C28A32',tint:'#FFF4E8',file:'breakdown-report/breakdown.png'},
 {name:'Enlèvement',lines:['ENLÈVEMENT'],color:'#8E68B5',tint:'#F0EDFF',file:'report-illustrations/kidnapping.png'},
 {name:'Route barricadée',lines:['ROUTE','BARRICADÉE'],color:'#AF882F',tint:'#FFF5DF',file:'barricade-types/other.png'},
 {name:'Présence d’hommes armés',lines:['PRÉSENCE','D’HOMMES ARMÉS'],color:'#527B98',tint:'#EDF3F8',file:'report-illustrations/armed-presence.png'},
 {name:'Voiture suspecte',lines:['VOITURE','SUSPECTE'],color:'#44856C',tint:'#EAF6F0',file:'report-illustrations/suspicious-vehicle.png'},
];
function rounded(x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
function circle(x,y,r,fill,width=0){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(width){c.strokeStyle=fill;c.lineWidth=width;c.stroke();}else{c.fillStyle=fill;c.fill();}}
function text(s,x,y,size=30,color=INK,align='left',font='Bold'){c.fillStyle=color;c.font=`${size}px ${font}`;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(s,x,y);}
function animatedText(s,x,y,size,color,t,delay=0,align='left'){const p=ease((t-delay)/.28);c.save();c.globalAlpha=p;text(s,x+(1-p)*32,y+(1-p)*28,size,color,align);c.restore();}
function shadow(on){c.shadowColor=on?'rgba(20,35,55,.10)':'transparent';c.shadowBlur=on?25:0;c.shadowOffsetY=on?10:0;}
function background(t,tint='#FFFFFF'){c.fillStyle='#FFFFFF';c.fillRect(0,0,W,H);if(tint!=='#FFFFFF'){const g=c.createRadialGradient(800,850,20,800,850,1250);g.addColorStop(0,tint);g.addColorStop(1,'#FFFFFF');c.fillStyle=g;c.fillRect(0,0,W,H);}for(let i=0;i<24;i++)circle((i*163+Math.sin(t*.6+i)*13)%W,(i*231+t*7)%H,2+i%3,'rgba(190,125,135,.10)');}
function brand(t,color=RED){rounded(78,126,34,5,2,color);text('STOP ACCIDENT',132,143,27);rounded(80,1815,920,5,2,'#ECEEF1');rounded(80,1815,920*t/D,5,2,color);}
function intro(a,images){c.drawImage(images.phone,-270,565,1450,1450*images.phone.height/images.phone.width);animatedText('7 FAÇONS',540,310,97,INK,a,0,'center');animatedText('DE SIGNALER.',540,422,97,RED,a,.1,'center');types.forEach((type,i)=>{const p=spring(Math.max(0,a-.2-i*.055));if(p<=0)return;c.save();c.globalAlpha=clamp(p);c.translate(150+i*130,535);c.scale(.7+.3*p,.7+.3*p);circle(0,0,47,type.tint);c.drawImage(type.image,-41,-41,82,82);c.restore();});}
function category(index,a,t){const type=types[index];background(t,type.tint);
 text(String(index+1).padStart(2,'0')+' / 07',1000,143,27,type.color,'right');
 const lineSize=index===5?76:88;
 type.lines.forEach((line,i)=>animatedText(line,540,type.lines.length===1?410:367+i*104,lineSize,type.color,a,i*.045,'center'));
 const cy=975,scale=.83+.17*spring(a*1.35);
 c.save();c.translate(540,cy);c.scale(scale,scale);circle(0,0,340,type.tint);circle(0,0,365,type.color+'28',2);
 for(let j=0;j<8;j++){const angle=j*Math.PI/4+t*.16;c.save();c.translate(Math.cos(angle)*396,Math.sin(angle)*396);c.rotate(angle);rounded(-16,-3,32,6,3,type.color);c.restore();}
 c.rotate(Math.sin(a*1.8)*.02);c.drawImage(type.image,-335,-335,670,670);c.restore();
 types.forEach((item,i)=>{const x=150+i*130,y=1557;circle(x,y,i===index?55:44,i===index?item.tint:'#F8F9FB');if(i===index)circle(x,y,57,item.color,3);c.drawImage(item.image,x-37,y-37,74,74);});
}
const scrollStops=[[0,0],[1.0,0],[3,630],[3.5,630],[5.7,1300],[6.2,1300],[8.2,1970],[8.7,1970],[10.5,2580],[11,2580],[13,3150],[14,3150]];
function scrollPosition(a){for(let i=1;i<scrollStops.length;i++){const end=scrollStops[i],start=scrollStops[i-1];if(a<=end[0])return start[1]+(end[1]-start[1])*smooth((a-start[0])/(end[0]-start[0]));}return 3150;}
function reports(a,images){const y=scrollPosition(a);animatedText('LES RAPPORTS',540,247,78,INK,a,0,'center');
 const labels=['Vue d’ensemble','Évolution','Territoires','Types d’événement','Heures de signalement'];
 const active=y<840?0:y<1600?1:y<2240?2:y<2920?3:4;
 rounded(230,278,620,53,26,'#FFF0EF');text(labels[active],540,314,31,RED,'center');
 const sx=220,sy=365,sw=640,sh=640*900/430,ratio=sw/430;
 shadow(true);rounded(sx-10,sy-10,sw+20,sh+20,54,'#262C35');shadow(false);
 c.save();c.beginPath();c.roundRect(sx,sy,sw,sh,44);c.clip();c.fillStyle='#F7F7F7';c.fillRect(sx,sy,sw,sh);
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 c.drawImage(images.report,0,Math.min(y,3150),430,900,sx,sy,sw,sh);
 shadow(true);rounded(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio,'#FFFFFF');shadow(false);
 c.save();c.beginPath();c.roundRect(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio);c.clip();c.drawImage(images.first,19,810,392,71,sx+19*ratio,sy+810*ratio,392*ratio,71*ratio);c.restore();c.restore();
 labels.forEach((_,i)=>circle(480+i*30,1755,i===active?6:4,i===active?RED:'#D3D8DF'));
}
function outro(a,images){c.drawImage(images.phone,-270,640,1450,1450*images.phone.height/images.phone.width);animatedText('STOP',540,310,110,INK,a,0,'center');animatedText('ACCIDENT',540,433,110,RED,a,.08,'center');c.save();c.globalAlpha=ease((a-.25)/.35);shadow(true);rounded(300,492,480,101,50,RED);shadow(false);text('SIGNALER',540,558,43,'#FFFFFF','center');c.restore();types.forEach((type,i)=>{const p=ease((a-.4-i*.045)/.25);c.save();c.globalAlpha=p;circle(150+i*130,674,45,type.tint);c.drawImage(type.image,111+i*130,635,78,78);c.restore();});}
const transitions=[2,4,6,8,10,12,14,16,30];
function wipe(t){for(const at of transitions){const d=t-at;if(Math.abs(d)<.16){const p=(d+.16)/.32;c.save();c.translate(-1510+p*3220,0);c.transform(1,0,-.12,1,0,0);c.fillStyle=at<16?types[Math.max(0,Math.min(6,Math.floor((at-2)/2)))].color:RED;c.fillRect(0,-50,1100,2020);c.restore();}}}
function soundtrack(){const rate=48000,N=rate*D,L=new Float64Array(N),R=new Float64Array(N);let seed=17;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
 function add(start,length,fn,pan=0){const first=Math.round(start*rate);for(let j=0;j<length*rate&&first+j<N;j++){if(first+j<0)continue;const v=fn(j/rate);L[first+j]+=v*Math.sqrt((1-pan)/2);R[first+j]+=v*Math.sqrt((1+pan)/2);}}
 const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
 for(let beat=0;beat<D*2;beat++){const at=beat*.5,ch=chords[Math.floor(at/4)%4],soft=at>=16&&at<30?.62:1;
  add(at,.3,u=>soft*.2*Math.sin(2*Math.PI*(48*u+1.4*(1-Math.exp(-u*30))))*Math.exp(-u*18)*(1-Math.exp(-u*700)));
  if(beat%2)add(at,.15,u=>soft*.043*rand()*Math.exp(-u*32)*(1-Math.exp(-u*900)));
  add(at+.25,.06,u=>soft*.02*rand()*Math.exp(-u*85));
  const note=ch[beat%3]*2;for(const[delay,gain]of[[0,1],[.18,.2],[.36,.08]])add(at+delay,.8,u=>soft*gain*.056*(Math.sin(2*Math.PI*note*u)+.16*Math.sin(4*Math.PI*note*u))*Math.exp(-u*5)*(1-Math.exp(-u*160)),beat%2?.3:-.3);
  if(beat%2===0)add(at,.8,u=>soft*.064*Math.sin(Math.PI*ch[0]*u)*Math.exp(-u*4)*(1-Math.exp(-u*100)));
 }
 for(const at of transitions)add(at-.22,.5,u=>.085*rand()*Math.pow(Math.sin(Math.PI*u/.5),2));
 for(let i=0;i<7;i++)add(2+i*2+.2,.4,u=>.085*Math.sin(2*Math.PI*(660*u+12*(1-Math.exp(-u*60))))*Math.exp(-u*12)*(1-Math.exp(-u*300)));
 let peak=0;for(let j=0;j<N;j++){const fade=smooth(j/rate/.1)*(1-smooth((j/rate-(D-1.5))/1.5));L[j]*=fade;R[j]*=fade;peak=Math.max(peak,Math.abs(L[j]),Math.abs(R[j]));}
 const gain=.68/peak,b=Buffer.alloc(44+N*4);b.write('RIFF');b.writeUInt32LE(36+N*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);for(let j=0;j<N;j++){b.writeInt16LE(Math.round(L[j]*gain*32767),44+j*4);b.writeInt16LE(Math.round(R[j]*gain*32767),46+j*4);}fs.writeFileSync(path.join(__dirname,'vertical-musique.wav'),b);
}
async function main(){
 const images={phone:await loadImage(path.join(__dirname,'../stop-accident-signaler-clair.png'))};
 for(const item of types)item.image=await loadImage(path.join(ROOT,'assets/images',item.file));
 const captures=JSON.parse(fs.readFileSync(path.join(__dirname,'rapports-captures/captures.json'),'utf8'));
 const tall=createCanvas(430,4060),tc=tall.getContext('2d');tc.fillStyle='#F7F7F7';tc.fillRect(0,0,430,4060);
 for(let i=0;i<captures.length;i++){const shot=captures[i],im=await loadImage(path.join(__dirname,'rapports-captures',shot.file));if(i===0)images.first=im;const h=i===captures.length-1?790:captures[i+1].top-shot.top;tc.drawImage(im,0,0,430,h,0,shot.top,430,h);}
 images.report=tall;fs.writeFileSync(path.join(__dirname,'rapports-captures/rapport-complet.png'),tall.toBuffer('image/png'));
 soundtrack();
 const proc=spawn(FFMPEG,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1920','-framerate',String(FPS),'-i','pipe:0','-i',path.join(__dirname,'vertical-musique.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',String(D),'-movflags','+faststart',path.join(__dirname,'stop-accident-vertical.mp4')],{stdio:['pipe','ignore','pipe']});
 let err='';proc.stderr.on('data',v=>err+=v);const done=once(proc,'close');
 const board=createCanvas(1440,1920),bc=board.getContext('2d');bc.fillStyle='#FFF';bc.fillRect(0,0,1440,1920);
 const marks=[1,3,5,7,9,11,13,15,17,22,27,32];let boardIndex=0;
 for(let frame=0;frame<D*FPS;frame++){const t=frame/FPS;background(t);let color=RED;
  if(t<2)intro(t,images);else if(t<16){const index=Math.floor((t-2)/2);category(index,t-2-index*2,t);color=types[index].color;}else if(t<30)reports(t-16,images);else outro(t-30,images);
  brand(t,color);wipe(t);
  if(marks.includes(t)){bc.drawImage(canvas,boardIndex%4*360,Math.floor(boardIndex/4)*640,360,640);boardIndex++;}
  if(frame===22*FPS)fs.writeFileSync(path.join(__dirname,'vertical-rapports-apercu.png'),canvas.toBuffer('image/png'));
  const raw=c.getImageData(0,0,W,H).data;if(!proc.stdin.write(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength)))await once(proc.stdin,'drain');
 }
 proc.stdin.end();const[code]=await done;if(code!==0)throw new Error(err);fs.writeFileSync(path.join(__dirname,'vertical-storyboard.png'),board.toBuffer('image/png'));console.log('34 seconds. 1080x1920. All 7 report types: 2 seconds each. Reports: 14 seconds of scrolling. Stereo soundtrack.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

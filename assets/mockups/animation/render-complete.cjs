const {createCanvas,loadImage,GlobalFonts}=require('/private/tmp/stop-accident-animation-runtime/node_modules/@napi-rs/canvas');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const FFMPEG='/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const ROOT=path.resolve(__dirname,'../../..');
const W=1080,H=1080,FPS=30,D=48;
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
function animatedText(s,x,y,size,color,t,delay=0,align='left'){const p=ease((t-delay)/.5);c.save();c.globalAlpha=p;text(s,x+(1-p)*32,y+(1-p)*28,size,color,align);c.restore();}
function shadow(on){c.shadowColor=on?'rgba(20,35,55,.10)':'transparent';c.shadowBlur=on?25:0;c.shadowOffsetY=on?10:0;}
function background(t,tint='#FFFFFF'){c.fillStyle='#FFFFFF';c.fillRect(0,0,W,H);if(tint!=='#FFFFFF'){const g=c.createRadialGradient(820,420,20,820,420,850);g.addColorStop(0,tint);g.addColorStop(1,'#FFFFFF');c.fillStyle=g;c.fillRect(0,0,W,H);}for(let i=0;i<15;i++)circle((i*163+Math.sin(t*.6+i)*13)%1080,(i*231+t*7)%1080,2+i%3,'rgba(190,125,135,.10)');}
function brand(t,color=RED){rounded(57,54,30,4,2,color);text('STOP ACCIDENT',104,67,20);rounded(58,1031,964,4,2,'#ECEEF1');rounded(58,1031,964*t/D,4,2,color);}
function intro(a,images){c.drawImage(images.phone,250,225,910,858);animatedText('7 FAÇONS',60,235,79,INK,a);animatedText('DE SIGNALER.',60,329,79,RED,a,.15);types.forEach((type,i)=>{const p=spring(Math.max(0,a-.3-i*.09));if(p<=0)return;c.save();c.globalAlpha=clamp(p);c.translate(91+(i%3)*104,470+Math.floor(i/3)*103);c.scale(.7+.3*p,.7+.3*p);circle(0,0,43,type.tint);c.drawImage(type.image,-36,-36,72,72);c.restore();});}
function category(index,a,t){const type=types[index];background(t,type.tint);
  text(`${String(index+1).padStart(2,'0')} / 07`,1018,67,20,type.color,'right');
  const lineSize=index===5?58:72;
  type.lines.forEach((line,i)=>animatedText(line,540,type.lines.length===1?208:174+i*76,lineSize,type.color,a,i*.08,'center'));
  const cy=566,scale=.76+.24*spring(a);
  c.save();c.translate(540,cy);c.scale(scale,scale);circle(0,0,236,type.tint);circle(0,0,263,type.color+'28',2);
  for(let j=0;j<8;j++){const angle=j*Math.PI/4+t*.12;c.save();c.translate(Math.cos(angle)*284,Math.sin(angle)*284);c.rotate(angle);rounded(-12,-2,24,4,2,type.color);c.restore();}
  c.rotate(Math.sin(a*1.3)*.02);c.drawImage(type.image,-236,-236,472,472);c.restore();
  types.forEach((item,i)=>{const x=220+i*107,y=928;circle(x,y,i===index?44:35,i===index?item.tint:'#F8F9FB');if(i===index)circle(x,y,45,item.color,2.5);c.drawImage(item.image,x-28,y-28,56,56);});
}
const scrollStops=[[0,0],[1.0,0],[3,630],[3.5,630],[5.7,1300],[6.2,1300],[8.2,1970],[8.7,1970],[10.5,2580],[11,2580],[13,3150],[14,3150]];
function scrollPosition(a){for(let i=1;i<scrollStops.length;i++){const end=scrollStops[i],start=scrollStops[i-1];if(a<=end[0])return start[1]+(end[1]-start[1])*smooth((a-start[0])/(end[0]-start[0]));}return 3150;}
function reports(a,images){const y=scrollPosition(a);animatedText('LES',58,231,69,INK,a);animatedText('RAPPORTS',58,314,69,RED,a,.1);
  const labels=['Vue d’ensemble','Évolution','Territoires','Types d’événement','Heures de signalement'];
  const active=y<840?0:y<1600?1:y<2240?2:y<2920?3:4;
  labels.forEach((label,i)=>{const top=421+i*80,on=i===active;c.save();c.globalAlpha=ease((a-i*.08)/.5);rounded(58,top,445,62,20,on?'#FFF0EF':'#F8F9FA');circle(83,top+31,4,on?RED:'#BFC5CD');text(label,102,top+40,i===4?23:25,on?INK:'#8C939F');c.restore();});
  // Motion is reconstructed from successive, overlapping screenshots of the live app.
  const sx=561,sy=111,sw=430,sh=900,ratio=sw/430;
  shadow(true);rounded(sx-8,sy-8,sw+16,sh+16,42,'#262C35');shadow(false);
  c.save();c.beginPath();c.roundRect(sx,sy,sw,sh,34);c.clip();c.fillStyle='#F7F7F7';c.fillRect(sx,sy,sw,sh);
  c.drawImage(images.report,0,Math.min(y,3150),430,900,sx,sy,sw,sh);
  // Keep the application's actual tab bar fixed while its content scrolls.
  shadow(true);rounded(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio,'#FFFFFF');shadow(false);
  c.save();c.beginPath();c.roundRect(sx+19*ratio,sy+810*ratio,392*ratio,71*ratio,34*ratio);c.clip();c.drawImage(images.first,19,810,392,71,sx+19*ratio,sy+810*ratio,392*ratio,71*ratio);c.restore();c.restore();
}
function outro(a,images){c.drawImage(images.phone,265,235,900,849);animatedText('STOP',58,227,91,INK,a);animatedText('ACCIDENT',58,329,91,RED,a,.12);c.save();c.globalAlpha=ease((a-.45)/.5);shadow(true);rounded(58,410,328,85,42,RED);shadow(false);text('SIGNALER',222,465,34,'#FFFFFF','center');c.restore();types.forEach((type,i)=>{const p=ease((a-.55-i*.08)/.4);c.save();c.globalAlpha=p;circle(90+(i%3)*95,601+Math.floor(i/3)*93,37,type.tint);c.drawImage(type.image,60+(i%3)*95,571+Math.floor(i/3)*93,60,60);c.restore();});}
const transitions=[2,6,10,14,18,22,26,30,44];
function wipe(t){for(const at of transitions){const d=t-at;if(Math.abs(d)<.22){const p=(d+.22)/.44;c.save();c.translate(-1500+p*3050,0);c.transform(1,0,-.18,1,0,0);c.fillStyle=at<30?types[Math.max(0,Math.min(6,Math.floor((at-2)/4)))].color:RED;c.fillRect(0,-50,1080,1200);c.restore();}}}
function soundtrack(){const rate=48000,N=rate*D,L=new Float64Array(N),R=new Float64Array(N);let seed=17;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
 function add(start,length,fn,pan=0){const first=Math.round(start*rate);for(let j=0;j<length*rate&&first+j<N;j++){if(first+j<0)continue;const v=fn(j/rate);L[first+j]+=v*Math.sqrt((1-pan)/2);R[first+j]+=v*Math.sqrt((1+pan)/2);}}
 const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
 for(let beat=0;beat<D*2;beat++){const at=beat*.5,ch=chords[Math.floor(at/4)%4],soft=at>=30&&at<44?.62:1;
  add(at,.3,u=>soft*.2*Math.sin(2*Math.PI*(48*u+1.4*(1-Math.exp(-u*30))))*Math.exp(-u*18)*(1-Math.exp(-u*700)));
  if(beat%2)add(at,.15,u=>soft*.043*rand()*Math.exp(-u*32)*(1-Math.exp(-u*900)));
  add(at+.25,.06,u=>soft*.02*rand()*Math.exp(-u*85));
  const note=ch[beat%3]*2;for(const[delay,gain]of[[0,1],[.18,.2],[.36,.08]])add(at+delay,.8,u=>soft*gain*.056*(Math.sin(2*Math.PI*note*u)+.16*Math.sin(4*Math.PI*note*u))*Math.exp(-u*5)*(1-Math.exp(-u*160)),beat%2?.3:-.3);
  if(beat%2===0)add(at,.8,u=>soft*.064*Math.sin(Math.PI*ch[0]*u)*Math.exp(-u*4)*(1-Math.exp(-u*100)));
 }
 for(const at of transitions)add(at-.22,.5,u=>.085*rand()*Math.pow(Math.sin(Math.PI*u/.5),2));
 for(let i=0;i<7;i++)add(2+i*4+.25,.4,u=>.085*Math.sin(2*Math.PI*(660*u+12*(1-Math.exp(-u*60))))*Math.exp(-u*12)*(1-Math.exp(-u*300)));
 let peak=0;for(let j=0;j<N;j++){const fade=smooth(j/rate/.1)*(1-smooth((j/rate-(D-1.5))/1.5));L[j]*=fade;R[j]*=fade;peak=Math.max(peak,Math.abs(L[j]),Math.abs(R[j]));}
 const gain=.68/peak,b=Buffer.alloc(44+N*4);b.write('RIFF');b.writeUInt32LE(36+N*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);for(let j=0;j<N;j++){b.writeInt16LE(Math.round(L[j]*gain*32767),44+j*4);b.writeInt16LE(Math.round(R[j]*gain*32767),46+j*4);}fs.writeFileSync(path.join(__dirname,'presentation-musique.wav'),b);
}
async function main(){
 const images={phone:await loadImage(path.join(__dirname,'../stop-accident-signaler-clair.png'))};
 for(const item of types)item.image=await loadImage(path.join(ROOT,'assets/images',item.file));
 const captures=JSON.parse(fs.readFileSync(path.join(__dirname,'rapports-captures/captures.json'),'utf8'));
 const tall=createCanvas(430,4060),tc=tall.getContext('2d');tc.fillStyle='#F7F7F7';tc.fillRect(0,0,430,4060);
 for(let i=0;i<captures.length;i++){const shot=captures[i],im=await loadImage(path.join(__dirname,'rapports-captures',shot.file));if(i===0)images.first=im;const h=i===captures.length-1?790:captures[i+1].top-shot.top;tc.drawImage(im,0,0,430,h,0,shot.top,430,h);}
 images.report=tall;fs.writeFileSync(path.join(__dirname,'rapports-captures/rapport-complet.png'),tall.toBuffer('image/png'));
 soundtrack();
 const proc=spawn(FFMPEG,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1080','-framerate',String(FPS),'-i','pipe:0','-i',path.join(__dirname,'presentation-musique.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',String(D),'-movflags','+faststart',path.join(__dirname,'stop-accident-presentation-complete.mp4')],{stdio:['pipe','ignore','pipe']});
 let err='';proc.stderr.on('data',v=>err+=v);const done=once(proc,'close');
 const board=createCanvas(2160,1620),bc=board.getContext('2d');bc.fillStyle='#FFF';bc.fillRect(0,0,2160,1620);
 const marks=[1,4,8,12,16,20,24,28,31,36,41,46];let boardIndex=0;
 for(let frame=0;frame<D*FPS;frame++){const t=frame/FPS;background(t);let color=RED;
  if(t<2)intro(t,images);else if(t<30){const index=Math.floor((t-2)/4);category(index,t-2-index*4,t);color=types[index].color;}else if(t<44)reports(t-30,images);else outro(t-44,images);
  brand(t,color);wipe(t);
  if(marks.includes(t)){bc.drawImage(canvas,boardIndex%4*540,Math.floor(boardIndex/4)*540,540,540);boardIndex++;}
  if(frame===36*FPS)fs.writeFileSync(path.join(__dirname,'presentation-rapports-apercu.png'),canvas.toBuffer('image/png'));
  const raw=c.getImageData(0,0,W,H).data;if(!proc.stdin.write(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength)))await once(proc.stdin,'drain');
 }
 proc.stdin.end();const[code]=await done;if(code!==0)throw new Error(err);fs.writeFileSync(path.join(__dirname,'presentation-storyboard.png'),board.toBuffer('image/png'));console.log('48 seconds. All 7 report types: 4 seconds each. Live reports screenshots: 14 seconds of scrolling. Stereo soundtrack.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

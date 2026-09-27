const {createCanvas,loadImage,GlobalFonts}=require('/private/tmp/stop-accident-animation-runtime/node_modules/@napi-rs/canvas');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const FFMPEG='/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
const OUT=__dirname, ROOT=path.resolve(__dirname,'../../../');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf','App');
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial Bold.ttf','Bold');
const W=1080,H=1080,FPS=30,D=20;
const cv=createCanvas(W,H),c=cv.getContext('2d');
const RED='#E53D44',INK='#202B3C',MUTED='#798393';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const spring=x=>x<=0?0:1-Math.exp(-x*7)*Math.cos(x*9);
function rr(x,y,w,h,r,fill){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
function text(s,x,y,size=32,color=INK,font='Bold',align='left'){c.font=`${size}px ${font}`;c.textAlign=align;c.textBaseline='alphabetic';c.fillStyle=color;c.fillText(s,x,y);}
function moveText(s,x,y,size,color,age,delay=0){let a=ease((age-delay)/0.55);c.save();c.globalAlpha=a;text(s,x+(1-a)*45,y+(1-a)*35,size,color);c.restore();}
function circle(x,y,r,color,line=0){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(line){c.strokeStyle=color;c.lineWidth=line;c.stroke();}else{c.fillStyle=color;c.fill();}}
function shadow(on=true){c.shadowColor=on?'rgba(30,40,60,0.10)':'transparent';c.shadowBlur=on?28:0;c.shadowOffsetY=on?12:0;}
function badge(s,x,y,w,color=RED){rr(x,y,w,44,22,color);text(s,x+w/2,y+29,19,'#FFFFFF','Bold','center');}
function backdrop(t){const photoScene=t<4||t>=16;c.fillStyle=photoScene?'#FFFFFF':'#FCFCFD';c.fillRect(0,0,W,H);const g=c.createRadialGradient(950,170,5,950,170,650);g.addColorStop(0,photoScene?'#FFFFFF':'#FFEDEE');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,W,H);for(let j=0;j<18;j++){const x=(j*127.3+Math.sin(t*0.45+j)*18)%W,y=(j*193.7+t*8)%H;circle(x,y,2+(j%3),'rgba(229,61,68,0.09)');}}
function header(index){rr(58,57,28,4,2,RED);text('STOP ACCIDENT',100,70,21);text(`0${index+1} / 05`,1020,70,16,MUTED,'App','right');}
function progress(t){for(let i=0;i<5;i++){rr(58+i*195,1025,180,4,2,'#E9E9ED');const p=clamp((t-i*4)/4);if(p>0)rr(58+i*195,1025,180*p,4,2,RED);}}
function ring(x,y,age,color=RED){for(let j=0;j<3;j++){let p=((age+j*0.46)%1.4)/1.4;c.save();c.globalAlpha=(1-p)*0.65;circle(x,y,22+p*68,color,3*(1-p)+1);c.restore();}}
function icon(kind,x,y,color,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);c.lineWidth=3;c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;
  if(kind==='pin'){circle(0,-4,13,color,3);circle(0,-4,4,color,3);c.beginPath();c.moveTo(-10,5);c.lineTo(0,23);c.lineTo(10,5);c.stroke();}
  if(kind==='list'){for(let i=0;i<3;i++){circle(-15,-13+i*13,2,color);c.beginPath();c.moveTo(-5,-13+i*13);c.lineTo(18,-13+i*13);c.stroke();}}
  if(kind==='camera'){c.beginPath();c.roundRect(-22,-13,44,32,7);c.stroke();circle(0,3,9,color,3);c.beginPath();c.moveTo(-10,-13);c.lineTo(-6,-20);c.lineTo(6,-20);c.lineTo(10,-13);c.stroke();}
  c.restore();}
function phone(img,x,y,w,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.drawImage(img,0,0,w,w*img.height/img.width);c.restore();}
function scene0(a,t,images){
  const z=1+0.025*a;phone(images.phone,210-12*a,230-8*a,940*z);
  moveText('UN',60,240,83,INK,a);moveText('ACCIDENT ?',60,337,83,RED,a,0.12);
  c.save();c.globalAlpha=ease((a-0.6)/0.5);rr(60,385,291,71,35,RED);text('Signalez-le.',205,432,32,'#FFFFFF','Bold','center');c.restore();
  const px=210-12*a+940*z*785/1292,py=230-8*a+940*z*525/1292;
  if(a>1.1){ring(px,py,a-1.1);c.save();c.globalAlpha=ease((a-1.1)/0.4);shadow();rr(px-71,py+98,142,43,20,'#FFFFFF');shadow(false);text('Accident',px,py+127,21,RED,'Bold','center');c.restore();}
}
function scene1(a,t,images){
  moveText('ACCIDENT',540-330,228,108,RED,a);
  c.save();c.translate(540,560);c.rotate(-0.045+0.018*a);const sc=0.72+0.28*spring(a);c.scale(sc,sc);
  circle(0,0,274,'#FFF0ED');circle(0,0,292,'#F7DAD6',2);
  for(let j=0;j<8;j++){const an=j*Math.PI/4+t*0.16;c.save();c.translate(Math.cos(an)*321,Math.sin(an)*321);c.rotate(an);rr(-18,-3,36,6,3,j%2?RED:'#EFAD76');c.restore();}
  c.drawImage(images.accident,-280,-280,560,560);c.restore();
  moveText('Le bon réflexe : signaler.',170,956,49,INK,a,0.5);
}
function scene2(a,t,images){
  moveText('QUEL TYPE',60,193,71,INK,a);moveText('D’ACCIDENT ?',60,277,71,RED,a,0.12);
  const items=[['Deux voitures',images.cars],['Voiture et moto',images.moto],['Voiture et piéton',images.pedestrian]];
  items.forEach(([label,img],i)=>{const p=spring(Math.max(0,a-0.4-i*0.24));if(p<=0)return;
    c.save();c.globalAlpha=clamp(p);c.translate(63+i*326,399+(1-p)*240);c.rotate((1-p)*(i-1)*0.12);
    shadow();rr(0,0,302,350,34,'#FFFFFF');shadow(false);circle(151,138,112,i===0?'#FFF0E9':'#F4F7F8');c.drawImage(img,38,25,226,226);
    text(label,151,291,25,INK,'Bold','center');c.restore();});
  c.save();c.globalAlpha=ease((a-1.6)/0.4);badge('7 types d’accident',365,844,350);c.restore();
}
function scene3(a,t,images){
  moveText('LES INFOS',60,192,74,INK,a);moveText('QUI COMPTENT.',60,278,74,RED,a,0.12);
  const items=[['Localisez','pin'],['Décrivez','list'],['Ajoutez des photos','camera']];
  items.forEach(([label,kind],i)=>{const age=a-0.3-i*0.7,p=ease(age/0.4);if(p<=0)return;
    const y=361+i*180,active=Math.min(2,Math.floor(Math.max(0,a-0.3)/0.7))===i;
    c.save();c.globalAlpha=p;c.translate((1-p)*-100,0);shadow();rr(60,y,960,141,31,active?'#FFF0EE':'#FFFFFF');shadow(false);
    circle(135,y+70,40,active?RED:'#F0F2F5');icon(kind,135,y+69,active?'#FFFFFF':MUTED,1.0);
    text(label,215,y+85,43);text(`0${i+1}`,969,y+84,31,active?RED:'#B9C0C9','Bold','right');c.restore();});
}
function scene4(a,t,images){
  phone(images.phone,240-8*a,177,970+8*a);
  moveText('STOP',60,230,99,INK,a);moveText('ACCIDENT',60,340,99,RED,a,0.12);
  c.save();c.globalAlpha=ease((a-0.5)/0.4);shadow();rr(60,430,418,93,46,RED);shadow(false);text('SIGNALER UN ACCIDENT',269,487,25,'#FFFFFF','Bold','center');c.restore();
  c.save();c.globalAlpha=ease((a-0.85)/0.4);text('Chaque signalement compte.',60,587,28,INK);c.restore();
}
function transition(t){for(const b of [4,8,12,16]){const d=t-b;if(Math.abs(d)<0.27){let p=(d+0.27)/0.54;c.save();c.translate(-1450+2900*p,0);c.transform(1,0,-0.2,1,0,0);c.fillStyle=RED;c.fillRect(0,-50,1050,1200);c.fillStyle='#F8B3B4';c.fillRect(-75,-50,36,1200);c.restore();}}}
function audio(){const sr=48000,N=sr*D,L=new Float64Array(N),R=new Float64Array(N);let seed=82;const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
  function event(start,len,fn,pan=0){let p=Math.round(start*sr);for(let j=0;j<len*sr&&p+j<N;j++){if(p+j<0)continue;const v=fn(j/sr);L[p+j]+=v*Math.sqrt((1-pan)/2);R[p+j]+=v*Math.sqrt((1+pan)/2);}}
  const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[261.63,329.63,392]];
  for(let beat=0;beat<40;beat++){const tm=beat*.5,notes=chords[Math.floor(tm/4)];
    event(tm,0.3,u=>0.23*Math.sin(2*Math.PI*(48*u+1.55*(1-Math.exp(-u*28))))*Math.exp(-u*18)*(1-Math.exp(-u*700)));
    if(beat%2)event(tm,0.15,u=>0.055*noise()*Math.exp(-u*32)*(1-Math.exp(-u*900)));
    event(tm+.25,0.06,u=>0.024*noise()*Math.exp(-u*90));
    const note=notes[beat%3]*2;
    for(const [delay,gain]of[[0,1],[.18,.22],[.36,.1]])event(tm+delay,0.8,u=>gain*0.058*(Math.sin(2*Math.PI*note*u)+.2*Math.sin(4*Math.PI*note*u))*Math.exp(-u*5)*(1-Math.exp(-u*180)),beat%2?.3:-.3);
    if(beat%2===0)event(tm,0.8,u=>0.07*Math.sin(2*Math.PI*notes[0]/2*u)*Math.exp(-u*4)*(1-Math.exp(-u*100)));
  }
  for(const b of [4,8,12,16])event(b-.25,.55,u=>0.11*noise()*Math.pow(Math.sin(Math.PI*u/.55),2),.1);
  for(const [tm,f]of[[1.1,880],[8.4,523],[8.64,659],[8.88,784],[12.3,523],[13,659],[13.7,784],[16.5,1046]])event(tm,.45,u=>0.105*Math.sin(2*Math.PI*(f*u+14*(1-Math.exp(-u*55))))*Math.exp(-u*13)*(1-Math.exp(-u*350)),0);
  let peak=0;for(let j=0;j<N;j++){let fade=smooth(j/sr/.12)*(1-smooth((j/sr-18.7)/1.3));L[j]*=fade;R[j]*=fade;peak=Math.max(peak,Math.abs(L[j]),Math.abs(R[j]));}
  const gain=.72/peak,b=Buffer.alloc(44+N*4);b.write('RIFF');b.writeUInt32LE(36+N*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*4,40);for(let j=0;j<N;j++){b.writeInt16LE(Math.round(L[j]*gain*32767),44+j*4);b.writeInt16LE(Math.round(R[j]*gain*32767),46+j*4);}fs.writeFileSync(path.join(OUT,'accident-musique.wav'),b);}
async function main(){const images={};for(const[k,p]of Object.entries({phone:'mockups/stop-accident-signaler-clair.png',accident:'images/report-illustrations/accident.png',cars:'images/accident-types/two-cars.png',moto:'images/accident-types/car-motorcycle.png',pedestrian:'images/accident-types/car-pedestrian.png'}))images[k]=await loadImage(path.join(ROOT,'assets',p));
  audio();
  const proc=spawn(FFMPEG,['-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1080','-framerate',String(FPS),'-i','pipe:0','-i',path.join(OUT,'accident-musique.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',String(D),'-movflags','+faststart',path.join(OUT,'stop-accident-dynamique.mp4')],{stdio:['pipe','ignore','pipe']});
  let err='';proc.stderr.on('data',x=>err+=x);const done=once(proc,'close');
  const scenes=[scene0,scene1,scene2,scene3,scene4];
  const board=createCanvas(1620,1080),bc=board.getContext('2d');let bidx=0;
  for(let i=0;i<FPS*D;i++){const t=i/FPS,index=Math.min(4,Math.floor(t/4)),a=t-index*4;backdrop(t);scenes[index](a,t,images);header(index);progress(t);transition(t);
    if([75,180,300,420,540].includes(i)){bc.drawImage(cv,(bidx%3)*540,Math.floor(bidx/3)*540,540,540);bidx++;}
    if(i===300)fs.writeFileSync(path.join(OUT,'accident-apercu.png'),cv.toBuffer('image/png'));
    const raw=c.getImageData(0,0,W,H).data;if(!proc.stdin.write(Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength)))await once(proc.stdin,'drain');
  }
  proc.stdin.end();const[code]=await done;if(code!==0)throw new Error(err);
  fs.writeFileSync(path.join(OUT,'accident-storyboard.png'),board.toBuffer('image/png'));console.log('Rendered 20 seconds, five scenes, stereo original music and synchronized effects.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

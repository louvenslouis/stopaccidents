const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Original synthesized bubble sounds, aligned with the three animation cues.
const rate = 48000;
const duration = 12;
const tracks = [new Float64Array(rate * duration), new Float64Array(rate * duration)];
const cues = [{time:0.6, note:523.251, pan:-0.18}, {time:3.0, note:659.255, pan:0}, {time:5.4, note:783.991, pan:0.18}];
for (const cue of cues) {
  for (const [delay, level] of [[0,1],[0.075,0.16],[0.145,0.08]]) {
    for (let i=0; i<rate*0.8; i++) {
      const t=i/rate;
      const envelope=(1-Math.exp(-t/0.004))*Math.exp(-t/0.115)*Math.min(1,(0.8-t)/0.08);
      const phase=2*Math.PI*(cue.note*t+18*(1-Math.exp(-t/0.018)));
      const sample=level*envelope*(0.21*Math.sin(phase)+0.045*Math.sin(phase*2)*Math.exp(-t/0.07));
      const index=Math.round((cue.time+delay)*rate)+i;
      if(index<tracks[0].length) {
        tracks[0][index]+=sample*Math.sqrt((1-cue.pan)/2);
        tracks[1][index]+=sample*Math.sqrt((1+cue.pan)/2);
      }
    }
  }
}
const bytes=tracks[0].length*4;
const wav=Buffer.alloc(44+bytes);
wav.write('RIFF',0);wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(bytes,40);
let peak=0;
for(let i=0;i<tracks[0].length;i++) for(let channel=0;channel<2;channel++) {
  const sample=tracks[channel][i];peak=Math.max(peak,Math.abs(sample));
  wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*4+channel*2);
}
const soundtrack=path.join(__dirname,'bulles-son.wav');
fs.writeFileSync(soundtrack,wav);
execFileSync('/private/tmp/stop-accident-animation-runtime/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg',[
  '-hide_banner','-loglevel','error','-y','-i',path.join(__dirname,'stop-accident-animation.mp4'),
  '-i',soundtrack,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k',
  '-t','12','-movflags','+faststart',path.join(__dirname,'stop-accident-animation-avec-son.mp4')
]);
console.log(`12 seconds; stereo 48 kHz; cues at 0.6, 3.0, 5.4 s; peak ${(20*Math.log10(peak)).toFixed(1)} dBFS.`);

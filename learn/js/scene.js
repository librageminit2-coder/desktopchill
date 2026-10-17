// Nền động: biển mây nhìn từ trên cao, vẽ bằng WebGL (shader), lặp vô tận.
// Ban ngày: bình minh ấm. Ban đêm: biển mây dưới ánh trăng, trời sao.
// Vẽ ở độ phân giải thấp rồi phóng to (mây vốn mềm nên không mất nét), giới hạn 30 khung/giây,
// dừng khi tab ẩn, chỉ vẽ một khung khi bật "giảm chuyển động".
const cv = document.querySelector('.scene canvas.sky');
const scene = document.querySelector('.scene');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;
uniform vec2 R;uniform float T;uniform float N;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
float fbmB(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*(1.-abs(2.*n(p)-1.));p=m*p;a*=.5;}return v;}
float fbm3(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/R; float asp=R.x/R.y; float x=(uv.x-.5)*asp;
 float H=.40; // đường chân trời
 // màu trời: ngày (bình minh) / đêm
 vec3 dTop=vec3(.16,.36,.66), dMid=vec3(.50,.68,.88), dHor=vec3(1.,.83,.66);
 vec3 nTop=vec3(.012,.018,.06), nMid=vec3(.04,.06,.16), nHor=vec3(.16,.16,.30);
 vec3 top=mix(dTop,nTop,N), mid=mix(dMid,nMid,N), hor=mix(dHor,nHor,N);
 vec2 sp=vec2(.26*asp,H+.045); // mặt trời / trăng
 float sy=max(uv.y-H,0.);
 vec3 sky=mix(hor,mid,smoothstep(0.,.22,sy)); sky=mix(sky,top,smoothstep(.18,.62,sy));
 float sd=length(vec2(x,uv.y)-sp);
 vec3 sunC=mix(vec3(1.,.78,.5),vec3(.75,.8,1.),N);
 sky+=sunC*(mix(.42,.22,N)*exp(-sd*mix(7.,9.,N))+mix(.22,.12,N)*exp(-sd*2.));
 sky+=mix(vec3(1.,.97,.9),vec3(.95,.96,1.),N)*smoothstep(mix(.032,.022,N),mix(.026,.016,N),sd);
 // sao
 if(N>.01){vec2 g=gl_FragCoord.xy/2.2;vec2 c=floor(g);float s=h(c);
  float tw=.6+.4*sin(T*1.7+s*40.);float st=step(.9965,s)*tw*smoothstep(.03,.25,sy);
  sky+=N*st*vec3(1.,.97,.9)*(1.-smoothstep(.0,.9,length(fract(g)-.5)*2.));}
 // mây ti mỏng trên cao
 vec2 cq=vec2(x*.9,1.)/(sy+.18); cq.x+=T*.012;
 float ci=smoothstep(.55,.95,fbm3(vec2(cq.x*.5,cq.y*2.5)+fbm3(cq*.7)*.5));
 sky=mix(sky,mix(vec3(1.,.95,.92),vec3(.35,.38,.55),N),ci*.35*smoothstep(.0,.15,sy)*(1.-smoothstep(.35,.6,sy)));
 vec3 col=sky;
 // biển mây phía dưới: mặt phẳng phối cảnh, trôi về phía người xem
 if(uv.y<H+.02){
  float dy=max(H-uv.y,.0015); float z=.32/dy;
  vec2 q=vec2(x*z,z*1.25)*1.25; q.y+=T*.09; q.x+=T*.01;
  vec2 w=vec2(fbm3(q*.3+T*.008),fbm3(q*.3+3.1));
  vec2 o=vec2((sp.x-x)*.03,.07);
  float d=.55*fbm(q*.45+w*1.3)+.45*fbmB(q*1.05+w*.6);
  float d2=.55*fbm((q+o)*.45+w*1.3)+.45*fbmB((q+o)*1.05+w*.6);
  float far=smoothstep(.0,.07,dy); d=mix(.5,d,far); d2=mix(.5,d2,far);
  float dens=smoothstep(.36,.74,d);
  float sh=clamp(.55+(d-d2)*9.,0.,1.);
  vec3 lit=mix(vec3(1.,.94,.86),vec3(.74,.80,.98),N);
  vec3 dk=mix(vec3(.47,.53,.70),vec3(.05,.07,.16),N);
  vec3 cc=mix(dk,lit,clamp(sh*.8+dens*.35,0.,1.));
  cc*=.78+.22*dens;
  cc+=sunC*mix(.30,.14,N)*exp(-abs(x-sp.x)*2.4)*smoothstep(.22,0.,dy)*sh;
  vec3 sea=cc;
  float haze=exp(-dy*mix(14.,10.,N));
  sea=mix(sea,hor*mix(1.,1.15,N),haze*.85);
  col=mix(sea,sky,smoothstep(H-.004,H+.012,uv.y));
 }
 // vignette nhẹ + nhiễu hạt chống loang màu
 float vg=1.-.22*length((uv-.5)*vec2(1.,.8));
 col*=vg; col+=(h(gl_FragCoord.xy+fract(T))-.5)/255.*3.;
 gl_FragColor=vec4(col,1.);
}`;

let gl, prog, uR, uT, uN, nightNow = 0, nightTarget = 0, last = 0, raf = 0, scale = 0.5, t0 = performance.now();
const isDark = () => document.documentElement.dataset.theme === 'dark';

function init() {
  gl = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  uR = gl.getUniformLocation(prog, 'R'); uT = gl.getUniformLocation(prog, 'T'); uN = gl.getUniformLocation(prog, 'N');
  return true;
}
function size() {
  scale = innerWidth < 700 ? 0.42 : innerWidth > 2200 ? 0.38 : 0.5;
  cv.width = Math.max(2, Math.round(innerWidth * scale)); cv.height = Math.max(2, Math.round(innerHeight * scale));
  gl.viewport(0, 0, cv.width, cv.height);
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < 33) return; last = now;
  nightNow += (nightTarget - nightNow) * 0.06;
  gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, (now - t0) / 1000); gl.uniform1f(uN, nightNow);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function drawOnce() { gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, 20); gl.uniform1f(uN, nightNow); gl.drawArrays(gl.TRIANGLES, 0, 3); }
function start() { cancelAnimationFrame(raf); if (still) drawOnce(); else raf = requestAnimationFrame(frame); }

let ok = false;
try { ok = cv && init(); } catch (e) { ok = false; }
if (ok) {
  nightTarget = nightNow = isDark() ? 1 : 0;
  size(); start(); scene.classList.add('gl');
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); if (still) drawOnce(); }, 150); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  new MutationObserver(() => { nightTarget = isDark() ? 1 : 0; if (still) { nightNow = nightTarget; drawOnce(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); scene.classList.remove('gl'); });
}

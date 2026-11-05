// Splash scene renderer. Runs inside a Worker on an OffscreenCanvas (so it keeps animating while the main
// thread parses and boots the app bundle), or on the main thread as a fallback (loaded by public/splash.js).
// Procedural Earth with axial tilt and spin, clouds, city lights, Rayleigh limb, starfield, and two raymarched
// satellites on inclined orbits with fading trails. ACES tonemap + vignette + dither.
function splashScene(cv, st, ready) {
  var gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return;
  var VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  var FS = [
    "#define O " + 4,
    "precision highp float;uniform vec2 R;uniform float T,A,D;",
    "const vec3 C=vec3(0.,-1.25,0.);const float ER=1.,SC=1.6;vec3 L;",
    "float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
    "float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1.,0.,0.)),f.x),mix(h(i+vec3(0.,1.,0.)),h(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(h(i+vec3(0.,0.,1.)),h(i+vec3(1.,0.,1.)),f.x),mix(h(i+vec3(0.,1.,1.)),h(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}",
    "float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<O;i++){s+=a*n(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}",
    "mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}",
    "mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}",
    "vec3 earth(vec3 nr,vec3 rd){",
    " vec3 tn=rz(.41)*nr;vec3 q=ry(T*.16)*tn;vec3 w=q*1.8+.6*vec3(n(q*2.),n(q*2.+5.2),0.);",
    " float c=fbm(w),d=fbm(q*6.),lat=abs(tn.y);float land=smoothstep(.535,.55,c+.05*n(q*14.));",
    " vec3 lc=mix(vec3(.04,.11,.035),vec3(.46,.37,.22),smoothstep(.4,.7,d+.35*smoothstep(.45,.15,abs(lat-.3))));",
    " lc=mix(lc,vec3(.22,.19,.15),smoothstep(.6,.7,c)*.6);",
    " vec3 oc=mix(vec3(.002,.016,.06),vec3(.015,.09,.17),smoothstep(.44,.54,c));",
    " float ice=smoothstep(.87,.92,lat+.05*(d-.5));vec3 col=mix(mix(oc,lc,land),vec3(.85,.9,.97),ice);",
    " vec3 cq=ry(T*.2)*tn;float cl=smoothstep(.52,.74,fbm(cq*3.+1.4*n(cq*2.5+vec3(T*.01))));",
    " col*=1.-.4*cl;",
    " float dl=dot(nr,L),df=max(dl,0.);vec3 hv=normalize(L-rd);float nh=max(dot(nr,hv),0.);",
    " float sp=(pow(nh,240.)*3.+pow(nh,10.)*.05)*(1.-land)*(1.-ice)*(1.-cl)*smoothstep(0.,.15,dl);",
    " vec3 warm=mix(vec3(1.),vec3(1.,.55,.35),smoothstep(.3,.02,dl)*.7);",
    " vec3 lit=col*df*1.35*warm+col*.012+vec3(1.,.93,.8)*sp;",
    " lit=mix(lit,vec3(.95,.96,1.)*(df*1.25*warm+.012),cl);",
    " float city=land*(1.-ice)*(1.-cl)*smoothstep(.8,.95,n(q*170.))*smoothstep(.45,.62,n(q*5.+3.));",
    " lit+=vec3(1.,.62,.28)*city*smoothstep(.05,-.18,dl)*2.;",
    " float mu=max(dot(nr,-rd),0.),day=smoothstep(-.25,.45,dl);",
    " lit=mix(lit,vec3(.3,.52,1.)*(df+.03),pow(1.-mu,2.2)*.45*day);",
    " lit+=vec3(.35,.6,1.)*pow(1.-mu,5.)*day*1.4;",
    " return lit;}",
    "float bx(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.);}",
    "float sat(vec3 p,out float m){float b=bx(p,vec3(.018,.02,.026))-.002;m=0.;",
    " float a=T*.4;vec3 r=vec3(abs(p.x)-.072,p.y*cos(a)-p.z*sin(a),p.y*sin(a)+p.z*cos(a));",
    " float pn=bx(r,vec3(.048,.0012,.02));if(pn<b){b=pn;m=1.;}",
    " float rod=bx(p,vec3(.026,.0018,.0018));if(rod<b){b=rod;m=2.;}",
    " float dish=length(p-vec3(0.,-.03,0.))-.011;if(dish<b){b=dish;m=2.;}return b;}",
    "float S2(vec3 p,out float m){return sat(p/SC,m)*SC;}",
    "void orb(vec3 ro,vec3 rd,float th,float ia,float Ro,float k,float te,inout vec3 col,inout float al){",
    " float yw=k*.9;vec3 u=vec3(cos(yw),0.,sin(yw)),v=vec3(0.,-sin(ia),0.)+cos(ia)*vec3(-sin(yw),0.,cos(yw)),pn=cross(u,v);",
    " float dn=dot(rd,pn);if(abs(dn)>1e-4){float tp=dot(C-ro,pn)/dn;if(tp>0.&&tp<te){vec3 P=ro+rd*tp-C;",
    "  float ang=atan(dot(P,v),dot(P,u)),tr=fract((th-ang)/6.2831853);",
    "  float ln=exp(-abs(length(P)-Ro)*900.)*(.12+.9*pow(1.-tr,6.));",
    "  vec3 oc=mix(vec3(.45,.6,1.),vec3(1.,.75,.45),k);col+=oc*ln*.8;al=max(al,min(ln,1.));}}",
    " vec3 S=C+(cos(th)*u+sin(th)*v)*Ro;",
    " col+=mix(vec3(.45,.6,1.),vec3(1.,.75,.45),k)*exp(-length(cross(rd,S-ro))*140.)*.25*step(dot(S-ro,rd),te);",
    " vec3 up=normalize(S-C),fw=normalize(-sin(th)*u+cos(th)*v),rt=normalize(cross(up,fw));fw=cross(rt,up);",
    " vec3 os=ro-S;float sb=dot(os,rd),sh=sb*sb-(dot(os,os)-.045);",
    " if(sh>0.){float t=max(-sb-sqrt(sh),0.),m=0.;for(int i=0;i<40;i++){vec3 w=ro+rd*t-S;vec3 lp=vec3(dot(w,rt),dot(w,up),dot(w,fw));",
    "  float d=S2(lp,m);if(d<.0005){if(t<te){vec2 e=vec2(.0008,0.);float m2;",
    "   vec3 ln=normalize(vec3(S2(lp+e.xyy,m2)-S2(lp-e.xyy,m2),S2(lp+e.yxy,m2)-S2(lp-e.yxy,m2),S2(lp+e.yyx,m2)-S2(lp-e.yyx,m2)));",
    "   vec3 wn=normalize(rt*ln.x+up*ln.y+fw*ln.z);",
    "   float sd=dot(S-C,L),sr=length((S-C)-L*sd),lit=(sd<0.&&sr<ER)?0.:1.;",
    "   float df=max(dot(wn,L),0.)*lit,sp=pow(max(dot(reflect(-L,wn),-rd),0.),m==1.?90.:24.)*lit;",
    "   vec3 sl=lp/SC;vec3 alb=m==1.?vec3(.04,.07,.25)+vec3(.12,.15,.3)*step(.86,fract(sl.x*90.)):m==2.?vec3(.7):vec3(.85,.62,.2)*(.75+.5*n(sl*400.));",
    "   vec3 amb=vec3(.04,.07,.14)*(.5+.5*dot(wn,up));",
    "   col=alb*(df*1.6+amb+.05)+vec3(1.,.95,.85)*sp*(m==1.?1.8:.9);",
    "   col+=vec3(1.,.2,.15)*step(.5,fract(T*.8+k*.37))*smoothstep(.01,.004,length(lp-vec3(.026,-.029,.035)))*3.;al=1.;}break;}",
    "  t+=d;if(t>-sb+.25)break;}}}",
    "void main(){",
    " L=normalize(vec3(-.8,.5,.15));",
    " vec2 uv=gl_FragCoord.xy/R,p=(gl_FragCoord.xy-.5*R)/R.y;",
    " vec3 ro=vec3(.06*sin(T*.08),.02*sin(T*.11),-3.),rd=normalize(vec3(p,1.8));",
    " vec3 col=vec3(0.);float al=0.,te=1e9;",
    " vec2 g=floor(p*140.),f=fract(p*140.)-.5;float sh_=h(vec3(g,7.));",
    " vec2 o=vec2(h(vec3(g,3.)),h(vec3(g,5.)))-.5;",
    " float st=step(.982,sh_)*smoothstep(.22,0.,length(f-o*.5))*(.55+.45*sin(T*2.+sh_*90.));",
    " col+=vec3(.85,.9,1.)*st*D*1.2;al=st*D;",
    " vec3 oc=ro-C;float bb=dot(oc,rd),cc=dot(oc,oc)-ER*ER,hh=bb*bb-cc;",
    " float dc=sqrt(max(dot(oc,oc)-bb*bb,0.));vec3 cp=normalize(ro-rd*bb-C);",
    " float cl=dot(cp,L);vec3 gc=mix(vec3(1.,.45,.2),vec3(.3,.55,1.),smoothstep(-.15,.25,cl));",
    " float glow=exp(-max(dc-ER,0.)*16.)*smoothstep(-.4,.5,cl)*.85+exp(-max(dc-ER,0.)*90.)*smoothstep(-.2,.4,cl)*.6;",
    " if(hh>0.&&-bb>0.){te=-bb-sqrt(hh);vec3 nr=normalize(ro+rd*te-C);col=earth(nr,rd)+gc*exp(-(ER-dc)*60.)*smoothstep(-.2,.4,cl)*.5;al=1.;}",
    " else{col=col*(1.-min(glow,1.))+gc*glow;al=max(al,min(glow,1.));}",
    " orb(ro,rd,T*.45,.95,ER+.14,0.,te,col,al);",
    " orb(ro,rd,2.-T*.32,.7,ER+.3,1.,te,col,al);",
" col+=vec3(1.,.9,.75)*exp(-length(p-vec2(-.95,.6))*4.)*.12*D;",
    " col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);",
    " col*=1.-.35*D*dot(uv-.5,uv-.5);",
    " col=pow(clamp(col,0.,1.),vec3(.4545))+(h(vec3(gl_FragCoord.xy,fract(T)*91.))-.5)/255.;",
    " al=clamp(max(al,max(col.r,max(col.g,col.b))),0.,1.)*A;gl_FragColor=vec4(col*A,al);}"
  ].join("\n");
  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[splash]", gl.getShaderInfoLog(s));
    return s;
  }
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn("[splash]", gl.getProgramInfoLog(pr)); return; }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pr, "R"), uT = gl.getUniformLocation(pr, "T"), uA = gl.getUniformLocation(pr, "A"), uD = gl.getUniformLocation(pr, "D");
  var raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (f) { return setTimeout(function () { f(performance.now()); }, 16); };
  // Render at most ~480px tall (CSS upscales; the scene is soft anyway) and at most 30fps.
  var q = 1, t0 = 0, last = 0, slow = 0, shown = false, prev = 0;
  function frame(now) {
    if (st.stop) { var x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); return; }
    if (!t0) t0 = now;
    if (prev && now - prev < 30) { raf(frame); return; }
    prev = now;
    var s = (now - t0) / 1000, dt = last ? now - last : 16; last = now;
    // Adaptive resolution: drop render scale while frames run slow (> ~22ms), floor at 0.5.
    if (dt > 45 && s > 0.5) { if (++slow > 8 && q > 0.5) { q = Math.max(0.5, q - 0.15); slow = 0; } } else slow = 0;
    var k = Math.min(1, 480 / Math.max(st.h, 1)) * q, w = Math.max(1, Math.round(st.w * k)), h = Math.max(1, Math.round(st.h * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uR, w, h);
    gl.uniform1f(uT, s + 6);
    gl.uniform1f(uA, st.calm ? 1 : Math.min(s / 0.9, 1));
    gl.uniform1f(uD, st.d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!shown) { shown = true; ready(); }
    if (!st.calm) raf(frame);
  }
  raf(frame);
}
if (typeof window === "undefined") {
  var st;
  onmessage = function (e) {
    if (e.data.cv) { st = e.data.st; splashScene(e.data.cv, st, function () { postMessage(1); }); }
    else for (var k in e.data) st[k] = e.data[k];
  };
}

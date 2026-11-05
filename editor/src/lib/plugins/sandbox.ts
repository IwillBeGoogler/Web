/**
 * The document a plugin runs in: a sandboxed iframe (`sandbox="allow-scripts"`, so a unique opaque origin: no cookies, no storage,
 * no access to the app) with a CSP that forbids every network request and every external resource. The only channel out is
 * postMessage to the host, which validates every call (see host.ts).
 */
export const SANDBOX_ATTR = 'allow-scripts';
export const PLUGIN_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

const BOOTSTRAP = `(function(){
var pending={},seq=0;
function call(method,params){return new Promise(function(res,rej){var id=++seq;pending[id]={res:res,rej:rej};parent.postMessage({sdd:1,id:id,method:method,params:params},'*');});}
window.addEventListener('message',function(e){
 if(e.source!==parent)return;var m=e.data;if(!m||m.sdd!==1)return;
 if(m.event==='run'){Promise.resolve().then(function(){return typeof window.run==='function'?window.run(m.args):undefined;}).then(function(v){parent.postMessage({sdd:1,event:'result',ok:true,value:v},'*');},function(err){parent.postMessage({sdd:1,event:'result',ok:false,error:String(err&&err.message||err)},'*');});return;}
 var p=pending[m.id];if(!p)return;delete pending[m.id];
 if(m.ok)p.res(m.result);else{var x=new Error(m.error&&m.error.message||'error');x.code=m.error&&m.error.code;p.rej(x);}
});
var api={};['getSelection','getNodes','createNodes','updateNodes','showPanel','notify'].forEach(function(k){api[k]=function(p){return call(k,p);};});
window.sdd=Object.freeze(api);
parent.postMessage({sdd:1,event:'ready'},'*');
})();`;

/** make arbitrary code safe to put inside a <script> element */
const safeScript = (code: string): string => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

export function buildSandboxDoc(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}"></head><body><script>${BOOTSTRAP}</script><script>${safeScript(code)}</script></body></html>`;
}

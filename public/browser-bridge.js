// public/browser-bridge.js
// Injected into every proxied page.
// Supports: ghost cursor (Bézier), human-mimicry typing, sectioned content
// extraction, proximity element finding, and the Swarm visual overlay.

(function () {
  'use strict';

  // ── Slave colour palette ──────────────────────────────────────────────────
  var SLAVE_COLORS = { 1: '#3b82f6', 2: '#22c55e', 3: '#f59e0b' };
  var SLAVE_LABELS = { 1: 'NAVIGATING', 2: 'EXTRACTING', 3: 'TYPING' };

  // ── Overlay markers ───────────────────────────────────────────────────────
  var markerRoot = null;
  function ensureMarkerRoot() {
    if (markerRoot && document.body.contains(markerRoot)) return markerRoot;
    markerRoot = document.createElement('div');
    markerRoot.id = '__tl_markers__';
    markerRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;';
    document.body.appendChild(markerRoot);
    return markerRoot;
  }
  function showMarker(x, y, slave) {
    var root  = ensureMarkerRoot();
    var color = SLAVE_COLORS[slave] || '#fff';
    var label = SLAVE_LABELS[slave] || 'WORKING';
    var ring  = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:'+(x-18)+'px;top:'+(y-18)+'px;width:36px;height:36px;border-radius:50%;border:2px solid '+color+';box-shadow:0 0 12px '+color+';animation:tlPulse 0.6s ease-out forwards;';
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:'+(x-5)+'px;top:'+(y-5)+'px;width:10px;height:10px;border-radius:50%;background:'+color+';box-shadow:0 0 8px '+color+';';
    var badge = document.createElement('div');
    badge.textContent = label;
    badge.style.cssText = 'position:absolute;left:'+(x+14)+'px;top:'+(y-8)+'px;font:700 10px/1 monospace;color:#fff;background:'+color+';padding:3px 6px;border-radius:3px;letter-spacing:.08em;';
    root.appendChild(ring); root.appendChild(dot); root.appendChild(badge);
    for (var i = 0; i < 6; i++) {
      var p = document.createElement('div');
      var angle = (i/6)*Math.PI*2;
      var dist  = 24+Math.random()*16;
      p.style.cssText = 'position:absolute;left:'+(x-3+Math.cos(angle)*dist)+'px;top:'+(y-3+Math.sin(angle)*dist)+'px;width:6px;height:6px;border-radius:50%;background:'+color+';opacity:.8;animation:tlSpark .5s ease-out '+(i*.05)+'s forwards;';
      root.appendChild(p);
    }
    setTimeout(function() {
      [ring,dot,badge].forEach(function(el){el.style.opacity='0';el.style.transition='opacity .4s';});
      setTimeout(function(){[ring,dot,badge].forEach(function(el){try{root.removeChild(el);}catch(_){}});},400);
    },1500);
  }
  function clearAllMarkers() { if (markerRoot) markerRoot.innerHTML=''; }
  (function injectStyles() {
    if (document.getElementById('__tl_styles__')) return;
    var s = document.createElement('style');
    s.id = '__tl_styles__';
    s.textContent = '@keyframes tlPulse{0%{transform:scale(.5);opacity:1}100%{transform:scale(2.5);opacity:0}}@keyframes tlSpark{0%{transform:translate(0,0) scale(1);opacity:.8}100%{transform:translate(0,8px) scale(0);opacity:0}}';
    (document.head||document.documentElement).appendChild(s);
  })();

  // ── Ghost Cursor — Bézier curve mouse movement ────────────────────────────
  // Simulates a human moving the mouse from a random position to the target
  // via a cubic Bézier curve with randomised control points.
  // Dispatches real mousemove events at 8-20ms intervals so bot-detection
  // heuristics (LinkedIn, Cloudflare, etc.) see organic mouse trajectories.

  function bezier(p0,p1,p2,p3,t){
    var mt=1-t;
    return {
      x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
    };
  }

   function ghostMoveTo(tx, ty, callback) {
    var sx = Math.random()*window.innerWidth;
    var sy = Math.random()*window.innerHeight;
    var cp1 = { x: sx+(tx-sx)*.3+(Math.random()-.5)*120, y: sy+(Math.random()-.5)*180 };
    var cp2 = { x: tx-(tx-sx)*.3+(Math.random()-.5)*120, y: ty+(Math.random()-.5)*180 };
    var steps = 30+Math.floor(Math.random()*25);
    var prev  = { x: sx, y: sy };
    var i = 0;
    function step() {
      if (i > steps) { callback && callback(); return; }
      var pos = bezier({x:sx,y:sy}, cp1, cp2, {x:tx,y:ty}, i/steps);
      document.dispatchEvent(new MouseEvent('mousemove',{
        clientX:pos.x, clientY:pos.y,
        movementX:pos.x-prev.x, movementY:pos.y-prev.y,
        bubbles:true, cancelable:true,
      }));
      // Post ghost trace progress to parent for logging
      try {
        window.parent.postMessage({
          bridge: 'VBROWSER',
          type: 'ghost_trace',
          progress: i / steps,
          from: { x: sx, y: sy },
          to: { x: tx, y: ty },
          current: { x: pos.x, y: pos.y },
        }, '*');
      } catch(_) {}
      prev = pos; i++;
      setTimeout(step, 8+Math.random()*12);
    }
    step();
  }

  function ghostClick(el, slave, callback) {
    var rect = el.getBoundingClientRect();
    var tx = rect.left + rect.width/2  + (Math.random()-.5)*Math.min(rect.width*.3,8);
    var ty = rect.top  + rect.height/2 + (Math.random()-.5)*Math.min(rect.height*.3,4);
    showMarker(tx, ty, slave || 1);
    ghostMoveTo(tx, ty, function() {
      el.scrollIntoView({behavior:'instant', block:'center'});
      el.focus();
      el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true,clientX:tx,clientY:ty}));
      el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true,clientX:tx,clientY:ty}));
      setTimeout(function() {
        el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:tx,clientY:ty}));
        setTimeout(function() {
          el.dispatchEvent(new MouseEvent('mouseup',  {bubbles:true,cancelable:true,clientX:tx,clientY:ty}));
          el.dispatchEvent(new MouseEvent('click',    {bubbles:true,cancelable:true,clientX:tx,clientY:ty}));
          callback && callback({ ok:true, clicked:(el.innerText||el.value||el.tagName||'').trim().slice(0,60) });
        }, 60+Math.random()*80);
      }, 40+Math.random()*60);
    });
  }

  // ── Ghost Typing — authentic keyboard sequence ─────────────────────────────
  function humanTypeChar(el, ch) {
    var code = ch.charCodeAt(0);
    var opts = {key:ch, code:'Key'+ch.toUpperCase(), keyCode:code, which:code, bubbles:true, cancelable:true};
    el.dispatchEvent(new KeyboardEvent('keydown',  opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    var nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    var nativeArea  = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    var native = nativeInput || nativeArea;
    if (native && native.set) { native.set.call(el, el.value+ch); }
    else { el.value += ch; }
    el.dispatchEvent(new Event('input',  {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }
  function humanType(el, text, onDone) {
    if (!text||!el) { onDone&&onDone(true); return; }
    el.focus(); el.value='';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    var i=0;
    function next() {
      if (i>=text.length) { onDone&&onDone(true); return; }
      humanTypeChar(el, text[i++]);
      var delay = 40+Math.random()*80;
      if (Math.random()<.02) delay += 300+Math.random()*400; // hesitation
      setTimeout(next, delay);
    }
    next();
  }

  // ── Element finders ───────────────────────────────────────────────────────
  function findClickable(text, ariaLabel, selector) {
    var el = null;
    if (text) {
      var lower = text.toLowerCase().trim();
      var candidates = document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"],[tabindex="0"]');
      for (var i=0; i<candidates.length; i++) {
        var c = candidates[i];
        var t = (c.innerText||c.value||c.textContent||'').trim().toLowerCase();
        if (t===lower||t.includes(lower)||lower.includes(t)) { el=c; break; }
      }
    }
    if (!el&&ariaLabel) {
      var al=ariaLabel.toLowerCase();
      el=document.querySelector('[aria-label="'+ariaLabel+'"]')||document.querySelector('[aria-label*="'+al+'"]');
    }
    if (!el&&selector) { try{el=document.querySelector(selector);}catch(_){} }
    return el;
  }
  function findInput(ariaLabel, placeholder, labelText, selector) {
    var el=null;
    if (ariaLabel) {
      el=document.querySelector('input[aria-label="'+ariaLabel+'"],textarea[aria-label="'+ariaLabel+'"]')||
         document.querySelector('input[aria-label*="'+ariaLabel+'"],textarea[aria-label*="'+ariaLabel+'"]');
    }
    if (!el&&placeholder) {
      el=document.querySelector('input[placeholder="'+placeholder+'"],textarea[placeholder="'+placeholder+'"]')||
         document.querySelector('input[placeholder*="'+placeholder+'"],textarea[placeholder*="'+placeholder+'"]');
    }
    if (!el&&labelText) {
      var lbl=labelText.toLowerCase();
      var labels=document.querySelectorAll('label');
      for (var li=0; li<labels.length; li++) {
        var lbEl=labels[li];
        if ((lbEl.textContent||'').toLowerCase().includes(lbl)) {
          var forId=lbEl.getAttribute('for');
          if (forId) {
            // Try id first, then name (beehiiv and many sites use name not id)
            el=document.getElementById(forId)||
               document.querySelector('[name="'+forId+'"]')||
               document.querySelector('[name*="'+forId+'"]');
          }
          if (!el) el=lbEl.querySelector('input,textarea,select');
          if (!el) el=lbEl.control;
          if (el) break;
        }
      }
    }
    if (!el&&selector) { try{el=document.querySelector(selector);}catch(_){} }
    if (!el) {
      var inputs=document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea');
      for (var ii=0; ii<inputs.length; ii++) { if (inputs[ii].offsetParent!==null){el=inputs[ii];break;} }
    }
    return el;
  }
  function findNearText(nearText, types) {
    if (!nearText) return null;
    var lower=nearText.toLowerCase();
    var anchor=null;
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,false);
    var node;
    while ((node=walker.nextNode())) {
      if (node.textContent&&node.textContent.trim().toLowerCase().includes(lower)) {
        if (node.parentElement){anchor=node.parentElement;break;}
      }
    }
    if (!anchor) return null;
    var ref=anchor.getBoundingClientRect();
    var rx=ref.left+ref.width/2, ry=ref.top+ref.height/2;
    var best=null, bestDist=Infinity;
    var cands=document.querySelectorAll(types||'button,a,[role="button"],input[type="submit"]');
    for (var i=0; i<cands.length; i++) {
      var r=cands[i].getBoundingClientRect();
      if (r.width===0&&r.height===0) continue;
      var cx=r.left+r.width/2, cy=r.top+r.height/2;
      var dist=Math.sqrt((cx-rx)*(cx-rx)+(cy-ry)*(cy-ry));
      if (dist<bestDist){bestDist=dist;best=cands[i];}
    }
    return best;
  }
  function findElement(selector, text, ariaLabel) { return findClickable(text,ariaLabel,selector); }

  // ── Sectioned content extraction ──────────────────────────────────────────
  // Mirrors WorkflowEngine.shredToSections() but runs in the real browser DOM,
  // giving the Commander accurate extracted content with live computed text.

  var FINE_PRINT_RE = /\*(.*?)(?:\n|$)|†|‡|terms and conditions|privacy policy|by (signing|clicking|continuing)|disclaimer|must be \d+|subject to|additional fee|auto-renew|cancel anytime|\bAPR\b|\bTAX\b|applicable (tax|fee)|not (available|valid) in/i;

  function sectionedGetContent() {
    var clone = document.body.cloneNode(true);
    ['script','style','nav','header','footer','aside','noscript','svg','iframe'].forEach(function(t){
      clone.querySelectorAll(t).forEach(function(el){el.remove();});
    });

    var interactive = [];
    clone.querySelectorAll('button,[role="button"],input[type="submit"]').forEach(function(el){
      var text=(el.innerText||el.value||el.getAttribute('aria-label')||'').trim();
      var aria=el.getAttribute('aria-label')||'';
      if (text||aria) interactive.push('[BTN "'+( text||aria)+'"'+(aria&&aria!==text?' aria="'+aria+'"':'')+']');
    });
    clone.querySelectorAll('a[href]').forEach(function(el){
      var text=(el.innerText||'').trim();
      var href=el.href||'';
      if (text&&href&&!href.startsWith('javascript')) interactive.push('[LINK "'+text+'" href="'+href+'"]');
    });
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea').forEach(function(el){
      var aria=el.getAttribute('aria-label')||'';
      var ph  =el.placeholder||'';
      var name=el.name||'';
      var t   =el.type||'text';
      interactive.push('[INPUT type="'+t+'"'+(aria?' aria="'+aria+'"':'')+(ph?' placeholder="'+ph+'"':'')+(name?' name="'+name+'"':'')+']');
    });

    var allText = (clone.innerText||'').replace(/\s+/g,' ').trim();
    var lines = allText.split(/[.!?]\s+|\n/);
    var primary=[], contextual=[], finePrint=[];
    lines.forEach(function(line){
      var l=line.trim();
      if (!l) return;
      if (FINE_PRINT_RE.test(l)) { finePrint.push(l); return; }
      if (l.length<100) primary.push(l);
      else contextual.push(l);
    });

    return {
      title:       document.title,
      url:         location.href,
      text:        allText.slice(0,12000),
      sections: {
        primary:     primary.join('\n').slice(0,2000),
        contextual:  contextual.join('\n').slice(0,3000),
        finePrint:   finePrint.join('\n').slice(0,1000),
        interactive: interactive.join('\n').slice(0,2000),
      },
      links:   Array.from(document.querySelectorAll('a[href]')).filter(function(a){return a.innerText&&a.href&&a.href.startsWith('http');}).slice(0,60).map(function(a){return{text:a.innerText.trim().slice(0,100),href:a.href};}),
      buttons: Array.from(document.querySelectorAll('button,[role="button"],input[type="submit"],input[type="button"]')).filter(function(el){return(el.innerText||el.value)&&el.innerText.trim();}).slice(0,40).map(function(el){return{text:(el.innerText||el.value||'').trim().slice(0,80)};}),
      inputs:  Array.from(document.querySelectorAll('input:not([type=hidden]),textarea,select')).slice(0,30).map(function(el){return{type:el.type||el.tagName.toLowerCase(),name:el.name||el.id||el.getAttribute('placeholder')||'',placeholder:el.placeholder||'',value:el.value||'',selector:el.id?'#'+el.id:el.name?'[name="'+el.name+'"]':'',ariaLabel:el.getAttribute('aria-label')||''};}),
    };
  }

  // ── URL reporting ─────────────────────────────────────────────────────────
  function postParent(msg) { try{window.parent.postMessage(msg,'*');}catch(_){} }
  function reportUrl(url) { postParent({bridge:'VBROWSER',type:'url_change',url:url}); }
  reportUrl(window.location.href);
  var _push=history.pushState.bind(history);
  history.pushState=function(){_push.apply(this,arguments);reportUrl(window.location.href);};
  window.addEventListener('popstate',function(){reportUrl(window.location.href);});

  document.addEventListener('click',function(e){
    var path=e.composedPath?e.composedPath():[];
    var a=null;
    for(var i=0;i<path.length;i++){if(path[i].tagName==='A'){a=path[i];break;}}
    if(!a)a=e.target&&e.target.closest&&e.target.closest('a');
    if(!a||!a.href)return;
    var href=a.href;
    if(href.indexOf('javascript:')===0||href.indexOf('#')===0)return;
    e.preventDefault();e.stopPropagation();
    postParent({bridge:'VBROWSER',type:'navigate',url:href});
  },true);

  document.addEventListener('submit',function(e){
    var form=e.target;if(!form)return;
    var method=(form.method||'get').toLowerCase();
    if(method==='get'){
      e.preventDefault();
      var data=new FormData(form);
      var params=new URLSearchParams();
      data.forEach(function(v,k){params.append(k,String(v));});
      var url=form.action.split('?')[0]+'?'+params.toString();
      postParent({bridge:'VBROWSER',type:'navigate',url:url});
    }
  },true);

  // ── DevTools console bridge ───────────────────────────────────────────────
  (function(){
    var _p=window.parent!==window?window.parent:null;
    function log(lvl,msg){if(_p)try{_p.postMessage({bridge:'TL_CONSOLE',level:lvl,msg:String(msg),ts:Date.now()},'*');}catch(e){}}
    window.onerror=function(m,s,l){log('error','['+s+':'+l+'] '+m);return false;};
    window.addEventListener('unhandledrejection',function(e){log('error','Unhandled: '+(e.reason&&e.reason.message||String(e.reason)));});
    var _ce=console.error,_cw=console.warn;
    console.error=function(){_ce.apply(console,arguments);log('error',Array.from(arguments).map(String).join(' '));};
    console.warn=function(){_cw.apply(console,arguments);log('warn',Array.from(arguments).map(String).join(' '));};
  })();

  // ── Message listener ──────────────────────────────────────────────────────
  window.addEventListener('message',function(e){
    var msg=e.data;
    if(!msg||msg.bridge!=='AGENT') return;
    var id=msg.requestId;
    var slave=msg.slave||1;
    var result=null;

    try {

      if (msg.type==='agent_read'||msg.type==='agent_get_content') {
        result=sectionedGetContent();

      } else if (msg.type==='agent_click') {
        var el=findClickable(msg.text,msg.ariaLabel,msg.selector)||(msg.nearText?findNearText(msg.nearText):null);
        if (el) {
          ghostClick(el,slave,function(r){
            postParent({bridge:'AGENT_RESPONSE',requestId:id,result:r});
          });
          return; // async
        } else {
          result={ok:false,error:'Not found: '+(msg.text||msg.ariaLabel||msg.selector)};
        }

      } else if (msg.type==='agent_click_coords') {
        var x=msg.x||0, y=msg.y||0;
        showMarker(x,y,slave);
        var target=document.elementFromPoint(x,y);
        if (target) {
          ghostClick(target,slave,function(r){
            postParent({bridge:'AGENT_RESPONSE',requestId:id,result:r});
          });
          return; // async
        } else {
          result={ok:false,error:'No element at ('+x+','+y+')'};
        }

      } else if (msg.type==='agent_type') {
        var typeEl=findInput(msg.ariaLabel,msg.placeholder,msg.labelText||msg.label,msg.selector);
        if (typeEl) {
          var tr=typeEl.getBoundingClientRect();
          showMarker(tr.left+tr.width/2,tr.top+tr.height/2,slave);
          humanType(typeEl,msg.text,function(ok){
            if (msg.pressEnter||msg.key==='Enter') {
              typeEl.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
              typeEl.dispatchEvent(new KeyboardEvent('keypress',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
              typeEl.dispatchEvent(new KeyboardEvent('keyup',   {key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
              var form=typeEl.closest('form');
              if(form)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
            }
            postParent({bridge:'AGENT_RESPONSE',requestId:id,result:{ok:ok,typed:(msg.text||'').slice(0,20)}});
          });
          return; // async
        } else {
          result={ok:false,error:'Input not found'};
        }

      } else if (msg.type==='agent_scroll') {
        var dir=msg.direction||'down';
        var amt=msg.amount||(dir==='down'?600:-600);
        window.scrollBy({top:amt,behavior:'smooth'});
        setTimeout(function(){
          postParent({bridge:'AGENT_RESPONSE',requestId:id,result:{ok:true,scrolled:amt}});
        },400);
        return; // async

      } else if (msg.type==='agent_key') {
        var el2=document.activeElement||document.body;
        var kc=msg.key==='Enter'?13:msg.key==='Tab'?9:msg.key==='Escape'?27:msg.key.charCodeAt(0);
        var kOpts={key:msg.key,keyCode:kc,which:kc,bubbles:true,cancelable:true};
        ['keydown','keypress','keyup'].forEach(function(evt){el2.dispatchEvent(new KeyboardEvent(evt,kOpts));});
        result={ok:true};

      } else if (msg.type==='agent_show_marker') {
        showMarker(msg.x||0,msg.y||0,msg.slave||1);
        result={ok:true};

      } else if (msg.type==='agent_clear_markers') {
        clearAllMarkers();
        result={ok:true};
      }

    } catch(err) {
      result={ok:false,error:err.message};
    }

    postParent({bridge:'AGENT_RESPONSE',requestId:id,result:result});
  });

})();

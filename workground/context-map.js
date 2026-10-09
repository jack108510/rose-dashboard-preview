/* A data-driven knowledge web. Decorative glow is not counted as business knowledge. */
(() => {
  'use strict';
  class ContextMap {
    constructor(onSelect) {
      this.graph = document.getElementById('graph');
      this.world = document.getElementById('world');
      this.edges = document.getElementById('edges');
      this.container = document.getElementById('nodes');
      this.onSelect = onSelect;
      this.width = 960; this.height = 520;
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.nodes = []; this.links = []; this.selected = null;
      this.bind();
    }
    update(facts, groups, businessName) {
      this.lastArgs = [facts, groups, businessName];
      this.mobile = this.graph.clientWidth < 450;
      const populated = groups.filter(group => facts.some(fact => fact.group === group.id));
      const sources = [...new Set(facts.map(fact => fact.sourceUrl).filter(Boolean))];
      const maxGroup = Math.max(0, ...populated.map(group => facts.filter(fact => fact.group === group.id).length));
      this.width = Math.max(960, 960 + Math.max(0, maxGroup - 8) * 40);
      this.height = maxGroup > 12 ? 640 + Math.max(0, Math.ceil(maxGroup / 6) - 3) * 100 : 520;
      const cx = this.width / 2, cy = this.height / 2;
      this.nodes = [{id:'root',kind:'root',label:businessName || 'Your business',mark:'✳',x:cx,y:cy}];
      this.links = [];
      const marks = {business:'✦',services:'✧',hours:'◷',areas:'◎',contact:'↗',other:'•'};
      populated.forEach((group,index) => {
        const angle = populated.length === 2 ? Math.PI + index * Math.PI : -Math.PI / 2 + index * 2 * Math.PI / populated.length;
        const category = {id:'group:'+group.id,kind:'category',label:group.name,group:group.id,mark:marks[group.id] || '✧',x:cx+Math.cos(angle)*205,y:cy+Math.sin(angle)*125};
        this.nodes.push(category); this.links.push({from:'root',to:category.id,flow:true});
        const rows = facts.filter(fact => fact.group === group.id);
        rows.forEach((fact,position) => {
          const ring = Math.floor(position / 6);
          const inRing = Math.min(6,rows.length-ring*6);
          const arc = angle + (position%6-(inRing-1)/2)*(.85 / Math.max(1,ring+1));
          const radius = 76 + ring*54;
          const node = {id:fact.id,kind:'fact',label:fact.text,fact,group:group.id,x:category.x+Math.cos(arc)*radius,y:category.y+Math.sin(arc)*radius};
          this.nodes.push(node); this.links.push({from:category.id,to:node.id});
        });
      });
      sources.forEach((url,index) => {
        const label = (()=>{try{const parsed=new URL(url);return (parsed.hostname.replace(/^www\./,'')+(parsed.pathname==='/'?'':parsed.pathname)).slice(0,45)}catch{return 'Source'}})();
        const source = {id:'source:'+url,kind:'source',label,url,mark:'↗',x:cx+(index-(sources.length-1)/2)*Math.min(125,700/Math.max(1,sources.length)),y:cy+(this.mobile?280:Math.min(175,this.height*.33))};
        this.nodes.push(source); this.links.push({from:'root',to:source.id,source:true});
        this.nodes.filter(node=>node.fact?.sourceUrl===url).forEach(node=>this.links.push({from:source.id,to:node.id,source:true}));
      });
      this.render();
      document.getElementById('graphEmpty').hidden = facts.length > 0;
      document.getElementById('webNodeCount').textContent = facts.length + (facts.length===1?' fact':' facts') + ' · ' + sources.length + (sources.length===1?' source':' sources');
    }
    render() {
      this.world.style.width=this.width+'px'; this.world.style.height=this.height+'px';
      this.edges.setAttribute('width',this.width); this.edges.setAttribute('height',this.height);
      this.edges.replaceChildren(); this.container.replaceChildren();
      const byId=new Map(this.nodes.map(node=>[node.id,node]));
      this.links.forEach(link=>{
        const a=byId.get(link.from),b=byId.get(link.to);
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        const bend=link.source?12:8;
        path.setAttribute('d',`M ${a.x} ${a.y} Q ${(a.x+b.x)/2+bend} ${(a.y+b.y)/2-bend} ${b.x} ${b.y}`);
        path.setAttribute('class','edge'+(link.source?' source':''));
        path.dataset.from=link.from; path.dataset.to=link.to;
        this.edges.appendChild(path);
        if(link.flow){const glow=path.cloneNode();glow.classList.add('flow');this.edges.appendChild(glow)}
      });
      this.nodes.forEach(node=>{
        const button=document.createElement('button');button.type='button';
        button.className='web-node '+node.kind+(node.fact?' '+node.fact.status:'');
        button.dataset.node=node.id;button.style.left=node.x+'px';button.style.top=node.y+'px';
        button.setAttribute('aria-label',node.fact ? (node.fact.status==='pending'?'Needs review: ':'Approved: ')+node.fact.text : node.kind==='source'?'Source: '+node.label:node.label);
        const orb=document.createElement('span');orb.className='orb';orb.textContent=node.mark||'';orb.setAttribute('aria-hidden','true');
        const label=document.createElement('b');label.textContent=String(node.label).slice(0,110);
        button.append(orb,label);
        if(node.kind==='category'){const count=document.createElement('small');count.textContent=this.nodes.filter(item=>item.fact?.group===node.group).length+' facts';button.append(count)}
        button.addEventListener('click',()=>{this.select(node.id);this.onSelect(node)});
        this.container.appendChild(button);
      });
      this.fit(); this.select(this.selected);
    }
    transform(){
      this.world.style.transform=`translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
      this.world.style.setProperty('--counter-scale',String(1/this.zoom));
    }
    fit(){
      const w=this.graph.clientWidth,h=this.graph.clientHeight;
      if(w<1||h<1)return;
      this.zoom=Math.min((w-30)/this.width,(h-30)/this.height);
      this.panX=(w-this.width*this.zoom)/2;this.panY=(h-this.height*this.zoom)/2;
      this.transform();
    }
    zoomBy(factor,x=this.graph.clientWidth/2,y=this.graph.clientHeight/2){
      const next=Math.max(.22,Math.min(2.8,this.zoom*factor));
      this.panX=x-(x-this.panX)*next/this.zoom;
      this.panY=y-(y-this.panY)*next/this.zoom;
      this.zoom=next;this.transform();
    }
    select(id){
      this.selected=id;
      const node=this.nodes.find(item=>item.id===id);
      const related=new Set(node?.fact?['root','group:'+node.fact.group,node.id,...(node.fact.sourceUrl?['source:'+node.fact.sourceUrl]:[])]:node?[node.id,'root']:[]);
      this.container.querySelectorAll('.web-node').forEach(el=>{
        el.classList.toggle('selected',!!node&&el.dataset.node===id);
        el.classList.toggle('dim',!!node&&node.kind==='fact'&&!related.has(el.dataset.node));
      });
      this.edges.querySelectorAll('.edge:not(.flow)').forEach(edge=>edge.classList.toggle('selected',!!node&&related.has(edge.dataset.from)&&related.has(edge.dataset.to)));
    }
    bind(){
      document.getElementById('fitWeb').addEventListener('click',()=>this.fit());
      document.getElementById('zoomIn').addEventListener('click',()=>this.zoomBy(1.22));
      document.getElementById('zoomOut').addEventListener('click',()=>this.zoomBy(1/1.22));
      this.graph.addEventListener('wheel',event=>{event.preventDefault();const r=this.graph.getBoundingClientRect();this.zoomBy(event.deltaY<0?1.1:1/1.1,event.clientX-r.left,event.clientY-r.top)},{passive:false});
      let drag=null;
      this.graph.addEventListener('pointerdown',event=>{
        if(event.target.closest('button'))return;
        drag={x:event.clientX,y:event.clientY,panX:this.panX,panY:this.panY};
        this.graph.setPointerCapture(event.pointerId);this.graph.classList.add('dragging');
      });
      this.graph.addEventListener('pointermove',event=>{if(!drag)return;this.panX=drag.panX+event.clientX-drag.x;this.panY=drag.panY+event.clientY-drag.y;this.transform()});
      const stop=()=>{drag=null;this.graph.classList.remove('dragging')};
      this.graph.addEventListener('pointerup',stop);this.graph.addEventListener('pointercancel',stop);
      new ResizeObserver(()=>{if(this.lastArgs && (this.graph.clientWidth < 450)!==this.mobile)this.update(...this.lastArgs);else this.fit()}).observe(this.graph);
    }
  }
  window.ContextMap=ContextMap;
})();

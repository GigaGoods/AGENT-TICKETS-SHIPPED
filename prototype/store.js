(function(){
const KEY='at_listings_v1';
const seed=[
{id:'lst_9f2k1',event:'Silverline Tour',date:'2026-09-18',venue:'The Anthem, Washington DC',price:145,source:'human',ts:Date.now()-86400e3*2},
{id:'lst_4h8m3',event:'FC Cascadia vs Rose City',date:'2026-09-05',venue:'Providence Park, Portland',price:88,source:'agent',agent:'seatscout-2',ts:Date.now()-86400e3},
{id:'lst_7q1x9',event:'Neon Harbor Festival, day pass',date:'2026-10-03',venue:'Pier 70, San Francisco',price:210,source:'human',ts:Date.now()-3600e3*20},
{id:'lst_2b6v4',event:'La Boheme',date:'2026-11-14',venue:'War Memorial Opera House, San Francisco',price:120,source:'agent',agent:'operabot',ts:Date.now()-3600e3*6},
{id:'lst_5n3c8',event:'Midnight Parade',date:'2026-09-27',venue:'Brooklyn Steel, New York',price:95,source:'human',ts:Date.now()-3600e3*2}
];
function load(){try{const raw=localStorage.getItem(KEY);if(raw)return JSON.parse(raw)}catch(e){}return seed.slice()}
function save(list){try{localStorage.setItem(KEY,JSON.stringify(list))}catch(e){}}
function validate(b){
const errors=[];
if(!b||typeof b!=='object')return[{field:'body',code:'INVALID_JSON',message:'Request body must be a JSON object.'}];
if(!b.event||typeof b.event!=='string'||!b.event.trim())errors.push({field:'event',code:'MISSING_FIELD',message:'event is required and must be a non empty string.'});
if(!b.date||!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)))errors.push({field:'date',code:'INVALID_DATE',message:'date is required in YYYY-MM-DD format.'});
if(!b.venue||typeof b.venue!=='string'||!b.venue.trim())errors.push({field:'venue',code:'MISSING_FIELD',message:'venue is required and must be a non empty string.'});
const p=Number(b.price);
if(b.price===undefined||b.price===null||b.price===''||isNaN(p)||p<=0)errors.push({field:'price',code:'INVALID_PRICE',message:'price is required and must be a number greater than 0 (USDC).'});
return errors;
}
function add(body,source,agent){
const errors=validate(body);
if(errors.length)return{ok:false,status:400,errors};
const listing={id:'lst_'+Math.random().toString(36).slice(2,7),event:body.event.trim(),date:body.date,venue:body.venue.trim(),price:Number(body.price),source:source||'human',ts:Date.now()};
if(source==='agent')listing.agent=agent||'agent';
const list=load();list.unshift(listing);save(list);
return{ok:true,status:201,listing};
}
function get(id){return load().find(function(l){return l.id===id})}
function buy(id){const list=load();const l=list.find(function(x){return x.id===id});if(l&&l.status!=='escrow'){l.status='escrow';save(list)}return l}
function ago(ts){const s=(Date.now()-ts)/1e3;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' hr ago';return Math.floor(s/86400)+' d ago'}
function fmtDate(d){const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const icoCal='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>';
const icoPin='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg>';
function cardHTML(l,isNew){
const badge=l.status==='escrow'?'<span class="badge badge-coral">In escrow</span>':(l.source==='agent'?'<span class="badge badge-agent">Agent listed</span>':'<span class="badge badge-human">Human listed</span>');
const buyRow=l.status==='escrow'?'':'<a class="btn btn-secondary btn-sm" href="buy.html?id='+l.id+'">Buy in escrow</a>';
return '<article class="card lift listing'+(isNew?' new':'')+'"><div class="listing-top"><h3>'+esc(l.event)+'</h3>'+badge+'</div><p class="listing-meta"><span>'+icoCal+esc(fmtDate(l.date))+'</span><span>'+icoPin+esc(l.venue)+'</span></p><div class="listing-foot"><span class="price">'+esc(l.price)+' <small>USDC</small></span><span class="listing-time">'+(l.source==='agent'&&l.agent?'via '+esc(l.agent)+', ':'')+ago(l.ts)+'</span></div>'+buyRow+'</article>';
}
window.AT={load,save,add,validate,ago,fmtDate,esc,cardHTML,get,buy};
})();

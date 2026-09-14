(() => {
  const cfg = window.WORKSHEET_CONFIG || {};
  const docId = document.body.dataset.docId;
  const invalidCfg = !cfg.supabaseUrl || !cfg.publishableKey ||
    cfg.supabaseUrl.includes('PASTE_') || cfg.publishableKey.includes('PASTE_');

  function showConfigError(){
    const box=document.createElement('div'); box.className='collab-config-error';
    box.textContent='لم يتم ربط الموقع بقاعدة البيانات بعد. أكمل إعداد Supabase ثم حدّث assets/config.js.';
    document.body.appendChild(box);
  }
  if (!docId) { console.error('Missing body[data-doc-id]'); return; }
  if (invalidCfg || !window.supabase) { showConfigError(); return; }

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const editKey = hashParams.get('edit') || '';
  const fields = [...document.querySelectorAll('[data-field]')];
  const timers = new Map();
  let suppressLocalSave = false;

  // Toolbar
  const bar=document.createElement('div'); bar.className='collab-toolbar';
  const mode=document.createElement('span'); mode.className='mode'; mode.textContent=editKey?'تحرير مباشر':'عرض فقط';
  const sync=document.createElement('span'); sync.className='sync'; sync.textContent='جارٍ الاتصال…';
  const home=document.createElement('a'); home.textContent='الرئيسية'; home.href='../index.html'+location.hash;
  const print=document.createElement('button'); print.type='button'; print.textContent='PDF / طباعة'; print.onclick=()=>window.print();
  bar.append(mode,sync,home,print); document.body.appendChild(bar);

  document.body.classList.add(editKey ? 'edit-mode' : 'view-mode');

  function sanitize(html){
    if (!window.DOMPurify) return html;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS:['span','br','sup','sub','b','strong','i','em'],
      ALLOWED_ATTR:['class','dir']
    });
  }

  function setStatus(t){ sync.textContent=t; }

  async function loadSaved(){
    const {data,error}=await db.from('worksheet_fields')
      .select('field_id,value')
      .eq('room_id',cfg.roomId)
      .eq('doc_id',docId);
    if(error){console.error(error);setStatus('تعذر الاتصال');return;}
    suppressLocalSave=true;
    for(const row of data||[]){
      const el=document.querySelector(`[data-field="${CSS.escape(row.field_id)}"]`);
      if(el) el.innerHTML=sanitize(row.value);
    }
    suppressLocalSave=false;
    setStatus(editKey?'متصل ✓':'متصل ✓');
  }

  async function saveField(el){
    if(!editKey || suppressLocalSave) return;
    const value=sanitize(el.innerHTML);
    setStatus('جارٍ الحفظ…');
    const {error}=await db.rpc('save_worksheet_field',{
      p_room_id:cfg.roomId,
      p_doc_id:docId,
      p_field_id:el.dataset.field,
      p_value:value,
      p_edit_key:editKey
    });
    if(error){console.error(error);setStatus(error.message?.includes('Invalid edit key')?'رابط التحرير غير صحيح':'فشل الحفظ');}
    else setStatus('تم الحفظ ✓');
  }

  if(editKey){
    for(const el of fields){
      el.contentEditable='true'; el.spellcheck=false;
      el.addEventListener('input',()=>{
        clearTimeout(timers.get(el.dataset.field));
        timers.set(el.dataset.field,setTimeout(()=>saveField(el),550));
      });
      el.addEventListener('blur',()=>saveField(el));
      // Strip foreign formatting on paste; preserve the worksheet's own design.
      el.addEventListener('paste',(ev)=>{
        ev.preventDefault();
        const txt=(ev.clipboardData||window.clipboardData).getData('text/plain');
        document.execCommand('insertText',false,txt);
      });
    }
  }

  function subscribe(){
    db.channel(`worksheet-${cfg.roomId}-${docId}`)
      .on('postgres_changes',{
        event:'*',schema:'public',table:'worksheet_fields',filter:`room_id=eq.${cfg.roomId}`
      },payload=>{
        const row=payload.new; if(!row || row.doc_id!==docId) return;
        const el=document.querySelector(`[data-field="${CSS.escape(row.field_id)}"]`); if(!el) return;
        if(document.activeElement===el) return; // don't interrupt local typing
        suppressLocalSave=true; el.innerHTML=sanitize(row.value); suppressLocalSave=false;
      }).subscribe(status=>{
        if(status==='SUBSCRIBED') setStatus('متصل ✓');
        if(status==='CHANNEL_ERROR') setStatus('خطأ في المزامنة');
      });
  }

  loadSaved().then(subscribe);
})();

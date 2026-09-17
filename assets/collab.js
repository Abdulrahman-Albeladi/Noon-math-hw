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
  const isGrade9 = /^g9(?:-|$)/.test(docId) || /\/grade-9\//.test(location.pathname);
  if(isGrade9) document.body.classList.add('g9-arabic-math');

  // Keep training-activity cover titles consistent across all subset question pages.
  const worksheetTitles = {
    'g9-set1-questions':'أنشطة تدريبية ١',
    'g9-set2-questions':'أنشطة تدريبية ٢',
    'g9-set3-questions':'أنشطة تدريبية ٣',
    'g10-set1-questions':'أنشطة تدريبية ١',
    'g10-set2-questions':'أنشطة تدريبية ٢',
    'g10-set3-questions':'أنشطة تدريبية ٣',
    'g11-set1-questions':'أنشطة تدريبية ١',
    'g11-set2-questions':'أنشطة تدريبية ٢',
    'g11-set3-questions':'أنشطة تدريبية ٣',
    'g12-set1-questions':'أنشطة تدريبية ١',
    'g12-set2-questions':'أنشطة تدريبية ٢',
    'g12-set3-questions':'أنشطة تدريبية ٣'
  };
  function applyWorksheetTitle(){
    const title=worksheetTitles[docId];
    if(!title) return;
    const el=document.querySelector('.cover-title');
    if(el) el.textContent=title;
    document.title=title;
  }
  applyWorksheetTitle();

  // Grade 9 question 2 only: place the negative sign on the right side of
  // the Arabic value in options (أ) and (د), in both the full set and set 1.
  function fixGrade9Question2NegativeSigns(){
    if(docId!=='g9-full-questions' && docId!=='g9-set1-questions') return;
    const qbox=document.querySelectorAll('.qbox')[1];
    if(!qbox) return;
    const options=qbox.querySelectorAll('.opt');
    [[0,'٦٨'],[3,'٧٤']].forEach(([optionIndex,digits])=>{
      const seq=options[optionIndex]?.querySelector('.mathseq');
      if(!seq) return;
      const children=[...seq.children];
      const eqIndex=children.findIndex(el=>el.textContent.trim()==='=');
      if(eqIndex<0) return;
      const tail=children.slice(eqIndex+1);
      const tailText=tail.map(el=>el.textContent).join('');
      if(!tailText.includes(digits) || !tailText.includes('−')) return;
      tail.forEach(el=>el.remove());
      const value=document.createElement('span');
      value.className='g9-q2-negative';
      value.dir='ltr';
      value.textContent=`${digits}−`;
      seq.appendChild(value);
    });
  }

  // Some files were created before every answer choice had an explicit
  // data-field. Add stable editable fields at runtime without changing any
  // worksheet content, styling, numbering, or layout.
  function ensureEditableChoices(){
    document.querySelectorAll('.qbox').forEach((qbox,qIndex)=>{
      const choices=[...qbox.querySelectorAll('.opt, .truth-option')];
      choices.forEach((choice,optionIndex)=>{
        if(choice.querySelector('[data-field]')) return;

        const label=choice.querySelector(':scope > .optlabel');
        const nodes=[...choice.childNodes].filter(node=>{
          if(node===label) return false;
          if(node.nodeType===Node.TEXT_NODE) return node.textContent.trim().length>0;
          return true;
        });
        if(!nodes.length) return;

        let target;
        if(nodes.length===1 && nodes[0].nodeType===Node.ELEMENT_NODE){
          target=nodes[0];
        } else {
          target=document.createElement('span');
          target.className='editable-choice';
          for(const node of nodes) target.appendChild(node);
          choice.appendChild(target);
        }
        const isGrade9Q2FixedChoice=(docId==='g9-full-questions' || docId==='g9-set1-questions') && qIndex===1 && (optionIndex===0 || optionIndex===3);
        target.dataset.field=isGrade9Q2FixedChoice
          ? `auto-q2-option-${optionIndex+1}-rtl-fixed`
          : `auto-q${qIndex+1}-option-${optionIndex+1}`;
      });
    });
  }

  // Make standalone equations/relations before the choices editable as one
  // object. This is especially important for Grade 9 Arabic equations.
  function ensureEditableEquations(){
    document.querySelectorAll('.qbox').forEach((qbox,qIndex)=>{
      const blocks=[...qbox.querySelectorAll(
        ':scope > .armathrow, :scope > .formula.center, :scope > .armath.center, :scope > .rel-center, :scope > .piecewise'
      )];
      blocks.forEach((el,eqIndex)=>{
        if(el.hasAttribute('data-field') || el.closest('[data-field]')) return;
        el.dataset.field=`auto-q${qIndex+1}-equation-${eqIndex+1}`;
      });
    });
  }

  ensureEditableChoices();
  ensureEditableEquations();
  fixGrade9Question2NegativeSigns();

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
    // Reapply the fixed activity title after loading any older saved title.
    applyWorksheetTitle();
    fixGrade9Question2NegativeSigns();
    suppressLocalSave=false;
    setStatus('متصل ✓');
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
    if(error){
      console.error(error);
      setStatus(error.message?.includes('Invalid edit key')?'رابط التحرير غير صحيح':'فشل الحفظ');
    } else setStatus('تم الحفظ ✓');
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
        if(el.classList.contains('cover-title')) applyWorksheetTitle();
        fixGrade9Question2NegativeSigns();
      }).subscribe(status=>{
        if(status==='SUBSCRIBED') setStatus('متصل ✓');
        if(status==='CHANNEL_ERROR') setStatus('خطأ في المزامنة');
      });
  }

  loadSaved().then(subscribe);
})();

// Approved optional-question flags. They are shown only in question files.
// This block is deliberately independent of Supabase so the labels still
// appear if collaborative editing is offline.
(() => {
  const docId=document.body?.dataset?.docId || '';
  if(!docId || !docId.endsWith('-questions')) return;

  const optionalByWorksheet={
    'g9-full':[2,4,10,14,19,24,26,32,34],
    'g9-set1':[2,4,10,14],
    'g9-set2':[4,9,11],
    'g9-set3':[5,7],

    'g10-full':[4,5,11,15,17,21,25,29,31],
    'g10-set1':[4,5],
    'g10-set2':[3,7,9,13],
    'g10-set3':[2,6,8],

    'g11-full':[3,8,9,13,15,22,25,26,30,35,38],
    'g11-set1':[3,8,9,13,15],
    'g11-set2':[4,7,8],
    'g11-set3':[2,7,10],

    'g12-full':[2,7,8,13,14,17,20,23,30,33,36,37],
    'g12-set1':[2,7,8,13,14],
    'g12-set2':[2,5,8],
    'g12-set3':[5,8,11,12]
  };

  const baseId=docId.replace(/-questions$/,'');
  const optional=new Set(optionalByWorksheet[baseId] || []);
  if(!optional.size) return;

  const arabic='٠١٢٣٤٥٦٧٨٩';
  const eastern='۰۱۲۳۴۵۶۷۸۹';
  function questionNumber(text){
    const normalized=(text || '')
      .replace(/[٠-٩]/g,d=>String(arabic.indexOf(d)))
      .replace(/[۰-۹]/g,d=>String(eastern.indexOf(d)));
    const match=normalized.match(/\d+/);
    return match ? Number(match[0]) : NaN;
  }
  function marker(){
    const el=document.createElement('span');
    el.className='optional-mark';
    el.textContent='(اختياري)';
    el.setAttribute('aria-label','سؤال اختياري');
    return el;
  }

  document.querySelectorAll('.qbox .qnum').forEach(qnum=>{
    const n=questionNumber(qnum.textContent);
    if(!optional.has(n)) return;
    const qbox=qnum.closest('.qbox');
    if(qbox) qbox.dataset.optionalQuestion='true';
    const qline=qnum.closest('.qline');
    if(!qline || qline.querySelector(':scope > .optional-mark')) return;
    qnum.insertAdjacentElement('afterend',marker());
  });
})();

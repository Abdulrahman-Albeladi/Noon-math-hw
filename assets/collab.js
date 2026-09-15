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

  // Keep worksheet cover titles consistent across all subset question pages.
  const worksheetTitles = {
    'g9-set1-questions':'ورقة عمل ١: المعادلات الأساسية وحل المعادلات ذات الخطوة الواحدة',
    'g9-set2-questions':'ورقة عمل ٢: حل المعادلات المتعددة الخطوات والمتغير في طرفي المعادلة',
    'g9-set3-questions':'ورقة عمل ٣: معادلات القيمة المطلقة والعلاقات',
    'g10-set1-questions':'ورقة عمل ١: التبرير الاستقرائي والتخمين',
    'g10-set2-questions':'ورقة عمل ٢: المنطق والعبارات الشرطية',
    'g10-set3-questions':'ورقة عمل ٣: التبرير الاستنتاجي',
    'g11-set1-questions':'ورقة عمل ١: خصائص الأعداد الحقيقية والعلاقات والدوال',
    'g11-set2-questions':'ورقة عمل ٢: الدوال الخاصة',
    'g11-set3-questions':'ورقة عمل ٣: تمثيل المتباينات الخطية ومتباينات القيمة المطلقة بيانيًا',
    'g12-set1-questions':'ورقة عمل ١: الدوال وتمثيل المجموعات والمجال والدوال متعددة التعريف',
    'g12-set2-questions':'ورقة عمل ٢: تدريبات على الدوال وتحليل التمثيلات البيانية',
    'g12-set3-questions':'ورقة عمل ٣: المقاطع وأصفار الدوال والدوال الزوجية والفردية وتحليل الدوال'
  };
  function applyWorksheetTitle(){
    const title=worksheetTitles[docId];
    if(!title) return;
    const el=document.querySelector('.cover-title');
    if(el) el.textContent=title;
    document.title=title;
  }
  applyWorksheetTitle();

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
        target.dataset.field=`auto-q${qIndex+1}-option-${optionIndex+1}`;
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
    // Reapply the fixed worksheet title after loading any older saved title.
    applyWorksheetTitle();
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
      }).subscribe(status=>{
        if(status==='SUBSCRIBED') setStatus('متصل ✓');
        if(status==='CHANNEL_ERROR') setStatus('خطأ في المزامنة');
      });
  }

  loadSaved().then(subscribe);
})();

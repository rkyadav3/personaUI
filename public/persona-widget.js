(() => {
  const script = document.currentScript, endpoint = script?.dataset.endpoint || '/api/persona-proxy';
  const host = document.createElement('div'), shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{display:block;font:16px/1.5 system-ui;color:#193b27;max-width:480px}section{border:1px solid #d8e5dc;border-radius:14px;background:white;padding:20px}h2{font-size:20px;margin:0 0 12px}ol{list-style:none;padding:0;max-height:350px;overflow:auto}li{padding:10px 0;border-bottom:1px solid #e9efeb;white-space:pre-wrap;overflow-wrap:anywhere}form{display:flex;gap:8px}input{min-width:0;flex:1;border:1px solid #a9c2b3;border-radius:8px;padding:10px;font:inherit}button{font:inherit;background:#166534;color:white;border:0;border-radius:8px;padding:10px 14px}button:disabled{opacity:.6}p{font-size:14px}progress{width:100%}:focus-visible{outline:2px solid #168a4e;outline-offset:3px}';
  shadow.append(style);
  const section=document.createElement('section'), title=document.createElement('h2'), messages=document.createElement('ol'), form=document.createElement('form'), input=document.createElement('input'), button=document.createElement('button'), status=document.createElement('p'), progress=document.createElement('progress');
  title.textContent=script?.dataset.name || 'Ask our Persona'; input.setAttribute('aria-label','Your question'); input.placeholder='Ask a question'; input.maxLength=500; input.required=true;
  button.textContent='Send'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); progress.setAttribute('aria-label','Persona is answering'); progress.hidden=true;
  messages.setAttribute('aria-label','Conversation'); messages.setAttribute('aria-live','polite');
  form.append(input,button);section.append(title,messages,form,status,progress);shadow.append(section);script.after(host);
  let pending=null;
  const message = (label,text) => {const item=document.createElement('li');item.textContent=label+': '+text;messages.append(item);item.scrollIntoView({block:'nearest'});};
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled || !input.value.trim())return;
    const question=input.value.trim();
    if(!pending || pending.question!==question){pending={question,id:crypto.randomUUID()};message('You',question);}
    button.disabled=true;input.disabled=true;progress.hidden=false;status.textContent='Persona is answering…';
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question,requestId:pending.id}),signal:AbortSignal.timeout(28000)});
      const result=await response.json();
      if(!response.ok){if(result.errors?.retry==='new_request')pending=null;throw new Error(result.error || result.reply || 'Please try again shortly.');}
      message('Persona',result.reply);input.value='';pending=null;status.textContent='';
    }catch(error){status.textContent=error.name==='TimeoutError' ? 'This is taking longer than expected. Send again to check your request.' : 'Could not answer. '+error.message;}
    finally{button.disabled=false;input.disabled=false;progress.hidden=true;input.focus();}
  });
})();


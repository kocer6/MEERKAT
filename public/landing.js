document.documentElement.classList.add('js');

const preview=document.querySelector('[data-preview-terminal]');
if(preview){
 const tabs=[...preview.querySelectorAll('[data-preview-tab]')];
 const panes=[...preview.querySelectorAll('[data-preview-pane]')];
 const activate=next=>{
  for(const tab of tabs){const active=tab.dataset.previewTab===next;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const pane of panes)pane.hidden=pane.dataset.previewPane!==next;
 };
 for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>activate(tab.dataset.previewTab));
  tab.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
   event.preventDefault();
   const offset=event.key==='ArrowRight'?1:-1,next=tabs[(index+offset+tabs.length)%tabs.length];
   activate(next.dataset.previewTab);next.focus();
  });
 }
 activate('overview');
}

const copyTokenButton=document.getElementById('copy-token-contract');
if(copyTokenButton)copyTokenButton.addEventListener('click',async()=>{
 const address=document.getElementById('token-contract'),status=document.getElementById('token-copy-status');
 try{await navigator.clipboard.writeText(address.value);status.textContent='Contract address copied.';}
 catch{address.focus();address.select();status.textContent='Address selected. Copy it with Ctrl+C or your device copy menu.';}
});
